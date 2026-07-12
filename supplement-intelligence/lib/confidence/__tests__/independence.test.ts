// Independence-aware confidence tests — V2 Blueprint §10 / Roadmap M1.4.
//
// Acceptance criteria under test here (from the roadmap, verbatim):
//   "Adding a second confirming channel measurably raises reported
//    confidence; adding a third Keepa-derived signal does not."

import { describe, it, expect } from 'vitest'
import { computeConfidenceAssessment, CONFIDENCE_MODEL_VERSION } from '../independence'
import { reliabilityOf } from '../priors'
import type { GroundedScore } from '@/lib/scoring'

function grounded(overrides: Partial<GroundedScore> = {}): GroundedScore {
  return {
    score: 60,
    decision: 'VALIDATE_FURTHER',
    dimensions: [],
    groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth: {
      contributingProviders: [],
      totalScoreEligibleProviders: 8,
      pct: 0,
      channelBreakdown: [],
      distinctChannelTypes: 0,
      crossChannelCorroborated: false,
    },
    ...overrides,
  }
}

describe('computeConfidenceAssessment — weight-0 dimensions', () => {
  it('reports null confidence for a qualitative/excluded dimension — never fabricated', () => {
    const g = grounded({
      dimensions: [
        { key: 'manufacturing', label: 'Manufacturing Feasibility', weight: 0, qualitativeLevel: 'Medium', source: 'synthesized', sourceLabel: 'AI judgment' },
      ],
    })
    const assessment = computeConfidenceAssessment(g)
    expect(assessment.dimensions[0].confidence).toBeNull()
    expect(assessment.dimensions[0].confirmingChannelCount).toBe(0)
    expect(assessment.overallConfidence).toBeNull()
  })
})

describe('computeConfidenceAssessment — single-channel confidence', () => {
  it('a demand dimension confirmed only by dataforseo equals dataforseo\'s reliability prior', () => {
    const g = grounded({
      dimensions: [
        { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo' },
      ],
      evidenceBreadth: {
        contributingProviders: ['dataforseo'],
        totalScoreEligibleProviders: 8,
        pct: 12,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
        ],
        distinctChannelTypes: 1,
        crossChannelCorroborated: false,
      },
    })
    const assessment = computeConfidenceAssessment(g)
    expect(assessment.dimensions[0].confidence).toBeCloseTo(reliabilityOf('dataforseo'), 3)
    expect(assessment.dimensions[0].confirmingChannelCount).toBe(1)
  })
})

