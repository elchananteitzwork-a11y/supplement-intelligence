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
  search_volume?:  string
  trend?:          string                    // e.g. "+21% YoY" | "Stable" — real period-over-period computation, not a guess
  signal?:         'Strong' | 'Moderate' | 'Weak'
  // Which Keepa sub-signal drove the score — 'monthlySold' when Keepa's real
  // monthly units figure was available; 'bsr' when the score was BSR-derived.
  // Used in scoring.ts to build a more informative sourceLabel.
  primary_signal?: 'monthlySold' | 'bsr'
  // Real Google Trends interestByRegion data (CONFIRMED VIA LIVE CALL
  // 2026-06-27) — same free, unofficial provider already in use, a second
  // real endpoint it exposes beyond interestOverTime. US states ranked by
  // relative search interest for this exact query — a geographic demand-
  // concentration signal that doesn't exist anywhere else in this codebase.
  top_regions?: string[]
  // CONFIRMED VIA LIVE CALL 2026-07-08: real monthlySoldHistory time-series
  // decoded from Keepa's [keepaTimestamp, units, ...] array. YoY compares the
  // same 3-month window last year vs today. Absent when < 14 months of history.
  annual_growth_rate?: number   // YoY % change in units sold (positive = growing)
  // 3-month rolling average vs 12-month rolling average — leading indicator of
  // acceleration or deceleration before it shows up in BSR delta.
  momentum_3m_pct?: number      // % deviation of last-3-month avg from last-12-month avg
}

export interface CompetitionSignal extends SignalScore {
  competing_brands?: string                 // e.g. "35–60" — Keepa: sellers-per-listing on the category's top bestsellers
  saturation?:       'Low' | 'Medium' | 'Medium-High' | 'High'
  barrier?:          'Low' | 'Medium' | 'High'
  // Phase 1 / Phase 3 Keepa expansion (2026-07-08): deterministic fields derived
  // from brand names and offer-count history in the Keepa /product response.
  // All null-safe — absent rather than guessed when data is missing.
  distinct_brand_count?:    number        // unique brands among relevant competitors
  top_brand_review_share?:  number        // 0–1 fraction of total reviews held by most-reviewed brand
  seller_count_trend?:      'Growing' | 'Stable' | 'Shrinking'  // 3-point offer-count trajectory
  market_maturity?:         'Nascent' | 'Growing' | 'Mature' | 'Saturated'
  // Sprint 2 additions (2026-07-08): all CONFIRMED VIA LIVE CALL on 5+ products.
  // listedSince encodes as Keepa minutes; decoded via unix = 1293840000 + mins*60.
  avg_listing_age_months?:  number        // median listing age of category products (months)
  // outOfStockPercentage90[0] = Amazon price slot OOS% over 90 days.
  // 0% = Amazon always in stock (direct competition); 68–99% = Amazon rarely sells (accessible).
  amazon_oos_pct?:          number        // median Amazon OOS% across category products
  // stats.buyBoxIsAmazon / buyBoxSellerId='ATVPDKIKX0DER' without buybox=1 parameter.
  amazon_buybox_pct?:       number        // fraction of products where Amazon holds the buy box
  // From variations[].length (numberOfVariations absent — use array length instead).
  avg_variation_count?:     number        // median variation family size among competitors
}

export interface RevenueSignal extends SignalScore {
  est_monthly_revenue?:     string   // avg price × avg monthly units sold, across top sellers
  top_seller_revenue?:      string   // single highest-performing product: its own price × its own units sold
  est_monthly_units_sold?:  string   // Keepa's own monthlySold field, averaged across top sellers — real units-sold data, distinct from (and never substituted for) search volume
  // Real rating/review-count, averaged across the same category bestsellers
  // as the fields above — directly observed Amazon facts Keepa mirrors
  // (CSV RATING/COUNT_REVIEWS, requires &rating=1 on the request), not a
  // Keepa-side estimate the way monthlySold/revenue above are.
  avg_rating?:              string   // e.g. "4.6" (out of 5)
  avg_review_count?:        number
  // Real Amazon fee-schedule data, mirrored by Keepa per-product (CONFIRMED
  // VIA LIVE CALL 2026-06-26: top-level `fbaFees.pickAndPackFee` (cents) and
  // `referralFeePercentage` on the Keepa product response — Amazon's own
  // published fee schedule for this product's category/size tier, not a
  // Keepa-side estimate). Added to ground margin figures elsewhere in the
  // memo (currently AI-guessed) in a real fee number.
  avg_fba_pick_pack_fee?:   string   // e.g. "$4.35", averaged across top sellers
  avg_referral_fee_pct?:    number   // e.g. 15, averaged across top sellers
  // How many bestsellers passed the relevance gate and contributed to
  // est_monthly_revenue / top_seller_revenue. Undefined when productRevenues
  // is empty (no relevant bestseller found). Used by provenance tooltips and
  // the RevenueEvidencePanel sample-size note.
  revenue_sample_count?:    number
  // True when est_monthly_revenue was computed from avg_price × avg_monthly_units
  // (category-level fallback) rather than per-product price×monthlySold pairs.
  // Undefined/absent when the per-product method was used (or no revenue at all).
  revenue_is_category_estimate?: boolean

