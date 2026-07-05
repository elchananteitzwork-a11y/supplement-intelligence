// ── SynthesisInput Builder ────────────────────────────────────────────────
// Constructs the SynthesisInput contract from GroundedScore + MemoData.
//
// This is the ONLY place that touches raw MemoData to produce SynthesisInput.
// Every field the AI sees passes through here — no other code paths exist.
//
// Boundary rules (enforced here, not elsewhere):
//   - productId / ASIN → stripped
//   - ingredients_label, bullets, breadcrumb → stripped
//   - Provider names (keepa, apify, dataforseo, tiktok) → stripped
//   - Full keyword arrays → truncated to top 3
//   - Full competitor arrays → truncated to top 3
//   - exampleQuote from ThemeInsight → stripped
//   - Dates → analysis_date is date-only (no time component)

import type { MemoData, BuildDecision } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import { computeReviewMoatScore } from '@/lib/scoring'
import {
  demandConfidenceTier,
  marketAccessibilityConfidenceTier,
  consumerPainConfidenceTier,
  viralityConfidenceTier,
  manufacturingConfidenceTier,
  subscriptionConfidenceTier,
  profitabilityConfidenceTier,
} from './confidence'
import {
  classifyPrimaryRisk,
  computeCompetitorFormulaSimilarity,
  type RiskContext,
} from './risk-classifier'
import type {
  SynthesisInput,
  SynthesisSignal,
  SignalId,
  VerdictLabel,
  ConfidenceTier,
  ConsumerCluster,
  KeywordSummary,
  CompetitorContext,
  ManufacturingContext,
  DemandCalibration,
  ViralityContext,
  ExcludedSignal,
  ConfidenceFlag,
  TrendDirection,
} from './types'

// ── Verdict mapping ───────────────────────────────────────────────────────
// Spec §6.1 thresholds: 65/40. Applied to overall_score from GroundedScore.
// CATEGORY_CREATION_CANDIDATE maps to VALIDATION_REQUIRED — the broad category
// has demand but the specific query needs founder validation.

function mapVerdict(score: number, decision: BuildDecision): VerdictLabel {
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return 'VALIDATION_REQUIRED'
  if (score >= 65) return 'ENTRY_SUPPORTED'
  if (score >= 40) return 'VALIDATION_REQUIRED'
  return 'ENTRY_NOT_SUPPORTED'
}

// ── Verdict confidence ────────────────────────────────────────────────────
// Deterministic from the signals array — never subjective.

function computeVerdictConfidence(
  signals: SynthesisSignal[],
  excludedCount: number,
  totalPossible: number,
): ConfidenceTier {
  if (signals.length === 0) return 'LOW'
  const highCount     = signals.filter(s => s.confidence === 'HIGH').length
  const moderateCount = signals.filter(s => s.confidence === 'MODERATE').length
  const coveragePct   = signals.length / Math.max(totalPossible, 1)

  if (highCount >= 3 && coveragePct >= 0.70) return 'HIGH'
  if (highCount >= 2 || (highCount >= 1 && moderateCount >= 2)) return 'MODERATE'
  return 'LOW'
}

// ── Headline templates ────────────────────────────────────────────────────
// Template-generated, never AI-written. ≤ 8 words per spec §3.

