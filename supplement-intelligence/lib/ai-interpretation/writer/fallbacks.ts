// ── Deterministic Fallback Templates ──────────────────────────────────────
// Spec §12 Step 5: when AI validation fails after one retry, use these templates.
//
// Requirements per spec §12 Step 5:
//   - Produce grammatically correct, factually accurate output by directly
//     inserting values from SynthesisInput
//   - Never generate claims not supported by the data
//   - Always shorter and less expressive than AI output — this is acceptable
//   - Fallback usage is logged for monitoring via WriterOutput.validation_trace
//
// AT-HALL-003:
//   fallbackCausalParagraph(input) → non-empty string ≤ 160 words
//   fallbackRiskSentence(input)    → non-empty string ≤ 35 words, ends with period
//   fallbackProductThesis(input)   → { headline: string, full_thesis: string }, both non-empty

import type { SynthesisInput } from '../types'
import type { CallCOutput } from './types'

// ── Risk type plain-language descriptions ─────────────────────────────────

const RISK_PLAIN: Record<string, string> = {
  REVIEW_MOAT:               'Incumbent review accumulation',
  MARKET_SATURATION:         'Market saturation',
  DEMAND_UNCERTAINTY:        'Demand uncertainty',
  COST_STRUCTURE:            'Cost structure pressure',
  THIN_CONSUMER_DATA:        'Thin consumer data',
  COMPETITOR_FORMULA_PARITY: 'Competitor formula convergence',
  SEASONALITY:               'Seasonal demand pattern',
  DEMAND_CONCENTRATION:      'Demand concentration',
  VIRALITY_ABSENCE:          'Low viral potential',
  CATEGORY_ACCESSIBILITY:    'Category accessibility barrier',
}

// ── Sentence helpers ──────────────────────────────────────────────────────

function demandSentence(input: SynthesisInput): string {
  const dc = input.demand_calibration
  const ks = input.keyword_summary
  const demandSignal = input.signals.find(s => s.id === 'demand')
  const strength = demandSignal ? scoreToStrength(demandSignal.score) : 'measured'

  if (dc?.monthly_search_volume) {
    const vol = dc.monthly_search_volume.toLocaleString()
    const trend = ks?.trend_direction === 'UP'       ? ', with growing search momentum across the analysis period'
                : ks?.trend_direction === 'DOWN'     ? ', with declining search momentum across the analysis period'
                : ks?.trend_direction === 'SEASONAL' ? ', with seasonal demand variation across the analysis period'
                : ', with stable search momentum across the analysis period'
    const priceNote = dc.price_range
      ? ` Category products are priced between $${dc.price_range.p25} and $${dc.price_range.p75}, with a median of $${dc.price_range.median}.`
      : ''
    return `${input.query} shows ${strength} consumer search demand, with ${vol} monthly searches recorded across keyword platforms${trend}.${priceNote}`
  }
  if (dc?.keepa_monthly_units) {
    const units = dc.keepa_monthly_units.toLocaleString()
    const priceNote = dc.price_range
      ? ` Category products carry a median price of $${dc.price_range.median}, with a range from $${dc.price_range.p25} to $${dc.price_range.p75}.`
      : ''
    return `${input.query} shows ${strength} market demand, with marketplace sales estimates of approximately ${units} units sold monthly.${priceNote}`
  }
  return `${input.query} shows limited measurable demand signal across available data sources, with search volume and marketplace sales data unavailable for this analysis period.`
}

function competitionSentence(input: SynthesisInput): string {
  const cc = input.competitor_context
  if (!cc) return 'Competitive landscape data was not available for this analysis period, limiting the ability to assess incumbent review accumulation and market accessibility.'
  const count = cc.meaningful_competitor_count
  const ratio = cc.review_concentration_ratio
  const avgReviews = cc.avg_review_count.toLocaleString()
  const concentration = ratio >= 0.70 ? 'high review concentration among top brands'
                       : ratio >= 0.50 ? 'moderate review concentration'
                       : 'a distributed review base'
  return `The competitive landscape has ${count} established competitors with an average of ${avgReviews} reviews each, and shows ${concentration} (concentration ratio: ${ratio.toFixed(2)}).`
}

function consumerSentence(input: SynthesisInput): string {
  const clusters = input.consumer_clusters
  if (!clusters.length || input.thin_corpus) {
    return input.thin_corpus && input.corpus_size > 0
      ? `Consumer research is based on a limited corpus of ${input.corpus_size} reviews — additional data would improve reliability.`
      : 'Insufficient consumer review data was available to identify complaint patterns for this category.'
  }
  const top = clusters[0]
  return `Customer research shows ${top.frequency_pct}% of reviewed buyers cite ${top.label} as a primary concern.`
}

function qualificationSentence(input: SynthesisInput): string | null {
  if (input.thin_corpus && input.corpus_size < 20) {
    return `Analysis confidence is limited: the review corpus of ${input.corpus_size} reviews is insufficient to draw firm consumer conclusions.`
  }
  if (input.confidence_flags.some(f => f.code === 'SINGLE_CHANNEL')) {
    return 'This analysis is based on a single data channel; cross-channel validation would strengthen confidence.'
  }
  if (input.confidence_flags.some(f => f.code === 'VIRALITY_UNVERIFIED')) {
    return 'Viral potential data was unavailable for this category.'
  }
  return null
}

function scoreToStrength(score: number): string {
  if (score >= 7.5) return 'strong'
  if (score >= 5.5) return 'moderate'
  if (score >= 3.5) return 'limited'
  return 'weak'
}

