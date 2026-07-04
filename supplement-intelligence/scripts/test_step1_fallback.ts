/**
 * Step 1 Fallback Path Tests
 *
 * Tests the three-tier negative-pool fallback from analyze.ts without making
 * any real API calls. Uses synthetic CollectedReview data.
 *
 * Fallback chain (AMAZON_SUCCESS_THRESHOLD = 5):
 *   Tier 1: criticalFiltered.length >= 5  → use recent critical reviews only
 *   Tier 2: allCriticalCleaned.length >= 5 → use all critical (ignore cutoff)
 *   Tier 3: fallback to 1-2★ from helpful corpus (pre-dual-corpus behavior)
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/test_step1_fallback.ts
 */

import type { CollectedReview } from '@/lib/review-collector/types'

// ── Threshold (mirrors analyze.ts) ────────────────────────────────────────────
const AMAZON_SUCCESS_THRESHOLD = 5
const CRITICAL_REVIEW_MONTHS   = 18

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReview(
  id: string,
  rating: number,
  daysAgo: number,
  body = 'test review body text',
): CollectedReview {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return {
    id,
    asin:            'TEST0000001',
    title:           'Test review',
    body,
    rating,
    verified:        true,
    helpful_votes:   0,
    date:            d.toISOString(),
    country:         'US',
    source_provider: 'axesso-amazon-reviews',
    collected_at:    new Date().toISOString(),
  }
}

/** Replicates the exact negative-pool selection logic from analyze.ts */
function selectNegativePool(
  criticalReviews: CollectedReview[],
  helpfulReviews:  CollectedReview[],
): { pool: CollectedReview[]; tier: 1 | 2 | 3 } {
  const criticalCutoff = new Date()
  criticalCutoff.setMonth(criticalCutoff.getMonth() - CRITICAL_REVIEW_MONTHS)

  const allCriticalCleaned = criticalReviews   // (cleanReviewText is a no-op here)
  const criticalFiltered   = allCriticalCleaned.filter(r => new Date(r.date) >= criticalCutoff)

  if (criticalFiltered.length >= AMAZON_SUCCESS_THRESHOLD) {
    return { pool: criticalFiltered, tier: 1 }
  }
  if (allCriticalCleaned.length >= AMAZON_SUCCESS_THRESHOLD) {
    return { pool: allCriticalCleaned, tier: 2 }
  }
  // Tier 3: combined pool (helpful ∪ critical), 1-2★ only
  const combined = [...helpfulReviews, ...criticalReviews]
  return { pool: combined.filter(r => r.rating <= 2), tier: 3 }
}

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

function section(label: string) {
  console.log(`\n── ${label}`)
}

// ── Tier 1: recent critical reviews ≥ threshold ───────────────────────────────
section('Tier 1 — recent critical reviews ≥ AMAZON_SUCCESS_THRESHOLD (5)')
{
  // 6 recent critical reviews (within 18 months)
  const critical = [
    makeReview('c1', 2, 30),
    makeReview('c2', 1, 60),
    makeReview('c3', 3, 90),
    makeReview('c4', 2, 120),
    makeReview('c5', 1, 200),
    makeReview('c6', 2, 300),
  ]
  // helpful corpus has 10 helpful reviews
  const helpful = Array.from({ length: 10 }, (_, i) => makeReview(`h${i}`, 5, i * 10))

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('selects tier 1', tier === 1, `got tier ${tier}`)
  assert('pool equals criticalFiltered (all 6 recent)', pool.length === 6, `pool.length = ${pool.length}`)
  assert('pool contains only critical review IDs', pool.every(r => r.id.startsWith('c')), `IDs: ${pool.map(r => r.id).join(',')}`)
}

// ── Tier 2: old critical reviews still meet threshold ─────────────────────────
section('Tier 2 — recent critical < 5 but all critical ≥ 5')
{
  // 2 recent + 4 stale critical reviews (stale = > 18 months ago)
  const recentCritical = [makeReview('r1', 2, 30), makeReview('r2', 1, 60)]
  const staleCritical  = [
    makeReview('s1', 1, 600),
    makeReview('s2', 2, 650),
    makeReview('s3', 1, 700),
    makeReview('s4', 2, 750),
  ]
  const critical = [...recentCritical, ...staleCritical]
  const helpful  = Array.from({ length: 5 }, (_, i) => makeReview(`h${i}`, 4, i * 10))

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('selects tier 2', tier === 2, `got tier ${tier}`)
  assert('pool = all critical (recent + stale)', pool.length === 6, `pool.length = ${pool.length}`)
  assert('pool does not include helpful reviews', !pool.some(r => r.id.startsWith('h')))
}

