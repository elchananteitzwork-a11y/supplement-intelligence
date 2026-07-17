// ── Pattern Detection — divergence comparison — Roadmap M2.22 ────────────────
//
// Sibling primitive to lib/pattern-detection/acceleration.ts's
// detectAcceleration: pure, deterministic arithmetic comparing two ALREADY-
// computed AccelerationResults for the same niche_key against each other,
// rather than a single series against its own baseline. No ML, same
// "disclosed judgment-call threshold" convention as
// DISCOVERY_ACCELERATION_THRESHOLD_PCT.
//
// Honesty discipline borrowed from lib/concordance.ts's
// `distinctReportingChannels >= 2` / 'Insufficient' precedent: a divergence
// is a comparison between two independent witnesses, so it is never
// computed from fewer than 2 real (source, metric) series with a real
// acceleration reading. detectDivergence returns null (not []) when fewer
// than 2 real readings are supplied — the same "no fabricated comparison
// from one witness" posture, distinguished from a real comparison that
// simply found nothing (an empty array).
//
// Category-agnostic by construction: operates on generic source/metric
// labels and AccelerationResults, no ingredient/niche-specific vocabulary.

import { type AccelerationResult } from './acceleration'

export interface DivergenceInput {
  source: string
  metric: string
  accel:  AccelerationResult
}

export interface DivergenceResult {
  sourceA:       string
  metricA:       string
  priorValueA:   number
  latestValueA:  number
  changePctA:    number

  sourceB:       string
  metricB:       string
  priorValueB:   number
  latestValueB:  number
  changePctB:    number

  // abs(changePctA - changePctB) — the real magnitude of disagreement
  // between the two series at the moment this was computed.
  divergencePct: number
}

// Disclosed judgment-call threshold, distinct from (and deliberately larger
// than) DISCOVERY_ACCELERATION_THRESHOLD_PCT (25): a divergence claim rests
// on TWO independent, individually-noisy percent-change readings rather
// than one, so the bar for "these two are really disagreeing" is set
// higher than the bar for "this one series moved a lot" — roughly double,
// to absorb each series' own measurement noise before calling the gap
// between them meaningful. Calibrate against real Divergence Alert
// outcomes once they exist, same posture as the acceleration threshold.
export const DIVERGENCE_THRESHOLD_PCT = 50

// Compares every real pairing among the supplied per-series acceleration
// readings (already computed via detectAcceleration, one call per real
// series — this function never calls it itself) and returns every pair
// whose changePct signs genuinely disagree (one positive, one negative —
// a flat/zero reading is not a "direction" and never counts as disagreeing)
// by more than the disclosed threshold.
//
// Returns null when fewer than 2 real readings are supplied (no witness to
// compare against — never fabricated). Returns [] when 2+ real readings
// exist but none of the real pairs actually diverge — a real comparison
// that found nothing, not a missing comparison.
export function detectDivergence(series: DivergenceInput[]): DivergenceResult[] | null {
  if (series.length < 2) return null

  const results: DivergenceResult[] = []
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i]
      const b = series[j]
      const oppositeDirection =
        (a.accel.changePct > 0 && b.accel.changePct < 0) ||
        (a.accel.changePct < 0 && b.accel.changePct > 0)
      if (!oppositeDirection) continue

      const divergencePct = Math.round(Math.abs(a.accel.changePct - b.accel.changePct) * 10) / 10
      if (divergencePct <= DIVERGENCE_THRESHOLD_PCT) continue

      results.push({
        sourceA: a.source, metricA: a.metric,
        priorValueA: a.accel.priorValue, latestValueA: a.accel.latestValue, changePctA: a.accel.changePct,
        sourceB: b.source, metricB: b.metric,
        priorValueB: b.accel.priorValue, latestValueB: b.accel.latestValue, changePctB: b.accel.changePct,
        divergencePct,
      })
    }
  }
  return results
}
