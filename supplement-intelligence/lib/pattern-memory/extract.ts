// ── BUILD_NOW Pattern Memory — deterministic extraction ───────────────────────
//
// Extracts a BuildNowPattern from an already-scored memo. No AI involvement —
// every value is either read directly from a real data field or computed via
// a deterministic rule over those values. Safe to call on any BUILD_NOW memo.
//
// ARCHITECTURE CONSTRAINT: never import this from lib/scoring.ts.

import type { MemoData }     from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import { computeVerdictConfidence } from '@/lib/ai-interpretation/verdict'
import type {
  BuildNowPattern, OpportunityPattern,
  MarketStage, EntryType, DimensionContribution,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDollar(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ── Market stage ──────────────────────────────────────────────────────────────

function classifyMarketStage(
  avgCompetitorReviews: number | null,
  competitorCount: number | null,
): MarketStage {
  const avg = avgCompetitorReviews ?? 0
  const cnt = competitorCount ?? 0
  if (avg < 100 || cnt < 3) return 'nascent'
  if (avg < 2_000)          return 'early_growth'
  if (avg < 10_000)         return 'growth'
  return 'maturing'
}

// ── Entry type ────────────────────────────────────────────────────────────────

function classifyEntryType(topContributors: DimensionContribution[]): EntryType {
  const top = topContributors[0]?.dimension
  if (!top) return 'mixed'
  if (top === 'virality')            return 'virality_led'
  if (top === 'demand')              return 'demand_led'
  if (top === 'consumerPain')        return 'gap_led'
  return 'mixed'
}

// ── Why-approved sentences ────────────────────────────────────────────────────

function buildWhyApproved(
  m: MemoData,
  monthlySearches: number | null,
  tiktokViews: number | null,
  reviewConcentration: number | null,
  avgReviews: number | null,
  topContributors: DimensionContribution[],
  safetyClean: boolean,
): string[] {
  const reasons: string[] = []

  // Demand: first valid keyword
  const topKw = (m.keyword_intelligence?.top_buying ?? []).find(kw => kw.monthly_searches)
  if (monthlySearches && monthlySearches >= 10_000) {
    const kw = topKw?.keyword ? ` for "${topKw.keyword}"` : ''
    reasons.push(`Verified demand: ${monthlySearches.toLocaleString()} monthly searches${kw}.`)
  }

  // Virality
  if (tiktokViews && tiktokViews >= 50_000_000) {
    const fmt = tiktokViews >= 1_000_000_000
      ? `${(tiktokViews / 1_000_000_000).toFixed(1)}B`
      : `${(tiktokViews / 1_000_000).toFixed(0)}M`
    reasons.push(`Strong organic virality: ${fmt} TikTok views.`)
  }

  // Market accessibility
  if (reviewConcentration !== null && reviewConcentration < 0.7) {
    reasons.push(`Low review moat: ${(reviewConcentration * 100).toFixed(0)}% concentration — no single brand dominates.`)
  } else if (avgReviews !== null && avgReviews < 1_000) {
    reasons.push(`Accessible category: avg ${Math.round(avgReviews)} competitor reviews — review barrier is low.`)
  }

  // Consumer pain
  const ci = m.consumer_intelligence
  if (ci && ci.totalReviewsCollected >= 50) {
    const gapCount = ci.categoryGapThemes?.length ?? 0
    if (gapCount >= 2) {
      reasons.push(`${gapCount} documented category gaps — unmet needs confirmed across competitor reviews.`)
    }
  }

  // Safety
  if (safetyClean) {
    reasons.push('Regulatory profile clear: FDA adverse-event and recall check passed.')
  }

  // Fallback: name the top contributor dimension
  if (reasons.length === 0 && topContributors.length > 0) {
    const d = topContributors[0]
    reasons.push(`Leading score driver: ${d.dimension} (${d.score.toFixed(1)}/10 × ${(d.weight * 100).toFixed(0)}% weight).`)
  }

  return reasons.slice(0, 4)
}

// ── Pattern tags ──────────────────────────────────────────────────────────────

function buildPatternTags(
  monthlySearches: number | null,
  searchGrowthPct: number | null,
  tiktokViews: number | null,
  reviewConcentration: number | null,
  avgReviews: number | null,
  competitorCount: number | null,
  safetyClean: boolean,
  hasConsumerData: boolean,
  manufacturingFeasScore: number | null,
): string[] {
  const tags: string[] = []

  if (tiktokViews && tiktokViews > 1_000_000_000) tags.push('viral_tiktok')
  else if (tiktokViews && tiktokViews > 100_000_000) tags.push('high_tiktok_views')
  else if (tiktokViews && tiktokViews > 10_000_000) tags.push('moderate_tiktok_views')

  if (monthlySearches && monthlySearches >= 50_000) tags.push('high_search_demand')
  else if (monthlySearches && monthlySearches >= 15_000) tags.push('moderate_search_demand')

  if (typeof searchGrowthPct === 'number' && searchGrowthPct > 20) tags.push('growing_demand')

  if (reviewConcentration !== null && reviewConcentration < 0.5)  tags.push('low_review_concentration')
  else if (reviewConcentration !== null && reviewConcentration < 0.7) tags.push('moderate_review_concentration')

  if (avgReviews !== null && avgReviews < 200)   tags.push('nascent_category')
  else if (avgReviews !== null && avgReviews < 1_000) tags.push('emerging_category')

  if (competitorCount !== null && competitorCount <= 5) tags.push('few_competitors')

  if (safetyClean)     tags.push('clean_fda')
  if (!hasConsumerData) tags.push('thin_consumer_data')

  if (manufacturingFeasScore !== null && manufacturingFeasScore >= 7) tags.push('accessible_manufacturing')

  return tags
}

// ── Main extraction ───────────────────────────────────────────────────────────

export function extractBuildNowPattern(
  m: MemoData,
  grounded: GroundedScore,
  memoId: string,
  userId: string,
): BuildNowPattern {
  const se  = m.signal_evidence
  const ci  = m.consumer_intelligence
  const mfg = m.manufacturing_estimate
  const kw  = m.keyword_intelligence
  const rv  = se?.review_velocity?.value

  // ── Demand ────────────────────────────────────────────────────
  const validKws = (kw?.top_buying ?? []).filter(k => k.monthly_searches)
  const topKw    = validKws[0] ?? null
  const monthlySearches = topKw?.monthly_searches ?? null
  const searchGrowthPct = topKw?.growth_pct       ?? null
  const googleTrendsDir: 'Rising' | 'Stable' | 'Declining' | null =
    typeof searchGrowthPct === 'number'
      ? searchGrowthPct > 10 ? 'Rising' : searchGrowthPct < -10 ? 'Declining' : 'Stable'
      : null

  // ── Social ────────────────────────────────────────────────────
  const viralityVal = se?.virality?.value
  const tiktokViews  = viralityVal?.view_count ?? null
  const tiktokSignal = viralityVal?.tiktok     ?? null

  // ── Market structure ──────────────────────────────────────────
  const reviewConcentration  = rv?.review_concentration_ratio ?? null
  const competitorCount      = rv?.meaningful_competitor_count ?? null
  const avgCompetitorReviews = rv?.avg_review_count            ?? null
  const competitors          = rv?.top_competitors             ?? []
  const prices = competitors.map(c => c.price).filter((p): p is number => typeof p === 'number' && p > 0)
  const priceRangeLow  = prices.length ? Math.min(...prices) : null
  const priceRangeHigh = prices.length ? Math.max(...prices) : null

  // ── Profitability ─────────────────────────────────────────────
  const price        = parseDollar(se?.pricing?.value.avg_price)
  const revenueVal   = se?.revenue?.value
  const referralPct  = revenueVal?.avg_referral_fee_pct ?? null
  const fbaFee       = parseDollar(revenueVal?.avg_fba_pick_pack_fee)
  const feePct       = price && (typeof referralPct === 'number' || fbaFee !== null)
    ? (referralPct ?? 0) + ((fbaFee ?? 0) / price) * 100
    : null
  const feeBurdenScore = feePct !== null
    ? Math.max(0, Math.min(10, Math.round((1 - feePct / 45) * 10)))
    : null
  const realisticCogs  = mfg?.realistic_unit_cost
  const grossMarginPct = price && realisticCogs
    ? ((price - (realisticCogs.low + realisticCogs.high) / 2) / price) * 100
    : null
  const cpc = topKw?.cpc
  const cacPressureScore = price && typeof cpc === 'number' && cpc > 0
    ? Math.max(0, Math.min(10, Math.round((1 - (cpc / price) / 0.20) * 10)))
    : null

  // ── Consumer signals ──────────────────────────────────────────
  const consumerPainDim = grounded.dimensions.find(d => d.key === 'consumerPain')
  const consumerPainScore = consumerPainDim?.rawScore ?? null
  const repurchaseRate = ci?.repurchaseLanguage
    ? ci.repurchaseLanguage.mentionedBy / Math.max(1, ci.repurchaseLanguage.outOf)
    : null
  const themeCount = ci
    ? (ci.categoryGapThemes?.length ?? 0) + (ci.productSpecificThemes?.length ?? ci.negativeThemes.length)
    : null

  // ── Manufacturing ─────────────────────────────────────────────
  const mfgDim   = grounded.dimensions.find(d => d.key === 'manufacturing')
  const mfgScore = mfgDim?.rawScore ?? null

  // ── Regulatory ────────────────────────────────────────────────
  const news    = m.news_intelligence
  const fdaItems = (news?.items ?? []).filter(i => i.provider === 'openfda')
  const fdaRecalls  = fdaItems.filter(i => i.recall_classification).length
  const fdaAdverse  = fdaItems.filter(i => i.adverse_event_reactions?.length).length
  const safetyClean =
    !!news && !news.failedProviders?.includes('openfda') && fdaRecalls === 0 && fdaAdverse < 2

  // ── Verdict confidence from expandable cards ──────────────────
  const verdictConfidence: 'HIGH' | 'MODERATE' | 'LOW' = m.expandable_cards
    ? computeVerdictConfidence(m.expandable_cards)
    : 'LOW'

  // ── Scoring dimension values ──────────────────────────────────
  const dimScore = (key: string): number | null =>
    grounded.dimensions.find(d => d.key === key)?.rawScore ?? null

  // ── Opportunity pattern ───────────────────────────────────────
  // Top contributors: dimensions with a real score, sorted by contribution desc
  const contributors: DimensionContribution[] = grounded.dimensions
    .filter(d => typeof d.rawScore === 'number' && d.weight > 0)
    .map(d => ({
      dimension:    d.key,
      score:        d.rawScore!,
      weight:       d.weight,
      contribution: d.rawScore! * d.weight * 10,
    }))
    .sort((a, b) => b.contribution - a.contribution)

  const evidenceGaps = grounded.dimensions
    .filter(d => d.weight === 0)
    .map(d => d.key)

  const marketStage = classifyMarketStage(avgCompetitorReviews, competitorCount)
  const entryType   = classifyEntryType(contributors)
  const whyApproved = buildWhyApproved(
    m, monthlySearches, tiktokViews, reviewConcentration, avgCompetitorReviews,
    contributors, safetyClean,
  )
  const patternTags = buildPatternTags(
    monthlySearches, searchGrowthPct, tiktokViews, reviewConcentration,
    avgCompetitorReviews, competitorCount, safetyClean, !!ci, mfgScore,
  )

  const opportunityPattern: OpportunityPattern = {
    market_stage:     marketStage,
    entry_type:       entryType,
    top_contributors: contributors.slice(0, 3),
    evidence_gaps:    evidenceGaps,
    why_approved:     whyApproved,
    pattern_tags:     patternTags,
  }

  return {
    memo_id:               memoId,
    user_id:               userId,
    product_name:          m.category_name,
    product_query:         m.product_query ?? null,
    category:              m.product_query?.split(' ')[0] ?? m.category_name,
    scoring_engine_version: m.scoring_version ?? 'unknown',

    opportunity_score:  grounded.score,
    verdict:            'ENTRY_SUPPORTED',
    verdict_confidence: verdictConfidence,

    monthly_search_volume:   monthlySearches,
    top_keyword:             topKw?.keyword ?? null,
    search_growth_pct:       searchGrowthPct,
    google_trends_direction: googleTrendsDir,

    tiktok_view_count: tiktokViews,
    tiktok_signal:     tiktokSignal,

    review_concentration:   reviewConcentration,
    competitor_count:       competitorCount,
    avg_competitor_reviews: avgCompetitorReviews,
    price_range_low:        priceRangeLow,
    price_range_high:       priceRangeHigh,

    gross_margin_pct:   grossMarginPct !== null ? Math.round(grossMarginPct * 10) / 10 : null,
    cac_pressure_score: cacPressureScore,
    fee_burden_score:   feeBurdenScore,

    consumer_pain_score:      consumerPainScore,
    consumer_review_count:    ci?.totalReviewsCollected ?? null,
    consumer_negative_pct:    ci?.sentimentBreakdown.negativePct ?? null,
    consumer_theme_count:     themeCount,
    repurchase_language_rate: repurchaseRate !== null ? Math.round(repurchaseRate * 1000) / 1000 : null,

    manufacturing_feasibility_score: mfgScore,
    unit_cost_low:  realisticCogs?.low  ?? null,
    unit_cost_high: realisticCogs?.high ?? null,

    safety_gate_clean:       safetyClean,
    fda_recall_count:        fdaRecalls,
    fda_adverse_event_count: fdaAdverse,

    score_demand:               dimScore('demand'),
    score_market_accessibility: dimScore('marketAccessibility'),
    score_profitability:        dimScore('profitability'),
    score_consumer_pain:        dimScore('consumerPain'),
    score_virality:             dimScore('virality'),
    score_subscription:         dimScore('subscription'),
    score_manufacturing:        dimScore('manufacturing'),

    evidence_breadth_pct:   grounded.evidenceBreadth.pct,
    contributing_providers: grounded.evidenceBreadth.contributingProviders,

    opportunity_pattern: opportunityPattern,
  }
}
