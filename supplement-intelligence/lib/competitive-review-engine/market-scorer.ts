import type { ProductAnalysisResult } from './types'
import type { MarketAggregatedData }   from './market-aggregator'

// ── Output ─────────────────────────────────────────────────────────────────

export interface MarketScores {
  market_pain_score:        number   // 0–10
  market_opportunity_score: number   // 0–10
  gap_score:                number   // 0–10
  competition_risk:         number   // 0–10
  market_confidence:        number   // 0–1
}

// ── Public entry point ─────────────────────────────────────────────────────

export function computeMarketScores(
  results:  ProductAnalysisResult[],
  insights: MarketAggregatedData,
): MarketScores {
  const successful = results.filter(r => r.report !== null)
  const total      = results.length

  return {
    market_pain_score:        computeMarketPain(successful),
    market_opportunity_score: computeMarketOpportunity(successful, insights),
    gap_score:                computeGapScore(insights, successful.length),
    competition_risk:         computeCompetitionRisk(successful, insights),
    market_confidence:        computeMarketConfidence(successful, total),
  }
}

// ── Market Pain Score (0–10) ───────────────────────────────────────────────
//
// Weighted average of per-product pain scores.
// Products with more reviews contribute proportionally more to the signal.

function computeMarketPain(successful: ProductAnalysisResult[]): number {
  if (!successful.length) return 0

  let weightedSum = 0
  let totalWeight = 0

  for (const r of successful) {
    const weight = Math.log1p(r.insight.reviews_collected)  // log-dampen outliers
    weightedSum += r.insight.pain_score * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? round1(weightedSum / totalWeight) : 0
}

// ── Market Opportunity Score (0–10) ───────────────────────────────────────
//
// Combines:
//   1. Average per-product opportunity scores (weighted by reviews)  — 50%
//   2. Density of cross-ASIN universal + common gaps                 — 30%
//   3. Winner feature coverage (positive aspects worth inheriting)   — 20%

function computeMarketOpportunity(
  successful: ProductAnalysisResult[],
  insights:   MarketAggregatedData,
): number {
  if (!successful.length) return 0

  // 1. Weighted avg per-product opportunity
  let wSum = 0, wTotal = 0
  for (const r of successful) {
    const w = Math.log1p(r.insight.reviews_collected)
    wSum   += r.insight.opportunity_score * w
    wTotal += w
  }
  const avgOpp = wTotal > 0 ? wSum / wTotal : 0

  // 2. Cross-ASIN gap density (universal gaps count double)
  const gapDensity = clamp(
    (insights.universal_gaps.length * 2 + insights.common_gaps.length) / 20,
    0, 1
  )

  // 3. Winner feature coverage — having features customers love means there's a
  //    real market to enter (not a commodity wasteland)
  const winnerBonus = insights.winner_features.length >= 5 ? 1.0
                    : insights.winner_features.length >= 2 ? 0.5
                    : 0

  const raw = avgOpp * 0.50 + gapDensity * 10 * 0.30 + winnerBonus * 10 * 0.20
  return clamp(round1(raw), 0, 10)
}

// ── Gap Score (0–10) ───────────────────────────────────────────────────────
//
// Specific measure of how many unmet needs exist across the competitive set.
// High gap score = the market has clearly defined, widespread problems that
// no current product solves — ideal entry conditions.
//
//   1. Universal gap count (≥70% prevalence)   — high weight
//   2. Common gap count (40–69%)               — medium weight
//   3. Severity distribution                   — tiebreaker
//   4. Gap diversity (# of distinct categories) — breadth bonus

function computeGapScore(insights: MarketAggregatedData, productCount: number): number {
  if (!productCount) return 0

  const { universal_gaps, common_gaps, all_gaps } = insights

  // 1 + 2: gap volume (saturates quickly — we care about presence, not exact count)
  const universalPts = clamp(universal_gaps.length / 3, 0, 1) * 4.0   // 0–4 pts
  const commonPts    = clamp(common_gaps.length    / 5, 0, 1) * 2.5   // 0–2.5 pts

  // 3. Severity: fraction of universal/common gaps that are High severity
  const topGaps     = [...universal_gaps, ...common_gaps]
  const highFrac    = topGaps.length
    ? topGaps.filter(g => g.severity === 'High').length / topGaps.length
    : 0
  const severityPts = highFrac * 2.0   // 0–2 pts

  // 4. Category diversity (≥ 4 distinct gap categories = full market problem)
  const categories  = new Set(all_gaps.map(g => g.category))
  const divPts      = clamp(categories.size / 4, 0, 1) * 1.5   // 0–1.5 pts

  return clamp(round1(universalPts + commonPts + severityPts + divPts), 0, 10)
}

// ── Competition Risk (0–10) ────────────────────────────────────────────────
//
// How hard is it to break into this market?
// HIGH risk (→ 10) = many established products with high ratings and few gaps.
// LOW risk  (→ 0)  = weak incumbents, low ratings, many unaddressed problems.
//
//   1. Average rating across products  — high ratings = high bar to clear
//   2. Rating floor (min avg_rating)   — if even the weakest product has 4.5+, watch out
//   3. Review volume (total reviews)   — high volume = established market = harder to enter
//   4. Universal gap penalty           — many universal gaps = incumbents are weak
//   5. Product count                   — more products = more competition

function computeCompetitionRisk(
  successful: ProductAnalysisResult[],
  insights:   MarketAggregatedData,
): number {
  if (!successful.length) return 5  // unknown = medium risk

  const avgRating = successful.reduce((s, r) => s + r.insight.avg_rating, 0) / successful.length
  const minRating = Math.min(...successful.map(r => r.insight.avg_rating))
  const totalRevs = successful.reduce((s, r) => s + r.insight.reviews_collected, 0)

  // 1. Rating pressure (0–4 pts): higher avg ratings = harder to compete on quality
  const ratingPts = clamp((avgRating - 3.5) / 1.5, 0, 1) * 4.0

  // 2. Rating floor (0–2 pts): if the weakest product is already 4.5+, the floor is high
  const floorPts  = clamp((minRating - 3.5) / 1.5, 0, 1) * 2.0

  // 3. Review volume (0–2 pts): established review corpus = trust moat
  const volumePts = (
    totalRevs >= 50_000 ? 1.0
    : totalRevs >= 10_000 ? 0.7
    : totalRevs >= 2_000  ? 0.5
    : totalRevs >= 500    ? 0.3
    : 0.1
  ) * 2.0

  // 4. Gap penalty: each universal gap reduces risk (incumbents are beatable)
  const gapPenalty = clamp(insights.universal_gaps.length * 0.4, 0, 3.0)

  // 5. Product count pressure (0–2 pts): more competitors = more risk
  const countPts  = clamp(successful.length / 10, 0, 1) * 2.0

  const raw = ratingPts + floorPts + volumePts + countPts - gapPenalty
  return clamp(round1(raw), 0, 10)
}

// ── Market Confidence (0–1) ────────────────────────────────────────────────
//
// How much should we trust this analysis?
//   1. Coverage: how many products had successful analysis (vs. errored)
//   2. Avg per-product confidence (from ReviewEngine)
//   3. Total review volume (more reviews = more representative corpus)

function computeMarketConfidence(
  successful: ProductAnalysisResult[],
  totalInput: number,
): number {
  if (!totalInput) return 0

  // 1. Coverage fraction (40%): analysts hate incomplete data
  const coverage = successful.length / totalInput

  // 2. Average per-product AI confidence (40%)
  const avgConf  = successful.length
    ? successful.reduce((s, r) => s + r.insight.market_confidence, 0) / successful.length
    : 0

  // 3. Total review volume factor (20%): saturates at 5k reviews across the set
  const totalRevs   = successful.reduce((s, r) => s + r.insight.reviews_collected, 0)
  const volumeFactor = clamp(totalRevs / 5_000, 0, 1)

  // Min products guard: analysis across < 3 products is inherently low confidence
  const productsPenalty = successful.length < 3 ? 0.7 : 1.0

  const raw = (coverage * 0.40 + avgConf * 0.40 + volumeFactor * 0.20) * productsPenalty
  return Math.round(clamp(raw, 0, 1) * 100) / 100
}

// ── Utilities ──────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
