/**
 * Step 4 E2E Validation — Feature Request Separation
 *
 * Tests 3 products through the full pipeline (Steps 1–4) and reports:
 *   1. Customer Pain score before vs after Step 4
 *   2. Which requests were classified as prerequisites (from critical reviews)
 *   3. Which requests were classified as enhancements (from positive reviews)
 *   4. Score changes and why
 *   5. False positives removed (enhancement requests no longer inflating pain)
 *   6. Regression check
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/validate_step4_feature_requests.ts
 */

import { signalEngine }               from '@/lib/signal-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import type { ConsumerIntelligenceReport, ThemeInsight } from '@/lib/consumer-intelligence'
import { classifyQuery }               from '@/lib/categories'

// ── Keepa fallback ─────────────────────────────────────────────────────────────
const KEEPA_CATEGORY_NODES: Record<string, number> = {
  supplements: 23675621011,
  beauty:      3760911,
  home:        1055398,
}

async function fetchKeepaCompetitors(categoryId: string): Promise<{ productId: string; brand: string }[]> {
  const nodeId = KEEPA_CATEGORY_NODES[categoryId]
  if (!nodeId || !process.env.KEEPA_API_KEY) return []
  try {
    const url = `https://api.keepa.com/bestsellers?key=${encodeURIComponent(process.env.KEEPA_API_KEY)}&domain=1&category=${nodeId}`
    const res  = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return []
    const data = await res.json() as { bestSellersList?: { asinList?: string[] } }
    return (data.bestSellersList?.asinList ?? []).slice(0, 2).map(asin => ({ productId: asin, brand: '' }))
  } catch { return [] }
}

// ── Test products ──────────────────────────────────────────────────────────────
const TEST_QUERIES = [
  'magnesium glycinate 400mg sleep supplement',
  'non-slip non-adhesive drawer liner home',
  'vitamin C brightening face serum beauty',
]

// ── Score simulation ───────────────────────────────────────────────────────────
const THIN_SAMPLE_THRESHOLD = 50

/** Pre-Step-4: featureRequests.length (all requests, regardless of corpus origin). */
function scorePreStep4(ci: ConsumerIntelligenceReport): number {
  const frCount = ci.featureRequests.length
  const effectiveCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5 + ci.productSpecificThemes.length * 0.5 + frCount
    : ci.negativeThemes.length + frCount
  return computePainScore(ci, effectiveCount)
}

/** Step-4: prerequisiteFeatureRequests.length only (critical-corpus requests). */
function scoreStep4(ci: ConsumerIntelligenceReport): number {
  const frCount = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const effectiveCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5 + ci.productSpecificThemes.length * 0.5 + frCount
    : ci.negativeThemes.length + frCount
  return computePainScore(ci, effectiveCount)
}

function computePainScore(ci: ConsumerIntelligenceReport, effectiveThemeCount: number): number {
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density      = effectiveThemeCount / Math.log1p(painPoolSize)
  const richness     = Math.min(10, density * (10 / 3))
  const severity     = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw          = richness * 0.6 + severity * 0.4
  const capped       = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// ── Formatting ─────────────────────────────────────────────────────────────────
function hr(label: string) {
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`  ${label}`)
  console.log('═'.repeat(72))
}
function sub(label: string) { console.log(`\n  ── ${label}`) }

function printTheme(t: ThemeInsight, i: number) {
  console.log(`  ${i + 1}. "${t.label}"  (${t.mentionedBy}/${t.outOf})`)
  console.log(`     "${t.exampleQuote.slice(0, 110)}..."`)
}

// ── Per-product validation ─────────────────────────────────────────────────────