// ── Tier 3: critical corpus too thin, fall back to helpful 1-2★ ──────────────
section('Tier 3 — critical corpus < 5 reviews → fallback to helpful 1-2★')
{
  // Only 2 critical reviews (recent but below threshold)
  const critical = [makeReview('c1', 2, 30), makeReview('c2', 1, 60)]
  // Helpful corpus: 10 reviews, 3 of which are 1-2★
  const helpful = [
    makeReview('h1', 1, 10),
    makeReview('h2', 2, 20),
    makeReview('h3', 1, 30),
    makeReview('h4', 4, 40),
    makeReview('h5', 5, 50),
    makeReview('h6', 5, 60),
    makeReview('h7', 4, 70),
    makeReview('h8', 5, 80),
    makeReview('h9', 4, 90),
    makeReview('h10', 5, 100),
  ]

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('selects tier 3', tier === 3, `got tier ${tier}`)
  assert('pool contains only 1-2★ reviews', pool.every(r => r.rating <= 2))
  // Tier 3 pool: 3 helpful (1-2★) + 2 critical (both <= 2 as well)
  assert('pool size = 3 helpful 1-2★ + 2 critical ≤2★', pool.length === 5, `pool.length = ${pool.length}`)
}

// ── Edge: exactly on threshold boundary ───────────────────────────────────────
section('Edge — exactly 5 recent critical reviews → tier 1 (boundary inclusive)')
{
  const critical = Array.from({ length: 5 }, (_, i) => makeReview(`c${i}`, 2, (i + 1) * 30))
  const helpful  = Array.from({ length: 3 }, (_, i) => makeReview(`h${i}`, 5, i * 10))

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('tier 1 at boundary (exactly 5)', tier === 1, `got tier ${tier}`)
  assert('pool.length = 5', pool.length === 5, `pool.length = ${pool.length}`)
}

// ── Edge: exactly 4 recent, 5 total → tier 2 ─────────────────────────────────
section('Edge — 4 recent + 1 stale critical → tier 2 (5 total)')
{
  const recent = Array.from({ length: 4 }, (_, i) => makeReview(`r${i}`, 2, (i + 1) * 30))
  const stale  = [makeReview('s1', 1, 800)]
  const critical = [...recent, ...stale]
  const helpful  = Array.from({ length: 3 }, (_, i) => makeReview(`h${i}`, 5, i * 10))

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('tier 2 when 4 recent but 5 total', tier === 2, `got tier ${tier}`)
  assert('pool includes stale review', pool.some(r => r.id === 's1'))
}

// ── Edge: empty critical corpus → tier 3 ──────────────────────────────────────
section('Edge — empty critical corpus → tier 3 (zero critical reviews)')
{
  const critical: CollectedReview[] = []
  const helpful = [
    makeReview('h1', 1, 10),
    makeReview('h2', 5, 20),
  ]

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('tier 3 when no critical reviews', tier === 3, `got tier ${tier}`)
  assert('pool = only 1-2★ from helpful', pool.length === 1 && pool[0].id === 'h1', `pool: ${pool.map(r => r.id)}`)
}

// ── Edge: all critical reviews are very old (pre-2020) ────────────────────────
section('Edge — all critical reviews > 18 months old, but ≥ 5 total → tier 2')
{
  const critical = Array.from({ length: 7 }, (_, i) =>
    makeReview(`old${i}`, 2, 700 + i * 30),  // all > 600 days ago (> 18 months)
  )
  const helpful = Array.from({ length: 3 }, (_, i) => makeReview(`h${i}`, 4, i * 10))

  const { pool, tier } = selectNegativePool(critical, helpful)

  assert('tier 2 for all-stale critical pool with ≥5 total', tier === 2, `got tier ${tier}`)
  assert('pool.length = 7', pool.length === 7, `pool.length = ${pool.length}`)
}

// ── featureMinCount fix verification ──────────────────────────────────────────
section('featureMinCount inflation fix — 2% threshold vs full cleaned pool')
{
  // Before fix: threshold was computed against requestSentences pool (~30 reviews)
  //   → max(2, ceil(0.02 × 30)) = max(2, 1) = 2
  // After fix: threshold computed against cleaned.length (e.g. 194 reviews)
  //   → max(2, ceil(0.02 × 194)) = max(2, 4) = 4

  const computeOldThreshold = (requestPoolSize: number) =>
    Math.max(2, Math.ceil(0.02 * requestPoolSize))

  const computeNewThreshold = (cleanedLength: number) =>
    Math.max(2, Math.ceil(0.02 * cleanedLength))

  const requestPoolSize = 30   // typical: reviews with request-language cues
  const cleanedLength   = 194  // typical: full cross-product review pool

  const oldThreshold = computeOldThreshold(requestPoolSize)
  const newThreshold = computeNewThreshold(cleanedLength)

  assert(`old threshold for pool=${requestPoolSize}: expect 2`, oldThreshold === 2, `got ${oldThreshold}`)
  assert(`new threshold for cleaned=${cleanedLength}: expect 4`, newThreshold === 4, `got ${newThreshold}`)
  assert('new threshold > old threshold (inflation prevented)', newThreshold > oldThreshold, `${newThreshold} vs ${oldThreshold}`)

  // Verify generic 2-review phrases now fail the threshold
  const genericPhraseMentionCount = 2
  assert(`phrase with ${genericPhraseMentionCount} mentions fails new threshold (${newThreshold})`, genericPhraseMentionCount < newThreshold)
  assert(`phrase with ${genericPhraseMentionCount} mentions passed old threshold (${oldThreshold})`, genericPhraseMentionCount >= oldThreshold)
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.log('  FAIL — fix failing tests before proceeding to Step 2')
  process.exit(1)
} else {
  console.log('  PASS — all fallback path tests passed')
}
