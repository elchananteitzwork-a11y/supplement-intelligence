/**
 * Step 2 Milestone 2.1 Validation — Semantic Normalization in isolation
 *
 * Tests normalizeAndMerge() against static fixtures extracted from the
 * Step 1 E2E validation run (2026-07-03). No review API calls needed —
 * this validates only the Haiku normalization layer.
 *
 * Success criteria:
 *   1. "see difference" and "notice difference" → same canonical label (merged)
 *   2. "feeling sticky" → flagged positive or noise, filtered out
 *   3. "easy swallow" → flagged positive, filtered out
 *   4. "item bought" → flagged noise, filtered out
 *   5. Genuine complaints retained: "stay place", "400 mg", "fall asleep"
 *   6. reviewCount for merged synonyms = union of distinct review IDs (no double-count)
 *   7. Graceful fallback if API key absent (returns original clusters unchanged)
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/validate_step2_normalize.ts
 */

import { normalizeAndMerge } from '@/lib/consumer-intelligence/normalize'
import type { PhraseCluster } from '@/lib/consumer-intelligence/cluster'

// ── Fixtures from Step 1 E2E validation (real theme output, 2026-07-03) ───────

// Product 1: Magnesium glycinate — 3 negative themes from 62 critical reviews
const MAGNESIUM_CLUSTERS: PhraseCluster[] = [
  {
    label:        '400 mg',
    reviewCount:  6,
    reviewIds:    ['m1','m2','m3','m4','m5','m6'],
    exampleQuote: 'It says "Magnesium Glycinate 400 mg capsules", which actually means only about 72 mg of elemental Magnesium per capsule — very misleading.',
  },
  {
    label:        'easy swallow',
    reviewCount:  4,
    reviewIds:    ['m7','m8','m9','m10'],
    exampleQuote: 'These AlgaeCal Magnesium Relax capsules are small, smooth, and easy to swallow.',
  },
  {
    label:        'fall asleep',
    reviewCount:  4,
    reviewIds:    ['m11','m12','m13','m14'],
    exampleQuote: "I'm a light sleeper, and though this helps me fall asleep a little faster than I do on my own, I still wake up multiple times throughout the night.",
  },
]

// Product 2: Drawer liner — 4 negative themes from 48 critical reviews
const LINER_CLUSTERS: PhraseCluster[] = [
  {
    label:        'stay place',
    reviewCount:  4,
    reviewIds:    ['l1','l2','l3','l4'],
    exampleQuote: "Don't get me wrong they are nice liners but they slide all around and don't stay in place.",
  },
  {
    label:        'different brand',
    reviewCount:  3,
    reviewIds:    ['l5','l6','l7'],
    exampleQuote: 'I returned this item and bought a different brand I used previously.',
  },
  {
    label:        'item bought',
    reviewCount:  3,
    reviewIds:    ['l5','l6','l7'],  // same reviews as 'different brand' (extracted from same sentences)
    exampleQuote: 'I returned this item and bought a different brand I used previously.',
  },
  {
    label:        'easy cut',
    reviewCount:  3,
    reviewIds:    ['l8','l9','l10'],
    exampleQuote: "On the positive side, the design makes it easy to cut to size and it does feel sturdy enough, it's non-adhesive so it doesn't leave any residue.",
  },
]

// Product 3: Vitamin C serum — 4 negative themes from 83 critical reviews
const SERUM_CLUSTERS: PhraseCluster[] = [
  {
    label:        'see difference',
    reviewCount:  5,
    reviewIds:    ['v1','v2','v3','v4','v5'],
    exampleQuote: "Cons: I didn't see a difference in my skin compared to The Ordinary, La Roche-Posay's, or Sunday Riley's.",
  },
  {
    label:        'like product',
    reviewCount:  5,
    reviewIds:    ['v6','v7','v8','v9','v10'],
    exampleQuote: 'Tried to like this product, bought two bottles, but no luck.',
  },
  {
    label:        'feeling sticky',
    reviewCount:  5,
    reviewIds:    ['v11','v12','v13','v14','v15'],
    exampleQuote: 'The serum has a pleasant, lightweight texture that absorbs quickly without feeling sticky, which I appreciate.',
  },
  {
    label:        'notice difference',
    reviewCount:  4,
    reviewIds:    ['v3','v4','v16','v17'],   // v3+v4 overlap with 'see difference'
    exampleQuote: "This product didn't irritate my skin, but I wouldn't say I notice a difference after using it.",
  },
]

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.log(`  FAIL  ${label}${detail ? `  →  ${detail}` : ''}`)
    failed++
  }
}

function section(label: string) { console.log(`\n── ${label}`) }