function signalHeadline(id: SignalId, score: number, confidence: ConfidenceTier): string {
  const tier = score >= 7.0 ? 'strong' : score >= 5.0 ? 'moderate' : score >= 3.0 ? 'limited' : 'weak'

  switch (id) {
    case 'demand':
      if (score >= 7.0) return confidence === 'HIGH' ? 'Strong confirmed demand' : 'Strong demand signal'
      if (score >= 5.0) return 'Moderate demand signal'
      if (score >= 3.0) return 'Limited demand evidence'
      return 'Weak demand signal'

    case 'market_accessibility':
      if (score >= 7.0) return 'Market is accessible'
      if (score >= 5.0) return 'Moderate market competition'
      if (score >= 3.0) return 'Competitive market barrier'
      return 'High market barrier'

    case 'consumer_pain':
      if (score >= 7.0) return 'Strong consumer pain signal'
      if (score >= 5.0) return 'Moderate consumer pain'
      if (score >= 3.0) return 'Some consumer dissatisfaction'
      return 'Thin consumer pain evidence'

    case 'virality':
      if (score >= 7.0) return 'Strong viral potential'
      if (score >= 5.0) return 'Moderate viral potential'
      if (score >= 3.0) return 'Limited viral potential'
      return 'Low viral potential'

    case 'manufacturing_feasibility':
      if (score >= 7.0) return 'Manufacturing is feasible'
      if (score >= 5.0) return 'Moderate manufacturing complexity'
      if (score >= 3.0) return 'Manufacturing challenges present'
      return 'Manufacturing is difficult'

    case 'subscription_potential':
      if (score >= 7.0) return 'Strong subscription retention fit'
      if (score >= 5.0) return 'Moderate subscription fit'
      if (score >= 3.0) return 'Limited subscription signal'
      return 'Low repurchase evidence'

    case 'profitability':
      if (score >= 7.0) return 'Strong margin potential'
      if (score >= 5.0) return 'Moderate margin potential'
      if (score >= 3.0) return 'Thin margin potential'
      return 'Margin risk is high'

    default:
      return `${tier} signal`
  }
}

// ── Supporting stat templates ─────────────────────────────────────────────
// ≤ 30 characters per spec §3.

function signalSupportingStat(id: SignalId, m: MemoData): string {
  switch (id) {
    case 'demand': {
      const vol = m.keyword_intelligence?.top_buying?.[0]?.monthly_searches
      if (vol) return `${vol.toLocaleString()} searches/mo`
      const keepaStr = m.signal_evidence?.revenue?.value.est_monthly_units_sold
      if (keepaStr) return keepaStr.slice(0, 30)
      return 'Single demand source'
    }
    case 'market_accessibility': {
      const count = m.signal_evidence?.review_velocity?.value.meaningful_competitor_count
      if (count !== undefined) return `${count} competitors`
      return 'Competition measured'
    }
    case 'consumer_pain': {
      const total = m.consumer_intelligence?.totalReviewsCollected ?? 0
      return `${total} reviews analyzed`
    }
    case 'virality': {
      const views = m.signal_evidence?.virality?.value.view_count
      if (views) {
        const formatted = views >= 1_000_000
          ? `${(views / 1_000_000).toFixed(1)}M views`
          : `${(views / 1_000).toFixed(0)}K views`
        return formatted.slice(0, 30)
      }
      return 'TikTok signal checked'
    }
    case 'manufacturing_feasibility': {
      const cost = m.manufacturing_estimate?.realistic_unit_cost
      if (cost) return `$${cost.low}–$${cost.high} unit cost`
      const moq = m.manufacturing_estimate?.moq
      if (moq) return `MOQ ${moq.low}–${moq.high} units`
      return 'Supplier data present'
    }
    case 'subscription_potential': {
      const rl = m.consumer_intelligence?.repurchaseLanguage
      if (rl && rl.outOf > 0) {
        const pct = Math.round((rl.mentionedBy / rl.outOf) * 100)
        return `${pct}% repurchase language`
      }
      return 'Repurchase signal checked'
    }
    case 'profitability': {
      const cost = m.manufacturing_estimate?.realistic_unit_cost
      const price = realisticPriceFromMemo(m)
      if (cost && price) {
        const margin = Math.round(((price - cost.low) / price) * 100)
        return `~${margin}% gross margin`
      }
      return 'Profitability estimated'
    }
    default:
      return 'Signal measured'
  }
}

