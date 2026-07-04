/**
 * Positive-control end-to-end validation
 *
 * Tests 5 high-potential products through the full pipeline:
 *   1. Category classification
 *   2. Signal engine (Keepa, Google Trends, TikTok, Apify competition)
 *   3. Keyword Intelligence (DataForSEO)
 *   4. Consumer Intelligence (Apify reviews)
 *   5. News Intelligence (openFDA)
 *   6. Anthropic memo generation (Sonnet)
 *   7. Grounded score computation
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local /path/to/validate_e2e.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }    from '@/lib/signal-engine'
import { keywordEngine, enrichKeywordIntelligence } from '@/lib/keyword-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import { computeGroundedScore, computeTractionBand } from '@/lib/scoring'
import { buildNewsIntelligence } from '@/lib/news-engine'
import type { MemoData } from '@/types/index'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

const PRODUCTS = [
  'magnesium L-threonate sleep supplement',
  'creatine HCL gummies',
  'mouth tape for sleep premium',
  'silicone scar tape sensitive skin',
  'red light therapy belt for back pain',
]

function hr(title: string) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(70))
}

function subhr(title: string) {
  console.log(`\n  ${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`  ${'─'.repeat(60)}`)
}

function parseJSON(raw: string): MemoData | null {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return null
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
  if (end === -1) return null
  try { return JSON.parse(s.slice(0, end + 1)) as MemoData } catch { return null }
}

interface ProductResult {
  query:             string
  categoryId:        string
  opportunityScore:  number | null
  verdict:           string
  mainReason:        string
  // Per-signal status
  keepaRevenue:      string | null
  keywordTop:        string | null
  keywordVolume:     number | null
  trendingSignal:    string | null
  tiktokSignal:      string | null
  reviewsCollected:  number | null
  newsItems:         number | null
  memoGenerated:     boolean
  dimensions:        { label: string; score: number | null; source: string }[]
  errorMessage:      string | null
}

async function runProduct(query: string, idx: number): Promise<ProductResult> {
  const t0 = Date.now()
  console.log(`\n[${idx+1}/5] Starting: "${query}"`)

  const result: ProductResult = {
    query, categoryId: '', opportunityScore: null,
    verdict: 'NOT_RUN', mainReason: '',
    keepaRevenue: null, keywordTop: null, keywordVolume: null,
    trendingSignal: null, tiktokSignal: null, reviewsCollected: null,
    newsItems: null, memoGenerated: false, dimensions: [], errorMessage: null,
  }

  try {
    // ── Step 1: Classify ──────────────────────────────────────────
    result.categoryId = await classifyQuery(query)
    console.log(`  Category → ${result.categoryId}`)
    const module = categoryRegistry.resolve(result.categoryId)

    // ── Step 2: Signals + Keywords + News in parallel ─────────────
    console.log('  Fetching signals, keywords, news (parallel)...')
    const [signals, keywordIntelligence, newsIntelligence] = await Promise.all([
      signalEngine.fetch({ query, categoryId: result.categoryId }, 75_000).catch(e => {
        console.error('  [signals ERROR]', e instanceof Error ? e.message : e)
        return null
      }),
      keywordEngine.fetch(query, 25_000).catch(e => {
        console.error('  [keywords ERROR]', e instanceof Error ? e.message : e)
        return null
      }),
      buildNewsIntelligence(query, result.categoryId, module.name, 18_000).catch(e => {
        console.error('  [news ERROR]', e instanceof Error ? e.message : e)
        return null
      }),
    ])

    // Report what came back
    if (signals) {
      const provs = signals.providers_used.join(', ')
      console.log(`  Signals: providers=[${provs}] conf=${Math.round(signals.overall_confidence * 100)}%`)
      if (signals.failed_providers?.length) {
        console.log(`  Signals: failed=[${signals.failed_providers.join(', ')}]`)
      }
      result.keepaRevenue = signals.revenue?.value.est_monthly_revenue ?? null
      result.trendingSignal = signals.demand?.value.primary_signal ?? null
      result.tiktokSignal = signals.virality?.value.hashtag ?? null
      if (result.keepaRevenue) console.log(`  Keepa revenue: ${result.keepaRevenue}`)
      if (result.trendingSignal) console.log(`  Trend signal: ${result.trendingSignal}`)
      if (result.tiktokSignal) console.log(`  TikTok: #${result.tiktokSignal}`)
    } else {
      console.log('  Signals: none returned')
    }

    if (keywordIntelligence?.top_buying?.[0]) {
      const top = keywordIntelligence.top_buying[0]
      result.keywordTop = top.keyword
      result.keywordVolume = top.monthly_searches
      console.log(`  Keywords: top="${top.keyword}" vol=${top.monthly_searches}/mo cpc=$${top.cpc?.toFixed(2) ?? '?'}`)
    } else {
      console.log('  Keywords: no top_buying keyword')
    }

    if (newsIntelligence) {
      result.newsItems = newsIntelligence.items?.length ?? 0
      console.log(`  News: ${result.newsItems} items`)
    }

    // ── Step 3: Consumer Intelligence ────────────────────────────
    const topCompetitors = signals?.review_velocity?.value.top_competitors
    const tiktokHashtag  = signals?.virality?.value?.hashtag as string | undefined
    let consumerIntelligence: MemoData['consumer_intelligence'] = undefined

    if (topCompetitors?.length || tiktokHashtag) {
      console.log(`  Fetching consumer intelligence (${topCompetitors?.length ?? 0} competitors)...`)
      try {
        const ci = await analyzeConsumerIntelligence(
          topCompetitors ?? [], query, tiktokHashtag
        )
        consumerIntelligence = ci ?? undefined
        result.reviewsCollected = consumerIntelligence?.totalReviewsCollected ?? 0
        console.log(`  Consumer intel: ${result.reviewsCollected} reviews, ` +
          `${consumerIntelligence?.negativeThemes?.length ?? 0} neg themes, ` +
          `conf=${Math.round((consumerIntelligence?.confidence ?? 0) * 100)}%`)
      } catch (e) {
        console.error('  [consumer intel ERROR]', e instanceof Error ? e.message : e)
      }
    } else {
      console.log('  Consumer intel: skipped (no competitors found)')
    }

    // ── Step 4: Keyword enrichment ────────────────────────────────
    const enriched = keywordIntelligence
      ? enrichKeywordIntelligence(keywordIntelligence, {
          competitorBrands: topCompetitors?.map(c => c.brand) ?? [],
          realBenefitPhrases: consumerIntelligence
            ? [...consumerIntelligence.positiveThemes, ...consumerIntelligence.featureRequests].map(t => t.label)
            : [],
        })
      : null

    // ── Step 5: Generate memo (Anthropic) ─────────────────────────
    console.log('  Generating memo (Sonnet, ~60-90s)...')
    const systemPrompt = signals
      ? module.buildSignalAugmentedPrompt(module.analysisSystemPrompt, query, signals, consumerIntelligence ?? null)
      : module.analysisSystemPrompt

    const userMessage = `${module.name} idea: "${query}"`
    const controller  = new AbortController()
    const abortTimer  = setTimeout(() => controller.abort(), 100_000)
    let memo: MemoData | null = null

    try {
      const msg = await ai.messages.create(
        { model: MODEL, max_tokens: 3500, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
        { signal: controller.signal },
      )
      clearTimeout(abortTimer)
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      memo = parseJSON(raw)
      if (memo) {
        result.memoGenerated = true
        console.log(`  Memo generated: decision=${memo.build_decision}, scores.demand.level=${memo.scores?.demand?.level}`)
      } else {
        console.error('  [memo] JSON parse failed')
      }
    } catch (e) {
      clearTimeout(abortTimer)
      console.error('  [memo ERROR]', e instanceof Error ? e.message : e)
    }

    // ── Step 6: Compute grounded score ────────────────────────────
    if (memo) {
      // Attach real data (same as generate route)
      if (signals) memo.signal_evidence = signals
      if (enriched) memo.keyword_intelligence = enriched
      if (consumerIntelligence) memo.consumer_intelligence = consumerIntelligence
      if (newsIntelligence) memo.news_intelligence = newsIntelligence

      const grounded = computeGroundedScore(memo)
      result.opportunityScore = grounded.score
      result.verdict          = grounded.decision

      // Main reason: find the lowest-scoring real dimension, or the gate that fired
      const realDims = grounded.dimensions.filter(d => d.rawScore !== undefined && d.weight > 0)
      const weakest  = realDims.length
        ? realDims.sort((a, b) => (a.rawScore ?? 0) - (b.rawScore ?? 0))[0]
        : null

      if (grounded.insufficientEvidence) {
        result.mainReason = 'Insufficient evidence — no real dimensions populated'
      } else if (grounded.decision === 'BUILD_NOW') {
        const strongest = realDims.sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0))[0]
        result.mainReason = strongest
          ? `Strong ${strongest.label} (${strongest.rawScore}/10, source: ${strongest.sourceLabel})`
          : 'Multiple strong signals'
      } else if (grounded.decision === 'VALIDATE_FURTHER') {
        result.mainReason = weakest
          ? `Weak ${weakest.label} (${weakest.rawScore}/10) limits confidence`
          : 'Score 50-64 range'
      } else {
        result.mainReason = weakest
          ? `Low ${weakest.label} (${weakest.rawScore}/10); score=${grounded.score}<50`
          : `Score ${grounded.score} < 50 threshold`
      }

      result.dimensions = grounded.dimensions
        .filter(d => d.weight > 0)
        .map(d => ({ label: d.label, score: d.rawScore ?? null, source: d.sourceLabel }))

      const traction = computeTractionBand(memo)
      console.log(`  Score: ${result.opportunityScore}/100 | Verdict: ${result.verdict} | Traction: ${traction}`)
      console.log(`  Evidence breadth: ${grounded.evidenceBreadth.pct}% (${grounded.evidenceBreadth.distinctChannelTypes} channels)`)
    } else if (!result.memoGenerated) {
      result.verdict    = 'ERROR'
      result.mainReason = 'Memo generation failed — no memo to score'
    }

    const elapsed = Math.round((Date.now() - t0) / 1000)
    console.log(`  ✓ Done in ${elapsed}s`)

  } catch (e) {
    result.errorMessage = e instanceof Error ? e.message : String(e)
    result.verdict = 'ERROR'
    result.mainReason = result.errorMessage
    console.error(`  ✗ Fatal: ${result.errorMessage}`)
  }

  return result
}

// ── Summary table ──────────────────────────────────────────────────────────

function printTable(results: ProductResult[]) {
  hr('VALIDATION SUMMARY TABLE')

  console.log(`
${'Product'.padEnd(42)} ${'Score'.padEnd(7)} ${'Verdict'.padEnd(26)} Main Reason
${'─'.repeat(42)} ${'─'.repeat(7)} ${'─'.repeat(26)} ${'─'.repeat(40)}`)

  for (const r of results) {
    const score   = r.opportunityScore !== null ? `${r.opportunityScore}/100` : 'N/A'
    const verdict = r.verdict.padEnd(26)
    const query   = r.query.slice(0, 41).padEnd(42)
    const reason  = r.mainReason.slice(0, 70)
    console.log(`${query} ${score.padEnd(7)} ${verdict} ${reason}`)
  }

  console.log('')
  subhr('Per-Product Signal Checklist')
  for (const r of results) {
    console.log(`\n  "${r.query}"`)
    console.log(`    Category:       ${r.categoryId}`)
    console.log(`    Keepa Revenue:  ${r.keepaRevenue ?? '✗ no revenue'}`)
    console.log(`    Keyword Top:    ${r.keywordTop ? `${r.keywordTop} (${r.keywordVolume}/mo)` : '✗ none'}`)
    console.log(`    Trends Signal:  ${r.trendingSignal ?? '✗ none'}`)
    console.log(`    TikTok Signal:  ${r.tiktokSignal ? `#${r.tiktokSignal}` : '✗ none'}`)
    console.log(`    Reviews:        ${r.reviewsCollected !== null ? `${r.reviewsCollected} reviews` : '✗ not collected'}`)
    console.log(`    News Items:     ${r.newsItems !== null ? r.newsItems : '✗ none'}`)
    console.log(`    Memo Generated: ${r.memoGenerated ? '✓' : '✗'}`)
    if (r.dimensions.length) {
      console.log(`    Dimensions:`)
      for (const d of r.dimensions) {
        console.log(`      ${d.label.padEnd(32)} ${d.score !== null ? `${d.score}/10` : 'qualitative'} (${d.source})`)
      }
    }
    if (r.errorMessage) console.log(`    Error: ${r.errorMessage}`)
  }

  subhr('Verdict Analysis')
  const buildNow    = results.filter(r => r.verdict === 'BUILD_NOW')
  const validate    = results.filter(r => r.verdict === 'VALIDATE_FURTHER')
  const catCreation = results.filter(r => r.verdict === 'CATEGORY_CREATION_CANDIDATE')
  const skip        = results.filter(r => r.verdict === 'SKIP')
  const errors      = results.filter(r => r.verdict === 'ERROR')

  console.log(`
  BUILD_NOW:                   ${buildNow.length} products
  VALIDATE_FURTHER:            ${validate.length} products
  CATEGORY_CREATION_CANDIDATE: ${catCreation.length} products
  SKIP:                        ${skip.length} products
  ERROR:                       ${errors.length} products`)

  if (buildNow.length + validate.length + catCreation.length === 0) {
    console.log(`
  ⚠  ALL PRODUCTS RETURNED SKIP OR ERROR. Analysis:`)

    // Diagnose the cause
    const noMemo = results.filter(r => !r.memoGenerated)
    const noSignals = results.filter(r => !r.keepaRevenue && !r.keywordVolume)
    const lowScores = results.filter(r => r.opportunityScore !== null && r.opportunityScore < 50)

    if (noMemo.length > 0) {
      console.log(`  [Cause 3] Memo generation failed for ${noMemo.length} products — required data signal missing or API error`)
    }
    if (noSignals.length > 0) {
      console.log(`  [Cause 3] ${noSignals.length} products had no Keepa revenue OR keyword volume → insufficient evidence for scoring`)
    }
    if (lowScores.length > 0) {
      const avgScore = Math.round(lowScores.reduce((s, r) => s + (r.opportunityScore ?? 0), 0) / lowScores.length)
      console.log(`  [Cause 1 or 4] ${lowScores.length} products had score < 50 (avg: ${avgScore}/100) — thresholds may be conservative OR products genuinely weak`)
      console.log(`    Score threshold for SKIP: <50. Score threshold for VALIDATE_FURTHER: 50-64. Score threshold for BUILD_NOW: ≥65.`)

      for (const r of lowScores) {
        const realDims = r.dimensions.filter(d => d.score !== null)
        if (!realDims.length) {
          console.log(`    "${r.query}": 0 real scored dimensions → score driven to 0 by weight re-normalization`)
        } else {
          const avgDim = Math.round(realDims.reduce((s, d) => s + (d.score ?? 0), 0) / realDims.length * 10) / 10
          console.log(`    "${r.query}": ${realDims.length} real dimensions, avg dim score ${avgDim}/10 → opportunity_score ${r.opportunityScore}/100`)
        }
      }
    }
  } else {
    console.log(`\n  ✓ Positive-control check PASSED — at least one product returned BUILD_NOW or VALIDATE_FURTHER`)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  hr('POSITIVE-CONTROL END-TO-END VALIDATION')
  console.log(`  Testing ${PRODUCTS.length} high-potential products`)
  console.log(`  Model: ${MODEL}`)
  console.log(`  Started: ${new Date().toISOString()}`)

  // Run sequentially to avoid hammering APIs concurrently
  // (each product takes 2-3 minutes; parallel would exceed Apify/Keepa rate limits)
  const results: ProductResult[] = []
  for (let i = 0; i < PRODUCTS.length; i++) {
    const r = await runProduct(PRODUCTS[i], i)
    results.push(r)
    // Small pause between products to respect API rate limits
    if (i < PRODUCTS.length - 1) {
      console.log('\n  Pausing 3s between products...')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  printTable(results)

  hr('VALIDATION COMPLETE')
  console.log(`  Finished: ${new Date().toISOString()}`)
}

main().catch(e => {
  console.error('\nFATAL:', e)
  process.exit(1)
})
