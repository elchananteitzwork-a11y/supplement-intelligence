// ── Kill Switch Engine ─────────────────────────────────────────────────────
// Four deterministic rules that AI cannot override.
// Each switch evaluates a specific market condition; any triggered switch
// must be surfaced in the final Investment Memo with a mandatory notice.
// Triggering in "flagging mode" means the deal is not dead but requires
// the founder to acknowledge the risk before proceeding.

import type { Stage1Evidence } from '../evidence/adapter'
import type { InvestmentThesis } from '../stage2/types'

export type KillSwitchId =
  | 'PATENT_BLOCKING'
  | 'FDA_CLEARANCE_REQUIRED'
  | 'ECONOMICS_STRUCTURALLY_BROKEN'
  | 'COMMODITY_PRICE_COMPRESSION'

export interface KillSwitchResult {
  id:           KillSwitchId
  triggered:    boolean
  boundary_zone: boolean    // within ±5% of threshold — conservative trigger
  mode:         'block' | 'flag'   // flag = shows notice; block = pipeline stops
  reason:       string
  data_used:    Record<string, number | string | undefined>
  mandatory_notice?: string
}

// ── KS1: PATENT_BLOCKING ──────────────────────────────────────────────────
// Triggered when AI analysis of competitor claims detects language
// suggesting active patents on the core formulation or mechanism.
// Milestone 1-2: flagging mode only (no USPTO search yet).
// Mandatory legal disclaimer always shown when triggered.

export function checkPatentBlocking(
  aiPatentSignal: boolean,
  patentClaimText?: string
): KillSwitchResult {
  return {
    id:           'PATENT_BLOCKING',
    triggered:    aiPatentSignal,
    boundary_zone: false,
    mode:         'flag',
    reason:       aiPatentSignal
      ? `Patent risk detected: ${patentClaimText ?? 'competitor claims suggest formulation may be patented'}`
      : 'No patent blocking signal detected',
    data_used:    { ai_patent_signal: String(aiPatentSignal), claim: patentClaimText ?? 'none' },
    mandatory_notice: aiPatentSignal
      ? 'LEGAL NOTICE: This analysis identified potential patent risk. You must conduct a USPTO patent search and obtain qualified IP legal counsel before making any investment or production decision. This platform cannot assess patentability.'
      : undefined,
  }
}

// ── KS2: FDA_CLEARANCE_REQUIRED ──────────────────────────────────────────
// Triggered when the product angle implies a drug claim, a disease claim,
// or a mechanism that would require FDA pre-market approval.
// Flagging mode — AI identifies the claim type.

export function checkFdaClearanceRequired(
  aiClearanceSignal: boolean,
  claimType?: string
): KillSwitchResult {
  return {
    id:           'FDA_CLEARANCE_REQUIRED',
    triggered:    aiClearanceSignal,
    boundary_zone: false,
    mode:         'flag',
    reason:       aiClearanceSignal
      ? `FDA pre-market review may be required: ${claimType ?? 'product angle involves drug/disease claims'}`
      : 'No FDA clearance flag detected',
    data_used:    { ai_clearance_signal: String(aiClearanceSignal), claim_type: claimType ?? 'none' },
    mandatory_notice: aiClearanceSignal
      ? 'REGULATORY NOTICE: This analysis identified potential FDA pre-market approval requirements. Supplements may NOT make disease claims or imply drug-like mechanisms without FDA clearance. Consult a regulatory attorney before proceeding.'
      : undefined,
  }
}

// ── KS3: ECONOMICS_STRUCTURALLY_BROKEN ───────────────────────────────────
// Triggered when maximum achievable gross margin cannot reach 35%.
// Formula: maxGM = (price_floor - price_floor×referralPct/100 - fbaFee - optimistic_cogs) / price_floor
// price_floor = p25 of the price distribution (worst-case realistic sell price)
// optimistic_cogs = COGS assuming 50% of the median market price (very generous)
//
// Boundary zone: |maxGM - 0.35| < 0.05 → trigger conservatively, show uncertainty note

export function checkEconomicsStructurallyBroken(
  priceFloor:    number,   // p25 of price distribution, or min price
  referralPct:   number,   // e.g. 15
  fbaFee:        number,   // dollars
  optimisticCOGS?: number  // override; if not provided, use 50% of price_floor
): KillSwitchResult {
  const cogs   = optimisticCOGS ?? priceFloor * 0.50
  const maxGM  = (priceFloor - priceFloor * (referralPct / 100) - fbaFee - cogs) / priceFloor
  const delta  = Math.abs(maxGM - 0.35)
  const boundary_zone = delta < 0.05
  const triggered = maxGM < 0.35

  return {
    id:           'ECONOMICS_STRUCTURALLY_BROKEN',
    triggered,
    boundary_zone,
    mode:         'flag',
    reason:       triggered
      ? `Max achievable GM is ${(maxGM * 100).toFixed(1)}% — below 35% threshold even with optimistic COGS`
      : `Max achievable GM is ${(maxGM * 100).toFixed(1)}% — above 35% threshold`,
    data_used:    {
      price_floor:      priceFloor,
      referral_pct:     referralPct,
      fba_fee:          fbaFee,
      optimistic_cogs:  Math.round(cogs * 100) / 100,
      max_gm_pct:       Math.round(maxGM * 100 * 10) / 10,
      threshold_pct:    35,
    },
    mandatory_notice: boundary_zone
      ? `ECONOMICS CAUTION: Maximum achievable gross margin (${(maxGM * 100).toFixed(1)}%) is within 5% of the 35% viability threshold. Margin is sensitive to COGS — do not proceed without a real manufacturing quote.`
      : triggered
      ? `ECONOMICS BLOCKER: This market's price floor cannot support a viable business. Even with optimistic COGS (${(cogs).toFixed(2)}/unit), the maximum achievable gross margin is ${(maxGM * 100).toFixed(1)}% — below the 35% minimum for a sustainable supplement business.`
      : undefined,
  }
}

