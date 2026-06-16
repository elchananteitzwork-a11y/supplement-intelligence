import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic           from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT }   from '@/lib/prompts/system'
import type { MemoData }   from '@/types/index'

export const maxDuration = 60   // Vercel Pro required; free plan caps at 10s

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── input limits ───────────────────────────────────────────────
const MAX_INPUT    = 500
const MAX_AUDIENCE = 200
const MAX_CONTEXT  = 1000
const VALID_PRICES = new Set(['', 'under-30', '30-50', '50-75', '75-plus'])

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

function parseJSON(raw: string): MemoData {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  return JSON.parse(stripped) as MemoData
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── route ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  // parse body first so we can validate before touching the DB
  let body: { input?: string; targetAudience?: string; pricePoint?: string; context?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { input, targetAudience, pricePoint, context } = body

  // ── server-side input validation ──────────────────────────────
  if (!input?.trim()) return err('input is required')
  if (input.trim().length > MAX_INPUT)
    return err(`Input too long — max ${MAX_INPUT} characters`, 400)
  if (targetAudience && targetAudience.trim().length > MAX_AUDIENCE)
    return err(`Target audience too long — max ${MAX_AUDIENCE} characters`, 400)
  if (context && context.trim().length > MAX_CONTEXT)
    return err(`Context too long — max ${MAX_CONTEXT} characters`, 400)
  if (pricePoint !== undefined && pricePoint !== '' && !VALID_PRICES.has(pricePoint))
    return err('Invalid price point value', 400)

  // ── atomic rate-limit slot consumption ────────────────────────
  // Uses a SECURITY DEFINER DB function to prevent TOCTOU race:
  // two simultaneous requests cannot both pass the limit check.
  const { data: slotGranted, error: slotErr } = await sb
    .rpc('consume_analysis_slot', { p_user_id: user.id })

  if (slotErr) {
    console.error('Rate limit RPC error', {
      code:    slotErr.code,
      message: slotErr.message,
      details: slotErr.details,
      hint:    slotErr.hint,
    })
    return err('Server error checking usage limit.', 500)
  }
  if (!slotGranted) {
    return err('Analysis limit reached for beta access.', 429)
  }

  // build user message
  const lines = [`Supplement idea: "${input.trim()}"`]
  if (targetAudience?.trim()) lines.push(`Target audience: ${targetAudience.trim()}`)
  if (pricePoint?.trim())     lines.push(`Price point: ${pricePoint.trim()}`)
  if (context?.trim())        lines.push(`Additional context: ${context.trim()}`)
  const userMessage = lines.join('\n')

  // call Claude — hard abort at 45 s so we return cleanly before Vercel kills us
  const t0         = Date.now()
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 45_000)
  let rawText = ''
  try {
    const msg = await ai.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 1200,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal },
    )
    clearTimeout(abortTimer)
    rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e: unknown) {
    clearTimeout(abortTimer)
    const isAbort = e instanceof Error &&
      (e.name === 'APIUserAbortError' || e.name === 'AbortError')
    if (isAbort) {
      console.error('Anthropic request aborted after 45 s')
      return err('Analysis timed out — please try again.', 504)
    }
    console.error('Anthropic error', e)
    return err('AI service error. Please try again.', 500)
  }
  const generationMs = Date.now() - t0

  // parse memo
  let memo: MemoData
  try {
    memo = parseJSON(rawText)
  } catch (e) {
    console.error('JSON parse error — raw snippet:', rawText.slice(0, 400))
    return err('Failed to parse AI output. Please try again.', 500)
  }

  // basic structural validation
  if (!memo.category_name || typeof memo.opportunity_score !== 'number' || !memo.scores) {
    return err('Incomplete analysis returned. Please try again.', 500)
  }

  // save analysis
  const { data: analysis, error: dbErr } = await sb
    .from('analyses')
    .insert({
      user_id:             user.id,
      raw_input:           input.trim(),
      category_name:       memo.category_name,
      target_audience:     targetAudience?.trim() ?? null,
      price_point:         pricePoint?.trim()     ?? null,
      score_demand:        memo.scores.demand?.score        ?? null,
      score_competition:   memo.scores.competition?.score   ?? null,
      score_virality:      memo.scores.virality?.score      ?? null,
      score_subscription:  memo.scores.subscription?.score  ?? null,
      score_manufacturing: memo.scores.manufacturing?.score ?? null,
      score_defensibility: memo.scores.defensibility?.score ?? null,
      opportunity_score:   memo.opportunity_score,
      build_decision:      memo.build_decision,
      build_verdict:       memo.build_verdict ?? null,
      memo_data:           memo,
      biggest_competitor:  memo.biggest_competitor?.name    ?? null,
      market_size:         memo.market_size                 ?? null,
      sub_ltv:             memo.sub_ltv                     ?? null,
      gross_margin:        memo.gross_margin                ?? null,
      generation_ms:       generationMs,
    })
    .select('id')
    .single()

  if (dbErr || !analysis) {
    console.error('DB insert error', dbErr)
    return err('Failed to save analysis.', 500)
  }

  // upsert leaderboard — keep highest score per category
  const { data: existing } = await sb
    .from('leaderboard')
    .select('id, opportunity_score, analysis_count')
    .eq('category_name', memo.category_name)
    .maybeSingle()

  if (!existing) {
    await sb.from('leaderboard').insert({
      category_name:      memo.category_name,
      opportunity_score:  memo.opportunity_score,
      build_decision:     memo.build_decision,
      biggest_competitor: memo.biggest_competitor?.name ?? null,
      market_size:        memo.market_size             ?? null,
      sub_ltv:            memo.sub_ltv                 ?? null,
      best_analysis_id:   analysis.id,
      analysis_count:     1,
    })
  } else {
    const better = memo.opportunity_score > (existing.opportunity_score ?? 0)
    await sb.from('leaderboard')
      .update({
        analysis_count: (existing.analysis_count ?? 0) + 1,
        last_analyzed:  new Date().toISOString(),
        ...(better && {
          opportunity_score:  memo.opportunity_score,
          build_decision:     memo.build_decision,
          biggest_competitor: memo.biggest_competitor?.name ?? null,
          market_size:        memo.market_size             ?? null,
          sub_ltv:            memo.sub_ltv                 ?? null,
          best_analysis_id:   analysis.id,
        }),
      })
      .eq('id', existing.id)
  }

  return NextResponse.json({ analysisId: analysis.id, memo })
}
