// Channel Independence Gate tests — V2 Blueprint §8 / Non-Negotiable Design
// Principle 8 / Roadmap M1.4 (gate half), SCORING_ENGINE_VERSION 2.8.0.
//
// Acceptance criterion under test here (roadmap, verbatim):
//   "A query where only Keepa fires cannot produce BUILD_NOW, regardless
//    of score."
//
// computeChannelIndependenceGateTier is tested directly (rather than via a
// full computeGroundedScore(memo) integration fixture) because it is a
// pure function of exactly two already-well-typed inputs (ScoreDimension[]
// and EvidenceBreadth) — the same precise, low-fixture-risk approach used
// for lib/confidence's own tests. Composition with the other gates via
// mostConservative() is pre-existing, unchanged logic (already relied on
// by the safety and economics gates) — not re-tested here.

import { describe, it, expect } from 'vitest'
import { computeChannelIndependenceGateTier } from '../scoring'
import type { ScoreDimension, EvidenceBreadth } from '../scoring'

function evidenceBreadth(channelBreakdown: EvidenceBreadth['channelBreakdown']): EvidenceBreadth {
  const contributing = Array.from(new Set(channelBreakdown.flatMap(c => c.providers)))
  return {
    contributingProviders: contributing,
    totalScoreEligibleProviders: 8,
    pct: Math.round((contributing.length / 8) * 100),
    channelBreakdown,
    distinctChannelTypes: channelBreakdown.filter(c => c.contributed).length,
    crossChannelCorroborated: channelBreakdown.filter(c => c.contributed).length >= 2,
  }
}

function demandDimension(rawScore: number): ScoreDimension {
  return { key: 'demand', label: 'Demand', weight: 0.22, rawScore, source: 'verified', sourceLabel: 'test fixture' }
}

describe('computeChannelIndependenceGateTier — the roadmap acceptance criterion', () => {
  it('caps to VALIDATE_FURTHER when demand is confirmed by Keepa alone, regardless of how high the score is', () => {
    const candidates = [demandDimension(10)] // maximum possible score
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
    ])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBe('VALIDATE_FURTHER')
  })

  it('does NOT cap when demand is confirmed by Keepa (amazon_market) AND DataForSEO (search_intent)', () => {
    const candidates = [demandDimension(10)]
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
      { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
    ])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBeNull()
  })

  it('does NOT cap when demand is confirmed by Amazon + Consumer Voice (Reddit) — any 2 distinct channels suffice', () => {
    const candidates = [demandDimension(8)]
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
      { channel: 'consumer_voice', label: 'Consumer Voice', contributed: true, providers: ['reddit'] },
    ])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBeNull()
  })
})

describe('computeChannelIndependenceGateTier — same-channel providers do not count as independent', () => {
  it('two Amazon-marketplace providers (keepa + apify-amazon-search) are still one channel — still caps', () => {
    const candidates = [demandDimension(9)]
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa', 'apify-amazon-search'] },
    ])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBe('VALIDATE_FURTHER')
  })
})

describe('computeChannelIndependenceGateTier — no-op cases', () => {
  it('returns null when demand was never verified at all (weight 0) — nothing to gate, other paths already handle it', () => {
    const candidates: ScoreDimension[] = [
      { key: 'demand', label: 'Demand', weight: 0, qualitativeLevel: 'Low', source: 'synthesized', sourceLabel: 'AI judgment' },
    ]
    const breadth = evidenceBreadth([])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBeNull()
  })

  it('returns null when there is no demand dimension in the candidate list at all', () => {
    const candidates: ScoreDimension[] = [
      { key: 'profitability', label: 'Profitability', weight: 0.20, rawScore: 8, source: 'verified', sourceLabel: 'keepa' },
    ]
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
    ])
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBeNull()
  })

  it('a second verified dimension (profitability) confirmed by a DIFFERENT channel does not rescue demand — the gate looks at demand specifically, not overall breadth', () => {
    const candidates = [
      demandDimension(9),
      { key: 'profitability', label: 'Profitability', weight: 0.20, rawScore: 8, source: 'verified' as const, sourceLabel: 'apify-alibaba' },
    ]
    const breadth = evidenceBreadth([
      { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
      { channel: 'supply_side', label: 'Manufacturing / Supply', contributed: true, providers: ['apify-alibaba'] },
    ])
    // 2 distinct channels overall, but demand itself is still only Keepa —
    // the gate must still cap, proving it is demand-specific, not a
    // global "≥2 channels contributed to anything" check.
    expect(computeChannelIndependenceGateTier(candidates, breadth)).toBe('VALIDATE_FURTHER')
  })
})
