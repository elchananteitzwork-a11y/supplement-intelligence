// Regression test for the 2026-07-18 audit Finding 3: display strings must
// distinguish the causally-implicated count from the raw openFDA total,
// with inline context, instead of rendering the true API total next to an
// implicated-only breakdown with no explanation.
//
// Only formatEvidenceForPrompt (a pure string-formatting function, exported
// additively for testability — see its export comment) is exercised here;
// runAdversarialDebate itself calls the Anthropic SDK and is out of scope
// for this display-string-only fix.

import { describe, it, expect } from 'vitest'
import { formatEvidenceForPrompt } from '../adversarial'
import type { Stage1Evidence } from '../../evidence/adapter'
import type { RegulatoryIntelligence } from '../../regulatory-engine/types'

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
  warning_flags: [],
  confidence: 0.7,
  data_sources: ['openFDA'],
  fetched_at: new Date().toISOString(),
  disclaimer: 'test disclaimer',
}

describe('formatEvidenceForPrompt — Finding 3 (implicated vs raw total inline context)', () => {
  it('CAERS line states the implicated count alongside the raw total, not the raw total alone', () => {
    const text = formatEvidenceForPrompt(regEvidence(BASE_REG))
    expect(text).toContain('CAERS: 48 implicated of 1,799 total reports')
    // Must not render the bare, unexplained raw total the way the pre-fix
    // string did ("CAERS: 1,799 total reports ...").
    expect(text).not.toMatch(/CAERS: 1,799 total reports ·/)
  })

  it('Recalls line states the implicated count alongside the raw total, not the raw total alone', () => {
    const text = formatEvidenceForPrompt(regEvidence(BASE_REG))
    expect(text).toContain('Recalls: 1 implicated of 28 total (Class I: 0, Class II: 1)')
    expect(text).not.toMatch(/Recalls: 28 \(Class I/)
  })

  it('omits regulatory lines entirely when there is no regulatory evidence (no crash)', () => {
    const text = formatEvidenceForPrompt(REQUIRED_FIELDS)
    expect(text).not.toContain('CAERS')
    expect(text).not.toContain('Recalls')
  })
})
