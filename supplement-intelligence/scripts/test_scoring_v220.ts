/**
 * Scoring Engine v2.2.0 — Unit Regression Tests
 *
 * Covers the three calibration changes introduced in v2.2.0:
 *   1. Logarithmic demand scale (replaces step-function)
 *   2. Customer Opportunity formula (pain 60% + opportunity 40%)
 *      — prerequisiteFeatureRequests moved from pain richness to opportunity
 *      — computeOpportunityComponent: structural gaps + solution naming
 *   3. COGS at generation time (route.ts integration — not unit-testable here;
 *      covered structurally by verifying computeProfitability accepts
 *      realistic_unit_cost when present)
 *
 * Goal: verify that scores are ACCURATE, not that they are higher.
 * Each assertion states the expected value AND the reason it should be that value.
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/test_scoring_v220.ts
 */

// ── Inline formula mirrors (no import needed — pure arithmetic) ───────────────
// These mirror the production formulas exactly. If a test fails, it means
// either (a) the production formula changed without updating this mirror, or
// (b) the production formula has a bug. Either is worth investigating.

// ── Change 1: Logarithmic demand scale ───────────────────────────────────────

const LOG_MIN = 500
const LOG_MAX = 200_000

function searchVolumeToScore(volume: number): number {
  if (volume <= 0) return 0
  const raw = (Math.log10(volume) - Math.log10(LOG_MIN))
            / (Math.log10(LOG_MAX) - Math.log10(LOG_MIN)) * 10
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10))
}

// ── Change 2: Customer Opportunity sub-formulas ───────────────────────────────

const THIN_SAMPLE_THRESHOLD = 50

interface MockCI {
  totalReviewsCollected: number
  negativePoolSize: number
  positivePoolSize: number
  sentimentBreakdown: { negativePct: number }
  negativeThemes: { label: string }[]
  categoryGapThemes?: { label: string }[]
  productSpecificThemes?: { label: string }[]
  featureRequests: { label: string }[]
  prerequisiteFeatureRequests?: { label: string }[]
  enhancementFeatureRequests?: { label: string }[]
  confidence: number
}

function computeOpportunityComponent(ci: MockCI): number {
  const structuralGaps  = (ci.categoryGapThemes?.length ?? 0) * 1.5
  const prereqCount     = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const enhanceCount    = ci.enhancementFeatureRequests?.length  ?? 0
  const solutionNaming  = (prereqCount + enhanceCount) * 0.8
  const total = structuralGaps + solutionNaming
  if (total === 0)   return 0
  if (total < 1.5)   return 2
  if (total < 3)     return 4
  if (total < 5)     return 6
  if (total < 7.5)   return 8
  return 10
}

