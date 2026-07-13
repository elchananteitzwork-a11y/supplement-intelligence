import { createClient } from '@supabase/supabase-js'
import type { CheckpointMonths } from './checkpoints'
import { CHECKPOINT_DAYS } from './checkpoints'
import type { OutcomeLabel } from './outcome'

// ── Re-measurement worker storage — Roadmap M2.9 ─────────────────────────────
// Same lazy service-role client pattern as lib/provider-cache, lib/voc-
// pipeline/store.ts, and lib/watchlist/service-store.ts. Used only by the
// re-measurement cron job (app/api/cron/re-measurement).

let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_client) {
    _client = createClient(url, key, { auth: { persistSession: false } })
  }
  return _client
}

export interface LedgerRowForRemeasurement {
  id:                string
  created_at:        string
  analysis_id:        string
  normalized_market:  string
  category_id:        string | null
}

// Only fetches ledger rows old enough to possibly have ANY due checkpoint
// (>= the shortest checkpoint, 90 days) — on the real ledger today (started
// 2026-07-12, see Roadmap M1.1's backfill note), this correctly returns [].
export async function listCandidateLedgerRows(now: Date): Promise<LedgerRowForRemeasurement[]> {
  try {
    const client = getClient()
    if (!client) return []
    const cutoff = new Date(now.getTime() - CHECKPOINT_DAYS[3] * 86_400_000).toISOString()
    const { data, error } = await client
      .from('verdict_ledger')
      .select('id, created_at, analysis_id, normalized_market, category_id')
      .lte('created_at', cutoff)
    if (error) {
      console.error('Re-measurement: failed to list candidate ledger rows', { error: error.message })
      return []
    }
    return (data ?? []) as LedgerRowForRemeasurement[]
  } catch (e: unknown) {
    console.error('Re-measurement: listCandidateLedgerRows threw', { error: e instanceof Error ? e.message : e })
    return []
  }
}

export async function getRecordedCheckpoints(verdictLedgerId: string): Promise<CheckpointMonths[]> {
  try {
    const client = getClient()
    if (!client) return []
    const { data, error } = await client
      .from('verdict_ledger_outcomes')
      .select('checkpoint_months')
      .eq('verdict_ledger_id', verdictLedgerId)
    if (error || !data) return []
    return (data as { checkpoint_months: CheckpointMonths }[]).map(r => r.checkpoint_months)
  } catch {
    return []
  }
}

export interface FrozenVerdictContext {
  avgPriceAtVerdict:      number | null
  avgReviewCountAtVerdict: number | null
}

// The verdict-time price/review-count context is never duplicated onto the
// ledger row itself (same "immutable reference, not data duplication"
// principle migration 017's own header comment states) — read from
// analyses.memo_data, the same frozen JSON snapshot the original analysis
// produced.
export async function getFrozenVerdictContext(analysisId: string): Promise<FrozenVerdictContext> {
  try {
    const client = getClient()
    if (!client) return { avgPriceAtVerdict: null, avgReviewCountAtVerdict: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('analyses') as any)
      .select('memo_data')
      .eq('id', analysisId)
      .maybeSingle() as { data: { memo_data: { signal_evidence?: { pricing?: { value?: { avg_price?: string } }; revenue?: { value?: { avg_review_count?: number } } } } } | null; error: unknown }
    if (error || !data) return { avgPriceAtVerdict: null, avgReviewCountAtVerdict: null }

    const se = data.memo_data?.signal_evidence
    return {
      avgPriceAtVerdict:       se?.pricing?.value?.avg_price ? parseDollarStringSafe(se.pricing.value.avg_price) : null,
      avgReviewCountAtVerdict: se?.revenue?.value?.avg_review_count ?? null,
    }
  } catch {
    return { avgPriceAtVerdict: null, avgReviewCountAtVerdict: null }
  }
}

function parseDollarStringSafe(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

export interface WriteOutcomeInput {
  verdictLedgerId: string
  checkpointMonths: CheckpointMonths
  daysSinceVerdict: number
  entryVelocity: string | null
  youngListingPct24m: number | null
  avgReviewCountAtMeasurement: number | null
  avgReviewCountAtVerdict: number | null
  avgPriceAtMeasurement: number | null
  avgPriceAtVerdict: number | null
  priceMovementPct: number | null
  outcomeLabel: OutcomeLabel
  keepaTokensUsedEstimate: number
}

export async function writeOutcome(input: WriteOutcomeInput): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('verdict_ledger_outcomes') as any).upsert({
      verdict_ledger_id: input.verdictLedgerId,
      checkpoint_months: input.checkpointMonths,
      days_since_verdict: input.daysSinceVerdict,
      entry_velocity: input.entryVelocity,
      young_listing_pct_24m: input.youngListingPct24m,
      avg_review_count_at_measurement: input.avgReviewCountAtMeasurement,
      avg_review_count_at_verdict:     input.avgReviewCountAtVerdict,
      avg_price_at_measurement: input.avgPriceAtMeasurement,
      avg_price_at_verdict:     input.avgPriceAtVerdict,
      price_movement_pct:       input.priceMovementPct,
      outcome_label: input.outcomeLabel,
      keepa_tokens_used_estimate: input.keepaTokensUsedEstimate,
    }, { onConflict: 'verdict_ledger_id,checkpoint_months' })
    if (error) console.error('Re-measurement: failed to write outcome', { error: error.message })
  } catch (e: unknown) {
    console.error('Re-measurement: writeOutcome threw', { error: e instanceof Error ? e.message : e })
  }
}
