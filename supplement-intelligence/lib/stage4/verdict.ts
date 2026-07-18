// ── Verdict Determination Logic ────────────────────────────────────────────
// Completely deterministic — no AI can generate or modify these verdicts.
// The Market Verdict is founder-agnostic. The Founder Verdict is profile-adjusted.
// Both are computed from structured data, not prose.

import type { KillSwitchEvaluation } from '../stage3/kill-switches'
import type { LaunchThresholdAssessment } from '../stage25/launch-threshold'
import type { FounderFitAnnotation } from '../stage2/types'
import type { FullUnitEconomics } from './unit-economics'

// ── Market Verdict (founder-agnostic) ─────────────────────────────────────

export type MarketVerdictCode =
  | 'PURSUE'           // Strong opportunity, no blockers
  | 'PURSUE_WITH_CAUTION' // Opportunity exists but specific risks must be managed
  | 'INVESTIGATE_FURTHER' // Insufficient data or boundary conditions — more research needed
  | 'DO_NOT_PURSUE'    // Kill switch triggered or economics structurally broken

export interface MarketVerdict {
  code:             MarketVerdictCode
  headline:         string    // 1-sentence, factual
  rationale:        string[]  // 3–5 specific reasons (data-backed)
  blockers:         string[]  // what prevents a higher verdict
  conditions:       string[]  // what must be true for this verdict to hold
  data_confidence:  'high' | 'medium' | 'low'
}

// ── Founder Verdict (profile-adjusted) ────────────────────────────────────

export type FounderVerdictCode =
  | 'STRONG_FIT'        // Market + fit both good
  | 'CONDITIONAL_FIT'   // Market good, fit requires specific conditions
  | 'MISALIGNED'        // Market good but founder profile doesn't fit this thesis
  | 'NOT_READY'         // Founder lacks capital, experience, or timeline

export interface FounderVerdict {
  code:         FounderVerdictCode
  headline:     string
  rationale:    string[]
  requirements: string[]   // what the founder must do/have before proceeding
  divergence?:  string     // if market verdict and founder verdict diverge significantly
}

// ── Verdict computation ────────────────────────────────────────────────────

function computeDataConfidence(
  thresholds: LaunchThresholdAssessment
): 'high' | 'medium' | 'low' {
  if (thresholds.fail_count === 0 && thresholds.warn_count <= 1) return 'high'
  if (thresholds.fail_count <= 1 && thresholds.warn_count <= 2) return 'medium'
  return 'low'
}

export function determineMarketVerdict(
  killSwitches: KillSwitchEvaluation,
  thresholds:   LaunchThresholdAssessment,
  economics:    FullUnitEconomics
): MarketVerdict {
  const ks = killSwitches
  const sensitivity = economics.sensitivity.base_case

  // Hard blockers
  const hasEconomicsBlocker = ks.results.find(r => r.id === 'ECONOMICS_STRUCTURALLY_BROKEN' && r.triggered)
  const hasCommodityBlocker = ks.results.find(r => r.id === 'COMMODITY_PRICE_COMPRESSION' && r.triggered)
  const thresholdsBlock     = thresholds.overall === 'fail'

  // Soft flags
  const patentFlag  = ks.results.find(r => r.id === 'PATENT_BLOCKING' && r.triggered)
  const fdaFlag     = ks.results.find(r => r.id === 'FDA_CLEARANCE_REQUIRED' && r.triggered)
  const boundaryZone = ks.any_boundary

  const blockers: string[] = []
  const conditions: string[] = []
  const rationale: string[] = []

  if (hasEconomicsBlocker) {
    blockers.push(hasEconomicsBlocker.reason)
  }
  if (hasCommodityBlocker) {
    blockers.push(hasCommodityBlocker.reason)
  }
  if (thresholdsBlock) {
    thresholds.checks.filter(c => c.result === 'fail').forEach(c => {
      blockers.push(`${c.metric}: ${c.reason}`)
    })
  }
  if (patentFlag) {
    blockers.push('Patent risk requires IP legal clearance before proceeding')
  }
  if (fdaFlag) {
    blockers.push('FDA regulatory pathway must be clarified before any production')
  }
  const fdaRegulatoryFlag = ks.results.find(r => r.id === 'FDA_REGULATORY_RISK' && r.triggered)
  if (fdaRegulatoryFlag) {
    blockers.push('Critical regulatory risk (OpenFDA/FAERS) — conduct regulatory due diligence before launch')
  }

  // Construct rationale from thresholds
  thresholds.checks.filter(c => c.result === 'pass').forEach(c => {
    rationale.push(`${c.metric} confirmed: ${c.value}`)
  })
  thresholds.checks.filter(c => c.result === 'warn').forEach(c => {
    conditions.push(`${c.metric}: ${c.reason}`)
  })

  // Honesty fix (2026-07-18 audit, Law 12 — no fabricated precision): only
  // surface the specific breakeven-COGS dollar figure in founder-facing
  // rationale when it was computed from real Keepa referral%/FBA-fee data.
  // When lib/stage4/unit-economics.ts computeSensitivityAnalysis had to fall
  // back to its disclosed 15%/$4.50 defaults (fee_data_source === 'estimated'),
  // omit the line entirely rather than presenting an assumed number as measured.
  if (sensitivity.breakeven_cogs > 0 && economics.sensitivity.fee_data_source === 'real') {
    rationale.push(`COGS budget: up to $${sensitivity.breakeven_cogs.toFixed(2)}/unit to achieve ${sensitivity.target_gm_pct}% GM at $${sensitivity.price} price point`)
  }

  let code: MarketVerdictCode
  let headline: string

  if (blockers.length >= 2 || hasEconomicsBlocker || thresholdsBlock) {
    code     = 'DO_NOT_PURSUE'
    headline = 'Market conditions do not support a viable entry — structural blockers identified'
  } else if (blockers.length === 1 || (patentFlag || fdaFlag || fdaRegulatoryFlag)) {
    code     = 'PURSUE_WITH_CAUTION'
    headline = 'Market opportunity exists but one or more significant risks require resolution before committing capital'
  } else if (boundaryZone || thresholds.overall === 'warn' || computeDataConfidence(thresholds) === 'low') {
    code     = 'INVESTIGATE_FURTHER'
    headline = 'Market signal is present but thin — additional validation needed before capital commitment'
  } else {
    code     = 'PURSUE'
    headline = 'Market conditions support entry — demand confirmed, economics viable, no structural blockers'
  }

  return {
    code,
    headline,
    rationale:       rationale.slice(0, 5),
    blockers,
    conditions,
    data_confidence: computeDataConfidence(thresholds),
  }
}

