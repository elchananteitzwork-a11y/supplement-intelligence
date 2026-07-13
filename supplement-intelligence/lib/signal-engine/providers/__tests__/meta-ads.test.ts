// Meta Ads provider tests — V2 Blueprint §5 / Roadmap M1.5, Milestone 5;
// data source replaced 2026-07-13 (Apify facebook-ads-scraper actor
// replaces the direct Meta Graph API — see the provider's own header
// comment for why: Meta's Ad Library API is scoped to political/social-
// issue ads only, confirmed against Meta's own current documentation, not
// a fixable setup gap).
//
// Three layers: pure scoring-function tests (unchanged from the original
// Meta API integration — computeSignals and everything it calls never
// changed), normalizeApifyAd tests (the actual surface area this migration
// touched), and class-behavior tests against a mocked global fetch, now
// shaped as Apify's run-sync-get-dataset-items response (a bare JSON array)
// instead of Meta's {data, error} wrapper. No live network call is made
// anywhere in this suite — Apify credits were exhausted at implementation
// time, per explicit instruction not to spend them here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MetaAdsProvider, adCountToMetaSignal, metaScore, dataConfidence, MIN_AD_SAMPLE, PAGE_LIMIT,
  computeAdStartRange, computeRecentAdStartPct, computeAdDurations, normalizeApifyAd,
} from '../meta-ads'

