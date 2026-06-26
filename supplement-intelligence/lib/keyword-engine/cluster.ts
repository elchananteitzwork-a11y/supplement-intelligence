import type { KeywordMetric, KeywordCluster } from './types'

// ═══════════════════════════════════════════════════════════════
// All 10 clusters are deterministic rules over the real DataForSEO keyword
// list — never an AI classification pass. Word-pattern lists below are
// generic commerce/comparison/problem language usable for any product
// category (the same justified pattern as news-engine/keyword.ts's
// STOPWORDS and dataforseo.ts's own GENERIC_TAIL) — never a category name.
// A keyword can land in more than one cluster (e.g. "best vitamin d3 vs
// d2" is both Purchase Intent and Comparison) except Primary/Secondary,
// which are mutually exclusive volume-rank slices of the same list.
// ═══════════════════════════════════════════════════════════════

const PRIMARY_SIZE   = 10
const SECONDARY_SIZE = 10
const LONG_TAIL_MIN_WORDS = 3

const PURCHASE_INTENT_RE = /\b(buy|best|top|cheap|cheapest|price|cost|discount|deal|sale|order|shop|review|reviews|where to buy|near me)\b/i
const PROBLEM_AWARE_RE   = /\b(why|how to|stop|fix|cure|relief|help with|treatment|symptoms|causes|problem)\b/i
const COMPARISON_RE      = /\b(vs\.?|versus|compare|comparison|or |better than|alternative)\b/i
const EMERGING_MIN_GROWTH = 50  // % YoY

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function containsAny(keyword: string, terms: string[]): boolean {
  const lower = keyword.toLowerCase()
  return terms.some(t => t && lower.includes(t.toLowerCase()))
}

export interface ClusterInputs {
  metrics:            KeywordMetric[]
  competitorBrands?:  string[]   // real, from signal_evidence.review_velocity.top_competitors[].brand
  ownBrand?:          string | null
  /** Real review-mined language (consumer-intelligence positiveThemes/featureRequests
   *  labels) — used to ground "Benefit Keywords" in real customer language
   *  instead of a hardcoded benefit-word dictionary. Empty when unavailable. */
  realBenefitPhrases?: string[]
}

export function buildKeywordClusters(input: ClusterInputs): KeywordCluster[] {
  const { metrics, competitorBrands = [], ownBrand, realBenefitPhrases = [] } = input
  if (!metrics.length) return []

  const byVolumeDesc = [...metrics].sort((a, b) => b.monthly_searches - a.monthly_searches)
  const primary       = byVolumeDesc.slice(0, PRIMARY_SIZE)
  const secondary      = byVolumeDesc.slice(PRIMARY_SIZE, PRIMARY_SIZE + SECONDARY_SIZE)
  const longTail        = byVolumeDesc.filter(m => wordCount(m.keyword) >= LONG_TAIL_MIN_WORDS)
  const purchaseIntent  = metrics.filter(m => PURCHASE_INTENT_RE.test(m.keyword))
  const problemAware    = metrics.filter(m => PROBLEM_AWARE_RE.test(m.keyword))
  const comparison      = metrics.filter(m => COMPARISON_RE.test(m.keyword))
  const emerging        = metrics
    .filter(m => (m.growth_pct ?? 0) >= EMERGING_MIN_GROWTH)
    .sort((a, b) => (b.growth_pct ?? 0) - (a.growth_pct ?? 0))
  const brand           = ownBrand ? metrics.filter(m => containsAny(m.keyword, [ownBrand])) : []
  const competitor       = competitorBrands.length ? metrics.filter(m => containsAny(m.keyword, competitorBrands)) : []
  const benefit          = realBenefitPhrases.length
    ? metrics.filter(m => realBenefitPhrases.some(phrase => phrase && (m.keyword.toLowerCase().includes(phrase.toLowerCase()) || phrase.toLowerCase().includes(m.keyword.toLowerCase()))))
    : []

  const clusters: KeywordCluster[] = [
    { label: 'Primary Keywords',     keywords: primary,       basis: `Top ${PRIMARY_SIZE} keywords by real monthly search volume.` },
    { label: 'Secondary Keywords',   keywords: secondary,      basis: `Next ${SECONDARY_SIZE} keywords by real monthly search volume.` },
    { label: 'Long-tail Keywords',   keywords: longTail,        basis: `Real keywords with ${LONG_TAIL_MIN_WORDS}+ words.` },
    { label: 'Purchase Intent',      keywords: purchaseIntent,  basis: 'Real keywords matching commerce-intent language (buy, best, price, review, etc.).' },
    { label: 'Problem-aware Keywords', keywords: problemAware,  basis: 'Real keywords matching problem/question language (how to, fix, relief, symptoms, etc.).' },
    { label: 'Benefit Keywords',      keywords: benefit,         basis: realBenefitPhrases.length
        ? 'Real keywords overlapping with real customer-praise language mined from actual reviews (Consumer Intelligence).'
        : 'No real review-mined benefit language was available for this product — left empty rather than guessed from a category word list.' },
    { label: 'Comparison Keywords',   keywords: comparison,      basis: 'Real keywords matching comparison language (vs, versus, compare, alternative, etc.).' },
    { label: 'Emerging Keywords',     keywords: emerging,         basis: `Real keywords with ≥${EMERGING_MIN_GROWTH}% YoY growth (DataForSEO real history), sorted by growth.` },
    { label: 'Brand Keywords',        keywords: brand,            basis: ownBrand
        ? `Real keywords containing "${ownBrand}".`
        : 'No brand name was available for this product — this cluster only applies to a named, existing brand.' },
    { label: 'Competitor Keywords',   keywords: competitor,        basis: competitorBrands.length
        ? `Real keywords containing a real competitor brand name found by Competition Intelligence (${competitorBrands.slice(0, 3).join(', ')}${competitorBrands.length > 3 ? ', …' : ''}).`
        : 'No real competitor brand names were available for this query.' },
  ]

  return clusters
}