export function determineFounderVerdict(
  marketVerdict: MarketVerdict,
  fit:           FounderFitAnnotation
): FounderVerdict {
  const requirements: string[] = []
  const rationale: string[] = []

  // No point if market is blocked
  if (marketVerdict.code === 'DO_NOT_PURSUE') {
    return {
      code:         'NOT_READY',
      headline:     'Market verdict blocks this opportunity regardless of founder fit',
      rationale:    ['Market-level blockers must be resolved before founder fit is relevant'],
      requirements: marketVerdict.blockers,
    }
  }

  // Capital check
  if (fit.capital_fit.level === 'insufficient') {
    requirements.push(`Raise or secure ${fit.capital_fit.note}`)
  }
  if (fit.timeline_fit.level === 'infeasible') {
    requirements.push(`Extend time horizon — ${fit.timeline_fit.note}`)
  }
  fit.experience_gaps.forEach(g => requirements.push(g))

  // Rationale
  if (fit.capital_fit.level === 'sufficient') rationale.push(`Capital fit: ${fit.capital_fit.note}`)
  if (fit.channel_fit.level === 'strong')     rationale.push(`Channel fit: ${fit.channel_fit.note}`)
  if (fit.timeline_fit.level === 'feasible')  rationale.push(`Timeline fit: ${fit.timeline_fit.note}`)
  fit.advantages.forEach(a => rationale.push(a))

  let code: FounderVerdictCode
  let headline: string

  if (fit.fit_rank >= 4 && requirements.length === 0) {
    code     = 'STRONG_FIT'
    headline = 'Your profile aligns well with this opportunity — capital, channel, and timeline all confirmed'
  } else if (fit.fit_rank >= 3 && requirements.length <= 2) {
    code     = 'CONDITIONAL_FIT'
    headline = 'Opportunity is viable for your profile with specific gaps to address before launch'
  } else if (fit.capital_fit.level === 'insufficient' || fit.timeline_fit.level === 'infeasible') {
    code     = 'NOT_READY'
    headline = 'Capital or timeline gaps make this specific opportunity not viable in current profile'
  } else {
    code     = 'MISALIGNED'
    headline = 'Market opportunity is real but your profile is better suited to a different thesis in this space'
  }

  // Divergence note
  let divergence: string | undefined
  if (marketVerdict.code === 'PURSUE' && (code === 'NOT_READY' || code === 'MISALIGNED')) {
    divergence = 'Market verdict is positive but your current profile does not position you to capture this opportunity — address gaps first or consider a co-founder with complementary strengths.'
  }
  if (marketVerdict.code === 'PURSUE_WITH_CAUTION' && code === 'STRONG_FIT') {
    divergence = 'Your profile is well-suited but the market has specific risks — proceed only after resolving market-level blockers.'
  }

  return { code, headline, rationale: rationale.slice(0, 4), requirements, divergence }
}
