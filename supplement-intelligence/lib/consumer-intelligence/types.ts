// ── Consumer Intelligence — public output types ────────────────────────────
//
// Every list here is a ranked-by-review-count output of deterministic phrase
// clustering (see cluster.ts) over real, collected review text (see
// providers/apify.ts). Nothing here is LLM-generated or paraphrased.
//
// Field-naming note: the 8 fields requested map onto 4 underlying computed
// lists, not 8 independent signals — "Top Complaints" is the top-5 of
// negativeThemes; "Customer Pain Points" and "Negative Themes" are the same
// full negativeThemes list; "What Customers Love" is the top-5 of
// positiveThemes. This is disclosed in the UI rather than computed twice.

export interface ThemeInsight {
  label:        string   // real phrase pulled from review text, not invented
  mentionedBy:  number    // distinct reviews containing this phrase
  outOf:        number    // size of the pool this was computed over (e.g. negative reviews)
  exampleQuote: string    // one full, real sentence containing the phrase
}

// Step 3 extension: ThemeInsight with cross-competitor attribution.
// Present on categoryGapThemes and productSpecificThemes; absent on
// negativeThemes (which retains the pre-Step-3 shape for backward compat).
export interface CorrelatedThemeInsight extends ThemeInsight {
  competitorCount: {
    total:     number   // distinct ASINs in this analysis
    withTheme: number   // distinct ASINs whose critical reviews contain this theme
  }
  competitorCoverage: number   // withTheme / total, 0–1
  isCategoryGap:      boolean  // true if withTheme >= 2
}

export interface SentimentBreakdown {
  avgRating:    number
  totalReviews: number
  distribution: { star: 1 | 2 | 3 | 4 | 5; count: number; pct: number }[]
  positivePct:  number   // 4-5 star, % of totalReviews
  neutralPct:   number   // 3 star
  negativePct:  number   // 1-2 star
}

// Generic field name on purpose (2026-06-26): every current source is an
// Amazon ASIN via Apify, but nothing in this report's shape should assume
// that — a future non-Amazon review source populates the same field with
// its own product identifier.
export interface SourceProduct {
  productId:        string
  brand:            string
  reviewsCollected: number
}

export interface ConsumerIntelligenceReport {
  productsAnalyzed:      SourceProduct[]
  totalReviewsCollected: number
  positivePoolSize:      number   // 4-5★ reviews used for positiveThemes
  negativePoolSize:      number   // post-temporal-filter critical corpus size
  negativeRawPoolSize?:  number   // pre-temporal-filter count (absent on legacy stored memos)

  sentimentBreakdown:    SentimentBreakdown

  negativeThemes:        ThemeInsight[]   // full ranked list (all competitors combined) — backward-compat, backs existing UI
  mostMentionedProblems: ThemeInsight[]   // ranked full list, ALL ratings — catches gripes inside otherwise-positive reviews
  featureRequests:       ThemeInsight[]   // pattern-filtered (wish/want/should/need), ALL ratings
  positiveThemes:        ThemeInsight[]   // ranked full list, 4-5★ pool — backs What Customers Love / Positive Themes

  // Step 3: cross-competitor theme correlation (absent on pre-Step-3 stored memos).
  // categoryGapThemes  = complaints shared by ≥2 distinct competitor ASINs → structural market gap
  // productSpecificThemes = complaints from only 1 ASIN → that brand's execution issue
  // scoring.ts weights category gaps 1.5× and product-specific 0.5× in richness formula.
  categoryGapThemes?:      CorrelatedThemeInsight[]
  productSpecificThemes?:  CorrelatedThemeInsight[]

  // Step 4: feature request separation by corpus origin (absent on pre-Step-4 stored memos).
  // prerequisiteFeatureRequests = "wish/want/need" from CRITICAL reviews — the customer is
  //   dissatisfied and naming something missing. Contributes to Customer Pain scoring.
  // enhancementFeatureRequests  = "wish/want/would love" from POSITIVE reviews — the customer
  //   is happy but wants to improve an already-good product. Enhancement opportunity only,
  //   does NOT increase Customer Pain. Surface in Investor Report as product improvement ideas.
  // Legacy memos (pre-Step-4) lack these fields; scoring falls back to featureRequests.length.
  prerequisiteFeatureRequests?: ThemeInsight[]
  enhancementFeatureRequests?:  ThemeInsight[]

  // Real, deterministic pattern-match over the same review text already
  // collected for the themes above. mentionedBy = distinct reviews containing
  // repurchase language ("reorder", "ran out", "every month", etc.);
  // outOf = Amazon-review pool only (TikTok comments excluded because "subscribe"
  // in a comment context means YouTube subscribe, not product subscription).
  repurchaseLanguage: { mentionedBy: number; outOf: number }

  // TikTok-specific: distinct comments expressing purchase intent
  // ("ordering this", "just bought", "where can I buy", etc.).
  // Only present when tiktokComments source was used.
  tiktokPurchaseIntent?: { mentionedBy: number; outOf: number; hashtag: string }

  // Curated single-word adverse effect / symptom detection, running in parallel
  // with phrase clustering. Only Amazon reviews are scanned (TikTok excluded).
  // Optional: absent when no Amazon reviews were collected.
  // See lib/consumer-intelligence/symptoms.ts for vocabulary and methodology.
  symptomSignals?: import('./symptoms').SymptomSignal[]

  // Which source(s) provided data for this report.
  // 'amazon-reviews' = only Amazon. 'tiktok-comments' = only TikTok.
  // 'mixed' = both sources contributed reviews to the analysis pool.
  dataSource: 'amazon-reviews' | 'tiktok-comments' | 'mixed'

  confidence:  number   // 0-1, driven by review volume — see analyze.ts
  generatedAt: string

  // ── Milestone 7 (Review Engine narrative layer) ──────────────────────────
  // Raw, unprocessed Amazon review text (helpful + critical corpora,
  // deduped) — the SAME real data already collected above for the
  // deterministic theme-clustering pipeline, exposed here so a caller can
  // ALSO feed it to lib/review-narrative (which wraps lib/review-engine)
  // for AI-synthesized narrative commentary, without a second, duplicate,
  // separately-billed review-collection call. This is raw input data, not
  // LLM output — it does not conflict with this file's "nothing here is
  // LLM-generated" rule above. Optional and absent whenever no Amazon
  // reviews were collected; never populated with TikTok comments (their
  // rating=3/synthetic shape isn't a real review and would corrupt
  // ReviewEngine's own rating-distribution logic).
  rawReviewsForNarrative?: {
    id: string; asin: string; title: string; body: string
    rating: number; verified: boolean; helpful_votes: number; date: string
  }[]
}
