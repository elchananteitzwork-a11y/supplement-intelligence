// NIH DSLD client tests — Roadmap M2.17. No live network calls in this
// suite — a mocked global fetch that dispatches on URL, matching this
// codebase's established convention.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMarketDoseDistribution } from '../dsld'

function searchResponse(ids: string[]): Response {
  return { ok: true, json: () => Promise.resolve({ hits: ids.map(_id => ({ _id })) }) } as Response
}

function labelResponse(ingredientRows: unknown[]): Response {
  return { ok: true, json: () => Promise.resolve({ ingredientRows }) } as Response
}

// Dispatches a mocked global fetch by URL: search-filter requests get
// `search`, `/label/{id}` requests get `labelsById[id]` (or a real 404 if
// the test didn't stub that id — surfaces a test-authoring mistake loudly
// rather than silently returning undefined).
function mockDsld(search: Response, labelsById: Record<string, Response>) {
  return vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/search-filter')) return Promise.resolve(search)
    const match = u.match(/\/label\/([^/?]+)/)
    const id = match?.[1]
    if (id && labelsById[id]) return Promise.resolve(labelsById[id])
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
  })
}

describe('fetchMarketDoseDistribution', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('computes real median/min/max mg across a bounded sample of real products (berberine)', async () => {
    mockDsld(searchResponse(['1', '2', '3']), {
      '1': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 500, unit: 'mg' }] }]),
      '2': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 1000, unit: 'mg' }] }]),
      '3': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 1500, unit: 'mg' }] }]),
    })

    const result = await fetchMarketDoseDistribution('berberine')
    expect(result).toEqual({
      market_dose_mg: { median: 1000, min: 500, max: 1500 },
      market_dose_sample_size: 3,
    })
  })

  it('extracts a real dose nested inside a proprietary blend, not just top-level rows', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([
        {
          name: 'Rapid ATP Blend', quantity: [{ quantity: 3000, unit: 'mg' }],
          nestedRows: [
            { name: 'Creatine', quantity: [{ quantity: 1500, unit: 'mg' }] },
            { name: 'Magnesium Creatine Chelate', quantity: [{ quantity: 1500, unit: 'mg' }] },
          ],
        },
      ]),
    })

    const result = await fetchMarketDoseDistribution('creatine')
    // Real regression case (live-observed 2026-07-15): "Magnesium Creatine
    // Chelate" is a distinct compound name, not a registered creatine
    // alias — must never be matched as if it were creatine's own dose.
    expect(result?.market_dose_mg).toEqual({ median: 1500, min: 1500, max: 1500 })
    expect(result?.market_dose_sample_size).toBe(1)
  })

  it('prefers an exact displayName match over an alias match on the same label', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([
        { name: 'Magnesium', quantity: [{ quantity: 200, unit: 'mg' }] },
        { name: 'Magnesium Glycinate', quantity: [{ quantity: 2000, unit: 'mg' }] },   // the compound salt's own total weight, not the elemental amount
      ]),
    })

    const result = await fetchMarketDoseDistribution('magnesium')
    expect(result?.market_dose_mg?.median).toBe(200)
  })

  it('falls back to a registered alias when no bare displayName row exists', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Magnesium Citrate', quantity: [{ quantity: 400, unit: 'mg' }] }]),
    })

    const result = await fetchMarketDoseDistribution('magnesium')
    expect(result?.market_dose_mg?.median).toBe(400)
  })

  it('normalizes real g/mcg units to mg, and excludes IU and "Not Present" placeholder rows (never a fabricated conversion or a real-zero for an undisclosed amount)', async () => {
    mockDsld(searchResponse(['1', '2', '3']), {
      '1': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 0.5, unit: 'g' }] }]),      // 500mg real
      '2': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 100, unit: 'IU' }] }]),      // excluded — not a mass
      '3': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 0, unit: 'NP' }] }]),        // excluded — undisclosed blend amount, not a real zero
    })

    const result = await fetchMarketDoseDistribution('berberine')
    expect(result).toEqual({
      market_dose_mg: { median: 500, min: 500, max: 500 },
      market_dose_sample_size: 1,
    })
  })

  it('adds the real, cited RDA comparison for magnesium only — median below the range', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Magnesium', quantity: [{ quantity: 100, unit: 'mg' }] }]),
    })
    const result = await fetchMarketDoseDistribution('magnesium')
    expect(result?.rda_range_mg).toEqual({ min: 310, max: 420 })
    expect(result?.market_dose_vs_rda).toBe('Below')
  })

  it('classifies a real magnesium median within the RDA range as Within, and above it as Above', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Magnesium', quantity: [{ quantity: 350, unit: 'mg' }] }]),
    })
    expect((await fetchMarketDoseDistribution('magnesium'))?.market_dose_vs_rda).toBe('Within')

    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Magnesium', quantity: [{ quantity: 500, unit: 'mg' }] }]),
    })
    expect((await fetchMarketDoseDistribution('magnesium'))?.market_dose_vs_rda).toBe('Above')
  })

  it('never populates rda_range_mg/market_dose_vs_rda for a non-magnesium ingredient', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Creatine', quantity: [{ quantity: 5000, unit: 'mg' }] }]),
    })
    const result = await fetchMarketDoseDistribution('creatine')
    expect(result?.rda_range_mg).toBeUndefined()
    expect(result?.market_dose_vs_rda).toBeUndefined()
  })

  it('returns a real, honest zero sample size (not null) when the search finds no real products', async () => {
    mockDsld(searchResponse([]), {})
    expect(await fetchMarketDoseDistribution('berberine')).toEqual({ market_dose_sample_size: 0 })
  })

  it('returns a real, honest zero sample size when every fetched product lacks an extractable dose', async () => {
    mockDsld(searchResponse(['1']), {
      '1': labelResponse([{ name: 'Berberine', quantity: [{ quantity: 100, unit: 'IU' }] }]),
    })
    expect(await fetchMarketDoseDistribution('berberine')).toEqual({ market_dose_sample_size: 0 })
  })

  it('returns null (never fabricated) when the real search-filter call itself fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as Response)
    expect(await fetchMarketDoseDistribution('berberine')).toBeNull()
  })

  it('returns null on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await fetchMarketDoseDistribution('berberine')).toBeNull()
  })

  it('returns null (never a fabricated profile) for an ingredient outside the real registry', async () => {
    expect(await fetchMarketDoseDistribution('ashwagandha')).toBeNull()
  })

  it('bounds the real detail-fetch sample to 20 products even when far more real products match', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(i))
    const labelsById = Object.fromEntries(ids.map(id => [id, labelResponse([{ name: 'Magnesium', quantity: [{ quantity: 200, unit: 'mg' }] }])]))
    const fetchSpy = mockDsld(searchResponse(ids), labelsById)

    const result = await fetchMarketDoseDistribution('magnesium')
    expect(result?.market_dose_sample_size).toBe(20)
    expect(fetchSpy).toHaveBeenCalledTimes(21)   // 1 search-filter + 20 bounded label details
  })
})
