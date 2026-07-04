// ── Unit Economics Engine ──────────────────────────────────────────────────
// All computations are deterministic arithmetic from Stage 1 primary
// measurements. No AI involvement. AI cannot produce or modify these outputs.

import type { Stage1Evidence } from '../evidence/adapter'
import type { InvestmentThesis } from '../stage2/types'
import type { FounderProfile } from '../stage25/fit-layer'
import { computeLaunchCost } from './launch-cost'
import type { LaunchCostModel } from './launch-cost'

// ── Breakeven COGS ─────────────────────────────────────────────────────────
// The maximum COGS you can afford to still hit target gross margin.
// Formula: price × (1 - referralPct/100 - targetGM) - fbaFee
// Example: $30 price, 15% referral, $4.50 FBA, 50% GM target → COGS = $6.00

export function computeBreakevenCOGS(
  price:       number,
  referralPct: number,
  fbaFee:      number,
  targetGM    = 0.50
): number {
  return Math.max(0, price * (1 - referralPct / 100 - targetGM) - fbaFee)
}

// ── Sensitivity analysis ───────────────────────────────────────────────────
// Shows how COGS tolerance changes across price scenarios and GM targets.

export interface SensitivityRow {
  price:          number
  target_gm_pct:  number   // e.g. 50
  fba_fee:        number
  referral_pct:   number
  breakeven_cogs: number
  net_revenue:    number   // price × (1 - referralPct/100) - fbaFee
  gm_at_cogs_target: number  // if founder enters actual COGS, show resulting GM
}

export interface SensitivityAnalysis {
  base_case:      SensitivityRow
  optimistic:     SensitivityRow  // price + 20%
  pessimistic:    SensitivityRow  // price - 20%
  gm_thresholds:  { gm_pct: number; breakeven_cogs: number }[]
  cogs_sensitivity_note: string
}

function buildRow(
  price:       number,
  referralPct: number,
  fbaFee:      number,
  targetGM:    number,
  actualCOGS?: number
): SensitivityRow {
  const breakeven = computeBreakevenCOGS(price, referralPct, fbaFee, targetGM)
  const netRev    = price * (1 - referralPct / 100) - fbaFee
  const actualGM  = actualCOGS !== undefined && price > 0
    ? (netRev - actualCOGS) / price
    : targetGM
  return {
    price,
    target_gm_pct:     targetGM * 100,
    fba_fee:           fbaFee,
    referral_pct:      referralPct,
    breakeven_cogs:    Math.round(breakeven * 100) / 100,
    net_revenue:       Math.round(netRev * 100) / 100,
    gm_at_cogs_target: Math.round(actualGM * 100 * 10) / 10,
  }
}

export function computeSensitivityAnalysis(
  evidence:    Stage1Evidence,
  targetGM    = 0.50,
  actualCOGS?: number
): SensitivityAnalysis {
  const price      = evidence.median_price?.value ?? 0
  const refPct     = evidence.avg_referral_fee_pct?.value ?? 15
  const fbaFee     = evidence.avg_fba_fee?.value ?? 4.50

  const base        = buildRow(price, refPct, fbaFee, targetGM, actualCOGS)
  const optimistic  = buildRow(price * 1.20, refPct, fbaFee, targetGM, actualCOGS)
  const pessimistic = buildRow(price * 0.80, refPct, fbaFee, targetGM, actualCOGS)

  const gmThresholds = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60].map(gm => ({
    gm_pct:         Math.round(gm * 100),
    breakeven_cogs: Math.round(computeBreakevenCOGS(price, refPct, fbaFee, gm) * 100) / 100,
  }))

  const note = price === 0
    ? 'No price data available — sensitivity analysis requires real market pricing.'
    : `At the median price of $${price}, you can spend up to $${base.breakeven_cogs.toFixed(2)}/unit on COGS and still hit ${targetGM * 100}% gross margin.`

  return { base_case: base, optimistic, pessimistic, gm_thresholds: gmThresholds, cogs_sensitivity_note: note }
}

// ── Revenue envelope ───────────────────────────────────────────────────────
// Realistic first-year revenue range given market data and launch scenario.

export interface RevenueEnvelope {
  conservative_monthly: number
  base_monthly:         number
  optimistic_monthly:   number
  year1_conservative:   number
  year1_base:           number
  year1_optimistic:     number
  market_revenue_avg:   number   // avg seller monthly revenue (Keepa) or fallback estimate
  market_share_pct:     { conservative: number; base: number; optimistic: number }
  assumptions:          string[]
  is_estimate?:         boolean  // true when Keepa revenue was absent; fallback used
  estimate_method?:     string   // describes the fallback source and formula used
}

