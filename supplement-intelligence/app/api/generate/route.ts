import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic           from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }    from '@/lib/signal-engine'
import { keywordEngine, enrichKeywordIntelligence, explainKeywordIntelligence } from '@/lib/keyword-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import { computeGroundedScore, computeTractionBand } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import { fetchRealCompetitorRevenue, formatRealCompetitorRevenue } from '@/lib/real-competitor'
import { buildNewsIntelligence } from '@/lib/news-engine'
import type { MemoData, SignalMetadata } from '@/types/index'

// CONFIRMED VIA LOAD TEST (2026-06-24, 17 real generations): single-attempt
// Anthropic generation latency for this prompt size routinely runs 48-68s on
// its own, which was landing right on top of the previous 60s ceiling — 7/17
// real attempts came back as an unparseable Vercel platform timeout page
// instead of JSON. Raising the ceiling here; the abort timer below is kept
// safely under it so a genuinely stuck request fails as a clean JSON error
// instead of a hard platform kill either way.
//
// Raised again 2026-06-24 (120 → 250) to make room for the Apify
// competition-intelligence call (providers/competition.ts). Its real
// synchronous latency across 7 live runs measured 30-73s — high variance,
// no clean fast path (Amazon search scraping is page-load/anti-bot-bound,
// not item-count-bound). A too-short client-side timeout doesn't save
// money either: Apify still runs and bills the actor to completion
// regardless of whether this request is still listening for the result —
// it just means we paid for data we then threw away. Confirmed this
// account's plan (Hobby, with fluid compute) allows up to 300s, so 250s
// leaves real margin: worst case is ~75s signals + ~100s generation +
// overhead, with slack left under both this ceiling and the platform's.
//
// Raised again 2026-06-24 (250 → 285) — "Load failed" search-stability bug.
// Consumer Intelligence (added after the 250s figure above was set) added
// its own sequential, effectively-unbounded latency stage on top of this
// budget (root cause: a 15s default HTTP timeout on a ~70s-real-latency
// Apify call, causing wasted retries — fixed in
// lib/consumer-intelligence/analyze.ts). That stage is now parallelized and
// hard-capped at 85s. New worst case: ~75s signals + ~85s consumer
// intelligence + ~100s generation + overhead ≈ 270s, so 285s keeps real
// margin under both this ceiling and the platform's 300s.
export const maxDuration = 285

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
  // No numeric score: this is a technical-failure placeholder, not an
  // assessment — a fabricated "0/10" would look like a real judgment.
  const noScore = (note: string) => ({ notes: note })
  const parseNote = 'Not assessed — AI response could not be parsed. Please try again.'
  return {
    category_name:     input.slice(0, 60),
    executive_summary: 'This category could not be analyzed due to a technical error. Please resubmit.',
    build_decision:    'SKIP',
    build_explanation: `Analysis failed (${skipReason}). This is a technical issue, not a safety concern — please resubmit.`,
    opportunity_score: 0,
    scores: {
      demand:        noScore(parseNote),
      competition:   noScore(parseNote),
      virality:      noScore(parseNote),
      subscription:  noScore(parseNote),
      manufacturing: noScore(parseNote),
    },
    biggest_competitor: { name: NA, revenue: NA, gap: NA },
    market_size:  NA,
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
      gross_margin:        NA,
      net_margin_at_scale: NA,
      path_to_10m:         NA,
    },
  }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// ── Phase 1: Output validation ─────────────────────────────────
// Checks every field required for a complete report. Used by the retry
// loop to decide whether to re-attempt before falling back to buildSkipMemo.

const MAX_GENERATE_ATTEMPTS = 3

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return !isNaN(v)
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

