// ── Evidence Depth Score — Roadmap M2.21 ─────────────────────────────────────
//
// Interpretation A (approved R&D document): a new, additive, standalone
// decision surface that reads the six real fields the Evidence Depth Cluster
// has shipped so far (M2.15-M2.20) where present, and computes a disclosed,
// coverage-honest composite. Same "new, parallel decision surface" precedent
// as lib/verdict-matrix.ts — this module does not read, write, or otherwise
// touch lib/scoring.ts, GroundedScore, SCORING_ENGINE_VERSION, or any
// existing verdict. Nothing here calls an AI/Anthropic SDK, and nothing here
// fetches anything new — every input is passed in already-fetched by the
// caller (see the six-field list below and each field's own milestone
// header comment for where it was originally sourced).
//
// Explicitly NOT Interpretation B (full Decision Engine synthesis) — that
// was considered and rejected at the R&D stage because it would require a
// SCORING_ENGINE_VERSION bump (Constitution Law 20 — changes real prior
// verdicts) and because 4 of the 6 input signals are sparse (gated to the
// fixed 3-ingredient TRACKED_INGREDIENTS list — see
// lib/science-engine/tracked-ingredients.ts), which would make a
// real-verdict-affecting composite structurally unreliable.
//
// ── The six real inputs (all already shipped, read-only) ────────────────────
//   1. ingredient_tracked            — M2.15, lib/ingredient-registry / matchTrackedIngredient
//      gates whether inputs 2-3 can possibly be present at all. Always
//      determinable (matchTrackedIngredient always returns a real yes/no),
//      so this is the one input a caller should always be able to supply.
//   2. strongest_evidence_type       — M2.16, ScienceSignal.strongest_evidence_type
//   3. market_dose_mg                — M2.17, ScienceSignal.market_dose_mg
//   4. regulatory                    — M2.18, ScienceSignal.regulatory (RegulatoryIntelligence)
//      NOT the older, separate Stage1Evidence.regulatory_intelligence /
//      regulatory_safety channel fed by app/api/research/market-signal/route.ts
//      — a different, pre-existing code path this module never reads.
//   5. competitors[].claim_risk_flags          — M2.19
//   6. competitors[].manufacturer_recall_flags — M2.20
//
// (5) and (6) share one real gating condition — lib/signal-engine/providers/
// competition.ts always attempts both scans for every found competitor
// listing, so "was a scan attempted" is really "did any competitor data
// exist for this query," true for both channels together. They are still
// disclosed as two separate contributions/inputs because the R&D document
// names them as two distinct milestone fields with two distinct real data
// sources (a text-language scanner vs. an OpenFDA firm-name lookup) — a
// consumer of `inputs_available` should be able to tell them apart even
// though they happen to co-occur today.
//
// ── Score model (disclosed, not calibrated) ──────────────────────────────
// Each of the 6 inputs contributes its own 0-100 "depth" score ONLY when it
// was actually available for this query; the composite `score` is the plain
// average of whichever contributions exist — never padded with a fabricated
// 0 for a structurally-absent input (same "absence is a coverage gap, not
// evidence of thinness" convention as lib/scoring.ts's ScoreDimension
// weight-redistribution-on-absence pattern). `coverage` (contributions
// available / 6) travels alongside `score` specifically so a high score
// built from 1-2 available inputs is never presented as equivalent to a
// high score built from all 6 — this is the R&D document's non-negotiable
// disclosure requirement.
//
// Per-input contribution, all real, all deterministic, no invented weights
// dressed up as calibrated (see VELOCITY_THRESHOLD_PCT-style honesty
// convention referenced in the R&D document — this is a stated, commented,
// initial value, not tuned against real outcome data, since none exists yet
// for this signal):
//   - ingredient_canonicalization: 100 if tracked, 0 if not. The only input
//     scored on a real negative fact rather than excluded on absence,
//     because "not on the tracked list" is itself a definite, always-known
//     answer, not a data gap.
//   - strongest_evidence_type: graded by real rank in PubMed's own
//     STUDY_TYPE_PRIORITY list (lib/news-engine/providers/pubmed.ts, reused
//     verbatim rather than re-invented) — rank 0 (Meta-Analysis) = 100,
//     lowest listed rank = 100/length, unrecognized string = excluded.
//   - market_dose_mg: 100 when a real DSLD market-dose distribution exists
//     for this ingredient. Binary — no honest graded sub-measure exists
//     within this milestone's approved six-field scope (dose ADEQUACY
//     against RDA is M2.17's own separate concern, not re-derived here).
//   - regulatory_intelligence: RegulatoryIntelligence.confidence x 100 — a
//     real, already-computed field, not a new invented number.
//   - claim_risk_scan / manufacturer_recall_scan: 100 when real competitor
//     listing data existed for the scan to run against. Deliberately NOT
//     modulated by how many flags were found — a flagged claim or a recall
//     is a real finding to disclose (see the raw counts below), not
//     evidence of "less depth." This score measures whether the check could
//     run, not which way it came out.

import type { RegulatoryIntelligence } from '@/lib/regulatory-engine/types'
import { STUDY_TYPE_PRIORITY } from '@/lib/news-engine/providers/pubmed'

export const EVIDENCE_DEPTH_SCORE_VERSION = 'v1'

const TOTAL_INPUTS = 6

