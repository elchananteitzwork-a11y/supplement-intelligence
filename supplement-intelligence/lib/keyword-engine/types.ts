// A single keyword's real metrics — every base field here is either pulled
// directly from DataForSEO or computed with simple, disclosed arithmetic
// over their real monthly_searches history. Nothing here is model output.
export interface KeywordMetric {
  keyword:          string
  monthly_searches: number
  growth_pct:       number | null   // YoY — null when there isn't enough monthly history to compute a trend
  competition:      number | null   // 0–1, DataForSEO's own competition index
  difficulty:       number | null   // 0–100, DataForSEO's own keyword_difficulty
  cpc:              number | null   // USD, real advertiser bid data

  // ── Additive (2026-06-26 Keyword Intelligence Engine expansion) ──
  // Absent on any memo generated before this date — always read with `?.`
  // or `?? null`, never assume presence. All real fields below come from
  // the SAME DataForSEO call already being made (zero new provider cost);
  // computed/estimated fields are deterministic formulas over those real
  // numbers, disclosed via lib/provenance.ts, never model output.

  /** DataForSEO's own pre-computed trend over the trailing month, real. */
  growth_pct_30d?: number | null
  /** DataForSEO's own pre-computed trend over the trailing quarter, real. */
  growth_pct_90d?: number | null
  /** Real 12-month volume history, chronological (oldest first). Powers
   *  the volume/trend/seasonality charts and the 12-month forecast. */
  monthly_history?: KeywordMonthlyPoint[]

  /** Real when DataForSEO supplies it; otherwise a disclosed rule-based
   *  fallback (see cluster.ts classifyIntent) — search_intent_source says which. */
  search_intent?:        SearchIntent | null
  search_intent_source?: 'dataforseo' | 'computed' | null

  /** 0–100, deterministic formula over real volume/competition/difficulty.
   *  See derive.ts computeOpportunityScore for the disclosed formula. */
  opportunity_score?: number | null
  /** Estimated monthly clicks assuming a disclosed top-3-ranking CTR. */
  click_potential?: number | null
  /** Estimated monthly conversions from click_potential × a disclosed,
   *  intent-tiered conversion-rate assumption. */
  conversion_potential?: number | null
  /** No real Amazon Ads source exists in this codebase (provider is a
   *  stub) — this is an explicitly Estimated band derived from real Google
   *  CPC + real Amazon competition density, never a verified fact. */
  amazon_ppc_estimate?: { low: number; high: number } | null
}

export interface KeywordMonthlyPoint {
  year:   number
  month:  number  // 1–12
  volume: number
}

export type SearchIntent = 'commercial' | 'transactional' | 'informational' | 'navigational'

export type KeywordClusterLabel =
  | 'Primary Keywords' | 'Secondary Keywords' | 'Long-tail Keywords'
  | 'Purchase Intent'  | 'Problem-aware Keywords' | 'Benefit Keywords'
  | 'Comparison Keywords' | 'Emerging Keywords'
  | 'Brand Keywords' | 'Competitor Keywords'

export interface KeywordCluster {
  label:    KeywordClusterLabel
  keywords: KeywordMetric[]
  /** Why this cluster was populated this way — shown as a caption, not a tooltip-only afterthought. */
  basis:    string
}

export interface KeywordSeasonality {
  pattern:     'Perennial' | 'Seasonal' | 'Event-driven'
  peak_months: string[]
  low_months:  string[]
  stability:   number  // 0–10, higher = steadier demand
  source_keyword: string  // which real keyword's monthly_history this was computed from
}

export interface KeywordForecastPoint {
  month:            string  // 'YYYY-MM'
  projected_volume: number
}

export interface KeywordOpportunitySignals {
  high_volume_low_competition: KeywordMetric[]
  fastest_growing:              KeywordMetric[]
  highest_commercial_intent:    KeywordMetric[]
  white_space:                  KeywordMetric[]
  /** Honest disclosure of requested detections that have no real data
   *  source in this codebase today — never silently dropped, never faked. */
  not_buildable: { label: string; reason: string }[]
}

export interface KeywordAIInsights {
  summary:           string
  top_opportunities: string
  biggest_risks:     string
  hidden_demand:     string
  keyword_strategy:  string
  seo_strategy:      string
  amazon_strategy:   string
  google_strategy:   string
  generated_at:      string
}

export interface KeywordIntelligence {
  seed_keyword: string

  // Original 4 buckets — unchanged shape, unchanged meaning. Old stored
  // memos and any existing reader keep working exactly as before.
  top_buying:   KeywordMetric[]
  opportunity:  KeywordMetric[]
  long_tail:    KeywordMetric[]
  fast_growing: KeywordMetric[]

  // ── Additive (2026-06-26) — all optional; absent on memos generated
  // before this date.
  clusters?:      KeywordCluster[]
  opportunities?: KeywordOpportunitySignals
  seasonality?:   KeywordSeasonality | null
  forecast_12mo?: KeywordForecastPoint[] | null
  ai_insights?:   KeywordAIInsights | null
  /** 0–1 — real-data completeness across the fetched keyword set (fraction
   *  with real competition+difficulty+cpc present), not a model confidence. */
  confidence?: number

  provider:     string
  fetched_at:   string
}

export interface KeywordProvider {
  readonly name:    string
  readonly enabled: boolean
  fetch(seedKeyword: string): Promise<KeywordIntelligence | null>
}
