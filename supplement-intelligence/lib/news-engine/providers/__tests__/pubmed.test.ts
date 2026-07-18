// Regression test for the 2026-07-17 live-audit Finding 4: real PubMed
// esummary responses use phase-specific clinical-trial pubtypes
// (e.g. 'Clinical Trial, Phase II') instead of, or alongside, the bare
// 'Clinical Trial' pubtype. Live-confirmed via real PubMed esummary
// records during the audit — pickStudyType's exact-string matching
// previously returned `undefined` for these, understating real evidence
// quality. This list/function is reused as-is by
// lib/science-engine/pubmed.ts (see that file's import), so fixing it here
// fixes both call sites.

import { describe, it, expect } from 'vitest'
import { STUDY_TYPE_PRIORITY, pickStudyType } from '../pubmed'

describe('STUDY_TYPE_PRIORITY / pickStudyType — Finding 4 (phase-specific clinical trial pubtypes)', () => {
  it('recognizes real phase-specific pubtypes that previously resolved to undefined', () => {
    // Real NLM pubtype strings, live-confirmed on real PubMed records.
    expect(pickStudyType(['Journal Article', 'Clinical Trial, Phase II'])).toBe('Clinical Trial, Phase II')
    expect(pickStudyType(['Clinical Trial, Phase I'])).toBe('Clinical Trial, Phase I')
    expect(pickStudyType(['Clinical Trial, Phase III'])).toBe('Clinical Trial, Phase III')
    expect(pickStudyType(['Clinical Trial, Phase IV'])).toBe('Clinical Trial, Phase IV')
  })

  it('a bare "Clinical Trial" pubtype still resolves as before (no regression)', () => {
    expect(pickStudyType(['Journal Article', 'Clinical Trial'])).toBe('Clinical Trial')
  })

  it('a higher-priority real pubtype (RCT) still outranks a phase-specific label on the same record', () => {
    expect(pickStudyType(['Randomized Controlled Trial', 'Clinical Trial, Phase III'])).toBe('Randomized Controlled Trial')
  })

  it('a genuinely unrecognized pubtype with no clinical-trial label still returns undefined (no guessing)', () => {
    expect(pickStudyType(['Journal Article', 'Letter'])).toBeUndefined()
  })

  it('returns undefined for an empty/undefined pubtype list', () => {
    expect(pickStudyType(undefined)).toBeUndefined()
    expect(pickStudyType([])).toBeUndefined()
  })

  it('all four phase-specific entries are present in STUDY_TYPE_PRIORITY, ranked at the same tier as bare Clinical Trial', () => {
    for (const phase of ['I', 'II', 'III', 'IV']) {
      expect(STUDY_TYPE_PRIORITY).toContain(`Clinical Trial, Phase ${phase}`)
    }
    const clinicalTrialRank = STUDY_TYPE_PRIORITY.indexOf('Clinical Trial')
    for (const phase of ['I', 'II', 'III', 'IV']) {
      const rank = STUDY_TYPE_PRIORITY.indexOf(`Clinical Trial, Phase ${phase}`)
      // Ranked immediately after bare 'Clinical Trial', still ahead of
      // lower-evidence-tier types like 'Multicenter Study'/'Review'.
      expect(rank).toBeGreaterThan(clinicalTrialRank)
      expect(rank).toBeLessThan(STUDY_TYPE_PRIORITY.indexOf('Multicenter Study'))
    }
  })
})
