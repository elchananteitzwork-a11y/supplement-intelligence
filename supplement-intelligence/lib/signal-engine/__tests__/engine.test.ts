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
