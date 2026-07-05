// ── Evidence Layer — ExpandableCard Construction ─────────────────────────
// Spec §9.1–§9.3. Template-based, no AI prose.
// One ExpandableCard per signal present in SynthesisInput.
//
// Depends on:
//   SynthesisInput — confidence tiers, summary context
//   MemoData (optional) — raw provider values for richer data_points

import type { MemoData } from '@/types/index'
import type { SynthesisInput, SignalId, ConfidenceTier } from '@/lib/ai-interpretation/types'

// ── ExpandableCard type (spec §9.3) ───────────────────────────────────────

export interface ExpandableCard {
  signal_id:      SignalId
  confidence:     ConfidenceTier
  data_points:    Array<{ label: string; value: string }>  // 2–4 entries
  interpretation: string    // ≤ 30 words, template-generated, never AI
  limitation:     string | null  // non-null when confidence = MODERATE or LOW
}

// ── Confidence badge tooltip text (spec §10.4) ────────────────────────────

const LIMITATION_TEXT: Record<ConfidenceTier, string | null> = {
  HIGH:     null,
  MODERATE: 'Based on a single data source. Reasonable estimate, not confirmed.',
  LOW:      'Insufficient data to confirm this signal. Treat with caution.',
}

function limitation(tier: ConfidenceTier): string | null {
  return LIMITATION_TEXT[tier]
}

// ── Formatting helpers ────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtPct(n: number, decimals = 0): string {
  return `${n.toFixed(decimals)}%`
}

function trendLabel(dir: string | undefined | null): string {
  switch (dir) {
    case 'UP':          return 'Growing ↑'
    case 'DOWN':        return 'Declining ↓'
    case 'SEASONAL':    return 'Seasonal variation'
    case 'STABLE':      return 'Stable'
    case 'INSUFFICIENT': return 'Insufficient data'
    default:            return 'Unknown'
  }
}

// ── Per-signal card builders ──────────────────────────────────────────────

