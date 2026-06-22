import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic           from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import type { MemoData }   from '@/types/index'

export const maxDuration = 60

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
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start < 0) throw new Error('No JSON object in response')
  if (start > 0) s = s.slice(start)
  try { return JSON.parse(s) as MemoData } catch { /* fall through */ }
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') { if (--depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('No complete JSON object found')
  return JSON.parse(s.slice(0, end + 1)) as MemoData
}

function buildSkipMemo(input: string, skipReason: string): MemoData {
  const NA = 'N/A'
  const noScore = (note: string) => ({ score: 0, notes: note })
  const parseNote = 'Not assessed — AI response could not be parsed. Please try again.'
  return {
    category_name:     input.slice(0, 60),
    executive_summary: 'This category could not be analyzed due to a technical error. Please resubmit.',
    build_verdict:     'NO',
    build_decision:    'SKIP',
    build_explanation: `Analysis failed (${skipReason}). This is a technical issue, not a safety concern — please resubmit.`,
    opportunity_score: 0,
    scores: {
      demand:        noScore(parseNote),
      competition:   noScore(parseNote),
      virality:      noScore(parseNote),
      subscription:  noScore(parseNote),
      manufacturing: noScore(parseNote),
      defensibility: noScore(parseNote),
    },
    biggest_competitor: { name: NA, revenue: NA, gap: NA },
    market_size:  NA,
    sub_ltv:      NA,
    gross_margin: NA,
    market_gaps:         [NA, NA, NA, NA, NA],
    brand_opportunities: [NA, NA, NA, NA, NA],
    customer_language: {
      frustrations: [NA, NA],
      desires:      [NA, NA],
      fears:        [NA, NA],
      ad_phrases:   [{ they_say: NA, use_in_copy: NA }, { they_say: NA, use_in_copy: NA }],
    },
    product_recommendation: {
      format:        'capsule',
      dosing:        NA,
      formula:       [{ ingredient: NA, dose: NA, role: NA, evidence: '★' }],
      avoid:         [NA, NA],
      cogs_estimate: NA,
      retail_price:  NA,
      gross_margin:  NA,
    },
    financial_projections: {
      ten_k_probability:     NA,
      hundred_k_probability: NA,
      one_m_probability:     NA,
      gross_margin:          NA,
      net_margin_at_scale:   NA,
      subscription_ltv:      NA,
      path_to_10m:           NA,
    },
  }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── route ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: {
    input?:          string
    targetAudience?: string
    pricePoint?:     string
    context?:        string
    fromDiscovery?:  boolean
    categoryId?:     string
  }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { input, targetAudience, pricePoint, context, fromDiscovery, categoryId: rawCategoryId } = body

  // ── validation ─────────────────────────────────────────────────
  if (!input?.trim()) return err('input is required')
  if (input.trim().length > MAX_INPUT)
    return err(`Input too long — max ${MAX_INPUT} characters`, 400)
  if (targetAudience && targetAudience.trim().length > MAX_AUDIENCE)
    return err(`Target audience too long — max ${MAX_AUDIENCE} characters`, 400)
  if (context && context.trim().length > MAX_CONTEXT)
    return err(`Context too long — max ${MAX_CONTEXT} characters`, 400)
  if (pricePoint !== undefined && pricePoint !== '' && !VALID_PRICES.has(pricePoint))
    return err('Invalid price point value', 400)

  // ── Resolve category (classify if 'auto' or not provided) ─────
  let resolvedCategoryId = rawCategoryId
  if (!rawCategoryId || rawCategoryId === 'auto') {
    resolvedCategoryId = await classifyQuery(input.trim())
    console.log('Open Discovery classification (generate)', {
      input:    input.trim(),
      resolved: resolvedCategoryId,
    })
  }

  const module = categoryRegistry.resolve(resolvedCategoryId)

  // ── Relevance gate ─────────────────────────────────────────────
  // Skipped when request originated from discovery (already relevant by construction)
  // or when using Open Discovery (classification implies relevance).
  const wasAutoClassified = !rawCategoryId || rawCategoryId === 'auto'
  if (!fromDiscovery && !wasAutoClassified && !module.isRelevantQuery(input.trim())) {
    return err(
      `This tool currently analyzes ${module.name.toLowerCase()} ideas only. Try something like "${module.examples.specific[0]}".`,
      400,
    )
  }

  // ── Full-report cache ─────────────────────────────────────────
  const { data: cachedReport } = await sb
    .from('analyses')
    .select('id, created_at')
    .ilike('raw_input', input.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cachedReport) {
    console.log('Report cache hit', { input: input.trim(), id: cachedReport.id })
    return NextResponse.json({
      analysisId:   cachedReport.id,
      cached:       true,
      generated_at: cachedReport.created_at,
    })
  }

  // ── Pre-flight limit check ────────────────────────────────────
  const devUnlimited = process.env.DEV_UNLIMITED_ANALYSES === 'true'

  if (!devUnlimited) {
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('analyses_used, analyses_limit')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) {
      console.error('Profile read error', profileErr)
      return err('Server error checking usage limit.', 500)
    }
    if (profile && profile.analyses_used >= profile.analyses_limit) {
      return err('Analysis limit reached for beta access.', 429)
    }
  }

  // Build user message
  const lines = [`${module.name} idea: "${input.trim()}"`]
  if (targetAudience?.trim()) lines.push(`Target audience: ${targetAudience.trim()}`)
  if (pricePoint?.trim())     lines.push(`Price point: ${pricePoint.trim()}`)
  if (context?.trim())        lines.push(`Additional context: ${context.trim()}`)
  const userMessage = lines.join('\n')

  // ── Call Claude ────────────────────────────────────────────────
  const t0         = Date.now()
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 45_000)
  let rawText = ''
  try {
    const msg = await ai.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 2500,
        system:     module.analysisSystemPrompt,
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
      console.error('Anthropic timeout after 45 s')
      return err('Analysis timed out — no slot used. Please try again.', 504)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error', { status: e.status, message: e.message, error: e.error })
    } else {
      console.error('Anthropic error', e)
    }
    return err('AI service error — no slot used. Please try again.', 500)
  }
  const generationMs = Date.now() - t0

  // ── Parse memo ────────────────────────────────────────────────
  let memo: MemoData
  let skipReason: string | null = null
  try {
    memo = parseJSON(rawText)
  } catch {
    skipReason = 'json_parse_failure'
    console.error('JSON parse error — SKIP fallback triggered', {
      categoryId: module.id, skip_reason: skipReason,
      raw_length: rawText.length, snippet: rawText.slice(0, 500),
    })
    memo = buildSkipMemo(input.trim(), skipReason)
  }
  if (!memo.category_name || typeof memo.opportunity_score !== 'number' || !memo.scores) {
    skipReason = 'incomplete_memo'
    console.error('Incomplete memo — SKIP fallback triggered', {
      categoryId:        module.id,
      skip_reason:       skipReason,
      has_category_name: !!memo.category_name,
      has_score:         typeof memo.opportunity_score === 'number',
      has_scores:        !!memo.scores,
    })
    memo = buildSkipMemo(input.trim(), skipReason)
  }

  console.log('Analysis decision', {
    categoryId:      module.id,
    category:        input.trim(),
    category_name:   memo.category_name,
    safety_decision: skipReason ? 'technical_skip' : (memo.build_decision === 'SKIP' ? 'content_skip' : 'passed'),
    final_score:     memo.opportunity_score,
    build_decision:  memo.build_decision,
    generation_ms:   generationMs,
  })

  // ── Atomic slot consumption ────────────────────────────────────
  if (!devUnlimited) {
    const { data: slotGranted, error: slotErr } = await sb
      .rpc('consume_analysis_slot', { p_user_id: user.id })

    if (slotErr) {
      console.error('Rate limit RPC error', {
        code: slotErr.code, message: slotErr.message,
      })
      return err('Server error checking usage limit — no slot used.', 500)
    }
    if (!slotGranted) {
      return err('Analysis limit reached for beta access.', 429)
    }
  }

  // ── Save analysis ──────────────────────────────────────────────
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
    console.error('DB insert error — refunding slot', dbErr)
    await sb.rpc('refund_analysis_slot', { p_user_id: user.id })
    return err('Failed to save analysis — your slot was refunded.', 500)
  }

  // Upsert leaderboard
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