describe('normalizeApifyAd — the actual surface area this migration touched', () => {
  it('maps camelCase Apify fields onto the internal MetaAd shape', () => {
    const normalized = normalizeApifyAd({
      adArchiveID: 'ad-123',
      pageID: 'page-456',
      pageName: 'Acme Supplements',
      startDateFormatted: '2026-06-01T00:00:00.000Z',
      endDateFormatted: '2026-06-15T00:00:00.000Z',
      publisherPlatform: ['facebook', 'instagram'],
    })
    expect(normalized.id).toBe('ad-123')
    expect(normalized.page_id).toBe('page-456')
    expect(normalized.page_name).toBe('Acme Supplements')
    expect(normalized.ad_delivery_start_time).toBe('2026-06-01T00:00:00.000Z')
    expect(normalized.ad_delivery_stop_time).toBe('2026-06-15T00:00:00.000Z')
    expect(normalized.publisher_platforms).toEqual(['facebook', 'instagram'])
  })

  it('falls back to snake_case field name variants when camelCase is absent', () => {
    const normalized = normalizeApifyAd({
      ad_archive_id: 'ad-789',
      page_id: 'page-999',
      page_name: 'Beta Beauty',
      publisher_platform: ['instagram'],
    })
    expect(normalized.id).toBe('ad-789')
    expect(normalized.page_id).toBe('page-999')
    expect(normalized.page_name).toBe('Beta Beauty')
    expect(normalized.publisher_platforms).toEqual(['instagram'])
  })

  it('parses unix-seconds timestamps into ISO strings', () => {
    // 2026-06-01T00:00:00Z in unix seconds
    const unixSeconds = Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000)
    const normalized = normalizeApifyAd({ startDate: unixSeconds })
    expect(normalized.ad_delivery_start_time).toBe('2026-06-01T00:00:00.000Z')
  })

  it('parses unix-milliseconds timestamps into ISO strings (not misread as seconds)', () => {
    const unixMs = Date.parse('2026-06-01T00:00:00.000Z')
    const normalized = normalizeApifyAd({ startDate: unixMs })
    expect(normalized.ad_delivery_start_time).toBe('2026-06-01T00:00:00.000Z')
  })

  it('leaves a field undefined (never fabricated) when no variant is present or the date is unparseable', () => {
    const normalized = normalizeApifyAd({ startDate: 'not-a-real-date' })
    expect(normalized.ad_delivery_start_time).toBeUndefined()
    expect(normalized.id).toBeUndefined()
    expect(normalized.page_id).toBeUndefined()
  })

  it('prefers the formatted date string over the raw timestamp when both are present', () => {
    const normalized = normalizeApifyAd({
      startDateFormatted: '2026-06-01T00:00:00.000Z',
      startDate: 0, // would parse to 1970 if wrongly preferred
    })
    expect(normalized.ad_delivery_start_time).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('adCountToMetaSignal', () => {
  it('classifies ad count into High/Medium/Low tiers', () => {
    expect(adCountToMetaSignal(500)).toBe('High')
    expect(adCountToMetaSignal(200)).toBe('High')
    expect(adCountToMetaSignal(199)).toBe('Medium')
    expect(adCountToMetaSignal(50)).toBe('Medium')
    expect(adCountToMetaSignal(49)).toBe('Low')
    expect(adCountToMetaSignal(0)).toBe('Low')
  })
})

describe('metaScore', () => {
  it('the ad-count component is 0 for zero ads (advertiser component still contributes its floor value — this combination is unreachable in the live fetch() path, which gates on MIN_AD_SAMPLE before computeSignals is ever called)', () => {
    // adScore(0) = 0; advertiserScore(0) floors at 2 (the ternary chain's
    // final fallback) — 0*0.6 + 2*0.4 = 0.8, rounds to 1. Documenting the
    // real behavior rather than asserting an unreached idealization.
    expect(metaScore(0, 0)).toBe(1)
  })

  it('increases with more distinct advertisers at a fixed ad count', () => {
    const fewAdvertisers  = metaScore(50, 3)
    const manyAdvertisers = metaScore(50, 30)
    expect(manyAdvertisers).toBeGreaterThan(fewAdvertisers)
  })

  it('saturates at 10 when ad count reaches the page cap with many advertisers', () => {
    expect(metaScore(PAGE_LIMIT, 50)).toBe(10)
  })

  it('never exceeds 10 or drops below 0 for any realistic input', () => {
    for (const adCount of [0, 1, 3, 10, 50, 100, 500]) {
      for (const advertisers of [0, 1, 5, 20, 100]) {
        const s = metaScore(adCount, advertisers)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('dataConfidence', () => {
  it('is higher for a full page than for a sample near the minimum gate', () => {
    expect(dataConfidence(PAGE_LIMIT)).toBeGreaterThan(dataConfidence(MIN_AD_SAMPLE))
  })

  it('tiers monotonically with ad count', () => {
    const samples = [MIN_AD_SAMPLE, 20, 50, PAGE_LIMIT]
    for (let i = 1; i < samples.length; i++) {
      expect(dataConfidence(samples[i])).toBeGreaterThanOrEqual(dataConfidence(samples[i - 1]))
    }
  })

  it('returns a value below the minimum-gate tier for counts under MIN_AD_SAMPLE (never reached in practice — fetch() gates first)', () => {
    expect(dataConfidence(1)).toBeLessThan(dataConfidence(MIN_AD_SAMPLE))
  })
})

// ── Class behavior (mocked fetch, Apify run-sync-get-dataset-items shape) ──
// Apify's endpoint returns the dataset items as a bare JSON array directly
// — no {data, error} wrapper like the old Meta API had. Field names are
// Apify's camelCase (adArchiveID, pageID, startDateFormatted, ...), not
// Meta's (id, page_id, ad_delivery_start_time, ...) — normalizeApifyAd
// bridges the two, tested separately above.

const ORIGINAL_TOKEN = process.env.APIFY_API_TOKEN

function mockAdsResponse(ads: Array<{ pageID?: string; startDateFormatted?: string; endDateFormatted?: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ads.map((a, i) => ({ adArchiveID: `ad-${i}`, ...a })),
  } as Response
}

describe('MetaAdsProvider — credential gating', () => {
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN })

  it('is disabled when APIFY_API_TOKEN is unset', () => {
    delete process.env.APIFY_API_TOKEN
    expect(new MetaAdsProvider().enabled).toBe(false)
  })

  it('is enabled when APIFY_API_TOKEN is set', () => {
    process.env.APIFY_API_TOKEN = 'test-token'
    expect(new MetaAdsProvider().enabled).toBe(true)
  })

  it('fetch() returns null immediately when no token is present, without calling fetch', async () => {
    delete process.env.APIFY_API_TOKEN
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('MetaAdsProvider — honest-null handling', () => {
  beforeEach(() => { process.env.APIFY_API_TOKEN = 'test-token' })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('returns null when below the minimum ad sample (thin data — honest null, not a shaky score)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([{ pageID: 'p1' }, { pageID: 'p2' }]))
    const result = await new MetaAdsProvider().fetch({ query: 'obscure niche product' })
    expect(result).toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response)
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
  })

  it('returns null when the actor returns a non-array response (unexpected shape)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ error: 'actor run failed' }),
    } as Response)
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => { throw new Error('not json') },
    } as unknown as Response)
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
  })

  it('returns null when fetch itself throws (network error)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
  })

  it('returns null for an empty query', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new MetaAdsProvider().fetch({ query: '   ' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('MetaAdsProvider — real-data computation', () => {
  beforeEach(() => { process.env.APIFY_API_TOKEN = 'test-token' })
  afterEach(() => { process.env.APIFY_API_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('computes advertiser_count as the DISTINCT count of pageID values, not the raw ad count', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { pageID: 'brandA' }, { pageID: 'brandA' }, { pageID: 'brandA' },
      { pageID: 'brandB' }, { pageID: 'brandB' },
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).not.toBeNull()
    expect(result!.virality!.ad_count).toBe(5)
    expect(result!.virality!.advertiser_count).toBe(2)
  })

  it('computes active_ad_pct correctly: no stop time or future stop time = active', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const past   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { pageID: 'p1' },                             // no stop time -> active
      { pageID: 'p2', endDateFormatted: future },    // future stop -> active
      { pageID: 'p3', endDateFormatted: past },      // past stop -> inactive
      { pageID: 'p4', endDateFormatted: past },      // past stop -> inactive
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result!.virality!.active_ad_pct).toBeCloseTo(0.5, 5) // 2 of 4 active
  })

  it('produces a valid ProviderSignals shape with provider name and matching top-level confidence', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse(
      Array.from({ length: 10 }, (_, i) => ({ pageID: `brand-${i}` })),
    ))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('meta-ads')
    expect(result!.confidence).toBe(result!.virality!.confidence)
    expect(typeof result!.fetched_at).toBe('string')
  })

  it('never fabricates ad_spend or a total count beyond the fetched page — those fields simply do not exist on the output', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { pageID: 'p1' }, { pageID: 'p2' }, { pageID: 'p3' },
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result!.virality).not.toHaveProperty('ad_spend')
    expect(result!.virality).not.toHaveProperty('total_ad_count')
  })

  it('surfaces earliest_ad_start / latest_ad_start / recent_ad_start_pct / creative-longevity fields end-to-end', async () => {
    const now = Date.now()
    const iso = (daysAgo: number) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString()
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { pageID: 'p1', startDateFormatted: iso(200) },                                   // old, still active
      { pageID: 'p2', startDateFormatted: iso(30), endDateFormatted: iso(10) },          // concluded, 20-day run
      { pageID: 'p3', startDateFormatted: iso(5) },                                     // recent, still active
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).not.toBeNull()
    const v = result!.virality!
    expect(v.earliest_ad_start).toBe(iso(200))
    expect(v.latest_ad_start).toBe(iso(5))
    // 2 of 3 ads (p2 at 30 days, p3 at 5 days) started within the last 90
    // days — p1 (200 days) is the only one outside the window.
    // toBeCloseTo precision 2, not 5 — computeRecentAdStartPct intentionally
    // rounds to 2 decimal places (see its own Math.round(...*100)/100).
    expect(v.recent_ad_start_pct).toBeCloseTo(2 / 3, 2)
    expect(v.avg_concluded_ad_duration_days).toBeCloseTo(20, 0)
    expect(v.avg_active_ad_age_days).toBeGreaterThan(0)
  })

  it('passes a public Ad Library search URL (not the old Meta API endpoint) as the actor input', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse(
      Array.from({ length: 5 }, (_, i) => ({ pageID: `brand-${i}` })),
    ))
    await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items')
    expect(String(url)).not.toContain('graph.facebook.com')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.startUrls[0].url).toContain('facebook.com/ads/library')
    // URLSearchParams encodes spaces as '+', not %20
    expect(body.startUrls[0].url).toContain('creatine+gummies')
  })
})

