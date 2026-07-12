// ── Dimension → eligible channels map ────────────────────────────────────────
//
// Which channels a given scoring dimension can EVER structurally draw from,
// grounded directly in lib/scoring.ts's compute functions (not guessed —
// each line below cites the function and provider it read from at the time
// this map was written). This is a v1 approximation, not a per-query exact
// trace: it does not distinguish which specific real provider fed THIS
// exact dimension on THIS exact query — see independence.ts for how it's
// intersected with real per-query evidence (EvidenceBreadth.channelBreakdown)
// to stay honest rather than fabricating confirmation.
//
// ARCHITECTURE CONSTRAINT: this is a read-only external map, not a change to
// lib/scoring.ts. Zero lines in lib/scoring.ts were modified to build it.
//
// Sources (lib/scoring.ts, as of Milestone 2 / SCORING_ENGINE_VERSION 2.7.0):
//   computeDemand (L346-391): dataforseo primary; falls back to
//     se.demand/se.growth, whose real sources (per detectContributingProviders,
//     L296-307) can be keepa, google-trends, or reddit.
//   computeMarketAccessibility (L467-504): se.review_velocity (apify-amazon-search,
//     0.45) + se.competition (keepa, 0.30) + keyword difficulty (dataforseo,
//     0.25) + review moat (dataforseo + apify-amazon-search, 0.10).
//   computeProfitability (L577+): realisticPrice from se.pricing (keepa) or
//     review_velocity.top_competitors (apify-amazon-search); fee burden from
//     Keepa fee schedule; margin from manufacturing_estimate (apify-alibaba)
//     + price; CAC pressure from keyword cpc (dataforseo).
//   consumerPainScore (L685+) / subscriptionScore (L735+): both read
//     m.consumer_intelligence, populated exclusively from Apify Amazon
//     reviews (apify-amazon-reviews).
//   virality (assembleDimensions, se.virality): tiktok primary, reddit
//     secondary, meta-ads added Milestone 5 (providers/meta-ads.ts) — all
//     three per detectContributingProviders. meta-ads maps to the SAME
//     social_community channel as tiktok/reddit (see lib/scoring.ts
//     PROVIDER_CHANNEL comment — this codebase's 5-channel taxonomy
//     predates the V2 Blueprint's 7-channel model, which has a distinct
//     paid-media channel; that split is Roadmap M1.3, not yet
//     implemented). Consequence: if both tiktok and meta-ads fire on the
//     same query, they collapse to ONE channel witness at the higher of
//     the two reliabilities (meta-ads 0.65 > tiktok 0.45), per the
//     existing same-channel max-reliability rollup — meta-ads alone does
//     not increase demand's channel-independence count beyond what
//     tiktok/reddit already provided, unless it's the only one of the
//     three that fires.
//   manufacturingFeasibilityScore (L757+): m.manufacturing_estimate, from
//     apify-alibaba exclusively.

import type { ChannelType } from '@/lib/scoring'

export const DIMENSION_ELIGIBLE_CHANNELS: Record<string, ChannelType[]> = {
  demand:               ['search_seo', 'amazon_marketplace', 'social_community'],
  marketAccessibility:  ['amazon_marketplace', 'search_seo'],
  profitability:        ['amazon_marketplace', 'manufacturing_supply', 'search_seo'],
  consumerPain:         ['amazon_marketplace'],
  virality:             ['social_community'],
  subscription:         ['amazon_marketplace'],
  manufacturing:        ['manufacturing_supply'],
}

// Which real providers (within an eligible channel) a given dimension can
// draw from — used to select the correct provider(s) to look up a
// reliability prior for, rather than crediting a dimension with a provider
// that contributed to a DIFFERENT dimension within the same channel (e.g.
// marketAccessibility's amazon_marketplace eligibility is {keepa,
// apify-amazon-search}, not apify-amazon-reviews, which only ever feeds
// consumerPain/subscription).
export const DIMENSION_ELIGIBLE_PROVIDERS: Record<string, string[]> = {
  demand:               ['dataforseo', 'keepa', 'google-trends', 'reddit'],
  marketAccessibility:  ['apify-amazon-search', 'keepa', 'dataforseo'],
  profitability:        ['keepa', 'apify-amazon-search', 'apify-alibaba', 'dataforseo'],
  consumerPain:         ['apify-amazon-reviews'],
  virality:             ['tiktok', 'reddit', 'meta-ads'],
  subscription:         ['apify-amazon-reviews'],
  manufacturing:        ['apify-alibaba'],
}
