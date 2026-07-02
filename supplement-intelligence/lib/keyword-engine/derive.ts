import type { KeywordMetric, KeywordMonthlyPoint, KeywordSeasonality, KeywordForecastPoint, SearchIntent, KeywordOpportunitySignals } from './types'
import { computeSeasonality, MONTH_NAMES } from '@/lib/stats'

// ═══════════════════════════════════════════════════════════════
// Every function here is a disclosed, deterministic formula over real
// DataForSEO fields — never a model call, never invented precision. Each
// formula's assumptions are documented in lib/provenance.ts's matching
// provenance function so the UI can show exactly what was assumed, not
// just that "an estimate" happened.
// ═══════════════════════════════════════════════════════════════

// ── Search intent ────────────────────────────────────────────────────────
// Generic, category-agnostic commerce-language patterns — not category
// words. DataForSEO's related_keywords/live response does not include a
// search_intent_info field (confirmed against the live response shape this
// provider already parses), so this rule-based classifier is the only
// source available; always tagged 'computed', never presented as verified.

const TRANSACTIONAL_PATTERNS = /\b(buy|order|purchase|for sale|shop|discount code|coupon|free shipping)\b/i
const COMMERCIAL_PATTERNS    = /\b(best|top|cheap|cheapest|price|cost|review|reviews|deal|near me)\b/i
const NAVIGATIONAL_PATTERNS  = /\b(login|sign in|official|website|customer service|phone number)\b/i

export function classifySearchIntent(keyword: string): SearchIntent {
  if (NAVIGATIONAL_PATTERNS.test(keyword))  return 'navigational'
  if (TRANSACTIONAL_PATTERNS.test(keyword)) return 'transactional'
  if (COMMERCIAL_PATTERNS.test(keyword))    return 'commercial'
  return 'informational'
}

// ── Opportunity score (0–100) ────────────────────────────────────────────
// 50% log-scaled volume + 25% inverse competition + 25% inverse difficulty.
// Missing competition/difficulty defaults to a neutral 0.5/50 rather than
// being treated as 0 (no real basis to assume "best possible" OR "worst
// possible" when DataForSEO simply has no data point for this keyword).
const VOLUME_CEILING_FOR_NORM = 500_000

export function computeOpportunityScore(m: KeywordMetric): number | null {
  if (m.monthly_searches <= 0) return null
  const normVolume   = Math.min(1, Math.log10(m.monthly_searches + 1) / Math.log10(VOLUME_CEILING_FOR_NORM))
  const competition  = m.competition ?? 0.5
  const difficulty   = m.difficulty ?? 50
  const competitionFactor = 1 - competition
  const difficultyFactor  = 1 - difficulty / 100
  return Math.round(100 * (0.5 * normVolume + 0.25 * competitionFactor + 0.25 * difficultyFactor))
}

// ── Click / conversion potential ─────────────────────────────────────────
// CTR assumption is a disclosed, industry-typical benchmark for a top-3
// organic ranking — not measured for this specific listing, which doesn't
// exist yet. Conversion-rate assumption is tiered by search intent, since
// transactional/commercial searchers convert at a meaningfully different
// rate than informational ones — both bands are disclosed, not precise.
const ASSUMED_TOP3_CTR = 0.20

const CONVERSION_RATE_BY_INTENT: Record<SearchIntent, number> = {
  transactional:  0.10,
  commercial:     0.06,
  navigational:   0.04,
  informational:  0.02,
}

export function computeClickPotential(m: KeywordMetric): number | null {
  if (m.monthly_searches <= 0) return null
  return Math.round(m.monthly_searches * ASSUMED_TOP3_CTR)
}

export function computeConversionPotential(m: KeywordMetric, clickPotential: number | null, intent: SearchIntent): number | null {
  if (clickPotential === null) return null
  return Math.round(clickPotential * CONVERSION_RATE_BY_INTENT[intent])
}

// ── Amazon PPC estimate (Estimated tier — no real Amazon Ads source) ────
// Amazon Ads provider in this codebase is a stub (enabled=false, no
// credentials). This band is derived from this keyword's REAL Google CPC,
// widened by real Amazon competition density (more real competitors here
// → assume bidding pressure trends toward the high end of the band) — not
// a guess made up with no real basis, but explicitly not Amazon-sourced.
export function computeAmazonPpcEstimate(m: KeywordMetric, meaningfulCompetitorCount?: number): { low: number; high: number } | null {
  if (m.cpc === null || m.cpc <= 0) return null
  const competitorPressure = meaningfulCompetitorCount !== undefined
    ? Math.min(1, meaningfulCompetitorCount / 20)
    : 0.5
  const low  = Math.round(m.cpc * (0.4 + 0.2 * competitorPressure) * 100) / 100
  const high = Math.round(m.cpc * (1.1 + 0.5 * competitorPressure) * 100) / 100
  return { low, high }
}

// ── Seasonality (from one keyword's real 12mo history) ──────────────────
export function computeKeywordSeasonality(keyword: string, history: KeywordMonthlyPoint[] | undefined): KeywordSeasonality | null {
  if (!history || history.length < 6) return null
  const points = history.map(h => ({ month: h.month - 1, value: h.volume }))
  const stats  = computeSeasonality(points)
  return {
    pattern:        stats.pattern,
    peak_months:    stats.peakMonths.map(m => MONTH_NAMES[m]),
    low_months:     stats.lowMonths.map(m => MONTH_NAMES[m]),
    stability:      stats.stability,
    source_keyword: keyword,
  }
}

