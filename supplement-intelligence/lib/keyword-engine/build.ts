import type { KeywordIntelligence, KeywordMetric } from './types'
import { enrichMetric, computeKeywordSeasonality, computeForecast, computeReportConfidence, buildOpportunitySignals } from './derive'
import { buildKeywordClusters, type ClusterInputs } from './cluster'

// ── Deterministic enrichment orchestrator ──────────────────────────────
// Takes a provider's raw KeywordIntelligence (just the 4 original buckets
// + base real fields) plus real context already computed elsewhere in the
// generation pipeline (real competitor brand names, real review-mined
// benefit language) and returns it enriched with clusters, opportunity
// discovery, seasonality, forecast, and per-metric derived scores.
//
// No AI here — every addition is a disclosed formula over real data (see
// derive.ts / cluster.ts). The separate AI Insights narrative pass lives in
// explain.ts and runs AFTER this, taking this function's output as its
// only input — it can describe these numbers, never invent its own.
//
// Provider-agnostic by construction: this only reads the fields already
// defined on KeywordMetric/KeywordIntelligence, so a future second
// provider (Ahrefs, SEMrush) needs zero changes here as long as it
// populates the same typed shape.

export interface EnrichContext {
  competitorBrands?:   string[]
  ownBrand?:            string | null
  realBenefitPhrases?:  string[]
}

function dedupeByKeyword(metrics: KeywordMetric[]): KeywordMetric[] {
  const seen = new Map<string, KeywordMetric>()
  for (const m of metrics) if (!seen.has(m.keyword)) seen.set(m.keyword, m)
  return Array.from(seen.values())
}

export function enrichKeywordIntelligence(raw: KeywordIntelligence, context: EnrichContext = {}): KeywordIntelligence {
  const allMetrics = dedupeByKeyword([
    ...raw.top_buying, ...raw.opportunity, ...raw.long_tail, ...raw.fast_growing,
  ])
  if (!allMetrics.length) return raw

  const competitorBrands = context.competitorBrands ?? []
  const meaningfulCompetitorCount = competitorBrands.length

  const enrichedByKeyword = new Map<string, KeywordMetric>(
    allMetrics.map(m => [m.keyword, enrichMetric(m, meaningfulCompetitorCount)]),
  )
  const reattach = (list: KeywordMetric[]) => list.map(m => enrichedByKeyword.get(m.keyword) ?? m)
  const enrichedAll = Array.from(enrichedByKeyword.values())

  const clusterInputs: ClusterInputs = {
    metrics:            enrichedAll,
    competitorBrands,
    ownBrand:           context.ownBrand ?? null,
    realBenefitPhrases: context.realBenefitPhrases ?? [],
  }
  const clusters = buildKeywordClusters(clusterInputs)
  const competitorKeywordSet = new Set(
    clusters.find(c => c.label === 'Competitor Keywords')?.keywords.map(k => k.keyword) ?? [],
  )

  const topKeyword = [...enrichedAll].sort((a, b) => b.monthly_searches - a.monthly_searches)[0]
  const seasonality   = topKeyword ? computeKeywordSeasonality(topKeyword.keyword, topKeyword.monthly_history) : null
  const forecast_12mo = topKeyword ? computeForecast(topKeyword.monthly_history, topKeyword.growth_pct) : null

  return {
    ...raw,
    top_buying:     reattach(raw.top_buying),
    opportunity:    reattach(raw.opportunity),
    long_tail:      reattach(raw.long_tail),
    fast_growing:   reattach(raw.fast_growing),
    clusters,
    opportunities:  buildOpportunitySignals(enrichedAll, competitorKeywordSet),
    seasonality,
    forecast_12mo,
    confidence:     computeReportConfidence(enrichedAll),
  }
}
