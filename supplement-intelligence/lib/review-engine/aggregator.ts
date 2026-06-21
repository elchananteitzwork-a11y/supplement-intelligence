import type {
  ChunkAnalysis,
  ChunkExtraction,
  RankedInsight,
  Severity,
  SentimentDistribution,
  SentimentLabel,
} from './types'

// ── Types ──────────────────────────────────────────────────────────────────

export type ExtractionKey = keyof Omit<ChunkExtraction, 'customer_sentiment'>

export const EXTRACTION_KEYS: ExtractionKey[] = [
  'pain_points',
  'missing_features',
  'requested_improvements',
  'quality_issues',
  'packaging_issues',
  'shipping_issues',
  'price_complaints',
  'positive_themes',
]

export interface AggregatedInsights {
  pain_points:            RankedInsight[]
  missing_features:       RankedInsight[]
  requested_improvements: RankedInsight[]
  quality_issues:         RankedInsight[]
  packaging_issues:       RankedInsight[]
  shipping_issues:        RankedInsight[]
  price_complaints:       RankedInsight[]
  positive_themes:        RankedInsight[]
  avg_rating:             number
  sentiment_distribution: SentimentDistribution
  overall_sentiment:      SentimentLabel
}

// ── Public entry point ─────────────────────────────────────────────────────

export function aggregateChunks(analyses: ChunkAnalysis[]): AggregatedInsights {
  if (!analyses.length) throw new Error('aggregateChunks: no analyses provided')

  const chunkCount = analyses.length

  // Collect raw items per category across all chunks
  const buckets: Record<ExtractionKey, string[]> = {
    pain_points:            [],
    missing_features:       [],
    requested_improvements: [],
    quality_issues:         [],
    packaging_issues:       [],
    shipping_issues:        [],
    price_complaints:       [],
    positive_themes:        [],
  }

  const sentimentCounts: Record<SentimentLabel, number> = {
    'Very Positive': 0,
    'Positive':      0,
    'Mixed':         0,
    'Negative':      0,
    'Very Negative': 0,
  }

  let weightedRatingSum = 0
  let totalReviews      = 0

  for (const chunk of analyses) {
    for (const key of EXTRACTION_KEYS) {
      const items = chunk.extraction[key]
      if (Array.isArray(items)) buckets[key].push(...items)
    }
    const label = chunk.extraction.customer_sentiment
    if (label in sentimentCounts) sentimentCounts[label]++
    weightedRatingSum += chunk.avg_rating * chunk.review_count
    totalReviews      += chunk.review_count
  }

  const dist: SentimentDistribution = {
    very_positive: round2(sentimentCounts['Very Positive'] / chunkCount),
    positive:      round2(sentimentCounts['Positive']      / chunkCount),
    mixed:         round2(sentimentCounts['Mixed']          / chunkCount),
    negative:      round2(sentimentCounts['Negative']       / chunkCount),
    very_negative: round2(sentimentCounts['Very Negative']  / chunkCount),
  }

  return {
    pain_points:            rankInsights(buckets.pain_points,            chunkCount),
    missing_features:       rankInsights(buckets.missing_features,       chunkCount),
    requested_improvements: rankInsights(buckets.requested_improvements, chunkCount),
    quality_issues:         rankInsights(buckets.quality_issues,         chunkCount),
    packaging_issues:       rankInsights(buckets.packaging_issues,       chunkCount),
    shipping_issues:        rankInsights(buckets.shipping_issues,        chunkCount),
    price_complaints:       rankInsights(buckets.price_complaints,       chunkCount),
    positive_themes:        rankInsights(buckets.positive_themes,        chunkCount),
    avg_rating:             totalReviews > 0
      ? Math.round((weightedRatingSum / totalReviews) * 10) / 10
      : 0,
    sentiment_distribution: dist,
    overall_sentiment:      deriveSentiment(dist),
  }
}

// ── Insight ranking ────────────────────────────────────────────────────────

// Group semantically similar strings by their normalised form, count mentions,
// then return each group's most natural representative, ranked by frequency.
function rankInsights(
  items:      string[],
  chunkCount: number,
): RankedInsight[] {
  if (!items.length) return []

  const freq:            Map<string, number> = new Map()
  const representative:  Map<string, string> = new Map()

  for (const item of items) {
    const key = normalise(item)
    if (!key) continue
    freq.set(key, (freq.get(key) ?? 0) + 1)
    // Keep the longest version as the representative (tends to be most descriptive)
    if (!representative.has(key) || item.length > representative.get(key)!.length) {
      representative.set(key, item)
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const frequency = round2(count / chunkCount)
      return {
        insight:       representative.get(key)!,
        frequency,
        mention_count: count,
        severity:      deriveSeverity(frequency),
      }
    })
}

// Normalise to a stable grouping key:
//   "The lid cracks after 2 uses!" → "lid cracks after 2 uses"
// This catches minor phrasing differences across chunks.
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)               // cap key length to prevent runaway keys
}

// ── Sentiment derivation ───────────────────────────────────────────────────

// Weighted sentiment index: 0 = all Very Positive, 4 = all Very Negative
function deriveSentiment(dist: SentimentDistribution): SentimentLabel {
  const idx =
    dist.very_positive * 0 +
    dist.positive      * 1 +
    dist.mixed         * 2 +
    dist.negative      * 3 +
    dist.very_negative * 4

  if (idx < 0.75) return 'Very Positive'
  if (idx < 1.50) return 'Positive'
  if (idx < 2.50) return 'Mixed'
  if (idx < 3.50) return 'Negative'
  return 'Very Negative'
}

function deriveSeverity(frequency: number): Severity {
  if (frequency >= 0.30) return 'High'
  if (frequency >= 0.10) return 'Medium'
  return 'Low'
}

// ── Utils ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
