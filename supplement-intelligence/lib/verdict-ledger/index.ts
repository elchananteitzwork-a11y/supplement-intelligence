// ── Verdict Ledger v1 — public API ────────────────────────────────────────────
//
// V2 Blueprint §11 / Roadmap M1.1.
//
// ARCHITECTURE CONSTRAINT: this module is NEVER imported by lib/scoring.ts.
// The Decision Engine remains fully independent. The ledger is append-only
// at generation time and read-only historical record for future calibration
// (Roadmap M2.9) — it has zero influence on scoring decisions.
//
// Usage:
//   writeVerdictLedgerEntry(sb, ctx)              ← in generate/route.ts, after analyses.insert
//   queryVerdictLedger(sb, { limit, verdict })     ← for analytics / future re-measurement

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractVerdictLedgerEntry } from './extract'
import type { ExtractLedgerEntryContext } from './extract'
import type { VerdictLedgerEntry, VerdictLedgerRow } from './types'

export type {
  VerdictLedgerEntry, VerdictLedgerRow, LedgerDimensionScore, LedgerChannelBreakdownEntry,
  LedgerDimensionConfidence, LedgerChannelWitness,
} from './types'
export { extractVerdictLedgerEntry } from './extract'
export type { ExtractLedgerEntryContext } from './extract'

// ── Write ─────────────────────────────────────────────────────────────────────

// Called exactly once per completed analysis, after analyses.insert succeeds.
// Never throws — failure is logged and swallowed so it never blocks
// delivery, matching lib/pattern-memory's write contract exactly.
//
// Idempotent: upsert on the analysis_id unique constraint with
// ignoreDuplicates — a retried call for the same analysis_id is a silent
// no-op, not a second row and not a logged error. A fresh analysis always
// has a fresh analysis_id, so a genuine re-run of the same search still
// produces a new, distinct ledger row (the desired "new timestamped
// snapshot" behavior) — only literal retries of this exact write collapse.
export async function writeVerdictLedgerEntry(
  sb: SupabaseClient,
  ctx: ExtractLedgerEntryContext,
): Promise<void> {
  try {
    const entry = extractVerdictLedgerEntry(ctx)
    const { error } = await sb
      .from('verdict_ledger')
      .upsert(
        {
          analysis_id: entry.analysis_id,
          user_id:     entry.user_id,

          user_query:        entry.user_query,
          normalized_market: entry.normalized_market,
          category:          entry.category,
          category_id:       entry.category_id,

          engine_version:  entry.engine_version,
          scoring_version: entry.scoring_version,

          contributing_providers:         entry.contributing_providers,
          total_score_eligible_providers: entry.total_score_eligible_providers,
          evidence_breadth_pct:           entry.evidence_breadth_pct,
          provider_channel_breakdown:     entry.provider_channel_breakdown,
          distinct_channel_types:         entry.distinct_channel_types,
          cross_channel_corroborated:     entry.cross_channel_corroborated,

          dimension_scores: entry.dimension_scores,

          pillar_scores:     entry.pillar_scores,
          pillar_confidence: entry.pillar_confidence,
          lifecycle_stage:   entry.lifecycle_stage,
          gap_velocity:      entry.gap_velocity,

          dimension_confidence:      entry.dimension_confidence,
          overall_confidence:        entry.overall_confidence,
          weakest_dimension:         entry.weakest_dimension,
          confirming_channel_count:  entry.confirming_channel_count,
          confidence_model_version:  entry.confidence_model_version,

          safety_gate_tier:  entry.safety_gate_tier,
          safety_gate_clean: entry.safety_gate_clean,

          opportunity_score:        entry.opportunity_score,
          verdict:                  entry.verdict,
          verdict_confidence:       entry.verdict_confidence,
          verdict_override_reasons: entry.verdict_override_reasons,
          grounded_pct:              entry.grounded_pct,
          insufficient_evidence:    entry.insufficient_evidence,

          report_status: entry.report_status,
        },
        { onConflict: 'analysis_id', ignoreDuplicates: true },
      )
    if (error) {
      console.error('Verdict ledger write failed', { analysisId: ctx.analysisId, error: error.message })
    } else {
      console.log('Verdict ledger recorded', {
        analysisId: ctx.analysisId,
        verdict:    entry.verdict,
        score:      entry.opportunity_score,
        breadthPct: entry.evidence_breadth_pct,
      })
    }
  } catch (e) {
    console.error('Verdict ledger extraction failed', {
      analysisId: ctx.analysisId,
      error: e instanceof Error ? e.message : e,
    })
  }
}

// ── Query (analytics / future re-measurement) ─────────────────────────────────

export interface LedgerQueryOptions {
  limit?:   number
  verdict?: VerdictLedgerEntry['verdict']
  userId?:  string   // restrict to a single user (omit for cross-user via service role)
  normalizedMarket?: string
}

export async function queryVerdictLedger(
  sb: SupabaseClient,
  opts: LedgerQueryOptions = {},
): Promise<VerdictLedgerRow[]> {
  let q = sb
    .from('verdict_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.userId)           q = q.eq('user_id', opts.userId)
  if (opts.verdict)          q = q.eq('verdict', opts.verdict)
  if (opts.normalizedMarket) q = q.eq('normalized_market', opts.normalizedMarket)

  const { data, error } = await q
  if (error) {
    console.error('Verdict ledger query failed', error.message)
    return []
  }
  return (data ?? []) as VerdictLedgerRow[]
}
