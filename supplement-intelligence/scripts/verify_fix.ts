/**
 * Quick re-verification: feed the exact dimension scores from the full run
 * into computeGroundedScore with the FIXED mostConservative and confirm verdicts.
 *
 * Bypasses the full provider pipeline (no API calls). Uses a synthetic MemoData
 * built from the dimension scores the full run already measured.
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/verify_fix.ts
 */

import { computeGroundedScore } from '@/lib/scoring'
import type { MemoData } from '@/types/index'

// ── Synthetic MemoData helpers ──────────────────────────────────────────────
// Each product: build a minimal MemoData that produces the observed dimension
// scores. The scoring composites read from signal_evidence, keyword_intelligence,
// and consumer_intelligence — we set only the fields each composite actually reads.

function makeMemo(opts: {
  label:                string
  // Demand
  keywordVolume:        number | null
  keywordGrowthPct:     number | null
  keywordDifficulty:    number | null
  keywordCpc:           number | null
  keywordBucket:        Array<{ monthly_searches: number }>  // for breadth boost
  // Market Accessibility
  reviewVelocityScore:  number | null   // from apify-amazon-search
  competitionScore:     number | null   // from keepa
  // Profitability
  referralFeePct:       number | null
  fbaFeeStr:            string | null
  avgPriceStr:          string | null
  // Consumer Pain
  negativeThemeCount:   number
  featureRequestCount:  number
  totalReviews:         number
  negativePct:          number
  reviewConfidence:     number
  repurchaseRate:       number | null   // mentionedBy/outOf
  repurchaseOutOf:      number
  // Virality
  viralityScore:        number | null
}): MemoData {
  const base: MemoData = {
    category_name:     opts.label,
    executive_summary: 'Synthetic test memo',
    build_decision:    'BUILD_NOW',
    build_explanation: 'test',
    opportunity_score: 0,
    market_size:       '$100M',
    gross_margin:      '60%',
    scores: {
      demand:        { level: 'High', notes: 'test' },
      virality:      { level: 'High', notes: 'test' },
      subscription:  { level: 'Medium', notes: 'test' },
      manufacturing: { level: 'Low', notes: 'test' },
    },
    market_saturation: {
      maturity:              'Growing',
      dominant_brands:       'Various',
      concentration:         'Low',
      entry_difficulty:      'Medium',
      competitive_intensity: 'Medium',
    },
    biggest_competitor: { name: 'TestCo', revenue: '$1M', gap: 'test gap' },
    market_gaps:         ['a', 'b', 'c', 'd', 'e'],
    brand_opportunities: ['a', 'b', 'c', 'd', 'e'],
    customer_language: {
      frustrations: ['x'],
      desires:      ['x'],
      fears:        ['x'],
      ad_phrases:   [{ they_say: 'x', use_in_copy: 'x' }],
    },
    product_recommendation: {
      format:        'capsule',
      dosing:        '1/day',
      formula:       [{ ingredient: 'x', dose: 'x', role: 'x', evidence: '★★★' }],
      avoid:         ['x'],
      cogs_estimate: '$5',
      retail_price:  '$30',
      gross_margin:  '60%',
    },
    financial_projections: {
      gross_margin:        '60%',
      net_margin_at_scale: '20%',
      path_to_10m:         'test',
    },
  }

  // ── keyword_intelligence ──────────────────────────────────────────────────
  if (opts.keywordVolume !== null) {
    base.keyword_intelligence = {
      seed_keyword: 'test',
      top_buying: [
        {
          keyword:          'test keyword',
          monthly_searches: opts.keywordVolume,
          cpc:              opts.keywordCpc ?? null,
          difficulty:       opts.keywordDifficulty ?? null,
          growth_pct:       opts.keywordGrowthPct ?? null,
          competition:      null,
        },
        // Secondary keywords for breadth boost (their volumes matter, not the objects)
        ...opts.keywordBucket.map((b, i) => ({
          keyword:          `secondary ${i}`,
          monthly_searches: b.monthly_searches,
          cpc:              null,
          difficulty:       null,
          growth_pct:       null,
          competition:      null,
        })),
      ],
      opportunity:  [],
      long_tail:    [],
      fast_growing: [],
      provider:     'dataforseo',
      fetched_at:   new Date().toISOString(),
    }
  }

  // ── signal_evidence ───────────────────────────────────────────────────────
  const se: MemoData['signal_evidence'] = {
    providers_used:     [],
    overall_confidence: 0.7,
  }

  if (opts.reviewVelocityScore !== null) {
    se.review_velocity = {
      value: {
        score:           opts.reviewVelocityScore,
        confidence:      0.8,
        top_competitors: [],
      },
      sources:       ['apify-amazon-search'],
      primarySource: 'apify-amazon-search',
      confidence:    0.8,
    }
  }

  if (opts.competitionScore !== null) {
    se.competition = {
      value:         { score: opts.competitionScore, confidence: 0.7 },
      sources:       ['keepa'],
      primarySource: 'keepa',
      confidence:    0.7,
    }
  }

  if (opts.avgPriceStr !== null) {
    se.pricing = {
      value: {
        score:     5,
        confidence: 0.7,
        avg_price: opts.avgPriceStr,
        price_range: `$10–$50`,
      },
      sources:       ['keepa'],
      primarySource: 'keepa',
      confidence:    0.7,
    }
    se.revenue = {
      value: {
        score:                    6,
        confidence:               0.7,
        avg_referral_fee_pct:     opts.referralFeePct ?? undefined,
        avg_fba_pick_pack_fee:    opts.fbaFeeStr ?? undefined,
        est_monthly_revenue:      '$1M/mo',
      },
      sources:       ['keepa'],
      primarySource: 'keepa',
      confidence:    0.7,
    }
  } else if (opts.referralFeePct !== null) {
    se.revenue = {
      value: {
        score:                    6,
        confidence:               0.7,
        avg_referral_fee_pct:     opts.referralFeePct ?? undefined,
        avg_fba_pick_pack_fee:    opts.fbaFeeStr ?? undefined,
      },
      sources:       ['keepa'],
      primarySource: 'keepa',
      confidence:    0.7,
    }
  }

  if (opts.viralityScore !== null) {
    se.virality = {
      value: {
        score:      opts.viralityScore,
        confidence: 0.8,
      },
      sources:       ['tiktok'],
      primarySource: 'tiktok',
      confidence:    0.8,
    }
  }

  base.signal_evidence = se

  // ── consumer_intelligence ─────────────────────────────────────────────────
  base.consumer_intelligence = {
    totalReviewsCollected: opts.totalReviews,
    positivePoolSize:      Math.round(opts.totalReviews * 0.8),
    negativePoolSize:      Math.round(opts.totalReviews * 0.2),
    productsAnalyzed:      [{ productId: 'B000TEST', brand: 'TestBrand', reviewsCollected: opts.totalReviews }],
    dataSource:            'amazon-reviews',
    generatedAt:           new Date().toISOString(),
    negativeThemes:        Array.from({ length: opts.negativeThemeCount }, (_, i) => ({
      label: `theme${i}`, mentionedBy: 5, outOf: opts.totalReviews, exampleQuote: 'test',
    })),
    positiveThemes:        [],
    featureRequests:       Array.from({ length: opts.featureRequestCount }, (_, i) => ({
      label: `req${i}`, mentionedBy: 3, outOf: opts.totalReviews, exampleQuote: 'test',
    })),
    mostMentionedProblems: [],
    sentimentBreakdown: {
      avgRating:    4.0,
      totalReviews: opts.totalReviews,
      distribution: [],
      positivePct:  100 - opts.negativePct,
      neutralPct:   0,
      negativePct:  opts.negativePct,
    },
    repurchaseLanguage:    {
      mentionedBy: opts.repurchaseRate !== null ? Math.round(opts.repurchaseRate * opts.repurchaseOutOf) : 0,
      outOf:       opts.repurchaseOutOf,
    },
    confidence:            opts.reviewConfidence,
    symptomSignals:        [],
    tiktokPurchaseIntent:  undefined,
  }

  return base
}

