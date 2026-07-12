// ── Review Narrative Synthesis — deterministic wrapper around ReviewEngine ──
//
// Milestone 7 (Review Engine, Option 2: memo-only narrative enrichment).
//
// ARCHITECTURE CONSTRAINT: see types.ts header. This file's only job is to
// call the existing lib/review-engine (reused as-is, zero modifications —
// "reuse existing infrastructure, do not create a parallel pipeline"),
// defend against every failure mode with an honest null, and label the
// result unmistakably as AI-synthesized commentary. It is never imported
// by lib/scoring.ts or lib/confidence.

import { ReviewEngine } from '@/lib/review-engine'
import type { RawReview } from '@/lib/review-engine'
import { REVIEW_NARRATIVE_SOURCE } from './types'
import type { ReviewNarrativeSynthesis } from './types'

// Disclosed judgment-call constants, same convention as every other
// threshold in this codebase (e.g. lib/scoring.ts REVIEW_MOAT_MIN_REVIEWS).
// Below this, ReviewEngine's own chunking/min-body-length gates would
// likely fail anyway (it throws on zero usable chunks) — failing fast here
// avoids spending an AI call budget on a near-certain failure.
export const MIN_REVIEWS_FOR_NARRATIVE = 10
// Bounded like the existing AI Writing Layer's INTERPRETATION_BUDGET_MS
// (app/api/generate/route.ts) — this is optional enrichment; it must never
// risk pushing the whole request past the Vercel maxDuration ceiling.
export const NARRATIVE_TIMEOUT_MS = 45_000

export const REVIEW_NARRATIVE_DISCLAIMER =
  'AI-synthesized commentary from customer review text. Informational only — ' +
  'never used to compute any score, verdict, confidence value, or gate in this report.'

interface MinimalReview {
  id: string; asin: string; title: string; body: string
  rating: number; verified: boolean; helpful_votes: number; date: string
}

function toRawReview(r: MinimalReview): RawReview {
  return {
    id: r.id, asin: r.asin, title: r.title, body: r.body,
    rating: r.rating, verified: r.verified, helpful_votes: r.helpful_votes, date: r.date,
  }
}

// Never throws. Returns null on: too few reviews, ReviewEngine throwing
// (empty input, all chunks failing, zero usable chunks), or a timeout —
// exactly the same honest-null contract as every provider in this codebase.
export async function synthesizeReviewNarrative(
  reviews: MinimalReview[] | undefined,
  asin?: string,
): Promise<ReviewNarrativeSynthesis | null> {
  if (!reviews || reviews.length < MIN_REVIEWS_FOR_NARRATIVE) {
    console.log('[ReviewNarrative] below minimum review count, skipping', {
      count: reviews?.length ?? 0, min: MIN_REVIEWS_FOR_NARRATIVE,
    })
    return null
  }

  try {
    const engine = new ReviewEngine()
    const rawReviews = reviews.map(toRawReview)

    const report = await Promise.race([
      engine.analyze(rawReviews, asin),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Review narrative synthesis timed out')), NARRATIVE_TIMEOUT_MS),
      ),
    ])

    console.log('[ReviewNarrative] synthesis complete', {
      asin, reviewsAnalyzed: report.total_reviews_analyzed, sentiment: report.overall_sentiment,
    })

    return {
      source:      REVIEW_NARRATIVE_SOURCE,
      disclaimer:  REVIEW_NARRATIVE_DISCLAIMER,
      generated_at: report.analyzed_at,
      analysis_version: report.analysis_version,
      total_reviews_analyzed: report.total_reviews_analyzed,
      avg_rating:  report.avg_rating,
      overall_sentiment: report.overall_sentiment,
      top_complaints:         report.top_complaints,
      top_requested_features: report.top_requested_features,
      ai_recommendation:      report.ai_recommendation,
      pain_points:      report.pain_points,
      missing_features: report.missing_features,
      positive_themes:  report.positive_themes,
      // Deliberately NOT copied: report.pain_score, report.opportunity_score,
      // report.market_confidence — see types.ts header comment.
    }
  } catch (e: unknown) {
    console.error('[ReviewNarrative] synthesis failed — omitting from memo (non-fatal)', {
      asin, reviewCount: reviews.length, error: e instanceof Error ? e.message : e,
    })
    return null
  }
}
