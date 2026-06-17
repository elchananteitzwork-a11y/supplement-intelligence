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
  // Strip markdown fences
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  // Jump to the first '{' (handles any preamble Claude might add despite instructions)
  const start = s.indexOf('{')
  if (start < 0) throw new Error('No JSON object in response')
  if (start > 0) s = s.slice(start)
  // Fast path — well-formed response
  try { return JSON.parse(s) as MemoData } catch { /* fall through */ }
  // Slow path — string-aware brace scanner to find the outermost complete object.
  // The naive scanner breaks on '}' inside string values; this one tracks string state.
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

// Last-resort memo returned when parsing fails completely.
// Saves a SKIP record so the user sees a result instead of an error.
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

// ── supplement relevance gate ──────────────────────────────────
// Single-word and two-word tokens. Any one match lets the request through.
// Conservative: err on the side of passing ambiguous inputs to Claude.
const SUPPLEMENT_TOKENS = new Set([
  // explicit supplement/nutrition terms
  'supplement','supplements','vitamin','vitamins','mineral','minerals',
  'protein','collagen','probiotic','probiotics','prebiotic','prebiotics',
  'omega','fiber','fibre','amino','herb','herbal','botanical','extract',
  'adaptogen','nootropic','peptide','nutraceutical','superfood',
  'capsule','capsules','gummy','gummies','powder','tincture','softgel',
  // health conditions and symptoms
  'sleep','stress','anxiety','energy','fatigue','tired','tiredness',
  'muscle','gut','digestion','digestive','bloat','bloating',
  'immune','immunity','hormone','hormones','hormonal','cortisol',
  'hair','skin','nail','nails','mood','focus','memory','cognitive','brain',
  'libido','fertility','menopause','perimenopause','pcos','acne',
  'joint','joints','pain','inflammation','inflammatory','metabolism','metabolic',
  'insulin','thyroid','adrenal','detox','cleanse','appetite',
  'weight loss','fat loss','fat burning','muscle gain','muscle growth',
  // specific ingredients
  'magnesium','zinc','iron','calcium','potassium','ashwagandha','turmeric',
  'curcumin','melatonin','creatine','glutamine','maca','rhodiola','ginseng',
  'mushroom','mushrooms','berberine','inositol','glycine','taurine','carnitine',
  'biotin','folate','b12','d3','coq10','nad','colostrum','elderberry',
  'echinacea','spirulina','chlorella','reishi','lion\'s mane','ashwa',
  // wellness goals and contexts
  'recovery','endurance','strength','antioxidant','longevity','wellness',
  'health','healthy','nutrition','nutritional','dietary','diet',
  'postpartum','prenatal','pregnancy','breastfeeding','fasting','fast',
  // body systems used in supplement context
  'liver','heart','bone','cartilage','blood','blood sugar',
])

function isSupplementIdea(raw: string): boolean {
  const lower = raw.toLowerCase()
  const words = lower.split(/\W+/).filter(Boolean)
  // single-word check
  for (const w of words) {
    if (SUPPLEMENT_TOKENS.has(w)) return true
  }
  // two-word phrase check
  for (let i = 0; i < words.length - 1; i++) {
    if (SUPPLEMENT_TOKENS.has(`${words[i]} ${words[i + 1]}`)) return true
  }
  return false
}

