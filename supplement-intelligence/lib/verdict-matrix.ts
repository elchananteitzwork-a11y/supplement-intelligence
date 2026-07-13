// ── Verdict Matrix — two-axis decisions — Roadmap M2.4 ──────────────────────
//
// V2 Blueprint §7, §8. Two axes, computed independently and never blended:
//
//   Axis 1 — Opportunity Quality (0-100): a weighted blend of the four
//   scoring pillars (Demand Reality 30 / Supply Response 25 / Entry
//   Economics 25 / Differentiation Opening 20), evidence-gated and
//   weight-redistributing exactly like lib/scoring.ts's existing
//   scoreFromCandidates — this IS that same mechanism, regrouped into four
//   pillars instead of a flat six-dimension blend. No new formula; every
//   pillar's rawScore is read directly off the already-computed, already-
//   tested GroundedScore.dimensions (or, for Supply Response, off M2.3's
//   already-computed and already-scored supply_velocity signal).
//
//   Axis 2 — Timing (lifecycle stage, from lib/lifecycle.ts / Roadmap M2.2):
//   passed in as a plain string, never read from inside this module's own
//   Quality computation. This is what makes the Blueprint's Principle 7
//   test true by construction: computeOpportunityQuality() does not take a
//   lifecycle stage as an argument at all, so the same pillar inputs at any
//   stage produce the exact same Quality score — see
//   lib/__tests__/verdict-matrix.test.ts's "Principle 7" test.
//
// ADDITIVE, NOT A REPLACEMENT: this module is a new, parallel decision
// surface (MemoData.opportunity_quality / MemoData.market_verdict). It does
// not read, write, or otherwise touch grounded.score / grounded.decision
// (BuildDecision) — that verdict, the leaderboard, pattern memory, and every
// existing UI verdict badge are completely unaffected. This was an explicit
// scope decision (not a blueprint requirement) to avoid an architectural
// rewrite of the ~10 files that consume BuildDecision today; see the
// Roadmap M2.4 completion note for the full rationale.
//
// PILLAR MAPPING (disclosed, not invented from thin air):
//   - Demand Reality      ← `demand` dimension (Amazon units/growth + search
//     velocity — already blended per SCORING_ENGINE_VERSION 2.10.0).
//   - Supply Response     ← M2.3's supply_velocity.score verbatim (new-
//     listing velocity — the Blueprint's #1 named input for this pillar).
//     Blueprint also names trademark-filing velocity (unbuilt, Roadmap
//     M2.6) and price-compression/seller-count/buy-box-share signals (real,
//     collected by Keepa, but not yet blended into any score anywhere) —
//     both are disclosed gaps, not fabricated into this pillar's number.
//   - Entry Economics     ← `profitability` + `marketAccessibility`, blended
//     using their existing BASE_WEIGHTS (20/18) as sub-weights — exactly
//     the two inputs Blueprint §2 names for this pillar. Paid-media
//     viability (Meta ad density as CAC proxy) is a disclosed gap: the
//     existing `virality` composite blends tiktok + meta-ads + reddit into
//     one number with no clean per-channel decomposition available without
//     new signal-engine work, so it is not split out and used here.
//   - Differentiation Opening ← `consumerPain` dimension (pain clusters +
//     unserved-claim-gap themes — already blended into this dimension's
//     "opportunity" component per SCORING_ENGINE_VERSION 2.2.0). Science
//     angle availability is a disclosed gap (Roadmap M2.5, unbuilt).
//
// `virality` and `subscription` are not named as inputs to ANY of the four
// pillars in Blueprint §2 — both are excluded from Opportunity Quality
// entirely, the same report-enrichment-only treatment already given to
// manufacturing and seasonality since the Roadmap M1.2 scoring-honesty pass.

import type { MemoData } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import type { LifecycleStage } from '@/lib/lifecycle'
import type { ConfidenceAssessment } from '@/lib/confidence'

export const VERDICT_MATRIX_VERSION = 'heuristic-v1'

export type MarketVerdict =
  | 'BUILD_NOW'
  | 'BUILD_IF_DIFFERENTIATED'
  | 'WATCH_CLOSELY'
  | 'WATCH'
  | 'INVESTIGATE'
  | 'AVOID'
  | 'PASS'

export type QualityTier = 'High' | 'Mid' | 'Low'

export type PillarKey = 'demandReality' | 'supplyResponse' | 'entryEconomics' | 'differentiationOpening'

export interface PillarScore {
  key:          PillarKey
  label:        string
  weight:       number              // normalized share of total (0-1); 0 when excluded
  rawScore?:    number              // 0-10; undefined when excluded (no verified input)
  confidence?:  number              // 0-1, reused from the dimension(s)/signal already backing this pillar — never recomputed
  source:       'verified' | 'excluded'
  sourceLabel:  string
}

export interface OpportunityQuality {
  score:   number   // 0-100
  tier:    QualityTier
  pillars: PillarScore[]
  version: typeof VERDICT_MATRIX_VERSION
}

