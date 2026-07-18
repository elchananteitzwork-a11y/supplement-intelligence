// Regression test — 2026-07-18 audit follow-up: computeSensitivityAnalysis
// (lib/stage4/unit-economics.ts) silently defaulted missing real Keepa
// avg_referral_fee_pct/avg_fba_fee to 15%/$4.50 and produced a specific
// breakeven_cogs dollar figure that looked measured. That figure fed
// directly into determineMarketVerdict's founder-facing rationale array
// (lib/stage4/verdict.ts) and into memo-generator.ts's AI prompt — a Law 12
// (no fabricated precision) concern. Fix: SensitivityAnalysis now carries
// fee_data_source: 'real' | 'estimated', and determineMarketVerdict only
// surfaces the specific dollar-precision COGS line when fee_data_source
// is 'real'.

import { describe, it, expect } from 'vitest'
import { computeSensitivityAnalysis, computeFullUnitEconomics } from '../unit-economics'
import { determineMarketVerdict } from '../verdict'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { KillSwitchEvaluation } from '../../stage3/kill-switches'
import type { LaunchThresholdAssessment } from '../../stage25/launch-threshold'
import type { FullUnitEconomics } from '../unit-economics'
import type { InvestmentThesis } from '../../stage2/types'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['keepa'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
}

const NO_KILL_SWITCHES: KillSwitchEvaluation = {
  results: [],
  any_triggered: false,
  any_boundary: false,
  all_switches_clear: true,
  triggered_ids: [],
}

const CLEAN_THRESHOLDS: LaunchThresholdAssessment = {
  overall: 'pass',
  checks: [],
  pass_count: 5,
  warn_count: 0,
  fail_count: 0,
}

describe('computeSensitivityAnalysis — fee_data_source honesty fix', () => {
  it('reports fee_data_source: "real" and the precise note when real Keepa fee data is present', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
    }
    const sensitivity = computeSensitivityAnalysis(evidence)
    expect(sensitivity.fee_data_source).toBe('real')
    expect(sensitivity.cogs_sensitivity_note).toMatch(/you can spend up to \$/)
    expect(sensitivity.base_case.breakeven_cogs).toBeGreaterThan(0)
  })

  it('reports fee_data_source: "estimated" and discloses the assumption in plain language when real fee data is absent', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) } // no avg_referral_fee_pct / avg_fba_fee
    const sensitivity = computeSensitivityAnalysis(evidence)
    expect(sensitivity.fee_data_source).toBe('estimated')
    expect(sensitivity.cogs_sensitivity_note.toLowerCase()).toContain('unavailable')
    expect(sensitivity.cogs_sensitivity_note.toLowerCase()).toContain('estimate')
    // The underlying scenario numbers are still computed (useful for a
    // founder-input sensitivity table) — only the "measured fact" framing changes.
    expect(sensitivity.base_case.breakeven_cogs).toBeGreaterThan(0)
  })

  it('partial real data (only referral% present) still counts as estimated — no partial guess presented as real', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30), avg_referral_fee_pct: ep(15) }
    const sensitivity = computeSensitivityAnalysis(evidence)
    expect(sensitivity.fee_data_source).toBe('estimated')
  })
})

describe('determineMarketVerdict — omits the fabricated-precision COGS rationale line when fee data is estimated', () => {
  it('includes the specific breakeven-COGS dollar line when fee_data_source is "real"', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
    }
    const sensitivity = computeSensitivityAnalysis(evidence)
    const economics = { sensitivity } as FullUnitEconomics
    const verdict = determineMarketVerdict(NO_KILL_SWITCHES, CLEAN_THRESHOLDS, economics)
    expect(verdict.rationale.some(r => r.startsWith('COGS budget: up to $'))).toBe(true)
  })

  it('omits the breakeven-COGS dollar line entirely when fee_data_source is "estimated" (no invented precision shown to the founder)', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) } // no real fee data
    const sensitivity = computeSensitivityAnalysis(evidence)
    expect(sensitivity.base_case.breakeven_cogs).toBeGreaterThan(0) // the number still exists internally...
    const economics = { sensitivity } as FullUnitEconomics
    const verdict = determineMarketVerdict(NO_KILL_SWITCHES, CLEAN_THRESHOLDS, economics)
    // ...but must never reach founder-facing rationale as if it were measured.
    expect(verdict.rationale.some(r => r.startsWith('COGS budget: up to $'))).toBe(false)
  })
})

const MINIMAL_THESIS = {
  quick_economics_check: { launch_complexity: 'low' },
} as unknown as InvestmentThesis

describe('computeFullUnitEconomics — founder-inputs branch shares fee_data_source with sensitivity (round 3 fix)', () => {
  it('sensitivity.fee_data_source is "real" for the same evidence that drives founder_target_gm_pct when real fee data is present', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
    }
    const economics = computeFullUnitEconomics(evidence, MINIMAL_THESIS, undefined, { actual_cogs_per_unit: 5 })
    expect(economics.founder_target_gm_pct).toBeDefined()
    expect(economics.sensitivity.fee_data_source).toBe('real')
  })

  it('sensitivity.fee_data_source is "estimated" for the same evidence that drives founder_target_gm_pct when real fee data is absent — a consumer gating on this flag correctly marks founder_target_gm_pct as an estimate too', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) } // no real fee data
    const economics = computeFullUnitEconomics(evidence, MINIMAL_THESIS, undefined, { actual_cogs_per_unit: 5 })
    // The figure is still computed (founder's own real COGS run through a
    // disclosed 15%/$4.50 fallback) — only the "measured fact" framing must change.
    expect(economics.founder_target_gm_pct).toBeDefined()
    expect(economics.sensitivity.fee_data_source).toBe('estimated')
  })
})
