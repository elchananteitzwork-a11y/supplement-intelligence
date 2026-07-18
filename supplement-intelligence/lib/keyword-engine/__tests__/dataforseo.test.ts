// Regression tests for two audit-confirmed correctness bugs in the
// keywords_data/google_ads/search_volume/live fallback path (2026-07-17):
//
// Finding 1 (High): this endpoint's real `competition` field is a STRING
// enum (LOW/MEDIUM/HIGH), not the 0-1 float KeywordMetric.competition is
// documented/used as everywhere else. The old code assigned the raw string
// straight into KeywordMetric.competition, which made
// `computeOpportunityScore()`'s `1 - m.competition` evaluate to NaN for
// every keyword sourced via this fallback. The real numeric field on this
// endpoint is `competition_index` (0-100 scale) — this suite proves it's
// now normalized to 0-1 and opportunity_score is a real, finite number.
//
// Finding 2 (Low): this endpoint's real `low_top_of_page_bid` /
// `high_top_of_page_bid` fields were declared but never mapped into
// KeywordMetric.top_of_page_bid_range — real, no-extra-cost data was being
// silently discarded.
//
// No live network calls — a mocked global fetch, matching this codebase's
// established convention (see dataforseo-trends.test.ts, dsld.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataForSeoKeywordProvider } from '../dataforseo'
import { computeOpportunityScore } from '../derive'

const ORIGINAL_ENV = { ...process.env }

// related_keywords/live — return a real success shape, but with zero items,
// so DataForSeoKeywordProvider.fetch() falls all the way through to the
// keywords_data/google_ads/search_volume/live fallback for every broadened
// candidate it tries.
function emptyRelatedKeywordsResponse(): Response {
  return {
    ok: true,
    json: async () => ({ tasks: [{ status_code: 20000, result: [{ items: [] }] }] }),
  } as Response
}

// keywords_data/google_ads/search_volume/live — real response shape
// (CONFIRMED VIA LIVE CALL): `competition` is a string enum, the real
// numeric field is `competition_index` (0-100), and low/high top-of-page
// bid are both present.
function searchVolumeResponse(row: Record<string, unknown>): Response {
  return {
    ok: true,
    json: async () => ({ tasks: [{ status_code: 20000, result: [row] }] }),
  } as Response
}

function mockFetchByEndpoint(svResponse: Response) {
  return vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('related_keywords')) return Promise.resolve(emptyRelatedKeywordsResponse())
    if (u.includes('search_volume')) return Promise.resolve(svResponse)
    throw new Error(`unexpected fetch URL in test: ${u}`)
  })
}

describe('DataForSeoKeywordProvider — search_volume/live fallback mapping (2026-07-17 audit fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATAFORSEO_LOGIN = 'test-login'
    process.env.DATAFORSEO_PASSWORD = 'test-password'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('Finding 1: normalizes real competition_index (0-100) to KeywordMetric.competition (0-1), never the raw LOW/MEDIUM/HIGH string', async () => {
    mockFetchByEndpoint(searchVolumeResponse({
      keyword: 'magnesium glycinate sleep supplement',
      search_volume: 2400,
      competition: 'LOW',
      competition_index: 6,
      cpc: 1.2,
    }))

    const result = await new DataForSeoKeywordProvider().fetch('magnesium glycinate sleep supplement')
    expect(result).not.toBeNull()
    const metric = result?.top_buying[0]
    expect(metric).toBeDefined()

    // Real regression: normalized 0-1 value, not the raw string, not NaN.
    expect(metric?.competition).toBe(0.06)
    expect(typeof metric?.competition).toBe('number')
  })

  it('Finding 1 regression: computeOpportunityScore() is a real finite number for a search_volume-fallback-shaped fixture (old bug: 1 - "LOW" === NaN)', async () => {
    mockFetchByEndpoint(searchVolumeResponse({
      keyword: 'creatine monohydrate gummies',
      search_volume: 14_800,
      competition: 'HIGH',
      competition_index: 82,
      cpc: 0.95,
    }))

    const result = await new DataForSeoKeywordProvider().fetch('creatine monohydrate gummies')
    const metric = result?.top_buying[0]
    expect(metric).toBeDefined()

    // Prove the OLD bug directly: 1 - "HIGH" (the raw string) is NaN.
    expect(1 - ('HIGH' as unknown as number)).toBeNaN()

    // Prove the FIX: computeOpportunityScore over the real mapped metric is
    // a real, finite, non-NaN number.
    const score = computeOpportunityScore(metric!)
    expect(score).not.toBeNull()
    expect(Number.isFinite(score)).toBe(true)
    expect(Number.isNaN(score)).toBe(false)
  })

  it('Finding 1: competition is honest null (never guessed) when competition_index is absent', async () => {
    mockFetchByEndpoint(searchVolumeResponse({
      keyword: 'berberine supplement',
      search_volume: 900,
      competition: 'MEDIUM',
      // competition_index deliberately absent
      cpc: 0.5,
    }))

    const result = await new DataForSeoKeywordProvider().fetch('berberine supplement')
    expect(result?.top_buying[0]?.competition).toBeNull()
  })

  it('Finding 2: maps real low/high top-of-page bid into top_of_page_bid_range when both are present', async () => {
    mockFetchByEndpoint(searchVolumeResponse({
      keyword: 'ashwagandha capsules',
      search_volume: 5400,
      competition: 'LOW',
      competition_index: 12,
      cpc: 0.8,
      low_top_of_page_bid: 0.5,
      high_top_of_page_bid: 2.85,
    }))

    const result = await new DataForSeoKeywordProvider().fetch('ashwagandha capsules')
    expect(result?.top_buying[0]?.top_of_page_bid_range).toEqual({ low: 0.5, high: 2.85 })
  })

  it('Finding 2: never fabricates one side of the bid range when only one value is present', async () => {
    mockFetchByEndpoint(searchVolumeResponse({
      keyword: 'collagen peptides',
      search_volume: 3200,
      competition: 'MEDIUM',
      competition_index: 40,
      cpc: 0.7,
      low_top_of_page_bid: 0.6,
      // high_top_of_page_bid deliberately absent
    }))

    const result = await new DataForSeoKeywordProvider().fetch('collagen peptides')
    expect(result?.top_buying[0]?.top_of_page_bid_range).toBeNull()
  })
})
