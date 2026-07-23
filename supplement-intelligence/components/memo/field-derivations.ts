// ═══════════════════════════════════════════════════════════════════════
// components/memo/field-derivations.ts — Phase 3 Investor Report
// integration (Roadmap M2.2–M2.5, M2.8, M1.4). Pure, non-JSX derivation
// functions for the M2 intelligence layer's newly-surfaced fields.
//
// Deliberately a separate plain .ts module from shared.tsx (a 'use client'
// .tsx file): these functions are pure data transforms with zero JSX, and
// this codebase has no React component-testing toolchain installed —
// keeping them JSX-free means they can be tested directly and simply
// (vitest's default node environment, no jsdom/testing-library needed)
// without installing new test infrastructure for this milestone alone.
// shared.tsx re-exports everything below so existing `from './shared'`
// import sites are unaffected.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import type { ConfidenceAssessment } from '@/lib/confidence'
import type { LifecycleStage, GapVelocity } from '@/lib/lifecycle'
import type { KillCriterion } from '@/lib/kill-criteria'
import type { OpportunityQuality, MarketVerdictResult } from '@/lib/verdict-matrix'
import type { SupplyVelocitySignal, ScienceSignal } from '@/lib/signal-engine/types'

// ── Roadmap M1.4 — Independence-aware confidence ─────────────────────────
// Replaces the old computeConfidence(m) heuristic, which counted six
// unrelated memo fields being present/non-N/A (competitor name, market
// size, margin, retail price, COGS estimate, formula length) — a proxy
// for "how filled-in is this memo," not a real confidence measurement.
// This reads the real channel-independence formula (lib/confidence) that
// already gates BUILD_NOW server-side. Reuses the same 50%/25% tier
// boundary this codebase's own Evidence Coverage block already applies to
// a like-scaled percentage (components/memo/EvidenceConfidence.tsx) — no
// new threshold invented for this milestone.
export function deriveConfidenceDisplay(assessment: ConfidenceAssessment): { level: 'High' | 'Medium' | 'Low'; note: string } {
  if (assessment.overallConfidence === null) {
    return { level: 'Low', note: 'No real channel-confirmed evidence for this analysis' }
  }
  const pct = Math.round(assessment.overallConfidence * 100)
  const level = pct >= 50 ? 'High' as const : pct >= 25 ? 'Medium' as const : 'Low' as const
  const weakestNote = assessment.weakestDimension ? ` — weakest: ${assessment.weakestDimension}` : ''
  return { level, note: `${pct}% confidence${weakestNote}` }
}

// ── Roadmap M2.8 — real kill criteria display ────────────────────────────
// Replaces the old deriveKillCriteria(m) generator, which produced prose
// built from fixed constants ("CAC exceeds $80," "$10k MRR," "20% lower
// price") never tied to this specific analysis's real signals. Every item
// here comes from lib/kill-criteria.ts's computeKillCriteria — a real
// signal + threshold + the real value it had at generation time. Null
// (never an empty/fabricated list) when this analysis predates the
// kill-criteria feature — the caller renders an honest unavailable state.
export function deriveKillCriteriaItems(killCriteria: KillCriterion[] | undefined): string[] | null {
  if (!killCriteria || killCriteria.length === 0) return null
  return killCriteria.map(c => `${c.label} — currently ${formatCriterionValue(c.valueAtGeneration)}`)
}

function formatCriterionValue(v: KillCriterion['valueAtGeneration']): string {
  if (v === null || v === undefined) return 'unknown'
  return typeof v === 'number' ? v.toFixed(1) : String(v)
}

// ── Roadmap M2.2 — lifecycle stage display ───────────────────────────────
// Real six-stage progression (lib/lifecycle.ts) for components/ui's
// LifecycleArc. Null (never a fabricated stage) when this analysis
// predates the lifecycle classifier.
export const LIFECYCLE_STAGES: LifecycleStage[] = ['Latent', 'Emerging', 'Window Open', 'Contested', 'Saturated', 'Declining']

export interface LifecycleDisplay {
  stages: string[]
  currentIndex: number
  stage: LifecycleStage
  unmeasuredScience: boolean
}

export function deriveLifecycleDisplay(m: MemoData): LifecycleDisplay | null {
  const c = m.lifecycle_classification
  if (!c) return null
  return {
    stages: LIFECYCLE_STAGES,
    currentIndex: LIFECYCLE_STAGES.indexOf(c.stage),
    stage: c.stage,
    unmeasuredScience: c.unmeasured_dimensions.includes('science'),
  }
}

// ── Roadmap M2.2 — gap velocity display ──────────────────────────────────
// value/display are null (never fabricated) when the real underlying
// demand/supply acceleration terms weren't both available for this query.
export interface GapVelocityDisplay {
  value:      number
  display:    string   // e.g. "+12.4 pts"
  demandPct:  number | null
  supplyPct:  number | null
}

export function formatGapVelocity(gv: GapVelocity | undefined): GapVelocityDisplay | null {
  if (!gv || gv.value === null) return null
  const sign = gv.value > 0 ? '+' : ''
  return {
    value: gv.value,
    display: `${sign}${gv.value.toFixed(1)} pts`,
    demandPct: gv.demand_acceleration_pct,
    supplyPct: gv.supply_acceleration_normalized_pct,
  }
}

