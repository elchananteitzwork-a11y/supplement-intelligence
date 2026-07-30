// ── Science ingredient demand queue — Roadmap "Dynamic Science Coverage" ────
//
// docs/RD_DYNAMIC_SCIENCE_COVERAGE.md (owner-approved 2026-07-28). Read/write
// helpers for the `science_ingredient_queue` table (migration 032) — global
// demand-tracking for vocabulary-matched ingredients that aren't one of the
// 3 benchmark TRACKED_INGREDIENTS. Same lazy-service-role-client, try/catch,
// never-throw posture as lib/provider-cache/index.ts (this module's own
// explicit convention to reuse) — implemented as its own client here rather
// than editing that shared file, which sits outside this milestone's file
// list (lib/provider-cache/** belongs to a different agent's ownership).
//
// Writes to this table happen from exactly two places: app/api/generate/
// route.ts's enqueue call (via the increment_science_queue_demand() RPC,
// migration 032 — reuses that route's own supabaseServiceRole() factory,
// not a client from this file) and this file's own markQueueRowFetched(),
// called by the cron's drain phase (lib/science-engine/pipeline.ts). No
// anon/authenticated client ever touches this table (RLS locked to
// service-role-only, see migration 032).

import { createClient } from '@supabase/supabase-js'
import { TRACKED_INGREDIENTS } from './tracked-ingredients'

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

export interface QueueRow {
  ingredient:          string
  first_requested_at:  string
  last_requested_at:   string
  request_count:       number
  fetched_at:          string | null
}

// Roadmap "Dynamic Science Coverage": the enqueue-worthiness decision,
// factored out as a pure predicate so it's unit-testable without importing
// app/api/generate/route.ts's much larger module (Anthropic SDK, cookie-
// based Supabase client, etc.). The 3 benchmark tracked ingredients already
// refresh nightly for free — enqueueing them too would dilute the demand
// queue's real signal with ingredients that never needed it.
export function shouldEnqueueScienceDemand(
  matchedIngredient: string | null,
  hasScienceSignal:  boolean,
): matchedIngredient is string {
  if (!matchedIngredient) return false
  if ((TRACKED_INGREDIENTS as readonly string[]).includes(matchedIngredient)) return false
  return !hasScienceSignal
}

// Drain pattern 1 (sciq_unfetched_oldest_idx): unfetched rows, oldest
// first_requested_at first. Non-fatal — an empty array (never a throw) on
// any failure, same as provider-cache's own cacheGet.
export async function getUnfetchedQueueRows(limit: number): Promise<QueueRow[]> {
  try {
    const client = getClient()
    if (!client) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('science_ingredient_queue') as any)
      .select('ingredient, first_requested_at, last_requested_at, request_count, fetched_at')
      .is('fetched_at', null)
      .order('first_requested_at', { ascending: true })
      .limit(limit)
    if (error || !data) return []
    return data as QueueRow[]
  } catch {
    return []
  }
}

// Drain pattern 2 (sciq_fetched_by_demand_idx): previously-fetched rows,
// most-demanded (request_count) first. Exact near-expiry filtering against
// provider_cache happens in the caller (see getCacheExpiresAt below and
// lib/science-engine/pipeline.ts's drainScienceIngredientQueue) — this just
// returns the demand-ordered candidate pool for it to filter.
export async function getFetchedQueueRowsByDemand(limit: number): Promise<QueueRow[]> {
  try {
    const client = getClient()
    if (!client) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('science_ingredient_queue') as any)
      .select('ingredient, first_requested_at, last_requested_at, request_count, fetched_at')
      .not('fetched_at', 'is', null)
      .order('request_count', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data as QueueRow[]
  } catch {
    return []
  }
}

// Marks a queue row fetched after a successful drain-phase ingestScienceSignal
// call. Leaves request_count/last_requested_at untouched — those are only
// ever written by the increment_science_queue_demand() RPC (migration 032).
export async function markQueueRowFetched(ingredient: string, now: Date): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.from('science_ingredient_queue') as any)
      .update({ fetched_at: now.toISOString() })
      .eq('ingredient', ingredient)
  } catch {
    // Non-fatal — a failed fetched_at write just means this ingredient may
    // be re-drained again a future night; never blocks the pipeline.
  }
}

// Real, read-only expires_at lookup for a provider_cache row — never writes
// or deletes provider_cache (that stays lib/provider-cache/index.ts's own
// job). Returns null when the row doesn't exist (already honestly absent,
// same as a cache miss) or on any error — never a guessed/fabricated date.
export async function getCacheExpiresAt(cacheKey: string): Promise<Date | null> {
  try {
    const client = getClient()
    if (!client) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('provider_cache') as any)
      .select('expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle() as { data: { expires_at: string } | null; error: unknown }
    if (error || !data) return null
    return new Date(data.expires_at)
  } catch {
    return null
  }
}