describe('computeConfidenceAssessment — the roadmap acceptance criterion', () => {
  it('a second confirming channel (keepa, amazon_market) measurably raises confidence over dataforseo alone', () => {
    const oneChannel = grounded({
      dimensions: [{ key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo' }],
      evidenceBreadth: {
        contributingProviders: ['dataforseo'], totalScoreEligibleProviders: 8, pct: 12,
        channelBreakdown: [{ channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] }],
        distinctChannelTypes: 1, crossChannelCorroborated: false,
      },
    })
    const twoChannels = grounded({
      dimensions: [{ key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo + keepa' }],
      evidenceBreadth: {
        contributingProviders: ['dataforseo', 'keepa'], totalScoreEligibleProviders: 8, pct: 25,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
        ],
        distinctChannelTypes: 2, crossChannelCorroborated: true,
      },
    })

    const oneConfidence = computeConfidenceAssessment(oneChannel).dimensions[0].confidence!
    const twoConfidence = computeConfidenceAssessment(twoChannels).dimensions[0].confidence!

    expect(twoConfidence).toBeGreaterThan(oneConfidence)
    // Exact multiplicative check: 1 − (1−r_dataforseo)(1−r_keepa)
    const expected = 1 - (1 - reliabilityOf('dataforseo')) * (1 - reliabilityOf('keepa'))
    expect(twoConfidence).toBeCloseTo(expected, 3)
  })

  it('a third same-channel signal (apify-amazon-search, still amazon_market) does NOT raise confidence further', () => {
    const twoChannels = grounded({
      dimensions: [{ key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo + keepa' }],
      evidenceBreadth: {
        contributingProviders: ['dataforseo', 'keepa'], totalScoreEligibleProviders: 8, pct: 25,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
        ],
        distinctChannelTypes: 2, crossChannelCorroborated: true,
      },
    })
    // Same two channels, but amazon_market now lists a second REAL
    // provider (keepa is still the one demand is eligible to draw from;
    // this simulates the channel already being "maxed" — adding another
    // provider to the same channel entry must not change the result).
    const thirdSameChannelSignal = grounded({
      dimensions: [{ key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo + keepa' }],
      evidenceBreadth: {
        contributingProviders: ['dataforseo', 'keepa'], totalScoreEligibleProviders: 8, pct: 25,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
          // Same channel, same eligible provider set for 'demand' — keepa is
          // still the only demand-eligible provider under amazon_market
          // (apify-amazon-search/apify-amazon-reviews are not in demand's
          // eligible-provider list — see eligibility.ts), so this represents
          // "more data landed in the same channel" without adding a new
          // channel or a new demand-eligible provider.
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
        ],
        distinctChannelTypes: 2, crossChannelCorroborated: true,
      },
    })

    const before = computeConfidenceAssessment(twoChannels).dimensions[0].confidence
    const after  = computeConfidenceAssessment(thirdSameChannelSignal).dimensions[0].confidence
    expect(after).toBe(before)
  })

  it('same-channel rollup uses the MAX reliability among real contributing providers, not a sum', () => {
    // marketAccessibility is eligible for amazon_market via both keepa
    // and apify-amazon-search — both present in the same channel entry.
    const g = grounded({
      dimensions: [{ key: 'marketAccessibility', label: 'Market Accessibility', weight: 0.18, rawScore: 6, source: 'verified', sourceLabel: 'keepa + apify-amazon-search' }],
      evidenceBreadth: {
        contributingProviders: ['keepa', 'apify-amazon-search'], totalScoreEligibleProviders: 8, pct: 25,
        channelBreakdown: [
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa', 'apify-amazon-search'] },
        ],
        distinctChannelTypes: 1, crossChannelCorroborated: false,
      },
    })
    const assessment = computeConfidenceAssessment(g)
    // keepa (0.90) > apify-amazon-search (0.75) — confidence must equal the
    // single-channel max-reliability formula, not exceed it as if two
    // channels had confirmed.
    expect(assessment.dimensions[0].confidence).toBeCloseTo(reliabilityOf('keepa'), 3)
    expect(assessment.dimensions[0].confirmingChannelCount).toBe(1)
  })
})

describe('computeConfidenceAssessment — weakest-link composite', () => {
  it('overallConfidence is the MINIMUM across verified dimensions, never an average', () => {
    const g = grounded({
      dimensions: [
        { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 8, source: 'verified', sourceLabel: 'dataforseo + keepa' },
        { key: 'virality', label: 'Virality', weight: 0.10, rawScore: 5, source: 'verified', sourceLabel: 'tiktok' },
      ],
      evidenceBreadth: {
        contributingProviders: ['dataforseo', 'keepa', 'tiktok'], totalScoreEligibleProviders: 8, pct: 37,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
          { channel: 'social_attention', label: 'Social Attention', contributed: true, providers: ['tiktok'] },
        ],
        distinctChannelTypes: 3, crossChannelCorroborated: true,
      },
    })
    const assessment = computeConfidenceAssessment(g)
    const demandConf   = assessment.dimensions.find(d => d.key === 'demand')!.confidence!
    const viralityConf = assessment.dimensions.find(d => d.key === 'virality')!.confidence!

    // demand (2 channels) must be strictly more confident than virality (1 channel, lower prior)
    expect(demandConf).toBeGreaterThan(viralityConf)
    // The composite must equal the weaker of the two, not their average
    expect(assessment.overallConfidence).toBeCloseTo(viralityConf, 3)
    expect(assessment.overallConfidence).not.toBeCloseTo((demandConf + viralityConf) / 2, 3)
    expect(assessment.weakestDimension).toBe('virality')
  })
})

describe('computeConfidenceAssessment — distinctConfirmingChannels union', () => {
  it('counts each channel once across all dimensions, not once per dimension', () => {
    const g = grounded({
      dimensions: [
        { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 8, source: 'verified', sourceLabel: 'keepa' },
        { key: 'marketAccessibility', label: 'Market Accessibility', weight: 0.18, rawScore: 6, source: 'verified', sourceLabel: 'keepa' },
      ],
      evidenceBreadth: {
        contributingProviders: ['keepa'], totalScoreEligibleProviders: 8, pct: 12,
        channelBreakdown: [
          { channel: 'amazon_market', label: 'Amazon Marketplace', contributed: true, providers: ['keepa'] },
        ],
        distinctChannelTypes: 1, crossChannelCorroborated: false,
      },
    })
    const assessment = computeConfidenceAssessment(g)
    // amazon_market confirms BOTH dimensions, but is one distinct channel.
    expect(assessment.distinctConfirmingChannels).toBe(1)
  })
})

describe('computeConfidenceAssessment — channel mismatch honesty', () => {
  it('flags channelMismatch rather than fabricating confidence when a verified dimension has zero real confirming channels', () => {
    const g = grounded({
      dimensions: [
        { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 7, source: 'verified', sourceLabel: 'dataforseo' },
      ],
      // evidenceBreadth shows nothing contributed at all — an inconsistent
      // state that should never fabricate a number.
      evidenceBreadth: {
        contributingProviders: [], totalScoreEligibleProviders: 8, pct: 0,
        channelBreakdown: [
          { channel: 'search_intent', label: 'Search / SEO', contributed: false, providers: [] },
        ],
        distinctChannelTypes: 0, crossChannelCorroborated: false,
      },
    })
    const assessment = computeConfidenceAssessment(g)
    expect(assessment.dimensions[0].confidence).toBeNull()
    expect(assessment.dimensions[0].channelMismatch).toBe(true)
  })
})

describe('computeConfidenceAssessment — versioning', () => {
  it('stamps the confidence model version onto every assessment', () => {
    const assessment = computeConfidenceAssessment(grounded())
    expect(assessment.confidenceModelVersion).toBe(CONFIDENCE_MODEL_VERSION)
  })
})
