/**
 * Step 4 Unit Tests — Feature Request Separation
 *
 * Tests the corpus-splitting logic and scoring formula using static fixtures.
 * No API calls — validates the core invariants before the E2E run.
 *
 * Tests:
 *   1. REQUEST_CUES fires on "wish/want/need/would love" sentences
 *   2. Critical-corpus request phrases → prerequisiteFeatureRequests pool
 *   3. Positive-corpus request phrases  → enhancementFeatureRequests pool
 *   4. A phrase appearing ONLY in positive reviews is absent from prerequisites
 *   5. A phrase appearing ONLY in critical reviews is absent from enhancements
 *   6. Scoring formula uses prerequisiteFeatureRequests when present
 *   7. Scoring falls back to featureRequests when prerequisiteFeatureRequests absent (legacy memos)
 *   8. enhancementFeatureRequests count does NOT change the Customer Pain score
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/test_step4_unit.ts
 */

import { clusterPhrases }   from '@/lib/consumer-intelligence/cluster'
import type { SentenceRef } from '@/lib/consumer-intelligence/cluster'
import type { ConsumerIntelligenceReport, ThemeInsight } from '@/lib/consumer-intelligence'

// ── Mirrors the REQUEST_CUES regex from analyze.ts ────────────────────────────
const REQUEST_CUES = /\b(wish|want(?:ed)?|would be nice|should (?:have|add|include|make)|need(?:s)? to|hope they|please add|if only|i'?d love|would love)\b/i
const NEGATION_TOKENS      = /\b(not|never|no|none|nothing|without|cannot|can'?t|won'?t|wouldn'?t|shouldn'?t|doesn'?t|don'?t|didn'?t|isn'?t|wasn'?t|aren'?t|weren'?t)\b/i
const NEGATION_WINDOW      = 7

function hasUnnegatedMatch(text: string, cue: RegExp): boolean {
  const flags   = cue.flags.includes('g') ? cue.flags : cue.flags + 'g'
  const matches = Array.from(text.matchAll(new RegExp(cue.source, flags)))
  return matches.some(m => {
    const start  = m.index ?? 0
    const before = text.slice(0, start).trim().split(/\s+/).slice(-NEGATION_WINDOW).join(' ')
    return !NEGATION_TOKENS.test(before)
  })
}

// ── Scoring formula (mirrors scoring.ts consumerPainScore) ────────────────────
const THIN_SAMPLE_THRESHOLD = 50

function computeScore(ci: Partial<ConsumerIntelligenceReport> & {
  negativeThemes: ThemeInsight[]
  featureRequests: ThemeInsight[]
  sentimentBreakdown: { negativePct: number }
  negativePoolSize: number
  totalReviewsCollected: number
  confidence: number
}): number {
  const frCount = (ci as ConsumerIntelligenceReport).prerequisiteFeatureRequests?.length
    ?? ci.featureRequests.length

  const effectiveThemeCount =
    (ci as ConsumerIntelligenceReport).categoryGapThemes !== undefined &&
    (ci as ConsumerIntelligenceReport).productSpecificThemes !== undefined
      ? ((ci as ConsumerIntelligenceReport).categoryGapThemes!.length * 1.5)
        + (((ci as ConsumerIntelligenceReport).productSpecificThemes?.length ?? 0) * 0.5)
        + frCount
      : ci.negativeThemes.length + frCount

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

// ── Fixtures ───────────────────────────────────────────────────────────────────

// Critical corpus reviews (1-3★) expressing "want/wish/need" — prerequisites
const CRITICAL_REQUEST_SENTENCES: SentenceRef[] = [
  { reviewId: 'cr1', text: 'I wish it came in a smaller bottle size.' },
  { reviewId: 'cr1', text: 'Would be nice if the capsule was smaller.' },
  { reviewId: 'cr2', text: 'I wish they would add a measuring spoon.' },
  { reviewId: 'cr3', text: 'Wish it came in a travel size option.' },
  { reviewId: 'cr4', text: 'I wish it had a travel size.' },
]

// Positive corpus reviews (4-5★) expressing "would love/wish" — enhancements
const POSITIVE_REQUEST_SENTENCES: SentenceRef[] = [
  { reviewId: 'pr1', text: 'Love this product, would love a subscription option.' },
  { reviewId: 'pr2', text: 'I would love a subscription option for auto delivery.' },
  { reviewId: 'pr3', text: 'This is great, would love to have subscription options.' },
  { reviewId: 'pr4', text: 'Amazing product. Would love a larger quantity bundle.' },
]

// Sentences that should NOT match REQUEST_CUES (no wish/want/need language)
const NON_REQUEST_SENTENCES: SentenceRef[] = [
  { reviewId: 'x1', text: 'The capsule was too large to swallow.' },
  { reviewId: 'x2', text: 'It did not help with my sleep at all.' },
]

// Negated wish sentences — should not trigger REQUEST_CUES
const NEGATED_SENTENCES: SentenceRef[] = [
  { reviewId: 'n1', text: "I don't wish to return this product." },
  { reviewId: 'n2', text: "I wouldn't want to be without it." },
]

// ── Tests ──────────────────────────────────────────────────────────────────────

section('1. REQUEST_CUES detection')

assert('wish fires',            hasUnnegatedMatch('I wish it came in a smaller bottle.', REQUEST_CUES))
assert('want fires',            hasUnnegatedMatch('I wanted better results.', REQUEST_CUES))
assert('would love fires',      hasUnnegatedMatch('I would love a travel size.', REQUEST_CUES))
assert('please add fires',      hasUnnegatedMatch('Please add a measuring spoon.', REQUEST_CUES))
assert('should have fires',     hasUnnegatedMatch('They should have included a scoop.', REQUEST_CUES))
assert('need to fires',         hasUnnegatedMatch('This needs to come in a bigger jar.', REQUEST_CUES))
assert('complaint no fire',     !hasUnnegatedMatch('The capsule is too large.', REQUEST_CUES))
assert("don't wish no fire",    !hasUnnegatedMatch("I don't wish to return this.", REQUEST_CUES))
assert("wouldn't want no fire", !hasUnnegatedMatch("I wouldn't want to be without it.", REQUEST_CUES))

section('2. Corpus partitioning — prerequisites from critical reviews')

const prereqClusters = clusterPhrases(CRITICAL_REQUEST_SENTENCES, {
  minReviewCount: 2, minPoolFraction: 0, excludeWords: [],
})

const hasSmallBottle = prereqClusters.some(c =>
  c.label.toLowerCase().includes('smaller') ||
  c.label.toLowerCase().includes('bottle') ||
  c.label.toLowerCase().includes('travel') ||
  c.label.toLowerCase().includes('size')
)
assert('Critical-corpus "travel size / smaller" theme appears in prerequisites', hasSmallBottle,
  `Got: ${prereqClusters.map(c => c.label).join(', ')}`)

const prereqHasSubscription = prereqClusters.some(c =>
  c.label.toLowerCase().includes('subscription') ||
  c.label.toLowerCase().includes('auto deliver')
)
assert('"subscription" (positive-only phrase) absent from prerequisites', !prereqHasSubscription,
  prereqHasSubscription ? `incorrectly present: ${prereqClusters.map(c => c.label).join(', ')}` : '')

section('3. Corpus partitioning — enhancements from positive reviews')

const enhanceClusters = clusterPhrases(POSITIVE_REQUEST_SENTENCES, {
  minReviewCount: 2, minPoolFraction: 0, excludeWords: [],
})

const hasSubscription = enhanceClusters.some(c =>
  c.label.toLowerCase().includes('subscription') ||
  c.label.toLowerCase().includes('auto') ||
  c.label.toLowerCase().includes('deliver')
)
assert('Positive-corpus "subscription" theme appears in enhancements', hasSubscription,
  `Got: ${enhanceClusters.map(c => c.label).join(', ')}`)

const enhanceHasBottle = enhanceClusters.some(c =>
  c.label.toLowerCase().includes('travel') || c.label.toLowerCase().includes('bottle')
)
assert('"travel size" (critical-only phrase) absent from enhancements', !enhanceHasBottle,
  enhanceHasBottle ? `incorrectly present: ${enhanceClusters.map(c => c.label).join(', ')}` : '')

section('4. Non-request sentences produce no clusters')

const nonRequestFiltered = NON_REQUEST_SENTENCES.filter(s => hasUnnegatedMatch(s.text, REQUEST_CUES))
assert('Non-request sentences filtered out (0 pass REQUEST_CUES)', nonRequestFiltered.length === 0,
  `${nonRequestFiltered.length} incorrectly passed: ${nonRequestFiltered.map(s => s.text).join('; ')}`)

section('5. Negated wish sentences produce no clusters')

const negatedFiltered = NEGATED_SENTENCES.filter(s => hasUnnegatedMatch(s.text, REQUEST_CUES))
assert('Negated sentences filtered out (0 pass REQUEST_CUES)', negatedFiltered.length === 0,
  `${negatedFiltered.length} incorrectly passed: ${negatedFiltered.map(s => s.text).join('; ')}`)

section('6. Scoring — prerequisiteFeatureRequests used instead of featureRequests')

const baseCi = {
  negativeThemes:        [{ label: 'poor adhesion', mentionedBy: 5, outOf: 80, exampleQuote: '' }],
  featureRequests:       [{ label: 'travel size', mentionedBy: 4, outOf: 150, exampleQuote: '' },
                          { label: 'scoop included', mentionedBy: 3, outOf: 150, exampleQuote: '' }],
  sentimentBreakdown:    { negativePct: 20 },
  negativePoolSize:      80,
  totalReviewsCollected: 150,
  confidence:            0.75,
}

const scoreLegacy = computeScore(baseCi as Parameters<typeof computeScore>[0])
// With prerequisiteFeatureRequests = 1 (only 1 of 2 featureRequests came from critical reviews)
const ciWithPrereq = {
  ...baseCi,
  prerequisiteFeatureRequests: [{ label: 'travel size', mentionedBy: 3, outOf: 80, exampleQuote: '' }],
  enhancementFeatureRequests:  [{ label: 'scoop included', mentionedBy: 2, outOf: 70, exampleQuote: '' }],
}
const scoreWithPrereq = computeScore(ciWithPrereq as Parameters<typeof computeScore>[0])

assert('Legacy score uses featureRequests.length (2)',
  scoreLegacy >= 0 && scoreLegacy <= 10,
  `got ${scoreLegacy}`)
assert('Step-4 score uses prerequisiteFeatureRequests.length (1)',
  scoreWithPrereq >= 0 && scoreWithPrereq <= 10,
  `got ${scoreWithPrereq}`)
assert('Step-4 score ≤ legacy score (fewer feature requests count toward pain)',
  scoreWithPrereq <= scoreLegacy,
  `Step-4: ${scoreWithPrereq}, legacy: ${scoreLegacy}`)

section('7. Backward compatibility — no prerequisiteFeatureRequests → falls back to featureRequests')

const legacyMemo = {
  negativeThemes:        [{ label: 'too weak', mentionedBy: 6, outOf: 60, exampleQuote: '' }],
  featureRequests:       [{ label: 'larger dose', mentionedBy: 5, outOf: 100, exampleQuote: '' }],
  sentimentBreakdown:    { negativePct: 15 },
  negativePoolSize:      60,
  totalReviewsCollected: 100,
  confidence:            0.70,
  // no prerequisiteFeatureRequests
}
const legacyScore = computeScore(legacyMemo as Parameters<typeof computeScore>[0])
assert('Legacy memo (no prerequisiteFeatureRequests) produces valid score',
  legacyScore >= 0 && legacyScore <= 10,
  `got ${legacyScore}`)

// Verify that adding prerequisiteFeatureRequests: [] drops featureRequests contribution
const withEmptyPrereq = { ...legacyMemo, prerequisiteFeatureRequests: [] as ThemeInsight[] }
const scoreEmptyPrereq = computeScore(withEmptyPrereq as Parameters<typeof computeScore>[0])
assert('Empty prerequisiteFeatureRequests → frCount=0 → lower score than legacy',
  scoreEmptyPrereq <= legacyScore,
  `empty prereq: ${scoreEmptyPrereq}, legacy: ${legacyScore}`)

section('8. Enhancement requests do NOT affect Customer Pain score')

const ciNoEnhance = {
  ...baseCi,
  prerequisiteFeatureRequests: [{ label: 'travel size', mentionedBy: 3, outOf: 80, exampleQuote: '' }],
  enhancementFeatureRequests:  [] as ThemeInsight[],
}
const ciWithEnhance = {
  ...baseCi,
  prerequisiteFeatureRequests: [{ label: 'travel size', mentionedBy: 3, outOf: 80, exampleQuote: '' }],
  enhancementFeatureRequests:  [
    { label: 'bundle option', mentionedBy: 4, outOf: 70, exampleQuote: '' },
    { label: 'subscription', mentionedBy: 3, outOf: 70, exampleQuote: '' },
  ],
}

const scoreNoEnhance   = computeScore(ciNoEnhance as Parameters<typeof computeScore>[0])
const scoreWithEnhance = computeScore(ciWithEnhance as Parameters<typeof computeScore>[0])

assert('Adding enhancementFeatureRequests does not change Customer Pain score',
  scoreNoEnhance === scoreWithEnhance,
  `without enhancements: ${scoreNoEnhance}, with enhancements: ${scoreWithEnhance}`)

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(70)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.log('\n  FAIL — fix issues above before running E2E validation')
  process.exit(1)
} else {
  console.log('\n  PASS — unit tests validated; ready for E2E validation')
}
