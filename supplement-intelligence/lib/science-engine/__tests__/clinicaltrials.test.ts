// ClinicalTrials.gov v2 client tests — Roadmap M2.5. No live network calls —
// mocked global fetch, matching this codebase's established convention.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTrialRegistrationsCount } from '../clinicaltrials'

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
