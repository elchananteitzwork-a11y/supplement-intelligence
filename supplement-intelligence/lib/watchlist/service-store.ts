import { createClient } from '@supabase/supabase-js'
import type { WatchlistEntry, WatchlistAlertType } from './types'

// ── Watchlist service-role access — Roadmap M2.8 ─────────────────────────────
//
// Used only by the re-check cron job (app/api/cron/watchlist-recheck), never
// by a user-facing route — those go through lib/watchlist/store.ts's
// RLS-respecting, cookie-derived client instead. Same lazy service-role
// client pattern as lib/provider-cache and lib/voc-pipeline/store.ts.

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

export async function listActiveWatches(): Promise<WatchlistEntry[]> {
  try {
    const client = getClient()
    if (!client) return []
    const { data, error } = await client
      .from('watchlist')
      .select('*')
      .eq('active', true)
    if (error) {
      console.error('Watchlist recheck: failed to list active watches', { error: error.message })
      return []
    }
    return (data ?? []) as WatchlistEntry[]
  } catch (e: unknown) {
    console.error('Watchlist recheck: listActiveWatches threw', { error: e instanceof Error ? e.message : e })
    return []
  }
}

export async function updateWatchAfterCheck(watchlistId: string, freshStage: string | null): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('watchlist') as any)
      .update({ last_checked_at: new Date().toISOString(), last_lifecycle_stage: freshStage })
      .eq('id', watchlistId)
    if (error) console.error('Watchlist recheck: failed to update watch', { watchlistId, error: error.message })
  } catch (e: unknown) {
    console.error('Watchlist recheck: updateWatchAfterCheck threw', { error: e instanceof Error ? e.message : e })
  }
}

export interface WriteAlertInput {
  watchlistId: string
  userId:      string
  alertType:   WatchlistAlertType
  previousStage?: string | null
  newStage?:      string | null
  killCriterionKey?:   string | null
  killCriterionLabel?: string | null
}

export async function writeAlert(input: WriteAlertInput): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('watchlist_alerts') as any).insert({
      watchlist_id: input.watchlistId,
      user_id:      input.userId,
      alert_type:   input.alertType,
      previous_stage: input.previousStage ?? null,
      new_stage:      input.newStage ?? null,
      kill_criterion_key:   input.killCriterionKey ?? null,
      kill_criterion_label: input.killCriterionLabel ?? null,
    })
    if (error) console.error('Watchlist recheck: failed to write alert', { error: error.message })
  } catch (e: unknown) {
    console.error('Watchlist recheck: writeAlert threw', { error: e instanceof Error ? e.message : e })
  }
}
