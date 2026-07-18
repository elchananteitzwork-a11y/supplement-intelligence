// Regression test for the 2026-07-18 audit (Report Generation fixes,
// Finding 1): FounderVerdict.caveats (computed by determineFounderVerdict in
// lib/stage4/verdict.ts — e.g. "Capital fit is tight: ...") was stored and
// returned on the InvestmentMemo object, but buildMemoPrompt never read the
// full founderVerdict object, so a founder with a real caveat (capital_fit
// 'tight', timeline_fit 'stretched', channel_fit 'partial'/'weak') never saw
// it reflected in the AI-generated memo prose they actually read — only in
// an unrendered API field.
//
// Fix: buildMemoPrompt now takes an optional founderVerdict param and
// threads founderVerdict.caveats into the real prompt text, with an
// explicit instruction for the model to reference them in
// final_considerations.
//
// Only buildMemoPrompt (a pure string-building function, exported
// additively for testability — see its export comment) is exercised here;
// generateInvestmentMemo calls the Anthropic SDK and is out of scope for
// this prompt-construction-only fix.

import { describe, it, expect } from 'vitest'
import { buildMemoPrompt } from '../memo-generator'
import { computeSensitivityAnalysis } from '../unit-economics'
import type { FullUnitEconomics } from '../unit-economics'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { InvestmentThesis } from '../../stage2/types'
import type { AdversarialDebateResult } from '../../stage3/adversarial'
import type { MarketVerdict, FounderVerdict } from '../verdict'

function ep<T>(value: T): { value: T; source: string; source_type: 'primary_measurement'; freshness_date: string } {
  return { value, source: 'apify', source_type: 'primary_measurement', freshness_date: new Date().toISOString() }
}

const REQUIRED_FIELDS: Pick<Stage1Evidence, 'providers_used' | 'overall_confidence'> = {
  providers_used: { value: ['apify'], source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
  overall_confidence: { value: 0.7, source: 'test', source_type: 'computed', freshness_date: new Date().toISOString() },
}

const EVIDENCE: Stage1Evidence = { ...REQUIRED_FIELDS, median_price: ep(30) }

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

function founderVerdictWithCaveats(caveats: string[]): FounderVerdict {
  return {
    code: 'CONDITIONAL_FIT',
    headline: 'test headline',
    rationale: [],
    requirements: [],
    caveats,
  }
}

describe('buildMemoPrompt — Finding 1 (founderVerdict.caveats reach the real prompt text)', () => {
  it('includes a real caveat string in the prompt when founderVerdict.caveats is non-empty', () => {
    const founderVerdict = founderVerdictWithCaveats([
      'Capital fit is tight: $10k available vs $10k required — thin buffer; no contingency room',
    ])
    const prompt = buildMemoPrompt(THESIS, EVIDENCE, DEBATE, economicsFor(EVIDENCE), MARKET_VERDICT, undefined, founderVerdict)

    expect(prompt).toContain('Capital fit is tight: $10k available vs $10k required — thin buffer; no contingency room')
    expect(prompt).toMatch(/final_considerations section must reference the founder fit caveat/)
  })

  it('includes multiple caveats joined, when more than one is present', () => {
    const founderVerdict = founderVerdictWithCaveats([
      'Timeline is stretched: 8mo minimum for medium-complexity launch — only 2mo buffer in 18mo horizon',
      'Channel fit is partial: Social audience of 6k — moderate launch leverage',
    ])
    const prompt = buildMemoPrompt(THESIS, EVIDENCE, DEBATE, economicsFor(EVIDENCE), MARKET_VERDICT, undefined, founderVerdict)

    expect(prompt).toContain('Timeline is stretched: 8mo minimum for medium-complexity launch — only 2mo buffer in 18mo horizon')
    expect(prompt).toContain('Channel fit is partial: Social audience of 6k — moderate launch leverage')
  })

  it('omits the founder-fit-caveats block entirely when caveats is an empty array (no fabricated caveat)', () => {
    const founderVerdict = founderVerdictWithCaveats([])
    const prompt = buildMemoPrompt(THESIS, EVIDENCE, DEBATE, economicsFor(EVIDENCE), MARKET_VERDICT, undefined, founderVerdict)

    expect(prompt).not.toMatch(/Founder fit caveats/)
    expect(prompt).not.toMatch(/final_considerations section must reference the founder fit caveat/)
  })

  it('omits the founder-fit-caveats block when founderVerdict is null (market-blocked early-return path)', () => {
    const prompt = buildMemoPrompt(THESIS, EVIDENCE, DEBATE, economicsFor(EVIDENCE), MARKET_VERDICT, undefined, null)

    expect(prompt).not.toMatch(/Founder fit caveats/)
  })

  it('omits the founder-fit-caveats block when founderVerdict is not provided at all (backward compatible)', () => {
    const prompt = buildMemoPrompt(THESIS, EVIDENCE, DEBATE, economicsFor(EVIDENCE), MARKET_VERDICT)

    expect(prompt).not.toMatch(/Founder fit caveats/)
  })
})
