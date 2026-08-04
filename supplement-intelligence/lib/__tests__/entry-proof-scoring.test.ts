// ── Entry Proof scoring bonus — docs/RD_ENTRY_PROOF_SCORING.md ──────────────
// SCORING_ENGINE_VERSION 2.12.0: computeMarketAccessibility gains a bounded,
// positive-only, tier-scaled bonus when v2-bar entry-proof members exist.
// These tests pin the four contractual properties: tier scaling, the 10-cap,
// absence = byte-identical score, and the v1-data refusal (criteria_version
// gate — scores are recomputed from stored memos at read time, so v1-bar
// members must never earn the bonus retroactively).

import { describe, it, expect } from 'vitest'
import { computeGroundedScore, ENTRY_PROOF_BONUS_SINGLE, ENTRY_PROOF_BONUS_DUAL, ENTRY_PROOF_BONUS_PATTERN } from '../scoring'
import type { MemoData } from '@/types/index'

const SCAFFOLD = {
  category_name: 'Creatine', executive_summary: '', build_decision: 'SKIP',
  build_explanation: '', opportunity_score: 0,
  biggest_competitor: { name: '', revenue: '', gap: '' },
  market_size: '', gross_margin: '', market_gaps: [], brand_opportunities: [],
  customer_language: { frustrations: [], desires: [], fears: [], ad_phrases: [] },
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

function memoWith(entryProof: Record<string, unknown> | undefined): MemoData {
  return {
    ...SCAFFOLD,
    signal_evidence: {
      providers_used: ['keepa'], overall_confidence: 0.7,
      demand_verified: true, virality_verified: false, pricing_verified: true, growth_verified: true,
      review_velocity: { value: { score: 5, confidence: 0.7 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
      competition:     { value: { score: 5, confidence: 0.7 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
      revenue: {
        value: { score: 6, confidence: 0.7, ...(entryProof && { entry_proof: entryProof }) },
        sources: ['keepa'], primarySource: 'keepa', confidence: 0.7,
      },
    } as unknown as MemoData['signal_evidence'],
  } as unknown as MemoData
}

const M = (n: number) => Array.from({ length: n }, (_, i) => ({
  productId: `M${i}`, brand: `Brand${i}`, monthly_sold: 3000, review_count: 50 + i, price: 26,
  listing_age_months: 6, recent: true,
}))

const maccess = (m: MemoData) =>
  computeGroundedScore(m).dimensions.find(d => d.key === 'marketAccessibility')!

describe('Entry Proof scoring bonus (v2.12.0)', () => {
  const baseline = maccess(memoWith(undefined)).rawScore!

  it('tier scaling: +0.5 / +1.0 / +1.5 for 1 / 2 / 3+ v2 members', () => {
    for (const [count, bonus] of [[1, ENTRY_PROOF_BONUS_SINGLE], [2, ENTRY_PROOF_BONUS_DUAL], [3, ENTRY_PROOF_BONUS_PATTERN], [5, ENTRY_PROOF_BONUS_PATTERN]] as const) {
      const ep = { ...M(count)[0], niche_median_reviews: 2000, niche_median_sold: 5000, niche_median_price: 27, members: M(count), criteria_version: 2 }
      const withBonus = maccess(memoWith(ep)).rawScore!
      expect(withBonus).toBeCloseTo(Math.min(10, baseline + bonus), 5)
    }
  })

  it('absence: score byte-identical to today, sourceLabel untouched', () => {
    const dim = maccess(memoWith(undefined))
    expect(dim.rawScore).toBe(baseline)
    expect(dim.sourceLabel).not.toContain('entry proof')
  })

  it('v1-shaped stored data (no criteria_version) earns NO bonus', () => {
    const ep = { ...M(3)[0], niche_median_reviews: 2000, niche_median_sold: 5000, niche_median_price: 27, members: M(3) }
    expect(maccess(memoWith(ep)).rawScore).toBe(baseline)
  })

  it('caps at 10 and discloses the bonus in the sourceLabel', () => {
    const m = memoWith({ ...M(3)[0], niche_median_reviews: 2000, niche_median_sold: 5000, niche_median_price: 27, members: M(3), criteria_version: 2 })
    const se = m.signal_evidence as unknown as { review_velocity: { value: { score: number } }; competition: { value: { score: number } } }
    se.review_velocity.value.score = 10
    se.competition.value.score = 10
    const dim = maccess(m)
    expect(dim.rawScore).toBe(10)
    expect(dim.sourceLabel).toContain('entry proof (3 recent low-review sellers observed)')
  })
})
