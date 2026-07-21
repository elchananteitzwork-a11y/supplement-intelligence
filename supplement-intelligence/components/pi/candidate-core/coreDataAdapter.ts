// ── Core/hero summary layer — real-data adapter (UIv2-M2 Phase 1) ───────
//
// The ONE new file translating real Analysis/MemoData (via the real,
// already-shipped, already-audited functions this milestone's R&D
// document requires reusing verbatim — RD-UIv2-M2-candidate-detail-core-
// phase1.md §1/§3) into the props the ported Core/blade WebGL components
// expect. No scoring, confidence, or kill-criteria math lives here — every
// number below is read straight off computeGroundedScore /
// computeConfidenceAssessment / the analysis's own stored kill_criteria,
// never recomputed, approximated, or fabricated. lib/scoring.ts,
// lib/confidence/*, and lib/kill-criteria.ts are READ-ONLY inputs to this
// file, per the owner's hard constraint — nothing here changes verdict
// logic, confidence math, or kill-switch evaluation.

import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore, type ScoreDimension } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import type { KillCriterion } from '@/lib/kill-criteria'
import type { WatchlistEntry, WatchlistAlert } from '@/lib/watchlist/types'

// Copied verbatim from components/memo/CurrentSignal.tsx's own (private,
// unexported) PILL_CFG label strings. components/memo/*.tsx is Phase-2
// scope this milestone (R&D §7 — not touched), so this is a disclosed,
// deliberate duplication of a literal label map rather than a shared
// import — the same "copied verbatim ... so the two always say the same
// thing" convention the approved design prototype's own bladeTargets.ts
// used for evidenceSourceData before that prototype later consolidated it
// into one file. If CurrentSignal.tsx's PILL_CFG labels ever change, this
// map must be updated by hand to match — flagged here rather than solved
// silently, since a real drift here would be a real honesty bug (the Core
// hub and the legacy pill disagreeing about what the same verdict is
// called).
const PILL_LABEL: Record<BuildDecision, string> = {
  BUILD_NOW:                   'Entry Supported',
  VALIDATE_FURTHER:            'Validation Required',
  SKIP:                        'Not Supported',
  CATEGORY_CREATION_CANDIDATE: 'Category Creation',
}

export interface CoreBladeViewModel {
  key: string
  label: string
  /** Real, already-normalized ScoreDimension.weight (0-1, sums to 1 across
   * every weight>0 dimension — lib/scoring.ts's scoreFromCandidates), i.e.
   * this blade's real, current share of the opportunity score. 0 for a
   * qualitative (weight-excluded) or unavailable dimension — never a
   * fabricated weight. Used by corePullPhysics.ts's honest resistance
   * re-derivation, and available for the blade's own visual prominence. */
  weight: number
  /** 0-10, the exact ScoreDimension.rawScore this blade's magnitude/
   * emissive-luminosity is driven by — null when this dimension has no
   * real numeric score for this analysis (qualitative-AI-judgment-only,
   * or the dimension was never computed at all for this analysis, e.g.
   * consumerPain when no consumer_intelligence was ever fetched). Never a
   * fabricated placeholder value; the rotor renders a real "no data" state
   * for null rather than guessing a number. */
  magnitude: number | null
  qualitativeLevel: 'High' | 'Medium' | 'Low' | null
  /** 'unavailable' is an adapter-level state, not a ScoreDimension.source
   * value — it means this dimension was never even pushed as a candidate
   * for this analysis (see consumerPain above), distinct from
   * 'synthesized' (AI judgment WAS given, just no real basis). */
  source: 'verified' | 'synthesized' | 'unavailable'
  sourceLabel: string
  /** MemoDisplay CORE_SECTIONS id this blade's click/Enter jumps to — see
   * this file's own HONESTY CAVEAT below for the mapping rationale (R&D
   * §4's open "blade-click -> section" judgment call). */
  sectionId: string
}

export type KillCriterionWatchState = 'not-watched' | 'watching' | 'triggered'

export interface CoreKillCriterionViewModel {
  key: string
  label: string
  /** Verbatim of the same formatCriterionValue derivation
   * components/memo/field-derivations.ts's deriveKillCriteriaItems already
   * uses for the legacy Kill Criteria section, so the two never disagree
   * about how a given valueAtGeneration renders as text. */
  valueAtGenerationText: string
  watchState: KillCriterionWatchState
}