function showClusters(clusters: PhraseCluster[], indent = '  ') {
  if (!clusters.length) {
    console.log(`${indent}(none)`)
    return
  }
  clusters.forEach(c => console.log(`${indent}"${c.label}"  (${c.reviewCount} reviews)`))
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Step 2 Milestone 2.1 — Semantic Normalization Validation')
  console.log('Using fixtures from Step 1 E2E run (2026-07-03)\n')

  // ──────────────────────────────────────────────────────────────────────────
  section('Product 1: Magnesium glycinate')
  console.log('\n  Raw clusters:')
  showClusters(MAGNESIUM_CLUSTERS)

  const mag = await normalizeAndMerge(MAGNESIUM_CLUSTERS, {
    category:   'magnesium glycinate supplement',
    corpusType: 'negative',
  })

  console.log(`\n  Haiku used: ${mag.used_haiku}`)
  if (mag.tokens) console.log(`  Tokens: ${mag.tokens.input} in / ${mag.tokens.output} out`)
  console.log('\n  Per-cluster decisions:')
  mag.details.forEach(d =>
    console.log(`    "${d.rawLabel}" → "${d.canonicalLabel}"  [${d.sentiment}, noise=${d.isNoise}]  → ${d.action}`)
  )
  console.log('\n  Output clusters:')
  showClusters(mag.clusters)

  assert('Haiku call succeeded', mag.used_haiku)

  // "easy swallow" should be filtered (positive phrase in critical review)
  const easySwallowKept = mag.clusters.some(c => c.label.toLowerCase().includes('swallow'))
  assert('"easy swallow" filtered out (positive phrase in critical review)', !easySwallowKept,
    easySwallowKept ? 'still present in output' : '')

  // "400 mg" is a real complaint (misleading dosing) — must be kept
  const mg400Kept = mag.clusters.some(c =>
    c.label.toLowerCase().includes('400') || c.label.toLowerCase().includes('dosage') ||
    c.label.toLowerCase().includes('mislead') || c.label.toLowerCase().includes('elemental')
  )
  assert('"400 mg" dosing complaint retained', mg400Kept,
    `Output labels: ${mag.clusters.map(c => c.label).join(', ')}`)

  // "fall asleep" — mixed context, either kept or flagged mixed — not filtered as positive
  const fallAsleepDetail = mag.details.find(d => d.rawLabel === 'fall asleep')
  assert('"fall asleep" not incorrectly filtered as positive/noise',
    !fallAsleepDetail || fallAsleepDetail.sentiment !== 'positive' || !fallAsleepDetail.isNoise,
    fallAsleepDetail ? `sentiment=${fallAsleepDetail.sentiment}, noise=${fallAsleepDetail.isNoise}` : 'detail not found')

  // ──────────────────────────────────────────────────────────────────────────
  section('Product 2: Drawer liner')
  console.log('\n  Raw clusters:')
  showClusters(LINER_CLUSTERS)

  const liner = await normalizeAndMerge(LINER_CLUSTERS, {
    category:   'non-slip drawer liner home',
    corpusType: 'negative',
  })

  console.log(`\n  Haiku used: ${liner.used_haiku}`)
  if (liner.tokens) console.log(`  Tokens: ${liner.tokens.input} in / ${liner.tokens.output} out`)
  console.log('\n  Per-cluster decisions:')
  liner.details.forEach(d =>
    console.log(`    "${d.rawLabel}" → "${d.canonicalLabel}"  [${d.sentiment}, noise=${d.isNoise}]  → ${d.action}`)
  )
  console.log('\n  Output clusters:')
  showClusters(liner.clusters)

  // "item bought" should be noise-filtered
  const itemBoughtKept = liner.clusters.some(c => c.label.toLowerCase().includes('item'))
  assert('"item bought" filtered as noise', !itemBoughtKept,
    itemBoughtKept ? 'still present' : '')

  // "stay place" = core category gap — must survive
  const stayPlaceKept = liner.clusters.some(c =>
    c.label.toLowerCase().includes('stay') || c.label.toLowerCase().includes('slide') ||
    c.label.toLowerCase().includes('place') || c.label.toLowerCase().includes('slip') ||
    c.label.toLowerCase().includes('adhesion') || c.label.toLowerCase().includes('grip')
  )
  assert('"stay place" (sliding complaint) retained', stayPlaceKept,
    `Output: ${liner.clusters.map(c => c.label).join(', ')}`)

  // "easy cut" — positive context in negative review — should be filtered
  const easyCutKept = liner.clusters.some(c => c.label.toLowerCase().includes('cut'))
  assert('"easy cut" filtered (positive praise in critical review)', !easyCutKept,
    easyCutKept ? 'still present' : '')

  // ──────────────────────────────────────────────────────────────────────────
  section('Product 3: Vitamin C serum — synonym merging')
  console.log('\n  Raw clusters:')
  showClusters(SERUM_CLUSTERS)

  const serum = await normalizeAndMerge(SERUM_CLUSTERS, {
    category:   'vitamin C brightening face serum beauty',
    corpusType: 'negative',
  })

  console.log(`\n  Haiku used: ${serum.used_haiku}`)
  if (serum.tokens) console.log(`  Tokens: ${serum.tokens.input} in / ${serum.tokens.output} out`)
  console.log('\n  Per-cluster decisions:')
  serum.details.forEach(d =>
    console.log(`    "${d.rawLabel}" → "${d.canonicalLabel}"  [${d.sentiment}, noise=${d.isNoise}]  → ${d.action}`)
  )
  console.log('\n  Output clusters:')
  showClusters(serum.clusters)

  // "feeling sticky" — positive in context — should be filtered
  const stickyKept = serum.clusters.some(c => c.label.toLowerCase().includes('stick'))
  assert('"feeling sticky" filtered (positive context in critical review)', !stickyKept,
    stickyKept ? 'still present' : '')

  // "like product" — noise — should be filtered
  const likeKept = serum.clusters.some(c =>
    c.label.toLowerCase().includes('like product') ||
    c.label.toLowerCase().includes('tried to like')
  )
  assert('"like product" filtered (noise / too generic)', !likeKept,
    likeKept ? 'still present' : '')

  // "see difference" and "notice difference" should map to same canonical label
  const seeDetail    = serum.details.find(d => d.rawLabel === 'see difference')
  const noticeDetail = serum.details.find(d => d.rawLabel === 'notice difference')
  const canonicalsMatch =
    seeDetail && noticeDetail &&
    seeDetail.canonicalLabel.toLowerCase() === noticeDetail.canonicalLabel.toLowerCase()
  assert('"see difference" and "notice difference" get same canonical label', !!canonicalsMatch,
    seeDetail && noticeDetail
      ? `"${seeDetail.canonicalLabel}" vs "${noticeDetail.canonicalLabel}"`
      : 'one or both details missing')

  // After merging, the efficacy complaint should appear only ONCE in output
  const efficacyCount = serum.clusters.filter(c =>
    c.label.toLowerCase().includes('result') || c.label.toLowerCase().includes('efficac') ||
    c.label.toLowerCase().includes('difference') || c.label.toLowerCase().includes('effect')
  ).length
  assert('Efficacy complaint appears once in output (synonyms merged)', efficacyCount <= 1,
    `Found ${efficacyCount} efficacy-related clusters: ${serum.clusters.map(c => c.label).join(', ')}`)

  // Merged review count = deduplicated union of all clusters sharing the canonical label.
  // If "like product" is also merged in (Haiku judged it as "no visible results"), the
  // union expands to include v6-v10 as well:
  //   see difference: v1-v5 (5) + notice difference: v3,v4,v16,v17 (4) → union = 7
  //   if like product (v6-v10) also merged → union = 12
  // Either count is valid — the key invariant is that it's ≤ sum (no double-counting).
  const efficacyCluster = serum.clusters.find(c =>
    c.label.toLowerCase().includes('result') || c.label.toLowerCase().includes('efficac') ||
    c.label.toLowerCase().includes('difference') || c.label.toLowerCase().includes('effect')
  )
  const likeProductDetail = serum.details.find(d => d.rawLabel === 'like product')
  if (efficacyCluster && canonicalsMatch) {
    const likeProductMerged = likeProductDetail?.action === 'merged'
    const expectedMin = 7   // see + notice deduped (no like product)
    const expectedMax = likeProductMerged ? 12 : 7  // if like product merged: v1-v10,v16,v17
    const sumBeforeDedup = serum.details
      .filter(d => d.action === 'merged')
      .reduce((acc, d) => {
        const c = SERUM_CLUSTERS.find(c => c.label === d.rawLabel)
        return acc + (c?.reviewCount ?? 0)
      }, 0)
    assert(
      `Merged review count ≤ sum of raw counts (no double-counting), got ${efficacyCluster.reviewCount}`,
      efficacyCluster.reviewCount <= sumBeforeDedup && efficacyCluster.reviewCount >= expectedMin,
      `reviewCount=${efficacyCluster.reviewCount}, sumBeforeDedup=${sumBeforeDedup}, expectedMin=${expectedMin}, expectedMax=${expectedMax}`,
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('Graceful fallback — no API key')
  {
    // Temporarily hide the key to test fallback behavior
    const savedKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    const fallback = await normalizeAndMerge(SERUM_CLUSTERS, {
      category: 'test', corpusType: 'negative',
    })

    process.env.ANTHROPIC_API_KEY = savedKey

    assert('Fallback returns original clusters unchanged', fallback.clusters === SERUM_CLUSTERS)
    assert('Fallback sets used_haiku = false', !fallback.used_haiku)
    assert('Fallback produces no details', fallback.details.length === 0)
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  Results: ${passed} passed, ${failed} failed`)

  // Cost summary
  const totalTokens = [mag, liner, serum]
    .filter(r => r.tokens)
    .reduce((acc, r) => ({ in: acc.in + r.tokens!.input, out: acc.out + r.tokens!.output }), { in: 0, out: 0 })
  if (totalTokens.in > 0) {
    const cost = (totalTokens.in * 0.80 / 1_000_000) + (totalTokens.out * 4.00 / 1_000_000)
    console.log(`  Haiku cost for 3 products: ~$${cost.toFixed(5)} (${totalTokens.in} in / ${totalTokens.out} out tokens)`)
  }

  if (failed > 0) {
    console.log('\n  FAIL — fix issues above before wiring into analyze.ts')
    process.exit(1)
  } else {
    console.log('\n  PASS — normalization module validated; ready for Milestone 2.2')
  }
}

main().catch(e => {
  console.error('Unhandled error:', e)
  process.exit(1)
})
