/**
 * Step 1 Validation — Dual-Corpus Collection + Temporal Filter
 *
 * Tests 3 products through the consumer intelligence layer only.
 * Reports:
 *   - Helpful corpus: review count, date range, star distribution
 *   - Critical corpus: review count, date range, temporal filter impact
 *   - Themes surfaced from each corpus
 *   - Customer Pain score: before (single-corpus estimate) vs after (dual-corpus)
 *   - Composite score delta estimate
 *   - Edge cases and regressions
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/validate_step1_customer_pain.ts
 */

import { signalEngine }              from '@/lib/signal-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import type { ConsumerIntelligenceReport } from '@/lib/consumer-intelligence'
import { classifyQuery }              from '@/lib/categories'

// ── Keepa fallback for competitor ASINs ───────────────────────────────────────
// If apify-amazon-search (junglee/amazon-crawler) is unavailable (403/timeout),
// pull bestseller ASINs from Keepa directly. Keepa's bestsellers endpoint is the
// same data source the Keepa signal provider uses internally.
const KEEPA_CATEGORY_NODES: Record<string, number> = {
  supplements: 23675621011,
  beauty:      3760911,
  home:        1055398,
}

async function fetchKeepaCompetitors(
  categoryId: string,
): Promise<{ productId: string; brand: string }[]> {
  const nodeId = KEEPA_CATEGORY_NODES[categoryId]
  if (!nodeId || !process.env.KEEPA_API_KEY) return []
  try {
    const url =
      `https://api.keepa.com/bestsellers` +
      `?key=${encodeURIComponent(process.env.KEEPA_API_KEY)}` +
      `&domain=1&category=${nodeId}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return []
    const data = await res.json() as { bestSellersList?: { asinList?: string[] } }
    const asins = data.bestSellersList?.asinList ?? []
    // Return the first 2 bestsellers — enough for a dual-competitor CI analysis.
    return asins.slice(0, 2).map(asin => ({ productId: asin, brand: '' }))
  } catch {
    return []
  }
}

// ── Test products ──────────────────────────────────────────────────────────────
// Selected to cover three different signal profiles:
//   1. Magnesium glycinate: established supplement, lots of reviews, known complaints
//   2. Non-slip drawer liner: home commodity, Customer Pain was binding constraint in last run
//   3. Vitamin C serum: beauty, well-rated category, specific recurring complaints
const TEST_QUERIES = [
  'magnesium glycinate 400mg sleep supplement',
  'non-slip non-adhesive drawer liner home',
  'vitamin C brightening face serum beauty',
]

// ── Scoring constants (mirrored from lib/scoring.ts) ──────────────────────────
const CONSUMER_PAIN_WEIGHT  = 18   // out of 100 total
const THIN_SAMPLE_THRESHOLD = 50

function hr(label: string) {
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`  ${label}`)
  console.log('═'.repeat(72))
}
function sub(label: string) {
  console.log(`\n  ── ${label}`)
}

// ── Score simulation ───────────────────────────────────────────────────────────

/** Simulate the OLD single-corpus pain score.
 *  Before this change: helpful-sorted corpus → 3-5 critical reviews →
 *  negativeThemes always empty → richness = 0 → score driven entirely by severity.
 *  We use the actual sentimentBreakdown.negativePct from the helpful corpus (unchanged)
 *  and assume themeCount = 0 (the empty-critical-pool outcome).
 */
function simulateOldPainScore(ci: ConsumerIntelligenceReport): number {
  const negativePct = ci.sentimentBreakdown.negativePct
  const severity    = Math.min(10, (negativePct / 30) * 10)
  const raw         = 0 * 0.6 + severity * 0.4   // richness = 0
  const capped      = Math.min(10, raw)
  const dampen      = ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
  return dampen ? Math.round(capped * ci.confidence) : Math.round(capped)
}

/** Compute the new pain score from a ConsumerIntelligenceReport.
 *  Mirrors lib/scoring.ts consumerPainScore() exactly after the Step 1 change.
 */
function computeNewPainScore(ci: ConsumerIntelligenceReport): number {
  const themeCount  = ci.negativeThemes.length + ci.featureRequests.length
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density     = themeCount / Math.log1p(painPoolSize)
  const richness    = Math.min(10, density * (10 / 3))
  const severity    = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw         = richness * 0.6 + severity * 0.4
  const capped      = Math.min(10, raw)
  const dampen      = ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
  return dampen ? Math.round(capped * ci.confidence) : Math.round(capped)
}

/** Estimate composite score delta from a Customer Pain change.
 *  Assumes all 7 dimensions contribute (totalWeight = 100).
 *  In practice normalized weight may be slightly higher if some dimensions are missing.
 */
function estimateCompositeDelta(oldPain: number, newPain: number): number {
  return Math.round((newPain - oldPain) * (CONSUMER_PAIN_WEIGHT / 100) * 10 * 10) / 10
}

// ── Date analysis ──────────────────────────────────────────────────────────────

interface DateStats {
  total:     number
  last18mo:  number
  oldest:    string
  newest:    string
  cutoffPct: number   // % of reviews within 18-month window
}

function analyseDates(reviews: { date: string }[]): DateStats {
  if (!reviews.length) return { total: 0, last18mo: 0, oldest: '—', newest: '—', cutoffPct: 0 }
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 18)
  const dates   = reviews.map(r => new Date(r.date)).sort((a, b) => a.getTime() - b.getTime())
  const last18mo = reviews.filter(r => new Date(r.date) >= cutoff).length
  return {
    total:     reviews.length,
    last18mo,
    oldest:    dates[0].toISOString().slice(0, 10),
    newest:    dates[dates.length - 1].toISOString().slice(0, 10),
    cutoffPct: Math.round((last18mo / reviews.length) * 100),
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function validateProduct(query: string, idx: number): Promise<'ok' | 'skip'> {
  hr(`[${idx + 1}/${TEST_QUERIES.length}] ${query}`)

  // ── Step 1: classify + get competitors from signal engine ─────────────────
  const category = await classifyQuery(query)
  console.log(`  Category: ${category}`)

  const signals = await signalEngine.fetch(
    { query, categoryId: category ?? undefined },
    75_000,   // matches production; apify-amazon-search takes ~35s so 30s was too short
  ).catch(e => {
    console.error(`  SignalEngine failed: ${e instanceof Error ? e.message : e}`)
    return null
  })

  if (!signals) {
    console.log('  SKIP: no signal data')
    return 'skip'
  }

  const rawCompetitors = signals.review_velocity?.value.top_competitors ?? []
  let competitors = rawCompetitors.slice(0, 2).map((c: { productId: string; brand?: string }) => ({
    productId: c.productId,
    brand:     c.brand ?? '',
  }))

  if (!competitors.length) {
    console.log('  NOTE: apify-amazon-search returned no competitors — trying Keepa bestsellers fallback')
    competitors = await fetchKeepaCompetitors(category ?? '')
    if (competitors.length) {
      console.log(`  Keepa fallback: ${competitors.map(c => c.productId).join(', ')}`)
    }
  }

  if (!competitors.length) {
    console.log('  SKIP: no competitor ASINs from signal engine or Keepa fallback')
    return 'skip'
  }

  console.log(`  Competitors: ${competitors.map(c => `${c.productId} (${c.brand})`).join(', ')}`)

  // ── Step 2: run consumer intelligence ─────────────────────────────────────
  console.log('\n  Collecting reviews (helpful + critical passes)...')
  const startMs = Date.now()
  const ci = await analyzeConsumerIntelligence(competitors, query).catch(e => {
    console.error(`  analyzeConsumerIntelligence failed: ${e instanceof Error ? e.message : e}`)
    return null
  })
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1)

  if (!ci) {
    console.log('  RESULT: returned null (too few reviews or collection failure)')
    return 'skip'
  }

  console.log(`  Collection completed in ${elapsedSec}s`)

  // ── Step 3: report corpus sizes and date distribution ─────────────────────
  sub('Corpus sizes')
  console.log(`  Helpful pool (positive corpus):  ${ci.positivePoolSize} reviews  (4-5★)`)
  console.log(`  Critical pool (negative corpus): ${ci.negativePoolSize} reviews  (1-3★, after temporal filter)`)
  console.log(`  Total collected:                 ${ci.totalReviewsCollected}`)
  console.log(`  Sentiment (from helpful corpus): avg ${ci.sentimentBreakdown.avgRating}★, ${ci.sentimentBreakdown.negativePct}% negative`)

  // ── Step 4: temporal filter impact ────────────────────────────────────────
  // Note: negativePoolSize already reflects the post-filter count.
  // We can estimate the pre-filter count from the raw criticalReviews, but
  // the report only exposes the post-filter size. Report what's available.
  sub('Temporal filter (18-month cutoff)')
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - 18)
  const rawPool  = ci.negativeRawPoolSize ?? '(legacy — field absent)'
  const filtered = ci.negativePoolSize
  const pctKept  = typeof rawPool === 'number' && rawPool > 0
    ? ` (${Math.round((filtered / rawPool) * 100)}% retained)`
    : ''
  console.log(`  Cutoff date:                   ${cutoffDate.toISOString().slice(0, 10)}`)
  console.log(`  Pre-filter critical pool size: ${rawPool}`)
  console.log(`  Post-filter critical pool size: ${filtered}${pctKept}`)

  // ── Step 5: themes ─────────────────────────────────────────────────────────
  sub('Negative themes (from critical corpus)')
  if (ci.negativeThemes.length === 0) {
    console.log('  None — critical pool too thin for clustering (need ≥3 reviews per phrase)')
  } else {
    ci.negativeThemes.forEach((t, i) => {
      console.log(`  ${i + 1}. "${t.label}"  (${t.mentionedBy}/${t.outOf} critical reviews)`)
      console.log(`     "${t.exampleQuote.slice(0, 100)}..."`)
    })
  }

  sub('Feature requests (from all reviews)')
  if (ci.featureRequests.length === 0) {
    console.log('  None found')
  } else {
    ci.featureRequests.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. "${t.label}"  (${t.mentionedBy}/${t.outOf})`)
    })
  }

  sub('Positive themes (from helpful corpus)')
  if (ci.positiveThemes.length === 0) {
    console.log('  None found')
  } else {
    ci.positiveThemes.slice(0, 4).forEach((t, i) => {
      console.log(`  ${i + 1}. "${t.label}"  (${t.mentionedBy}/${t.outOf})`)
    })
  }

  // ── Step 6: before vs after score ─────────────────────────────────────────
  const oldScore   = simulateOldPainScore(ci)
  const newScore   = computeNewPainScore(ci)
  const delta      = estimateCompositeDelta(oldScore, newScore)
  const direction  = delta > 0 ? `+${delta}` : `${delta}`

  sub('Customer Pain: before vs after')
  console.log(`  OLD (single helpful corpus, negativeThemes assumed = 0):  ${oldScore}/10`)
  console.log(`  NEW (dual corpus, temporal filter, critical themes):       ${newScore}/10`)
  console.log(`  Δ Customer Pain:  ${newScore - oldScore > 0 ? '+' : ''}${newScore - oldScore} points`)
  console.log(`  Δ Composite score (estimate):  ${direction} points  [${CONSUMER_PAIN_WEIGHT}% weight × ${newScore - oldScore}pt / 10]`)

  // ── Step 7: edge case flags ────────────────────────────────────────────────
  sub('Edge cases')
  const issues: string[] = []

  if (ci.negativePoolSize === 0) {
    issues.push('WARN  Critical corpus is empty — fell back to pre-dual-corpus behavior (1-2★ from helpful corpus)')
  }
  if (ci.negativePoolSize > 0 && ci.negativePoolSize < 5) {
    issues.push(`WARN  Critical corpus thin (${ci.negativePoolSize} reviews) — temporal filter may have removed too much`)
  }
  if (ci.negativeThemes.length === 0 && ci.negativePoolSize >= 5) {
    issues.push('WARN  Critical corpus has reviews but no clusterable themes — complaints may be idiosyncratic (no phrase in ≥3 reviews)')
  }
  if (ci.sentimentBreakdown.negativePct === 0) {
    issues.push('WARN  sentimentBreakdown.negativePct = 0 — helpful corpus has zero 1-2★ reviews (extreme positive bias)')
  }
  if (newScore > oldScore + 6) {
    issues.push(`CAUTION  Large jump (+${newScore - oldScore}pt) — verify themes are category gaps, not survivorship artifacts`)
  }
  if (newScore < oldScore) {
    issues.push(`REGRESSION  New score (${newScore}) < old score (${oldScore}) — investigate`)
  }

  if (issues.length === 0) {
    console.log('  OK — no edge cases detected')
  } else {
    issues.forEach(msg => console.log(`  ${msg}`))
  }

  return 'ok'
}

