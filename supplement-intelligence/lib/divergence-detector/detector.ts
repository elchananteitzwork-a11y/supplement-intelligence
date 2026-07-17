// ── Divergence Detector — per-niche series combiner — Roadmap M2.22 ──────────
//
// Combines every real (source, metric) series for a niche_key into their
// per-series acceleration readings (via lib/pattern-detection/acceleration's
// detectAcceleration, one call per series — never reimplemented here), then
// hands the real readings to lib/pattern-detection/divergence's
// detectDivergence for the actual cross-series comparison. This file owns
// no arithmetic of its own — both primitives are reused verbatim.

import { detectAcceleration } from '../pattern-detection/acceleration'
import { detectDivergence, type DivergenceInput, type DivergenceResult } from '../pattern-detection/divergence'
import type { NicheSeries } from './service-store'

// Returns null when fewer than 2 of the supplied series have enough real
// history to produce an acceleration reading (same "no fabricated
// comparison from one witness" floor as detectDivergence itself — a
// candidate with 3 series but only 1 with >=2 real points is still an
// insufficient-data case). Returns [] when 2+ real readings exist but none
// of them actually diverge.
export function detectSeriesDivergence(series: NicheSeries[]): DivergenceResult[] | null {
  const withAccel: DivergenceInput[] = []
  for (const s of series) {
    const accel = detectAcceleration(s.points)
    if (!accel) continue
    withAccel.push({ source: s.source, metric: s.metric, accel })
  }
  return detectDivergence(withAccel)
}
