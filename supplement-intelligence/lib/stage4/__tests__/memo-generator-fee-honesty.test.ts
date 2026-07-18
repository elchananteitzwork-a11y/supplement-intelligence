// Regression test — 2026-07-18 audit round 3: buildMemoPrompt (the actual AI
// prompt used to write the founder-facing investment memo prose) read
// economics.sensitivity.base_case.breakeven_cogs / fba_fee / referral_pct
// and evidence.ppc_economics.headroom_after_ads unconditionally, with no
// fee_data_source check — so a fee schedule silently defaulted to 15%/$4.50
// (see lib/stage4/unit-economics.ts, lib/stage1/ppc-economics.ts) could be
// handed to the model as a "computed deterministically — do NOT override"
// fact, and the prompt explicitly instructed the model to restate the
// (possibly fabricated) COGS ceiling in the generated prose a founder reads.
// Fix: gate every fee-derived dollar figure and instruction on
// economics.sensitivity.fee_data_source === 'real'; omit rather than present
// an invented figure as measured.

import { describe, it, expect } from 'vitest'
import { buildMemoPrompt } from '../memo-generator'
import { computeSensitivityAnalysis } from '../unit-economics'
import type { FullUnitEconomics } from '../unit-economics'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { InvestmentThesis } from '../../stage2/types'
import type { AdversarialDebateResult } from '../../stage3/adversarial'
import type { MarketVerdict } from '../verdict'
import type { PpcEconomics } from '../../stage1/ppc-economics'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'keepa', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['keepa'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
}

const THESIS = {
  product_angle: 'Test product angle',
  target_customer: 'Test target customer',
  differentiation: 'Test differentiation',
  customer_pain: { problem: 'test problem', pain_intensity: 'High', frequency: 'Daily' },
} as unknown as InvestmentThesis

const DEBATE = {
  bull_case: { core_argument: 'bull argument' },
  bear_case: { core_argument: 'bear argument' },
  conflicts: [],
  unknowns: [],
} as unknown as AdversarialDebateResult

const MARKET_VERDICT = { code: 'PURSUE', headline: 'test headline' } as unknown as MarketVerdict

const PPC_ECONOMICS = {
  ppc_risk_level: 'Low',
  risk_reason: 'test risk reason',
  est_acos_pct: 20,
  headroom_after_ads: 9.99,
  paid_viable: true,
} as unknown as PpcEconomics

function economicsFor(evidence: Stage1Evidence): FullUnitEconomics {
  return {
    sensitivity: computeSensitivityAnalysis(evidence),
    revenue_envelope: { conservative_monthly: 1000, base_monthly: 5000 } as FullUnitEconomics['revenue_envelope'],
  } as FullUnitEconomics
}

describe('buildMemoPrompt — fee_data_source honesty fix', () => {
  it('includes the specific breakeven-COGS/FBA+referral dollar figures and the "must reference" instruction when fee data is real', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
    }
    const economics = economicsFor(evidence)
    const prompt = buildMemoPrompt(THESIS, evidence, DEBATE, economics, MARKET_VERDICT)

    expect(prompt).toMatch(/Breakeven COGS at .*% GM target: \$/)
    expect(prompt).toMatch(/FBA \+ referral costs: \$/)
    expect(prompt).toMatch(/must reference the \$.*COGS ceiling explicitly/)
    expect(prompt).not.toMatch(/must NOT state or imply/)
  })

  it('omits the breakeven-COGS/FBA+referral dollar figures and forbids the model from stating them when fee data is estimated', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) } // no real fee data
    const economics = economicsFor(evidence)
    const prompt = buildMemoPrompt(THESIS, evidence, DEBATE, economics, MARKET_VERDICT)

    expect(prompt).not.toMatch(/Breakeven COGS at/)
    expect(prompt).not.toMatch(/FBA \+ referral costs: \$/)
    expect(prompt).toMatch(/Real Amazon referral fee \/ FBA fee data was NOT available/)
    expect(prompt).toMatch(/must NOT state or imply a specific COGS ceiling dollar figure as fact/)
    expect(prompt).not.toMatch(/must reference the \$/)
  })

  it('includes the PPC "net revenue after ads" dollar figure only when fee data is real, even though ppc_economics is present in both cases', () => {
    const realEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      avg_referral_fee_pct: ep(15),
      avg_fba_fee: ep(4.50),
      ppc_economics: { value: PPC_ECONOMICS, source: 'dataforseo+computed', source_type: 'computed', freshness_date: new Date().toISOString() },
    }
    const realPrompt = buildMemoPrompt(THESIS, realEvidence, DEBATE, economicsFor(realEvidence), MARKET_VERDICT)
    expect(realPrompt).toMatch(/Net revenue after ads \(before COGS\): \$9\.99\/unit/)

    const estimatedEvidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      ppc_economics: { value: PPC_ECONOMICS, source: 'dataforseo+computed', source_type: 'computed', freshness_date: new Date().toISOString() },
    }
    const estimatedPrompt = buildMemoPrompt(THESIS, estimatedEvidence, DEBATE, economicsFor(estimatedEvidence), MARKET_VERDICT)
    expect(estimatedPrompt).not.toMatch(/Net revenue after ads/)
    // The rest of the PPC block (risk level, paid-viable) is still real/independent of the fee default, so it still shows.
    expect(estimatedPrompt).toMatch(/PPC risk: Low/)
  })
})
