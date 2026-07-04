// Plain assertion script for lib/keyword-engine/relevance-guard.ts — no test
// framework (jest/vitest) is configured in this repo, so this follows the
// existing project convention of a runnable tsx script rather than adding
// new test infrastructure. Run with: npx tsx scripts/test-keyword-relevance-guard.ts
import {
  checkKeywordRelevance,
  checkKeywordIntent,
  checkKeywordSemanticRelevance,
  checkKeywordProductSignals,
} from '../lib/keyword-engine/relevance-guard'

// ── Layer 0: Intent classification ───────────────────────────────────────────

interface IntentCase { name: string; keyword: string; expectNavigational: boolean }
const intentCases: IntentCase[] = [
  // The production bug that prompted this layer
  { name: '"breakfast near me" must be rejected as navigational', keyword: 'breakfast near me', expectNavigational: true },
  // Other "near me" variants
  { name: '"coffee shop near you" must be rejected', keyword: 'coffee shop near you', expectNavigational: true },
  { name: '"gym near us" must be rejected', keyword: 'gym near us', expectNavigational: true },
  { name: '"pharmacy near here" must be rejected', keyword: 'pharmacy near here', expectNavigational: true },
  // Local-business operating patterns
  { name: '"restaurant open now" must be rejected', keyword: 'restaurant open now', expectNavigational: true },
  { name: '"pharmacy open today" must be rejected', keyword: 'pharmacy open today', expectNavigational: true },
  { name: '"urgent care hours of operation" must be rejected', keyword: 'urgent care hours of operation', expectNavigational: true },
  { name: '"business hours" must be rejected', keyword: 'business hours', expectNavigational: true },
  // Contact/wayfinding patterns
  { name: '"directions to the nearest store" must be rejected', keyword: 'directions to the nearest store', expectNavigational: true },
  { name: '"phone number" must be rejected', keyword: 'vitamin shoppe phone number', expectNavigational: true },
  // Reservations
  { name: '"book a table" must be rejected', keyword: 'book a table downtown', expectNavigational: true },
  { name: '"restaurant reservation" must be rejected', keyword: 'restaurant reservation online', expectNavigational: true },
  // True product/supplement keywords must NOT be rejected
  { name: '"magnesium glycinate supplement" must be allowed', keyword: 'magnesium glycinate supplement', expectNavigational: false },
  { name: '"creatine monohydrate powder" must be allowed', keyword: 'creatine monohydrate powder', expectNavigational: false },
  { name: '"best protein bar for muscle building" must be allowed', keyword: 'best protein bar for muscle building', expectNavigational: false },
  { name: '"sleep aid gummies" must be allowed', keyword: 'sleep aid gummies', expectNavigational: false },
  { name: '"collagen peptides for joint pain" must be allowed', keyword: 'collagen peptides for joint pain', expectNavigational: false },
  // Edge cases — contains "near" but not navigational
  { name: '"supplements near expiration" must be allowed (near ≠ near me)', keyword: 'supplements near expiration', expectNavigational: false },
  { name: '"collagen opens skin pores" must be allowed (open ≠ "open now")', keyword: 'collagen opens skin pores', expectNavigational: false },
]