export interface BuildNowGate {
  channelsConfirming:      number
  entryEconomicsVerified:  boolean
  safetyGateClear:         boolean
  passed:                  boolean
}

export interface MarketVerdictResult {
  verdict:        MarketVerdict
  qualityTier:    QualityTier
  lifecycleStage: LifecycleStage
  // Populated only when the matrix cell resolved to BUILD_NOW pre-gate —
  // null for every other cell, since the gate is BUILD_NOW-specific
  // (Blueprint §8: "BUILD_NOW additionally requires...").
  buildNowGate:   BuildNowGate | null
  version:        typeof VERDICT_MATRIX_VERSION
}

// Reuses BASE_WEIGHTS' own already-calibrated, already-disclosed
// score>=70/>=45 thresholds (lib/scoring.ts's scoreFromCandidates) as the
// High/Mid/Low quality-tier boundaries — no new threshold invented, since
// Opportunity Quality is explicitly "an evolution of computeGroundedScore,
// not a rewrite" (Blueprint §7) on the same 0-100 scale.
const QUALITY_TIER_HIGH_MIN = 70
const QUALITY_TIER_MID_MIN  = 45

const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  demandReality:           30,
  supplyResponse:          25,
  entryEconomics:          25,
  differentiationOpening:  20,
}

const PILLAR_LABELS: Record<PillarKey, string> = {
  demandReality:          'Demand Reality',
  supplyResponse:         'Supply Response',
  entryEconomics:         'Entry Economics',
  differentiationOpening: 'Differentiation Opening',
}

function excluded(key: PillarKey, sourceLabel: string): PillarScore {
  return { key, label: PILLAR_LABELS[key], weight: 0, source: 'excluded', sourceLabel }
}

export function computeOpportunityQuality(grounded: GroundedScore, m: MemoData): OpportunityQuality {
  const demand             = grounded.dimensions.find(d => d.key === 'demand')
  const profitability      = grounded.dimensions.find(d => d.key === 'profitability')
  const marketAccess       = grounded.dimensions.find(d => d.key === 'marketAccessibility')
  const consumerPain       = grounded.dimensions.find(d => d.key === 'consumerPain')
  const supplyVelocity     = m.signal_evidence?.supply_velocity?.value

  const pillars: PillarScore[] = []

  // Pillar 1 — Demand Reality
  if (demand?.source === 'verified' && demand.weight > 0 && demand.rawScore !== undefined) {
    pillars.push({
      key: 'demandReality', label: PILLAR_LABELS.demandReality,
      weight: PILLAR_WEIGHTS.demandReality, rawScore: demand.rawScore,
      source: 'verified', sourceLabel: demand.sourceLabel,
    })
  } else {
    pillars.push(excluded('demandReality', 'No verified Amazon/search demand signal for this query'))
  }

  // Pillar 2 — Supply Response (M2.3's supply_velocity.score, reused verbatim)
  if (supplyVelocity?.score !== undefined) {
    pillars.push({
      key: 'supplyResponse', label: PILLAR_LABELS.supplyResponse,
      weight: PILLAR_WEIGHTS.supplyResponse, rawScore: supplyVelocity.score,
      confidence: supplyVelocity.confidence,
      source: 'verified',
      sourceLabel: `Keepa listedSince distribution — ${supplyVelocity.sample_size ?? 0} competitors`,
    })
  } else {
    pillars.push(excluded('supplyResponse', 'Insufficient listedSince sample for a real new-listing-velocity read (Roadmap M2.3)'))
  }

  // Pillar 3 — Entry Economics (profitability + marketAccessibility, blended
  // by their existing BASE_WEIGHTS as sub-weights — same 20/18 ratio already
  // used to compute the six-dimension Grounded Score, not a new ratio).
  const econSubs: { rawScore: number; weight: number; label: string }[] = []
  if (profitability?.source === 'verified' && profitability.rawScore !== undefined) {
    econSubs.push({ rawScore: profitability.rawScore, weight: 20, label: 'profitability' })
  }
  if (marketAccess?.source === 'verified' && marketAccess.rawScore !== undefined) {
    econSubs.push({ rawScore: marketAccess.rawScore, weight: 18, label: 'market accessibility' })
  }
  if (econSubs.length) {
    const totalW   = econSubs.reduce((s, x) => s + x.weight, 0)
    const blended  = Math.round((econSubs.reduce((s, x) => s + x.rawScore * x.weight, 0) / totalW) * 10) / 10
    pillars.push({
      key: 'entryEconomics', label: PILLAR_LABELS.entryEconomics,
      weight: PILLAR_WEIGHTS.entryEconomics, rawScore: blended,
      source: 'verified', sourceLabel: econSubs.map(s => s.label).join(' + '),
    })
  } else {
    pillars.push(excluded('entryEconomics', 'No verified profitability or market-accessibility data for this query'))
  }

  // Pillar 4 — Differentiation Opening
  if (consumerPain?.source === 'verified' && consumerPain.rawScore !== undefined) {
    pillars.push({
      key: 'differentiationOpening', label: PILLAR_LABELS.differentiationOpening,
      weight: PILLAR_WEIGHTS.differentiationOpening, rawScore: consumerPain.rawScore,
      source: 'verified', sourceLabel: consumerPain.sourceLabel,
    })
  } else {
    pillars.push(excluded('differentiationOpening', 'No verified consumer-pain/opportunity signal for this query'))
  }

  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0)
  const normalized  = pillars.map(p => ({ ...p, weight: totalWeight > 0 ? Math.round((p.weight / totalWeight) * 1000) / 1000 : 0 }))
  const score = totalWeight > 0
    ? Math.max(0, Math.min(100, Math.round(normalized.reduce((s, p) => s + (p.rawScore ?? 0) * p.weight, 0) * 10)))
    : 0

  const tier: QualityTier = score >= QUALITY_TIER_HIGH_MIN ? 'High' : score >= QUALITY_TIER_MID_MIN ? 'Mid' : 'Low'

  return { score, tier, pillars: normalized, version: VERDICT_MATRIX_VERSION }
}

