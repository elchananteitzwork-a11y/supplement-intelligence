// ── Verdict Ledger v1 — types ────────────────────────────────────────────────
//
// V2 Blueprint §11 / Roadmap M1.1. One immutable snapshot per successful
// completed analysis. See supabase/migrations/017_verdict_ledger.sql for the
// full column-by-column rationale, including why this is a new table rather
// than an expansion of build_now_patterns (score-floor constraint conflict).
//
// ARCHITECTURE CONSTRAINT: this module is NEVER imported by lib/scoring.ts.
// The ledger is a read-only historical record for future calibration
// (Roadmap M2.9 quarterly re-measurement) — it has zero influence on the
// Decision Engine, matching the same constraint already enforced for
// lib/pattern-memory.

import type { BuildDecision } from '@/types/index'
import type { ChannelType, ScoreSource } from '@/lib/scoring'
import type { LifecycleStage, LifecycleClassification } from '@/lib/lifecycle'

export type ConfidenceTier = 'HIGH' | 'MODERATE' | 'LOW'

export type { LifecycleStage }

// Mirrors ScoreDimension (lib/scoring.ts) — the exact per-dimension record a
// verdict was computed from, snapshotted verbatim.
export interface LedgerDimensionScore {
  key:              string
  label:            string
  weight:           number
  rawScore?:        number
  qualitativeLevel?: 'High' | 'Medium' | 'Low'
  source:           ScoreSource
  sourceLabel:      string
}

// Mirrors ChannelBreakdownEntry (lib/scoring.ts) — today's 5-channel
// evidence-source taxonomy, NOT yet the V2 blueprint's 7-channel demand-
// witness model (that lands with Roadmap M1.3/M1.4).
export interface LedgerChannelBreakdownEntry {
  channel:     ChannelType
  label:       string
  contributed: boolean
  providers:   string[]
}

// Mirrors DimensionConfidence (lib/confidence/types.ts) — snapshotted
// verbatim, kept as an independent type here (not imported from
// lib/confidence) so the ledger's on-disk shape never silently changes if
// that module's internal types evolve; the two are kept in sync by the
// extraction function, not by a shared type reference.
export interface LedgerChannelWitness {
  channel:     ChannelType
  confirmed:   boolean
  providers:   string[]
  reliability: number
}
export interface LedgerDimensionConfidence {
  key:                     string
  label:                   string
  confidence:              number | null
  witnesses:               LedgerChannelWitness[]
  confirmingChannelCount:  number
  channelMismatch:         boolean
}

// report_status: 'passed' = normal memo (any BuildDecision), 'content_skip'
// = the Decision Engine itself returned SKIP with valid evidence. A ledger
// row is never written for a technical failure (model/JSON parse failure) —
// no valid memo exists in that case, so there is nothing honest to snapshot.
export type ReportStatus = 'passed' | 'content_skip'

// Full record written to verdict_ledger. Field order matches the migration.
export interface VerdictLedgerEntry {
  analysis_id: string
  user_id:     string

  // ── Identity ──────────────────────────────────────────────────
  user_query:        string
  normalized_market: string
  category:          string
  category_id:       string | null

  // ── Engine version ───────────────────────────────────────────
  engine_version:  string
  scoring_version: string | null

  // ── Provider availability ────────────────────────────────────
  contributing_providers:         string[]
  total_score_eligible_providers: number
  evidence_breadth_pct:           number
  provider_channel_breakdown:     LedgerChannelBreakdownEntry[]
  distinct_channel_types:         number
  cross_channel_corroborated:     boolean

  // ── Scores ────────────────────────────────────────────────────
  dimension_scores: LedgerDimensionScore[]

  // ── Pillars — always null until Roadmap M2.4 (four-pillar model) ships ──
  pillar_scores:     null
  pillar_confidence: null

  // ── Lifecycle — Roadmap M2.2, heuristic-v1. Null only for analyses
  // scored before this milestone shipped (never fabricated retroactively).
  lifecycle_stage:        LifecycleStage | null
  lifecycle_inputs:       LifecycleClassification['inputs'] | null
  lifecycle_model_version: string | null
  gap_velocity:                        number | null
  gap_velocity_demand_acceleration_pct: number | null
  gap_velocity_supply_acceleration_pct: number | null

  // ── Independence-aware confidence (Milestone 2 / migration 018) ──
  // Today's 7-dimension granularity — distinct from pillar_confidence
  // above, which is reserved for the future 4-pillar model. Optional/null
  // when no ConfidenceAssessment was supplied to extraction (keeps this
  // type backward-compatible with any future caller that doesn't have one).
  dimension_confidence:      LedgerDimensionConfidence[] | null
  overall_confidence:        number | null
  weakest_dimension:         string | null
  confirming_channel_count:  number | null
  confidence_model_version:  string | null

  // ── Safety gate ───────────────────────────────────────────────
  safety_gate_tier:  BuildDecision | null
  safety_gate_clean: boolean

  // ── Verdict ───────────────────────────────────────────────────
  opportunity_score:        number
  verdict:                  BuildDecision
  verdict_confidence:       ConfidenceTier | null
  verdict_override_reasons: string[]
  grounded_pct:              0 | 100
  insufficient_evidence:    boolean

  // ── Report status ─────────────────────────────────────────────
  report_status: ReportStatus
}

// Row shape as read back from the database (adds server-generated fields).
export interface VerdictLedgerRow extends VerdictLedgerEntry {
  id:         string
  created_at: string
}
