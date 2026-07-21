// Regression test — 2026-07-18 audit, Finding 8: app/api/research/compare
// /route.ts and app/api/research/history/route.ts each hard-coded an
// independent copy of "Opportunity Score" — one divided pass_count by
// thresholds.checks.length, the other multiplied pass_count by a hard-coded
// 14. They produced identical output only because there happen to be
// exactly 5 threshold checks today (5 * 14 = 70 === (5/5)*70) and would
// silently diverge the moment a 6th check is added to launch-threshold.ts.
// Both routes must now import this single shared implementation.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { computeOpportunityScore } from '../opportunity-score'
import type { Stage1Evidence } from '../../evidence/adapter'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['keepa'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
}

describe('computeOpportunityScore', () => {
  it('scales correctly regardless of how many threshold checks exist (division by checks.length, not a hard-coded per-check weight)', () => {
    // Strong evidence -> all 5 real checks should pass -> base 70.
    const strongEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      est_monthly_revenue:   ep(80_000),
      median_price:          ep(30),
      avg_referral_fee_pct:  ep(15),
      avg_fba_fee:           ep(4.5),
      competitor_count:      ep(12),
      review_concentration:  ep(0.3),
      momentum_90d_pct:      ep(10),
      price_compression_pct: ep(0),
    }
    expect(computeOpportunityScore(strongEvidence, null)).toBe(70)
  })

  it('applies the verdict-code bonus/penalty on top of the base score, clamped to [0, 100]', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS }
    // No evidence beyond required fields -> every check warns/fails -> base 0.
    expect(computeOpportunityScore(evidence, null)).toBe(0)
    expect(computeOpportunityScore(evidence, 'PURSUE')).toBe(30)
    expect(computeOpportunityScore(evidence, 'PURSUE_WITH_CAUTION')).toBe(15)
    expect(computeOpportunityScore(evidence, 'INVESTIGATE_FURTHER')).toBe(0)
    expect(computeOpportunityScore(evidence, 'DO_NOT_PURSUE')).toBe(0) // max(0, 0-20)
  })

  it('never exceeds 100 even with a maximal base score and PURSUE bonus', () => {
    const strongEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      est_monthly_revenue:   ep(80_000),
      median_price:          ep(30),
      avg_referral_fee_pct:  ep(15),
      avg_fba_fee:           ep(4.5),
      competitor_count:      ep(12),
      review_concentration:  ep(0.3),
      momentum_90d_pct:      ep(10),
      price_compression_pct: ep(0),
    }
    expect(computeOpportunityScore(strongEvidence, 'PURSUE')).toBe(100)
  })
})

describe('single source of truth — no re-duplicated formula (Finding 8 reuse guard)', () => {
  const repoRoot = join(__dirname, '..', '..', '..')

  // UIv2-M2 update (2026-07-2x): app/api/research/compare/route.ts was
  // rewired off the old investment_theses/market_signals pipeline (zero
  // real rows in production, per that milestone's architecture audit) onto
  // the real `analyses` pipeline — it no longer computes an "Opportunity
  // Score" via this Stage1Evidence-shaped formula at all; it uses
  // lib/scoring.ts's computeGroundedScore(memo_data) instead, the same
  // real scoring function Pipeline and Candidate Detail already use. This
  // is a legitimate consequence of that approved change, not a regression
  // of Finding 8 — the guard below still confirms the route doesn't
  // re-duplicate this formula locally, just no longer expects it to import
  // a formula it has no reason to call anymore.
  it('app/api/research/compare/route.ts does not re-duplicate the retired Stage 2.5 opportunity-score formula locally', () => {
    const src = readFileSync(join(repoRoot, 'app/api/research/compare/route.ts'), 'utf8')
    expect(src).not.toMatch(/function computeScore\(/)
    expect(src).not.toMatch(/function computeOpportunityScore\(/)
  })

  it('app/api/research/history/route.ts imports the shared function and does not redefine it locally', () => {
    const src = readFileSync(join(repoRoot, 'app/api/research/history/route.ts'), 'utf8')
    expect(src).toContain("import { computeOpportunityScore } from '@/lib/stage25/opportunity-score'")
    expect(src).not.toMatch(/function computeOpportunityScore\(/)
    expect(src).not.toContain('pass_count * 14')
  })
})
