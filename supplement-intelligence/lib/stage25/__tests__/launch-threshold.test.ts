// Regression test — 2026-07-18 audit follow-up: checkPriceFloor had the same
// "hard blocker must never fire on an invented fee assumption" bug KS3
// (lib/stage3/kill-switches.ts checkEconomicsStructurallyBroken) had — it
// silently defaulted missing avg_referral_fee_pct/avg_fba_fee to 15%/$0
// instead of reporting the check as unevaluable. assessLaunchThresholds'
// overall becomes 'fail' at fail_count >= 2, and determineMarketVerdict
// (lib/stage4/verdict.ts) treats that as a real contributor to
// DO_NOT_PURSUE, so a guessed fee could hard-block a founder's analysis.

import { describe, it, expect } from 'vitest'
import { assessLaunchThresholds } from '../launch-threshold'
import type { Stage1Evidence } from '../../evidence/adapter'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['keepa'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
}

describe('checkPriceFloor (via assessLaunchThresholds) — honesty fix', () => {
  it('does not silently pass (or fail) on a guessed 15%/$0 default when real fee data is genuinely absent — reports unavailable instead', () => {
    // Under the pre-fix code, this exact case (real price, no real fee data)
    // would have silently computed against ref=15%/fba=$0 and returned
    // 'pass' (netRevenue = 12*0.85-0 = $10.20, impliedGM = 85%) — a
    // fabricated-precision "pass" on data that was never actually measured.
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(12),
    }
    const evaluation = assessLaunchThresholds(evidence)
    const priceFloorCheck = evaluation.checks.find(c => c.metric === 'Price Floor')!
    expect(priceFloorCheck.result).toBe('warn')
    expect(priceFloorCheck.reason.toLowerCase()).toContain('unavailable')
    expect(priceFloorCheck.reason.toLowerCase()).not.toContain('cogs budget is tight')
  })

  it('honesty: a real price with only referral% present (FBA fee missing) still reports unavailable — no partial guess', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      // avg_fba_fee intentionally absent
    }
    const evaluation = assessLaunchThresholds(evidence)
    const priceFloorCheck = evaluation.checks.find(c => c.metric === 'Price Floor')!
    expect(priceFloorCheck.result).toBe('warn')
    expect(priceFloorCheck.reason.toLowerCase()).toContain('unavailable')
  })

  it('evaluates normally (can pass, warn, or fail) once real referral%/FBA-fee data is present', () => {
    // $30 price, 15% referral, $4.50 FBA -> netRevenue = 30*0.85 - 4.5 = 21,
    // impliedGM = 21/30 = 70% -> pass.
    const passEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
    }
    const passResult = assessLaunchThresholds(passEvidence)
    expect(passResult.checks.find(c => c.metric === 'Price Floor')!.result).toBe('pass')

    // $12 price, 15% referral, $4.50 FBA -> netRevenue = 12*0.85 - 4.5 = 5.7,
    // impliedGM = 5.7/12 = 47.5% -> still pass under >=45%; use a smaller price
    // to force a real 'fail' with real (not defaulted) data.
    // $10 price, 15% referral, $6 FBA -> netRevenue = 10*0.85 - 6 = 2.5, GM = 25% -> fail.
    const failEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(10),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(6),
    }
    const failResult = assessLaunchThresholds(failEvidence)
    expect(failResult.checks.find(c => c.metric === 'Price Floor')!.result).toBe('fail')
  })

  it('unchanged behavior: zero/absent price still reports "no data", distinct from the fee-data-unavailable case', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS }
    const evaluation = assessLaunchThresholds(evidence)
    const priceFloorCheck = evaluation.checks.find(c => c.metric === 'Price Floor')!
    expect(priceFloorCheck.result).toBe('warn')
    expect(priceFloorCheck.value).toBe('no data')
    expect(priceFloorCheck.reason).toBe('No price data available — cannot validate margin floor')
  })
})
