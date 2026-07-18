// Regression test for the 2026-07-18 audit Finding 2: regulatory-line
// formatting must live in exactly one place (lib/evidence/format.ts) so
// stage2, stage3, and stage4 cannot silently drift apart again on the next
// edit.
//
// lib/stage4/memo-generator.ts's formatRegulatoryLinesForMemo,
// lib/stage2/thesis-generator.ts's buildEvidenceSummary, and
// lib/stage3/adversarial.ts's formatEvidenceForPrompt all now delegate to
// this shared function — this test confirms memo-generator.ts's delegation
// produces identical output to calling the shared function directly. See
// lib/stage2/__tests__/thesis-generator.test.ts and
// lib/stage3/__tests__/adversarial.test.ts for the equivalent
// identical-output cross-checks for the other two callers.

import { describe, it, expect } from 'vitest'
import { formatRegulatoryIntelligence } from '../format'
import { formatRegulatoryLinesForMemo } from '../../stage4/memo-generator'
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

describe('formatRegulatoryIntelligence — shared regulatory formatter (Finding 2)', () => {
  it('produces the expected CAERS/recalls/flags lines', () => {
    const lines = formatRegulatoryIntelligence(BASE_REG)
    expect(lines.join('\n')).toContain('Regulatory risk (OpenFDA/CAERS): Medium — test')
    expect(lines.join('\n')).toContain('CAERS reports: 48 implicated of 1,799 total')
    expect(lines.join('\n')).toContain('Recalls on record: 1 implicated of 28 total (Class I: 0, Class II: 1)')
    expect(lines.join('\n')).toContain('Regulatory flags: test flag')
  })

  it('returns an empty array for null/undefined, no crash', () => {
    expect(formatRegulatoryIntelligence(null)).toEqual([])
    expect(formatRegulatoryIntelligence(undefined)).toEqual([])
  })

  it('memo-generator.ts\'s formatRegulatoryLinesForMemo produces output identical to the shared function for the same input', () => {
    expect(formatRegulatoryLinesForMemo(BASE_REG)).toEqual(formatRegulatoryIntelligence(BASE_REG))
    expect(formatRegulatoryLinesForMemo(null)).toEqual(formatRegulatoryIntelligence(null))
  })
})
