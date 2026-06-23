import { NextResponse }         from 'next/server'
import { cookies }              from 'next/headers'
import { createServerClient }   from '@supabase/ssr'
import Anthropic                from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }         from '@/lib/signal-engine'
import type { OpportunityCard, OpportunityMeta, CacheStatus } from '@/types/index'

export const maxDuration = 60

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── helpers ────────────────────────────────────────────────────

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

function normalizeQuery(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ')
}

// ISO-8601 week string, e.g. "2026-W25"
function getCacheWeek(date: Date = new Date()): string {
  const d   = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getPreviousCacheWeek(): string {
  return getCacheWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
}

// Deterministic Fisher-Yates via LCG — keeps top-3 stable.
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr]
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0
  }
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1_664_525) + 1_013_904_223) >>> 0
    const j = h % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function enrichWithMeta(
  opps:         OpportunityCard[],
  cacheWeek:    string,
  prevWeek:     string,
  previousOpps: OpportunityCard[] | null,
): OpportunityCard[] {
  if (!previousOpps) {
    return opps.map(o => ({
      ...o,
      _meta: { week_added: cacheWeek, is_new: true, score_delta: 0, trending: false } satisfies OpportunityMeta,
    }))
  }

  const prevScoreMap = new Map(previousOpps.map(o => [o.name.toLowerCase().trim(), o.score]))
  const prevMetaMap  = new Map(
    previousOpps
      .filter((o): o is OpportunityCard & { _meta: OpportunityMeta } => !!o._meta)
      .map(o => [o.name.toLowerCase().trim(), o._meta]),
  )

  return opps.map(o => {
    const key       = o.name.toLowerCase().trim()
    const prevScore = prevScoreMap.get(key)
    const prevMeta  = prevMetaMap.get(key)
    const isNew     = prevScore === undefined
    const delta     = isNew ? 0 : o.score - prevScore
    return {
      ...o,
      _meta: {
        week_added:  isNew ? cacheWeek : (prevMeta?.week_added ?? prevWeek),
        is_new:      isNew,
        score_delta: delta,
        trending:    !isNew && delta > 0,
      } satisfies OpportunityMeta,
    }
  })
}

