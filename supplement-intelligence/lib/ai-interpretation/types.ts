// ── AI Interpretation Layer — SynthesisInput contract ─────────────────────
// Version 1.0.0 (2026-07-05)
//
// The strict typed boundary between the Scoring Engine and the AI
// Interpretation Layer. The AI receives ONLY this object — never raw provider
// data, never ASINs, never provider names, never individual review text.
//
// Every field is either:
//   (a) deterministic output of the scoring engine, or
//   (b) a normalized aggregation that strips provider-specific identifiers.
//
// See docs/TECHNICAL_SPEC_V1.md §3 for the complete contract specification.
// See docs/CONSTITUTION.md Law 5 for the AI-boundary enforcement requirement.

// ── Primitive union types ─────────────────────────────────────────────────

export type VerdictLabel =
  | 'ENTRY_SUPPORTED'
  | 'VALIDATION_REQUIRED'
  | 'ENTRY_NOT_SUPPORTED'

export type ConfidenceTier = 'HIGH' | 'MODERATE' | 'LOW'

export type SignalId =
  | 'demand'
  | 'market_accessibility'
  | 'consumer_pain'
  | 'virality'
  | 'manufacturing_feasibility'
  | 'subscription_potential'
  | 'profitability'

export type RiskType =
  | 'REVIEW_MOAT'
  | 'MARKET_SATURATION'
  | 'DEMAND_UNCERTAINTY'
  | 'COST_STRUCTURE'
  | 'THIN_CONSUMER_DATA'
  | 'COMPETITOR_FORMULA_PARITY'
  | 'SEASONALITY'
  | 'DEMAND_CONCENTRATION'
  | 'VIRALITY_ABSENCE'
  | 'CATEGORY_ACCESSIBILITY'

export type RiskSeverity = 'HIGH' | 'MODERATE' | 'LOW'

export type TrendDirection = 'UP' | 'STABLE' | 'DOWN' | 'SEASONAL' | 'INSUFFICIENT'

export type ViralityStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'ABSENT'

export type ExclusionReason =
  | 'THIN_CORPUS'
  | 'PROVIDER_FAILURE'
  | 'INSUFFICIENT_DATA'
  | 'CONSUMER_OPPORTUNITY_EXCLUSION'

// ── Signal summary ────────────────────────────────────────────────────────
// No raw data. No provider names. No score weights.
// Just the scored result with a template-generated headline and one stat.

export interface SynthesisSignal {
  id:              SignalId
  display_label:   string         // human-readable label
  score:           number         // 0–10, one decimal place
  confidence:      ConfidenceTier
  headline:        string         // ≤ 8 words, template-generated — never AI-written
  supporting_stat: string         // ≤ 30 chars, specific number with unit
}

// ── Consumer cluster (normalized VoC — NO raw review text) ────────────────
// exampleQuote from ThemeInsight MUST NOT appear here.

export interface ConsumerCluster {
  label:         string               // normalized complaint category label
  frequency:     number               // count of reviews mentioning this cluster
  frequency_pct: number               // 0–100, integer
  sentiment:     'NEGATIVE' | 'MIXED'
}

// ── Risk evidence ─────────────────────────────────────────────────────────
// Specific numeric values that triggered the primary risk classification.
// Only fields relevant to the classified risk type are populated.

export interface RiskEvidence {
  review_moat_score?:             number
  meaningful_competitor_count?:   number
  avg_review_count?:              number
  review_concentration_ratio?:    number
  keyword_concentration_ratio?:   number
  top_keyword?:                   string
  top_keyword_pct?:               number
  corpus_size?:                   number
  moq_min?:                       number
  unit_cost_min?:                 number
  cogs_ratio?:                    number   // unit_cost_min / median_price
  median_price?:                  number
  seasonal_peak_ratio?:           number
  trend_direction?:               string
  demand_signal_count?:           number
  monthly_search_volume?:         number
  top_hashtag_volume?:            number
  top_hashtag?:                   string
  market_accessibility_score?:    number
  competitor_formula_similarity?: number
}

// ── Excluded signal record ────────────────────────────────────────────────

export interface ExcludedSignal {
  signal_id: SignalId
  reason:    ExclusionReason
}

