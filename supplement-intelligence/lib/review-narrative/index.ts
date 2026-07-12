// ── Review Narrative Synthesis — public API ──────────────────────────────────
// Milestone 7 (Review Engine, memo-only narrative enrichment).
// See types.ts for the binding ARCHITECTURE CONSTRAINT.

export { synthesizeReviewNarrative, MIN_REVIEWS_FOR_NARRATIVE, NARRATIVE_TIMEOUT_MS, REVIEW_NARRATIVE_DISCLAIMER } from './synthesize'
export { REVIEW_NARRATIVE_SOURCE } from './types'
export type { ReviewNarrativeSynthesis } from './types'
