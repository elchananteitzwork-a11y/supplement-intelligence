/**
 * Production Validation — Task 7
 * Runs the complete end-to-end pipeline for two selected products:
 *   1. Berberine HCL for blood sugar and GLP-1 support
 *   2. Creatine monohydrate for women
 *
 * Uses claude-haiku-4-5-20251001 (not Sonnet) for cost efficiency.
 * Writes to DB via service role key — no browser auth required.
 *
 * Run: npx tsx --env-file=.env.local scripts/validate_production.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

import { signalEngine }    from '@/lib/signal-engine'
import { keywordEngine, enrichKeywordIntelligence, explainKeywordIntelligence } from '@/lib/keyword-engine'
import { fetchManufacturingEstimate } from '@/lib/manufacturing-engine'
import { buildNewsIntelligence } from '@/lib/news-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import { computeGroundedScore, computeTractionBand, SCORING_ENGINE_VERSION } from '@/lib/scoring'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import type { MemoData, SignalMetadata } from '@/types/index'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Use Haiku for cost efficiency (~10× cheaper than Sonnet)
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

const PRODUCTS = [
  {
    input:    'Berberine HCL for blood sugar and GLP-1 support',
    rationale: 'GLP-1/Ozempic companion trend, strong TikTok momentum, clear pain points, manufacturable capsule',
  },
  {
    input:    'Creatine monohydrate for women',
    rationale: 'Massive TikTok-driven demand spike, differentiated from generic creatine, commodity ingredient',
  },
]

// ── Colour helpers ──────────────────────────────────────────────────────────
const G = (s: string) => `\x1b[32m${s}\x1b[0m`
const R = (s: string) => `\x1b[31m${s}\x1b[0m`
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`
const B = (s: string) => `\x1b[1m${s}\x1b[0m`

function tick(ok: boolean, label: string, detail = '') {
  const icon = ok ? G('✓') : R('✗')
  console.log(`  ${icon} ${label}${detail ? ': ' + detail : ''}`)
}

// ── Minimal memo validator (matches route.ts logic) ────────────────────────
function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return !isNaN(v)
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

function validateMemo(memo: MemoData): string[] {
  const m: string[] = []
  if (!isNonEmpty(memo.category_name))     m.push('category_name')
  if (!isNonEmpty(memo.executive_summary)) m.push('executive_summary')
  if (!isNonEmpty(memo.build_decision))    m.push('build_decision')
  if (typeof memo.opportunity_score !== 'number') m.push('opportunity_score')
  if (!isNonEmpty(memo.market_size))       m.push('market_size')
  for (const d of ['demand','virality','subscription','manufacturing'] as const) {
    if (!isNonEmpty(memo.scores?.[d]?.level)) m.push(`scores.${d}.level`)
  }
  if (!memo.market_saturation) m.push('market_saturation')
  if (!Array.isArray(memo.market_gaps) || memo.market_gaps.filter(isNonEmpty).length < 3) m.push('market_gaps')
  if (!memo.customer_language?.frustrations?.length) m.push('customer_language.frustrations')
  const pr = memo.product_recommendation
  if (!pr || !isNonEmpty(pr.format) || !isNonEmpty(pr.retail_price)) m.push('product_recommendation')
  return m
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

// ── Get any real user_id from profiles (service-role, bypasses RLS) ─────────
async function getAnyUserId(): Promise<string> {
  const { data, error } = await sb.from('profiles').select('id').limit(1).maybeSingle()
  if (error || !data?.id) throw new Error(`No user found in profiles: ${error?.message}`)
  return data.id
}

// ── Per-product run ─────────────────────────────────────────────────────────
interface ProductResult {
  input:       string
  rationale:   string
  categoryId:  string
  score:       number
  decision:    string
  providers:   {
    signals:      string[] | null
    keyword:      string | null
    manufacturing: boolean
    news:         boolean
    consumer:     boolean
  }
  manufacturingCOGS:  string | null
  failedProviders:    string[]
  missingMemoFields:  string[]
  analysisId:         string | null
  errors:             string[]
  dimensions:         { key: string; rawScore: number | null; weight: number; sourceLabel: string }[]
  durationMs:         number
}

async function runProduct(input: string, rationale: string): Promise<ProductResult> {
  const t0 = Date.now()
  console.log(B(`\n${'═'.repeat(60)}`))
  console.log(B(`  ${input}`))
  console.log(`  ${Y(rationale)}`)
  console.log(B('═'.repeat(60)))

  const result: ProductResult = {
    input, rationale, categoryId: '', score: 0, decision: '',
    providers: { signals: null, keyword: null, manufacturing: false, news: false, consumer: false },
    manufacturingCOGS: null, failedProviders: [], missingMemoFields: [],
    analysisId: null, errors: [], dimensions: [], durationMs: 0,
  }

  // ── 1. Category routing ───────────────────────────────────────────────────
  console.log('\n[1] Category routing')
  const categoryId = await classifyQuery(input).catch(() => 'supplements')
  const module = categoryRegistry.resolve(categoryId)
  result.categoryId = categoryId
  tick(true, `Classified as "${categoryId}" (${module.name})`)

  // ── 2. Parallel provider fetches ────────────────────────────────────────
  console.log('\n[2] Provider fetches (parallel)')

  const [signals, keywordIntelligence, manufacturingEstimate, newsIntelligence] = await Promise.all([
    signalEngine.fetch({ query: input, categoryId: module.id }, 75_000).catch((e: unknown) => {
      result.errors.push(`signalEngine: ${e instanceof Error ? e.message : e}`)
      return null
    }),
    keywordEngine.fetch(input, 25_000).catch((e: unknown) => {
      result.errors.push(`keywordEngine: ${e instanceof Error ? e.message : e}`)
      return null
    }),
    fetchManufacturingEstimate({ product: input, category: module.id }, 30_000).catch((e: unknown) => {
      result.errors.push(`manufacturing: ${e instanceof Error ? e.message : e}`)
      return null
    }),
    buildNewsIntelligence(input, module.id, module.name, 20_000).catch((e: unknown) => {
      result.errors.push(`news: ${e instanceof Error ? e.message : e}`)
      return undefined
    }),
  ])

  // Signal engine results
  if (signals) {
    result.providers.signals = signals.providers_used
    result.failedProviders = signals.failed_providers ?? []
    tick(true, 'Signal Engine', `${signals.providers_used.join(', ')} — conf=${signals.overall_confidence}`)
    if (signals.demand)      tick(true,  '  demand',   `score=${signals.demand.value.score}`)
    if (signals.virality)    tick(true,  '  virality', `score=${signals.virality.value.score}`)
    if (signals.competition) tick(true,  '  market accessibility', `score=${signals.competition.value.score}`)
    if (signals.pricing)     tick(true,  '  pricing',  `avg_price=$${(signals.pricing.value as {avg_price?: number}).avg_price}`)
    if (result.failedProviders.length) tick(false, `  failed providers`, result.failedProviders.join(', '))
  } else {
    tick(false, 'Signal Engine (no data)')
  }

  // Keyword engine results
  if (keywordIntelligence) {
    result.providers.keyword = keywordIntelligence.provider
    const top = keywordIntelligence.top_buying?.[0]
    tick(true, 'DataForSEO', `provider=${keywordIntelligence.provider}`)
    tick(!!top, `  top keyword`, top ? `"${top.keyword}" — ${top.monthly_searches?.toLocaleString()}/mo, CPC=$${top.cpc ?? 'n/a'}` : 'none')
    tick(true, `  buckets`, `opp=${keywordIntelligence.opportunity?.length ?? 0}, long_tail=${keywordIntelligence.long_tail?.length ?? 0}`)
    if (keywordIntelligence.relevance_rejected) {
      tick(false, `  relevance guard rejected top`, `"${keywordIntelligence.relevance_rejected.keyword}" — ${keywordIntelligence.relevance_rejected.reason}`)
    }
  } else {
    tick(false, 'DataForSEO (no data)')
  }

  // Manufacturing results
  if (manufacturingEstimate) {
    result.providers.manufacturing = true
    const rc = manufacturingEstimate.realistic_unit_cost
    const costStr = rc ? `$${rc.low}–$${rc.high}` : 'absent (< 3 paired MOQ+price listings)'
    result.manufacturingCOGS = rc ? costStr : null
    tick(true, 'Alibaba/Apify Manufacturing',
      `suppliers=${manufacturingEstimate.supplier_count?.estimate ?? '?'}, conf=${manufacturingEstimate.confidence_label}`)
    tick(!!rc, `  realistic_unit_cost`, costStr)
    tick(!!manufacturingEstimate.lead_time_days, '  lead_time_days',
      manufacturingEstimate.lead_time_days ? `${manufacturingEstimate.lead_time_days.low}–${manufacturingEstimate.lead_time_days.high} days` : 'absent')
  } else {
    tick(false, 'Alibaba/Apify Manufacturing (no data)')
  }

  // News intelligence results
  if (newsIntelligence) {
    result.providers.news = true
    const itemCount = newsIntelligence.items?.length ?? 0
    tick(true, 'News Intelligence', `${itemCount} items, failed=[${newsIntelligence.failedProviders?.join(', ') ?? 'none'}]`)
    if (newsIntelligence.items?.length) {
      for (const item of newsIntelligence.items.slice(0, 3)) {
        tick(true, `  item [${item.provider}]`, `"${item.headline?.slice(0, 60)}..."`)
      }
    }
  } else {
    tick(false, 'News Intelligence (no data)')
  }

  // ── 3. Consumer Intelligence ───────────────────────────────────────────
  console.log('\n[3] Consumer Intelligence')
  const topCompetitors = signals?.review_velocity?.value.top_competitors
  const tiktokHashtag  = signals?.virality?.value?.hashtag as string | undefined
  let consumerIntelligence = null

  if (topCompetitors?.length || tiktokHashtag) {
    consumerIntelligence = await analyzeConsumerIntelligence(
      topCompetitors ?? [], input, tiktokHashtag,
    ).catch((e: unknown) => {
      result.errors.push(`consumerIntelligence: ${e instanceof Error ? e.message : e}`)
      return null
    })
  } else {
    console.log(Y('  Skipped — no competitor ASINs or TikTok hashtag from signals'))
  }

  if (consumerIntelligence) {
    result.providers.consumer = true
    tick(true, 'Consumer Intelligence',
      `reviews=${consumerIntelligence.totalReviewsCollected}, products=${consumerIntelligence.productsAnalyzed?.length ?? 0}`)
    tick(true, `  negative themes`, `${consumerIntelligence.negativeThemes?.length ?? 0}`)
    tick(true, `  feature requests`, `${consumerIntelligence.featureRequests?.length ?? 0}`)
    const catGaps = consumerIntelligence.categoryGapThemes?.length ?? 0
    tick(catGaps > 0, `  category gap themes`, `${catGaps}`)
  } else {
    tick(false, 'Consumer Intelligence (no data)')
  }

  // ── 4. Keyword enrichment ──────────────────────────────────────────────
  const enrichedKI = keywordIntelligence
    ? enrichKeywordIntelligence(keywordIntelligence, {
        competitorBrands:   topCompetitors?.map(c => c.brand) ?? [],
        realBenefitPhrases: consumerIntelligence
          ? [...(consumerIntelligence.positiveThemes ?? []), ...(consumerIntelligence.featureRequests ?? [])].map(t => t.label)
          : [],
      })
    : null

  // ── 5. Build system prompt & call Claude (Haiku for cost) ──────────────
  console.log(`\n[4] Claude generation (${HAIKU_MODEL})`)
  const systemPrompt = signals
    ? module.buildSignalAugmentedPrompt(module.analysisSystemPrompt, input, signals, consumerIntelligence)
    : module.analysisSystemPrompt

  const userMessage = `${module.name} idea: "${input}"`
  let memo: MemoData | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await ai.messages.create({
        model:      HAIKU_MODEL,
        max_tokens: 3000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      })
      tick(true, `Anthropic ${HAIKU_MODEL}`,
        `in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens} tokens`)

      const rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
      memo = parseJSON(rawText)

      const missing = validateMemo(memo)
      if (missing.length > 0) {
        tick(false, `Memo validation (attempt ${attempt})`, `missing: ${missing.join(', ')}`)
        if (attempt < 2) continue
        result.missingMemoFields = missing
      } else {
        tick(true, `Memo validation`, 'all required fields present')
      }
      break
    } catch (e) {
      tick(false, `Claude attempt ${attempt}`, e instanceof Error ? e.message : String(e))
      if (attempt >= 2) { result.errors.push(`claude: ${e}`); break }
    }
  }

  if (!memo) {
    result.errors.push('Claude generation failed — cannot proceed to scoring')
    result.durationMs = Date.now() - t0
    return result
  }

  // ── 6. Attach all provider data ────────────────────────────────────────
  console.log('\n[5] Attaching provider data to memo')
  if (signals) {
    memo.signal_evidence  = signals
    memo.signal_metadata  = {
      providers_used:     signals.providers_used,
      overall_confidence: signals.overall_confidence,
      demand_verified:    !!(signals.demand || signals.growth),
      virality_verified:  !!signals.virality,
      pricing_verified:   !!signals.pricing,
      growth_verified:    !!signals.growth,
      market_verified:    !!signals.competition,
      consumer_intelligence_attempted: !!topCompetitors?.length,
    } satisfies SignalMetadata
    tick(true, 'signal_evidence attached')
  }
  if (enrichedKI) {
    const aiInsights = await explainKeywordIntelligence(enrichedKI, input, module.name).catch(() => null)
    memo.keyword_intelligence = aiInsights ? { ...enrichedKI, ai_insights: aiInsights } : enrichedKI
    tick(true, 'keyword_intelligence attached', `ai_insights=${!!aiInsights}`)
  }
  if (consumerIntelligence) { memo.consumer_intelligence = consumerIntelligence; tick(true, 'consumer_intelligence attached') }
  if (manufacturingEstimate) { memo.manufacturing_estimate = manufacturingEstimate; tick(true, 'manufacturing_estimate attached') }
  if (newsIntelligence)  { memo.news_intelligence  = newsIntelligence;  tick(true, 'news_intelligence attached') }
  memo.product_query = input

  // ── 7. Scoring ─────────────────────────────────────────────────────────
  console.log('\n[6] Scoring Engine v' + SCORING_ENGINE_VERSION)
  const grounded = computeGroundedScore(memo)
  memo.opportunity_score = grounded.score
  memo.build_decision    = grounded.decision
  memo.scoring_version   = SCORING_ENGINE_VERSION
  if (memo.financial_projections) {
    memo.financial_projections.traction_band = computeTractionBand(memo)
  }

  result.score    = grounded.score
  result.decision = grounded.decision
  result.dimensions = grounded.dimensions.map(d => ({
    key:         d.key,
    rawScore:    d.rawScore ?? null,
    weight:      d.weight,
    sourceLabel: d.sourceLabel,
  }))

  console.log(`  ${B('Score:')} ${grounded.score}/100   ${B('Decision:')} ${grounded.decision}`)
  for (const d of grounded.dimensions) {
    const scored = d.rawScore != null
    const raw = d.rawScore != null ? `${d.rawScore.toFixed(1)}/10` : 'qualitative'
    const wt  = `${Math.round(d.weight * 100)}%`
    tick(scored, `  ${d.label} (${wt})`, `${raw} — ${d.sourceLabel}`)
  }

  // ── 8. Safety gate ─────────────────────────────────────────────────────
  console.log('\n[7] Safety gate')
  const safetyDriven = grounded.decision !== 'BUILD_NOW' && grounded.decision !== 'VALIDATE_FURTHER'
    && grounded.decision !== 'SKIP' && grounded.decision !== 'CATEGORY_CREATION_CANDIDATE'
  const hasNews = !!memo.news_intelligence
  tick(hasNews, 'News intelligence present (required for safety gate)', hasNews ? 'OK' : 'MISSING — gate defaults to VALIDATE_FURTHER')
  tick(!memo.news_intelligence?.failedProviders?.includes('openfda'), 'openFDA not in failedProviders')

  // ── 9. DB persistence ─────────────────────────────────────────────────
  console.log('\n[8] Database persistence')
  const userId = await getAnyUserId().catch(() => null)
  if (!userId) {
    tick(false, 'DB write', 'no user_id found in profiles')
    result.errors.push('db: no user_id')
  } else {
    const { data: analysis, error: dbErr } = await sb
      .from('analyses')
      .insert({
        user_id:             userId,
        raw_input:           input,
        category_name:       memo.category_name,
        target_audience:     null,
        price_point:         null,
        score_demand:        memo.scores.demand?.score        ?? null,
        score_competition:   null,
        score_virality:      memo.scores.virality?.score      ?? null,
        score_subscription:  memo.scores.subscription?.score  ?? null,
        score_manufacturing: memo.scores.manufacturing?.score ?? null,
        opportunity_score:   memo.opportunity_score,
        build_decision:      memo.build_decision,
        scoring_version:     memo.scoring_version ?? null,
        model_version:       HAIKU_MODEL,
        build_verdict:       null,
        memo_data:           memo,
        biggest_competitor:  memo.biggest_competitor?.name    ?? null,
        market_size:         memo.market_size                 ?? null,
        gross_margin:        memo.gross_margin                ?? null,
        generation_ms:       Date.now() - t0,
      })
      .select('id')
      .single()

    if (dbErr) {
      tick(false, 'DB write', dbErr.message)
      result.errors.push(`db: ${dbErr.message}`)
    } else {
      result.analysisId = analysis.id
      tick(true, 'DB write — analyses table', `id=${analysis.id}`)

      // Also upsert leaderboard
      const { error: lbErr } = await sb.rpc('upsert_leaderboard_entry', {
        p_category_name:      memo.category_name,
        p_opportunity_score:  memo.opportunity_score,
        p_build_decision:     memo.build_decision,
        p_scoring_version:    memo.scoring_version ?? null,
        p_biggest_competitor: memo.biggest_competitor?.name ?? null,
        p_market_size:        memo.market_size             ?? null,
        p_best_analysis_id:   analysis.id,
      })
      tick(!lbErr, 'Leaderboard upsert', lbErr ? lbErr.message : 'OK')
    }
  }

  result.durationMs = Date.now() - t0
  return result
}

// ── Final report ───────────────────────────────────────────────────────────
async function main() {
  console.log(B('\n🧪 PRODUCTION VALIDATION — End-to-End Pipeline Test'))
  console.log(`Scoring Engine: v${SCORING_ENGINE_VERSION}`)
  console.log(`AI Model: ${HAIKU_MODEL} (cost-optimised for validation)`)
  console.log(`Time: ${new Date().toISOString()}`)

  const results: ProductResult[] = []
  for (const { input, rationale } of PRODUCTS) {
    results.push(await runProduct(input, rationale))
  }

  console.log(B('\n\n' + '═'.repeat(60)))
  console.log(B('  PRODUCTION VALIDATION REPORT'))
  console.log(B('═'.repeat(60)))

  for (const r of results) {
    const decisionColour = r.decision === 'BUILD_NOW' ? G : r.decision === 'VALIDATE_FURTHER' ? Y : R
    console.log(`\n${B('Product:')} ${r.input}`)
    console.log(`  Rationale: ${r.rationale}`)
    console.log(`  Category:  ${r.categoryId}`)
    console.log(`  Score:     ${B(String(r.score) + '/100')}`)
    console.log(`  Decision:  ${decisionColour(r.decision)}`)
    console.log(`  Duration:  ${(r.durationMs / 1000).toFixed(1)}s`)
    console.log(`  Analysis:  ${r.analysisId ?? R('NOT SAVED')}`)

    console.log(`\n  Providers:`)
    tick(!!r.providers.signals, 'Signal Engine (Keepa + TikTok + Google Trends)', r.providers.signals?.join(', ') ?? 'none')
    tick(!!r.providers.keyword, 'DataForSEO', r.providers.keyword ?? 'none')
    tick(r.providers.manufacturing, 'Alibaba/Apify Manufacturing')
    tick(r.providers.news,     'News Intelligence')
    tick(r.providers.consumer, 'Consumer Intelligence')

    console.log(`\n  Alibaba COGS contribution: ${r.manufacturingCOGS ?? Y('absent — COGS Margin excluded from Profitability')}`)

    if (r.failedProviders.length) {
      console.log(`  Failed providers: ${R(r.failedProviders.join(', '))} — degraded gracefully`)
    }
    if (r.missingMemoFields.length) {
      console.log(`  Missing memo fields: ${R(r.missingMemoFields.join(', '))}`)
    }
    if (r.errors.length) {
      for (const e of r.errors) console.log(`  ${R('Error:')} ${e}`)
    }

    console.log(`\n  Dimension breakdown:`)
    for (const d of r.dimensions) {
      const wt = `${Math.round(d.weight * 100)}%`
      const score = d.rawScore != null ? `${d.rawScore.toFixed(1)}/10` : Y('qualitative')
      const verified = d.rawScore != null
      tick(verified, `${d.key} (${wt})`, `${score} — ${d.sourceLabel}`)
    }
  }

  console.log(B('\n\n  Overall Assessment'))
  const allReady = results.every(r => r.score > 0 && !r.errors.filter(e => e.startsWith('claude')).length)
  const allSaved = results.every(r => !!r.analysisId)
  tick(allReady, 'Pipeline executes end-to-end without fatal errors')
  tick(allSaved, 'All analyses persisted to database')
  tick(results.every(r => r.providers.manufacturing), 'Alibaba manufacturing data retrieved')
  tick(results.every(r => r.providers.news), 'News Intelligence populated')
  tick(results.every(r => !!r.providers.signals), 'Signal Engine populated')
  tick(results.every(r => !!r.providers.keyword), 'DataForSEO populated')
  tick(results.some(r => !!r.manufacturingCOGS), 'COGS Margin sub-signal triggered (realistic_unit_cost present)')
  tick(results.every(r => r.failedProviders.length === 0 || r.score > 0), 'Graceful degradation: score computed despite provider failures')

  const openBeta = allReady && allSaved && results.some(r => r.score >= 50)
  console.log(`\n  ${openBeta ? G('✓') : R('✗')} ${B('Ready for closed beta:')} ${openBeta ? G('YES') : R('NO — see issues above')}`)
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
