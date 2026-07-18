// Manufacturer recall-history lookup tests — Roadmap M2.20 (narrowed from
// "Manufacturing Credibility" to recall history only). No live network
// calls — mocked global fetch, matching this codebase's established
// convention (see lib/science-engine/__tests__/clinicaltrials.test.ts).
// provider-cache is not mocked: in the test environment SUPABASE_* env vars
// are absent, so cacheGet/cacheSet are real no-ops (getClient() returns
// null), exactly like production behaves with caching disabled.

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchManufacturerRecallHistory,
  fetchManufacturerRecallHistoryBatch,
  toManufacturerRecallFlags,
  MANUFACTURER_RECALL_DISCLAIMER,
} from '../manufacturer-credibility'

// Real-shaped fixture, modeled on a real live-confirmed openFDA
// food/enforcement.json record for search=recalling_firm:"Nestle Health Science"
// (M2.20 research call, 2026-07-17). `meta.results.total` defaults to
// results.length (i.e. "the fetched page is the whole real result set") —
// pass an explicit `total` to model the Finding-3-class case where the real
// API total exceeds what was fetched on this page (2026-07-18 audit fix).
function mockEnforcementResults(results: Array<Record<string, string>>, total = results.length): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ meta: { results: { skip: 0, limit: 25, total } }, results }),
  } as Response
}

function mockNotFound(): Response {
  return { ok: false, status: 404, json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }) } as Response
}

const REAL_SHAPED_RECORD_CLASS_II = {
  status: 'Ongoing',
  city: 'Bridgewater',
  state: 'NJ',
  country: 'United States',
  classification: 'Class II',
  product_type: 'Food',
  event_id: '95710',
  recalling_firm: 'NESTLE HEALTH SCIENCE',
  recall_number: 'F-0261-2025',
  product_description: 'Nestle Health Services Nutren 2.0 kCal/mL, Calorically Dense Complete Nutrition with Fiber Unflavored.',
  reason_for_recall: 'Labeling Error.  Nutren 2.0 UltraPak pouches were mislabeled with an Isosource 1.5 label.',
  recall_initiation_date: '20241105',
}

const REAL_SHAPED_RECORD_CLASS_III = {
  status: 'Terminated',
  city: 'Bridgewater',
  state: 'NJ',
  country: 'United States',
  classification: 'Class III',
  product_type: 'Food',
  event_id: '93707',
  recalling_firm: 'Nestle Product Technology Center - Nestle Health Science',
  recall_number: 'F-0803-2024',
  product_description: 'Solgar, Triple Strength, Shellfish -Free, Glucosamine Chondroitin MSM, 120 Tablets per bottle.',
  reason_for_recall: 'Nestle Health Science has initiated a recall of Solgar Glucosamine Chondroitin due to packaging error.',
  recall_initiation_date: '20231222',
}

const REAL_SHAPED_RECORD_CLASS_I = {
  status: 'Ongoing',
  classification: 'Class I',
  product_type: 'Food',
  event_id: '99999',
  recalling_firm: 'Pharmatech LLC',
  recall_number: 'F-0001-2026',
  product_description: 'Undeclared allergen supplement product.',
  reason_for_recall: 'Product contains undeclared milk allergen, life-threatening risk for allergic consumers.',
  recall_initiation_date: '20260101',
}

