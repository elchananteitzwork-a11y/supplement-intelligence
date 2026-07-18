import { createClient } from '@supabase/supabase-js'

// ── Provider result cache ─────────────────────────────────────────────────
//
// Thin wrapper around the `provider_cache` Supabase table (migration 010).
// Uses the service role key so it bypasses RLS — this module MUST only run
// server-side. Never import from a client component.
//
// Key conventions:
//   reviews:v1:{asin}              — CollectedReview[] from Amazon review providers
//   serp:v1:{query}                — ProviderSignals from junglee~amazon-crawler
//   keywords:v1:{query}            — KeywordIntelligence from DataForSEO
//   mfg:v1:{product}:{category}:{complexity} — ManufacturingEstimate from Apify/Alibaba
//   science:v1:{ingredient}        — ScienceSignal from lib/science-engine's
//                                    nightly batch (Roadmap M2.5) — the only
//                                    entry here NOT written lazily on a
//                                    cache miss; written proactively once a
//                                    night by app/api/cron/science-pipeline.
//
// All reads/writes are non-fatal: a cache miss or write failure never
// blocks the analysis — callers proceed to the live provider instead.

let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return _client
}

interface CacheRow { cache_key: string; provider: string; payload: unknown; expires_at: string }

export async function cacheGet<T>(cacheKey: string): Promise<T | null> {
  try {
    const client = getClient()
    if (!client) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client.from('provider_cache') as any)
      .select('payload, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle() as { data: Pick<CacheRow, 'payload' | 'expires_at'> | null; error: unknown }
    if (error || !data) return null
    if (new Date(data.expires_at) < new Date()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (client.from('provider_cache') as any).delete().eq('cache_key', cacheKey)
      return null
    }
    return data.payload as T
  } catch {
    return null
  }
}

export async function cacheSet(
  cacheKey: string,
  provider: string,
  payload:  unknown,
  ttlMs:    number,
): Promise<void> {
  try {
    const client = getClient()
    if (!client) return
    const expires_at = new Date(Date.now() + ttlMs).toISOString()
    const row: CacheRow = { cache_key: cacheKey, provider, payload, expires_at }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.from('provider_cache') as any).upsert(row, { onConflict: 'cache_key' })
  } catch {
    // Cache write failure is non-fatal — analysis continues without caching
  }
}
