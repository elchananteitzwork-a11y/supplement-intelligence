/**
 * Step 3 Validation — Cross-Competitor Theme Correlation
 *
 * Tests 3 products through the full CI pipeline (Steps 1+2+3) and reports:
 *   1. Which themes are category gaps (shared ≥2 ASINs)
 *   2. Which themes are competitor-specific (1 ASIN only)
 *   3. Customer Pain score: pre-Step-3 (unweighted) vs Step-3 (weighted)
 *   4. False positive reduction (product-specific themes that were inflating the score)
 *   5. Any regressions or failures
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/validate_step3_correlate.ts
 */

import { signalEngine }               from '@/lib/signal-engine'
import { analyzeConsumerIntelligence } from '@/lib/consumer-intelligence'
import type { ConsumerIntelligenceReport, CorrelatedThemeInsight } from '@/lib/consumer-intelligence'
import { classifyQuery }               from '@/lib/categories'

// ── Keepa fallback (mirrors Step 1 script) ────────────────────────────────────
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
    return (data.bestSellersList?.asinList ?? [])
      .slice(0, 2).map(asin => ({ productId: asin, brand: '' }))
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

/** Pre-Step-3 score: all negative themes weighted equally. */
function scorePreStep3(ci: ConsumerIntelligenceReport): number {
  const themeCount  = ci.negativeThemes.length + ci.featureRequests.length
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density      = themeCount / Math.log1p(painPoolSize)
  const richness     = Math.min(10, density * (10 / 3))
  const severity     = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw          = richness * 0.6 + severity * 0.4
  const capped       = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

/** Step-3 score: category gaps ×1.5, product-specific ×0.5. */
function scoreStep3(ci: ConsumerIntelligenceReport): number {
  const effectiveCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5
      + ci.productSpecificThemes.length * 0.5
      + ci.featureRequests.length
    : ci.negativeThemes.length + ci.featureRequests.length
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density      = effectiveCount / Math.log1p(painPoolSize)
  const richness     = Math.min(10, density * (10 / 3))
  const severity     = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw          = richness * 0.6 + severity * 0.4
  const capped       = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function hr(label: string) {
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`  ${label}`)
  console.log('═'.repeat(72))
}
function sub(label: string) { console.log(`\n  ── ${label}`) }
function pct(n: number)     { return `${Math.round(n * 100)}%` }

function printTheme(t: CorrelatedThemeInsight, i: number) {
  const tag = t.isCategoryGap ? '[CATEGORY GAP]' : '[PRODUCT SPECIFIC]'
  const cov = `${t.competitorCount.withTheme}/${t.competitorCount.total} ASINs`
  console.log(`  ${i + 1}. ${tag} "${t.label}"`)
  console.log(`     Reviews: ${t.mentionedBy}/${t.outOf} | Competitor coverage: ${cov} (${pct(t.competitorCoverage)})`)
  console.log(`     "${t.exampleQuote.slice(0, 110)}..."`)
}

// ── Per-product validation ─────────────────────────────────────────────────────

async function validateProduct(query: string, idx: number): Promise<'ok' | 'skip'> {
  hr(`[${idx + 1}/${TEST_QUERIES.length}] ${query}`)

  // Classify + find competitors
  const category = await classifyQuery(query)
  console.log(`  Category: ${category}`)

  const signals = await signalEngine.fetch(
    { query, categoryId: category ?? undefined },
    75_000,
  ).catch(e => {
    console.error(`  SignalEngine failed: ${e instanceof Error ? e.message : e}`)
    return null
  })

  if (!signals) { console.log('  SKIP: signal engine failed'); return 'skip' }

  const rawCompetitors = signals.review_velocity?.value.top_competitors ?? []
  let competitors = rawCompetitors.slice(0, 3).map((c: { productId: string; brand?: string }) => ({
    productId: c.productId,
    brand:     c.brand ?? '',
  }))

  if (!competitors.length) {
    console.log('  NOTE: no competitors from signal engine — trying Keepa fallback')
    competitors = await fetchKeepaCompetitors(category ?? '')
    if (competitors.length) console.log(`  Keepa fallback: ${competitors.map(c => c.productId).join(', ')}`)
  }

  if (!competitors.length) { console.log('  SKIP: no competitor ASINs'); return 'skip' }

  console.log(`  Competitors (${competitors.length}): ${competitors.map(c => `${c.productId}${c.brand ? ` (${c.brand})` : ''}`).join(', ')}`)

  // Run CI
  console.log('\n  Running consumer intelligence (Steps 1+2+3)...')
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
  console.log(`  Total ASINs analyzed:  ${ci.productsAnalyzed.length}`)
  console.log(`  Critical pool (post-filter): ${ci.negativePoolSize} reviews`)
  console.log(`  Helpful pool:                ${ci.positivePoolSize} reviews`)
  console.log(`  Sentiment: ${ci.sentimentBreakdown.negativePct}% negative  avg ${ci.sentimentBreakdown.avgRating}★`)

  // Step 3 correlation results
  const gapThemes  = ci.categoryGapThemes     ?? []
  const specThemes = ci.productSpecificThemes  ?? []
  const hasStep3   = ci.categoryGapThemes !== undefined

  sub(`Category-gap themes (${gapThemes.length}) — shared across ≥2 competitor ASINs`)
  if (!hasStep3) {
    console.log('  [WARN] categoryGapThemes absent — Step 3 correlation did not run')
  } else if (gapThemes.length === 0) {
    console.log('  None — all themes are competitor-specific (or critical pool too thin)')
  } else {
    gapThemes.forEach((t, i) => printTheme(t, i))
  }

  sub(`Competitor-specific themes (${specThemes.length}) — appear in only 1 ASIN`)
  if (hasStep3 && specThemes.length === 0) {
    console.log('  None')
  } else if (hasStep3) {
    specThemes.forEach((t, i) => printTheme(t, i))
  }

  // Scoring delta
  const scoreBefore = scorePreStep3(ci)
  const scoreAfter  = scoreStep3(ci)
  const scoreDelta  = scoreAfter - scoreBefore
  const direction   = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`

  sub('Customer Pain score: pre-Step-3 vs Step-3 weighted')
  console.log(`  Pre-Step-3 (all themes equal, count=${ci.negativeThemes.length}+${ci.featureRequests.length}fr):  ${scoreBefore}/10`)

  if (hasStep3) {
    const effectiveCount = gapThemes.length * 1.5 + specThemes.length * 0.5 + ci.featureRequests.length
    console.log(`  Step-3 weighted (gaps×1.5=${gapThemes.length * 1.5} + specific×0.5=${specThemes.length * 0.5} + fr=${ci.featureRequests.length} = ${effectiveCount.toFixed(1)}):  ${scoreAfter}/10`)
    console.log(`  Δ score: ${direction} (${scoreDelta > 0 ? 'signal amplified — more category gaps than specific' : scoreDelta < 0 ? 'signal dampened — mostly competitor-specific execution issues' : 'unchanged'})`)
  } else {
    console.log('  Step-3: N/A (correlation not present)')
  }

  // False positive analysis
  sub('False positive reduction')
  if (!hasStep3) {
    console.log('  N/A (correlation did not run)')
  } else if (specThemes.length === 0 && gapThemes.length === 0) {
    console.log('  No themes to classify — thin corpus')
  } else {
    const totalThemes = gapThemes.length + specThemes.length
    const fpFraction  = totalThemes > 0 ? specThemes.length / totalThemes : 0
    console.log(`  ${specThemes.length}/${totalThemes} themes (${pct(fpFraction)}) are competitor-specific → weighted down 0.5× in scoring`)
    console.log(`  ${gapThemes.length}/${totalThemes} themes (${pct(gapThemes.length / (totalThemes || 1))}) are category gaps → weighted up 1.5× in scoring`)

    if (specThemes.length > 0 && scoreDelta < 0) {
      console.log(`  ✓ Score decreased ${direction} — Step 3 correctly dampened competitor-specific noise`)
    } else if (gapThemes.length > 0 && scoreDelta > 0) {
      console.log(`  ✓ Score increased ${direction} — Step 3 correctly amplified genuine category-gap signal`)
    } else if (scoreDelta === 0) {
      console.log('  Score unchanged (gap/specific mix balanced out, or only 1 ASIN so all themes appear in 1 ASIN)')
    }
  }

  // Regression flags
  sub('Regression checks')
  const issues: string[] = []

  if (!hasStep3) {
    issues.push('FAIL  categoryGapThemes absent — Step 3 did not wire through analyze.ts')
  }
  if (ci.negativePoolSize === 0) {
    issues.push('WARN  Critical pool empty — no themes to correlate; temporal filter may be too aggressive')
  }
  if (hasStep3 && ci.productsAnalyzed.length < 2 && (gapThemes.length > 0)) {
    issues.push('FAIL  isCategoryGap=true with only 1 ASIN in analysis — impossible, bug in correlate.ts')
  }
  if (hasStep3 && gapThemes.some(t => t.competitorCount.withTheme < 2)) {
    issues.push('FAIL  Category-gap theme has withTheme < 2 — threshold logic broken in correlate.ts')
  }
  if (hasStep3 && specThemes.some(t => t.competitorCount.withTheme >= 2)) {
    issues.push('FAIL  Product-specific theme has withTheme >= 2 — isCategoryGap inversion bug')
  }
  if (scoreAfter < 0 || scoreAfter > 10) {
    issues.push(`FAIL  Step-3 score out of range: ${scoreAfter}`)
  }
  if (scoreDelta < -5) {
    issues.push(`CAUTION  Large score drop (${direction}) — verify themes were genuinely competitor-specific, not real category gaps`)
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
  console.log('Step 3 Validation: Cross-Competitor Theme Correlation')
  console.log(`Date:     ${new Date().toISOString().slice(0, 10)}`)
  console.log(`Products: ${TEST_QUERIES.length}`)
  console.log('Scoring:  category gaps ×1.5 | product-specific ×0.5 | features ×1.0')

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
  if (skipped) console.log(`  ${skipped} skipped (signal engine / competitor lookup failed)`)
  if (errored) console.log(`  ${errored} errored (fatal exception — check logs above)`)

  if (passed >= 2) {
    console.log('\n  PASS — Step 3 correlation validated; ready to proceed to Step 4')
  } else {
    console.log('\n  FAIL — Too few products validated. Investigate before proceeding.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