function realisticPriceFromMemo(m: MemoData): number | null {
  const pricing = m.signal_evidence?.pricing
  if (pricing) {
    const avgStr = pricing.value.avg_price
    if (avgStr) {
      const n = parseFloat(avgStr.replace(/[^0-9.]/g, ''))
      if (!isNaN(n) && n > 0) return n
    }
  }
  const revenueStr = m.signal_evidence?.revenue?.value.est_monthly_revenue
  if (revenueStr) {
    const units = m.signal_evidence?.revenue?.value.est_monthly_units_sold
    const revN  = parseFloat((revenueStr ?? '').replace(/[^0-9.]/g, ''))
    const unitN = parseFloat((units ?? '').replace(/[^0-9.]/g, ''))
    if (revN > 0 && unitN > 0) return revN / unitN
  }
  return null
}

// ── Trend direction ───────────────────────────────────────────────────────

function resolveTrendDirection(m: MemoData): TrendDirection {
  const seasonality = m.keyword_intelligence?.seasonality ?? m.signal_evidence?.seasonality?.value
  if (seasonality) {
    if (seasonality.pattern === 'Seasonal' || seasonality.pattern === 'Event-driven') return 'SEASONAL'
  }
  const growth = m.signal_evidence?.growth?.value
  if (growth) {
    if (growth.momentum === 'Accelerating') return 'UP'
    if (growth.momentum === 'Decelerating') return 'DOWN'
    if (growth.momentum === 'Stable') return 'STABLE'
  }
  const yoy = m.signal_evidence?.growth?.value.yoy_change
  if (yoy) {
    const pct = parseFloat(yoy.replace(/[^0-9.\-]/g, ''))
    if (!isNaN(pct)) {
      if (pct > 10) return 'UP'
      if (pct < -10) return 'DOWN'
      return 'STABLE'
    }
  }
  return 'INSUFFICIENT'
}

// ── Signal extraction ─────────────────────────────────────────────────────

