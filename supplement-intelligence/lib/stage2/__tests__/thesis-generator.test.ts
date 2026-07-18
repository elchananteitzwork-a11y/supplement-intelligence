// Regression test for the 2026-07-18 audit Finding 3: display strings must
// distinguish the causally-implicated count from the raw openFDA total,
// with inline context.
//
// Only buildEvidenceSummary (a pure string-formatting function, exported
// additively for testability — see its export comment) is exercised here;
// generateTheses itself calls the Anthropic SDK and is out of scope for
// this display-string-only fix.
//
// 2026-07-18 audit Finding 2 follow-up: buildEvidenceSummary's regulatory
// lines now delegate to the shared lib/evidence/format.ts implementation
// (the same one lib/stage4/memo-generator.ts's formatRegulatoryLinesForMemo
// uses), so the expected strings below match that shared function's real
// output — not the old, independently-drifting inline copy this file used
// to maintain.

import { describe, it, expect } from 'vitest'
import { buildEvidenceSummary } from '../thesis-generator'
import { formatRegulatoryIntelligence } from '../../evidence/format'
import { formatRegulatoryLinesForMemo } from '../../stage4/memo-generator'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { RegulatoryIntelligence } from '../../regulatory-engine/types'

function regEvidence(reg: RegulatoryIntelligence): Stage1Evidence {
  return {
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
    regulatory_intelligence: {
      value: reg,
      source: 'openFDA',
      source_type: 'primary_measurement',
      freshness_date: new Date().toISOString(),
    },
  }
}

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

describe('buildEvidenceSummary — Finding 3 (implicated vs raw total inline context) + CAERS label', () => {
  it('CAERS line (not FAERS) states the implicated count alongside the raw total', () => {
    const text = buildEvidenceSummary(regEvidence(BASE_REG), 'magnesium supplement')
    expect(text).toContain('CAERS reports: 48 implicated of 1,799 total')
    expect(text).not.toContain('FAERS')
  })

  it('Recalls line states the implicated count alongside the raw total, not the raw total alone', () => {
    const text = buildEvidenceSummary(regEvidence(BASE_REG), 'magnesium supplement')
    expect(text).toContain('Recalls on record: 1 implicated of 28 total (Class I: 0, Class II: 1)')
    expect(text).not.toMatch(/Recalls on record: 28 total \(Class I/)
  })

  it('includes the shared formatter\'s warning-flags line', () => {
    const text = buildEvidenceSummary(regEvidence(BASE_REG), 'magnesium supplement')
    expect(text).toContain('Regulatory flags: test flag')
  })
})

describe('buildEvidenceSummary — regulatory formatting is delegated to the shared formatter (2026-07-18 audit Finding 2)', () => {
  it('produces regulatory lines identical to lib/evidence/format.ts\'s formatRegulatoryIntelligence for the same input', () => {
    const text = buildEvidenceSummary(regEvidence(BASE_REG), 'magnesium supplement')
    const expectedLines = formatRegulatoryIntelligence(BASE_REG)
    for (const line of expectedLines) {
      expect(text).toContain(line)
    }
  })

  it('thesis-generator.ts and memo-generator.ts produce identical formatted regulatory text for the same input (both delegate to the shared function)', () => {
    const text = buildEvidenceSummary(regEvidence(BASE_REG), 'magnesium supplement')
    const memoLines = formatRegulatoryLinesForMemo(BASE_REG)
    for (const line of memoLines) {
      expect(text).toContain(line)
    }
    // And both delegate to the exact same underlying implementation.
    expect(formatRegulatoryLinesForMemo(BASE_REG)).toEqual(formatRegulatoryIntelligence(BASE_REG))
  })

  it('omits regulatory lines entirely when no regulatory_intelligence is present', () => {
    const evidence: Stage1Evidence = {
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
    const text = buildEvidenceSummary(evidence, 'magnesium supplement')
    expect(text).not.toContain('Regulatory risk')
  })
})