export interface CoreViewModel {
  score: number
  /** Raw grounded decision — exposed alongside decisionLabel only so the
   * hero's DOM overlay can pick a color using the exact same
   * BuildDecision-keyed palette already established for this verdict
   * elsewhere in the pi component family (components/pi/CandidateRow.tsx's
   * DECISION_CHIP) rather than inventing a new color mapping. Never used
   * for the label text itself — decisionLabel (PILL_LABEL, matching
   * CurrentSignal.tsx) is the one legacy verdict word rendered. */
  decision: BuildDecision
  decisionLabel: string
  insufficientEvidence: boolean
  /** 0-100 or null — Math.round(overallConfidence * 100), the exact same
   * formula components/memo/EvidenceConfidence.tsx already renders. */
  confidencePct: number | null
  weakestDimensionLabel: string | null
  /** Exactly 6 entries, one per weighted ScoreDimension key (manufacturing
   * is weight-0/qualitative-only and excluded from the rotor's blades,
   * consistent with the existing weighting — R&D §1). */
  blades: CoreBladeViewModel[]
  killCriteria: CoreKillCriterionViewModel[]
}

// ── HONESTY CAVEAT — blade -> MemoDisplay section mapping (R&D §4, open
// question (a) chosen over (b)) ─────────────────────────────────────────
// The approved design prototype's blade-click scrolled to a matching
// evidence card by id (a 1:1 evidence-source -> card mapping that no
// longer exists once fabricated "direction" is stripped — see this
// module's other HONESTY CAVEAT below). Real MemoDisplay.CORE_SECTIONS
// (components/memo/MemoDisplay.tsx) doesn't have a section per
// ScoreDimension either: 6 dimensions, 7 core section ids. Rather than
// defer blade-click to Phase 2 (R&D §4 option (b)), each dimension is
// mapped to the nearest section that already, demonstrably, reads that
// dimension's own real underlying data — verified by reading each
// section's own source file, not guessed:
//   demand              -> demand-intensity   (exact name match)
//   marketAccessibility -> supply-landscape    (SupplyLandscape.tsx imports
//                                               marketAccessibilityProvenance
//                                               and mapAccessibility directly)
//   profitability        -> unit-economics      (exact topic match — COGS/
//                                               fee/margin ledger)
//   consumerPain          -> differentiation    (DifferentiationBrief.tsx
//                                               renders the same real,
//                                               clustered Apify review
//                                               corpus consumerPain's own
//                                               sourceLabel cites)
//   virality               -> demand-intensity   (MemoDisplay.tsx's own
//                                               Roadmap M1.5 comment: the
//                                               virality composite was
//                                               historically "folded
//                                               invisibly into Demand
//                                               Intensity's TikTok card")
//   subscription           -> strategic-readiness (StrategicReadinessChecklist.tsx's
//                                               own RiskAssessment reads
//                                               the 'subscription' scored
//                                               dimension directly, DIM_LABELS
//                                               includes it by name)
// Two blades (demand, virality) share one target section — an honest
// consequence of there being no dedicated Marketing/Social section in
// CORE_SECTIONS today, not an error.
const SECTION_ID_FOR_DIMENSION: Record<string, string> = {
  demand:               'demand-intensity',
  marketAccessibility:  'supply-landscape',
  profitability:        'unit-economics',
  consumerPain:         'differentiation',
  virality:              'demand-intensity',
  subscription:          'strategic-readiness',
}

// Fixed render order around the (brand-locked, geometry-only) six-blade
// mark — highest BASE_WEIGHTS (lib/scoring.ts) first. The blade geometry
// itself carries no inherent per-slot meaning (it's the brand mark, not a
// data-encoded shape), so this ordering is a disclosed UI judgment call,
// not a derived fact.
const BLADE_KEY_ORDER = ['demand', 'profitability', 'marketAccessibility', 'consumerPain', 'virality', 'subscription'] as const

// consumerPain is the one dimension assembleDimensions (lib/scoring.ts)
// can omit entirely (when m.consumer_intelligence never existed for this
// analysis) rather than push as a qualitative fallback like every other
// dimension — see lib/scoring.ts's assembleDimensions, the `painScore !==
// null` guard. This is the one real label lookup needed for that
// "dimension never computed at all" case; every other key's label is
// always present on its own ScoreDimension already.
const CONSUMER_PAIN_FALLBACK_LABEL = 'Customer Opportunity'

function buildBlade(dim: ScoreDimension | undefined, key: (typeof BLADE_KEY_ORDER)[number]): CoreBladeViewModel {
  if (!dim) {
    return {
      key,
      label: key === 'consumerPain' ? CONSUMER_PAIN_FALLBACK_LABEL : key,
      weight: 0,
      magnitude: null,
      qualitativeLevel: null,
      source: 'unavailable',
      sourceLabel: 'Not computed for this analysis',
      sectionId: SECTION_ID_FOR_DIMENSION[key],
    }
  }
  return {
    key: dim.key,
    label: dim.label,
    weight: dim.weight,
    magnitude: typeof dim.rawScore === 'number' ? dim.rawScore : null,
    qualitativeLevel: dim.qualitativeLevel ?? null,
    source: dim.source,
    sourceLabel: dim.sourceLabel,
    sectionId: SECTION_ID_FOR_DIMENSION[dim.key] ?? 'current-signal',
  }
}