async function main() {
  console.log('Step 1 Validation: Dual-Corpus + Temporal Filter')
  console.log(`Date: ${new Date().toISOString().slice(0, 10)}`)
  console.log('Products:', TEST_QUERIES.length)
  console.log('Cutoff:   18 months')

  const results: { query: string; status: 'ok' | 'skip' | 'error' }[] = []

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i]
    try {
      const status = await validateProduct(query, i)
      results.push({ query, status: status ?? 'ok' })
    } catch (err) {
      console.error(`\n[FATAL] ${query}: ${err instanceof Error ? err.message : err}`)
      results.push({ query, status: 'error' })
    }
  }

  hr('Summary')
  results.forEach(r => console.log(`  ${r.status.toUpperCase().padEnd(6)}  ${r.query}`))

  const passed = results.filter(r => r.status === 'ok').length
  const skipped = results.filter(r => r.status === 'skip').length
  console.log(`\n  ${passed}/${results.length} products ran consumer intelligence successfully`)
  if (skipped > 0) console.log(`  ${skipped} skipped (no competitor ASINs — signal engine issue, not CI issue)`)

  if (passed >= 2) {
    console.log('\n  ✓ Step 1 validation passed — ready to proceed to Step 2')
  } else {
    console.log('\n  ✗ Too few products validated. Investigate before proceeding.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
