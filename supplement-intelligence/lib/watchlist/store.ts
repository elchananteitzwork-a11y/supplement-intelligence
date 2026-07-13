import type { SupabaseClient } from '@supabase/supabase-js'
import type { KillCriterion } from '@/lib/kill-criteria'
import type { LifecycleStage } from '@/lib/lifecycle'
import type { WatchlistEntry, WatchlistAlert } from './types'

// ── Watchlist CRUD — Roadmap M2.8 ────────────────────────────────────────────
//
// User-facing, RLS-respecting: every function here takes an already-
// authenticated SupabaseClient (created from the caller's own request
// cookies, same pattern as app/api/outcomes/route.ts's supabaseFromCookies())
// rather than a service-role client — Postgres RLS is the real access-
// control boundary, not application code re-checking user_id.

export interface AddWatchInput {
  analysisId:  string
  categoryName: string
  categoryId:   string
  lifecycleStageAtWatch: LifecycleStage | null
  killCriteria: KillCriterion[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient | any

export async function addWatch(sb: AnyClient, userId: string, input: AddWatchInput): Promise<WatchlistEntry | null> {
  const { data, error } = await sb
    .from('watchlist')
    .upsert({
      user_id:     userId,
      analysis_id: input.analysisId,
      category_name: input.categoryName,
      category_id:   input.categoryId,
      active: true,
      lifecycle_stage_at_watch: input.lifecycleStageAtWatch,
      kill_criteria:            input.killCriteria,
    }, { onConflict: 'user_id,analysis_id' })
    .select('*')
    .single()

  if (error) {
    console.error('Watchlist: add failed', { error: error.message })
    return null
  }
  return data as WatchlistEntry
}

export async function listWatches(sb: AnyClient, userId: string): Promise<WatchlistEntry[]> {
  const { data, error } = await sb
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Watchlist: list failed', { error: error.message })
    return []
  }
  return (data ?? []) as WatchlistEntry[]
}

// Soft unwatch — preserves the watchlist row and its alert history rather
// than a hard delete (which would cascade-delete watchlist_alerts too).
export async function removeWatch(sb: AnyClient, userId: string, watchlistId: string): Promise<boolean> {
  const { error } = await sb
    .from('watchlist')
    .update({ active: false })
    .eq('id', watchlistId)
    .eq('user_id', userId)

  if (error) {
    console.error('Watchlist: remove failed', { error: error.message })
    return false
  }
  return true
}

export async function listAlerts(sb: AnyClient, userId: string, limit = 50): Promise<WatchlistAlert[]> {
  const { data, error } = await sb
    .from('watchlist_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Watchlist: list alerts failed', { error: error.message })
    return []
  }
  return (data ?? []) as WatchlistAlert[]
}