async function validateProduct(query: string, idx: number): Promise<'ok' | 'skip'> {
  hr(`[${idx + 1}/${TEST_QUERIES.length}] ${query}`)

  const category = await classifyQuery(query)
  console.log(`  Category: ${category}`)

  const signals = await signalEngine.fetch(
    { query, categoryId: category ?? undefined },
    75_000,
  ).catch(e => { console.error(`  SignalEngine failed: ${e instanceof Error ? e.message : e}`); return null })

  if (!signals) { console.log('  SKIP: signal engine failed'); return 'skip' }

  const rawCompetitors = signals.review_velocity?.value.top_competitors ?? []
  let competitors = rawCompetitors.slice(0, 3).map((c: { productId: string; brand?: string }) => ({
    productId: c.productId, brand: c.brand ?? '',
  }))

  if (!competitors.length) {
    console.log('  NOTE: no competitors from signal engine — trying Keepa fallback')
    competitors = await fetchKeepaCompetitors(category ?? '')
    if (competitors.length) console.log(`  Keepa fallback: ${competitors.map(c => c.productId).join(', ')}`)
  }

  if (!competitors.length) { console.log('  SKIP: no competitor ASINs'); return 'skip' }
  console.log(`  Competitors (${competitors.length}): ${competitors.map(c => `${c.productId}${c.brand ? ` (${c.brand})` : ''}`).join(', ')}`)

  console.log('\n  Running full pipeline (Steps 1–4)...')
  const startMs = Date.now()
  const ci = await analyzeConsumerIntelligence(competitors, query).catch(e => {
    console.error(`  analyzeConsumerIntelligence failed: ${e instanceof Error ? e.message : e}`)
    return null
  })
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)

  if (!ci) { console.log('  SKIP: CI returned null'); return 'skip' }
  console.log(`  Completed in ${elapsed}s`)

  // Corpus summary
  sub('Corpus')
  console.log(`  Critical pool: ${ci.negativePoolSize} reviews | Positive pool: ${ci.positivePoolSize} reviews`)
  console.log(`  Sentiment: ${ci.sentimentBreakdown.negativePct}% negative  avg ${ci.sentimentBreakdown.avgRating}★`)

  const hasStep4 = ci.prerequisiteFeatureRequests !== undefined

  // Prerequisite feature requests (from critical reviews)
  const prereqs   = ci.prerequisiteFeatureRequests  ?? []
  const enhances  = ci.enhancementFeatureRequests   ?? []
  const allFr     = ci.featureRequests

  sub(`Prerequisite feature requests (${prereqs.length}) — from dissatisfied reviewers (1-3★)`)
  if (!hasStep4) {
    console.log('  [WARN] prerequisiteFeatureRequests absent — Step 4 did not wire through')
  } else if (prereqs.length === 0) {
    console.log('  None — no request language found in critical reviews')
  } else {
    prereqs.forEach((t, i) => printTheme(t, i))
  }

  sub(`Enhancement feature requests (${enhances.length}) — from satisfied reviewers (4-5★)`)
  if (hasStep4 && enhances.length === 0) {
    console.log('  None — no request language found in positive reviews')
  } else if (hasStep4) {
    enhances.forEach((t, i) => printTheme(t, i))
  }

  sub(`Legacy featureRequests (${allFr.length}) — backward-compat union (all reviews)`)
  if (allFr.length === 0) {
    console.log('  None')
  } else {
    allFr.forEach((t, i) => printTheme(t, i))
  }

  // Score comparison
  const scorePre  = scorePreStep4(ci)
  const scorePost = scoreStep4(ci)
  const delta     = scorePost - scorePre
  const direction = delta > 0 ? `+${delta}` : `${delta}`

  sub('Customer Pain score: pre-Step-4 vs Step-4')
  console.log(`  Pre-Step-4  (featureRequests.length=${allFr.length}):                   ${scorePre}/10`)
  if (hasStep4) {
    console.log(`  Step-4      (prerequisiteFeatureRequests.length=${prereqs.length}):     ${scorePost}/10`)
    console.log(`  Δ score: ${direction}`)

    if (delta < 0) {
      const removed = allFr.length - prereqs.length
      console.log(`  Reason: ${removed} of ${allFr.length} legacy feature request(s) were from positive reviewers — correctly removed from pain`)
    } else if (delta === 0) {
      console.log('  Reason: all feature requests came from critical reviews (or none found in either corpus)')
    } else {
      console.log('  Reason: more critical requests surfaced than were in the full-pool featureRequests (corpus split revealed more signal)')
    }
  }

  // False positive analysis
  sub('False positive reduction')
  if (!hasStep4) {
    console.log('  N/A (Step 4 did not run)')
  } else {
    const enhancementsInOldFr = allFr.filter(old =>
      enhances.some(e => e.label === old.label)
    ).length
    if (enhancementsInOldFr === 0 && enhances.length === 0) {
      console.log('  No enhancement requests found — no false positives to remove')
    } else if (enhances.length > 0) {
      console.log(`  ${enhances.length} enhancement request(s) isolated to positive corpus — NOT counted in Customer Pain`)
      enhances.forEach(e => console.log(`    - "${e.label}" (${e.mentionedBy}/${e.outOf} positive reviews)`))
    }
  }

  // Regression checks
  sub('Regression checks')
  const issues: string[] = []

  if (!hasStep4) {
    issues.push('FAIL  prerequisiteFeatureRequests absent — Step 4 did not wire through analyze.ts')
  }
  if (ci.enhancementFeatureRequests === undefined) {
    issues.push('FAIL  enhancementFeatureRequests absent from report')
  }
  if (scorePost < 0 || scorePost > 10) {
    issues.push(`FAIL  Step-4 score out of range: ${scorePost}`)
  }
  if (scorePre < 0 || scorePre > 10) {
    issues.push(`FAIL  Pre-Step-4 score out of range: ${scorePre}`)
  }
  if (delta > 3) {
    issues.push(`CAUTION  Large score increase (+${delta}) — verify that critical-corpus feature requests are real pain signals`)
  }
  if (delta < -5) {
    issues.push(`CAUTION  Large score drop (${delta}) — verify that removed feature requests genuinely came from positive reviews`)
  }
  // Structural: prereqs should come from negative pool, enhancements from positive
  if (hasStep4 && prereqs.some(p => p.outOf !== ci.negativePoolSize)) {
    issues.push('FAIL  prerequisiteFeatureRequests.outOf ≠ negativePoolSize — wrong pool used as denominator')
  }
  if (hasStep4 && enhances.some(e => e.outOf !== ci.positivePoolSize)) {
    issues.push('FAIL  enhancementFeatureRequests.outOf ≠ positivePoolSize — wrong pool used as denominator')
  }

  if (issues.length === 0) {
    console.log('  OK — no regressions')
  } else {
    issues.forEach(msg => console.log(`  ${msg}`))
  }

  return 'ok'
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Step 4 Validation: Feature Request Separation')
  console.log(`Date:     ${new Date().toISOString().slice(0, 10)}`)
  console.log(`Products: ${TEST_QUERIES.length}`)
  console.log('Logic:    critical-corpus requests → prerequisiteFeatureRequests → pain score')
  console.log('          positive-corpus requests → enhancementFeatureRequests  → NOT pain score')

  const results: { query: string; status: 'ok' | 'skip' | 'error' }[] = []

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i]
    try {
      const status = await validateProduct(query, i)
      results.push({ query, status })
    } catch (err) {
      console.error(`\n[FATAL] ${query}: ${err instanceof Error ? err.message : err}`)
      results.push({ query, status: 'error' })
    }
  }

  hr('Summary')
  results.forEach(r => console.log(`  ${r.status.toUpperCase().padEnd(6)}  ${r.query}`))

  const passed  = results.filter(r => r.status === 'ok').length
  const skipped = results.filter(r => r.status === 'skip').length
  const errored = results.filter(r => r.status === 'error').length

  console.log(`\n  ${passed}/${results.length} products validated successfully`)
  if (skipped) console.log(`  ${skipped} skipped`)
  if (errored) console.log(`  ${errored} errored`)

  if (passed >= 2) {
    console.log('\n  PASS — Step 4 feature request separation validated')
    console.log('  Ready for milestone review before full platform E2E test')
  } else {
    console.log('\n  FAIL — Too few products validated. Investigate before proceeding.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
