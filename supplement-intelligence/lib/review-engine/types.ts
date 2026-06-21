// ── Raw review input ───────────────────────────────────────────────────────

export interface RawReview {
  id?:           string
  asin?:         string
  rating:        number      // 1–5 stars
  title?:        string
  body:          string
  date?:         string      // ISO string
  verified?:     boolean
  helpful_votes?: number
}

// ── Per-chunk extraction ───────────────────────────────────────────────────

export type SentimentLabel =
  | 'Very Positive'
  | 'Positive'
  | 'Mixed'
  | 'Negative'
  | 'Very Negative'

export interface ChunkExtraction {
  pain_points:            string[]
  missing_features:       string[]
  requested_improvements: string[]
  quality_issues:         string[]
  packaging_issues:       string[]
  shipping_issues:        string[]
  price_complaints:       string[]
  positive_themes:        string[]
  customer_sentiment:     SentimentLabel
}

export interface ChunkAnalysis {
  chunk_index:  number
  review_count: number
  avg_rating:   number
  rating_dist:  RatingDistribution
  extraction:   ChunkExtraction
  confidence:   number    // 0–1
}

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>

// ── Aggregated insights ────────────────────────────────────────────────────

export type Severity = 'High' | 'Medium' | 'Low'

export interface RankedInsight {
  insight:       string
  frequency:     number    // 0–1 — fraction of chunks that mentioned it
  mention_count: number    // raw chunk count
  severity:      Severity
}

export interface SentimentDistribution {
  very_positive: number   // 0–1 fraction of chunks
  positive:      number
  mixed:         number
  negative:      number
  very_negative: number
}

// ── Final report ───────────────────────────────────────────────────────────

export interface ReviewReport {
  // Input meta
  product_asin?:          string
  total_reviews_input:    number
  total_reviews_analyzed: number
  chunk_count:            number
  sampling_used:          boolean

  // Core scores
  pain_score:        number   // 0–10
  opportunity_score: number   // 0–10
  market_confidence: number   // 0–1

  // Curated top items (human-readable, AI-synthesized)
  top_complaints:         string[]   // 5 items
  top_requested_features: string[]   // 5 items

  // Full ranked breakdowns (all categories)
  pain_points:            RankedInsight[]
  missing_features:       RankedInsight[]
  requested_improvements: RankedInsight[]
  quality_issues:         RankedInsight[]
  packaging_issues:       RankedInsight[]
  shipping_issues:        RankedInsight[]
  price_complaints:       RankedInsight[]
  positive_themes:        RankedInsight[]

  // Sentiment
  avg_rating:             number
  sentiment_distribution: SentimentDistribution
  overall_sentiment:      SentimentLabel

  // AI synthesis
  ai_recommendation: string

  // Meta
  analyzed_at:      string   // ISO
  analysis_version: string   // semver
}

// ── Engine configuration ───────────────────────────────────────────────────

export interface ReviewEngineConfig {
  reviews_per_chunk:  number                     // default: 50
  max_chunks:         number                     // default: 100 (samples if total > this)
  concurrency:        number                     // default: 5 parallel AI calls
  chunk_timeout_ms:   number                     // default: 30_000
  min_body_length:    number                     // skip reviews shorter than this (default: 20)
  sampling_strategy:  'random' | 'stratified'   // default: stratified
  on_progress?:       (completed: number, total: number) => void
}
