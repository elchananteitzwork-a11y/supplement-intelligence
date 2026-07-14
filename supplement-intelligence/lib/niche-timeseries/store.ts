import { createClient } from '@supabase/supabase-js'

// ── Niche Time-Series Store — Roadmap M2.11 ──────────────────────────────────
// docs/MASTER_EXECUTION_PLAN.md §2/§4. Thin, non-fatal writer for the
// append-only niche_timeseries table (migration 025). Same lazy service-role
// client pattern as lib/provider-cache and lib/re-measurement/service-store.
//
// Writes here must NEVER block or fail the calling pipeline — same rule as
// lib/provider-cache's own documented "a cache miss or write failure never
// blocks the analysis." A missing history point is an acceptable, silent
// degradation; a broken nightly/weekly job is not.
//
// No read path is exposed here, by design — this milestone (M2.11) is
// write-only foundation. M2.12's Discovery Intelligence Engine is the first
// real consumer.

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

export interface NicheObservation {
  nicheKey:   string
  source:     string
  metric:     string
  value:      number
  observedAt?: Date   // defaults to now — explicit only when backfilling a known-past observation
}

// Fire-and-forget in spirit, but awaited by callers so a batch job's own
// summary/logging can complete deterministically in tests — never throws.
export async function appendObservation(obs: NicheObservation): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('niche_timeseries') as any).upsert({
      niche_key:   obs.nicheKey,
      source:      obs.source,
      metric:      obs.metric,
      value:       obs.value,
      observed_at: (obs.observedAt ?? new Date()).toISOString(),
    }, { onConflict: 'niche_key,source,metric,observed_at' })
    if (error) console.error('niche_timeseries: failed to append observation', { nicheKey: obs.nicheKey, source: obs.source, metric: obs.metric, error: error.message })
  } catch (e: unknown) {
    console.error('niche_timeseries: appendObservation threw', { nicheKey: obs.nicheKey, source: obs.source, metric: obs.metric, error: e instanceof Error ? e.message : e })
  }
}

// Convenience for call sites appending several real observations from one
// batch iteration — skips null/undefined values inline (a metric that
// wasn't really computed this run is omitted, never written as 0).
export async function appendObservations(obs: (NicheObservation | null)[]): Promise<void> {
  const real = obs.filter((o): o is NicheObservation => o !== null && o.value !== null && !Number.isNaN(o.value))
  await Promise.all(real.map(appendObservation))
}