function extractSignals(m: MemoData, gs: GroundedScore): {
  signals: SynthesisSignal[]
  excluded: ExcludedSignal[]
  verifiedCount: number
} {
  const signals: SynthesisSignal[] = []
  const excluded: ExcludedSignal[] = []

  // Map from GroundedScore.dimensions (authoritative scored output)
  const dimMap = new Map(gs.dimensions.map(d => [d.key, d]))

  // ── Demand ──
  const demandDim = dimMap.get('demand')
  if (demandDim && demandDim.rawScore !== undefined && demandDim.weight > 0) {
    const confidence = demandConfidenceTier(m)
    const score = Math.round(demandDim.rawScore * 10) / 10
    signals.push({
      id: 'demand',
      display_label: 'Market Demand',
      score,
      confidence,
      headline: signalHeadline('demand', score, confidence),
      supporting_stat: signalSupportingStat('demand', m),
    })
  } else {
    excluded.push({ signal_id: 'demand', reason: 'INSUFFICIENT_DATA' })
  }

  // ── Market Accessibility ──
  const maDim = dimMap.get('marketAccessibility')
  if (maDim && maDim.rawScore !== undefined && maDim.weight > 0) {
    const confidence = marketAccessibilityConfidenceTier(m)
    const score = Math.round(maDim.rawScore * 10) / 10
    signals.push({
      id: 'market_accessibility',
      display_label: 'Market Accessibility',
      score,
      confidence,
      headline: signalHeadline('market_accessibility', score, confidence),
      supporting_stat: signalSupportingStat('market_accessibility', m),
    })
  } else {
    excluded.push({ signal_id: 'market_accessibility', reason: 'INSUFFICIENT_DATA' })
  }

  // ── Profitability ──
  const profDim = dimMap.get('profitability')
  if (profDim && profDim.rawScore !== undefined && profDim.weight > 0) {
    const confidence = profitabilityConfidenceTier(m)
    const score = Math.round(profDim.rawScore * 10) / 10
    signals.push({
      id: 'profitability',
      display_label: 'Profitability',
      score,
      confidence,
      headline: signalHeadline('profitability', score, confidence),
      supporting_stat: signalSupportingStat('profitability', m),
    })
  } else {
    excluded.push({ signal_id: 'profitability', reason: 'INSUFFICIENT_DATA' })
  }

  // ── Consumer Pain ──
  const cpDim = dimMap.get('consumerPain')
  if (cpDim && cpDim.weight > 0 && cpDim.rawScore !== undefined) {
    const confidence = consumerPainConfidenceTier(m)
    const score = Math.round(cpDim.rawScore * 10) / 10
    signals.push({
      id: 'consumer_pain',
      display_label: 'Consumer Pain',
      score,
      confidence,
      headline: signalHeadline('consumer_pain', score, confidence),
      supporting_stat: signalSupportingStat('consumer_pain', m),
    })
  } else if (cpDim && cpDim.weight === 0 && cpDim.source === 'synthesized' &&
             cpDim.sourceLabel?.includes('weight excluded')) {
    // Scenario B: weight-excluded due to thin corpus + cross-validated demand
    excluded.push({ signal_id: 'consumer_pain', reason: 'CONSUMER_OPPORTUNITY_EXCLUSION' })
  } else {
    excluded.push({ signal_id: 'consumer_pain', reason: 'THIN_CORPUS' })
  }

  // ── Virality ──
  const virDim = dimMap.get('virality')
  if (virDim && virDim.rawScore !== undefined && virDim.weight > 0) {
    const confidence = viralityConfidenceTier(m)
    const score = Math.round(virDim.rawScore * 10) / 10
    signals.push({
      id: 'virality',
      display_label: 'Virality Potential',
      score,
      confidence,
      headline: signalHeadline('virality', score, confidence),
      supporting_stat: signalSupportingStat('virality', m),
    })
  } else {
    excluded.push({ signal_id: 'virality', reason: 'PROVIDER_FAILURE' })
  }

  // ── Subscription ──
  const subDim = dimMap.get('subscription')
  if (subDim && subDim.rawScore !== undefined && subDim.weight > 0) {
    const confidence = subscriptionConfidenceTier(m)
    const score = Math.round(subDim.rawScore * 10) / 10
    signals.push({
      id: 'subscription_potential',
      display_label: 'Subscription Potential',
      score,
      confidence,
      headline: signalHeadline('subscription_potential', score, confidence),
      supporting_stat: signalSupportingStat('subscription_potential', m),
    })
  } else {
    excluded.push({ signal_id: 'subscription_potential', reason: 'THIN_CORPUS' })
  }

  // ── Manufacturing ──
  const mfgDim = dimMap.get('manufacturing')
  if (mfgDim && mfgDim.rawScore !== undefined && mfgDim.weight > 0) {
    const confidence = manufacturingConfidenceTier(m)
    const score = Math.round(mfgDim.rawScore * 10) / 10
    signals.push({
      id: 'manufacturing_feasibility',
      display_label: 'Manufacturing Feasibility',
      score,
      confidence,
      headline: signalHeadline('manufacturing_feasibility', score, confidence),
      supporting_stat: signalSupportingStat('manufacturing_feasibility', m),
    })
  } else {
    excluded.push({ signal_id: 'manufacturing_feasibility', reason: 'PROVIDER_FAILURE' })
  }

  const verifiedCount = gs.dimensions.filter(d => d.source === 'verified' && d.weight > 0).length

  return { signals, excluded, verifiedCount }
}

// ── Consumer clusters ─────────────────────────────────────────────────────
// Top 3 only. No exampleQuote. No productId. No outOf (use corpus_size instead).

