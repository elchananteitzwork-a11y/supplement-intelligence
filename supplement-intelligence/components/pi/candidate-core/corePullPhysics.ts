/**
 * Resistance math for the Pull mechanic ("You Trace its facts and Pull its
 * conclusion" — the drag-to-stress-test-the-verdict gesture on the Core's
 * score-in-hub handle). No React/Three deps on purpose — testable/reasoned
 * about independent of the render loop that calls it, same discipline as
 * the approved design prototype's own pullPhysics.ts this file replaces.
 *
 * HONESTY CAVEAT (R&D §4's second open question, resolved here, matching
 * this codebase's own established "HONESTY CAVEAT" comment convention —
 * see e.g. lib/stage25/launch-threshold.ts, lib/re-measurement/pipeline.ts):
 * the prototype's original pullPhysics.ts computed DIRECTIONAL resistance
 * (per-source Supports/Against/Mixed vs. a Build/Skip drag) from a
 * `direction` field that does not exist on any real ScoreDimension — real
 * evidence here only ever carries a magnitude (rawScore, 0-10) and a
 * provenance (verified vs. AI-judgment/synthesized), never a stance on
 * which way it points the verdict. Porting the original per-direction
 * opposition math onto real data would require literally inventing a
 * direction for each of the 6 real dimensions — the exact fabrication the
 * R&D document and this codebase's "no invented number" rule forbid.
 *
 * Resolution actually shipped: resistance is SYMMETRIC — pulling toward
 * either Build or Skip meets the exact same resistance, derived only from
 * how much real, verified, weighted evidence currently backs the verdict.
 * This is an honest, disclosed narrowing of the mechanic (a real change
 * from the approved mockup's asymmetric feel, not a silently-resolved
 * workaround): Pull no longer tests "does the evidence point away from
 * this verdict specifically toward Build or specifically toward Skip" (no
 * real field says that) — it tests "how hard does the verdict's own real
 * evidentiary weight resist being pulled away from at all." A verdict
 * built mostly on verified, high-magnitude dimensions resists strongly in
 * both directions; a verdict leaning on thin/qualitative/AI-judgment
 * dimensions gives more easily in both directions. Per-blade reaction
 * (brighten under load / relax) is driven the same way: a blade's own
 * real weight * magnitude share of the verdict, not a fabricated stance.
 */

export interface PullBladeInput {
  /** Real, already-normalized ScoreDimension.weight (0-1) — see
   * coreDataAdapter.ts's CoreBladeViewModel.weight. */
  weight: number
  /** 0-10 real rawScore, or null for a qualitative/unavailable dimension. */
  magnitude: number | null
  source: 'verified' | 'synthesized' | 'unavailable'
}

// Pull is now direction-agnostic by construction (see HONESTY CAVEAT
// above) — this type is kept only so the drag-handle axis convention
// (Up/Build vs. Down/Skip screen affordance, unrelated to per-blade
// resistance math) can stay expressed in the same frozen-vocabulary terms
// the rest of the product already uses for a verdict.
export type PullDirection = 'build' | 'skip'

// ── Tuning constants (all symmetric — no direction-specific weight below) ──
/** Resistance floor — a real verdict, even one built entirely on thin/
 * qualitative evidence, should never feel like a free-swinging handle with
 * nothing behind it; there is still a real (if weak) instrument underneath. */
const MIN_RESISTANCE = 0.15
/** How much one fully-verified, full-magnitude (weight=1, rawScore=10)
 * dimension would contribute to resistance on its own, before summing
 * across all six real blades. */
const MAX_SINGLE_DIMENSION_CONTRIBUTION = 1.4

/** Per-blade real contribution to the verdict's overall resistance: its
 * own normalized weight * (magnitude/10) for a verified dimension. A
 * qualitative (synthesized) or unavailable dimension contributes nothing
 * to resistance — it isn't real evidence backing the verdict, so it can't
 * honestly be rendered as something actively resisting a stress-test of
 * it. */
export function bladeResistanceContribution(blade: PullBladeInput): number {
  if (blade.source !== 'verified' || blade.magnitude === null) return 0
  return blade.weight * (blade.magnitude / 10) * MAX_SINGLE_DIMENSION_CONTRIBUTION
}

/** Total real resistance, identical for both pull directions (see HONESTY
 * CAVEAT) — summed across the six real blades, floored at MIN_RESISTANCE. */
export function computeResistance(blades: readonly PullBladeInput[]): number {
  const total = blades.reduce((sum, b) => sum + bladeResistanceContribution(b), 0)
  return Math.max(MIN_RESISTANCE, total)
}

/** How far the handle can travel before resistance arrests further
 * movement, as a fraction (0..1) of the handle's full visual travel range
 * — same inverse-relationship shape as the approved prototype's own
 * maxReachForResistance (stiffer spring = shorter reach), ported verbatim
 * since it's pure, direction-agnostic math with no illustrative weights of
 * its own. */
export function maxReachForResistance(resistance: number): number {
  return 1 / (1 + resistance)
}

/** Per-blade "pushback" reaction intensity (0..1) for the blade-glow
 * rendering while the handle is under load — every real, verified blade
 * reacts (there is no "opposing vs. aligned" distinction left to make, see
 * HONESTY CAVEAT), scaled by its own real resistance contribution
 * (normalized against the single-dimension ceiling) and by how far the
 * handle has actually been pulled (pullDepth, 0..1). A qualitative/
 * unavailable blade never reacts — it has no real evidentiary weight to
 * push back with. */
export function bladeReactionIntensity(blade: PullBladeInput, pullDepth: number): number {
  const contribution = bladeResistanceContribution(blade)
  if (contribution <= 0) return 0
  const normalized = Math.min(1, contribution / MAX_SINGLE_DIMENSION_CONTRIBUTION)
  return normalized * Math.max(0, Math.min(1, pullDepth))
}
