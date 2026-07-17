// ── Pattern Detection — acceleration primitive — Roadmap M2.12 / M2.22 ───────
//
// Extracted verbatim from lib/discovery-engine/detector.ts (Roadmap M2.12)
// so the same pure, deterministic single-series read can be reused by a
// second consumer, lib/divergence-detector (Roadmap M2.22), without either
// engine importing the other's directory. lib/discovery-engine/detector.ts
// re-exports from here — zero behavior change for its existing caller
// (lib/discovery-engine/run.ts).
//
// docs/MASTER_EXECUTION_PLAN.md §2 step 4. Pure, deterministic arithmetic
// over two real observations of the same (niche_key, source, metric)
// series — no ML, same "disclosed judgment-call threshold" convention as
// lib/keyword-engine/acceleration.ts's ACCELERATION_THRESHOLD and
// lib/science-engine/pipeline.ts's VELOCITY_THRESHOLD_PCT.
//
// Deliberately v1-scoped: compares only the two MOST RECENT real points,
// not a rolling baseline — a rolling-baseline version is explicitly future
// work (see run.ts's header) that needs several weeks of real history this
// codebase doesn't have yet. Requiring >=2 real points before computing
// anything is the honest floor: a candidate with 0-1 observations produces
// no result, never a fabricated "stable" reading.
//
// Category-agnostic by construction: operates on generic value/timestamp
// pairs, no ingredient/niche-specific vocabulary anywhere in this file.

export interface ObservationPoint {
  value:      number
  observedAt: string   // ISO timestamp
}

export interface AccelerationResult {
  priorValue:     number
  latestValue:    number
  changePct:      number
  isAccelerating: boolean
}

// Disclosed judgment-call threshold — calibrate against real Discovery
// Alert outcomes once they exist (a future re-measurement-style worker,
// not part of this milestone).
export const DISCOVERY_ACCELERATION_THRESHOLD_PCT = 25

// Only ever called on a real, ALREADY-observed metric — never invents a
// baseline. Returns null when fewer than 2 real points exist, or when the
// prior value is exactly 0 (a percent change against a zero baseline is
// undefined, not "infinite acceleration").
export function detectAcceleration(points: ObservationPoint[]): AccelerationResult | null {
  if (points.length < 2) return null

  const sorted = [...points].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())
  const prior  = sorted[sorted.length - 2].value
  const latest = sorted[sorted.length - 1].value
  if (prior === 0) return null

  const changePct = Math.round(((latest - prior) / Math.abs(prior)) * 1000) / 10

  return {
    priorValue: prior,
    latestValue: latest,
    changePct,
    isAccelerating: changePct > DISCOVERY_ACCELERATION_THRESHOLD_PCT,
  }
}
