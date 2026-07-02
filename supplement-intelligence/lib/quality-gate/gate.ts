import { Stage1Evidence } from '../evidence/adapter'

// ── Data Quality Gate — deterministic Stage 1 exit gate ───────────────────────
// Grades each demand and competition signal, then makes a binary pipeline
// decision. AI cannot influence this gate — all logic is arithmetic.

export type QualityLevel = 'strong' | 'adequate' | 'thin' | 'missing'
export type OverallGrade = 'sufficient' | 'thin' | 'insufficient'

export interface DimensionQuality {
  level: QualityLevel
  reason: string
  value?: number | string
}

export interface DataQualityAssessment {
  overall: OverallGrade
  pipeline_blocked: boolean
  blocked_reason?: string

  demand_signals_confirmed: number   // how many distinct demand sources crossed threshold
  competitor_products_found: number  // how many meaningful competitors found

  dimensions: {
    search_volume:    DimensionQuality
    competition_data: DimensionQuality
    pricing_data:     DimensionQuality
    growth_data:      DimensionQuality
    virality_data:    DimensionQuality
  }
}

// Demand gate: 2 of these must be confirmed (each from a distinct provider)
// DataForSEO keyword volume: source "dataseo" (populated via KeywordProvider)
// Google Trends relative index: always present when trends run
// Keepa monthly units: available when Keepa returns monthlySold data
// TikTok engagement: present when TikTok video_count > 0
function countDemandSignals(evidence: Stage1Evidence, reviewCount: number): number {
  let count = 0

  // Keepa monthlySold is a primary demand signal (real units sold)
  if (evidence.est_monthly_revenue?.value && evidence.est_monthly_revenue.value > 0) {
    count++
  }

  // Google Trends top_regions confirms demand from real search activity
  if (evidence.top_regions?.value && evidence.top_regions.value.length >= 3) {
    count++
  }

  // TikTok video engagement confirms social demand
  if (evidence.tiktok_view_count?.value && evidence.tiktok_view_count.value > 10_000) {
    count++
  }

  // Amazon review count is a lagging demand proxy (>= 50 reviews across competitors)
  if (reviewCount >= 50) {
    count++
  }

  return count
}

function gradeSearchVolume(evidence: Stage1Evidence): DimensionQuality {
  // At Milestone 1, DataForSEO keyword volume flows through the keyword pipeline
  // (not directly into AggregatedSignals). We grade based on proxy signals instead.
  const revenue = evidence.est_monthly_revenue?.value ?? 0
  if (revenue > 50_000) return { level: 'strong', reason: 'High revenue proxy confirms strong demand', value: revenue }
  if (revenue > 15_000) return { level: 'adequate', reason: 'Moderate revenue proxy suggests real demand', value: revenue }
  if (revenue > 0)      return { level: 'thin', reason: 'Low revenue proxy — weak demand evidence', value: revenue }
  return { level: 'missing', reason: 'No revenue signal available for demand proxy' }
}

function gradeCompetitionData(competitorCount: number): DimensionQuality {
  if (competitorCount >= 15) return { level: 'strong', reason: `${competitorCount} meaningful competitors found`, value: competitorCount }
  if (competitorCount >= 5)  return { level: 'adequate', reason: `${competitorCount} meaningful competitors found`, value: competitorCount }
  if (competitorCount >= 1)  return { level: 'thin', reason: `Only ${competitorCount} competitor(s) found — thin market data`, value: competitorCount }
  return { level: 'missing', reason: 'No meaningful competitors found — cannot assess market' }
}

function gradePricingData(evidence: Stage1Evidence): DimensionQuality {
  if (evidence.median_price?.value && evidence.price_range?.value) {
    return { level: 'strong', reason: 'Both median price and range available', value: evidence.median_price.value }
  }
  if (evidence.median_price?.value) {
    return { level: 'adequate', reason: 'Median price available, range missing', value: evidence.median_price.value }
  }
  return { level: 'missing', reason: 'No price data available' }
}

function gradeGrowthData(evidence: Stage1Evidence): DimensionQuality {
  if (evidence.momentum_90d_pct?.value !== undefined && evidence.yoy_change?.value) {
    return { level: 'strong', reason: 'Both 90d momentum and YoY trend available' }
  }
  if (evidence.momentum_90d_pct?.value !== undefined) {
    return { level: 'adequate', reason: '90-day momentum available' }
  }
  if (evidence.yoy_change?.value) {
    return { level: 'adequate', reason: 'YoY change available' }
  }
  return { level: 'missing', reason: 'No growth signal available' }
}

function gradeViralityData(evidence: Stage1Evidence): DimensionQuality {
  const views = evidence.tiktok_view_count?.value ?? 0
  if (views > 1_000_000) return { level: 'strong', reason: `${(views / 1e6).toFixed(1)}M TikTok views`, value: views }
  if (views > 100_000)   return { level: 'adequate', reason: `${(views / 1e3).toFixed(0)}K TikTok views`, value: views }
  if (views > 0)         return { level: 'thin', reason: `Low TikTok engagement (${views} views)`, value: views }
  return { level: 'missing', reason: 'No TikTok data available' }
}

export function assessDataQuality(
  evidence: Stage1Evidence,
  reviewCount: number
): DataQualityAssessment {
  const competitorCount = evidence.competitor_count?.value ?? 0
  const demandConfirmed = countDemandSignals(evidence, reviewCount)

  const dimensions = {
    search_volume:    gradeSearchVolume(evidence),
    competition_data: gradeCompetitionData(competitorCount),
    pricing_data:     gradePricingData(evidence),
    growth_data:      gradeGrowthData(evidence),
    virality_data:    gradeViralityData(evidence),
  }

  // Pipeline block: EITHER condition alone blocks Stage 2
  const blockDemand      = demandConfirmed < 2
  const blockCompetitors = competitorCount < 5
  const pipeline_blocked = blockDemand || blockCompetitors

  let blocked_reason: string | undefined
  if (blockDemand && blockCompetitors) {
    blocked_reason = `Insufficient market data: only ${demandConfirmed} demand signal(s) confirmed (need ≥2) and only ${competitorCount} meaningful competitor(s) found (need ≥5)`
  } else if (blockDemand) {
    blocked_reason = `Insufficient demand evidence: only ${demandConfirmed} demand signal(s) confirmed across independent providers (need ≥2)`
  } else if (blockCompetitors) {
    blocked_reason = `Market too thin: only ${competitorCount} meaningful competitor(s) found (need ≥5 to assess market viability)`
  }

  // Overall grade: thin = not blocked but weak; insufficient = blocked
  let overall: OverallGrade
  if (pipeline_blocked) {
    overall = 'insufficient'
  } else {
    const weakCount = Object.values(dimensions).filter(d => d.level === 'thin' || d.level === 'missing').length
    overall = weakCount >= 2 ? 'thin' : 'sufficient'
  }

  return {
    overall,
    pipeline_blocked,
    blocked_reason,
    demand_signals_confirmed:  demandConfirmed,
    competitor_products_found: competitorCount,
    dimensions,
  }
}
