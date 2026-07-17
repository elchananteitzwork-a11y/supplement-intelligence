import { createClient } from '@supabase/supabase-js'

// ── Divergence Detector storage — Roadmap M2.22 ──────────────────────────────
// Same lazy service-role client pattern as lib/discovery-engine/service-store.ts,
// lib/provider-cache, and lib/niche-timeseries/store.ts.
//
// The read path (getRecentObservations) is reused verbatim from
// lib/discovery-engine/service-store.ts — it is already fully generic over
// niche_timeseries and needs no changes for this milestone. Re-exported
// here so lib/divergence-detector's own call sites only ever import from
// within this directory, matching lib/discovery-engine's own internal
// import shape.

export { getRecentObservations, type NicheSeries } from '../discovery-engine/service-store'

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

export interface DivergenceAlertInput {
  nicheKey:      string

  sourceA:       string
  metricA:       string
  priorValueA:   number
  latestValueA:  number
  changePctA:    number

  sourceB:       string
  metricB:       string
  priorValueB:   number
  latestValueB:  number
  changePctB:    number

  divergencePct: number
  detectedAt:    Date
}

// Non-fatal — same rule as lib/discovery-engine/service-store.ts's
// writeDiscoveryAlert and lib/niche-timeseries/store.ts's appendObservation:
// a write failure here must never break the calling batch job. Column
// names match supabase/migrations/027_divergence_alerts.sql exactly.
export async function writeDivergenceAlert(input: DivergenceAlertInput): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from('divergence_alerts') as any).upsert({
      niche_key:      input.nicheKey,
      source_a:       input.sourceA,
      metric_a:       input.metricA,
      prior_value_a:  input.priorValueA,
      latest_value_a: input.latestValueA,
      change_pct_a:   input.changePctA,
      source_b:       input.sourceB,
      metric_b:       input.metricB,
      prior_value_b:  input.priorValueB,
      latest_value_b: input.latestValueB,
      change_pct_b:   input.changePctB,
      divergence_pct: input.divergencePct,
      detected_at:    input.detectedAt.toISOString(),
    }, { onConflict: 'niche_key,source_a,metric_a,source_b,metric_b,detected_at' })
    if (error) console.error('divergence-detector: failed to write alert', { nicheKey: input.nicheKey, sourceA: input.sourceA, sourceB: input.sourceB, error: error.message })
  } catch (e: unknown) {
    console.error('divergence-detector: writeDivergenceAlert threw', { nicheKey: input.nicheKey, error: e instanceof Error ? e.message : e })
  }
}
