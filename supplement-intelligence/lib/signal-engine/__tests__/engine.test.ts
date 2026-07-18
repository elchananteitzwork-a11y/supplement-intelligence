// SignalEngine aggregation tests — Roadmap M2.1 addition: perProviderValues.
//
// Acceptance criterion under test: AggregatedDimension now preserves each
// contributing provider's own, un-blended signal value (not just the
// single highest-confidence one that survives into `value`), so a later
// consumer (lib/concordance.ts) can build a real per-channel view instead
// of only seeing the post-blend average.

import { describe, it, expect } from 'vitest'
import { SignalEngine } from '../engine'
import type { SignalProvider, SignalContext, ProviderSignals } from '../types'

function fakeProvider(name: string, signals: ProviderSignals): SignalProvider {
  return {
    name,
    enabled: true,
    fetch: async (_ctx: SignalContext) => signals,
  }
}

describe('SignalEngine — perProviderValues (Roadmap M2.1)', () => {
  it('preserves each contributing provider\'s own value when only one provider populates a dimension', async () => {
    const engine = new SignalEngine([
      fakeProvider('keepa', {
        growth: { score: 7, confidence: 0.72, momentum: 'Accelerating' },
        provider: 'keepa', fetched_at: new Date().toISOString(), confidence: 0.72,
      }),
    ])
    const result = await engine.fetch({ query: 'test' })
    expect(result).not.toBeNull()
    expect(result!.growth?.perProviderValues).toHaveLength(1)
    expect(result!.growth?.perProviderValues?.[0]).toEqual({
      source: 'keepa',
      value: { score: 7, confidence: 0.72, momentum: 'Accelerating' },
    })
  })

  it('preserves ALL contributing providers\' own values when multiple providers populate the same dimension, not just the blended winner', async () => {
    const engine = new SignalEngine([
      fakeProvider('keepa', {
        growth: { score: 7, confidence: 0.72, momentum: 'Accelerating' },
        provider: 'keepa', fetched_at: new Date().toISOString(), confidence: 0.72,
      }),
      fakeProvider('google-trends', {
        growth: { score: 4, confidence: 0.60, momentum: 'Decelerating' },
        provider: 'google-trends', fetched_at: new Date().toISOString(), confidence: 0.60,
      }),
    ])
    const result = await engine.fetch({ query: 'test' })
    expect(result).not.toBeNull()
    const perProvider = result!.growth?.perProviderValues
    expect(perProvider).toHaveLength(2)

    // The blended `value` only shows ONE momentum (the higher-confidence
    // provider's) — this is the pre-existing, unchanged behavior.
    expect(result!.growth?.value.momentum).toBe('Accelerating')
    expect(result!.growth?.primarySource).toBe('keepa')

    // But perProviderValues still has BOTH real readings, including the
    // one that lost the blend — this is what M2.1's concordance matrix
    // actually needs and what aggregation used to discard entirely.
    const keepaEntry = perProvider!.find(p => p.source === 'keepa')
    const trendsEntry = perProvider!.find(p => p.source === 'google-trends')
    expect(keepaEntry?.value.momentum).toBe('Accelerating')
    expect(trendsEntry?.value.momentum).toBe('Decelerating')
  })

  it('does not populate perProviderValues for a dimension no provider contributed to', async () => {
    const engine = new SignalEngine([
      fakeProvider('keepa', {
        growth: { score: 7, confidence: 0.72, momentum: 'Accelerating' },
        provider: 'keepa', fetched_at: new Date().toISOString(), confidence: 0.72,
      }),
    ])
    const result = await engine.fetch({ query: 'test' })
    expect(result!.virality).toBeUndefined()
  })
})

describe('SignalEngine — social_commerce (Roadmap M3.5) is structurally excluded from aggregation', () => {
  it("a provider populating only ProviderSignals.social_commerce contributes to NO dims, so AggregatedSignals never carries a social_commerce field and providers_used stays empty", async () => {
    const engine = new SignalEngine([
      fakeProvider('tiktok-shop', {
        social_commerce: {
          estimated_gmv_total: 12345, sold_count_total: 999, sample_size: 5,
          methodology: 'derived_sold_count_x_price_lifetime_cumulative',
          data_source: 'apify:pratikdani/tiktok-shop-search-scraper',
          confidence: 0.3,
        },
        provider: 'tiktok-shop', fetched_at: new Date().toISOString(), confidence: 0.3,
      } as ProviderSignals),
    ])
    const result = await engine.fetch({ query: 'test' })
    expect(result).not.toBeNull()
    // The whole point of NOT listing 'social_commerce' in engine.ts's
    // `dims` array: aggregateDimension() is never called for it, so it
    // never appears anywhere on the aggregated output — not blended, not
    // passed through, not present at all.
    expect(result).not.toHaveProperty('social_commerce')
    expect(result!.providers_used).toEqual([])
    expect(result!.overall_confidence).toBe(0)
  })

  it('a provider populating BOTH a real dim and social_commerce still contributes normally on the real dim, with social_commerce dropped', async () => {
    const engine = new SignalEngine([
      fakeProvider('tiktok-shop', {
        growth: { score: 5, confidence: 0.5, momentum: 'Stable' },
        social_commerce: {
          estimated_gmv_total: 500, sold_count_total: 50, sample_size: 3,
          methodology: 'derived_sold_count_x_price_lifetime_cumulative',
          data_source: 'apify:pratikdani/tiktok-shop-search-scraper',
          confidence: 0.3,
        },
        provider: 'tiktok-shop', fetched_at: new Date().toISOString(), confidence: 0.3,
      } as ProviderSignals),
    ])
    const result = await engine.fetch({ query: 'test' })
    expect(result!.growth?.value.momentum).toBe('Stable')
    expect(result).not.toHaveProperty('social_commerce')
    expect(result!.providers_used).toEqual(['tiktok-shop'])
  })
})
