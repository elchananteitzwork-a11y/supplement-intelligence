// PubMed E-utilities client tests — Roadmap M2.5.
// No live network calls in this suite — a mocked global fetch, matching
// this codebase's established convention (see meta-ads.test.ts).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPublicationCountsByYear } from '../pubmed'

function mockEsearchResponse(count: string): Response {
  return {
    ok:   true,
    json: () => Promise.resolve({ esearchresult: { count } }),
  } as Response
}

describe('fetchPublicationCountsByYear', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('makes one real request per complete calendar year and parses each real count', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockEsearchResponse('683'))
    const now = new Date('2026-07-13T00:00:00Z')
    const counts = await fetchPublicationCountsByYear('berberine', 3, now)

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    // Years 2023, 2024, 2025 — the current in-progress year (2026) excluded.
    expect(counts).toEqual({ '2023': 683, '2024': 683, '2025': 683 })
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('db=pubmed')
    expect(url).toContain('term=berberine')
  }, 10_000)

  it('excludes the current, still-in-progress calendar year from the requested range', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockEsearchResponse('100'))
    const now = new Date('2026-07-13T00:00:00Z')
    await fetchPublicationCountsByYear('creatine', 2, now)
    const urls = fetchSpy.mock.calls.map(c => c[0] as string)
    expect(urls.some(u => u.includes('mindate=2026'))).toBe(false)
    expect(urls.some(u => u.includes('mindate=2025'))).toBe(true)
    expect(urls.some(u => u.includes('mindate=2024'))).toBe(true)
  }, 10_000)

  it('omits a year (never fabricates a count) when that year\'s request fails, but keeps the years that succeeded', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockEsearchResponse('500'))
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) } as Response)
    const now = new Date('2026-07-13T00:00:00Z')
    const counts = await fetchPublicationCountsByYear('magnesium', 2, now)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(counts).toEqual({ '2024': 500 })
  }, 10_000)

  it('returns null (never an empty fabricated object) when every year fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const counts = await fetchPublicationCountsByYear('berberine', 2, new Date('2026-07-13T00:00:00Z'))
    expect(counts).toBeNull()
  }, 10_000)
})
