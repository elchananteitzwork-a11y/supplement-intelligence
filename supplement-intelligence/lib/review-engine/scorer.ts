import type { ChunkAnalysis } from './types'
import type { AggregatedInsights } from './aggregator'

// ── Output ─────────────────────────────────────────────────────────────────

export interface ReviewScores {
  pain_score:        number   // 0–10
  opportunity_score: number   // 0–10
  market_confidence: number   // 0–1
}

// ── Public entry point ─────────────────────────────────────────────────────

export function computeScores(
  insights:          AggregatedInsights,
  analyses:          ChunkAnalysis[],
  totalReviewsInput: number,
): ReviewScores {
  return {
    pain_score:        computePainScore(insights),
    opportunity_score: computeOpportunityScore(insights),
    market_confidence: computeMarketConfidence(insights, analyses, totalReviewsInput),
  }
}

// ── Pain Score (0–10) ──────────────────────────────────────────────────────
//
// Combines four signals:
//   1. Negative-sentiment chunk fraction  (max 3 pts)
//   2. Breadth of complaint categories    (max 2 pts)
//   3. High-severity complaint density    (max 2 pts)
//   4. Rating-derived pain proxy          (max 3 pts)

function computePainScore(insights: AggregatedInsights): number {
  const dist = insights.sentiment_distribution

  // 1. Negative sentiment fraction (chunks labelled Negative or Very Negative)
  const negFraction = dist.negative + dist.very_negative
  const sentimentPts = negFraction * 3.0            // 0–3

  // 2. Complaint breadth: how many of the 5 complaint categories have ANY data
  const complaintCategories = [
    insights.pain_points,
    insights.quality_issues,
    insights.packaging_issues,
    insights.shipping_issues,
    insights.price_complaints,
  ]
  const activeCategoryCount = complaintCategories.filter(c => c.length > 0).length
  const breadthPts = (activeCategoryCount / 5) * 2.0  // 0–2

  // 3. High-severity complaint density
  const highSeverityItems = complaintCategories
    .flat()
    .filter(i => i.severity === 'High').length
  const densityPts = clamp(highSeverityItems / 4, 0, 1) * 2.0   // saturates at 4 high items → 2 pts

  // 4. Rating proxy: a 1★ avg = 3 pts, a 5★ avg = 0 pts (linear)
  const ratingPts = clamp((5 - insights.avg_rating) / 4, 0, 1) * 3.0

  const raw = sentimentPts + breadthPts + densityPts + ratingPts
  return clamp(round1(raw), 0, 10)
}

// ── Opportunity Score (0–10) ───────────────────────────────────────────────
//
// Combines:
//   1. Requested-feature richness   (max 3 pts)
//   2. High-frequency requests      (max 3 pts)
//   3. Pain carryover               (max 2 pts) — pain = unfulfilled market
//   4. Positive viability bonus     (max 2 pts) — product has traction to build on

function computeOpportunityScore(insights: AggregatedInsights): number {
  const requestPool = [
    ...insights.missing_features,
    ...insights.requested_improvements,
  ]

  // 1. Total request richness (normalised to 15 items)
  const richnessPts = clamp(requestPool.length / 15, 0, 1) * 3.0

  // 2. High-frequency requests (mentioned in ≥20% of chunks)
  const highFreqCount = requestPool.filter(i => i.frequency >= 0.20).length
  const highFreqPts   = clamp(highFreqCount / 3, 0, 1) * 3.0   // saturates at 3 → 3 pts

  // 3. Pain carries over as opportunity (capped so it can't dominate)
  const painScore  = computePainScore(insights)
  const painPts    = clamp(painScore / 10, 0, 1) * 2.0

  // 4. Viability bonus: enough positive sentiment to know the product has buyers
  const positiveShare = insights.sentiment_distribution.very_positive
    + insights.sentiment_distribution.positive
  const viabilityPts = positiveShare >= 0.35 ? 2.0
                     : positiveShare >= 0.20 ? 1.0
                     : 0

  const raw = richnessPts + highFreqPts + painPts + viabilityPts
  return clamp(round1(raw), 0, 10)
}

// ── Market Confidence (0–1) ────────────────────────────────────────────────
//
// How much should we trust this analysis?
//   1. Review volume (40%)  — more reviews = more representative corpus
//   2. Avg chunk confidence (40%) — AI certainty signal from analyzer.ts
//   3. Chunk count coverage (20%) — saturates quickly; even 10 chunks is solid

function computeMarketConfidence(
  insights:          AggregatedInsights,
  analyses:          ChunkAnalysis[],
  totalReviewsInput: number,
): number {
  // 1. Volume factor
  const volumeFactor =
    totalReviewsInput >= 5_000 ? 1.00
    : totalReviewsInput >= 1_000 ? 0.90
    : totalReviewsInput >= 500  ? 0.75
    : totalReviewsInput >= 200  ? 0.60
    : totalReviewsInput >= 100  ? 0.45
    : totalReviewsInput >= 50   ? 0.30
    : 0.15

  // 2. Average chunk confidence (from AI extraction quality)
  const avgChunkConf = analyses.length
    ? analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length
    : 0

  // 3. Chunk coverage (10 chunks = fully saturated)
  const coverageFactor = clamp(analyses.length / 10, 0, 1)

  const raw = volumeFactor * 0.40 + avgChunkConf * 0.40 + coverageFactor * 0.20
  return Math.round(clamp(raw, 0, 1) * 100) / 100
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