let intentFailures = 0
console.log('── Layer 0: Intent Classification ──────────────────────────────────────────\n')
for (const c of intentCases) {
  const result = checkKeywordIntent(c.keyword)
  const pass = result.navigational === c.expectNavigational
  if (!pass) intentFailures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`)
  if (!pass || result.navigational) {
    console.log(`  keyword="${c.keyword}" -> navigational=${result.navigational} (expected ${c.expectNavigational})`)
    if (result.reason) console.log(`  reason: ${result.reason}`)
  }
}
console.log(`\n${intentCases.length - intentFailures}/${intentCases.length} intent tests passed\n`)

// ── Layer 1: Category-drift check (existing, now with intent as Layer 0) ─────

interface Case { name: string; original: string; candidate: string; expectAllowed: boolean }

const cases: Case[] = [
  {
    name: 'Senior Dog Mobility Support must NOT credit "mobility scooter"',
    original: 'Senior Dog Mobility Support', candidate: 'mobility scooter', expectAllowed: false,
  },
  {
    name: 'Probiotic for dogs must NOT credit generic "probiotic"',
    original: 'Probiotic for dogs', candidate: 'probiotic', expectAllowed: false,
  },
  {
    name: 'Scalp Microbiome Restoration must NOT credit gut-health keywords',
    original: 'Scalp Microbiome Restoration', candidate: '10 signs of an unhealthy gut', expectAllowed: false,
  },
  {
    name: 'Joint supplement for aging dogs SHOULD be allowed to broaden to "joint supplements for dogs"',
    original: 'joint supplement for aging dogs', candidate: 'joint supplements for dogs', expectAllowed: true,
  },
  {
    name: 'Cartilage Regeneration Collagen Peptides SHOULD be allowed to broaden to "collagen peptides"',
    original: 'Cartilage Regeneration Collagen Peptides', candidate: 'collagen peptides', expectAllowed: true,
  },
  // Supporting cases beyond the required 5, exercising the boundary the
  // required cases imply but don't directly cover.
  {
    name: 'Dropping ONLY a use-case qualifier (no species/body-area/product-type in query) must be allowed',
    original: 'weighted blanket for anxiety', candidate: 'weighted blanket', expectAllowed: true,
  },
  {
    name: 'A direct (non-broadened) exact match must always be allowed',
    original: 'magnesium glycinate', candidate: 'magnesium glycinate', expectAllowed: true,
  },
  {
    name: 'Species swap within the SAME category (cat query, dog candidate) must be rejected',
    original: 'calming chews for anxious cats', candidate: 'calming chews for dogs', expectAllowed: false,
  },
  {
    name: 'A human-demographic word must NOT rescue a dropped species word (found during validation)',
    original: 'Senior Dog Mobility Support', candidate: 'mobility aids for seniors near me', expectAllowed: false,
  },
  // Layer 0 wired into checkKeywordRelevance — navigational must be rejected
  // regardless of whether the original query has any recognized qualifier.
  {
    name: 'Creatine Breakfast Bar must NOT credit "breakfast near me" (production bug)',
    original: 'Creatine Breakfast Bar', candidate: 'breakfast near me', expectAllowed: false,
  },
  {
    name: 'No-qualifier product must NOT credit navigational keyword',
    original: 'Bitcoin Seed Phrase Metal Plates', candidate: 'hardware wallet store near me', expectAllowed: false,
  },
  {
    name: 'No-qualifier product SHOULD credit a genuine product keyword',
    original: 'Creatine Breakfast Bar', candidate: 'high protein breakfast bar', expectAllowed: true,
  },
]

console.log('── Layer 1: Category-drift (checkKeywordRelevance) ─────────────────────────\n')
let driftFailures = 0
for (const c of cases) {
  const result = checkKeywordRelevance(c.original, c.candidate)
  const pass = result.allowed === c.expectAllowed
  if (!pass) driftFailures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`)
  console.log(`  original="${c.original}" candidate="${c.candidate}" -> allowed=${result.allowed} (expected ${c.expectAllowed})`)
  console.log(`  reason: ${result.reason}`)
}

// ── Layer 1: Semantic product relevance ──────────────────────────────────────
// User-specified accept/reject examples. "Creatine Breakfast Bar" is the
// product query for all cases unless noted.

interface SemanticCase {
  name: string
  product: string
  keyword: string
  expectAllowed: boolean
}

const semanticCases: SemanticCase[] = [
  // ── Must REJECT (from user spec) ──────────────────────────────────────────
  // "hope breakfast bar" — restaurant/cafe brand name; shares only "breakfast"
  // (generic) and "bar" (ambiguous) with the product query; no ingredient signal.
  {
    name: '"hope breakfast bar" must be rejected — restaurant name, no product signal',
    product: 'Creatine Breakfast Bar', keyword: 'hope breakfast bar', expectAllowed: false,
  },
  // "healthy breakfast" — generic meal query; shares only "breakfast".
  {
    name: '"healthy breakfast" must be rejected — generic meal query',
    product: 'Creatine Breakfast Bar', keyword: 'healthy breakfast', expectAllowed: false,
  },
  // "breakfast recipes" — informational cooking query.
  {
    name: '"breakfast recipes" must be rejected — informational, not purchase intent',
    product: 'Creatine Breakfast Bar', keyword: 'breakfast recipes', expectAllowed: false,
  },
  // "best breakfast" — generic quality + generic meal, zero product signals.
  {
    name: '"best breakfast" must be rejected — no product signals',
    product: 'Creatine Breakfast Bar', keyword: 'best breakfast', expectAllowed: false,
  },
  // "protein foods" — generic nutrition category, no format word.
  {
    name: '"protein foods" must be rejected — ingredient without format word',
    product: 'Creatine Breakfast Bar', keyword: 'protein foods', expectAllowed: false,
  },

  // ── Must ACCEPT (from user spec) ──────────────────────────────────────────
  // "creatine bar" — shares anchor "creatine" from the product query.
  {
    name: '"creatine bar" must be accepted — shares anchor "creatine"',
    product: 'Creatine Breakfast Bar', keyword: 'creatine bar', expectAllowed: true,
  },
  // "protein breakfast bar" — no anchor match, but has 2 signals (protein+bar).
  {
    name: '"protein breakfast bar" must be accepted — protein+bar = 2 signals',
    product: 'Creatine Breakfast Bar', keyword: 'protein breakfast bar', expectAllowed: true,
  },
  // "high protein breakfast bar" — same, 2 signals.
  {
    name: '"high protein breakfast bar" must be accepted — protein+bar = 2 signals',
    product: 'Creatine Breakfast Bar', keyword: 'high protein breakfast bar', expectAllowed: true,
  },
  // "creatine supplement bar" — shares anchor "creatine".
  {
    name: '"creatine supplement bar" must be accepted — shares anchor "creatine"',
    product: 'Creatine Breakfast Bar', keyword: 'creatine supplement bar', expectAllowed: true,
  },

  // ── Additional edge cases ─────────────────────────────────────────────────
  // "magnesium glycinate" — two ingredient signals, no format word needed.
  {
    name: '"magnesium glycinate" must be accepted — two ingredient signals',
    product: 'Magnesium Glycinate Sleep Stack', keyword: 'magnesium glycinate', expectAllowed: true,
  },
  // "sleep supplement" — sleep (ingredient) + supplement (format) = 2 signals.
  {
    name: '"sleep supplement" must be accepted — sleep+supplement = 2 signals',
    product: 'Shift Worker Sleep Aid', keyword: 'sleep supplement', expectAllowed: true,
  },
  // Product with all-generic name skips the semantic check entirely.
  {
    name: 'All-generic product name skips semantic check (every keyword accepted)',
    product: 'Healthy Daily Wellness', keyword: 'healthy daily wellness', expectAllowed: true,
  },
  // Product signal check (scoring-time, no product query) ───────────────────
]

