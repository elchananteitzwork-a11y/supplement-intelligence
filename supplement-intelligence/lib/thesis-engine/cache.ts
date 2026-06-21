import { createClient } from '@supabase/supabase-js'
import type { MarketThesis, ThesisDepth } from './types'
import { THESIS_CACHE_TTL } from './types'

// ── Admin client (service role — bypasses RLS for server-side caching) ────
// Never expose the service role key to the client side.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── Cache key ──────────────────────────────────────────────────────────────

export function buildCacheKey(
  queryNormalized: string,
  depth:           ThesisDepth,
  version:         string,
): string {
  return `${queryNormalized}::${depth}::${version}`
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getThesis(
  queryNormalized: string,
  depth:           ThesisDepth,
  version:         string,
): Promise<MarketThesis | null> {
  try {
    const db = adminClient()
    const now = new Date().toISOString()

    const { data, error } = await db
      .from('theses')
      .select('thesis')
      .eq('query_normalized', queryNormalized)
      .eq('depth',            depth)
      .eq('analysis_version', version)
      .gt('refresh_after',    now)          // only return non-stale entries
      .order('created_at',    { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    console.log('[ThesisCache] hit', { queryNormalized, depth })
    return data.thesis as MarketThesis
  } catch (err) {
    // Cache misses are non-fatal — proceed to fresh analysis
    console.warn('[ThesisCache] read error (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function setThesis(thesis: MarketThesis): Promise<void> {
  try {
    const db          = adminClient()
    const ttlSeconds  = THESIS_CACHE_TTL[thesis.analysis_depth as ThesisDepth] ?? THESIS_CACHE_TTL.standard
    const refreshAfter = new Date(Date.now() + ttlSeconds * 1_000).toISOString()

    const { error } = await db.from('theses').upsert({
      id:               thesis.id,
      query:            thesis.query,
      query_normalized: thesis.query_normalized,
      depth:            thesis.analysis_depth,
      analysis_version: thesis.analysis_version,
      thesis,
      refresh_after:    refreshAfter,
    })

    if (error) {
      console.warn('[ThesisCache] write error (non-fatal):', error.message)
    } else {
      console.log('[ThesisCache] written', { id: thesis.id, refreshAfter })
    }
  } catch (err) {
    // Caching failures are non-fatal — the thesis was still produced
    console.warn('[ThesisCache] write exception (non-fatal):', err instanceof Error ? err.message : err)
  }
}