// ── Confidence flag ───────────────────────────────────────────────────────

export interface ConfidenceFlag {
  code:    string
  message: string
}

// ── Keyword summary (top 3 only — NOT the full keyword array) ────────────

export interface KeywordSummary {
  total_monthly_volume: number
  top_3_keywords:       Array<{ keyword: string; volume: number }>
  trend_direction:      TrendDirection
}

// ── Competitor context (brands + aggregates — NO ASINs, NO raw listings) ─
// productId, bullets, breadcrumb, ingredients_label MUST NOT appear here.

export interface CompetitorContext {
  meaningful_competitor_count: number
  avg_review_count:            number
  review_concentration_ratio:  number   // 0–1
  avg_rating:                  number | null
  top_competitors:             Array<{
    brand:        string   // brand name only
    price:        number   // USD
    review_count: number
  }>  // maximum 3 entries
}

// ── Manufacturing context ─────────────────────────────────────────────────

export interface ManufacturingContext {
  moq_range:       { min: number; max: number } | null
  unit_cost_range: { min: number; max: number } | null
  feasibility:     'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
}

// ── Demand calibration ────────────────────────────────────────────────────
// Scale context for AI interpretation — NOT a financial projection.

export interface DemandCalibration {
  monthly_search_volume: number | null
  keepa_monthly_units:   number | null
  price_range: {
    median: number
    p25:    number
    p75:    number
  } | null
}

// ── Virality context ──────────────────────────────────────────────────────

export interface ViralityContext {
  signal_strength:    ViralityStrength
  top_hashtag_volume: number | null
  top_hashtag:        string | null
}

// ── Primary risk ──────────────────────────────────────────────────────────

export interface PrimaryRisk {
  type:     RiskType
  severity: RiskSeverity
  evidence: RiskEvidence
}

// ── SynthesisInput — the complete AI contract ─────────────────────────────
// This is the ONLY object the AI Interpretation Layer receives.
// Constructed by buildSynthesisInput() in builder.ts.
// Validated by validateSynthesisInput() in validate.ts before every AI call.
// See docs/TECHNICAL_SPEC_V1.md §3 for every field specification.
//
// PROHIBITED fields (never appear here — see CONSTITUTION Law 5):
//   productsAnalyzed, exampleQuote, productId/ASIN, ingredients_label,
//   bullets, provider names (keepa/apify/dataforseo/tiktok), cache_key,
//   raw_input, full keyword arrays (> 3 entries), full competitor arrays (> 3)

export interface SynthesisInput {
  // ── Query context ─────────────────────────────────────────────────────
  query:          string    // original user query
  category:       string    // resolved category name
  analysis_date:  string    // ISO date only — YYYY-MM-DD

  // ── Verdict (deterministic — AI explains, never produces) ────────────
  verdict:             VerdictLabel
  verdict_confidence:  ConfidenceTier
  overall_score:       number          // 0–100 integer, for AI calibration only

  // ── Signals ───────────────────────────────────────────────────────────
  signals: SynthesisSignal[]           // only successfully scored signals

  // ── Primary risk ──────────────────────────────────────────────────────
  primary_risk: PrimaryRisk

  // ── Consumer intelligence ─────────────────────────────────────────────
  consumer_clusters: ConsumerCluster[] // top 3 only — no raw review text
  thin_corpus:       boolean
  corpus_size:       number

  // ── Keyword context ───────────────────────────────────────────────────
  keyword_summary: KeywordSummary | null  // null when no keyword data available

  // ── Competition context ───────────────────────────────────────────────
  competitor_context: CompetitorContext | null

  // ── Manufacturing context ─────────────────────────────────────────────
  manufacturing_context: ManufacturingContext | null

  // ── Demand calibration ────────────────────────────────────────────────
  demand_calibration: DemandCalibration | null

  // ── Virality context ──────────────────────────────────────────────────
  virality_context: ViralityContext | null

  // ── Evidence quality ──────────────────────────────────────────────────
  excluded_signals:  ExcludedSignal[]
  confidence_flags:  ConfidenceFlag[]
}

// ── Validation result ─────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean
  errors: string[]
}
