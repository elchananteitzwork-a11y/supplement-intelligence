// Concordance matrix tests — Roadmap M2.1.
//
// Acceptance criteria under test (roadmap, verbatim):
//   "Each demand channel emits accelerating / stable / decelerating /
//    absent" / "Matrix renders for benchmark queries with ≥3 channels
//    populated" (structural: the matrix always has all 3 slots) /
//    "Agreement/divergence feeds confidence... and is consumed by M2.2"
//    (agreement is computed and exposed; NOT wired into M1.4's formula —
//    see lib/concordance.ts's own scoping note for why).

import { describe, it, expect } from 'vitest'
import { computeConcordanceMatrix } from '../concordance'
import type { AggregatedSignals, GrowthSignal } from '../signal-engine/types'

function growthSignal(overrides: Partial<GrowthSignal> = {}): GrowthSignal {
  return { score: 6, confidence: 0.6, ...overrides }
}

function signals(perProviderValues: Array<{ source: string; value: GrowthSignal }>): AggregatedSignals {
  return {
    growth: {
      value: perProviderValues[0]?.value ?? growthSignal(),
      sources: perProviderValues.map(p => p.source),
      primarySource: perProviderValues[0]?.source ?? '',
      confidence: 0.6,
      perProviderValues,
    },
    providers_used: perProviderValues.map(p => p.source),
    overall_confidence: 0.6,
  }
}

describe('computeConcordanceMatrix', () => {
  it('returns null when signal_evidence is absent', () => {
    expect(computeConcordanceMatrix(undefined)).toBeNull()
  })

  it('returns null when growth has no perProviderValues (legacy memo, pre-M2.1)', () => {
    expect(computeConcordanceMatrix({ providers_used: [], overall_confidence: 0 })).toBeNull()
  })

  it('maps keepa to amazon_market, google-trends to search_intent, reddit to consumer_voice', () => {
    const matrix = computeConcordanceMatrix(signals([
      { source: 'keepa',          value: growthSignal({ momentum: 'Accelerating' }) },
      { source: 'google-trends',  value: growthSignal({ momentum: 'Stable' }) },
      { source: 'reddit',         value: growthSignal({ momentum: 'Decelerating' }) },
    ]))
    expect(matrix).not.toBeNull()
    expect(matrix!.reads).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'amazon_market',  provider: 'keepa',         momentum: 'Accelerating' }),
      expect.objectContaining({ channel: 'search_intent',  provider: 'google-trends', momentum: 'Stable' }),
      expect.objectContaining({ channel: 'consumer_voice', provider: 'reddit',        momentum: 'Decelerating' }),
    ]))
  })

  it('reports Absent (not omitted) for a channel with no contributing provider', () => {
    const matrix = computeConcordanceMatrix(signals([
      { source: 'keepa', value: growthSignal({ momentum: 'Accelerating' }) },
    ]))
    expect(matrix!.reads).toHaveLength(3)
    const searchIntent = matrix!.reads.find(r => r.channel === 'search_intent')
    expect(searchIntent?.momentum).toBe('Absent')
    expect(searchIntent?.provider).toBeUndefined()
  })

  it('ignores a provider with no channel mapping or no momentum field, without crashing', () => {
    const matrix = computeConcordanceMatrix(signals([
      { source: 'keepa',           value: growthSignal({ momentum: 'Accelerating' }) },
      { source: 'unknown-provider', value: growthSignal({ momentum: 'Stable' }) },
      { source: 'meta-ads',        value: growthSignal({}) }, // no momentum field at all
    ]))
    expect(matrix).not.toBeNull()
    expect(matrix!.distinctReportingChannels).toBe(1)
  })

  it('when two providers map to the same channel (dataforseo + google-trends both -> search_intent), keeps the higher-confidence one', () => {
    const matrix = computeConcordanceMatrix(signals([
      { source: 'dataforseo',    value: growthSignal({ momentum: 'Stable',       confidence: 0.4 }) },
      { source: 'google-trends', value: growthSignal({ momentum: 'Accelerating', confidence: 0.9 }) },
    ]))
    const searchIntent = matrix!.reads.find(r => r.channel === 'search_intent')
    expect(searchIntent?.momentum).toBe('Accelerating')
    expect(searchIntent?.provider).toBe('google-trends')
  })

  describe('agreement', () => {
    it('is Insufficient with fewer than 2 reporting channels', () => {
      const matrix = computeConcordanceMatrix(signals([
        { source: 'keepa', value: growthSignal({ momentum: 'Accelerating' }) },
      ]))
      expect(matrix!.agreement).toBe('Insufficient')
    })

    it('is Unanimous when every reporting channel agrees', () => {
      const matrix = computeConcordanceMatrix(signals([
        { source: 'keepa',         value: growthSignal({ momentum: 'Accelerating' }) },
        { source: 'google-trends', value: growthSignal({ momentum: 'Accelerating' }) },
      ]))
      expect(matrix!.agreement).toBe('Unanimous')
    })

    it('is Majority when more than half agree but not all', () => {
      const matrix = computeConcordanceMatrix(signals([
        { source: 'keepa',         value: growthSignal({ momentum: 'Accelerating' }) },
        { source: 'google-trends', value: growthSignal({ momentum: 'Accelerating' }) },
        { source: 'reddit',        value: growthSignal({ momentum: 'Decelerating' }) },
      ]))
      expect(matrix!.agreement).toBe('Majority')
    })

    it('is Mixed when no momentum has a majority', () => {
      const matrix = computeConcordanceMatrix(signals([
        { source: 'keepa',         value: growthSignal({ momentum: 'Accelerating' }) },
        { source: 'google-trends', value: growthSignal({ momentum: 'Decelerating' }) },
      ]))
      expect(matrix!.agreement).toBe('Mixed')
    })
  })

  // Roadmap M3.5: DEMAND_CHANNELS is confirmed hardcoded to exactly the
  // three real demand channels and explicitly NOT extended with
  // 'social_commerce' this milestone. Even in the (currently impossible —
  // AggregatedSignals has no `social_commerce` field) hypothetical where a
  // 'tiktok-shop' entry ended up inside growth.perProviderValues, its
  // PROVIDER_CHANNEL mapping ('social_commerce') is not in DEMAND_CHANNELS,
  // so it is filtered out here exactly like any other non-demand channel.
  it("a 'tiktok-shop' contribution is excluded from the concordance matrix — its channel is not in DEMAND_CHANNELS", () => {
    const matrix = computeConcordanceMatrix(signals([
      { source: 'keepa',        value: growthSignal({ momentum: 'Accelerating' }) },
      { source: 'tiktok-shop',  value: growthSignal({ momentum: 'Accelerating' }) },
    ]))
    expect(matrix).not.toBeNull()
    expect(matrix!.reads.every(r => r.provider !== 'tiktok-shop')).toBe(true)
    expect(matrix!.reads.map(r => r.channel)).toEqual(['search_intent', 'amazon_market', 'consumer_voice'])
  })
})