describe('fetchManufacturerRecallHistory', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns real counts and classification for a firm with real recalls found', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_II, REAL_SHAPED_RECORD_CLASS_III]),
    )

    const result = await fetchManufacturerRecallHistory('Nestle Health Science')

    expect(result).toBeDefined()
    expect(result?.firm_name_searched).toBe('Nestle Health Science')
    expect(result?.total_recalls).toBe(2)
    expect(result?.class_i_recalls).toBe(0)
    expect(result?.class_ii_recalls).toBe(1)
    expect(result?.class_iii_recalls).toBe(1)
    expect(result?.recent_recall_descriptions.length).toBe(2)
    expect(result?.disclaimer).toBe(MANUFACTURER_RECALL_DISCLAIMER)

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('food/enforcement.json')
    expect(url).toContain(encodeURIComponent('recalling_firm:"Nestle Health Science"'))
  })

  it('counts a real Class I recall correctly', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_I]))
    const result = await fetchManufacturerRecallHistory('Pharmatech LLC')
    expect(result?.class_i_recalls).toBe(1)
    expect(result?.total_recalls).toBe(1)
  })

  it('returns undefined (never fabricated) when the firm is not found (404 / empty result)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockNotFound())
    const result = await fetchManufacturerRecallHistory('A Totally Fake Firm That Does Not Exist Inc')
    expect(result).toBeUndefined()
  })

  it('returns undefined when the response has an empty results array', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockEnforcementResults([]))
    const result = await fetchManufacturerRecallHistory('Some Firm With No Recalls LLC')
    expect(result).toBeUndefined()
  })

  it('handles a blank firm name gracefully — returns undefined, never calls fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await fetchManufacturerRecallHistory('   ')
    expect(result).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('handles an empty-string firm name gracefully', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await fetchManufacturerRecallHistory('')
    expect(result).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('handles malformed (non-string) input gracefully without throwing', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    // @ts-expect-error — deliberately passing a malformed value to verify defensive handling
    const result = await fetchManufacturerRecallHistory(undefined)
    expect(result).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns undefined (never fabricated) on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const result = await fetchManufacturerRecallHistory('Nestle Health Science')
    expect(result).toBeUndefined()
  })

  it('returns undefined on a non-200, non-404 error response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
    const result = await fetchManufacturerRecallHistory('Nestle Health Science')
    expect(result).toBeUndefined()
  })

  // Finding 3 fix (2026-07-18 audit) — same undercount bug class already
  // fixed in lib/regulatory-engine/index.ts's fetchRecalls(): total_recalls
  // must reflect the real openFDA meta.total, not a sum of only the fetched
  // `limit=25` page.
  it('uses the real openFDA meta.total for total_recalls, not a sum of only the fetched page', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      // Real case: a firm has 40 real recalls, but only 2 are returned on
      // this fetched page — total_recalls must reflect the honest 40.
      mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_II, REAL_SHAPED_RECORD_CLASS_III], 40),
    )
    const result = await fetchManufacturerRecallHistory('Nestle Health Science')
    expect(result?.total_recalls).toBe(40)
    // Per-class breakdown remains derived from the fetched page (openFDA has
    // no per-classification total endpoint) — unaffected by this fix.
    expect(result?.class_ii_recalls).toBe(1)
    expect(result?.class_iii_recalls).toBe(1)
  })
})

describe('toManufacturerRecallFlags', () => {
  it('reduces real class counts to a compact flags array', () => {
    const flags = toManufacturerRecallFlags({
      firm_name_searched:         'Nestle Health Science',
      total_recalls:              2,
      class_i_recalls:            0,
      class_ii_recalls:           1,
      class_iii_recalls:          1,
      recent_recall_descriptions: [],
      data_source:                'https://api.fda.gov/food/enforcement.json',
      fetched_at:                 new Date().toISOString(),
      disclaimer:                 MANUFACTURER_RECALL_DISCLAIMER,
    })
    expect(flags).toEqual([
      { class: 'Class II', count: 1 },
      { class: 'Class III', count: 1 },
    ])
  })

  it('returns undefined for undefined history', () => {
    expect(toManufacturerRecallFlags(undefined)).toBeUndefined()
  })
})

describe('fetchManufacturerRecallHistoryBatch', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('dedupes identical firm names and issues exactly one call per unique firm', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_II]),
    )

    const map = await fetchManufacturerRecallHistoryBatch([
      'Nestle Health Science',
      'Nestle Health Science',
      'Nestle Health Science',
      undefined,
      '',
      '  ',
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(map.size).toBe(1)
    expect(map.get('Nestle Health Science')?.total_recalls).toBe(1)
  })

  it('resolves distinct firm names independently', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(encodeURIComponent('recalling_firm:"Pharmatech LLC"'))) {
        return mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_I])
      }
      return mockNotFound()
    })

    const map = await fetchManufacturerRecallHistoryBatch(['Pharmatech LLC', 'Clean Firm With No Recalls Inc'])
    expect(map.get('Pharmatech LLC')?.class_i_recalls).toBe(1)
    expect(map.get('Clean Firm With No Recalls Inc')).toBeUndefined()
  })

  it('returns an empty map for an all-blank input list', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const map = await fetchManufacturerRecallHistoryBatch([undefined, '', '   '])
    expect(map.size).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Locks in the Map-key contract that caller sites (keepa.ts, competition.ts)
  // rely on: whitespace-padded variants of the same real firm name dedupe to
  // one call and resolve under the trimmed key, so a caller looking the
  // result up with `firmName.trim()` never misses its own fetched data.
  it('keys the returned map by trimmed firm name and dedupes whitespace-padded variants', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      mockEnforcementResults([REAL_SHAPED_RECORD_CLASS_II]),
    )

    const map = await fetchManufacturerRecallHistoryBatch([
      '  Nestle Health Science  ',
      'Nestle Health Science',
      'Nestle Health Science\t',
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(map.size).toBe(1)
    expect(map.has('Nestle Health Science')).toBe(true)
    expect(map.get('Nestle Health Science')?.total_recalls).toBe(1)
  })
})
