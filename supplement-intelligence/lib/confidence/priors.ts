// ── Provider reliability priors ──────────────────────────────────────────────
//
// V2 Blueprint §10, component 2 ("Source reliability — a per-provider
// prior"). Disclosed judgment-call constants, in the same spirit as
// lib/scoring.ts's BASE_WEIGHTS and feeBurdenToScore's 45% denominator —
// real parameters over real data, not fabricated measurements. Every value
// below is a confidence-in-the-measurement-method prior, not a confidence-
// in-this-specific-result number (that's what the independence math in
// independence.ts computes from these).
//
// Calibration path (Roadmap M3.2): once the Verdict Ledger (Milestone 1)
// accumulates enough quarterly re-measurement outcomes, these priors should
// be refit from real calibration data rather than left as launch-time
// judgment calls. PRIORS_VERSION exists so a future refit is traceable and
// comparable against what shipped at launch.
export const PRIORS_VERSION = '1.0.0'

// 0–1. Rationale per provider:
//  - keepa (0.90): structured, direct Amazon-marketplace time-series API —
//    the most authoritative real data source in this codebase.
//  - openfda (0.95): authoritative US government regulatory database —
//    higher than any commercial provider; used only for the safety gate,
//    not a scored dimension, but included for completeness/future use.
//  - dataforseo (0.85): structured third-party search-volume API with its
//    own pre-computed trend fields — real, but one step removed from
//    Google's own reporting.
//  - apify-amazon-search / apify-amazon-reviews (0.75): real scraped data,
//    genuinely observed, but scraper-sourced (no SLA, no schema guarantee)
//    rather than a maintained API — one notch below keepa/dataforseo.
//  - apify-alibaba (0.65): real supplier listings, but coverage and
//    currency vary widely by category — the least uniformly reliable of
//    the "real API/scrape" tier.
//  - meta-ads (0.65): real ad-spend commitment (advertiser page IDs, actual
//    delivery dates) — a genuine revealed-economic-preference signal,
//    arguably stronger in kind than tiktok's view-count attention proxy.
//    Held at the same tier as apify-alibaba rather than higher because the
//    implementation (lib/signal-engine/providers/meta-ads.ts) is bounded to
//    one page of results and US-only targeting by default, and has not yet
//    been live-verified against a real API response in this environment —
//    revisit once confirmed and once real query volume exists to calibrate.
//  - google-trends (0.55): real but normalized/relative units with known
//    rate-limit fragility (see lib/signal-engine/providers/google-trends.ts)
//    — already treated as corroboration-only per the V2 UX Blueprint.
//  - tiktok (0.45): hashtag view counts are an attention proxy, not a
//    transaction signal — "hashtag views ≠ demand" (V2 Blueprint critique).
//  - reddit (0.45): same tier as tiktok when/if credentials are configured
//    (currently structurally disabled — see lib/scoring.ts
//    STRUCTURALLY_DISABLED_PROVIDERS); prior defined now so enabling it
//    later requires no confidence-model change.
export const PROVIDER_RELIABILITY_PRIORS: Record<string, number> = {
  keepa:                  0.90,
  openfda:                0.95,
  dataforseo:             0.85,
  'apify-amazon-search':  0.75,
  'apify-amazon-reviews': 0.75,
  'apify-alibaba':        0.65,
  'meta-ads':             0.65,
  'google-trends':        0.55,
  tiktok:                 0.45,
  reddit:                 0.45,
}

// Conservative fallback for a channel confirmed by a real provider that
// (for any reason — e.g. a future provider not yet in the table above) has
// no explicit prior. Never used to fabricate confidence for a provider that
// didn't actually contribute — only applied to a provider name that IS
// present in evidenceBreadth but missing from this table.
export const DEFAULT_PROVIDER_RELIABILITY = 0.50

export function reliabilityOf(provider: string): number {
  return PROVIDER_RELIABILITY_PRIORS[provider] ?? DEFAULT_PROVIDER_RELIABILITY
}