function formatCriterionValue(v: KillCriterion['valueAtGeneration']): string {
  // Verbatim of components/memo/field-derivations.ts's own
  // formatCriterionValue — kept as a small intentional duplicate (same
  // "copied verbatim" convention/caveat as PILL_LABEL above) rather than
  // importing a function local to the untouched components/memo module.
  if (v === null || v === undefined) return 'unknown'
  return typeof v === 'number' ? v.toFixed(1) : String(v)
}

export interface WatchStateInput {
  /** This analysis's own active watchlist row, or null if never watched /
   * unwatched — read via lib/watchlist/store.ts's existing listWatches
   * (RLS-respecting, no new query pattern). */
  entry: WatchlistEntry | null
  /** This user's real watchlist_alerts rows (lib/watchlist/store.ts's
   * existing listAlerts) — the ONLY place a kill criterion's real
   * triggered state is ever recorded (written by the existing
   * lib/watchlist/recheck.ts cron job's evaluateKillCriterion call, never
   * recomputed client-side here — see this module's HONESTY CAVEAT below). */
  alerts: WatchlistAlert[]
}

// ── HONESTY CAVEAT — kill-criteria watch state (R&D §4) ─────────────────
// evaluateKillCriterion (lib/kill-criteria.ts) only ever runs inside the
// existing Watchlist re-check cron (lib/watchlist/recheck.ts), against
// fresh values this page has no reason to re-fetch. This function NEVER
// calls evaluateKillCriterion itself and never re-evaluates a criterion
// client-side — a criterion is only ever shown as 'triggered' when a real
// watchlist_alerts row (alert_type: 'kill_criteria_triggered') already
// exists for it, written by that same existing recheck job. A
// watchlisted-but-never-triggered criterion reads 'watching' (a real,
// honest state: it IS being actively monitored); a non-watchlisted
// analysis's criteria always read 'not-watched' — never a fabricated
// state either way.
// Exported (2026-07-2x, Compare-page rewire): app/api/research/compare's
// AnalysisComparisonItem reuses this EXACT function to derive its own
// kill_criteria_clear/triggered_kill_criteria fields, per the same HONESTY
// CAVEAT above — never reimplemented in the Compare route.
export function buildKillCriteria(killCriteria: KillCriterion[] | undefined, watch: WatchStateInput): CoreKillCriterionViewModel[] {
  if (!killCriteria || killCriteria.length === 0) return []
  return killCriteria.map(c => {
    let watchState: KillCriterionWatchState = 'not-watched'
    if (watch.entry) {
      const triggered = watch.alerts.some(
        a => a.watchlist_id === watch.entry!.id && a.alert_type === 'kill_criteria_triggered' && a.kill_criterion_key === c.key,
      )
      watchState = triggered ? 'triggered' : 'watching'
    }
    return { key: c.key, label: c.label, valueAtGenerationText: formatCriterionValue(c.valueAtGeneration), watchState }
  })
}

/** The single entry point — everything the Core/hero layer renders comes
 * through this function. Pure: same (m, watch) in, same view-model out,
 * no fetch, no side effect. */
export function buildCoreViewModel(m: MemoData, watch: WatchStateInput): CoreViewModel {
  const grounded = computeGroundedScore(m)
  const confidence = computeConfidenceAssessment(grounded)

  const dimByKey = new Map(grounded.dimensions.map(d => [d.key, d]))
  const blades = BLADE_KEY_ORDER.map(key => buildBlade(dimByKey.get(key), key))

  const weakestDim = confidence.weakestDimension ? grounded.dimensions.find(d => d.key === confidence.weakestDimension) : undefined

  return {
    score: grounded.score,
    decision: grounded.decision,
    decisionLabel: grounded.insufficientEvidence ? 'Insufficient Data' : PILL_LABEL[grounded.decision],
    insufficientEvidence: grounded.insufficientEvidence,
    confidencePct: confidence.overallConfidence !== null ? Math.round(confidence.overallConfidence * 100) : null,
    weakestDimensionLabel: weakestDim?.label ?? confidence.weakestDimension,
    blades,
    killCriteria: buildKillCriteria(m.kill_criteria, watch),
  }
}
