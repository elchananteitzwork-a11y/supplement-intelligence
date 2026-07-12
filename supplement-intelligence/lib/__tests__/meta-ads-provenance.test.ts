// metaAdsProvenance tests — Roadmap M1.5.
//
// Acceptance criterion under test: the Marketing Intelligence UI section
// must only ever attribute data to Meta Ad Library when meta-ads actually
// contributed to THIS query's virality dimension — not merely because
// virality exists (tiktok/reddit populate the same composite).

import { describe, it, expect } from 'vitest'
import { metaAdsProvenance } from '../provenance'
import type { AggregatedSignals } from '@/lib/signal-engine/types'

function signalsWithViralitySources(sources: string[]): AggregatedSignals {
  return {
    virality: {
      value: { score: 5, confidence: 0.5 },
      sources,
      primarySource: sources[0],
      confidence: 0.5,
    },
    providers_used: sources,
    overall_confidence: 0.5,
  }
}

describe('metaAdsProvenance', () => {
  it('returns null when signal_evidence is absent entirely', () => {
    expect(metaAdsProvenance(undefined)).toBeNull()
  })

  it('returns null when virality is absent', () => {
    expect(metaAdsProvenance({ providers_used: [], overall_confidence: 0 })).toBeNull()
  })

  it('returns null when virality exists but was populated only by tiktok — must not attribute Meta Ad Library data it never earned', () => {
    expect(metaAdsProvenance(signalsWithViralitySources(['tiktok']))).toBeNull()
  })

  it('returns null when virality exists but was populated only by reddit', () => {
    expect(metaAdsProvenance(signalsWithViralitySources(['reddit']))).toBeNull()
  })

  it('returns a verified Provenance when meta-ads is among the confirming sources', () => {
    const p = metaAdsProvenance(signalsWithViralitySources(['tiktok', 'meta-ads']))
    expect(p).not.toBeNull()
    expect(p!.level).toBe('verified')
    expect(p!.source).toBe('Meta Ad Library')
  })

  it('returns a verified Provenance when meta-ads is the only source', () => {
    const p = metaAdsProvenance(signalsWithViralitySources(['meta-ads']))
    expect(p).not.toBeNull()
    expect(p!.level).toBe('verified')
  })
})