function extractConsumerClusters(m: MemoData): ConsumerCluster[] {
  const ci = m.consumer_intelligence
  if (!ci) return []

  const themes = ci.negativeThemes.slice(0, 10)   // ranked list from engine

  return themes
    .slice(0, 3)
    .map(t => ({
      label:         t.label,
      frequency:     t.mentionedBy,
      frequency_pct: ci.totalReviewsCollected > 0
        ? Math.round((t.mentionedBy / ci.totalReviewsCollected) * 100)
        : 0,
      sentiment:     'NEGATIVE' as const,
    }))
}

// ── Keyword summary ───────────────────────────────────────────────────────
// Top 3 only. No full keyword arrays.

function extractKeywordSummary(m: MemoData): KeywordSummary | null {
  const buying = m.keyword_intelligence?.top_buying ?? []
  if (buying.length === 0) return null

  const top3 = buying.slice(0, 3).map(k => ({
    keyword: k.keyword,
    volume:  k.monthly_searches ?? 0,
  }))

  const totalVolume = buying.reduce((s, k) => s + (k.monthly_searches ?? 0), 0)

  return {
    total_monthly_volume: totalVolume,
    top_3_keywords:       top3,
    trend_direction:      resolveTrendDirection(m),
  }
}

// ── Competitor context ────────────────────────────────────────────────────
// productId stripped. bullets stripped. ingredients_label stripped.
// breadcrumb stripped. Top 3 only.

function extractCompetitorContext(m: MemoData): CompetitorContext | null {
  const rv = m.signal_evidence?.review_velocity?.value
  if (!rv || rv.meaningful_competitor_count === undefined) return null

  const rawCompetitors = rv.top_competitors ?? []
  const top3 = rawCompetitors.slice(0, 3).map(c => ({
    brand:        c.brand,
    price:        c.price,
    review_count: c.reviewCount,
    // productId, bullets, breadcrumb, ingredients_label deliberately omitted
  }))

  const avgRatingStr = m.signal_evidence?.revenue?.value.avg_rating
  const avgRating = avgRatingStr ? parseFloat(avgRatingStr) : null

  return {
    meaningful_competitor_count: rv.meaningful_competitor_count,
    avg_review_count:            rv.avg_review_count ?? 0,
    review_concentration_ratio:  rv.review_concentration_ratio ?? 0,
    avg_rating:                  !isNaN(avgRating ?? NaN) ? avgRating : null,
    top_competitors:             top3,
  }
}

// ── Manufacturing context ─────────────────────────────────────────────────

function extractManufacturingContext(m: MemoData): ManufacturingContext | null {
  const est = m.manufacturing_estimate
  if (!est) return null

  const moq = est.moq
    ? { min: est.moq.low, max: est.moq.high }
    : null

  const cost = est.realistic_unit_cost ?? est.unit_cost
  const unit_cost_range = cost
    ? { min: cost.low, max: cost.high }
    : null

  const feasibility: ManufacturingContext['feasibility'] =
    est.confidence >= 0.7 ? 'HIGH' :
    est.confidence >= 0.4 ? 'MODERATE' :
    est.data_source === 'ai_synthesis' ? 'UNKNOWN' : 'LOW'

  return { moq_range: moq, unit_cost_range, feasibility }
}

// ── Demand calibration ────────────────────────────────────────────────────

function extractDemandCalibration(m: MemoData): DemandCalibration | null {
  const vol = m.keyword_intelligence?.top_buying?.[0]?.monthly_searches ?? null
  const keepaStr = m.signal_evidence?.revenue?.value.est_monthly_units_sold ?? null
  const keepaUnits = keepaStr ? parseFloat(keepaStr.replace(/[^0-9.]/g, '')) : null

  const price = realisticPriceFromMemo(m)
  const priceRange = price !== null ? {
    median: Math.round(price),
    p25:    Math.round(price * 0.8),   // estimated quartile spread when only avg is known
    p75:    Math.round(price * 1.25),
  } : null

  if (vol === null && keepaUnits === null && priceRange === null) return null

  return {
    monthly_search_volume: vol,
    keepa_monthly_units:   (!isNaN(keepaUnits ?? NaN) && (keepaUnits ?? 0) > 0) ? keepaUnits : null,
    price_range:           priceRange,
  }
}

