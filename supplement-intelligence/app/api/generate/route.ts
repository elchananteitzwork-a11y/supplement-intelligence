import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic           from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }    from '@/lib/signal-engine'
import { keywordEngine, enrichKeywordIntelligence, explainKeywordIntelligence } from '@/lib/keyword-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import { computeGroundedScore, computeTractionBand, SCORING_ENGINE_VERSION } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import { fetchRealCompetitorRevenue, formatRealCompetitorRevenue } from '@/lib/real-competitor'
import { buildNewsIntelligence } from '@/lib/news-engine'
import { shouldConsumeSlot } from '@/lib/analysis-slot-policy'
import { handleProviderError } from '@/lib/provider-errors'
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
// hard-capped at 85s.
//
// CORRECTED 2026-06-28 (production-readiness audit): the ~270s estimate
// above only ever accounted for ONE Anthropic attempt — it never budgeted
// for MAX_GENERATE_ATTEMPTS retries (each its own 100s abort timer) or the
// Category-Creation-Candidate broadened re-fetch added the same day. Two
// real fixes, not a raised ceiling (the platform's own hard cap is already
// 300s on this plan, so there's nowhere left to raise it to):
//   1. The broadened re-fetch and Consumer Intelligence have no data
//      dependency on each other and now run in parallel (Promise.all)
//      instead of accidentally sequential — reclaims ~20s.
//   2. hasTimeForAnotherAttempt() (below) makes the retry loop check real
//      remaining budget before burning another ~100s attempt that can't
//      finish in time, falling back to the existing buildSkipMemo/timeout
//      paths instead of risking a hard platform kill after every upstream
//      API call has already been paid for. Single-attempt worst case is
//      now ~75s signals + ~85s consumer intelligence (broadened re-fetch
//      absorbed into that window) + ~100s generation + overhead ≈ 260s,
//      comfortably under both this ceiling and the platform's 300s; the
//      budget guard ensures a 2nd/3rd attempt only ever starts when it can
//      actually finish within 285s.
export const maxDuration = 285

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Single source of truth for which model generated this memo's narrative —
// used both in the actual API call below AND in the persisted
// analyses.model_version field, so the two can never silently drift apart
// (the DB column previously had its own independent default value that the
// application code never referenced or kept in sync).
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

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

// ── Category-Creation-Candidate query broadening ─────────────────────────
// Same generic-tail-stripping idea already used independently inside
// lib/keyword-engine/dataforseo.ts and lib/signal-engine/providers/
// tiktok.ts, generalized here to the whole query string for the
// Category-Creation diagnostic rather than one provider's own retry list.
const GENERIC_TAIL_WORDS = new Set([
  'supplement', 'supplements', 'support', 'relief', 'formula', 'gummies',
  'capsules', 'powder', 'serum', 'cream', 'women', 'men', 'kids',
])

function broadenQuery(query: string): string | null {
  const lower = query.toLowerCase().trim()
  const words = lower.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return null

  // Drop anything after a "for"/"with" clause — that's almost always the
  // specific audience/use-case modifier, not the underlying category.
  const clauseIdx = words.findIndex(w => w === 'for' || w === 'with')
  const base = clauseIdx > 0 ? words.slice(0, clauseIdx) : words

  const stripped = [...base]
  while (stripped.length > 1 && GENERIC_TAIL_WORDS.has(stripped[stripped.length - 1])) stripped.pop()

  const broad = stripped.join(' ')
  return broad && broad !== lower ? broad : null
}

// ── Phase 1: Output validation ─────────────────────────────────
// Checks every field required for a complete report. Used by the retry
// loop to decide whether to re-attempt before falling back to buildSkipMemo.

const MAX_GENERATE_ATTEMPTS = 3
// Matches the abortTimer value in the retry loop below — kept as one named
// constant so the budget check and the actual timer can't silently drift
// apart from each other.
const ANTHROPIC_ATTEMPT_TIMEOUT_MS = 100_000
// Score computation, DB writes, news/keyword finalization after the loop —
// a conservative, real estimate of the non-Anthropic work still left once
// a memo is accepted, not a guess pulled from nowhere.
const POST_GENERATION_OVERHEAD_MS  = 15_000