export type EvidenceDepthInputKey =
  | 'ingredient_canonicalization'
  | 'strongest_evidence_type'
  | 'market_dose_mg'
  | 'regulatory_intelligence'
  | 'claim_risk_scan'
  | 'manufacturer_recall_scan'

export interface EvidenceDepthCompetitor {
  claim_risk_flags?: string[]
  manufacturer_recall_flags?: { class: string; count: number }[]
}

export interface EvidenceDepthScoreInput {
  // M2.15 — always determinable (matchTrackedIngredient returns a real
  // yes/no for any query); optional only so a caller that genuinely could
  // not determine it can still call this function without crashing.
  ingredient_tracked?: boolean
  // M2.16
  strongest_evidence_type?: string
  // M2.17
  market_dose_mg?: { median: number; min: number; max: number }
  // M2.18 — ScienceSignal.regulatory, NOT Stage1Evidence.regulatory_intelligence.
  regulatory?: RegulatoryIntelligence
  // M2.19/M2.20 — same array Stage1Evidence.top_competitors already carries
  // (lib/evidence/adapter.ts); pass it straight through, no new fetch.
  competitors?: EvidenceDepthCompetitor[]
}

export interface EvidenceDepthInputContribution {
  input: EvidenceDepthInputKey
  score: number   // 0-100, this single input's own depth contribution
}

export interface EvidenceDepthScore {
  // False only when none of the 6 inputs were available — see
  // computeEvidenceDepthScore's own header comment for why this can happen
  // (e.g. a non-tracked-ingredient query with no competitor data at all).
  available: boolean
  // 0-100, plain average of available contributions. Undefined (never a
  // fabricated 0) when `available` is false.
  score?: number
  // contributions.length / 6, rounded to 2 decimals — how many of the 6
  // possible real inputs were actually available for this analysis. Read
  // this alongside `score`: a `score` built from low `coverage` is real but
  // partial, not a misleadingly "complete" read.
  coverage: number
  inputs_available: EvidenceDepthInputKey[]
  contributions: EvidenceDepthInputContribution[]
  // Disclosure-only counts — never feed into `score` (see header comment on
  // why claim/recall findings affect disclosure, not the depth score).
  competitors_scanned?: number
  total_claim_risk_flags?: number
  competitors_with_recall_flags?: number
  methodology: string
  version: string
}

const METHODOLOGY =
  'Unweighted average of the 0-100 depth contribution from each of up to 6 real, already-fetched Evidence Depth Cluster inputs ' +
  '(M2.15 ingredient canonicalization, M2.16 strongest evidence type, M2.17 market dose data, M2.18 regulatory intelligence, ' +
  'M2.19 claim-risk scan, M2.20 manufacturer-recall scan) that were actually available for this query. Missing inputs are ' +
  'excluded, never scored 0 — see `coverage` for how many of the 6 were actually available; a high `score` built from partial ' +
  'coverage is never presented as equivalent to one built from full coverage. This is an initial, disclosed heuristic (equal ' +
  'per-input weighting, not calibrated against real outcome data, since none exists yet for this signal) — see ' +
  'lib/evidence-depth-score/index.ts header comment for the exact per-input formula.'

export function computeEvidenceDepthScore(input: EvidenceDepthScoreInput): EvidenceDepthScore {
  const contributions: EvidenceDepthInputContribution[] = []

  if (input.ingredient_tracked !== undefined) {
    contributions.push({
      input: 'ingredient_canonicalization',
      score: input.ingredient_tracked ? 100 : 0,
    })
  }

  if (input.strongest_evidence_type) {
    const rank = STUDY_TYPE_PRIORITY.indexOf(input.strongest_evidence_type)
    // Unrecognized string (shouldn't happen — this value is always sourced
    // from STUDY_TYPE_PRIORITY itself) is excluded rather than guessed.
    if (rank >= 0) {
      contributions.push({
        input: 'strongest_evidence_type',
        score: Math.round((100 * (STUDY_TYPE_PRIORITY.length - rank)) / STUDY_TYPE_PRIORITY.length),
      })
    }
  }

  if (input.market_dose_mg) {
    contributions.push({ input: 'market_dose_mg', score: 100 })
  }

  if (input.regulatory) {
    const confidence = Math.max(0, Math.min(1, input.regulatory.confidence))
    contributions.push({ input: 'regulatory_intelligence', score: Math.round(confidence * 100) })
  }

  const competitorsScanned = !!input.competitors?.length
  if (competitorsScanned) {
    contributions.push({ input: 'claim_risk_scan', score: 100 })
    contributions.push({ input: 'manufacturer_recall_scan', score: 100 })
  }

  const available = contributions.length > 0
  const score = available
    ? Math.round(contributions.reduce((sum, c) => sum + c.score, 0) / contributions.length)
    : undefined

  const result: EvidenceDepthScore = {
    available,
    score,
    coverage: Math.round((contributions.length / TOTAL_INPUTS) * 100) / 100,
    inputs_available: contributions.map(c => c.input),
    contributions,
    methodology: METHODOLOGY,
    version: EVIDENCE_DEPTH_SCORE_VERSION,
  }

  if (competitorsScanned) {
    result.competitors_scanned = input.competitors!.length
    result.total_claim_risk_flags = input.competitors!.reduce(
      (sum, c) => sum + (c.claim_risk_flags?.length ?? 0), 0,
    )
    result.competitors_with_recall_flags = input.competitors!.filter(
      c => (c.manufacturer_recall_flags?.length ?? 0) > 0,
    ).length
  }

  return result
}