function parseOpportunities(raw: string): OpportunityCard[] {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('[')
  if (start < 0) throw new Error('No JSON array in response')
  if (start > 0) s = s.slice(start)
  try { return JSON.parse(s) as OpportunityCard[] } catch { /* fall through */ }
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '[') depth++
    else if (c === ']') { if (--depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('No complete JSON array found')
  return JSON.parse(s.slice(0, end + 1)) as OpportunityCard[]
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── route ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  // Discovery is public — no auth required. user may be null for anonymous visitors.

  let body: { input?: string; categoryId?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { input, categoryId: rawCategoryId } = body
  if (!input?.trim())            return err('input is required')
  if (input.trim().length > 200) return err('Input too long — max 200 characters', 400)

  // ── Open Discovery: classify query before proceeding ──────────
  let resolvedCategoryId = rawCategoryId
  if (!rawCategoryId || rawCategoryId === 'auto') {
    resolvedCategoryId = await classifyQuery(input.trim())
    console.log('Open Discovery classification', {
      input:    input.trim(),
      resolved: resolvedCategoryId,
    })
  }

  const module = categoryRegistry.resolve(resolvedCategoryId)

  const normalizedQuery = normalizeQuery(input)
  const cacheWeek       = getCacheWeek()
  const prevCacheWeek   = getPreviousCacheWeek()

  // Cache key includes category so different categories don't share cached results.
  // We prefix only non-supplement queries to preserve existing supplement cache entries.
  const cacheKey = module.id === 'supplements'
    ? normalizedQuery
    : `${module.id}:${normalizedQuery}`

  // ── cache check ────────────────────────────────────────────────
  const { data: hit } = await sb
    .from('discovery_cache')
    .select('opportunities, generated_at')
    .eq('normalized_query', cacheKey)
    .eq('cache_week', cacheWeek)
    .maybeSingle()

  if (hit) {
    const opps = hit.opportunities as OpportunityCard[]

    const { data: prevHit } = await sb
      .from('discovery_cache')
      .select('id')
      .eq('normalized_query', cacheKey)
      .eq('cache_week', prevCacheWeek)
      .maybeSingle()

    const cacheStatus: CacheStatus = prevHit ? 'updated' : 'cached'
    const top3 = opps.slice(0, 3)
    const rest = seededShuffle(opps.slice(3), `${user?.id ?? 'anon'}:${cacheKey}:${cacheWeek}`)

    console.log('Discovery cache hit', {
      query: normalizedQuery, cache_week: cacheWeek,
      cache_status: cacheStatus, categoryId: module.id,
    })
    return NextResponse.json({
      opportunities:     [...top3, ...rest],
      category:          input.trim(),
      categoryId:        module.id,
      categoryName:      module.name,
      cached:            true,
      cache_status:      cacheStatus,
      cache_week:        cacheWeek,
      generated_at:      hit.generated_at,
    })
  }

  // ── cache miss: check previous week for refresh context ────────
  const { data: prevEntry } = await sb
    .from('discovery_cache')
    .select('opportunities')
    .eq('normalized_query', cacheKey)
    .eq('cache_week', prevCacheWeek)
    .maybeSingle()

  const previousOpps = prevEntry ? (prevEntry.opportunities as OpportunityCard[]) : null

  const baseSystemPrompt = previousOpps
    ? module.buildRefreshPrompt(previousOpps.map(o => ({ name: o.name, score: o.score })))
    : module.discoverySystemPrompt

  // ── Signal Engine ──────────────────────────────────────────────
  const signals = await signalEngine.fetch(input.trim(), 12_000)

  if (signals) {
    console.log('Signal Engine result', {
      category:           input.trim(),
      categoryId:         module.id,
      providers_used:     signals.providers_used,
      overall_confidence: signals.overall_confidence,
    })
  }

  const systemPrompt = module.buildSignalAugmentedPrompt(baseSystemPrompt, input.trim(), signals)

  // ── call Anthropic ─────────────────────────────────────────────
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 50_000)
  let rawText = ''

  try {
    const msg = await ai.messages.create(
      {
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `${module.name} category: "${input.trim()}"` }],
      },
      { signal: controller.signal },
    )
    clearTimeout(abortTimer)
    rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
    console.log('Discovery raw response', {
      stop_reason:      msg.stop_reason,
      input_tokens:     msg.usage?.input_tokens,
      output_tokens:    msg.usage?.output_tokens,
      raw_length:       rawText.length,
      is_refresh:       !!previousOpps,
      signal_providers: signals?.providers_used ?? [],
      categoryId:       module.id,
    })
  } catch (e: unknown) {
    clearTimeout(abortTimer)
    const isAbort = e instanceof Error &&
      (e.name === 'APIUserAbortError' || e.name === 'AbortError' ||
       (e.message ?? '').toLowerCase().includes('abort'))
    if (isAbort) {
      console.error('Discovery timeout after 50 s', { category: input.trim() })
      return err('Discovery timed out — please try again.', 504)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error (discover)', {
        status: e.status, message: e.message, error: JSON.stringify(e.error),
      })
    } else {
      console.error('Discovery error', e)
    }
    return err('AI service error — please try again.', 500)
  }

  // ── parse + validate ───────────────────────────────────────────
  let opportunities: OpportunityCard[]
  try {
    const parsed = parseOpportunities(rawText)
    opportunities = parsed
      .filter(o =>
        typeof o.name === 'string' && o.name.trim() &&
        typeof o.score === 'number' &&
        typeof o.rationale === 'string' &&
        o.scores &&
        typeof o.scores.demand?.score === 'number'
      )
      .slice(0, 25)
      .sort((a, b) => b.score - a.score)
  } catch {
    console.error('Discovery parse error', {
      categoryId:  module.id,
      is_refresh:  !!previousOpps,
      raw_length:  rawText.length,
      raw_snippet: rawText.slice(0, 400),
    })
    return err('Failed to parse opportunities — please try again.', 500)
  }

  // ── attach metadata + cache ────────────────────────────────────
  const enriched    = enrichWithMeta(opportunities, cacheWeek, prevCacheWeek, previousOpps)
  const generatedAt = new Date().toISOString()

  const { error: cacheWriteErr } = await sb
    .from('discovery_cache')
    .upsert(
      { normalized_query: cacheKey, cache_week: cacheWeek, opportunities: enriched, generated_at: generatedAt },
      { onConflict: 'normalized_query,cache_week' },
    )
  if (cacheWriteErr) console.error('Discovery cache write failed', cacheWriteErr)

  console.log('Discovery complete', {
    categoryId:  module.id,
    input:       input.trim(),
    count:       enriched.length,
    is_refresh:  !!previousOpps,
    new_count:   enriched.filter(o => o._meta?.is_new).length,
    trending:    enriched.filter(o => o._meta?.trending).length,
    cache_week:  cacheWeek,
  })

  const top3 = enriched.slice(0, 3)
  const rest = seededShuffle(enriched.slice(3), `${user?.id ?? 'anon'}:${cacheKey}:${cacheWeek}`)

  return NextResponse.json({
    opportunities:     [...top3, ...rest],
    category:          input.trim(),
    categoryId:        module.id,
    categoryName:      module.name,
    cached:            false,
    cache_status:      (!!previousOpps ? 'refreshed' : 'generated') as CacheStatus,
    cache_week:        cacheWeek,
    generated_at:      generatedAt,
  })
}
