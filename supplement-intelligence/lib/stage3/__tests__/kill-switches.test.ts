// Regression test for the 2026-07-18 audit Finding 4: checkFdaRegulatoryRisk
// must surface the regulatory engine's own warning_flags (sample-size /
// causal-implication disclosure) in its data_used output — this is the one
// artifact that can hard-block a founder's analysis, so the transparency
// built into lib/regulatory-engine/index.ts needs to actually reach it.
// Trigger logic/thresholds are unchanged and not the subject of this test.

import { describe, it, expect } from 'vitest'
import { checkFdaRegulatoryRisk, checkEconomicsStructurallyBroken, runAllKillSwitches } from '../kill-switches'
import { computeEconomicsGateTier } from '../../scoring'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { RegulatoryIntelligence } from '../../regulatory-engine/types'
import type { InvestmentThesis } from '../../stage2/types'
import type { MemoData } from '@/types/index'

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: {
    value: ['openFDA'],
    source: 'test',
    source_type: 'computed',
    freshness_date: new Date().toISOString(),
  },
  overall_confidence: {
    value: 0.7,
    source: 'test',
    source_type: 'computed',
    freshness_date: new Date().toISOString(),
  },
}

function regEvidence(reg: RegulatoryIntelligence): Stage1Evidence {
  return {
    ...REQUIRED_FIELDS,
    regulatory_intelligence: {
      value: reg,
      source: 'openFDA',
      source_type: 'primary_measurement',
      freshness_date: new Date().toISOString(),
    },
  }
}

const HIGH_RISK_REG: RegulatoryIntelligence = {
  query_term: 'magnesium',
  ingredient_searched: 'magnesium',
  adverse_events: {
    total_reports: 1799,
    implicated_reports: 48,
    serious_reports: 10,
    hospitalization_count: 6,
    death_count: 0,
    top_reactions: [],
    recent_trend: 'Stable',
    sample_size: 1000,
  },
  recalls: {
    total_recalls: 28,
    implicated_recalls: 1,
    class_i_recalls: 1,
    class_ii_recalls: 0,
    class_iii_recalls: 0,
    recent_recall_descriptions: [],
    sample_size: 28,
  },
  risk_level: 'High',
  risk_summary: '1 Class I recall(s) on record — active safety concern',
  warning_flags: [
    'Recall classification based on a 28-recall sample of 28 total text matches — same sampling caveat applies.',
  ],
  confidence: 0.7,
  data_sources: ['openFDA'],
  fetched_at: new Date().toISOString(),
  disclaimer: 'test disclaimer',
}

describe('checkFdaRegulatoryRisk — Finding 4 (surface warning_flags in data_used)', () => {
  it('includes the real warning_flags (sample-size disclosure) in data_used when present', () => {
    const result = checkFdaRegulatoryRisk(regEvidence(HIGH_RISK_REG))
    expect(result.data_used.warning_flags).toBe(
      'Recall classification based on a 28-recall sample of 28 total text matches — same sampling caveat applies.',
    )
  })

  it('includes the new implicated-count fields alongside the existing raw totals', () => {
    const result = checkFdaRegulatoryRisk(regEvidence(HIGH_RISK_REG))
    expect(result.data_used.adverse_event_implicated).toBe(48)
    expect(result.data_used.recall_implicated).toBe(1)
    // Existing raw-total fields remain present — additive, not a replacement.
    expect(result.data_used.adverse_event_total).toBe(1799)
    expect(result.data_used.recall_total).toBe(28)
  })

  it('discloses "none" (not undefined/omitted) when there are no warning flags', () => {
    const clean: RegulatoryIntelligence = { ...HIGH_RISK_REG, warning_flags: [], risk_level: 'Low' }
    const result = checkFdaRegulatoryRisk(regEvidence(clean))
    expect(result.data_used.warning_flags).toBe('none')
  })

  it('does not change trigger logic — still triggers only on Critical, boundary-zones only on High', () => {
    const result = checkFdaRegulatoryRisk(regEvidence(HIGH_RISK_REG))
    expect(result.triggered).toBe(false)
    expect(result.boundary_zone).toBe(true)

    const critical = checkFdaRegulatoryRisk(regEvidence({ ...HIGH_RISK_REG, risk_level: 'Critical' }))
    expect(critical.triggered).toBe(true)
    expect(critical.boundary_zone).toBe(false)
  })

  it('handles missing regulatory intelligence gracefully, unchanged from before', () => {
    const result = checkFdaRegulatoryRisk(REQUIRED_FIELDS)
    expect(result.triggered).toBe(false)
    expect(result.data_used).toEqual({ risk_level: 'unavailable' })
  })
})

