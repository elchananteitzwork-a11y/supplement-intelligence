// Regression test for the 2026-07-18 audit Finding 4: checkFdaRegulatoryRisk
// must surface the regulatory engine's own warning_flags (sample-size /
// causal-implication disclosure) in its data_used output — this is the one
// artifact that can hard-block a founder's analysis, so the transparency
// built into lib/regulatory-engine/index.ts needs to actually reach it.
// Trigger logic/thresholds are unchanged and not the subject of this test.

import { describe, it, expect } from 'vitest'
import { checkFdaRegulatoryRisk } from '../kill-switches'
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