// ── 12-month forecast (seasonal-naive, statistical — not AI) ────────────
// projected[month] = same calendar month last year × (1 + recent YoY trend,
// capped to a sane range). Requires a full real 12-month history; returns
// null rather than projecting from partial data.
const MAX_TREND_FOR_FORECAST = 2.0   // +200%
const MIN_TREND_FOR_FORECAST = -0.5  // -50%

export function computeForecast(history: KeywordMonthlyPoint[] | undefined, growthPct: number | null): KeywordForecastPoint[] | null {
  if (!history || history.length < 12) return null
  const sorted = [...history].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
  const last12 = sorted.slice(-12)

  const trend = Math.max(MIN_TREND_FOR_FORECAST, Math.min(MAX_TREND_FOR_FORECAST, (growthPct ?? 0) / 100))

  return last12.map(point => {
    const nextYear  = point.year + 1
    const projected = Math.max(0, Math.round(point.volume * (1 + trend)))
    return { month: `${nextYear}-${String(point.month).padStart(2, '0')}`, projected_volume: projected }
  })
}

// ── Report-level data completeness (not a model confidence) ─────────────
// Fraction of fetched keywords that have all three of competition,
// difficulty, and cpc present — DataForSEO genuinely lacks these for some
// long-tail keywords, so this reflects real coverage, not invented precision.
export function computeReportConfidence(metrics: KeywordMetric[]): number {
  if (!metrics.length) return 0
  const complete = metrics.filter(m => m.competition !== null && m.difficulty !== null && m.cpc !== null).length
  return Math.round((complete / metrics.length) * 100) / 100
}

// ── Opportunity discovery ─────────────────────────────────────────────
// High Volume + Low Competition, Fastest Growing, Highest Commercial
// Intent, and White-space are all deterministic filters over real/computed
// fields above. "Keywords competitors ignore," "growing on TikTok before
// Amazon," and "weakest incumbent rankings" require data this codebase
// does not have (a SERP/ranked-keywords API call, and time-aligned TikTok
// history respectively — see lib/signal-engine/providers/tiktok.ts's own
// "What this provider CANNOT measure" note) — disclosed here as
// not_buildable rather than silently dropped or faked.
const HIGH_VOLUME_THRESHOLD  = 1_000
const LOW_COMPETITION_CEILING = 0.35
const LOW_DIFFICULTY_CEILING  = 30
const TOP_N = 10

export function buildOpportunitySignals(metrics: KeywordMetric[], competitorKeywordSet: Set<string>): KeywordOpportunitySignals {
  const high_volume_low_competition = metrics
    .filter(m => m.monthly_searches >= HIGH_VOLUME_THRESHOLD && (m.competition ?? 1) <= LOW_COMPETITION_CEILING)
    .sort((a, b) => b.monthly_searches - a.monthly_searches)
    .slice(0, TOP_N)

  const fastest_growing = [...metrics]
    .filter(m => m.growth_pct !== null && m.growth_pct > 0)
    .sort((a, b) => (b.growth_pct ?? 0) - (a.growth_pct ?? 0))
    .slice(0, TOP_N)

  const highest_commercial_intent = metrics
    .filter(m => m.search_intent === 'commercial' || m.search_intent === 'transactional')
    .sort((a, b) => b.monthly_searches - a.monthly_searches)
    .slice(0, TOP_N)

  const white_space = metrics
    .filter(m =>
      m.monthly_searches >= HIGH_VOLUME_THRESHOLD &&
      (m.competition ?? 1) <= LOW_COMPETITION_CEILING &&
      (m.difficulty ?? 100) <= LOW_DIFFICULTY_CEILING &&
      !competitorKeywordSet.has(m.keyword),
    )
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    .slice(0, TOP_N)

  return {
    high_volume_low_competition,
    fastest_growing,
    highest_commercial_intent,
    white_space,
    not_buildable: [
      {
        label:  'Keywords competitors ignore',
        reason: 'Requires a SERP / ranked-keywords data source (e.g. DataForSEO SERP API) to know what competitors actually rank for — not currently integrated.',
      },
      {
        label:  'Keywords growing on TikTok before Amazon',
        reason: 'The integrated TikTok provider only returns cumulative snapshot counts, not historical time-series data — there is no real basis to detect timing lead/lag.',
      },
      {
        label:  'Keywords with weakest incumbent rankings',
        reason: 'Requires live SERP ranking positions per competitor — not currently integrated.',
      },
    ],
  }
}

// ── Apply all derived fields to one real metric, in place of mutation ───
// Never overwrites a real provider-supplied search_intent (search_intent_source
// === 'dataforseo') — only fills the rule-based fallback when the provider
// didn't supply one.
export function enrichMetric(m: KeywordMetric, meaningfulCompetitorCount?: number): KeywordMetric {
  const hasRealIntent  = m.search_intent_source === 'dataforseo' && !!m.search_intent
  const intent          = hasRealIntent ? m.search_intent! : classifySearchIntent(m.keyword)
  const clickPotential  = computeClickPotential(m)
  return {
    ...m,
    search_intent:         intent,
    search_intent_source:  hasRealIntent ? 'dataforseo' : 'computed',
    opportunity_score:     computeOpportunityScore(m),
    click_potential:       clickPotential,
    conversion_potential:  computeConversionPotential(m, clickPotential, intent),
    amazon_ppc_estimate:   computeAmazonPpcEstimate(m, meaningfulCompetitorCount),
  }
}