describe('computeAdStartRange', () => {
  it('returns the real min/max start date across the page', () => {
    const range = computeAdStartRange([
      { ad_delivery_start_time: '2026-03-01T00:00:00Z' },
      { ad_delivery_start_time: '2026-01-15T00:00:00Z' },
      { ad_delivery_start_time: '2026-05-20T00:00:00Z' },
    ])
    expect(range.earliest).toBe('2026-01-15T00:00:00Z')
    expect(range.latest).toBe('2026-05-20T00:00:00Z')
  })

  it('returns an empty object (absence, not a fabricated date) when no ad has a parseable start date', () => {
    expect(computeAdStartRange([{}, { ad_delivery_start_time: 'not-a-date' }])).toEqual({})
  })
})

describe('computeRecentAdStartPct', () => {
  const now = Date.parse('2026-07-01T00:00:00Z')
  it('computes the real fraction of ads started within the last 90 days', () => {
    const pct = computeRecentAdStartPct([
      { ad_delivery_start_time: '2026-06-15T00:00:00Z' }, // ~16 days ago — recent
      { ad_delivery_start_time: '2026-01-01T00:00:00Z' }, // old
      { ad_delivery_start_time: '2026-06-01T00:00:00Z' }, // ~30 days ago — recent
      { ad_delivery_start_time: '2025-01-01T00:00:00Z' }, // old
    ], now)
    expect(pct).toBeCloseTo(0.5, 5)
  })

  it('returns undefined (absence, not zero) when no ad has a parseable start date', () => {
    expect(computeRecentAdStartPct([{}, {}], now)).toBeUndefined()
  })
})