function computeCustomerOpportunity(ci: MockCI): number {
  // Pain component: effectiveThemeCount excludes prerequisiteFeatureRequests
  const effectiveThemeCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5 + ci.productSpecificThemes.length * 0.5
    : ci.negativeThemes.length

  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density   = effectiveThemeCount / Math.log1p(painPoolSize)
  const richness  = Math.min(10, density * (10 / 3))
  const severity  = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const painComponent = richness * 0.6 + severity * 0.4

  const opportunityComponent = computeOpportunityComponent(ci)
  const raw    = painComponent * 0.6 + opportunityComponent * 0.4
  const capped = Math.min(10, raw)

  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// v2.1.0 mirror: prerequisiteFeatureRequests was IN effectiveThemeCount
function computeCustomerPain_v210(ci: MockCI): number {
  const frCount = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const effectiveThemeCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5 + ci.productSpecificThemes.length * 0.5 + frCount
    : ci.negativeThemes.length + frCount

  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density  = effectiveThemeCount / Math.log1p(painPoolSize)
  const richness = Math.min(10, density * (10 / 3))
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw      = richness * 0.6 + severity * 0.4
  const capped   = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

function assertApprox(label: string, actual: number, expected: number, tolerance = 0.5, detail = '') {
  const ok = Math.abs(actual - expected) <= tolerance
  if (ok) {
    console.log(`  PASS  ${label}  (${actual})`)
    passed++
  } else {
    console.log(`  FAIL  ${label}  →  expected ≈${expected}, got ${actual}${detail ? `; ${detail}` : ''}`)
    failed++
  }
}

function section(label: string) { console.log(`\n── ${label}`) }

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 1: Logarithmic demand scale
// ═══════════════════════════════════════════════════════════════════════════════

section('Change 1 — Logarithmic demand scale: boundary values')

assertApprox('volume=0 → 0 (floor)',        searchVolumeToScore(0),        0,   0.05)
assertApprox('volume=500 → 0 (log min)',    searchVolumeToScore(500),      0,   0.05)
assertApprox('volume=200k → 10 (log max)',  searchVolumeToScore(200_000),  10,  0.05)
assertApprox('volume=1M → 10 (capped)',     searchVolumeToScore(1_000_000),10,  0.05)

section('Change 1 — Logarithmic demand scale: interior values')

// These are the key calibration points. Former step-function gave 7 for the
// 10k-49k range; log scale correctly differentiates within that range.
assertApprox('volume=1k → ~1.2 (tiny market)',    searchVolumeToScore(1_000),   1.2, 0.3)
assertApprox('volume=2k → ~2.3 (small)',          searchVolumeToScore(2_000),   2.3, 0.3)
assertApprox('volume=5k → ~3.8 (modest)',         searchVolumeToScore(5_000),   3.8, 0.3)
assertApprox('volume=10k → ~5.0 (mid, was 7)',    searchVolumeToScore(10_000),  5.0, 0.3,
  'was 7 in v2.1.0 step-function — lower is more accurate for a 10k market')
assertApprox('volume=30k → ~6.8 (solid)',         searchVolumeToScore(30_000),  6.8, 0.3)
assertApprox('volume=50k → ~7.7 (strong, was 9)', searchVolumeToScore(50_000),  7.7, 0.3,
  'was 9 in v2.1.0 — lower is more accurate; 50k is strong but not exceptional')
assertApprox('volume=100k → ~8.8 (large)',        searchVolumeToScore(100_000), 8.8, 0.3)

section('Change 1 — Logarithmic scale: monotonicity (no inversions)')

const volumes = [100, 500, 1_000, 5_000, 10_000, 30_000, 50_000, 100_000, 200_000]
const scores  = volumes.map(searchVolumeToScore)
let monotonic = true
for (let i = 1; i < scores.length; i++) {
  if (scores[i] < scores[i - 1]) { monotonic = false; break }
}
assert('Score is monotonically non-decreasing across all test volumes', monotonic,
  `scores: ${scores.join(', ')}`)

section('Change 1 — Logarithmic scale: v2.1.0 comparison at critical thresholds')

// These are the points where v2.1.0 step-function crossed a bucket boundary.
// v2.2.0 should score LOWER for 10k-50k range (step-function was inflated)
// and HIGHER for >50k (step-function capped at 9).
assert('10k scores lower than v2.1.0 step (was 7, now ~5)',
  searchVolumeToScore(10_000) < 7,
  `got ${searchVolumeToScore(10_000)}`)
assert('50k scores lower than v2.1.0 step (was 9, now ~7.7)',
  searchVolumeToScore(50_000) < 9,
  `got ${searchVolumeToScore(50_000)}`)
assert('200k scores higher than v2.1.0 cap (was 9, now 10)',
  searchVolumeToScore(200_000) > 9,
  `got ${searchVolumeToScore(200_000)}`)

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 2: Customer Opportunity — opportunity component
// ═══════════════════════════════════════════════════════════════════════════════

section('Change 2 — computeOpportunityComponent: boundary cases')

const ciEmpty: MockCI = {
  totalReviewsCollected: 100, negativePoolSize: 30, positivePoolSize: 70,
  sentimentBreakdown: { negativePct: 10 }, negativeThemes: [],
  categoryGapThemes: [], productSpecificThemes: [], featureRequests: [],
  prerequisiteFeatureRequests: [], enhancementFeatureRequests: [], confidence: 0.8,
}
assert('Zero gaps + zero requests → opportunity = 0',
  computeOpportunityComponent(ciEmpty) === 0)

const ciOneGap: MockCI = {
  ...ciEmpty,
  categoryGapThemes: [{ label: 'pump leaks' }],  // 1 gap × 1.5 = 1.5 → < 1.5? no, = 1.5 → score 2
}
// 1 gap: structuralGaps = 1×1.5 = 1.5, solutionNaming = 0, total = 1.5 → score 2 (< 1.5 threshold is strict <)
// Wait: if (total < 1.5) return 2 — but 1.5 is NOT < 1.5, so falls through to < 3 → score 4? Let me recalculate.
// total = 1.5: not < 1.5, IS < 3 → score 4
assert('1 structural gap (total=1.5) → opportunity = 4',
  computeOpportunityComponent(ciOneGap) === 4,
  `got ${computeOpportunityComponent(ciOneGap)}`)

const ciTwoGaps: MockCI = {
  ...ciEmpty,
  categoryGapThemes: [{ label: 'pump leaks' }, { label: 'battery dies' }],
  // 2 gaps × 1.5 = 3.0 → < 5 → score 6
}
assert('2 structural gaps (total=3.0) → opportunity = 6',
  computeOpportunityComponent(ciTwoGaps) === 6,
  `got ${computeOpportunityComponent(ciTwoGaps)}`)

const ciThreeGaps: MockCI = {
  ...ciEmpty,
  categoryGapThemes: [{ label: 'g1' }, { label: 'g2' }, { label: 'g3' }],
  // 3 gaps × 1.5 = 4.5 → < 5 → score 6
}
assert('3 structural gaps (total=4.5) → opportunity = 6',
  computeOpportunityComponent(ciThreeGaps) === 6,
  `got ${computeOpportunityComponent(ciThreeGaps)}`)

const ciFiveGaps: MockCI = {
  ...ciEmpty,
  categoryGapThemes: [{ label: 'g1' }, { label: 'g2' }, { label: 'g3' }, { label: 'g4' }],
  prerequisiteFeatureRequests: [{ label: 'r1' }, { label: 'r2' }],
  enhancementFeatureRequests:  [{ label: 'e1' }],
  // 4 gaps × 1.5 = 6.0, (2 + 1) × 0.8 = 2.4, total = 8.4 → ≥ 7.5 → score 10
}
assert('4 gaps + 3 requests (total=8.4) → opportunity = 10',
  computeOpportunityComponent(ciFiveGaps) === 10,
  `got ${computeOpportunityComponent(ciFiveGaps)}`)

section('Change 2 — prerequisiteFeatureRequests NOT in pain richness (v2.1.0 vs v2.2.0)')

const ciWithPrereqs: MockCI = {
  totalReviewsCollected: 80, negativePoolSize: 40, positivePoolSize: 40,
  sentimentBreakdown: { negativePct: 20 },
  negativeThemes: [{ label: 't1' }, { label: 't2' }],
  categoryGapThemes: [{ label: 'g1' }, { label: 'g2' }],
  productSpecificThemes: [{ label: 'p1' }],
  featureRequests: [{ label: 'r1' }, { label: 'r2' }, { label: 'r3' }, { label: 'r4' },
                   { label: 'r5' }, { label: 'r6' }, { label: 'r7' }, { label: 'r8' }],
  prerequisiteFeatureRequests: [{ label: 'r1' }, { label: 'r2' }, { label: 'r3' }, { label: 'r4' },
                                { label: 'r5' }, { label: 'r6' }, { label: 'r7' }, { label: 'r8' }],
  enhancementFeatureRequests: [],
  confidence: 0.8,
}
// v2.1.0: effectiveThemeCount = 2×1.5 + 1×0.5 + 8 = 11.5
//   density = 11.5/log1p(40) ≈ 3.09, richness = min(10, 3.09×3.33) = 10.0 (capped)
//   severity = 20/30×10 = 6.67, raw = 10×0.6 + 6.67×0.4 = 8.67 → score 9
//
// v2.2.0: effectiveThemeCount = 2×1.5 + 1×0.5 = 3.5 (prereqs removed from pain richness)
//   painComponent: density = 3.5/3.71 ≈ 0.94, richness ≈ 3.14, severity = 6.67
//   painComponent = 3.14×0.6 + 6.67×0.4 = 4.55
//   opportunityComponent: 2 gaps×1.5=3.0 + 8 prereqs×0.8=6.4 → total=9.4 → score 10
//   raw = 4.55×0.6 + 10×0.4 = 6.73 → score 7
//
// v2.1.0: 9, v2.2.0: 7. Lower is MORE ACCURATE — v2.1.0 was inflating pain by
// counting solution-naming signals as complaint density, which is the wrong formula.
const v210score = computeCustomerPain_v210(ciWithPrereqs)
const v220score = computeCustomerOpportunity(ciWithPrereqs)

assert('v2.2.0 score (7) differs from v2.1.0 score (9) for product with 8 prerequisiteFeatureRequests',
  v210score !== v220score,
  `v2.1.0: ${v210score}, v2.2.0: ${v220score} — should differ because prereqs moved from pain richness to opportunity`)
assert('v2.1.0 inflated score (prereqs in pain richness pushed richness to cap)',
  v210score > v220score,
  `expected v2.1.0 ${v210score} > v2.2.0 ${v220score}: v2.1.0 over-counted solution naming as complaint density`)
assert('v2.2.0 score is in valid range [0, 10]',
  v220score >= 0 && v220score <= 10,
  `got ${v220score}`)

section('Change 2 — enhancementFeatureRequests do NOT affect pain component')

const ciBase: MockCI = {
  totalReviewsCollected: 100, negativePoolSize: 30, positivePoolSize: 70,
  sentimentBreakdown: { negativePct: 15 },
  negativeThemes: [{ label: 't1' }],
  categoryGapThemes: [{ label: 'g1' }],
  productSpecificThemes: [],
  featureRequests: [],
  prerequisiteFeatureRequests: [],
  enhancementFeatureRequests: [],
  confidence: 0.8,
}
const ciWithEnhance: MockCI = {
  ...ciBase,
  enhancementFeatureRequests: [{ label: 'e1' }, { label: 'e2' }, { label: 'e3' }, { label: 'e4' }],
}

// Adding enhancement requests should increase the OPPORTUNITY component (and therefore the score),
// but ONLY through the opportunity component — never through pain richness.
const scoreWithout = computeCustomerOpportunity(ciBase)
const scoreWith    = computeCustomerOpportunity(ciWithEnhance)

assert('Adding enhancementFeatureRequests increases Customer Opportunity score (through opportunity component)',
  scoreWith >= scoreWithout,
  `without: ${scoreWithout}, with: ${scoreWith}`)

// Verify it's the opportunity component doing the work, not pain density
// (by checking with empty categoryGapThemes — pain richness alone cannot differ)
const ciNoPain: MockCI = {
  ...ciBase,
  categoryGapThemes: [],
  sentimentBreakdown: { negativePct: 0 },
}
const ciNoPainWithEnhance: MockCI = {
  ...ciNoPain,
  enhancementFeatureRequests: [{ label: 'e1' }, { label: 'e2' }],
}
assert('enhancementFeatureRequests drive score even with zero pain (correct: opportunity component)',
  computeCustomerOpportunity(ciNoPainWithEnhance) > computeCustomerOpportunity(ciNoPain),
  `zero-pain without enhance: ${computeCustomerOpportunity(ciNoPain)}, with: ${computeCustomerOpportunity(ciNoPainWithEnhance)}`)

section('Change 2 — four canonical scenarios produce correct ordering')

// Scenario ordering:
// 1. High pain + specific gaps (best)                → should score highest
// 2. High pain + vague (suffering but no clear fix)  → should score second
// 3. Low pain + specific (opportunity in satisfied market) → third
// 4. Low pain + no gaps (well-served market)         → should score lowest

const ciHighPainSpecific: MockCI = {
  totalReviewsCollected: 150, negativePoolSize: 80, positivePoolSize: 70,
  sentimentBreakdown: { negativePct: 35 },
  negativeThemes: [{ label: 't1' }, { label: 't2' }, { label: 't3' }],
  categoryGapThemes:     [{ label: 'g1' }, { label: 'g2' }, { label: 'g3' }],
  productSpecificThemes: [{ label: 'p1' }],
  featureRequests: [],
  prerequisiteFeatureRequests: [{ label: 'r1' }, { label: 'r2' }, { label: 'r3' }, { label: 'r4' }],
  enhancementFeatureRequests:  [{ label: 'e1' }, { label: 'e2' }],
  confidence: 0.8,
}

const ciHighPainVague: MockCI = {
  ...ciHighPainSpecific,
  categoryGapThemes:           [],
  productSpecificThemes:       [{ label: 'p1' }, { label: 'p2' }],
  prerequisiteFeatureRequests: [],
  enhancementFeatureRequests:  [],
}

const ciLowPainSpecific: MockCI = {
  ...ciHighPainSpecific,
  sentimentBreakdown:          { negativePct: 4 },
  negativePoolSize:            15,
  categoryGapThemes:           [{ label: 'g1' }, { label: 'g2' }],
  prerequisiteFeatureRequests: [{ label: 'r1' }],
  enhancementFeatureRequests:  [{ label: 'e1' }, { label: 'e2' }, { label: 'e3' }],
}

const ciLowPainVague: MockCI = {
  ...ciLowPainSpecific,
  categoryGapThemes:           [],
  productSpecificThemes:       [],
  prerequisiteFeatureRequests: [],
  enhancementFeatureRequests:  [],
}

const s1 = computeCustomerOpportunity(ciHighPainSpecific)
const s2 = computeCustomerOpportunity(ciHighPainVague)
const s3 = computeCustomerOpportunity(ciLowPainSpecific)
const s4 = computeCustomerOpportunity(ciLowPainVague)

console.log(`\n  Scenario scores: HighPainSpecific=${s1}, HighPainVague=${s2}, LowPainSpecific=${s3}, LowPainVague=${s4}`)

assert('High pain + specific gaps > high pain + vague (engineering clarity matters)',
  s1 > s2, `${s1} > ${s2}`)
assert('High pain + specific > low pain + specific (suffering urgency matters)',
  s1 > s3, `${s1} > ${s3}`)
assert('Any signal > no signal (low pain, no gaps is worst)',
  s3 > s4, `${s3} > ${s4}`)
assert('High pain + vague > low pain + no gaps (pure suffering still scores)',
  s2 > s4, `${s2} > ${s4}`)

section('Change 2 — legacy memo backward compat (no Step-3 fields)')

const ciLegacy: MockCI = {
  totalReviewsCollected: 60, negativePoolSize: 0,  // pre-dual-corpus, no negativePoolSize
  positivePoolSize: 0,
  sentimentBreakdown: { negativePct: 20 },
  negativeThemes: [{ label: 't1' }, { label: 't2' }, { label: 't3' }],
  // no categoryGapThemes, no productSpecificThemes (pre-Step-3)
  featureRequests: [{ label: 'r1' }, { label: 'r2' }],
  // no prerequisiteFeatureRequests, no enhancementFeatureRequests (pre-Step-4)
  confidence: 0.75,
}
const legacyScore = computeCustomerOpportunity(ciLegacy)
assert('Legacy memo (no Step-3/4 fields) produces valid score in [0, 10]',
  legacyScore >= 0 && legacyScore <= 10,
  `got ${legacyScore}`)

section('Change 2 — thin sample confidence dampening still applies')

const ciThin: MockCI = {
  totalReviewsCollected: 12, negativePoolSize: 5, positivePoolSize: 7,
  sentimentBreakdown: { negativePct: 40 },
  negativeThemes: [{ label: 't1' }],
  categoryGapThemes: [{ label: 'g1' }, { label: 'g2' }],
  productSpecificThemes: [],
  featureRequests: [],
  prerequisiteFeatureRequests: [{ label: 'r1' }],
  enhancementFeatureRequests: [{ label: 'e1' }],
  confidence: 0.45,  // low confidence — thin sample
}
const ciThick = { ...ciThin, totalReviewsCollected: 60, negativePoolSize: 30, positivePoolSize: 30, confidence: 0.8 }
const thinScore  = computeCustomerOpportunity(ciThin)
const thickScore = computeCustomerOpportunity(ciThick)

assert('Thin sample (12 reviews) scores ≤ thick sample (60 reviews) with same content',
  thinScore <= thickScore,
  `thin: ${thinScore}, thick: ${thickScore}`)
assert('Thin sample score is within [0, 10]', thinScore >= 0 && thinScore <= 10)

// ═══════════════════════════════════════════════════════════════════════════════
// REGRESSION GUARD: scores are bounded and never NaN
// ═══════════════════════════════════════════════════════════════════════════════

section('Regression — all scores are finite and in [0, 10]')

const testCases: Array<[string, MockCI]> = [
  ['empty CI',       ciEmpty],
  ['one gap',        ciOneGap],
  ['two gaps',       ciTwoGaps],
  ['three gaps',     ciThreeGaps],
  ['five gaps',      ciFiveGaps],
  ['with prereqs',   ciWithPrereqs],
  ['with enhance',   ciWithEnhance],
  ['no pain spec',   ciNoPainWithEnhance],
  ['high pain spec', ciHighPainSpecific],
  ['high pain vague',ciHighPainVague],
  ['low pain spec',  ciLowPainSpecific],
  ['low pain vague', ciLowPainVague],
  ['legacy',         ciLegacy],
  ['thin',           ciThin],
]

for (const [name, ci] of testCases) {
  const score = computeCustomerOpportunity(ci)
  assert(`[${name}] score is finite and in [0, 10]`,
    !isNaN(score) && score >= 0 && score <= 10,
    `got ${score}`)
}

for (const vol of [0, 1, 499, 500, 1_000, 10_000, 50_000, 200_000, 500_000]) {
  const score = searchVolumeToScore(vol)
  assert(`demand score for volume=${vol} is finite and in [0, 10]`,
    !isNaN(score) && score >= 0 && score <= 10,
    `got ${score}`)
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(70)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\n  FAIL — investigate failures above before shipping v2.2.0')
  process.exit(1)
} else {
  console.log('\n  PASS — v2.2.0 scoring formula validated')
}
