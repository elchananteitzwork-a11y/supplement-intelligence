/**
 * Open Discovery Validation
 *
 * Validates the end-to-end discovery + scoring pipeline using only organic
 * discovery — no predefined products, no injected winners.
 *
 * Phase 1: Run the discovery pipeline for all 5 supported categories using
 *          natural, broad queries. Each query returns 20 opportunity cards
 *          with qualitative promise tiers (High / Medium / Low).
 *
 * Phase 2: Select the top 20 candidates by promise tier + position rank.
 *          Run the full scoring pipeline on each (signal engine, keywords,
 *          consumer intelligence, memo generation, grounded scoring).
 *
 * Phase 3: Report — sorted by actual opportunity_score descending.
 *
 * Nothing is modified: no scoring, no thresholds, no prompts, no whitelisting.
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/open_discovery_validation.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { categoryRegistry, classifyQuery } from '@/lib/categories'
import { signalEngine }                   from '@/lib/signal-engine'
import { keywordEngine, enrichKeywordIntelligence } from '@/lib/keyword-engine'
import { analyzeConsumerIntelligence }    from '@/lib/consumer-intelligence'
import { computeGroundedScore }           from '@/lib/scoring'
import { buildNewsIntelligence }          from '@/lib/news-engine'
import type { MemoData, OpportunityCard } from '@/types/index'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SCORING_MODEL  = 'claude-sonnet-4-6'
const DISCOVER_MODEL = 'claude-haiku-4-5-20251001'

// ── Natural discovery queries (one per category) ───────────────────────────
// These are exactly what a real analyst might type into the discovery UI.
const CATEGORY_QUERIES: Array<{ categoryId: string; query: string }> = [
  { categoryId: 'supplements', query: 'health supplements'        },
  { categoryId: 'beauty',      query: 'skincare and beauty'       },
  { categoryId: 'pets',        query: 'pet health and wellness'   },
  { categoryId: 'fitness',     query: 'fitness and recovery'      },
  { categoryId: 'home',        query: 'home and kitchen products' },
]

const PROMISE_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 }

// ══════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function hr(title: string) {
  console.log(`\n${'═'.repeat(74)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(74))
}

function subhr(title: string) {
  console.log(`\n  ${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log(`  ${'─'.repeat(64)}`)
}

function pad(s: string, n: number) { return s.slice(0, n).padEnd(n) }

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1: DISCOVERY
// ══════════════════════════════════════════════════════════════════════════════

interface DiscoveredCard {
  rank:         number          // position within category (1-based)
  categoryId:   string
  categoryName: string
  query:        string          // original discovery query
  card:         OpportunityCard
  // Category-level signal snapshot (real Keepa/TikTok data for the broad category)
  categoryRevenue?: string
  categoryDemand?:  string
  categoryCompetition?: string
}

function parseDiscoveryResponse(raw: string): OpportunityCard[] {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('[')
  if (start < 0) throw new Error('No JSON array in discovery response')
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
  if (end === -1) throw new Error('No complete JSON array in discovery response')
  return JSON.parse(s.slice(0, end + 1)) as OpportunityCard[]
}

function isValidCard(o: unknown): o is OpportunityCard {
  if (!o || typeof o !== 'object') return false
  const c = o as Partial<OpportunityCard>
  return (
    typeof c.name === 'string' && c.name.trim().length > 0 &&
    typeof c.rationale === 'string' && c.rationale.trim().length > 0 &&
    (c.promise === 'High' || c.promise === 'Medium' || c.promise === 'Low') &&
    typeof c.startup_cost_tier === 'string' &&
    typeof c.difficulty === 'string' &&
    typeof c.launch_speed === 'string' &&
    c.scores != null &&
    typeof c.scores.demand?.signal        === 'string' &&
    typeof c.scores.virality?.tiktok      === 'string' &&
    typeof c.scores.subscription?.retention   === 'string' &&
    typeof c.scores.manufacturing?.complexity === 'string'
  )
}

async function runDiscoveryForCategory(
  categoryId: string,
  query: string,
  attempt = 1,
): Promise<DiscoveredCard[]> {
  console.log(`\n  [discover:${categoryId}] "${query}"`)
  const module = categoryRegistry.resolve(categoryId)

  // Fetch category-level signals (real Keepa/TikTok data)
  const signals = await signalEngine
    .fetch({ query, categoryId }, 15_000)
    .catch(() => null)

  if (signals) {
    const provs = signals.providers_used.join(', ')
    console.log(`  [discover:${categoryId}] signals=[${provs}] conf=${Math.round(signals.overall_confidence * 100)}%`)
  }

  // Build signal-augmented discovery prompt
  const systemPrompt = module.buildSignalAugmentedPrompt(
    module.discoverySystemPrompt, query, signals,
  )

  // Call the AI discovery model
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 90_000)
  let rawText = ''
  try {
    const msg = await ai.messages.create(
      {
        model:      DISCOVER_MODEL,
        max_tokens: 16_000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: `${module.name} category: "${query}"` }],
      },
      { signal: controller.signal },
    )
    clearTimeout(abortTimer)
    rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e: unknown) {
    clearTimeout(abortTimer)
    const isAbort = e instanceof Anthropic.APIUserAbortError
    throw new Error(isAbort ? 'Discovery timed out (90s)' : String(e))
  }

  // Parse + validate
  let cards: OpportunityCard[]
  try {
    cards = parseDiscoveryResponse(rawText)
  } catch (e) {
    if (attempt < 2) {
      console.log(`  [discover:${categoryId}] parse failed, retrying...`)
      return runDiscoveryForCategory(categoryId, query, attempt + 1)
    }
    throw e
  }

  const valid = cards.filter(isValidCard).slice(0, 20)
  console.log(`  [discover:${categoryId}] ${valid.length} valid cards (${cards.filter(c => (c as OpportunityCard).promise === 'High').length} High, ${cards.filter(c => (c as OpportunityCard).promise === 'Medium').length} Medium, ${cards.filter(c => (c as OpportunityCard).promise === 'Low').length} Low)`)

  // Map to DiscoveredCard including category signal context
  return valid.map((card, i) => ({
    rank:         i + 1,
    categoryId,
    categoryName: module.name,
    query,
    card,
    categoryRevenue:     signals?.revenue?.value.est_monthly_revenue ?? undefined,
    categoryDemand:      signals?.demand?.value.signal ?? undefined,
    categoryCompetition: signals?.competition?.value.saturation ?? undefined,
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2: FULL SCORING PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

interface ScoredResult {
  discovered:        DiscoveredCard
  opportunityScore:  number | null
  verdict:           string
  mainReason:        string
  // Real signal data
  keepaRevenue:      string | null
  keywordTop:        string | null
  keywordVolume:     number | null
  tiktokSignal:      string | null
  reviewsCollected:  number | null
  competitionLevel:  string | null
  memoGenerated:     boolean
  dimensions:        Array<{ label: string; score: number | null; source: string }>
  errorMessage:      string | null
  elapsedSec:        number
}

function parseMemoJSON(raw: string): MemoData | null {
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

async function runFullScoring(discovered: DiscoveredCard, idx: number, total: number): Promise<ScoredResult> {
  const t0 = Date.now()
  const query = discovered.card.name
  const { categoryId } = discovered

  console.log(`\n  [score ${idx+1}/${total}] "${query}" (${categoryId})`)

  const result: ScoredResult = {
    discovered,
    opportunityScore: null,
    verdict:          'NOT_RUN',
    mainReason:       '',
    keepaRevenue:     null,
    keywordTop:       null,
    keywordVolume:    null,
    tiktokSignal:     null,
    reviewsCollected: null,
    competitionLevel: null,
    memoGenerated:    false,
    dimensions:       [],
    errorMessage:     null,
    elapsedSec:       0,
  }

  try {
    // Use the discovered category rather than re-classifying
    const module = categoryRegistry.resolve(categoryId)

    // ── Signals + Keywords + News ─────────────────────────────────
    const [signals, keywordIntelligence, newsIntelligence] = await Promise.all([
      signalEngine.fetch({ query, categoryId }, 75_000).catch(e => {
        console.error(`    [signals] ${e instanceof Error ? e.message : e}`)
        return null
      }),
      keywordEngine.fetch(query, 25_000).catch(e => {
        console.error(`    [keywords] ${e instanceof Error ? e.message : e}`)
        return null
      }),
      buildNewsIntelligence(query, categoryId, module.name, 18_000).catch(e => {
        console.error(`    [news] ${e instanceof Error ? e.message : e}`)
        return null
      }),
    ])

    if (signals) {
      result.keepaRevenue    = signals.revenue?.value.est_monthly_revenue ?? null
      result.tiktokSignal    = signals.virality?.value?.hashtag as string | null ?? null
      result.competitionLevel = signals.competition?.value.saturation ?? null
      console.log(`    signals=[${signals.providers_used.join(',')}] revenue=${result.keepaRevenue ?? '—'} competition=${result.competitionLevel ?? '—'}`)
    }

    if (keywordIntelligence?.top_buying?.[0]) {
      const top = keywordIntelligence.top_buying[0]
      result.keywordTop    = top.keyword
      result.keywordVolume = top.monthly_searches
      console.log(`    keyword="${top.keyword}" vol=${top.monthly_searches}/mo`)
    }

    // ── Consumer Intelligence ─────────────────────────────────────
    const topCompetitors = signals?.review_velocity?.value.top_competitors
    const tiktokHashtag  = signals?.virality?.value?.hashtag as string | undefined
    let consumerIntelligence: MemoData['consumer_intelligence'] = undefined

    if (topCompetitors?.length || tiktokHashtag) {
      console.log(`    consumer intel (${topCompetitors?.length ?? 0} competitors)...`)
      try {
        const ci = await analyzeConsumerIntelligence(topCompetitors ?? [], query, tiktokHashtag)
        consumerIntelligence = ci ?? undefined
        result.reviewsCollected = consumerIntelligence?.totalReviewsCollected ?? 0
        console.log(`    reviews=${result.reviewsCollected} neg_themes=${consumerIntelligence?.negativeThemes?.length ?? 0}`)
      } catch (e) {
        console.error(`    [ci] ${e instanceof Error ? e.message : e}`)
      }
    }

    // ── Keyword enrichment ────────────────────────────────────────
    const enriched = keywordIntelligence
      ? enrichKeywordIntelligence(keywordIntelligence, {
          competitorBrands:   topCompetitors?.map(c => c.brand) ?? [],
          realBenefitPhrases: consumerIntelligence
            ? [...consumerIntelligence.positiveThemes, ...consumerIntelligence.featureRequests].map(t => t.label)
            : [],
        })
      : null

    // ── Generate memo ─────────────────────────────────────────────
    console.log(`    generating memo (Sonnet)...`)
    const systemPrompt = signals
      ? module.buildSignalAugmentedPrompt(module.analysisSystemPrompt, query, signals, consumerIntelligence ?? null)
      : module.analysisSystemPrompt

    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 100_000)
    let memo: MemoData | null = null

    try {
      const msg = await ai.messages.create(
        { model: SCORING_MODEL, max_tokens: 3500, system: systemPrompt,
          messages: [{ role: 'user', content: `${module.name} idea: "${query}"` }] },
        { signal: controller.signal },
      )
      clearTimeout(abortTimer)
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      memo = parseMemoJSON(raw)
      if (memo) {
        result.memoGenerated = true
        console.log(`    memo generated: ai_decision=${memo.build_decision}`)
      } else {
        console.error(`    memo JSON parse failed`)
      }
    } catch (e) {
      clearTimeout(abortTimer)
      console.error(`    [memo] ${e instanceof Error ? e.message : e}`)
    }

    // ── Grounded scoring ──────────────────────────────────────────
    if (memo) {
      if (signals)                memo.signal_evidence       = signals
      if (enriched)               memo.keyword_intelligence  = enriched
      if (consumerIntelligence)   memo.consumer_intelligence = consumerIntelligence
      if (newsIntelligence)       memo.news_intelligence     = newsIntelligence

      const grounded = computeGroundedScore(memo)
      result.opportunityScore = grounded.score
      result.verdict          = grounded.decision

      const realDims = grounded.dimensions.filter(d => d.rawScore !== undefined && d.weight > 0)
      const sorted   = [...realDims].sort((a, b) => (a.rawScore ?? 0) - (b.rawScore ?? 0))
      const weakest  = sorted[0]
      const strongest = [...realDims].sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0))[0]

      if (grounded.insufficientEvidence) {
        result.mainReason = 'Insufficient evidence — no real dimensions populated'
      } else if (grounded.decision === 'BUILD_NOW') {
        result.mainReason = strongest
          ? `Strong ${strongest.label} (${strongest.rawScore}/10)`
          : 'Multiple strong dimensions'
      } else if (grounded.decision === 'VALIDATE_FURTHER') {
        result.mainReason = weakest
          ? `${weakest.label} (${weakest.rawScore}/10) is the binding constraint`
          : 'Score 50–64 range'
      } else {
        result.mainReason = weakest
          ? `${weakest.label} (${weakest.rawScore}/10) pulls score below 50`
          : `Score ${grounded.score} < 50`
      }

      result.dimensions = grounded.dimensions
        .filter(d => d.weight > 0)
        .map(d => ({ label: d.label, score: d.rawScore ?? null, source: d.sourceLabel }))

      console.log(`    score=${result.opportunityScore}/100 verdict=${result.verdict}`)
    } else {
      result.verdict    = 'ERROR'
      result.mainReason = 'Memo generation failed'
    }

  } catch (e) {
    result.errorMessage = e instanceof Error ? e.message : String(e)
    result.verdict      = 'ERROR'
    result.mainReason   = result.errorMessage
    console.error(`    FATAL: ${result.errorMessage}`)
  }

  result.elapsedSec = Math.round((Date.now() - t0) / 1000)
  return result
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  hr('OPEN DISCOVERY VALIDATION')
  console.log(`
  Strategy:
    Phase 1 — Run the discovery pipeline for every supported category using
              natural broad queries. 20 cards per category (100 total).
    Phase 2 — Select top 20 candidates by promise tier + position.
              Run the full scoring pipeline on each.
    Phase 3 — Report results sorted by actual Opportunity Score.

  Constraints:
    No predefined products. No injected winners. No modified scoring.
    No modified thresholds. No modified prompts. No whitelist.
  `)

  // ── PHASE 1: DISCOVERY ─────────────────────────────────────────────────────
  hr('PHASE 1 — Discovery (all 5 categories)')
  const allDiscovered: DiscoveredCard[] = []

  for (const { categoryId, query } of CATEGORY_QUERIES) {
    try {
      const cards = await runDiscoveryForCategory(categoryId, query)
      allDiscovered.push(...cards)
    } catch (e) {
      console.error(`  [discover:${categoryId}] FAILED: ${e instanceof Error ? e.message : e}`)
    }
  }

  console.log(`\n  Total discovered: ${allDiscovered.length} cards across ${CATEGORY_QUERIES.length} categories`)

  // Count by tier
  const tierCounts = { High: 0, Medium: 0, Low: 0 }
  for (const d of allDiscovered) {
    const tier = d.card.promise as 'High' | 'Medium' | 'Low'
    tierCounts[tier]++
  }
  console.log(`  Promise distribution: High=${tierCounts.High}, Medium=${tierCounts.Medium}, Low=${tierCounts.Low}`)

  // ── PHASE 1b: SELECT TOP 20 ────────────────────────────────────────────────
  // Sort by promise tier (High first), then by position within tier (lower rank = better)
  const ranked = [...allDiscovered].sort((a, b) => {
    const tierDiff = PROMISE_RANK[b.card.promise] - PROMISE_RANK[a.card.promise]
    if (tierDiff !== 0) return tierDiff
    return a.rank - b.rank  // lower position = AI ranked it higher
  })

  // Deduplicate by name (case-insensitive)
  const seen = new Set<string>()
  const deduped: DiscoveredCard[] = []
  for (const d of ranked) {
    const key = d.card.name.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(d)
    }
  }

  const candidates = deduped.slice(0, 20)

  subhr('Top 20 candidates selected for full scoring')
  console.log('')
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const demand = c.card.scores?.demand?.signal ?? '?'
    const sat    = c.card.scores?.market_saturation?.level ?? '?'
    console.log(`  ${String(i+1).padStart(2)}. [${c.card.promise.padEnd(6)}] ${c.card.name.padEnd(40)} (${c.categoryId}, rank#${c.rank}, demand=${demand}, sat=${sat})`)
  }

  // ── PHASE 2: FULL SCORING ──────────────────────────────────────────────────
  hr('PHASE 2 — Full Scoring Pipeline (20 candidates)')
  console.log('  Running in sequential batches of 3 to avoid rate limits...\n')

  const scored: ScoredResult[] = []
  const BATCH_SIZE = 3

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch  = candidates.slice(i, i + BATCH_SIZE)
    const batchN = Math.floor(i / BATCH_SIZE) + 1
    const totalB = Math.ceil(candidates.length / BATCH_SIZE)
    console.log(`\n  — Batch ${batchN}/${totalB} (products ${i+1}–${Math.min(i+BATCH_SIZE, candidates.length)}) —`)

    const batchResults = await Promise.all(
      batch.map((d, j) => runFullScoring(d, i + j, candidates.length))
    )
    scored.push(...batchResults)

    // Brief pause between batches to reduce rate-limit pressure
    if (i + BATCH_SIZE < candidates.length) {
      console.log('\n  [waiting 3s before next batch...]')
      await new Promise(r => setTimeout(r, 3_000))
    }
  }

  // ── PHASE 3: REPORT ────────────────────────────────────────────────────────
  hr('PHASE 3 — Results (ranked by Opportunity Score)')

  // Sort by score desc, errors last
  const sortedResults = [...scored].sort((a, b) => {
    if (a.opportunityScore === null && b.opportunityScore === null) return 0
    if (a.opportunityScore === null) return 1
    if (b.opportunityScore === null) return -1
    return b.opportunityScore - a.opportunityScore
  })

  console.log(`
  ${'#'.padEnd(3)} ${'Product'.padEnd(36)} ${'Cat'.padEnd(12)} ${'Score'.padEnd(8)} ${'Verdict'.padEnd(22)} ${'Demand/mo'.padEnd(12)} ${'Revenue/mo'.padEnd(14)} ${'Comp'.padEnd(12)} Main reason`)
  console.log(`  ${'─'.repeat(3)} ${'─'.repeat(36)} ${'─'.repeat(12)} ${'─'.repeat(8)} ${'─'.repeat(22)} ${'─'.repeat(12)} ${'─'.repeat(14)} ${'─'.repeat(12)} ${'─'.repeat(30)}`)

  for (let i = 0; i < sortedResults.length; i++) {
    const r = sortedResults[i]
    const score    = r.opportunityScore !== null ? `${r.opportunityScore}/100` : 'N/A'
    const demand   = r.keywordVolume ? `${(r.keywordVolume/1000).toFixed(0)}k/mo` : '—'
    const revenue  = r.keepaRevenue ?? '—'
    const comp     = r.competitionLevel ?? r.discovered.card.scores?.market_saturation?.level ?? '—'
    const name     = r.discovered.card.name
    const cat      = r.discovered.categoryId

    console.log(`  ${String(i+1).padStart(2)}. ${pad(name, 36)} ${pad(cat, 12)} ${score.padEnd(8)} ${r.verdict.padEnd(22)} ${demand.padEnd(12)} ${pad(revenue, 14)} ${pad(comp, 12)} ${r.mainReason.slice(0, 50)}`)
  }

  // ── Verdict summary ────────────────────────────────────────────────────────
  subhr('Verdict Summary')

  const build     = scored.filter(r => r.verdict === 'BUILD_NOW').length
  const validate  = scored.filter(r => r.verdict === 'VALIDATE_FURTHER').length
  const skip      = scored.filter(r => r.verdict === 'SKIP').length
  const ccCand    = scored.filter(r => r.verdict === 'CATEGORY_CREATION_CANDIDATE').length
  const errors    = scored.filter(r => r.verdict === 'ERROR').length
  const scored20  = scored.filter(r => r.opportunityScore !== null).length

  console.log(`
  Products scored:               ${scored20}/20
  BUILD_NOW:                     ${build}
  VALIDATE_FURTHER:              ${validate}
  SKIP:                          ${skip}
  CATEGORY_CREATION_CANDIDATE:   ${ccCand}
  ERRORS:                        ${errors}
  `)

  // ── Why BUILD_NOW = 0 diagnosis (if applicable) ────────────────────────────
  if (build === 0) {
    subhr('Diagnosis: Why no BUILD_NOW?')
    const scored_results = scored.filter(r => r.opportunityScore !== null)
    const avgScore = scored_results.length
      ? scored_results.reduce((s, r) => s + (r.opportunityScore ?? 0), 0) / scored_results.length
      : 0
    const closest = [...scored_results].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)).slice(0, 3)

    console.log(`
  Average score across scored products: ${avgScore.toFixed(1)}/100
  Score range: ${Math.min(...scored_results.map(r => r.opportunityScore ?? 0))} – ${Math.max(...scored_results.map(r => r.opportunityScore ?? 0))}
  Gap to BUILD_NOW threshold (65):      ${(65 - avgScore).toFixed(1)} points

  Three closest to BUILD_NOW:`)
    for (const r of closest) {
      console.log(`    - "${r.discovered.card.name}": ${r.opportunityScore}/100 (${r.verdict})`)
      console.log(`      Binding constraint: ${r.mainReason}`)
      if (r.dimensions.length) {
        const dims = [...r.dimensions].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        for (const d of dims.slice(0, 3)) {
          console.log(`        ${d.label}: ${d.score ?? '—'}/10  [${d.source}]`)
        }
      }
    }

    console.log(`
  Candidate explanations:
  [A] Thresholds too conservative  → would require lowering BUILD_NOW from 65 or raising weights
  [B] Products genuinely not ready → organic discovery found real opportunities, none fully mature
  [C] Missing signals               → specific dimensions consistently scoring low (see above)
  [D] Calibration issue             → systematic bias in one or more scoring composites
  `)
  }

  // ── Per-product detail ─────────────────────────────────────────────────────
  subhr('Per-product detail (top 10 by score)')

  for (const r of sortedResults.slice(0, 10)) {
    console.log(`\n  ── ${r.discovered.card.name} ──`)
    console.log(`     Category:       ${r.discovered.categoryName}`)
    console.log(`     Promise (AI):   ${r.discovered.card.promise}`)
    console.log(`     Score:          ${r.opportunityScore ?? 'N/A'}/100`)
    console.log(`     Verdict:        ${r.verdict}`)
    console.log(`     Keepa Revenue:  ${r.keepaRevenue ?? '—'}`)
    console.log(`     Keyword top:    ${r.keywordTop ? `${r.keywordTop} (${r.keywordVolume}/mo)` : '—'}`)
    console.log(`     TikTok:         ${r.tiktokSignal ? `#${r.tiktokSignal}` : '—'}`)
    console.log(`     Reviews:        ${r.reviewsCollected ?? '—'}`)
    console.log(`     Competition:    ${r.competitionLevel ?? r.discovered.card.scores?.market_saturation?.level ?? '—'}`)
    console.log(`     AI rationale:   ${r.discovered.card.rationale}`)
    console.log(`     Main reason:    ${r.mainReason}`)
    if (r.dimensions.length) {
      console.log('     Dimensions:')
      for (const d of r.dimensions) {
        console.log(`       ${pad(d.label, 30)} ${d.score !== null ? `${d.score}/10` : 'N/A'}  [${d.source}]`)
      }
    }
  }

  hr('VALIDATION COMPLETE')
  const totalTime = Math.round((Date.now() - START_TIME) / 1000)
  console.log(`  Total run time: ${Math.floor(totalTime/60)}m ${totalTime%60}s\n`)
}

const START_TIME = Date.now()
main().catch(e => {
  console.error('\nFATAL ERROR:', e)
  process.exit(1)
})
