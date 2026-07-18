// Regression test for the 2026-07-18 audit Finding 3: buildMemoPrompt used a
// truthy check (`if (evidence.competitor_count?.value)`) to decide whether
// to include the "Meaningful competitors" line, which silently dropped a
// real, legitimate competitor_count.value === 0 (a genuine "no products with
// >=20 reviews" blue-ocean signal). lib/stage2/thesis-generator.ts's
// buildEvidenceSummary already handled this identical field correctly via an
// `!== undefined` check — this fix matches that pattern exactly.

import { describe, it, expect } from 'vitest'
import { buildMemoPrompt } from '../memo-generator'
import { computeSensitivityAnalysis } from '../unit-economics'
import type { FullUnitEconomics } from '../unit-economics'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { InvestmentThesis } from '../../stage2/types'
import type { AdversarialDebateResult } from '../../stage3/adversarial'
import type { MarketVerdict } from '../verdict'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'apify', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['apify'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
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

function economicsFor(evidence: Stage1Evidence): FullUnitEconomics {
  return {
    sensitivity: computeSensitivityAnalysis(evidence),
    revenue_envelope: { conservative_monthly: 1000, base_monthly: 5000 } as FullUnitEconomics['revenue_envelope'],
  } as FullUnitEconomics
}

describe('buildMemoPrompt — Finding 3 (competitor_count: 0 must not be dropped)', () => {
  it('includes "Meaningful competitors: 0" when competitor_count.value is a real zero', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      competitor_count: ep(0),
    }
    const prompt = buildMemoPrompt(THESIS, evidence, DEBATE, economicsFor(evidence), MARKET_VERDICT)

    expect(prompt).toMatch(/Meaningful competitors: 0/)
  })

  it('still includes a non-zero competitor_count normally', () => {
    const evidence: Stage1Evidence = {
      ...REQUIRED_FIELDS,
      median_price: ep(30),
      competitor_count: ep(7),
    }
    const prompt = buildMemoPrompt(THESIS, evidence, DEBATE, economicsFor(evidence), MARKET_VERDICT)

    expect(prompt).toMatch(/Meaningful competitors: 7/)
  })

  it('omits the line entirely when competitor_count is genuinely absent (undefined)', () => {
    const evidence: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) }
    const prompt = buildMemoPrompt(THESIS, evidence, DEBATE, economicsFor(evidence), MARKET_VERDICT)

    expect(prompt).not.toMatch(/Meaningful competitors:/)
  })
})