function demandCard(input: SynthesisInput): ExpandableCard {
  const dc   = input.demand_calibration
  const ks   = input.keyword_summary
  const tier = input.signals.find(s => s.id === 'demand')?.confidence ?? 'LOW'
  const pts:  Array<{ label: string; value: string }> = []

  if (dc?.monthly_search_volume) {
    pts.push({ label: 'Monthly search volume', value: `${fmtNum(dc.monthly_search_volume)} / month` })
  }
  if (dc?.keepa_monthly_units) {
    pts.push({ label: 'Marketplace units / mo', value: `~${fmtNum(dc.keepa_monthly_units)} (category estimate)` })
  }
  if (dc?.price_range) {
    pts.push({ label: 'Median price', value: `$${dc.price_range.median}  (p25: $${dc.price_range.p25}, p75: $${dc.price_range.p75})` })
  }
  if (ks) {
    pts.push({ label: 'Search trend', value: trendLabel(ks.trend_direction) })
  }

  const vol = dc?.monthly_search_volume
  const interpretation = vol
    ? `This demand level represents ${vol >= 50_000 ? 'strong' : vol >= 10_000 ? 'moderate' : 'limited'} recurring purchase intent across keyword search channels.`
    : 'Demand data was unavailable from search keyword and marketplace providers.'

  return {
    signal_id:      'demand',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function marketAccessibilityCard(input: SynthesisInput): ExpandableCard {
  const cc   = input.competitor_context
  const tier = input.signals.find(s => s.id === 'market_accessibility')?.confidence ?? 'LOW'
  const pts:  Array<{ label: string; value: string }> = []

  if (cc) {
    pts.push({ label: 'Established competitors', value: String(cc.meaningful_competitor_count) })
    pts.push({ label: 'Average review count',    value: fmtNum(Math.round(cc.avg_review_count)) })
    pts.push({ label: 'Review concentration',    value: fmtPct(cc.review_concentration_ratio * 100, 0) + ' held by top 3' })
    if (cc.avg_rating !== null && cc.avg_rating !== undefined) {
      pts.push({ label: 'Average rating', value: `${cc.avg_rating.toFixed(1)} / 5` })
    }
  } else {
    pts.push({ label: 'Data status', value: 'SERP data unavailable for this analysis' })
  }

  const count = cc?.meaningful_competitor_count ?? 0
  const interpretation = cc
    ? `${count} established competitors with an average of ${fmtNum(Math.round(cc.avg_review_count))} reviews each. Review concentration: ${fmtPct(cc.review_concentration_ratio * 100, 0)}.`
    : 'Market accessibility could not be assessed — SERP data was unavailable.'

  return {
    signal_id:      'market_accessibility',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function consumerPainCard(input: SynthesisInput): ExpandableCard {
  const clusters = input.consumer_clusters
  const tier     = input.signals.find(s => s.id === 'consumer_pain')?.confidence ?? 'LOW'
  const pts:     Array<{ label: string; value: string }> = []

  if (clusters.length > 0) {
    const top = clusters[0]
    pts.push({ label: 'Top complaint', value: `${top.label} (${top.frequency_pct}% of reviews)` })
    pts.push({ label: 'Reviews analyzed', value: fmtNum(input.corpus_size) })
    if (clusters.length > 1) {
      const second = clusters[1]
      pts.push({ label: '2nd complaint', value: `${second.label} (${second.frequency_pct}%)` })
    }
    if (input.thin_corpus) {
      pts.push({ label: 'Data quality', value: 'Limited corpus — treat with caution' })
    }
  } else {
    pts.push({ label: 'Reviews analyzed', value: fmtNum(input.corpus_size) })
    pts.push({ label: 'Data status', value: input.thin_corpus ? 'Thin corpus — insufficient for pattern detection' : 'No complaint patterns detected' })
  }

  const top = clusters[0]
  const interpretation = top
    ? `${top.frequency_pct}% of reviewed customers cite ${top.label} as a primary concern — a quantified differentiation target.`
    : 'Insufficient review data to identify complaint patterns for this category.'

  return {
    signal_id:      'consumer_pain',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function viralityCard(input: SynthesisInput): ExpandableCard {
  const vc   = input.virality_context
  const tier = input.signals.find(s => s.id === 'virality')?.confidence ?? 'LOW'
  const pts: Array<{ label: string; value: string }> = []

  if (vc) {
    pts.push({ label: 'TikTok signal',   value: vc.signal_strength })
    if (vc.top_hashtag)        pts.push({ label: 'Top hashtag',   value: `#${vc.top_hashtag}` })
    if (vc.top_hashtag_volume) pts.push({ label: 'Hashtag views', value: `${fmtNum(vc.top_hashtag_volume)} total views` })
  } else {
    pts.push({ label: 'TikTok signal', value: 'No TikTok data available for this category' })
  }

  const interpretation = !vc
    ? 'TikTok virality data was unavailable for this category.'
    : vc.signal_strength === 'STRONG'
    ? `Strong TikTok presence detected (${vc.top_hashtag_volume ? fmtNum(vc.top_hashtag_volume) : 'high'} views) — organic discovery potential is high.`
    : vc.signal_strength === 'MODERATE'
    ? 'Moderate TikTok activity — some organic community presence exists for this category.'
    : vc.signal_strength === 'WEAK'
    ? 'Limited TikTok signal detected — organic social reach is minimal for this category.'
    : 'No TikTok signal detected — paid acquisition is the primary customer acquisition path.'

  return {
    signal_id:      'virality',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function manufacturingCard(input: SynthesisInput): ExpandableCard {
  const mc   = input.manufacturing_context
  const tier = input.signals.find(s => s.id === 'manufacturing_feasibility')?.confidence ?? 'LOW'
  const pts: Array<{ label: string; value: string }> = []

  if (mc) {
    if (mc.moq_range) {
      pts.push({ label: 'MOQ range', value: `${fmtNum(mc.moq_range.min)}–${fmtNum(mc.moq_range.max)} units` })
    }
    if (mc.unit_cost_range) {
      pts.push({ label: 'Unit cost range', value: `$${mc.unit_cost_range.min.toFixed(2)}–$${mc.unit_cost_range.max.toFixed(2)}` })
    }
    pts.push({ label: 'Feasibility', value: mc.feasibility })
  } else {
    pts.push({ label: 'Data status', value: 'Manufacturing data unavailable for this analysis' })
  }

  const interpretation = !mc
    ? 'Manufacturing data was unavailable — supplier sourcing should be independently validated.'
    : mc.feasibility === 'HIGH'
    ? `High manufacturing feasibility: MOQ and unit costs indicate an accessible production path.`
    : mc.feasibility === 'MODERATE'
    ? 'Manufacturing is feasible with moderate capital requirements and standard supplier options.'
    : mc.feasibility === 'LOW'
    ? 'Manufacturing presents structural challenges — cost or MOQ requirements are elevated.'
    : 'Manufacturing feasibility is unknown — no supplier data was available.'

  return {
    signal_id:      'manufacturing_feasibility',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function profitabilityCard(input: SynthesisInput, memo?: MemoData): ExpandableCard {
  const dc   = input.demand_calibration
  const mc   = input.manufacturing_context
  const tier = input.signals.find(s => s.id === 'profitability')?.confidence ?? 'LOW'
  const pts: Array<{ label: string; value: string }> = []

  if (dc?.price_range) {
    pts.push({ label: 'Median price', value: `$${dc.price_range.median}` })
    pts.push({ label: 'Price range',  value: `$${dc.price_range.p25}–$${dc.price_range.p75}` })
  }
  if (mc?.unit_cost_range) {
    pts.push({ label: 'Unit cost', value: `$${mc.unit_cost_range.min.toFixed(2)}–$${mc.unit_cost_range.max.toFixed(2)}` })
  }
  // COGS ratio from memo if available
  const realCost = memo?.manufacturing_estimate?.realistic_unit_cost
  if (realCost && dc?.price_range?.median) {
    const ratio = ((realCost.low + realCost.high) / 2) / dc.price_range.median
    if (ratio > 0 && ratio < 1) {
      pts.push({ label: 'Est. COGS ratio', value: `${Math.round(ratio * 100)}% of median price` })
    }
  }

  const median = dc?.price_range?.median
  const costLow = mc?.unit_cost_range?.min
  const grossMarginEst = median && costLow ? ((median - costLow) / median * 100) : null

  const interpretation = grossMarginEst !== null
    ? `At median price $${median}, estimated gross margin before Amazon fees is ~${Math.round(grossMarginEst)}% (before fulfillment costs).`
    : 'Profitability data is limited — price and cost information is partially available.'

  return {
    signal_id:      'profitability',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

function subscriptionCard(input: SynthesisInput, memo?: MemoData): ExpandableCard {
  const tier = input.signals.find(s => s.id === 'subscription_potential')?.confidence ?? 'LOW'
  const pts: Array<{ label: string; value: string }> = []

  const repurchase = memo?.consumer_intelligence?.repurchaseLanguage
  if (repurchase) {
    const pct = repurchase.outOf > 0
      ? Math.round((repurchase.mentionedBy / repurchase.outOf) * 100)
      : 0
    pts.push({ label: 'Repurchase mentions', value: `${repurchase.mentionedBy} of ${repurchase.outOf} reviewed buyers` })
    pts.push({ label: 'Repurchase rate',     value: `${pct}% of corpus` })
  }
  pts.push({ label: 'Reviews analyzed', value: fmtNum(input.corpus_size) })
  if (input.thin_corpus) {
    pts.push({ label: 'Data quality', value: 'Limited corpus — subscription signal may be unreliable' })
  }

  const repRate = repurchase && repurchase.outOf > 0
    ? Math.round((repurchase.mentionedBy / repurchase.outOf) * 100)
    : null
  const interpretation = repRate !== null
    ? `${repRate}% of reviewed buyers mention repurchase intent — indicates recurring purchase behavior.`
    : 'Subscription data was limited — repurchase behavior could not be confirmed from available reviews.'

  return {
    signal_id:      'subscription_potential',
    confidence:     tier,
    data_points:    pts.slice(0, 4),
    interpretation: interpretation.split(/\s+/).slice(0, 30).join(' '),
    limitation:     limitation(tier),
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
// Builds one ExpandableCard for each signal present in SynthesisInput.
// Returns a Map keyed by signal_id for O(1) lookup by the UI.

export function buildExpandableCards(
  input: SynthesisInput,
  memo?: MemoData,
): Map<string, ExpandableCard> {
  const cards = new Map<string, ExpandableCard>()
  const presentIds = new Set(input.signals.map(s => s.id))

  if (presentIds.has('demand'))                  cards.set('demand',                  demandCard(input))
  if (presentIds.has('market_accessibility'))    cards.set('market_accessibility',    marketAccessibilityCard(input))
  if (presentIds.has('consumer_pain'))           cards.set('consumer_pain',           consumerPainCard(input))
  if (presentIds.has('virality'))                cards.set('virality',                viralityCard(input))
  if (presentIds.has('manufacturing_feasibility')) cards.set('manufacturing_feasibility', manufacturingCard(input))
  if (presentIds.has('profitability'))           cards.set('profitability',           profitabilityCard(input, memo))
  if (presentIds.has('subscription_potential'))  cards.set('subscription_potential',  subscriptionCard(input, memo))

  return cards
}