console.log('\n── Layer 1: Semantic product relevance (checkKeywordSemanticRelevance) ──────\n')
let semanticFailures = 0
for (const c of semanticCases) {
  const result = checkKeywordSemanticRelevance(c.product, c.keyword)
  const pass = result.allowed === c.expectAllowed
  if (!pass) semanticFailures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`)
  if (!pass || !result.allowed) {
    console.log(`  product="${c.product}" keyword="${c.keyword}" -> allowed=${result.allowed} (expected ${c.expectAllowed})`)
    console.log(`  reason: ${result.reason}`)
  }
}
console.log(`\n${semanticCases.length - semanticFailures}/${semanticCases.length} semantic tests passed`)

// ── Scoring-time product signal check (no product query context) ─────────────

interface SignalCase { name: string; keyword: string; expectValid: boolean }
const signalCases: SignalCase[] = [
  // Must REJECT at scoring time (user spec)
  { name: '"hope breakfast bar" must be scoring-rejected — bar alone is 1 signal', keyword: 'hope breakfast bar', expectValid: false },
  { name: '"healthy breakfast" must be scoring-rejected — 0 signals', keyword: 'healthy breakfast', expectValid: false },
  { name: '"breakfast recipes" must be scoring-rejected — 0 signals', keyword: 'breakfast recipes', expectValid: false },
  { name: '"best breakfast" must be scoring-rejected — 0 signals', keyword: 'best breakfast', expectValid: false },
  { name: '"protein foods" must be scoring-rejected — 1 signal (protein, no format)', keyword: 'protein foods', expectValid: false },
  // Must ACCEPT at scoring time (user spec)
  { name: '"creatine bar" must be scoring-accepted — strong ingredient', keyword: 'creatine bar', expectValid: true },
  { name: '"protein breakfast bar" must be scoring-accepted — 2 signals', keyword: 'protein breakfast bar', expectValid: true },
  { name: '"high protein breakfast bar" must be scoring-accepted — 2 signals', keyword: 'high protein breakfast bar', expectValid: true },
  { name: '"creatine supplement bar" must be scoring-accepted — strong ingredient', keyword: 'creatine supplement bar', expectValid: true },
  // Additional: single strong ingredient keyword
  { name: '"creatine" alone must be scoring-accepted — strong ingredient', keyword: 'creatine', expectValid: true },
  { name: '"magnesium glycinate" must be scoring-accepted — strong ingredient (glycinate)', keyword: 'magnesium glycinate', expectValid: true },
  { name: '"sleep aid supplement" must be scoring-accepted — 2 signals (sleep+supplement)', keyword: 'sleep aid supplement', expectValid: true },
]

console.log('\n── Scoring-time signal check (checkKeywordProductSignals) ───────────────────\n')
let signalFailures = 0
for (const c of signalCases) {
  const result = checkKeywordProductSignals(c.keyword)
  const pass = result.valid === c.expectValid
  if (!pass) signalFailures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`)
  if (!pass || !result.valid) {
    console.log(`  keyword="${c.keyword}" -> valid=${result.valid} (expected ${c.expectValid})`)
    console.log(`  reason: ${result.reason}`)
  }
}
console.log(`\n${signalCases.length - signalFailures}/${signalCases.length} scoring-signal tests passed`)

const totalFailures = intentFailures + driftFailures + semanticFailures + signalFailures
const totalTests = intentCases.length + cases.length + semanticCases.length + signalCases.length
console.log(`\n${cases.length - driftFailures}/${cases.length} category-drift tests passed`)
console.log(`\n══ Total: ${totalTests - totalFailures}/${totalTests} passed ══`)
if (totalFailures > 0) process.exit(1)
