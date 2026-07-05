// ── BUILD_NOW Pattern Memory — types ─────────────────────────────────────────
//
// ARCHITECTURE CONSTRAINT: this module is NEVER imported by lib/scoring.ts.
// Pattern memory is read-only during scoring — it records decisions for
// analytics and calibration, never influences them.

export type MarketStage = 'nascent' | 'early_growth' | 'growth' | 'maturing'
export type EntryType   = 'virality_led' | 'demand_led' | 'gap_led' | 'mixed'

export interface DimensionContribution {
  dimension:    string
  score:        number  // 0–10
  weight:       number  // normalised 0–1 as it appears in the final score
  contribution: number  // score × weight × 10 → points contributed to 0-100 total
}

export interface OpportunityPattern {
  market_stage:      MarketStage
  entry_type:        EntryType
  top_contributors:  DimensionContribution[]  // top 3 by contribution
  evidence_gaps:     string[]                 // dimension keys excluded (weight = 0)
  why_approved:      string[]                 // 2–4 data-grounded sentences
  pattern_tags:      string[]                 // machine-readable for clustering
}

// Full record written to build_now_patterns table
export interface BuildNowPattern {
  // ── Identity ──────────────────────────────────────────────────
  memo_id:               string
  user_id:               string
  product_name:          string
  product_query:         string | null
  category:              string
  scoring_engine_version: string

  // ── Decision ──────────────────────────────────────────────────
  opportunity_score:   number
  verdict:             'ENTRY_SUPPORTED'
  verdict_confidence:  'HIGH' | 'MODERATE' | 'LOW'

  // ── Demand ────────────────────────────────────────────────────
  monthly_search_volume: number | null
  top_keyword:           string | null
  search_growth_pct:     number | null
  google_trends_direction: 'Rising' | 'Stable' | 'Declining' | null

  // ── Social ────────────────────────────────────────────────────
  tiktok_view_count:     number | null
  tiktok_signal:         'High' | 'Medium' | 'Low' | null

  // ── Market structure ──────────────────────────────────────────
  review_concentration:  number | null  // 0–1
  competitor_count:      number | null
  avg_competitor_reviews: number | null
  price_range_low:       number | null
  price_range_high:      number | null

  // ── Profitability ─────────────────────────────────────────────
  gross_margin_pct:      number | null
  cac_pressure_score:    number | null  // 0–10
  fee_burden_score:      number | null  // 0–10

  // ── Consumer signals ──────────────────────────────────────────
  consumer_pain_score:        number | null  // 0–10
  consumer_review_count:      number | null
  consumer_negative_pct:      number | null
  consumer_theme_count:       number | null
  repurchase_language_rate:   number | null  // 0–1

  // ── Manufacturing ─────────────────────────────────────────────
  manufacturing_feasibility_score: number | null  // 0–10
  unit_cost_low:                   number | null
  unit_cost_high:                  number | null

  // ── Regulatory ────────────────────────────────────────────────
  safety_gate_clean:       boolean
  fda_recall_count:        number
  fda_adverse_event_count: number

  // ── All 7 scoring dimensions ───────────────────────────────────
  score_demand:              number | null
  score_market_accessibility: number | null
  score_profitability:       number | null
  score_consumer_pain:       number | null
  score_virality:            number | null
  score_subscription:        number | null
  score_manufacturing:       number | null

  // ── Evidence quality ──────────────────────────────────────────
  evidence_breadth_pct:    number
  contributing_providers:  string[]

  // ── Opportunity pattern ───────────────────────────────────────
  opportunity_pattern:  OpportunityPattern
}
