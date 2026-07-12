// ── Independence-aware confidence — types ────────────────────────────────────
//
// V2 Blueprint §10. The confidence math (this module) is consumed two ways:
// (1) as an enrichment recorded on the Verdict Ledger after a decision is
// already final (lib/verdict-ledger, unchanged since Milestone 2), and
// (2) as one gate input inside lib/scoring.ts's computeGroundedScore
// (Milestone 3's channel-independence gate) — the same "additional gate
// alongside the safety/economics gates" pattern already used there, never
// a weight change. Types here never encode a decision themselves; only
// lib/scoring.ts's own mostConservative() logic turns a low channel count
// into a capped verdict.

import type { ChannelType } from '@/lib/scoring'

// One real, contributing provider's name (e.g. 'keepa', 'dataforseo') —
// reuses the exact provider identifiers already defined in
// lib/scoring.ts's PROVIDER_CHANNEL map. Not re-declared here; string is
// intentional to avoid a circular type dependency on a private map.
export type ProviderId = string

// Witness-style readout for one channel's role in confirming a dimension —
// mirrors the V2 UX Blueprint's "witness dot" vocabulary (filled = actually
// confirmed this query, hollow = structurally eligible but silent).
export interface ChannelWitness {
  channel:     ChannelType
  confirmed:   boolean
  // The specific real provider(s) that confirmed this channel for this
  // dimension, empty when confirmed is false.
  providers:   ProviderId[]
  // The reliability prior used for this channel (max among confirming
  // providers) — 0 when confirmed is false.
  reliability: number
}

export interface DimensionConfidence {
  key:   string   // matches ScoreDimension.key
  label: string

  // Null when the dimension has weight 0 (qualitative/AI-judgment or
  // excluded) — there is no real evidence to be confident about, so no
  // confidence number is reported. Matches the "confidence is earned, never
  // exaggerated" principle: absence of evidence never gets a default score.
  confidence: number | null   // 0–1, 1 − Π(1 − rᵢ) over confirming channels

  // Every channel this dimension is structurally eligible to draw from,
  // each marked confirmed/unconfirmed for THIS specific query.
  witnesses: ChannelWitness[]

  // How many distinct channels actually confirmed (witnesses.filter(confirmed).length).
  confirmingChannelCount: number

  // True only when a verified (weight > 0) dimension had zero eligible
  // channels confirm — a structural gap in the eligibility map rather than
  // a real "no evidence" case. Surfaced for visibility, never silently
  // absorbed into a fabricated number.
  channelMismatch: boolean
}

export interface ConfidenceAssessment {
  // computed once, versioned independently of SCORING_ENGINE_VERSION since
  // the confidence math can evolve without touching the Decision Engine.
  confidenceModelVersion: string

  dimensions: DimensionConfidence[]

  // Weakest-link composite: min(confidence) across dimensions with
  // weight > 0 and a non-null confidence. Never an average — a single
  // poorly-evidenced load-bearing dimension caps the whole verdict's
  // reported confidence, per V2 Blueprint §10.
  overallConfidence: number | null
  weakestDimension:  string | null

  // Total distinct channels confirming ACROSS all verified dimensions
  // (union, not sum) — the number the future two-channel gate (next
  // milestone) will read to decide whether a top-tier verdict is allowed.
  distinctConfirmingChannels: number
}