// ── Virality context ──────────────────────────────────────────────────────

function extractViralityContext(m: MemoData): ViralityContext | null {
  const virality = m.signal_evidence?.virality?.value
  if (!virality) return null

  const views = virality.view_count ?? null
  const strength =
    (views ?? 0) >= 100_000_000 ? 'STRONG' :
    (views ?? 0) >= 10_000_000  ? 'MODERATE' :
    (views ?? 0) >= 1_000_000   ? 'WEAK' : 'ABSENT'

  return {
    signal_strength:    strength,
    top_hashtag_volume: views,
    top_hashtag:        virality.hashtag ?? null,
  }
}

// ── Risk context assembly ─────────────────────────────────────────────────

function buildRiskContext(m: MemoData, gs: GroundedScore): RiskContext {
  const rv = m.signal_evidence?.review_velocity?.value

  // Demand signal count: how many independent demand sources confirmed data
  const topVolume = m.keyword_intelligence?.top_buying?.[0]?.monthly_searches ?? null
  const keepaStr  = m.signal_evidence?.revenue?.value.est_monthly_units_sold ?? null
  const keepaUnits = keepaStr ? parseFloat(keepaStr.replace(/[^0-9.]/g, '')) : null
  const keepaValid = keepaUnits !== null && !isNaN(keepaUnits) && keepaUnits > 0
  const demandSignalCount =
    (topVolume !== null && topVolume > 0 ? 1 : 0) +
    (keepaValid ? 1 : 0)

  // COGS ratio computation
  const cost = m.manufacturing_estimate?.realistic_unit_cost ?? m.manufacturing_estimate?.unit_cost
  const price = realisticPriceFromMemo(m)
  const moqMin = m.manufacturing_estimate?.moq?.low ?? null
  const unitCostMin = cost?.low ?? null
  const cogsRatio = (unitCostMin !== null && price !== null && price > 0)
    ? Math.round((unitCostMin / price) * 100) / 100
    : null

  // Top keyword concentration
  const allKeywords = m.keyword_intelligence?.top_buying ?? []
  const totalVolume = allKeywords.reduce((s, k) => s + (k.monthly_searches ?? 0), 0)
  const topKeyword  = allKeywords[0]
  const topKeywordPct = (totalVolume > 0 && topKeyword)
    ? Math.round(((topKeyword.monthly_searches ?? 0) / totalVolume) * 100) / 100
    : null

  // Market accessibility score from GroundedScore dimensions
  const maDim = gs.dimensions.find(d => d.key === 'marketAccessibility')
  const marketAccessibilityScore = maDim?.rawScore ?? null

  // Thin corpus
  const corpusSize = m.consumer_intelligence?.totalReviewsCollected ?? 0
  const thinCorpus = corpusSize < 50   // THIN_SAMPLE_THRESHOLD from scoring.ts

  // Competitor formula similarity
  const competitors = rv?.top_competitors ?? []
  const formulaSimilarity = computeCompetitorFormulaSimilarity(competitors)

  // Seasonality pattern
  const seasonPattern =
    m.keyword_intelligence?.seasonality?.pattern ??
    m.signal_evidence?.seasonality?.value.pattern ??
    null

  // Virality score
  const virScore = m.signal_evidence?.virality?.value.score ?? null

  // Review moat score (reuses the exported formula from scoring.ts)
  const reviewMoatScore = computeReviewMoatScore(m)

  return {
    review_moat_score:             reviewMoatScore,
    meaningful_competitor_count:   rv?.meaningful_competitor_count ?? null,
    avg_review_count:              rv?.avg_review_count ?? null,
    review_concentration_ratio:    rv?.review_concentration_ratio ?? null,
    demand_signal_count:           demandSignalCount,
    monthly_search_volume:         topVolume,
    keepa_monthly_units:           keepaValid ? keepaUnits! : null,
    moq_min:                       moqMin,
    unit_cost_min:                 unitCostMin,
    cogs_ratio:                    cogsRatio,
    median_price:                  price,
    corpus_size:                   corpusSize,
    thin_corpus:                   thinCorpus,
    competitor_formula_similarity: formulaSimilarity,
    seasonality_pattern:           seasonPattern ?? null,
    top_keyword_pct:               topKeywordPct,
    top_keyword:                   topKeyword?.keyword ?? null,
    virality_score:                virScore,
    market_accessibility_score:    marketAccessibilityScore,
  }
}

