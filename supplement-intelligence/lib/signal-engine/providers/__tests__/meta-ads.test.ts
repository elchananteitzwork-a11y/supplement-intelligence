// Meta Ads provider tests — V2 Blueprint §5 / Roadmap M1.5, Milestone 5.
//
// Two layers: pure scoring-function tests (deterministic, no I/O) and
// class-behavior tests against a mocked global fetch (honest-null handling,
// credential gating, minimum-sample gate) — no live network call is made
// anywhere in this suite, consistent with this session's inability to
// verify the live Meta Ad Library API response shape (see the provider's
// own header comment).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetaAdsProvider, adCountToMetaSignal, metaScore, dataConfidence, MIN_AD_SAMPLE, PAGE_LIMIT } from '../meta-ads'

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

// ── Class behavior (mocked fetch) ──────────────────────────────────────────

const ORIGINAL_TOKEN = process.env.META_ADS_ACCESS_TOKEN

function mockAdsResponse(ads: Array<{ page_id?: string; ad_delivery_stop_time?: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ads.map((a, i) => ({ id: `ad-${i}`, ...a })) }),
  } as Response
}

describe('MetaAdsProvider — credential gating', () => {
  afterEach(() => { process.env.META_ADS_ACCESS_TOKEN = ORIGINAL_TOKEN })

  it('is disabled when META_ADS_ACCESS_TOKEN is unset', () => {
    delete process.env.META_ADS_ACCESS_TOKEN
    expect(new MetaAdsProvider().enabled).toBe(false)
  })

  it('is enabled when META_ADS_ACCESS_TOKEN is set', () => {
    process.env.META_ADS_ACCESS_TOKEN = 'test-token'
    expect(new MetaAdsProvider().enabled).toBe(true)
  })

  it('fetch() returns null immediately when no token is present, without calling fetch', async () => {
    delete process.env.META_ADS_ACCESS_TOKEN
    const fetchSpy = vi.spyOn(global, 'fetch')
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('MetaAdsProvider — honest-null handling', () => {
  beforeEach(() => { process.env.META_ADS_ACCESS_TOKEN = 'test-token' })
  afterEach(() => { process.env.META_ADS_ACCESS_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('returns null when below the minimum ad sample (thin data — honest null, not a shaky score)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([{ page_id: 'p1' }, { page_id: 'p2' }]))
    const result = await new MetaAdsProvider().fetch({ query: 'obscure niche product' })
    expect(result).toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response)
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).toBeNull()
  })

  it('returns null when the API response contains an error field', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ error: { message: 'Invalid access token', code: 190 } }),
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
  beforeEach(() => { process.env.META_ADS_ACCESS_TOKEN = 'test-token' })
  afterEach(() => { process.env.META_ADS_ACCESS_TOKEN = ORIGINAL_TOKEN; vi.restoreAllMocks() })

  it('computes advertiser_count as the DISTINCT count of page_id values, not the raw ad count', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { page_id: 'brandA' }, { page_id: 'brandA' }, { page_id: 'brandA' },
      { page_id: 'brandB' }, { page_id: 'brandB' },
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
      { page_id: 'p1' },                              // no stop time -> active
      { page_id: 'p2', ad_delivery_stop_time: future }, // future stop -> active
      { page_id: 'p3', ad_delivery_stop_time: past },   // past stop -> inactive
      { page_id: 'p4', ad_delivery_stop_time: past },   // past stop -> inactive
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result!.virality!.active_ad_pct).toBeCloseTo(0.5, 5) // 2 of 4 active
  })

  it('produces a valid ProviderSignals shape with provider name and matching top-level confidence', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse(
      Array.from({ length: 10 }, (_, i) => ({ page_id: `brand-${i}` })),
    ))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('meta-ads')
    expect(result!.confidence).toBe(result!.virality!.confidence)
    expect(typeof result!.fetched_at).toBe('string')
  })

  it('never fabricates ad_spend or a total count beyond the fetched page — those fields simply do not exist on the output', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockAdsResponse([
      { page_id: 'p1' }, { page_id: 'p2' }, { page_id: 'p3' },
    ]))
    const result = await new MetaAdsProvider().fetch({ query: 'creatine gummies' })
    expect(result!.virality).not.toHaveProperty('ad_spend')
    expect(result!.virality).not.toHaveProperty('total_ad_count')
  })
})