// Blueprint §8's literal 4x4 table (Emerging/Window Open/Contested/Saturated
// x High/Mid/Low).
const CORE_MATRIX: Record<QualityTier, Record<'Emerging' | 'Window Open' | 'Contested' | 'Saturated', MarketVerdict>> = {
  High: { Emerging: 'WATCH_CLOSELY', 'Window Open': 'BUILD_NOW', Contested: 'BUILD_IF_DIFFERENTIATED', Saturated: 'AVOID' },
  Mid:  { Emerging: 'WATCH',         'Window Open': 'INVESTIGATE',  Contested: 'AVOID',                  Saturated: 'AVOID' },
  Low:  { Emerging: 'PASS',          'Window Open': 'PASS',         Contested: 'PASS',                    Saturated: 'PASS' },
}

// Blueprint §8: "Latent and Declining stages resolve to WATCH/PASS and
// AVOID/PASS respectively" — the two edge stages outside the literal 4x4
// table collapse to two possible verdicts each rather than four, since
// there is less to discriminate (no Search/Social/Amazon acceleration
// signature to distinguish High from Mid the way the core table does).
// Disclosed extension, not literal blueprint text: Low quality always
// resolves to PASS (consistent with every Low cell in the core table);
// High or Mid quality resolves to WATCH for Latent (there's a real,
// evidenced problem/product gap worth tracking) or AVOID for Declining
// (the market is contracting regardless of today's pillar scores).
function resolveEdgeStage(stage: 'Latent' | 'Declining', tier: QualityTier): MarketVerdict {
  if (tier === 'Low') return 'PASS'
  return stage === 'Latent' ? 'WATCH' : 'AVOID'
}

export function computeMarketVerdict(
  opportunityQuality: OpportunityQuality,
  lifecycleStage: LifecycleStage,
  grounded: GroundedScore,
  confidenceAssessment: ConfidenceAssessment,
): MarketVerdictResult {
  const tier = opportunityQuality.tier

  let verdict: MarketVerdict
  if (lifecycleStage === 'Latent' || lifecycleStage === 'Declining') {
    verdict = resolveEdgeStage(lifecycleStage, tier)
  } else {
    verdict = CORE_MATRIX[tier][lifecycleStage]
  }

  // Blueprint §8: "BUILD_NOW additionally requires: ≥2 independent demand
  // channels confirming, Entry Economics pillar verified (not qualitative),
  // and safety gate clear." Reuses the already-built M1.4 confidence
  // assessment's demand-dimension channel count and the already-existing
  // safety-gate-override detection (same technique lib/verdict-ledger/
  // extract.ts already uses for safety_gate_tier) — no new gate mechanism.
  let buildNowGate: BuildNowGate | null = null
  if (verdict === 'BUILD_NOW') {
    const demandConf = confidenceAssessment.dimensions.find(d => d.key === 'demand')
    const channelsConfirming     = demandConf?.confirmingChannelCount ?? 0
    const entryEconomicsVerified = opportunityQuality.pillars.find(p => p.key === 'entryEconomics')?.source === 'verified'
    const safetyGateClear        = !grounded.verdictOverrideReasons?.some(r => r.startsWith('Safety gate'))
    const passed = channelsConfirming >= 2 && entryEconomicsVerified && safetyGateClear

    buildNowGate = { channelsConfirming, entryEconomicsVerified, safetyGateClear, passed }
    // Downgrade target: WATCH_CLOSELY, the adjacent High-quality/Emerging
    // cell — "the fundamentals look like the entry moment, but the
    // evidence is too thin to commit; watch closely instead." Mirrors the
    // existing Decision Engine's own philosophy of never silently keeping
    // an unverified top verdict (lib/scoring.ts's evidenceForBuildNow gate).
    if (!passed) verdict = 'WATCH_CLOSELY'
  }

  return { verdict, qualityTier: tier, lifecycleStage, buildNowGate, version: VERDICT_MATRIX_VERSION }
}
