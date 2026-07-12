// ── Review Narrative Synthesis — types ───────────────────────────────────────
//
// Milestone 7 (Review Engine, resolved as memo-only narrative enrichment —
// Option 2). V2 Blueprint / Roadmap item 7.
//
// ARCHITECTURE CONSTRAINT (binding, enforced by
// lib/review-narrative/__tests__/architecture-boundary.test.ts):
//   - This module, and everything in it, is NEVER imported by
//     lib/scoring.ts, lib/confidence/**, or any file computing
//     consumerPainScore, subscriptionScore, opportunity_score, verdict,
//     confidence, or a gate.
//   - No field on ReviewNarrativeSynthesis is ever read by the Decision
//     Engine, directly or indirectly.
//   - lib/consumer-intelligence remains the SOLE scoring source for
//     review-derived pain/opportunity signals — this module only ever
//     RECEIVES raw review text FROM it (ConsumerIntelligenceReport.
//     rawReviewsForNarrative), never the reverse, and never writes back
//     into anything consumer-intelligence or scoring.ts read.
//   - Deliberately excludes ReviewEngine's own pain_score/opportunity_score
//     /market_confidence numbers (see lib/review-engine/scorer.ts) from
//     this persisted type, even though they are themselves deterministic
//     arithmetic — those numbers are computed over LLM-invented category
//     labels (lib/review-engine/analyzer.ts), and omitting anything
//     "score"-shaped here removes any possibility of a future reader
//     mistaking this object for a Decision Engine input.

import type { RankedInsight, SentimentLabel } from '@/lib/review-engine'

// A distinct, unmistakable sentinel — the only legal value. Exists so any
// future code that stumbles across this field's `source` at runtime (UI,
// export, logging) can identify AI-synthesized content without reading
// documentation, and so a `source === 'ai_synthesized_review_commentary'`
// check can gate rendering (e.g. "AI-generated" badge) unambiguously.
export const REVIEW_NARRATIVE_SOURCE = 'ai_synthesized_review_commentary' as const

export interface ReviewNarrativeSynthesis {
  source: typeof REVIEW_NARRATIVE_SOURCE
  // Human-readable label, meant to be rendered verbatim wherever this
  // object is displayed — required, not just documentation.
  disclaimer: string

  generated_at:      string
  analysis_version:  string
  total_reviews_analyzed: number

  // Real, deterministic (straight average of real star ratings) — included
  // because it's a fact, not an AI invention; harmless to display, never
  // read by scoring.ts regardless.
  avg_rating: number
  // AI-derived label (see lib/review-engine/types.ts SentimentLabel) —
  // commentary only.
  overall_sentiment: SentimentLabel

  // AI-curated highlights — free text, explicitly commentary.
  top_complaints:         string[]
  top_requested_features: string[]
  ai_recommendation:      string

  // Full ranked breakdowns — reused directly from lib/review-engine's own
  // RankedInsight type (insight/frequency/mention_count/severity), not
  // duplicated. AI-extracted category labels; display only.
  pain_points:       RankedInsight[]
  missing_features:  RankedInsight[]
  positive_themes:   RankedInsight[]
}
