import { NextResponse }        from 'next/server'
import { cookies }             from 'next/headers'
import { createServerClient }  from '@supabase/ssr'
import {
  synthesize,
  normalizeQuery,
  getThesis,
  THESIS_ENGINE_VERSION,
}                              from '@/lib/thesis-engine'
import type {
  ThesisEvent,
  ThesisRequest,
  ThesisDepth,
}                              from '@/lib/thesis-engine'
import { handleProviderError } from '@/lib/provider-errors'

// Vercel Pro: allow up to 2 minutes for signal collection + Claude synthesis.
// 'deep' analyses may approach this ceiling for large category corpora.
export const maxDuration = 120

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_QUERY_LEN = 500
const VALID_DEPTHS  = new Set<string>(['preliminary', 'standard', 'deep'])

// ── SSE helpers ────────────────────────────────────────────────────────────

const enc = new TextEncoder()

function sseFrame(event: ThesisEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function sseError(message: string, recoverable = false): Uint8Array {
  return sseFrame({ event: 'analysis:error', message, recoverable })
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'X-Accel-Buffering': 'no',     // disable Nginx/Vercel edge buffering
    'Connection':        'keep-alive',
  }
}

// ── Supabase (server-side, cookie-based) ──────────────────────────────────

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: Array<{ name: string; value: string; options: Record<string, unknown> }>) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    },
  )
}

// ── Input validation ───────────────────────────────────────────────────────

type ParseResult =
  | { ok: true;  data: ThesisRequest }
  | { ok: false; error: string }

function parseBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const body = raw as Record<string, unknown>

  if (typeof body.query !== 'string' || !body.query.trim()) {
    return { ok: false, error: '`query` is required and must be a non-empty string' }
  }
  if (body.query.length > MAX_QUERY_LEN) {
    return { ok: false, error: `Query too long — max ${MAX_QUERY_LEN} characters` }
  }

  const depth = body.depth ?? 'standard'
  if (!VALID_DEPTHS.has(depth as string)) {
    return { ok: false, error: '`depth` must be "preliminary", "standard", or "deep"' }
  }

  const marketplace = body.marketplace ?? 'US'
  if (typeof marketplace !== 'string' || !/^[A-Z]{2}$/.test(marketplace)) {
    return { ok: false, error: '`marketplace` must be a 2-letter country code (e.g. "US")' }
  }

  const maxProducts = body.max_products ?? 10
  if (typeof maxProducts !== 'number' || !Number.isInteger(maxProducts) ||
      maxProducts < 1 || maxProducts > 50) {
    return { ok: false, error: '`max_products` must be an integer between 1 and 50' }
  }

  return {
    ok: true,
    data: {
      query:         body.query.trim(),
      depth:         depth as ThesisDepth,
      marketplace,
      max_products:  maxProducts,
      force_refresh: body.force_refresh === true,
      intent:        body.intent as ThesisRequest['intent'] | undefined,
    },
  }
}

// ── POST — streaming thesis analysis ──────────────────────────────────────
//
// Flow:
//   1. Authenticate the user.
//   2. Validate the request body.
//   3. Pre-flight quota check (non-consuming — rejects if user is over limit).
//   4. Cache check (non-consuming — streams cached thesis immediately if hit).
//   5. Consume one analysis slot.
//   6. Open an SSE stream and hand control to synthesize().
//   7. On synthesis error: refund the slot, emit analysis:error, close stream.