// ── Roadmap M2.4 — V2 two-axis verdict display ───────────────────────────
// Additive/parallel to the legacy BuildDecision pill — this is a distinct,
// separately-computed verdict (lib/verdict-matrix.ts), not a replacement.
// Null when either half of the pair is missing (legacy pre-M2.4 memo).
export interface V2VerdictDisplay {
  verdict:        MarketVerdictResult['verdict']
  qualityScore:   number
  qualityTier:    OpportunityQuality['tier']
  lifecycleStage: LifecycleStage
}

export function deriveV2VerdictDisplay(
  quality: OpportunityQuality | undefined,
  verdict: MarketVerdictResult | undefined,
): V2VerdictDisplay | null {
  if (!quality || !verdict) return null
  return { verdict: verdict.verdict, qualityScore: quality.score, qualityTier: quality.tier, lifecycleStage: verdict.lifecycleStage }
}

// ── Verdict cross-check (data-density pass, 2026-07-24, owner-approved) ──
// Replaces CurrentSignal's old always-present "Alternate Verdict Check"
// row — which put a second, complete verdict system on screen behind a
// toggle, with a caption admitting the two are "not guaranteed to match."
// The only time the V2 verdict adds information a reader can act on is
// when the two systems genuinely DISAGREE — so this returns null (render
// nothing) on agreement, and a structured disagreement readout otherwise.
//
// "Agreement" needs a defined rule because the two vocabularies differ (4
// legacy values vs 7 V2 values). The bands below are deliberately
// conservative — overlapping/adjacent readings count as agreement, so the
// line only ever fires on a real directional gap, not a wording nuance:
//   BUILD_NOW          ~ Build Now / Build If Differentiated
//   VALIDATE_FURTHER   ~ Build If Differentiated / Watch Closely / Watch / Investigate
//   SKIP               ~ Avoid / Pass
//   CATEGORY_CREATION_CANDIDATE — never compared: the V2 matrix has no
//   category-creation concept, so agreement/disagreement isn't meaningful.
const V2_RANK: Record<MarketVerdictResult['verdict'], number> = {
  BUILD_NOW: 0, BUILD_IF_DIFFERENTIATED: 1, WATCH_CLOSELY: 2, WATCH: 3, INVESTIGATE: 4, AVOID: 5, PASS: 6,
}
const V2_LABEL: Record<MarketVerdictResult['verdict'], string> = {
  BUILD_NOW: 'Build Now', BUILD_IF_DIFFERENTIATED: 'Build If Differentiated', WATCH_CLOSELY: 'Watch Closely',
  WATCH: 'Watch', INVESTIGATE: 'Investigate', AVOID: 'Avoid', PASS: 'Pass',
}
const LEGACY_AGREEMENT_BAND: Record<Exclude<BuildDecision, 'CATEGORY_CREATION_CANDIDATE'>, [number, number]> = {
  BUILD_NOW:        [0, 1],
  VALIDATE_FURTHER: [1, 4],
  SKIP:             [5, 6],
}

export interface VerdictCrossCheck {
  qualityScore: number
  qualityTier:  OpportunityQuality['tier']
  v2Label:      string
  direction:    'more cautious' | 'more optimistic'
}

export function deriveVerdictCrossCheck(
  decision: BuildDecision,
  quality:  OpportunityQuality | undefined,
  verdict:  MarketVerdictResult | undefined,
): VerdictCrossCheck | null {
  const v2 = deriveV2VerdictDisplay(quality, verdict)
  if (!v2) return null
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return null
  const [lo, hi] = LEGACY_AGREEMENT_BAND[decision]
  const rank = V2_RANK[v2.verdict]
  if (rank >= lo && rank <= hi) return null
  return {
    qualityScore: v2.qualityScore,
    qualityTier:  v2.qualityTier,
    v2Label:      V2_LABEL[v2.verdict],
    direction:    rank > hi ? 'more cautious' : 'more optimistic',
  }
}

// ── Roadmap M2.3 — supply velocity display ───────────────────────────────
// Null when the real listedSince sample was too small to compute this
// signal at all (see lib/signal-engine/providers/keepa.ts's
// MIN_SUPPLY_VELOCITY_SAMPLE gate) — never a fabricated share.
export interface SupplyVelocityDisplay {
  youngListingPct12m: number | null
  youngListingPct24m: number | null
  entryVelocity:      SupplyVelocitySignal['entry_velocity'] | null
}

export function deriveSupplyVelocityDisplay(signal: SupplyVelocitySignal | undefined): SupplyVelocityDisplay | null {
  if (!signal) return null
  if (signal.young_listing_pct_12m === undefined && signal.young_listing_pct_24m === undefined) return null
  return {
    youngListingPct12m: signal.young_listing_pct_12m ?? null,
    youngListingPct24m: signal.young_listing_pct_24m ?? null,
    entryVelocity: signal.entry_velocity ?? null,
  }
}

// ── Roadmap M2.5 — science signal display ────────────────────────────────
// Null (honest, common case) when this query isn't one of the small,
// fixed set of ingredients the nightly batch tracks (lib/science-engine/
// tracked-ingredients.ts) — absence here is a coverage gap, not evidence
// the science base is thin.
export interface ScienceDisplay {
  ingredient:             string | null
  publicationTrend:       ScienceSignal['publication_trend'] | null
  publicationVelocityPct: number | null
  trialRegistrationsCount: number | null
}

export function deriveScienceDisplay(signal: ScienceSignal | undefined): ScienceDisplay | null {
  if (!signal) return null
  return {
    ingredient: signal.ingredient ?? null,
    publicationTrend: signal.publication_trend ?? null,
    publicationVelocityPct: signal.publication_velocity_pct ?? null,
    trialRegistrationsCount: signal.trial_registrations_count ?? null,
  }
}