// ── Confidence flags ──────────────────────────────────────────────────────

function buildConfidenceFlags(
  m: MemoData,
  gs: GroundedScore,
  excluded: ExcludedSignal[],
): ConfidenceFlag[] {
  const flags: ConfidenceFlag[] = []

  if (gs.insufficientEvidence) {
    flags.push({ code: 'INSUFFICIENT_EVIDENCE', message: 'No real data providers returned results for this query.' })
  }
  if (gs.evidenceBreadth.distinctChannelTypes < 2) {
    flags.push({ code: 'SINGLE_CHANNEL', message: 'Analysis is based on a single data channel — cross-channel corroboration is absent.' })
  }
  if (excluded.some(e => e.signal_id === 'consumer_pain' && e.reason === 'THIN_CORPUS')) {
    flags.push({ code: 'THIN_CONSUMER_CORPUS', message: `Review corpus is thin (${m.consumer_intelligence?.totalReviewsCollected ?? 0} reviews). Consumer Pain signal is unreliable.` })
  }
  if (excluded.some(e => e.signal_id === 'virality')) {
    flags.push({ code: 'VIRALITY_UNVERIFIED', message: 'TikTok signal was unavailable. Virality potential is unverified.' })
  }
  if (excluded.some(e => e.signal_id === 'profitability')) {
    flags.push({ code: 'PROFITABILITY_UNVERIFIED', message: 'Insufficient pricing data to compute profitability.' })
  }

  return flags
}

// ── Public API ────────────────────────────────────────────────────────────

export function buildSynthesisInput(
  groundedScore: GroundedScore,
  memo: MemoData,
  query: string,
  category: string,
): SynthesisInput {
  const { signals, excluded, verifiedCount } = extractSignals(memo, groundedScore)

  const verdict           = mapVerdict(groundedScore.score, groundedScore.decision)
  const verdict_confidence = computeVerdictConfidence(signals, excluded.length, 7)

  const consumer_clusters = extractConsumerClusters(memo)
  const thin_corpus       = (memo.consumer_intelligence?.totalReviewsCollected ?? 0) < 50
  const corpus_size       = memo.consumer_intelligence?.totalReviewsCollected ?? 0

  const keyword_summary       = extractKeywordSummary(memo)
  const competitor_context    = extractCompetitorContext(memo)
  const manufacturing_context = extractManufacturingContext(memo)
  const demand_calibration    = extractDemandCalibration(memo)
  const virality_context      = extractViralityContext(memo)

  const riskCtx    = buildRiskContext(memo, groundedScore)
  const primary_risk = classifyPrimaryRisk(riskCtx)

  const confidence_flags = buildConfidenceFlags(memo, groundedScore, excluded)

  return {
    query,
    category,
    analysis_date: new Date().toISOString().slice(0, 10),

    verdict,
    verdict_confidence,
    overall_score: groundedScore.score,

    signals,
    primary_risk,

    consumer_clusters,
    thin_corpus,
    corpus_size,

    keyword_summary,
    competitor_context,
    manufacturing_context,
    demand_calibration,
    virality_context,

    excluded_signals:  excluded,
    confidence_flags,
  }
}