// ── KS4: COMMODITY_PRICE_COMPRESSION ─────────────────────────────────────
// Triggered when category prices have fallen >15% over the measurement window.
// Uses avg90 vs avg365 as a 12-month proxy (full 24-month requires stats=730).
// Threshold: compression_pct < -15 → triggered; < -10 → boundary zone.

export function checkCommodityPriceCompression(
  priceCompressionPct: number | undefined
): KillSwitchResult {
  if (priceCompressionPct === undefined) {
    return {
      id:           'COMMODITY_PRICE_COMPRESSION',
      triggered:    false,
      boundary_zone: false,
      mode:         'flag',
      reason:       'Price compression data unavailable — cannot assess commoditization risk',
      data_used:    { compression_pct: 'unavailable' },
    }
  }

  const triggered     = priceCompressionPct < -15
  const boundary_zone = !triggered && priceCompressionPct < -10

  return {
    id:           'COMMODITY_PRICE_COMPRESSION',
    triggered,
    boundary_zone,
    mode:         'flag',
    reason:       triggered
      ? `Category prices fell ${Math.abs(priceCompressionPct)}% in the last 12 months — commodity compression detected`
      : boundary_zone
      ? `Mild price compression (${priceCompressionPct}%) — approaching commoditization territory`
      : `Price compression ${priceCompressionPct}% — within acceptable range`,
    data_used:    {
      compression_pct:   priceCompressionPct,
      threshold_pct:     -15,
      boundary_pct:      -10,
      window:            '12-month proxy (avg90 vs avg365)',
    },
    mandatory_notice: triggered
      ? `COMMODITIZATION WARNING: Category prices have fallen ${Math.abs(priceCompressionPct)}% in the last 12 months. Entering a commoditizing market requires a significant differentiation moat — generic positioning will not survive.`
      : boundary_zone
      ? `PRICE PRESSURE NOTICE: Mild price compression detected (${priceCompressionPct}%). Premium pricing strategy requires strong brand differentiation to avoid being dragged down with the category.`
      : undefined,
  }
}

// ── Run all kill switches against a thesis ────────────────────────────────

export interface KillSwitchEvaluation {
  results:           KillSwitchResult[]
  any_triggered:     boolean
  any_boundary:      boolean
  all_switches_clear: boolean
  triggered_ids:     KillSwitchId[]
}

export function runAllKillSwitches(
  evidence: Stage1Evidence,
  thesis: InvestmentThesis,
  // These come from the AI adversarial analysis (KS1+KS2 are AI-assisted flags)
  aiFlags: {
    patent_blocking: boolean
    patent_claim_text?: string
    fda_clearance_required: boolean
    fda_claim_type?: string
  }
): KillSwitchEvaluation {
  // KS3 inputs: use p25 of price distribution as price floor
  const priceFloor = evidence.price_range?.value?.min ?? evidence.median_price?.value ?? 0
  const referralPct = evidence.avg_referral_fee_pct?.value ?? 15
  const fbaFee = evidence.avg_fba_fee?.value ?? 4.50

  const results: KillSwitchResult[] = [
    checkPatentBlocking(aiFlags.patent_blocking, aiFlags.patent_claim_text),
    checkFdaClearanceRequired(aiFlags.fda_clearance_required, aiFlags.fda_claim_type),
    checkEconomicsStructurallyBroken(priceFloor, referralPct, fbaFee),
    checkCommodityPriceCompression(evidence.price_compression_pct?.value),
  ]

  const triggered_ids = results.filter(r => r.triggered).map(r => r.id)

  return {
    results,
    any_triggered:      triggered_ids.length > 0,
    any_boundary:       results.some(r => r.boundary_zone),
    all_switches_clear: triggered_ids.length === 0,
    triggered_ids,
  }
}

// ── Reconstruct KillSwitchEvaluation from stored results ──────────────────
// Used in Stage 4 memo route when re-deriving the verdict from persisted data
// without re-running the AI calls that set KS1/KS2 flags.

export function reconstructKillSwitchEvaluation(storedResults: KillSwitchResult[]): KillSwitchEvaluation {
  const triggered_ids = storedResults.filter(r => r.triggered).map(r => r.id)
  return {
    results:            storedResults,
    any_triggered:      triggered_ids.length > 0,
    any_boundary:       storedResults.some(r => r.boundary_zone),
    all_switches_clear: triggered_ids.length === 0,
    triggered_ids,
  }
}
