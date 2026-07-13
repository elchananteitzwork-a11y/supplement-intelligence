import { createClient } from '@supabase/supabase-js'

// ── VOC problem-cluster storage ──────────────────────────────────────────────
//
// Thin wrapper around the `voc_problem_clusters` table (migration 022) —
// same lazy service-role client pattern as lib/provider-cache/index.ts,
// since this module has the same shape of requirement (server-only,
// bypasses RLS, non-fatal on failure). Unlike provider-cache, this is an
// append-only accumulating time series (one row per topic per weekly run),
// not a latest-value-with-TTL cache — "volume trends" (Roadmap M2.7's own
// acceptance criterion) requires real history across runs, which a
// single-row-per-key cache would overwrite and lose.

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

export interface VocClusterRow {
  run_week:             string
  topic_key:            string
  topic_label:          string
  post_count:           number
  avg_engagement_score: number
  trend_pct:            number | null
  rank:                 number
  sample_quotes:        string[]
  subreddits_seen:      string[]
  pipeline_version:     string
}

// Real post_count from the most recent PRIOR run of this exact topic —
// never a fabricated baseline. Null when this topic has no earlier
// observation yet (first time it was ever matched, or DB unavailable).
export async function getPreviousTopicPostCount(topicKey: string, currentRunWeek: string): Promise<number | null> {
  try {
    const client = getClient()
    if (!client) return null
    const { data, error } = await client
      .from('voc_problem_clusters')
      .select('post_count, run_week')
      .eq('topic_key', topicKey)
      .neq('run_week', currentRunWeek)
      .order('run_week', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { post_count: number; run_week: string } | null; error: unknown }
    if (error || !data) return null
    return data.post_count
  } catch {
    return null
  }
}

// Idempotent: a retried run for the same (run_week, topic_key) upserts
// rather than duplicating — same convention as lib/verdict-ledger's
// analysis_id upsert.
export async function writeClusterRun(rows: VocClusterRow[]): Promise<void> {
  if (!rows.length) return
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('voc_problem_clusters') as any)
      .upsert(rows, { onConflict: 'run_week,topic_key' })
    if (error) {
      console.error('VOC pipeline: cluster write failed', { error: error.message })
    }
  } catch (e: unknown) {
    console.error('VOC pipeline: cluster write threw', { error: e instanceof Error ? e.message : e })
  }
}