// ── route ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  // parse body first so we can validate before touching the DB
  let body: { input?: string; targetAudience?: string; pricePoint?: string; context?: string; fromDiscovery?: boolean }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { input, targetAudience, pricePoint, context, fromDiscovery } = body

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

  // ── supplement relevance gate ─────────────────────────────────
  // Skipped for discovery-originated inputs — names generated by the discovery
  // engine are supplement opportunities by construction and won't match the
  // keyword list (e.g. "GLP-1 Companion Nutrient Stack").
  if (!fromDiscovery && !isSupplementIdea(input.trim())) {
    return err('This tool currently analyzes supplement ideas only. Try something like "magnesium for sleep" or "collagen for women 40+".', 400)
  }

  // ── pre-flight limit check (non-consuming) ───────────────────
  // Reads current usage before calling Claude so we don't waste an API
  // call on a user who is already at their limit. The atomic consume
  // below is the authoritative gate; this is just an early exit.
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

  // build user message
  const lines = [`Supplement idea: "${input.trim()}"`]
  if (targetAudience?.trim()) lines.push(`Target audience: ${targetAudience.trim()}`)
  if (pricePoint?.trim())     lines.push(`Price point: ${pricePoint.trim()}`)
  if (context?.trim())        lines.push(`Additional context: ${context.trim()}`)
  const userMessage = lines.join('\n')

  // ── call Claude (slot NOT yet consumed) ───────────────────────
  // Slot is consumed only after a successful parse. AI failures (network
  // error, timeout, bad response) do not charge the user.
  const t0         = Date.now()
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 45_000)
  let rawText = ''
  try {
    const msg = await ai.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 2500,
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
      console.error('Anthropic timeout after 45 s')
      return err('Analysis timed out — no slot used. Please try again.', 504)
    }
    // Log the full Anthropic error body so it appears in Vercel function logs
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error', {
        status:  e.status,
        message: e.message,
        error:   e.error,
      })
    } else {
      console.error('Anthropic error', e)
    }
    return err('AI service error — no slot used. Please try again.', 500)
  }
  const generationMs = Date.now() - t0

  // ── parse memo (slot NOT yet consumed) ────────────────────────
  let memo: MemoData
  let skipReason: string | null = null
  try {
    memo = parseJSON(rawText)
  } catch (e) {
    skipReason = 'json_parse_failure'
    console.error('JSON parse error — SKIP fallback triggered', {
      category:    input.trim(),
      skip_reason: skipReason,
      raw_length:  rawText.length,
      snippet:     rawText.slice(0, 500),
    })
    memo = buildSkipMemo(input.trim(), skipReason)
  }
  if (!memo.category_name || typeof memo.opportunity_score !== 'number' || !memo.scores) {
    skipReason = 'incomplete_memo'
    console.error('Incomplete memo — SKIP fallback triggered', {
      category:          input.trim(),
      skip_reason:       skipReason,
      has_category_name: !!memo.category_name,
      has_score:         typeof memo.opportunity_score === 'number',
      has_scores:        !!memo.scores,
    })
    memo = buildSkipMemo(input.trim(), skipReason)
  }

  console.log('Analysis decision', {
    category:        input.trim(),
    category_name:   memo.category_name,
    safety_decision: skipReason ? 'technical_skip' : (memo.build_decision === 'SKIP' ? 'content_skip' : 'passed'),
    skip_reason:     skipReason ?? (memo.build_decision === 'SKIP' ? memo.build_explanation : null),
    final_score:     memo.opportunity_score,
    build_decision:  memo.build_decision,
    generation_ms:   generationMs,
  })

  // ── atomic slot consumption — AFTER successful parse ──────────
  // consume_analysis_slot auto-creates the profiles row if absent (migration 003).
  const { data: slotGranted, error: slotErr } = await sb
    .rpc('consume_analysis_slot', { p_user_id: user.id })

  if (slotErr) {
    console.error('Rate limit RPC error', {
      code: slotErr.code, message: slotErr.message,
      details: slotErr.details, hint: slotErr.hint,
    })
    return err('Server error checking usage limit — no slot used.', 500)
  }
  if (!slotGranted) {
    return err('Analysis limit reached for beta access.', 429)
  }

  // ── save analysis ─────────────────────────────────────────────
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
    // Slot was consumed but the record wasn't saved — give it back.
    await sb.rpc('refund_analysis_slot', { p_user_id: user.id })
    return err('Failed to save analysis — your slot was refunded.', 500)
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