describe('computeAdDurations — active age and concluded duration are kept separate, never blended', () => {
  const now = Date.parse('2026-07-01T00:00:00Z')

  it('computes avg_active_ad_age_days only from ads with no stop time (or a future one)', () => {
    const { avgActiveAgeDays } = computeAdDurations([
      { ad_delivery_start_time: '2026-06-01T00:00:00Z' }, // 30 days running
      { ad_delivery_start_time: '2026-06-21T00:00:00Z' }, // 10 days running
    ], now)
    expect(avgActiveAgeDays).toBeCloseTo(20, 0)
  })

  it('computes avg_concluded_ad_duration_days only from ads whose stop time has passed', () => {
    const { avgConcludedDurationDays } = computeAdDurations([
      { ad_delivery_start_time: '2026-05-01T00:00:00Z', ad_delivery_stop_time: '2026-05-11T00:00:00Z' }, // 10-day run
      { ad_delivery_start_time: '2026-05-01T00:00:00Z', ad_delivery_stop_time: '2026-05-31T00:00:00Z' }, // 30-day run
    ], now)
    expect(avgConcludedDurationDays).toBeCloseTo(20, 0)
  })

  it('a mix of active and concluded ads populates both fields independently, never averaged together', () => {
    const result = computeAdDurations([
      { ad_delivery_start_time: '2026-06-01T00:00:00Z' },                                                   // active, 30 days old
      { ad_delivery_start_time: '2026-05-01T00:00:00Z', ad_delivery_stop_time: '2026-05-11T00:00:00Z' },   // concluded, 10-day run
    ], now)
    expect(result.avgActiveAgeDays).toBeCloseTo(30, 0)
    expect(result.avgConcludedDurationDays).toBeCloseTo(10, 0)
  })

  it('an ad with an unparseable start date is skipped entirely, not counted as zero', () => {
    const result = computeAdDurations([{ ad_delivery_start_time: undefined }], now)
    expect(result.avgActiveAgeDays).toBeUndefined()
    expect(result.avgConcludedDurationDays).toBeUndefined()
  })
})
