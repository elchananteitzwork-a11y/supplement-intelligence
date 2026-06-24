import { NextResponse }         from 'next/server'
import { cookies }              from 'next/headers'
import { createServerClient }   from '@supabase/ssr'
import Anthropic                from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }         from '@/lib/signal-engine'
import type { OpportunityCard, OpportunityMeta, CacheStatus } from '@/types/index'

export const maxDuration = 300

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

// ── Server-side score recalculation ────────────────────────────
// Phase 2 unification: discovery now uses the same 5-dimension formula as the
// memo report. formula: round((demand + virality + subscription + manufacturing
// + defensibility) / 50 × 100). Legacy cached cards that still carry a
// competition.score use the old 6-dim/60 formula automatically.

const MAX_DISCOVER_ATTEMPTS = 3

function recalculateCardScore(card: OpportunityCard): number {
  const s = card.scores
  const hasLegacy = typeof s?.competition?.score === 'number'
  const dimSum =
    (s?.demand?.score        ?? 0) +
    (s?.virality?.score      ?? 0) +
    (s?.subscription?.score  ?? 0) +
    (s?.manufacturing?.score ?? 0) +
    (s?.defensibility?.score ?? 0) +
    (hasLegacy ? (s!.competition!.score ?? 0) : 0)
  const maxDim = hasLegacy ? 60 : 50
  return Math.round((dimSum / maxDim) * 100)
}

// Type-guard: 5 required scored dimensions + structural fields.
// competition is optional (legacy) — market_saturation replaces it.
function isValidCard(o: unknown): o is OpportunityCard {
  if (!o || typeof o !== 'object') return false
  const c = o as Partial<OpportunityCard>
  return (
    typeof c.name === 'string' && c.name.trim().length > 0 &&
    typeof c.rationale === 'string' && c.rationale.trim().length > 0 &&
    typeof c.startup_cost === 'string' &&
    typeof c.difficulty === 'string' &&
    typeof c.launch_time === 'string' &&
    c.scores != null &&
    typeof c.scores.demand?.score        === 'number' &&
    typeof c.scores.virality?.score      === 'number' &&
    typeof c.scores.subscription?.score  === 'number' &&
    typeof c.scores.manufacturing?.score === 'number' &&
    typeof c.scores.defensibility?.score === 'number'
  )
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
    // Re-apply server-side score recalculation so cached data generated before
    // Phase 1 is corrected before being returned to the client.
    const opps = (hit.opportunities as OpportunityCard[]).map(o => ({
      ...o,
      score: recalculateCardScore(o),
    }))

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
  const signals = await signalEngine.fetch({ query: input.trim(), categoryId: module.id }, 12_000)

  if (signals) {
    console.log('Signal Engine result', {
      category:           input.trim(),
      categoryId:         module.id,
      providers_used:     signals.providers_used,
      overall_confidence: signals.overall_confidence,
    })
  }

  const systemPrompt = module.buildSignalAugmentedPrompt(baseSystemPrompt, input.trim(), signals)

  // ── Discover with retry ────────────────────────────────────────
  // Up to MAX_DISCOVER_ATTEMPTS attempts. Each attempt calls Claude, parses
  // the JSON array, validates every card has all 6 dimension scores, and
  // recalculates the top-level score server-side.
  // Retries when: parse fails OR fewer than 5 structurally valid cards returned.
  let opportunities: OpportunityCard[] = []

  for (let attempt = 1; attempt <= MAX_DISCOVER_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 90_000)
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
        attempt,
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
      // Anthropic SDK sets constructor.name='APIUserAbortError' but name='Error' from base class.
      const isAbort = e instanceof Anthropic.APIUserAbortError
      if (isAbort) {
        console.error(`Discovery timeout after 90 s (attempt ${attempt}/${MAX_DISCOVER_ATTEMPTS})`, { category: input.trim() })
        if (attempt < MAX_DISCOVER_ATTEMPTS) continue
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

    // ── Parse ────────────────────────────────────────────────────
    let parsed: OpportunityCard[]
    try {
      parsed = parseOpportunities(rawText)
    } catch {
      console.error(`Discovery parse error (attempt ${attempt}/${MAX_DISCOVER_ATTEMPTS})`, {
        categoryId:  module.id,
        is_refresh:  !!previousOpps,
        raw_length:  rawText.length,
        raw_snippet: rawText.slice(0, 400),
      })
      if (attempt < MAX_DISCOVER_ATTEMPTS) continue
      return err('Failed to parse opportunities — please try again.', 500)
    }

    // ── Validate cards + server-side score recalculation ─────────
    // isValidCard ensures all 6 dimension scores are present.
    // recalculateCardScore replaces the LLM's top-level score with the
    // server-computed value so sorting and display are always consistent.
    const valid = parsed
      .filter(isValidCard)
      .map(o => ({ ...o, score: recalculateCardScore(o) }))
      .slice(0, 25)
      .sort((a, b) => b.score - a.score)

    if (valid.length < 5) {
      console.error(`Too few valid opportunities (attempt ${attempt}/${MAX_DISCOVER_ATTEMPTS})`, {
        categoryId: module.id, parsed: parsed.length, valid: valid.length,
      })
      if (attempt < MAX_DISCOVER_ATTEMPTS) continue
      if (valid.length === 0) return err('Failed to parse opportunities — please try again.', 500)
      // Accept a partial result on the final attempt rather than showing nothing
      opportunities = valid
      break
    }

    opportunities = valid
    break
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