// True only when there's real remaining budget (under this route's own
// maxDuration, documented above) for one more full Anthropic attempt plus
// the work that still has to happen after it — never just "attempts left."
function hasTimeForAnotherAttempt(requestStart: number): boolean {
  const elapsed = Date.now() - requestStart
  return elapsed + ANTHROPIC_ATTEMPT_TIMEOUT_MS + POST_GENERATION_OVERHEAD_MS < maxDuration * 1000
}

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
  // Latency budget guard (2026-06-28): the maxDuration comment above already
  // documents a worst case of ~270s assuming exactly ONE Anthropic attempt —
  // it never accounted for MAX_GENERATE_ATTEMPTS retries, each with its own
  // 100s abort timer, or the Category-Creation-Candidate re-fetch added this
  // session. Two attempts alone (~75s signals + ~85s consumer intelligence +
  // 200s for 2 Anthropic calls) already exceeds both this route's 285s
  // maxDuration and the platform's hard 300s ceiling — a real risk of paying
  // for every upstream API call and still getting hard-killed with nothing
  // delivered. requestStart lets the retry loop below check real remaining
  // budget before burning another ~100s on a retry that can't finish in time,
  // falling back to the existing buildSkipMemo/timeout-response paths
  // instead — never a redesign of the retry logic, just an earlier, safer
  // exit when the budget is already gone.
  const requestStart = Date.now()
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
  const needsRelevanceCheck = !fromDiscovery && !wasAutoClassified
  if (needsRelevanceCheck && !(await module.isRelevantQuery(input.trim()))) {
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
  // ROOT CAUSE FIX (2026-06-28, "Monthly Search Volume often shows no data"
  // investigation): this outer race ceiling (8s) was SHORTER than
  // lib/keyword-engine/dataforseo.ts's own internal per-attempt
  // AbortSignal.timeout(12_000) — a real, in-flight DataForSEO call that
  // was about to succeed could be discarded by this outer timeout before
  // it ever got the chance to. Now also has to cover up to 3 sequential
  // retry candidates (exact phrase, "for X" clause stripped, generic-tail
  // stripped) after today's broadening fix, not just one. 25s comfortably
  // covers that and costs nothing on the overall request's critical path —
  // this runs concurrently with the 75s signalPromise above, not after it.
  const keywordPromise = keywordEngine.fetch(input.trim(), 25_000).catch(() => null)
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

  // ── Category-Creation-Candidate diagnostic ───────────────────────────────
  // Frozen architecture (2026-06-28): when the specific query shows no real
  // demand data at all, check whether a broader version of the same query
  // does — reusing the exact generic-tail-stripping technique already used
  // by lib/keyword-engine/dataforseo.ts and lib/signal-engine/providers/
  // tiktok.ts, generalized to the whole query rather than one provider's
  // own retry candidates. A bounded, short second fetch — this never blocks
  // the main path beyond its own timeout, and only runs at all when the
  // specific query's demand data is genuinely absent, not merely weak.
  const specificDemandLooksAbsent =
    !keywordIntelligence?.top_buying?.[0]?.monthly_searches && !signals?.demand && !signals?.growth

  // Latency: this re-fetch and Consumer Intelligence below have no data
  // dependency on each other (Consumer Intelligence only needs
  // topCompetitors, already available from `signals` above) — they
  // previously ran sequentially purely by accident of code order, adding
  // up to ~20s of pure waste on top of an already-tight overall budget (see
  // maxDuration comment). Built as a promise here, awaited together with
  // consumerIntelligencePromise below instead of immediately.
  const broadQueryEvidencePromise: Promise<MemoData['category_creation_broad_evidence']> =
    (async () => {
      if (!specificDemandLooksAbsent) return undefined
      const broadQuery = broadenQuery(input.trim())
      if (!broadQuery) return undefined
      const [broadSignals, broadKeyword] = await Promise.all([
        signalEngine.fetch({ query: broadQuery, categoryId: module.id }, 20_000).catch(() => null),
        // Same outer-timeout fix as the main keywordPromise above — was 8s,
        // shorter than dataforseo.ts's own internal 12s per-attempt ceiling.
        keywordEngine.fetch(broadQuery, 20_000).catch(() => null),
      ])
      if (!broadSignals && !broadKeyword) return undefined
      console.log('Category-Creation-Candidate: broad-query evidence fetched', {
        specificQuery: input.trim(), broadQuery,
        broadHasSignals: !!broadSignals, broadHasKeyword: !!broadKeyword,
      })
      return { broadQuery, signal_evidence: broadSignals ?? undefined, keyword_intelligence: broadKeyword ?? undefined }
    })()

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
  const consumerIntelligencePromise = topCompetitors?.length
    ? analyzeConsumerIntelligence(topCompetitors, input.trim()).catch((e: unknown) => {
        console.error('Consumer Intelligence failed', { error: e instanceof Error ? e.message : e })
        return null
      })
    : Promise.resolve(null)

  const [broadQueryEvidence, consumerIntelligence] = await Promise.all([
    broadQueryEvidencePromise,
    consumerIntelligencePromise,
  ])

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
    const abortTimer = setTimeout(() => controller.abort(), ANTHROPIC_ATTEMPT_TIMEOUT_MS)
    let rawText = ''

    try {
      const msg = await ai.messages.create(
        {
          model:      ANTHROPIC_MODEL,
          max_tokens: 3500,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: userMessage }],
        },
        { signal: controller.signal },
      )
      clearTimeout(abortTimer)
      // TEMP AUDIT INSTRUMENTATION (2026-06-28) — discovery already logs its
      // own token usage; the main generate call never has. Added to answer
      // "is token usage efficient" with real numbers during the full-engine
      // audit. Flag for removal-or-keep decision after the audit — not left
      // in silently either way.
      console.log('Generate: Anthropic usage', {
        attempt, model: ANTHROPIC_MODEL,
        input_tokens:  msg.usage?.input_tokens,
        output_tokens: msg.usage?.output_tokens,
      })
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
        console.error(`Anthropic timeout after ${ANTHROPIC_ATTEMPT_TIMEOUT_MS / 1000}s (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS})`)
        if (attempt < MAX_GENERATE_ATTEMPTS && hasTimeForAnotherAttempt(requestStart)) continue
        return err('Analysis timed out — no slot used. Please try again.', 504)
      }
      // ROOT CAUSE (found 2026-06-29 live, real Anthropic credit
      // exhaustion mid-session): this used to return one blanket "AI
      // service error" for every failure type. handleProviderError()
      // still logs the full technical detail server-side, but now
      // differentiates the user-facing message (credits vs rate limit vs
      // outage vs auth) instead of a single undifferentiated bucket.
      const message = handleProviderError(e, { route: '/api/generate', attempt, category: input.trim() })
      return err(`${message} (no slot used)`, 500)
    }

    // ── Parse ──────────────────────────────────────────────────
    let parsed: MemoData
    try {
      parsed = parseJSON(rawText)
    } catch {
      console.error(`JSON parse error (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS})`, {
        categoryId: module.id, raw_length: rawText.length, snippet: rawText.slice(0, 300),
      })
      if (attempt < MAX_GENERATE_ATTEMPTS && hasTimeForAnotherAttempt(requestStart)) continue
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
      if (attempt < MAX_GENERATE_ATTEMPTS && hasTimeForAnotherAttempt(requestStart)) continue
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
    // Persisted, not passed as an argument — see MemoData.
    // category_creation_broad_evidence and lib/scoring.ts header comment:
    // every later call to computeGroundedScore(memo) (e.g. from
    // components/MemoDisplay.tsx on a future render) must see the exact
    // same broad-query evidence used here, or the displayed score could
    // diverge from what was actually saved.
    if (broadQueryEvidence) memo.category_creation_broad_evidence = broadQueryEvidence
    const grounded = computeGroundedScore(memo)
    memo.opportunity_score = grounded.score
    memo.build_decision    = grounded.decision
    // Stamped so this score can always be traced to the exact formula that
    // produced it — see lib/scoring.ts SCORING_ENGINE_VERSION header comment.
    memo.scoring_version   = SCORING_ENGINE_VERSION
    // Deterministic replacement for the model's invented ten_k/hundred_k/
    // one_m probabilities (no longer requested in the prompt) — see
    // lib/scoring.ts computeTractionBand.
    if (memo.financial_projections) {
      memo.financial_projections.traction_band = computeTractionBand(memo)
    }

    // Server-side consistency check (lib/consistency.ts) — logged for
    // visibility now; the same check re-runs in the UI (ConsistencyFlagsPanel)
    // since it's a pure function of the same persisted memo fields.
    const flags = checkConsistency(memo, grounded.decision)
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
  // See shouldConsumeSlot() above for the root-cause story.
  if (shouldConsumeSlot(skipReason, devUnlimited)) {
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
      scoring_version:     memo.scoring_version ?? null,
      // Explicit, not relying on the DB column's own default — see
      // ANTHROPIC_MODEL above. Every code path that reaches this insert
      // (including the buildSkipMemo fallback for an unparseable/incomplete
      // response) already made a real call to this model; the model
      // attribution is accurate even when the output itself was discarded.
      model_version:       ANTHROPIC_MODEL,
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

  // Upsert leaderboard — atomic at the DB layer (supabase/migrations/
  // 008_atomic_leaderboard_upsert.sql). HARDENING FIX (2026-06-28): the
  // previous read-then-update here was a real race — two concurrent
  // analyses of the same category_name could both read the same row, then
  // each write back against stale data, losing one update or under-
  // counting analysis_count. A single INSERT ... ON CONFLICT DO UPDATE is
  // serialized at the row level by Postgres, so every concurrent caller
  // sees a consistent view; the "is this score from a comparable formula
  // version, and is it actually better" decision now happens inside that
  // same atomic statement instead of in application code between two
  // separate round-trips.
  const { error: leaderboardErr } = await sb.rpc('upsert_leaderboard_entry', {
    p_category_name:      memo.category_name,
    p_opportunity_score:  memo.opportunity_score,
    p_build_decision:     memo.build_decision,
    p_scoring_version:    memo.scoring_version ?? null,
    p_biggest_competitor: memo.biggest_competitor?.name ?? null,
    p_market_size:        memo.market_size             ?? null,
    p_best_analysis_id:   analysis.id,
  })
  if (leaderboardErr) {
    // Non-fatal: the analysis itself already saved successfully above —
    // a leaderboard-display hiccup shouldn't fail the whole request.
    console.error('Leaderboard upsert failed', leaderboardErr)
  }

  return NextResponse.json({ analysisId: analysis.id, memo })
}
