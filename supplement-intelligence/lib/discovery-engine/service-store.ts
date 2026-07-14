import { createClient } from '@supabase/supabase-js'

// ── Discovery Engine storage — Roadmap M2.12 ─────────────────────────────────
// Same lazy service-role client pattern as lib/provider-cache,
// lib/re-measurement/service-store.ts, and lib/niche-timeseries/store.ts.
//
// getRecentObservations is the FIRST read path into niche_timeseries —
// M2.11 deliberately shipped with none (write-only foundation). Purely
// generic: takes a niche_key string, returns whatever real (source,
// metric) series exist for it — no assumption about which category or
// which providers wrote them.

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

export interface NicheSeries {
  source: string
  metric: string
  points: { value: number; observedAt: string }[]
}

// Real rows only, grouped by (source, metric) — never a fabricated series
// for a niche_key with no real observations (returns []).
export async function getRecentObservations(nicheKey: string): Promise<NicheSeries[]> {
  try {
    const client = getClient()
    if (!client) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('niche_timeseries') as any)
      .select('source, metric, value, observed_at')
      .eq('niche_key', nicheKey)
      .order('observed_at', { ascending: true }) as {
        data: { source: string; metric: string; value: number; observed_at: string }[] | null
        error: unknown
      }
    if (error || !data) return []

    const bySeries = new Map<string, NicheSeries>()
    for (const row of data) {
      const key = `${row.source}::${row.metric}`
      if (!bySeries.has(key)) bySeries.set(key, { source: row.source, metric: row.metric, points: [] })
      bySeries.get(key)!.points.push({ value: row.value, observedAt: row.observed_at })
    }
    return Array.from(bySeries.values())
  } catch (e: unknown) {
    console.error('discovery-engine: getRecentObservations threw', { nicheKey, error: e instanceof Error ? e.message : e })
    return []
  }
}

export interface DiscoveryAlertInput {
  nicheKey:    string
  source:      string
  metric:      string
  priorValue:  number
  latestValue: number
  changePct:   number
  detectedAt:  Date
}

// Non-fatal — same rule as lib/niche-timeseries/store.ts's appendObservation:
// a write failure here must never break the calling batch job.
export async function writeDiscoveryAlert(input: DiscoveryAlertInput): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('discovery_alerts') as any).upsert({
      niche_key:    input.nicheKey,
      source:       input.source,
      metric:       input.metric,
      prior_value:  input.priorValue,
      latest_value: input.latestValue,
      change_pct:   input.changePct,
      detected_at:  input.detectedAt.toISOString(),
    }, { onConflict: 'niche_key,source,metric,detected_at' })
    if (error) console.error('discovery-engine: failed to write alert', { nicheKey: input.nicheKey, source: input.source, metric: input.metric, error: error.message })
  } catch (e: unknown) {
    console.error('discovery-engine: writeDiscoveryAlert threw', { nicheKey: input.nicheKey, error: e instanceof Error ? e.message : e })
  }
}