export function computeRevenueEnvelope(
  evidence:  Stage1Evidence,
  thesis:    InvestmentThesis
): RevenueEnvelope {
  const keepaRev    = evidence.est_monthly_revenue?.value
  const searchVol   = evidence.monthly_search_volume?.value
  const price       = evidence.median_price?.value ?? 0

  // Prefer Keepa's measured avg-seller revenue. When absent, fall back to a
  // search-volume proxy: total category searches × 0.5% search-to-purchase
  // rate ÷ competitor count → per-seller estimate. This is low-confidence —
  // labelled clearly and never presented as real revenue.
  let marketRevAvg: number
  let isEstimate = false
  let estimateMethod: string | undefined

  if (keepaRev !== undefined && keepaRev > 0) {
    marketRevAvg = keepaRev
  } else if (searchVol !== undefined && searchVol > 0 && price > 0) {
    const competitors = Math.max(evidence.competitor_count?.value ?? 0, 5)
    const totalCategoryRev = searchVol * 0.005 * price
    marketRevAvg = Math.round(totalCategoryRev / competitors)
    isEstimate = true
    estimateMethod = `${searchVol.toLocaleString()} searches/mo × 0.5% est. conversion × $${price} ÷ ${competitors} competitors`
  } else {
    marketRevAvg = 0
  }

  const conservativeShare = 0.02
  const baseShare         = 0.10
  const optimisticShare   = 0.25

  const cons = marketRevAvg * conservativeShare
  const base = marketRevAvg * baseShare
  const opt  = marketRevAvg * optimisticShare

  const assumptions: string[] = isEstimate
    ? [
        `Market avg seller revenue: ~$${Math.round(marketRevAvg / 1000)}k/mo (search-volume estimate — Keepa data unavailable)`,
        `Estimate method: ${estimateMethod}`,
        `Conservative (2% share): assumes cold-start, no channel, Amazon only`,
        `Base (10% share): assumes 1 existing channel, steady reviews after month 3`,
        `Optimistic (25% share): assumes strong channel + early category placement`,
        thesis.quick_economics_check.launch_complexity === 'high'
          ? 'Launch complexity "high" — add 3–6mo before meaningful revenue'
          : 'Launch complexity allows first sales within stated time horizon',
      ]
    : [
        `Market avg seller revenue: $${Math.round(marketRevAvg / 1000)}k/mo (Keepa provider_model)`,
        `Price point: $${price} (Stage 1 primary_measurement)`,
        `Conservative (2% share): assumes cold-start, no channel, Amazon only`,
        `Base (10% share): assumes 1 existing channel, steady reviews after month 3`,
        `Optimistic (25% share): assumes strong channel + early category placement`,
        thesis.quick_economics_check.launch_complexity === 'high'
          ? 'Launch complexity "high" — add 3–6mo before meaningful revenue'
          : 'Launch complexity allows first sales within stated time horizon',
      ]

  return {
    conservative_monthly: Math.round(cons),
    base_monthly:         Math.round(base),
    optimistic_monthly:   Math.round(opt),
    year1_conservative:   Math.round(cons * 12 * 0.5),
    year1_base:           Math.round(base * 12 * 0.65),
    year1_optimistic:     Math.round(opt * 12 * 0.80),
    market_revenue_avg:   Math.round(marketRevAvg),
    market_share_pct: {
      conservative: conservativeShare * 100,
      base:         baseShare * 100,
      optimistic:   optimisticShare * 100,
    },
    assumptions,
    ...(isEstimate && { is_estimate: true, estimate_method: estimateMethod }),
  }
}

// ── Founder-specific COGS inputs (Stage 4 form) ────────────────────────────

export interface Stage4FounderInputs {
  actual_cogs_per_unit?:   number   // what founder got quoted from CM
  target_launch_price?:    number   // what founder plans to charge
  initial_unit_count?:     number   // first production run size
  planned_ad_budget_mo?:   number   // monthly ad spend
  fulfillment_model?:      'fba' | 'fbm' | '3pl'
}

export interface FullUnitEconomics {
  sensitivity:       SensitivityAnalysis
  revenue_envelope:  RevenueEnvelope
  launch_cost:       LaunchCostModel    // bottom-up launch budget (deterministic estimates)
  founder_inputs?:   Stage4FounderInputs
  // Computed from founder_inputs if provided:
  founder_breakeven_units_mo?: number   // units/mo needed to break even
  founder_target_gm_pct?:      number   // actual GM given their real COGS
}

export function computeFullUnitEconomics(
  evidence:      Stage1Evidence,
  thesis:        InvestmentThesis,
  profile?:      FounderProfile,
  founderInputs?: Stage4FounderInputs
): FullUnitEconomics {
  const targetGM = profile?.risk_posture === 'capital_preservation' ? 0.55
    : profile?.risk_posture === 'high_risk_tolerance' ? 0.45
    : 0.50

  const sensitivity      = computeSensitivityAnalysis(evidence, targetGM, founderInputs?.actual_cogs_per_unit)
  const revenue_envelope = computeRevenueEnvelope(evidence, thesis)
  const launch_cost      = computeLaunchCost(evidence, evidence.ppc_economics?.value)

  const result: FullUnitEconomics = { sensitivity, revenue_envelope, launch_cost, founder_inputs: founderInputs }

  if (founderInputs?.actual_cogs_per_unit !== undefined) {
    const price    = founderInputs.target_launch_price ?? evidence.median_price?.value ?? 0
    const refPct   = evidence.avg_referral_fee_pct?.value ?? 15
    const fbaFee   = evidence.avg_fba_fee?.value ?? 4.50
    const netRev   = price * (1 - refPct / 100) - fbaFee
    const unitGM   = netRev - founderInputs.actual_cogs_per_unit
    const adBudget = founderInputs.planned_ad_budget_mo ?? 0

    result.founder_target_gm_pct = price > 0 ? Math.round((unitGM / price) * 100 * 10) / 10 : undefined

    if (unitGM > 0 && adBudget > 0) {
      result.founder_breakeven_units_mo = Math.ceil(adBudget / unitGM)
    }
  }

  return result
}
