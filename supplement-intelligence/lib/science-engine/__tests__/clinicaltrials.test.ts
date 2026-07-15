// ClinicalTrials.gov v2 client tests — Roadmap M2.5. No live network calls —
// mocked global fetch, matching this codebase's established convention.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTrialRegistrationsCount, fetchTrialDesignBreakdown } from '../clinicaltrials'

describe('fetchTrialRegistrationsCount', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns the real totalCount from a successful response', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: () => Promise.resolve({ totalCount: 133, studies: [] }),
    } as Response)
    const count = await fetchTrialRegistrationsCount('berberine')
    expect(count).toBe(133)
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('query.term=berberine')
  })

  it('returns null (never fabricated) on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as Response)
    expect(await fetchTrialRegistrationsCount('creatine')).toBeNull()
  })

  it('returns null (never fabricated) on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchTrialRegistrationsCount('magnesium')).toBeNull()
  })

  it('returns null when totalCount is missing from an otherwise-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response)
    expect(await fetchTrialRegistrationsCount('berberine')).toBeNull()
  })
})

// Roadmap M2.16: Clinical Evidence Engine.
describe('fetchTrialDesignBreakdown', () => {
  afterEach(() => { vi.restoreAllMocks() })

  function mockStudies(studies: unknown[]): Response {
    return { ok: true, json: () => Promise.resolve({ studies }) } as Response
  }

  it('counts real interventional vs observational studyType values and picks the real highest phase', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockStudies([
      { protocolSection: { designModule: { studyType: 'INTERVENTIONAL' }, phaseModule: { phases: ['PHASE2'] } } },
      { protocolSection: { designModule: { studyType: 'INTERVENTIONAL' }, phaseModule: { phases: ['PHASE3'] } } },
      { protocolSection: { designModule: { studyType: 'OBSERVATIONAL' } } },
    ]))

    const result = await fetchTrialDesignBreakdown('berberine')
    expect(result).toEqual({
      trial_study_types: { interventional: 2, observational: 1 },
      trial_max_phase_reached: 'PHASE3',
    })
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('query.term=berberine')
    expect(url).toContain('pageSize=10')
  })

  it('returns undefined max phase (never a fabricated N/A) when no sampled trial reported one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockStudies([
      { protocolSection: { designModule: { studyType: 'INTERVENTIONAL' } } },
    ]))
    const result = await fetchTrialDesignBreakdown('creatine')
    expect(result?.trial_max_phase_reached).toBeUndefined()
    expect(result?.trial_study_types).toEqual({ interventional: 1, observational: 0 })
  })

  it('returns real zero counts (not null) when the sample has no studies at all', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockStudies([]))
    const result = await fetchTrialDesignBreakdown('magnesium')
    expect(result).toEqual({ trial_study_types: { interventional: 0, observational: 0 }, trial_max_phase_reached: undefined })
  })

  it('returns null (never fabricated) on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as Response)
    expect(await fetchTrialDesignBreakdown('berberine')).toBeNull()
  })

  it('returns null on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchTrialDesignBreakdown('berberine')).toBeNull()
  })
})
