// Regression test for the 2026-07-18 audit Finding 4: adaptAggregatedSignals
// labeled overall_confidence's methodology as a "weighted average of
// per-dimension confidence scores", but the real computation
// (lib/signal-engine/engine.ts aggregate(): dimValues.reduce((s,d) =>
// s+d.confidence,0)/dimValues.length) applies no weights at all — a plain
// unweighted arithmetic mean. This is a checkable, user-facing provenance
// claim (surfaced via components/research/MarketBriefing.tsx), so the label
// must accurately describe the real computation.

import { describe, it, expect } from 'vitest'
import { adaptAggregatedSignals } from '../adapter'
import type { AggregatedSignals } from '../../signal-engine/types'

describe('adaptAggregatedSignals — Finding 4 (honest methodology label)', () => {
  it('labels overall_confidence methodology as unweighted, not weighted', () => {
    const signals = {
      providers_used:     ['keepa', 'dataforseo'],
      overall_confidence: 0.72,
    } as unknown as AggregatedSignals

    const evidence = adaptAggregatedSignals(signals, new Date().toISOString())

    expect(evidence.overall_confidence.methodology).toBe('unweighted average of per-dimension confidence scores')
    expect(evidence.overall_confidence.methodology).not.toBe('weighted average of per-dimension confidence scores')
    // Still an accurate pass-through of the real computed value.
    expect(evidence.overall_confidence.value).toBe(0.72)
  })
})
