// ── Confidence tier computation ───────────────────────────────────────────
// Deterministic, numeric-threshold assignment of ConfidenceTier per signal.
// No AI judgment. No subjective weighting. Rules are from spec §5.2.
//
// All thresholds are constants — never derived from the data being classified.

import type { ConfidenceTier } from './types'
import type { MemoData } from '@/types/index'

// ── Demand ────────────────────────────────────────────────────────────────
// CONFIRMED: DataForSEO top keyword ≥ 10,000 AND Keepa monthly units ≥ 5,000
// MODERATE:  DataForSEO ≥ 5,000 OR Keepa ≥ 5,000
// LOW:       below both thresholds or only one data source present

const DEMAND_CONFIRMED_VOLUME = 10_000
const DEMAND_INDICATED_VOLUME =  5_000
const DEMAND_CONFIRMED_KEEPA  =  5_000

export function demandConfidenceTier(m: MemoData): ConfidenceTier {
  const topVolume = (m.keyword_intelligence?.top_buying ?? [])
    .filter(kw => typeof kw.monthly_searches === 'number')
    [0]?.monthly_searches ?? null

  const keepaStr = m.signal_evidence?.revenue?.value.est_monthly_units_sold ?? null
  const keepaUnits = keepaStr ? parseFloat(keepaStr.replace(/[^0-9.]/g, '')) : null
  const keepaValid = keepaUnits !== null && !isNaN(keepaUnits) && keepaUnits > 0

  const dfStrong    = topVolume !== null && topVolume >= DEMAND_CONFIRMED_VOLUME
  const keepaStrong = keepaValid && keepaUnits! >= DEMAND_CONFIRMED_KEEPA

  if (dfStrong && keepaStrong) return 'HIGH'
  if (dfStrong || keepaStrong || (topVolume !== null && topVolume >= DEMAND_INDICATED_VOLUME)) return 'MODERATE'
  return 'LOW'
}

// ── Market Accessibility ──────────────────────────────────────────────────
// Maps from the provider-assigned confidence on the review_velocity dimension.
// Provider sets 0.8 / 0.6 / 0.4 based on withReviews.length thresholds
// (competition.ts). AggregatedDimension.confidence is the weighted average.

export function marketAccessibilityConfidenceTier(m: MemoData): ConfidenceTier {
  const conf = m.signal_evidence?.review_velocity?.confidence
  if (conf === undefined || conf === null) return 'LOW'
  if (conf >= 0.75) return 'HIGH'
  if (conf >= 0.55) return 'MODERATE'
  return 'LOW'
}

// ── Consumer Pain ─────────────────────────────────────────────────────────
// Based on the corpus size captured in ConsumerIntelligenceReport.

const CORPUS_HIGH     = 100
const CORPUS_MODERATE =  20

export function consumerPainConfidenceTier(m: MemoData): ConfidenceTier {
  const corpus = m.consumer_intelligence?.totalReviewsCollected ?? 0
  if (corpus >= CORPUS_HIGH)     return 'HIGH'
  if (corpus >= CORPUS_MODERATE) return 'MODERATE'
  return 'LOW'
}

// ── Virality ──────────────────────────────────────────────────────────────
// Mapped from TikTok view_count thresholds on the virality signal.

const VIRALITY_HIGH     = 100_000_000
const VIRALITY_MODERATE =  10_000_000

export function viralityConfidenceTier(m: MemoData): ConfidenceTier {
  const views = m.signal_evidence?.virality?.value.view_count
  if (views === undefined || views === null) return 'LOW'
  if (views >= VIRALITY_HIGH)     return 'HIGH'
  if (views >= VIRALITY_MODERATE) return 'MODERATE'
  return 'LOW'
}

// ── Manufacturing Feasibility ─────────────────────────────────────────────
// HIGH when both MOQ and realistic unit cost are present.
// MODERATE when one is present.

export function manufacturingConfidenceTier(m: MemoData): ConfidenceTier {
  const est = m.manufacturing_estimate
  if (!est) return 'LOW'
  const hasMoq  = !!est.moq
  const hasCost = !!est.realistic_unit_cost || !!est.unit_cost
  if (hasMoq && hasCost) return 'HIGH'
  if (hasMoq || hasCost) return 'MODERATE'
  return 'LOW'
}

// ── Subscription Potential ────────────────────────────────────────────────
// Based on the repurchase language corpus size (same policy as consumer pain).

export function subscriptionConfidenceTier(m: MemoData): ConfidenceTier {
  const outOf = m.consumer_intelligence?.repurchaseLanguage.outOf ?? 0
  if (outOf >= CORPUS_HIGH)     return 'HIGH'
  if (outOf >= CORPUS_MODERATE) return 'MODERATE'
  return 'LOW'
}

// ── Profitability ─────────────────────────────────────────────────────────
// HIGH when all three sub-signals are present (fee schedule, COGS, CPC).
// MODERATE when at least two sub-signals are present.

export function profitabilityConfidenceTier(m: MemoData): ConfidenceTier {
  const se = m.signal_evidence
  const hasFeeBurden = typeof se?.revenue?.value.avg_referral_fee_pct === 'number'
  const hasCogs      = !!m.manufacturing_estimate?.realistic_unit_cost
  const hasCpc       = typeof m.keyword_intelligence?.top_buying?.[0]?.cpc === 'number' &&
                       (m.keyword_intelligence!.top_buying[0].cpc ?? 0) > 0
  const count = [hasFeeBurden, hasCogs, hasCpc].filter(Boolean).length
  if (count >= 3) return 'HIGH'
  if (count >= 2) return 'MODERATE'
  return 'LOW'
}
