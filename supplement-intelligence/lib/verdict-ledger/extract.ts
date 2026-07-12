// ── Verdict Ledger v1 — deterministic extraction ─────────────────────────────
//
// Extracts a VerdictLedgerEntry from an already-scored memo. No AI
// involvement — every value is either read directly from a real data field
// or computed via a deterministic rule over those values. Mirrors
// lib/pattern-memory/extract.ts's approach, scoped to every completed
// analysis rather than BUILD_NOW only.
//
// ARCHITECTURE CONSTRAINT: never import this from lib/scoring.ts.

import type { MemoData, BuildDecision } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import { computeVerdictConfidence } from '@/lib/ai-interpretation/verdict'
import type { ConfidenceAssessment } from '@/lib/confidence'
import type {
  VerdictLedgerEntry, LedgerDimensionScore, LedgerChannelBreakdownEntry,
  LedgerDimensionConfidence, ReportStatus,
} from './types'

export interface ExtractLedgerEntryContext {
  memo:              MemoData
  grounded:          GroundedScore
  userQuery:         string
  normalizedMarket:  string
  categoryId:        string
  engineVersion:     string
  userId:            string
  analysisId:        string
  // Optional so this context type stays backward-compatible with any caller
  // that predates Milestone 2. Null/omitted → all confidence columns null.
  confidenceAssessment?: ConfidenceAssessment
}

// report_status: the Decision Engine returned a real verdict either way —
// 'content_skip' just means that verdict was SKIP. Distinct from a
// technical failure (model/JSON parse failure), which never reaches this
// function at all (see app/api/generate/route.ts call site — gated on
// `groundedScore !== null`, which is null only on technical skip).
function classifyReportStatus(decision: BuildDecision): ReportStatus {
  return decision === 'SKIP' ? 'content_skip' : 'passed'
}

export function extractVerdictLedgerEntry(ctx: ExtractLedgerEntryContext): VerdictLedgerEntry {
  const {
    memo, grounded, userQuery, normalizedMarket, categoryId, engineVersion, userId, analysisId,
    confidenceAssessment,
  } = ctx

  const dimensionConfidence: LedgerDimensionConfidence[] | null = confidenceAssessment
    ? confidenceAssessment.dimensions.map(d => ({
        key: d.key, label: d.label, confidence: d.confidence,
        witnesses: d.witnesses.map(w => ({
          channel: w.channel, confirmed: w.confirmed, providers: w.providers, reliability: w.reliability,
        })),
        confirmingChannelCount: d.confirmingChannelCount,
        channelMismatch: d.channelMismatch,
      }))
    : null

  const dimensionScores: LedgerDimensionScore[] = grounded.dimensions.map(d => ({
    key:              d.key,
    label:            d.label,
    weight:           d.weight,
    rawScore:         d.rawScore,
    qualitativeLevel: d.qualitativeLevel,
    source:           d.source,
    sourceLabel:      d.sourceLabel,
  }))

  const channelBreakdown: LedgerChannelBreakdownEntry[] = grounded.evidenceBreadth.channelBreakdown.map(c => ({
    channel:     c.channel,
    label:       c.label,
    contributed: c.contributed,
    providers:   c.providers,
  }))

  // Same safety-tier computation the Decision Engine itself already ran —
  // re-derived here from the same real fields (memo.news_intelligence),
  // not a second independent judgment. Matches lib/pattern-memory/extract.ts's
  // safety_clean derivation exactly, so the two records never disagree.
  const news       = memo.news_intelligence
  const fdaItems   = (news?.items ?? []).filter(i => i.provider === 'openfda')
  const fdaRecalls = fdaItems.filter(i => i.recall_classification).length
  const fdaAdverse = fdaItems.filter(i => i.adverse_event_reactions?.length).length
  const safetyGateClean =
    !!news && !news.failedProviders?.includes('openfda') && fdaRecalls === 0 && fdaAdverse < 2

  // The safety tier that would independently override the verdict, when one
  // fired (present in verdictOverrideReasons as a human sentence today —
  // here we want the machine-readable tier). Re-derive: if an override
  // reason exists AND the final decision is more conservative than what the
  // score alone would produce, the tier IS the final decision; otherwise null.
  const safetyGateTier: BuildDecision | null =
    grounded.verdictOverrideReasons?.some(r => r.startsWith('Safety gate'))
      ? grounded.decision
      : null

  const verdictConfidence = memo.expandable_cards
    ? computeVerdictConfidence(memo.expandable_cards)
    : null

  return {
    analysis_id: analysisId,
    user_id:     userId,

    user_query:        userQuery,
    normalized_market: normalizedMarket,
    category:          memo.category_name,
    category_id:       categoryId,

    engine_version:  engineVersion,
    scoring_version: memo.scoring_version ?? null,

    contributing_providers:         grounded.evidenceBreadth.contributingProviders,
    total_score_eligible_providers: grounded.evidenceBreadth.totalScoreEligibleProviders,
    evidence_breadth_pct:           grounded.evidenceBreadth.pct,
    provider_channel_breakdown:     channelBreakdown,
    distinct_channel_types:         grounded.evidenceBreadth.distinctChannelTypes,
    cross_channel_corroborated:     grounded.evidenceBreadth.crossChannelCorroborated,

    dimension_scores: dimensionScores,

    // Always null in v1 — see types.ts header comment.
    pillar_scores:     null,
    pillar_confidence: null,
    lifecycle_stage:   null,
    gap_velocity:      null,

    // Independence-aware confidence (Milestone 2) — null only when the
    // caller didn't supply a ConfidenceAssessment (never fabricated).
    dimension_confidence:     dimensionConfidence,
    overall_confidence:       confidenceAssessment?.overallConfidence ?? null,
    weakest_dimension:        confidenceAssessment?.weakestDimension ?? null,
    confirming_channel_count: confidenceAssessment?.distinctConfirmingChannels ?? null,
    confidence_model_version: confidenceAssessment?.confidenceModelVersion ?? null,

    safety_gate_tier:  safetyGateTier,
    safety_gate_clean: safetyGateClean,

    opportunity_score:        grounded.score,
    verdict:                  grounded.decision,
    verdict_confidence:       verdictConfidence,
    verdict_override_reasons: grounded.verdictOverrideReasons ?? [],
    grounded_pct:              grounded.groundedPct as 0 | 100,
    insufficient_evidence:    grounded.insufficientEvidence,

    report_status: classifyReportStatus(grounded.decision),
  }
}