// ── Product configs from full-run observation ────────────────────────────────

const products = [
  {
    label: 'magnesium L-threonate sleep supplement',
    expectedScoreBefore: 52,
    expectedVerdictBefore: 'SKIP',
    expectedVerdictAfter: 'VALIDATE_FURTHER',
    memo: makeMemo({
      label:               'magnesium L-threonate sleep supplement',
      keywordVolume:       49500,
      keywordGrowthPct:    108,
      keywordDifficulty:   35,
      keywordCpc:          2.25,
      keywordBucket:       [{ monthly_searches: 22000 }, { monthly_searches: 18000 }, { monthly_searches: 9900 },
                            { monthly_searches: 5400 }, { monthly_searches: 4400 }, { monthly_searches: 2900 },
                            { monthly_searches: 1600 }, { monthly_searches: 880 }, { monthly_searches: 590 }],
      reviewVelocityScore: 7,
      competitionScore:    8,
      referralFeePct:      15,
      fbaFeeStr:           '$4.64',
      avgPriceStr:         '$27',
      negativeThemeCount:  0,
      featureRequestCount: 0,
      totalReviews:        100,
      negativePct:         2,      // observed score=0 → negativePct < 4%
      reviewConfidence:    0.8,
      repurchaseRate:      0.02,   // repurchase score was 1/10
      repurchaseOutOf:     100,
      viralityScore:       8,
    }),
  },
  {
    label: 'creatine HCL gummies',
    expectedScoreBefore: 54,
    expectedVerdictBefore: 'SKIP',
    expectedVerdictAfter: 'VALIDATE_FURTHER',
    memo: makeMemo({
      label:               'creatine HCL gummies',
      keywordVolume:       9900,
      keywordGrowthPct:    63,
      keywordDifficulty:   42,
      keywordCpc:          1.98,
      keywordBucket:       [{ monthly_searches: 3600 }, { monthly_searches: 2400 }, { monthly_searches: 1800 },
                            { monthly_searches: 1300 }, { monthly_searches: 880 }, { monthly_searches: 720 },
                            { monthly_searches: 590 }, { monthly_searches: 390 }, { monthly_searches: 210 }],
      reviewVelocityScore: 7,
      competitionScore:    9,
      referralFeePct:      14.2,
      fbaFeeStr:           '$6.17',
      avgPriceStr:         null,
      negativeThemeCount:  0,
      featureRequestCount: 2,
      totalReviews:        51,
      negativePct:         8,      // pain score=3 suggests some negativePct
      reviewConfidence:    0.8,
      repurchaseRate:      0.02,
      repurchaseOutOf:     51,
      viralityScore:       9,
    }),
  },
  {
    label: 'mouth tape for sleep premium',
    expectedScoreBefore: 30,
    expectedVerdictBefore: 'SKIP',
    expectedVerdictAfter: 'SKIP',  // score < 50, correctly SKIP even after fix
    memo: makeMemo({
      label:               'mouth tape for sleep premium',
      keywordVolume:       390,
      keywordGrowthPct:    18,
      keywordDifficulty:   30,
      keywordCpc:          3.90,
      keywordBucket:       [{ monthly_searches: 210 }, { monthly_searches: 170 }, { monthly_searches: 140 },
                            { monthly_searches: 110 }, { monthly_searches: 90 }, { monthly_searches: 70 },
                            { monthly_searches: 50 }, { monthly_searches: 40 }, { monthly_searches: 30 }],
      reviewVelocityScore: 6,
      competitionScore:    8,
      referralFeePct:      14.2,
      fbaFeeStr:           '$6.17',
      avgPriceStr:         null,
      negativeThemeCount:  0,
      featureRequestCount: 0,
      totalReviews:        24,
      negativePct:         1,
      reviewConfidence:    0.65,
      repurchaseRate:      0.0,
      repurchaseOutOf:     24,
      viralityScore:       9,
    }),
  },
  {
    label: 'silicone scar tape sensitive skin',
    expectedScoreBefore: 52,
    expectedVerdictBefore: 'SKIP',
    expectedVerdictAfter: 'VALIDATE_FURTHER',
    memo: makeMemo({
      label:               'silicone scar tape sensitive skin',
      keywordVolume:       null,   // no DataForSEO data — falls back to se.demand
      keywordGrowthPct:    null,
      keywordDifficulty:   null,
      keywordCpc:          null,
      keywordBucket:       [],
      reviewVelocityScore: 8,
      competitionScore:    9,
      referralFeePct:      11.4,
      fbaFeeStr:           '$3.82',
      avgPriceStr:         '$14',
      negativeThemeCount:  0,
      featureRequestCount: 0,
      totalReviews:        100,
      negativePct:         2,
      reviewConfidence:    0.8,
      repurchaseRate:      0.04,
      repurchaseOutOf:     100,
      viralityScore:       9,
    }),
  },
  {
    label: 'red light therapy belt for back pain',
    expectedScoreBefore: 47,
    expectedVerdictBefore: 'SKIP',
    expectedVerdictAfter: 'SKIP',  // score < 50, correctly SKIP even after fix
    memo: makeMemo({
      label:               'red light therapy belt for back pain',
      keywordVolume:       1600,
      keywordGrowthPct:    817,    // BUT Event-driven/Decelerating → still +1 since >20%
      keywordDifficulty:   35,
      keywordCpc:          1.98,
      keywordBucket:       [{ monthly_searches: 1300 }, { monthly_searches: 880 }, { monthly_searches: 590 },
                            { monthly_searches: 390 }, { monthly_searches: 280 }, { monthly_searches: 170 },
                            { monthly_searches: 130 }, { monthly_searches: 90 }, { monthly_searches: 70 }],
      reviewVelocityScore: 8,
      competitionScore:    9,
      referralFeePct:      14.2,
      fbaFeeStr:           '$6.17',
      avgPriceStr:         null,
      negativeThemeCount:  0,
      featureRequestCount: 0,
      totalReviews:        100,
      negativePct:         2,
      reviewConfidence:    0.8,
      repurchaseRate:      0.0,
      repurchaseOutOf:     100,
      viralityScore:       9,
    }),
  },
]

