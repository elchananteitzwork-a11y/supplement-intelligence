// ── Outcome label — Roadmap M2.9 ─────────────────────────────────────────────
//
// V2 Blueprint §11: "Did a new entrant launched near the verdict date
// achieve meaningful traction?" — measurable entirely from Keepa
// (listedSince + review accrual of newcomers). No user sales data required.
//
// Reuses the real, already-computed supply_velocity.entry_velocity
// classification (Roadmap M2.3 — "more than half of the last 24 months'
// entrants arrived in just the most recent 12" = Accelerating) as the
// real-entrant-activity signal, and lib/scoring.ts's own already-disclosed
// REVIEW_MOAT_MIN_REVIEWS threshold (10) as "a real, non-trivial review
// base" — no new number invented for this milestone.

import { REVIEW_MOAT_MIN_REVIEWS } from '@/lib/scoring'

export type OutcomeLabel = 'meaningful_traction' | 'no_meaningful_traction' | 'too_early_to_tell'

export interface OutcomeInputs {
  entryVelocity: 'Accelerating' | 'Stable' | 'Decelerating' | undefined
  avgReviewCountAtMeasurement: number | null
}

export function computeOutcomeLabel(inputs: OutcomeInputs): OutcomeLabel {
  const { entryVelocity, avgReviewCountAtMeasurement } = inputs

  // Real data genuinely missing this run (fast-tier re-pull failed, or too
  // few products to compute a real review-count average) — never guessed.
  if (entryVelocity === undefined || avgReviewCountAtMeasurement === null) {
    return 'too_early_to_tell'
  }

  const realReviewBase = avgReviewCountAtMeasurement >= REVIEW_MOAT_MIN_REVIEWS

  if (entryVelocity === 'Accelerating' && realReviewBase) return 'meaningful_traction'
  if (entryVelocity !== 'Accelerating' && !realReviewBase) return 'no_meaningful_traction'

  // Mixed real signal (e.g. new entrants arriving but not yet accumulating
  // reviews, or a stable entrant count with an already-large review base
  // that predates the verdict) — genuinely ambiguous, not a guess either way.
  return 'too_early_to_tell'
}