// ── Finding 1 (2026-07-18 audit): KS3 economics gate had drifted from its
// documented "mirror" in lib/scoring.ts's computeEconomicsGateTier — this
// file's checkEconomicsStructurallyBroken still used the discredited 50%
// COGS default (corrected to 35% in scoring.ts's v2.7.0) and silently
// defaulted missing referral%/FBA-fee data to 15%/$4.50 with no disclosure,
// even though this is a live-wired hard blocker (runAllKillSwitches ->
// adversarial.ts -> stage4/verdict.ts forces DO_NOT_PURSUE when triggered).

const SCORING_MEMO_SCAFFOLD = {
  category_name: 'Creatine',
  executive_summary: '',
  build_decision: 'SKIP',
  build_explanation: '',
  opportunity_score: 0,
  biggest_competitor: { name: '', revenue: '', gap: '' },
  market_size: '',
  gross_margin: '',
  market_gaps: [],
  brand_opportunities: [],
  customer_language: { frustrations: [], desires: [], fears: [], ad_phrases: [] },
  product_recommendation: {
    format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '',
  },
  financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
  scores: { demand: {}, virality: {}, subscription: {}, manufacturing: {} },
} as const

function economicsMemo(avgPrice: string, referralPct: number, fbaFee: string): MemoData {
  return {
    ...SCORING_MEMO_SCAFFOLD,
    signal_evidence: {
      pricing: { value: { avg_price: avgPrice, score: 5 }, primarySource: 'keepa', sources: ['keepa'], confidence: 0.8 },
      revenue: {
        value: { avg_referral_fee_pct: referralPct, avg_fba_pick_pack_fee: fbaFee, score: 5 },
        primarySource: 'keepa', sources: ['keepa'], confidence: 0.8,
      },
    } as unknown as MemoData['signal_evidence'],
  } as unknown as MemoData
}

