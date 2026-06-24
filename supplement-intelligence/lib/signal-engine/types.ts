// ── Base ──────────────────────────────────────────────────────────
// Every quantified signal dimension carries a 0–10 score (matching the
// discovery prompt scoring rubric) and a 0–1 confidence value.

export interface SignalScore {
  score:      number  // 0–10
  confidence: number  // 0–1
}

// ── Dimension types ───────────────────────────────────────────────

export interface DemandSignal extends SignalScore {
  // Deliberately NOT populated by any current provider (Keepa measures Amazon
  // purchase activity, Google Trends gives a relative 0–100 index — neither is
  // an absolute search-volume count). Real "Monthly Search Volume" comes only
  // from m.keyword_intelligence (DataForSEO). Kept here for a future provider
  // that can actually measure it; do not backfill with a bucketed guess.
  search_volume?: string
  trend?:         string                    // e.g. "+21% YoY" | "Stable" — real period-over-period computation, not a guess
  signal?:        'Strong' | 'Moderate' | 'Weak'
}

export interface CompetitionSignal extends SignalScore {
  competing_brands?: string                 // e.g. "35–60" — Keepa: sellers-per-listing on the category's top bestsellers
  saturation?:       'Low' | 'Medium' | 'Medium-High' | 'High'
  barrier?:          'Low' | 'Medium' | 'High'
}

export interface RevenueSignal extends SignalScore {
  est_monthly_revenue?:     string   // avg price × avg monthly units sold, across top sellers
  top_seller_revenue?:      string   // single highest-performing product: its own price × its own units sold
  avg_seller_revenue?:      string   // same basis as est_monthly_revenue — explicit alias for the top-seller/average split shown in the UI
  est_monthly_units_sold?:  string   // Keepa's own monthlySold field, averaged across top sellers — real units-sold data, distinct from (and never substituted for) search volume
  // Real rating/review-count, averaged across the same category bestsellers
  // as the fields above — directly observed Amazon facts Keepa mirrors
  // (CSV RATING/COUNT_REVIEWS, requires &rating=1 on the request), not a
  // Keepa-side estimate the way monthlySold/revenue above are.
  avg_rating?:              string   // e.g. "4.6" (out of 5)
  avg_review_count?:        number
}

export interface GrowthSignal extends SignalScore {
  yoy_change?: string                       // e.g. "+35%" | "-10%"
  momentum?:   'Accelerating' | 'Stable' | 'Decelerating'
}

export interface SeasonalitySignal extends SignalScore {
  // 10 = perfectly perennial (ideal for subscription), 0 = heavily seasonal
  peak_months?: string[]                    // e.g. ["Nov", "Dec"]
  pattern?:     'Perennial' | 'Seasonal' | 'Event-driven'
}

export interface PricingSignal extends SignalScore {
  avg_price?:      string                   // e.g. "$28"
  price_range?:    string                   // e.g. "$18–$45"
  premium_viable?: boolean                  // can a premium brand win at 20%+ above avg?
}

export interface ViralitySignal extends SignalScore {
  tiktok?:           'High' | 'Medium' | 'Low'
  content_potential?: 'High' | 'Medium' | 'Low'
  ugc?:              'High' | 'Medium' | 'Low'
  // Raw numbers behind the labels above — real statsV2 values from TikTok's
  // public hashtag endpoint (see providers/tiktok.ts). Previously computed
  // and logged, then discarded; now kept so the UI can show the actual
  // evidence instead of only the derived High/Medium/Low bucket.
  video_count?:      number
  view_count?:       number
  hashtag?:          string   // e.g. "guthealth" — which hashtag this came from
}

export interface ReviewVelocitySignal extends SignalScore {
  monthly_reviews?: string                  // e.g. "180/product/month"
  sentiment?:       'Positive' | 'Mixed' | 'Negative'
  avg_rating?:      string                  // e.g. "4.3"
  // Real review-based market-accessibility signal (lib/signal-engine/providers/reviews.ts,
  // Rainforest organic search results for this exact query — not a category-wide average).
  // Lives here rather than on CompetitionSignal: when two providers both populate the same
  // dimension, the engine keeps only the higher-confidence provider's non-numeric fields
  // (see engine.ts aggregateDimension), and Keepa already owns `competition`. This dimension
  // is currently uncontested, so nothing here gets silently dropped on merge.
  meaningful_competitor_count?: number   // distinct brands among top organic results with a non-trivial review count
  avg_review_count?:           number    // average ratings_total across those top results
  review_concentration_ratio?: number    // 0–1 — share of all reviews held by the #1 result; higher = more entrenched incumbent, harder to break in
}

// ── Provider output ───────────────────────────────────────────────
// What a single provider returns for a given category.
// All dimension fields are optional — providers only populate what they can verify.

export interface ProviderSignals {
  demand?:          DemandSignal
  competition?:     CompetitionSignal
  growth?:          GrowthSignal
  seasonality?:     SeasonalitySignal
  pricing?:         PricingSignal
  virality?:        ViralitySignal
  review_velocity?: ReviewVelocitySignal
  revenue?:         RevenueSignal

  provider:   string   // provider name, e.g. "keepa"
  fetched_at: string   // ISO timestamp
  confidence: number   // 0–1 overall confidence in this batch of signals
}

// ── Aggregated output ─────────────────────────────────────────────
// Engine output after merging all provider signals.

export interface AggregatedDimension<T extends SignalScore> {
  value:         T
  sources:       string[]   // every provider that contributed to the blended score
  primarySource: string     // which single provider's non-numeric fields (strings) ended up in `value` — only `score`/`confidence` are ever blended across providers, so a citation naming all of `sources` for a specific string field would overstate how many providers actually back it
  confidence:    number      // weighted-average confidence
}

export interface AggregatedSignals {
  demand?:          AggregatedDimension<DemandSignal>
  competition?:     AggregatedDimension<CompetitionSignal>
  growth?:          AggregatedDimension<GrowthSignal>
  seasonality?:     AggregatedDimension<SeasonalitySignal>
  pricing?:         AggregatedDimension<PricingSignal>
  virality?:        AggregatedDimension<ViralitySignal>
  review_velocity?: AggregatedDimension<ReviewVelocitySignal>
  revenue?:         AggregatedDimension<RevenueSignal>

  providers_used:     string[]
  overall_confidence: number   // avg across all populated dimensions
}

// ── Provider contract ─────────────────────────────────────────────
// Every provider implements exactly this interface.
// fetch() returns null when: no API key, category not found,
// network error, or data too thin to trust.

// CONFIRMED BUG (2026-06-24): providers used to receive a single bare
// `category: string` that was actually the user's free-text query, not a
// category id. Keepa and Reddit both hardcode a category-specific Amazon
// node / subreddit list and never checked which category was actually being
// analyzed, so a beauty/pet/fitness/home query would silently get real
// supplement-category bestseller data back, indistinguishable from genuine
// evidence for that query. `categoryId` lets a provider that only makes
// sense for one category refuse to answer for any other, rather than
// guessing or substituting the wrong category's real data.
export interface SignalContext {
  query:       string    // free-text idea/category-name text — what most providers actually search for
  categoryId?: string    // resolved category module id (e.g. 'supplements') — undefined if not resolved yet
}

export interface SignalProvider {
  readonly name:    string
  readonly enabled: boolean
  fetch(ctx: SignalContext): Promise<ProviderSignals | null>
}