// ── For silicone scar tape (no DataForSEO), inject Keepa demand signal ───────
// The product has Keepa demand (monthlySold-based BSR signal) but no DataForSEO.
// computeDemand() falls back to se.demand when keyword_intelligence is absent.
// Keepa's demand score for Beauty/80k units = high demand (observed: 9/10).
if (products[3].memo.signal_evidence) {
  products[3].memo.signal_evidence.demand = {
    value:         { score: 9, confidence: 0.7, primary_signal: 'monthlySold' },
    sources:       ['keepa'],
    primarySource: 'keepa',
    confidence:    0.7,
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log('  FIX VERIFICATION — computeGroundedScore with fixed mostConservative')
console.log('══════════════════════════════════════════════════════════════════════')
console.log('\n  Feeds the exact dimension scores from the full run into the fixed')
console.log('  computeGroundedScore and confirms verdicts match expectations.\n')

let allPass = true

for (const p of products) {
  const grounded = computeGroundedScore(p.memo)
  const scoreMatch   = grounded.score === p.expectedScoreBefore
  const verdictMatch = grounded.decision === p.expectedVerdictAfter

  const row = `  ${p.label.slice(0, 40).padEnd(40)} score=${grounded.score.toString().padStart(3)}  decision=${grounded.decision}`
  const scoreNote   = scoreMatch   ? '' : ` [SCORE MISMATCH: expected ${p.expectedScoreBefore}]`
  const verdictNote = verdictMatch ? '' : ` [VERDICT MISMATCH: expected ${p.expectedVerdictAfter}]`
  const status = verdictMatch ? '✓' : '✗'

  console.log(`  ${status} ${p.label.slice(0, 42).padEnd(42)} score=${grounded.score}/100  verdict=${grounded.decision}${scoreNote}${verdictNote}`)

  if (!verdictMatch || !scoreMatch) allPass = false
}

console.log('')
if (allPass) {
  console.log('  ✓ ALL CHECKS PASSED')
  console.log('  The mostConservative bug is fixed.')
  console.log('  Products 1, 2, 4 now correctly return VALIDATE_FURTHER (were SKIP).')
  console.log('  Products 3, 5 remain SKIP (score genuinely < 50).')
} else {
  console.log('  ✗ SOME CHECKS FAILED — see above')
}

console.log('')
console.log('  Before/after summary:')
console.log('  ┌─────────────────────────────────────────────────┬────────┬────────────────┬────────────────┐')
console.log('  │ Product                                         │ Score  │ Before (bug)   │ After (fixed)  │')
console.log('  ├─────────────────────────────────────────────────┼────────┼────────────────┼────────────────┤')
for (const p of products) {
  const g = computeGroundedScore(p.memo)
  const changed = p.expectedVerdictBefore !== p.expectedVerdictAfter
  const arrow = changed ? '→' : '='
  console.log(`  │ ${p.label.slice(0, 47).padEnd(47)} │ ${g.score.toString().padStart(3)}/100 │ ${p.expectedVerdictBefore.padEnd(14)} │ ${g.decision.padEnd(14)} │${changed ? ' ← FIXED' : ''}`)
}
console.log('  └─────────────────────────────────────────────────┴────────┴────────────────┴────────────────┘')