// ── AT-HALL-003: Three fallback template functions ────────────────────────

export function fallbackCausalParagraph(input: SynthesisInput): string {
  const sentences: string[] = [
    demandSentence(input),
    competitionSentence(input),
    consumerSentence(input),
  ]
  const qualification = qualificationSentence(input)
  if (qualification) sentences.push(qualification)

  return sentences.join(' ')
}

export function fallbackRiskSentence(input: SynthesisInput): string {
  const { type, severity, evidence } = input.primary_risk
  const riskName = RISK_PLAIN[type] ?? 'Primary risk'

  // Build the most specific sentence possible from evidence fields
  const evidenceStr = buildEvidenceFragment(type, evidence)
  const sentence = evidenceStr
    ? `${riskName} is the primary concern: ${evidenceStr}, which represents a significant barrier to new market entry.`
    : `${riskName} is the primary concern for this market — further validation is required before committing resources.`

  // Hard limit: 35 words. Truncate at last complete word if over.
  const words = sentence.split(/\s+/)
  if (words.length <= 35) return sentence
  return words.slice(0, 34).join(' ') + '.'
}

function buildEvidenceFragment(type: string, ev: SynthesisInput['primary_risk']['evidence']): string {
  switch (type) {
    case 'REVIEW_MOAT':
      return ev.avg_review_count
        ? `incumbents have an average of ${ev.avg_review_count.toLocaleString()} reviews per product`
        : ''
    case 'MARKET_SATURATION':
      return ev.meaningful_competitor_count
        ? `${ev.meaningful_competitor_count} established competitors hold the market`
        : ''
    case 'DEMAND_UNCERTAINTY':
      return ev.demand_signal_count !== undefined
        ? `only ${ev.demand_signal_count} demand source${ev.demand_signal_count !== 1 ? 's' : ''} confirmed data`
        : ''
    case 'COST_STRUCTURE':
      return ev.cogs_ratio !== undefined
        ? `unit cost represents ${Math.round(ev.cogs_ratio * 100)}% of the median price`
        : ''
    case 'THIN_CONSUMER_DATA':
      return ev.corpus_size !== undefined
        ? `only ${ev.corpus_size} reviews were available to assess consumer behavior`
        : ''
    case 'DEMAND_CONCENTRATION':
      return ev.top_keyword && ev.top_keyword_pct !== undefined
        ? `"${ev.top_keyword}" represents ${Math.round(ev.top_keyword_pct * 100)}% of total search volume`
        : ''
    case 'CATEGORY_ACCESSIBILITY':
      return ev.market_accessibility_score !== undefined
        ? `the market accessibility score is ${ev.market_accessibility_score.toFixed(1)} out of 10`
        : ''
    case 'COMPETITOR_FORMULA_PARITY':
      return ev.competitor_formula_similarity !== undefined
        ? `competitor formula similarity is ${Math.round(ev.competitor_formula_similarity * 100)}%`
        : ''
    default:
      return ''
  }
}

export function fallbackProductThesis(input: SynthesisInput): CallCOutput {
  const { query, consumer_clusters, competitor_context, manufacturing_context } = input
  const topCluster = consumer_clusters[0]

  // Headline: what to build and why, grounded in the top consumer complaint
  const headline = topCluster
    ? `A differentiated ${query} product addressing ${topCluster.label}, the top complaint in ${Math.round(topCluster.frequency_pct)}% of customer reviews.`
    : `A differentiated ${query} product targeting the gaps currently unaddressed by established market incumbents.`

  // Full thesis: 4–6 sentences grounded in available data
  const parts: string[] = []

  // Sentence 1: what to build
  if (topCluster) {
    parts.push(`The primary product direction is a ${query} formulation that directly addresses ${topCluster.label}, cited in ${topCluster.frequency_pct}% of customer reviews.`)
  } else {
    parts.push(`The primary product direction is a ${query} formulation designed to close the gaps identified in competitor reviews.`)
  }

  // Sentence 2: incumbent weakness
  if (competitor_context?.top_competitors.length) {
    const top = competitor_context.top_competitors[0]
    parts.push(`Leading incumbents such as ${top.brand} (${top.review_count.toLocaleString()} reviews, $${top.price}) have not resolved the primary complaints identified in this analysis.`)
  } else {
    parts.push('Established products in this category have not fully resolved the primary consumer complaints identified in this analysis.')
  }

  // Sentence 3: additional clusters if present
  if (consumer_clusters.length >= 2) {
    const second = consumer_clusters[1]
    parts.push(`Secondary validation against "${second.label}" (${second.frequency_pct}% of reviews) suggests a compound differentiation opportunity.`)
  }

  // Sentence 4: manufacturing if present
  if (manufacturing_context?.unit_cost_range) {
    const low  = manufacturing_context.unit_cost_range.min
    const high = manufacturing_context.unit_cost_range.max
    parts.push(`Manufacturing data indicates unit costs of $${low}–$${high} at accessible MOQ levels.`)
  }

  // Sentence 5: differentiation constraint
  if (competitor_context) {
    const ratio = competitor_context.review_concentration_ratio
    const constraint = ratio >= 0.60
      ? 'review concentration means early marketing must be highly targeted to break through'
      : 'the distributed review base suggests room for a new entrant with strong product evidence'
    parts.push(`With a review concentration ratio of ${ratio.toFixed(2)}, ${constraint}.`)
  }

  return { headline, full_thesis: parts.join(' ') }
}