  // Price compression signal (12-month proxy for Kill Switch #4).
  // Negative = prices falling (compression); positive = prices rising.
  // avg90 vs avg365 is a 90-day-vs-12-month comparison — labeled accordingly
  // in the UI. True 24-month compression requires stats=730 (future work).
  price_compression_pct?:   number   // e.g. -8.3 means prices dropped 8.3% vs. 12mo ago
  price_avg_90d?:           number   // avg price over last 90 days (dollars)
  price_avg_365d?:          number   // avg price over last 365 days (dollars)
  // Fix 6 (v2.6.0): true when avgRevenue could not be computed (no relevant
  // price×monthlySold pair and no fallback). score remains 0 (not null) so
  // aggregateDimension() in engine.ts avoids NaN (score * confidence). UI
  // should display "N/A" rather than "$0" when this flag is present.
  revenue_estimate_unavailable?: boolean
  // Sprint 2 additions (2026-07-08): CONFIRMED VIA LIVE CALL 5/5 products.
  // isSNS is a direct boolean on the Keepa product response — no parameter needed.
  // promotions[] contains type:"SNS" entries with discount amounts when enrolled.
  sns_enrolled_pct?: number          // fraction of category products enrolled in Subscribe & Save
  // Sprint 2 /category endpoint (1 token): soldByAmazonPercent + isFBAPercent
  // confirmed live in earlier Keepa API audit. Used for market accessibility context.
  category_fba_pct?: number          // from /category: % of category products FBA-fulfilled
  category_amazon_seller_pct?: number // from /category: % sold directly by Amazon
}

export interface GrowthSignal extends SignalScore {
  yoy_change?: string                       // e.g. "+35%" | "-10%"
  momentum?:   'Accelerating' | 'Stable' | 'Decelerating'
  // Real 90-day % change in Keepa's own monthlySold estimate (CONFIRMED VIA
  // LIVE CALL 2026-06-26: `stats.deltaPercent90_monthlySold` on the Keepa
  // product response — the previously-declared `delta90` field this
  // codebase had typed does not actually exist in Keepa's real response;
  // this is the real field). A more direct demand-momentum measurement than
  // the BSR 90d-vs-365d ratio `momentum` above is derived from — preferred
  // over it when present (see keepa.ts).
  momentum_90d_pct?: number | null
}

export interface SeasonalitySignal extends SignalScore {
  // 10 = perfectly perennial (ideal for subscription), 0 = heavily seasonal
  peak_months?: string[]                    // e.g. ["Nov", "Dec"]
  pattern?:     'Perennial' | 'Seasonal' | 'Event-driven'
  // Raw seasonality coefficient from monthlySoldHistory analysis: 0 = perfectly
  // flat after detrending, >0.5 = strongly seasonal. Absent when derived from
  // BSR-based method (which cannot compute this). Present when monthlySoldHistory
  // time series was available (CONFIRMED VIA LIVE CALL 2026-07-08, 5/5 products).
  seasonal_coefficient?: number
}

export interface PricingSignal extends SignalScore {
  avg_price?:      string                   // e.g. "$28"
  price_range?:    string                   // e.g. "$18–$45"
  premium_viable?: boolean                  // can a premium brand win at 20%+ above avg?
  // Phase 1 Keepa expansion (2026-07-08): additional price-channel fields derived
  // from CSV indices 4 (LIST_PRICE) and 10 (NEW_FBA) and numberOfItems.
  price_per_unit_range?: string             // e.g. "$0.25–$0.83/unit" — corrects for pack size
  fba_price_floor?: string                  // e.g. "$22" — lowest FBA-fulfilled competitor price
  list_price_discount_pct?: number          // avg % below list/MSRP; positive = commodity pressure
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

  // Meta Ad Library fields (providers/meta-ads.ts) — a distinct, real,
  // paid-media corroboration source for this same `virality` composite
  // (sustained ad spend on a category = revealed economic preference, not
  // an attention proxy like TikTok views). engine.ts's generic aggregation
  // already blends any provider that populates `virality`, so tiktok and
  // meta-ads scores are averaged and both listed in `sources` — no
  // aggregation-layer change was needed for this.
  meta_signal?:       'High' | 'Medium' | 'Low'
  ad_count?:          number   // real count of ads found matching the query (bounded — see provider header comment)
  advertiser_count?:  number   // real distinct advertiser (page_id) count among those ads
  active_ad_pct?:     number   // 0–1 fraction of found ads still actively delivering

