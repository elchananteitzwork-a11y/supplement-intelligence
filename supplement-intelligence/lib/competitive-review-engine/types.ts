import type { ReviewReport } from '@/lib/review-engine'

// ── Gap taxonomy ───────────────────────────────────────────────────────────

export type GapCategory =
  | 'pain_point'
  | 'missing_feature'
  | 'quality_issue'
  | 'packaging_issue'
  | 'price_complaint'
  | 'shipping_issue'
  | 'improvement_opportunity'

// ── Market gap (cross-ASIN) ────────────────────────────────────────────────
//
// A MarketGap represents a problem or unmet need that appears across
// multiple competing products. The higher the prevalence, the more
// universal the opportunity.

export interface MarketGap {
  description:   string       // human-readable gap description
  category:      GapCategory
  prevalence:    number       // 0–1: fraction of products that show this gap
  product_count: number       // raw count of ASINs
  asin_examples: string[]     // up to 3 representative ASINs
  severity:      'High' | 'Medium' | 'Low'
}

// ── Winner features ────────────────────────────────────────────────────────
// Positive themes from the highest-rated products — what the market rewards.

export interface WinnerFeature {
  feature:       string
  product_count: number   // how many high-rated products cite this
  avg_rating:    number   // avg rating of those products
}

// ── Per-product insight (summary for the market report) ───────────────────

export interface ProductInsight {
  asin:                   string
  title?:                 string
  brand?:                 string
  bsr?:                   number
  avg_rating:             number
  reviews_collected:      number

  pain_score:             number
  opportunity_score:      number
  market_confidence:      number

  top_complaints:         string[]
  top_requested_features: string[]
  overall_sentiment:      string

  error?:                 string   // set when analysis was partial
}

// ── Competitor resolved from Keepa ─────────────────────────────────────────

export interface Competitor {
  asin:    string
  title?:  string
  brand?:  string
  bsr?:    number
  price?:  number    // USD
}

// ── Intermediate: per-product analysis result ──────────────────────────────

export interface ProductAnalysisResult {
  asin:     string
  report:   ReviewReport | null    // null when collection or analysis failed
  insight:  ProductInsight
}

// ── Final market report ────────────────────────────────────────────────────

export interface MarketReport {
  // Input context
  category_name?:    string
  category_node_id?: number
  asins_analyzed:    string[]
  products_analyzed: number

  // Per-product breakdown (sorted by opportunity_score desc)
  products: ProductInsight[]

  // Market-level scores
  market_pain_score:        number   // 0–10
  market_opportunity_score: number   // 0–10
  market_confidence:        number   // 0–1

  // Cross-ASIN gap tiers (sorted by prevalence desc within each tier)
  universal_gaps: MarketGap[]   // ≥ 70% of products — category-defining problems
  common_gaps:    MarketGap[]   // 40–69% of products — widespread opportunities
  niche_gaps:     MarketGap[]   // < 40% of products — brand-specific or minor

  // AI-curated intelligence
  top_market_gaps:          string[]   // 5 items — highest-impact opportunities
  winner_features:          string[]   // what top-rated products do right

  // AI synthesis
  ai_market_recommendation: string     // strategic positioning advice
  ai_product_brief:         string     // what the winning product should look like

  // Stats
  total_reviews_collected:  number
  total_reviews_analyzed:   number

  // Meta
  analyzed_at:      string
  analysis_version: string
}

// ── Engine options ─────────────────────────────────────────────────────────

export interface CompetitiveEngineOptions {
  max_products:         number   // default: 10
  reviews_per_product:  number   // default: 100
  product_concurrency:  number   // parallel product collection+analysis, default: 3
  sort_by:              'helpful' | 'recent'
  country:              string   // Amazon marketplace ISO code, default: 'US'
  keepa_timeout_ms:     number   // Keepa API timeout, default: 15_000
}
