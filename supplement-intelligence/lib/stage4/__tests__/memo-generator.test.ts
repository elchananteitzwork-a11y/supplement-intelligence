// Regression test for the 2026-07-18 audit Finding 3: display strings must
// distinguish the causally-implicated count from the raw openFDA total,
// with inline context, and label the source as CAERS (not FAERS, the
// drug-only database this codebase does not query).
//
// Only formatRegulatoryLinesForMemo (a pure string-formatting function
// extracted from buildMemoPrompt's inline regulatory block, exported
// additively for testability — see its export comment) is exercised here;
// buildMemoPrompt/generateInvestmentMemo require full InvestmentThesis/
// FullUnitEconomics/MarketVerdict fixtures and call the Anthropic SDK,
// both out of scope for this display-string-only fix.

import { describe, it, expect } from 'vitest'
import { formatRegulatoryLinesForMemo } from '../memo-generator'
import type { RegulatoryIntelligence } from '../../regulatory-engine/types'

const BASE_REG: RegulatoryIntelligence = {
  query_term: 'magnesium',
  ingredient_searched: 'magnesium',
  adverse_events: {
    total_reports: 1799,
    implicated_reports: 48,
    serious_reports: 10,
    hospitalization_count: 6,
    death_count: 4,
    top_reactions: ['Nausea'],
    recent_trend: 'Stable',
    sample_size: 1000,
  },
  recalls: {
    total_recalls: 28,
    implicated_recalls: 1,
    class_i_recalls: 0,
    class_ii_recalls: 1,
    class_iii_recalls: 0,
    recent_recall_descriptions: [],
    sample_size: 28,
  },
  risk_level: 'Medium',
  risk_summary: 'test',
  warning_flags: ['test flag'],
  confidence: 0.7,
  data_sources: ['openFDA'],
  fetched_at: new Date().toISOString(),
  disclaimer: 'test disclaimer',
}

describe('formatRegulatoryLinesForMemo — Finding 3 (implicated vs raw total inline context) + CAERS label', () => {
  it('labels the source CAERS (not FAERS)', () => {
    const lines = formatRegulatoryLinesForMemo(BASE_REG).join('\n')
    expect(lines).toContain('OpenFDA/CAERS')
    expect(lines).not.toContain('FAERS')
  })

  it('CAERS reports line states the implicated count alongside the raw total', () => {
    const lines = formatRegulatoryLinesForMemo(BASE_REG).join('\n')
    expect(lines).toContain('CAERS reports: 48 implicated of 1,799 total')
  })

  it('Recalls line states the implicated count alongside the raw total, not the raw total alone', () => {
    const lines = formatRegulatoryLinesForMemo(BASE_REG).join('\n')
    expect(lines).toContain('Recalls on record: 1 implicated of 28 total (Class I: 0, Class II: 1)')
    expect(lines).not.toMatch(/Recalls on record: 28 \(Class I/)
  })

  it('returns an empty array for null/undefined regulatory intelligence, no crash', () => {
    expect(formatRegulatoryLinesForMemo(null)).toEqual([])
    expect(formatRegulatoryLinesForMemo(undefined)).toEqual([])
  })
})