function validateMemo(memo: MemoData): string[] {
  const missing: string[] = []

  // Top-level scalars
  if (!isNonEmpty(memo.category_name))     missing.push('category_name')
  if (!isNonEmpty(memo.executive_summary)) missing.push('executive_summary')
  if (!isNonEmpty(memo.build_decision))    missing.push('build_decision')
  if (!isNonEmpty(memo.build_explanation)) missing.push('build_explanation')
  if (typeof memo.opportunity_score !== 'number') missing.push('opportunity_score')
  if (!isNonEmpty(memo.market_size))       missing.push('market_size')
  if (!isNonEmpty(memo.gross_margin))      missing.push('gross_margin')

  // 4 dimensions (competition removed in Phase 2, defensibility removed
  // 2026-06-25; competition is optional for old memos). 2026-06-26 redesign:
  // checks for `level` (qualitative), not `score` — AI is no longer asked
  // for a number here at all, see lib/scoring.ts header comment.
  const dims = ['demand','virality','subscription','manufacturing'] as const
  if (!memo.scores) {
    missing.push('scores')
  } else {
    for (const d of dims) {
      if (!isNonEmpty(memo.scores[d]?.level)) missing.push(`scores.${d}.level`)
      if (!isNonEmpty(memo.scores[d]?.notes)) missing.push(`scores.${d}.notes`)
    }
  }

  // market_saturation required for new memos (qualitative replacement for competition score)
  const ms = memo.market_saturation
  if (!ms) {
    missing.push('market_saturation')
  } else {
    if (!isNonEmpty(ms.maturity))              missing.push('market_saturation.maturity')
    if (!isNonEmpty(ms.concentration))         missing.push('market_saturation.concentration')
    if (!isNonEmpty(ms.entry_difficulty))      missing.push('market_saturation.entry_difficulty')
    if (!isNonEmpty(ms.competitive_intensity)) missing.push('market_saturation.competitive_intensity')
  }

  // Arrays: need at least 3 non-empty items each
  if (!Array.isArray(memo.market_gaps) || memo.market_gaps.filter(isNonEmpty).length < 3)
    missing.push('market_gaps')
  if (!Array.isArray(memo.brand_opportunities) || memo.brand_opportunities.filter(isNonEmpty).length < 3)
    missing.push('brand_opportunities')

  // customer_language
  const cl = memo.customer_language
  if (!cl) {
    missing.push('customer_language')
  } else {
    if (!Array.isArray(cl.frustrations) || cl.frustrations.length < 1) missing.push('customer_language.frustrations')
    if (!Array.isArray(cl.desires)      || cl.desires.length < 1)       missing.push('customer_language.desires')
    if (!Array.isArray(cl.fears)        || cl.fears.length < 1)         missing.push('customer_language.fears')
    if (!Array.isArray(cl.ad_phrases)   || cl.ad_phrases.length < 1)    missing.push('customer_language.ad_phrases')
  }

  // product_recommendation (critical fields only)
  const pr = memo.product_recommendation
  if (!pr) {
    missing.push('product_recommendation')
  } else {
    if (!isNonEmpty(pr.format))        missing.push('product_recommendation.format')
    if (!isNonEmpty(pr.dosing))        missing.push('product_recommendation.dosing')
    if (!Array.isArray(pr.formula) || pr.formula.length < 1) missing.push('product_recommendation.formula')
    if (!isNonEmpty(pr.cogs_estimate)) missing.push('product_recommendation.cogs_estimate')
    if (!isNonEmpty(pr.retail_price))  missing.push('product_recommendation.retail_price')
  }

  // financial_projections — 2026-06-26 redesign: ten_k/hundred_k/one_m
  // probability are no longer requested (no real base-rate model exists —
  // see lib/scoring.ts computeTractionBand, which replaces them
  // server-side) and must NOT be required here, or every memo fails
  // validation 3x and falls back to a SKIP placeholder for no reason.
  const fp = memo.financial_projections
  if (!fp) {
    missing.push('financial_projections')
  } else {
    const fpFields = ['gross_margin', 'net_margin_at_scale', 'path_to_10m'] as const
    for (const f of fpFields) {
      if (!isNonEmpty(fp[f])) missing.push(`financial_projections.${f}`)
    }
  }

  return missing
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

  // ── Start signal + keyword fetch immediately (overlaps with DB round-trips below) ──
  // Firing this before the cache/profile checks hides most of its latency.
  // 75_000 (not the old 8_000): the Apify competition provider's real
  // synchronous latency measured 30-73s across 7 live runs — anything
  // shorter silently dropped a result that had already succeeded and been
  // billed. Matches that provider's own internal AbortSignal.timeout(80_000).
  const signalPromise  = signalEngine.fetch({ query: input.trim(), categoryId: module.id }, 75_000).catch(() => null)
  const keywordPromise = keywordEngine.fetch(input.trim(), 8_000).catch(() => null)
  // News Intelligence: independent of signals/competitors, so it fires here
  // rather than waiting on topCompetitors below. Includes its own Haiku
  // "why it matters" pass internally — never touches the main Sonnet prompt
  // or schema (see lib/news-engine/build.ts) — so this adds no tokens to the
  // expensive call and, since Haiku is far faster than the ~48-68s Sonnet
  // generation it runs alongside, no meaningful latency either.
  const newsPromise = buildNewsIntelligence(input.trim(), module.id, module.name, 18_000)

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

  // ── Await signal engine results (most of the latency elapsed during DB checks above) ─
  const signals = await signalPromise
  const keywordIntelligence = await keywordPromise

  // ── Consumer Intelligence: real review-text themes ──────────────────────
  // Depends on competitor ASINs found by Competition Intelligence above —
  // can't run in parallel with signalPromise, it needs that result first.
  // Must resolve BEFORE the prompt is built (moved here 2026-06-25 — it
  // previously ran AFTER systemPrompt was constructed, which meant Claude
  // never actually saw this real data despite it being computed). The real
  // themes are now injected as mandatory grounding for market_gaps /
  // customer_language / biggest_competitor.gap (see buildSignalContext in
  // lib/prompts/discovery.ts) — Claude is instructed to cite the real item
  // rather than invent a different one, not to freely restate it as its
  // own discovery. The underlying counts/quotes the UI shows still come
  // straight from memo.consumer_intelligence, untouched by the model.
  const topCompetitors = signals?.review_velocity?.value.top_competitors
  const consumerIntelligence = topCompetitors?.length
    ? await analyzeConsumerIntelligence(topCompetitors, input.trim()).catch((e: unknown) => {
        console.error('Consumer Intelligence failed', { error: e instanceof Error ? e.message : e })
        return null
      })
    : null

  // ── Keyword Intelligence enrichment (deterministic — clusters, opportunity
  // discovery, seasonality, forecast, per-keyword scores) + AI Insights ──────
  // Enrichment needs topCompetitors/consumerIntelligence above, so it can't
  // start until here. The AI Insights pass (the one LLM step in this whole
  // module — see lib/keyword-engine/explain.ts) is fired now and awaited
  // late, right before persisting to the memo, so it overlaps with the much
  // slower main Sonnet generation call below instead of adding to latency.
  const enrichedKeywordIntelligence = keywordIntelligence
    ? enrichKeywordIntelligence(keywordIntelligence, {
        competitorBrands:   topCompetitors?.map(c => c.brand) ?? [],
        realBenefitPhrases: consumerIntelligence
          ? [...consumerIntelligence.positiveThemes, ...consumerIntelligence.featureRequests].map(t => t.label)
          : [],
      })
    : null
  const keywordInsightsPromise = enrichedKeywordIntelligence
    ? explainKeywordIntelligence(enrichedKeywordIntelligence, input.trim(), module.name).catch((e: unknown) => {
        console.error('Keyword AI Insights failed', { error: e instanceof Error ? e.message : e })
        return null
      })
    : Promise.resolve(null)

  const systemPrompt = signals
    ? module.buildSignalAugmentedPrompt(module.analysisSystemPrompt, input.trim(), signals, consumerIntelligence)
    : module.analysisSystemPrompt

  const signalMeta: SignalMetadata | undefined = signals ? {
    providers_used:     signals.providers_used,
    overall_confidence: signals.overall_confidence,
    demand_verified:    !!(signals.demand   || signals.growth),
    virality_verified:  !!signals.virality,
    pricing_verified:   !!signals.pricing,
    growth_verified:    !!signals.growth,
    market_verified:    !!signals.competition,
    consumer_intelligence_attempted: !!topCompetitors?.length,
  } : undefined

  if (signals) {
    console.log('Generate: signal engine hit', {
      providers:  signals.providers_used,
      confidence: signals.overall_confidence,
      category:   input.trim(),
    })
  }

  // ── Generate with retry ────────────────────────────────────────
  // Up to MAX_GENERATE_ATTEMPTS attempts before falling back to buildSkipMemo.
  // Each attempt calls Claude, parses the JSON, and runs validateMemo().
  // Only a memo that passes all field checks is accepted; otherwise we retry.
  // Slot consumption happens AFTER this loop (unchanged) so timeouts still
  // cost the user nothing.
  let memo: MemoData        = buildSkipMemo(input.trim(), 'not_started')
  let skipReason: string | null = 'not_started'
  let generationMs             = 0

  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
    const t0         = Date.now()
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 100_000)
    let rawText = ''

    try {
      const msg = await ai.messages.create(
        {
          model:      'claude-sonnet-4-6',
          max_tokens: 3500,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userMessage }],
        },
        { signal: controller.signal },
      )
      clearTimeout(abortTimer)
      rawText       = msg.content[0].type === 'text' ? msg.content[0].text : ''
      generationMs += Date.now() - t0
    } catch (e: unknown) {
      clearTimeout(abortTimer)
      generationMs += Date.now() - t0
      // Don't rely on `e instanceof Anthropic.APIUserAbortError` — in production this SDK
      // class reference can resolve to a different module instance than the one that threw
      // the error (Next.js bundles can duplicate dependency modules), so the check silently
      // fails and a normal timeout gets reported as a generic 500. Our own AbortController's
      // signal is unambiguous: it's only ever flipped by the timer below.
      const isAbort = controller.signal.aborted
      if (isAbort) {
        console.error(`Anthropic timeout after 55 s (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS})`)
        if (attempt < MAX_GENERATE_ATTEMPTS) continue
        return err('Analysis timed out — no slot used. Please try again.', 504)
      }
      if (e instanceof Anthropic.APIError) {
        console.error('Anthropic API error', { status: e.status, message: e.message, error: e.error })
      } else {
        console.error('Anthropic error', e)
      }
      return err('AI service error — no slot used. Please try again.', 500)
    }

    // ── Parse ──────────────────────────────────────────────────
    let parsed: MemoData
    try {
      parsed = parseJSON(rawText)
    } catch {
      console.error(`JSON parse error (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS})`, {
        categoryId: module.id, raw_length: rawText.length, snippet: rawText.slice(0, 300),
      })
      if (attempt < MAX_GENERATE_ATTEMPTS) continue
      skipReason = 'json_parse_failure'
      memo = buildSkipMemo(input.trim(), skipReason)
      break
    }

    // ── Validate all required fields ───────────────────────────
    const missingFields = validateMemo(parsed)
    if (missingFields.length > 0) {
      console.error(`Incomplete memo (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS})`, {
        categoryId: module.id, missing: missingFields,
      })
      if (attempt < MAX_GENERATE_ATTEMPTS) continue
      skipReason = 'incomplete_memo'
      memo = buildSkipMemo(input.trim(), skipReason)
      break
    }

    // Valid memo — accept and exit loop
    memo       = parsed
    skipReason = null
    break
  }

  // Attach signal source metadata for Phase 3 UI attribution
  if (!skipReason && signalMeta) {
    memo.signal_metadata = signalMeta
  }
  // Evidence-first layer: persist the real signal/keyword data the prompt was
  // built from, instead of discarding it once the LLM call returns. The UI
  // renders this directly — it is never rewritten by the model. Must happen
  // BEFORE the score recalculation below, which reads memo.signal_evidence
  // and memo.consumer_intelligence to ground the score in real data.
  if (!skipReason && signals) {
    memo.signal_evidence = signals
  }
  if (!skipReason && enrichedKeywordIntelligence) {
    const keywordAiInsights = await keywordInsightsPromise
    memo.keyword_intelligence = keywordAiInsights
      ? { ...enrichedKeywordIntelligence, ai_insights: keywordAiInsights }
      : enrichedKeywordIntelligence
  }
  if (!skipReason && consumerIntelligence) {
    memo.consumer_intelligence = consumerIntelligence
  }
  // News Intelligence: started way back alongside signalPromise/keywordPromise,
  // so by this point (after the ~48-68s main Claude call) it has almost
  // certainly already resolved — this await is just a formality, not a wait.
  // Always attached (never conditional on truthiness): buildNewsIntelligence
  // always returns a complete object, with the literal "No significant
  // recent developments found." summary already applied when no real items
  // exist, so there is never a missing/placeholder state to handle here.
  if (!skipReason) {
    memo.news_intelligence = await newsPromise.catch((e: unknown) => {
      console.error('News Intelligence failed', { error: e instanceof Error ? e.message : e })
      return undefined
    })
  }

  // ── Real biggest-competitor grounding ───────────────────────────
  // Replaces the model's invented name/revenue with the real #1 competitor
  // by review count (already found by Competition Intelligence for this
  // exact query) and a targeted Keepa lookup on that exact ASIN for real
  // price × real monthlySold — not a category average, not a guess.
  // .gap stays model-written (a qualitative judgment), but is now also
  // instructed to cite real Consumer Intelligence themes when available
  // (see buildSignalContext in lib/prompts/discovery.ts).
  if (!skipReason && topCompetitors?.length) {
    const top = topCompetitors[0]
    console.log('Real competitor lookup: attempting', { productId: top.productId, brand: top.brand })
    const real = await fetchRealCompetitorRevenue(top.productId, top.brand).catch((e: unknown) => {
      console.error('Real competitor revenue lookup failed', { error: e instanceof Error ? e.message : e })
      return null
    })
    if (real) {
      memo.biggest_competitor.name    = real.brand
      memo.biggest_competitor.revenue = formatRealCompetitorRevenue(real)
      if (memo.signal_metadata) memo.signal_metadata.competitor_revenue_verified = true
      console.log('Real competitor lookup: succeeded', real)
    } else {
      console.log('Real competitor lookup: no real data, keeping model-written biggest_competitor', { productId: top.productId, brand: top.brand })
    }
  }

  // ── Server-side score recalculation ───────────────────────────
  // Permanent rule (2026-06-26): a dimension contributes a number to the
  // score ONLY when backed by real provider data or a deterministic formula
  // over real data. lib/scoring.ts excludes every dimension with no real
  // basis entirely — it no longer falls back to the model's own invented
  // number for anything. Those dimensions still show, qualitatively, in the
  // UI breakdown — never as a number.
  if (!skipReason && memo.scores) {
    const grounded = computeGroundedScore(memo)
    memo.opportunity_score = grounded.score
    memo.build_decision    = grounded.decision
    // Deterministic replacement for the model's invented ten_k/hundred_k/
    // one_m probabilities (no longer requested in the prompt) — see
    // lib/scoring.ts computeTractionBand.
    if (memo.financial_projections) {
      memo.financial_projections.traction_band = computeTractionBand(memo)
    }

    // Server-side consistency check (lib/consistency.ts) — logged for
    // visibility now; the same check re-runs in the UI (ConsistencyFlagsPanel)
    // since it's a pure function of the same persisted memo fields.
    const flags = checkConsistency(memo)
    if (flags.length > 0) {
      console.warn('Consistency check flagged claims', {
        category: input.trim(),
        flags:    flags.map(f => ({ field: f.field, claim: f.claim })),
      })
    }
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
      // 2026-06-26 redesign: these dimensions no longer have a number (AI
      // writes a qualitative `level` instead — see lib/scoring.ts) — left
      // null going forward rather than fabricating one, same pattern
      // already used below for the two previously-removed columns.
      score_demand:        memo.scores.demand?.score        ?? null,
      score_competition:   null,  // removed in Phase 2 — column kept for schema compat
      score_virality:      memo.scores.virality?.score      ?? null,
      score_subscription:  memo.scores.subscription?.score  ?? null,
      score_manufacturing: memo.scores.manufacturing?.score ?? null,
      score_defensibility: null,  // removed 2026-06-25 — column kept for schema compat
      opportunity_score:   memo.opportunity_score,
      build_decision:      memo.build_decision,
      build_verdict:       null,  // removed 2026-06-26 — generated, never read by any UI, pure waste; column kept for schema compat
      memo_data:           memo,
      biggest_competitor:  memo.biggest_competitor?.name    ?? null,
      market_size:         memo.market_size                 ?? null,
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
          best_analysis_id:   analysis.id,
        }),
      })
      .eq('id', existing.id)
  }

  return NextResponse.json({ analysisId: analysis.id, memo })
}