  // Roadmap M1.5 additions (2026-07-12) — all derived from ad_delivery_start_time
  // / ad_delivery_stop_time already present on every fetched ad, zero extra
  // API cost. See providers/meta-ads.ts's header comment for exactly what
  // each does and does not measure.
  earliest_ad_start?:  string   // ISO date — oldest ad_delivery_start_time in the fetched page
  latest_ad_start?:    string   // ISO date — newest ad_delivery_start_time in the fetched page
  // Proxy for "90-day delta," not a true count-over-time delta (this
  // provider makes one point-in-time request; a real delta needs two
  // requests separated by real time, which no persistence layer exists for
  // yet). Fraction of fetched ads whose start date falls within the last
  // 90 days — a real, single-request signal for "how much of today's ad
  // activity on this niche is newly launched."
  recent_ad_start_pct?: number   // 0–1
  // "Creative longevity" — kept as two separate, honest measurements
  // rather than one blended number, because they answer different
  // questions and blending them would imply a precision neither has alone:
  avg_active_ad_age_days?:         number  // for currently-running ads only: now − start, real elapsed days
  avg_concluded_ad_duration_days?: number  // for ads that have already stopped: stop − start, real total lifespan
}

export interface ReviewVelocitySignal extends SignalScore {
  monthly_reviews?: string                  // e.g. "180/product/month"
  sentiment?:       'Positive' | 'Mixed' | 'Negative'
  avg_rating?:      string                  // e.g. "4.3"
  // Real verbatim Reddit post titles/snippets that matched a pain-language
  // pattern (Reddit provider only — see providers/reddit.ts) — a percentage
  // alone ("38% of posts show pain language") tells you THAT pain exists,
  // not WHAT it actually is; these are the real evidence behind that number,
  // never AI-paraphrased.
  pain_point_examples?: string[]
  // Real review-based market-accessibility signal (lib/signal-engine/providers/competition.ts,
  // Apify Amazon search results for this exact query — not a category-wide average).
  // Lives here rather than on CompetitionSignal: when two providers both populate the same
  // dimension, the engine keeps only the higher-confidence provider's non-numeric fields
  // (see engine.ts aggregateDimension), and Keepa already owns `competition`. This dimension
  // is currently uncontested, so nothing here gets silently dropped on merge.
  meaningful_competitor_count?: number   // distinct brands among top organic results with a non-trivial review count
  avg_review_count?:           number    // average review count across those top results
  review_concentration_ratio?: number    // 0–1 — share of total reviews held by the top 3 results combined; higher = more entrenched incumbents, harder to break in
  // Real per-listing detail behind the aggregates above — same source data,
  // kept itemized so "Meaningful Competitors" can show the actual list
  // (brand/reviews/rating/price), not just a count. productId is also
  // reused by Consumer Intelligence (lib/consumer-intelligence/) to know
  // which real products to pull review text for, instead of re-searching.
  // Generic field name on purpose (2026-06-26): every current provider is
  // Amazon/Keepa-sourced, so productId is always an ASIN today, but nothing
  // above the provider layer should assume that — a future Shopify/Walmart
  // competition provider populates the same field with its own product ID.
  top_competitors?: {
    productId: string; brand: string; reviewCount: number; rating: number; price: number
    // ── Additive (2026-06-26 data-coverage audit) — CONFIRMED VIA LIVE CALL
    // against junglee/amazon-crawler: breadCrumbs (a real category-path
    // string) and features (real bullet-point copy) are both present on
    // every result; there is no separate position/rank field — the actor
    // returns results in real Amazon search-result order, so position is
    // that array index (1-indexed), not invented.
    position?:   number     // 1-indexed real search-result rank for this exact query
    breadcrumb?: string     // e.g. "Health & Household > Vitamins, Minerals & Supplements > Minerals > Magnesium"
    bullets?:    string[]   // real bullet-point copy from the actual listing
    // Real verbatim "Ingredients" label text from the listing's own
    // importantInformation block (CONFIRMED VIA LIVE CALL 2026-06-27:
    // real and present, e.g. "Magnesium (as magnesium glycinate) 120 mg").
    // Stored verbatim, never re-parsed into structured name/dose pairs —
    // label formatting varies too much across brands to parse reliably
    // without risking a wrong structured value being read as more
    // authoritative than the source text actually supports.
    ingredients_label?: string
    // Sprint 3 additions (2026-07-08): CONFIRMED VIA LIVE CALL 5/5 products.
    // listing_age_months decoded from Keepa listedSince field (keepa minutes).
    listing_age_months?: number   // how old this product listing is in months
    variation_count?:    number   // variation family size from Keepa variations[] array
  }[]
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

  // Resilience layer (2026-06-29): mirrors the same field already on
  // NewsIntelligence (lib/news-engine/types.ts) — a provider that errored
  // or returned no usable data for this query, distinct from one that was
  // never registered/enabled at all. providers_used only shows the
  // success side; this is the other half of "clearly indicate which
  // providers succeeded and which failed" rather than silently omitting
  // failures from the response.
  failed_providers?: string[]
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