export async function POST(req: Request): Promise<Response> {

  // ── 1. Auth ──────────────────────────────────────────────────
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse ─────────────────────────────────────────────────
  let rawBody: unknown
  try { rawBody = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseBody(rawBody)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const request = parsed.data

  // ── 3. Quota pre-flight ──────────────────────────────────────
  const devUnlimited = process.env.DEV_UNLIMITED_ANALYSES === 'true'

  if (!devUnlimited) {
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('analyses_used, analyses_limit')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) {
      console.error('[/api/thesis] profile read error', profileErr)
      return NextResponse.json(
        { error: 'Server error checking usage limit' },
        { status: 500 },
      )
    }
    if (profile && profile.analyses_used >= profile.analyses_limit) {
      return NextResponse.json(
        { error: 'Analysis limit reached for beta access' },
        { status: 429 },
      )
    }
  }

  // ── 4. Cache check (before consuming a slot) ─────────────────
  const normalized = normalizeQuery(request.query)
  const depth      = request.depth ?? 'standard'

  if (!request.force_refresh) {
    const cached = await getThesis(normalized, depth, THESIS_ENGINE_VERSION)
    if (cached) {
      console.log('[/api/thesis] cache hit', { id: cached.id, query: normalized, depth })

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()

      void Promise.resolve().then(async () => {
        await writer.write(sseFrame({ event: 'cache:hit', thesis_id: cached.id }))
        await writer.write(sseFrame({ event: 'thesis:complete', thesis: cached }))
        writer.close()
      })

      return new Response(readable, { headers: sseHeaders() })
    }
  }

  // ── 5. Consume quota slot ────────────────────────────────────
  let slotConsumed = false

  if (!devUnlimited) {
    const { data: slotGranted, error: slotErr } = await sb
      .rpc('consume_analysis_slot', { p_user_id: user.id })

    if (slotErr) {
      console.error('[/api/thesis] slot RPC error', { code: slotErr.code, message: slotErr.message })
      return NextResponse.json(
        { error: 'Server error checking usage limit — no slot used' },
        { status: 500 },
      )
    }
    if (!slotGranted) {
      return NextResponse.json(
        { error: 'Analysis limit reached for beta access' },
        { status: 429 },
      )
    }
    slotConsumed = true
  }

  // ── 6. Open SSE stream + run synthesis ──────────────────────
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  void (async () => {
    try {
      await synthesize(
        // force_refresh: true skips the internal cache check — we already did it above
        { ...request, force_refresh: true },
        (event: ThesisEvent) => {
          // Write errors are silently swallowed — the client may have disconnected
          writer.write(sseFrame(event)).catch(() => {})
        },
      )
    } catch (synthErr) {
      // ROOT CAUSE (found 2026-06-29 live, during a real Anthropic credit
      // exhaustion): this used to send synthErr.message straight into the
      // SSE stream — a raw provider error (e.g. "Your credit balance is
      // too low to access the Anthropic API...") would have reached the
      // browser verbatim. handleProviderError() logs the real detail
      // server-side and returns only a safe, category-appropriate message.
      const message = handleProviderError(synthErr, { route: '/api/thesis', query: normalized, depth, user_id: user.id })

      // Refund slot so the user is not penalised for a server-side failure
      if (slotConsumed) {
        void sb.rpc('refund_analysis_slot', { p_user_id: user.id }).then(
          ({ error: refundErr }) => {
            if (refundErr) console.error('[/api/thesis] slot refund failed', refundErr)
          },
        )
      }

      writer.write(sseError(message)).catch(() => {})
    } finally {
      writer.close().catch(() => {})
    }
  })()

  return new Response(readable, { headers: sseHeaders() })
}

// ── GET — health / API documentation ──────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status:   'ok',
    endpoint: 'POST /api/thesis',
    stream:   'text/event-stream (SSE)',
    version:  THESIS_ENGINE_VERSION,
    events: {
      'analysis:started':   'Fired immediately when the analysis begins',
      'intent:classified':  'The detected query intent (asin / keyword / problem)',
      'cache:hit':          'Thesis found in cache — thesis:complete follows immediately',
      'source:started':     'A data provider began fetching',
      'source:progress':    'Incremental update from a long-running provider',
      'source:completed':   'A data provider returned data',
      'source:failed':      'A data provider failed (analysis continues with remaining sources)',
      'synthesis:started':  'All providers done — Claude synthesis beginning',
      'thesis:section':     'One of the five thesis sections is ready',
      'thesis:complete':    'The full MarketThesis object is ready',
      'analysis:error':     'Fatal error — stream will close after this event',
    },
    input: {
      query:         'string   required   max 500 chars',
      depth:         '"preliminary"|"standard"|"deep"  default "standard"',
      marketplace:   'string   2-letter country code   default "US"',
      max_products:  'integer  1–50   default 10 (category analyses only)',
      force_refresh: 'boolean  bypass cache   default false',
    },
    depths: {
      preliminary: 'Signal engine only, <15s — directional read',
      standard:    'Signal + Claude synthesis, 60–90s — primary experience',
      deep:        'Extended review collection, 2–5 min — power users',
    },
  })
}
