// ── Independence-aware confidence — public API ────────────────────────────────
//
// V2 Blueprint §10 / Roadmap M1.4.
//
// Usage:
//   const assessment = computeConfidenceAssessment(groundedScore)
//   // → attach to memo / write into verdict_ledger.dimension_confidence
//   // (any { dimensions, evidenceBreadth } shape works — see ConfidenceInput —
//   // which is what lib/scoring.ts's channel-independence gate uses to call
//   // this mid-computation, before a final `decision` exists.)
//
// ARCHITECTURE: consumed by lib/scoring.ts (Milestone 3's channel-
// independence gate) as one input among several (alongside the safety gate
// and economics gate) to computeGroundedScore's `decision`. It never
// computes a decision itself and never touches score or weights — only
// lib/scoring.ts's own mostConservative() logic decides whether a low
// channel count downgrades the verdict, exactly the same pattern already
// used for the safety and economics gates. Read-only and side-effect-free.

export { computeConfidenceAssessment, CONFIDENCE_MODEL_VERSION } from './independence'
export type { ConfidenceInput } from './independence'
export { PROVIDER_RELIABILITY_PRIORS, PRIORS_VERSION, reliabilityOf, DEFAULT_PROVIDER_RELIABILITY } from './priors'
export { DIMENSION_ELIGIBLE_CHANNELS, DIMENSION_ELIGIBLE_PROVIDERS } from './eligibility'
export type {
  ConfidenceAssessment, DimensionConfidence, ChannelWitness, ProviderId,
} from './types'