describe('checkEconomicsStructurallyBroken — Finding 1 (mirrors scoring.ts, real hand-verified numbers)', () => {
  // $5 FBA here is the ORIGINAL AUDIT FINDING's own hand-verified example input
  // ("price=$35, referral=15%, FBA=$5"), passed explicitly by the caller — not
  // to be confused with the unrelated $4.50 figure elsewhere in this file,
  // which is the discredited SILENT DEFAULT this fix removes (the old
  // `evidence.avg_fba_fee?.value ?? 4.50` fallback in runAllKillSwitches).
  // Both $5 (real, explicit) and $4.50 (defaulted, now removed) independently
  // produce a non-trigger at the corrected 35% COGS assumption for this price
  // point — the two numbers are simply unrelated to each other, not a rounding
  // discrepancy.
  it('the exact $35 price / 15% referral / $5 FBA audit example: KS3 and scoring.ts\'s mirrored gate now agree — NEITHER fires (maxGM ~35.7%)', () => {
    const ks3 = checkEconomicsStructurallyBroken(35, 15, 5)
    expect(ks3.triggered).toBe(false)
    expect(ks3.data_used.max_gm_pct).toBeCloseTo(35.7, 1)

    const scoringGate = computeEconomicsGateTier(economicsMemo('$35', 15, '$5'))
    expect(scoringGate.decision).toBeNull()
  })

  it('uses the corrected 35% COGS default (v2.7.0), not the discredited 50% default that caused the contradiction', () => {
    const result = checkEconomicsStructurallyBroken(35, 15, 5)
    expect(result.data_used.optimistic_cogs).toBeCloseTo(35 * 0.35, 2)
    // Hand-verified in the audit: at the old 50% default, maxGM for these
    // exact inputs was ~20.7% and DID trigger. After the fix it must not.
    expect(result.triggered).toBe(false)
  })

  it('still triggers for a genuinely broken-economics market (both formulas agree)', () => {
    // Low price, high fees -> should not clear 35% GM under either formula.
    const ks3 = checkEconomicsStructurallyBroken(15, 15, 5)
    expect(ks3.triggered).toBe(true)

    const scoringGate = computeEconomicsGateTier(economicsMemo('$15', 15, '$5'))
    expect(scoringGate.decision).toBe('VALIDATE_FURTHER')
  })

  it('honesty: never substitutes a default referral%/FBA fee when real data is absent — returns non-triggering with explicit disclosure', () => {
    const result = checkEconomicsStructurallyBroken(35, undefined, undefined)
    expect(result.triggered).toBe(false)
    expect(result.boundary_zone).toBe(false)
    expect(result.reason.toLowerCase()).toContain('unavailable')
    expect(result.data_used.referral_pct).toBe('unavailable')
    expect(result.data_used.fba_fee).toBe('unavailable')
    expect(result.mandatory_notice).toBeUndefined()
  })

  it('honesty: partial real data (only one of referral%/FBA fee present) still does not trigger — no partial guess', () => {
    const onlyReferral = checkEconomicsStructurallyBroken(35, 15, undefined)
    expect(onlyReferral.triggered).toBe(false)
    expect(onlyReferral.data_used.fba_fee).toBe('unavailable')

    const onlyFba = checkEconomicsStructurallyBroken(35, undefined, 5)
    expect(onlyFba.triggered).toBe(false)
    expect(onlyFba.data_used.referral_pct).toBe('unavailable')
  })

  it('honesty: an absent/zero price floor does not trigger (mirrors scoring.ts\'s priceFloor <= 0 guard)', () => {
    const result = checkEconomicsStructurallyBroken(0, 15, 5)
    expect(result.triggered).toBe(false)
  })
})

describe('runAllKillSwitches — Finding 1 (no silent 15%/$4.50 fallback at the call site)', () => {
  const REQUIRED: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
    providers_used: { value: ['keepa'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
    overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  }
  const NO_FLAGS = { patent_blocking: false, fda_clearance_required: false }

  it('KS3 does not trigger when evidence has a price but no real referral%/FBA fee data (previously silently defaulted to 15%/$4.50)', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED,
      median_price: { value: 20, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() },
      // avg_referral_fee_pct / avg_fba_fee intentionally absent
    }
    const evaluation = runAllKillSwitches(evidence, {} as InvestmentThesis, NO_FLAGS)
    const ks3 = evaluation.results.find(r => r.id === 'ECONOMICS_STRUCTURALLY_BROKEN')!
    expect(ks3.triggered).toBe(false)
    expect(ks3.data_used.referral_pct).toBe('unavailable')
    expect(ks3.data_used.fba_fee).toBe('unavailable')
  })

  it('KS3 evaluates normally (can trigger) once real referral%/FBA fee data is present', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED,
      median_price: { value: 15, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() },
      avg_referral_fee_pct: { value: 15, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() },
      avg_fba_fee: { value: 5, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() },
    }
    const evaluation = runAllKillSwitches(evidence, {} as InvestmentThesis, NO_FLAGS)
    const ks3 = evaluation.results.find(r => r.id === 'ECONOMICS_STRUCTURALLY_BROKEN')!
    expect(ks3.triggered).toBe(true)
  })
})
