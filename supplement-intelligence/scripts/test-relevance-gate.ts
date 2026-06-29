// Plain assertion script for the relevance-gate fix (lib/categories/
// relevance-matching.ts + the 5 category modules). No test framework is
// configured in this repo (see scripts/test-keyword-relevance-guard.ts for
// the same convention). isRelevantQuery is now async — see relevance-
// matching.ts's confirmRelevanceWithLLM for why. Run with:
// npx tsx --env-file=.env.local scripts/test-relevance-gate.ts
// (needs ANTHROPIC_API_KEY — the LLM-fallback cases make a real call)
import { homeModule, fitnessModule, petsModule, beautyModule, supplementsModule } from '../lib/categories'

interface Case { name: string; fn: (q: string) => Promise<boolean>; query: string; expect: boolean }

const cases: Case[] = [
  // Reported bug #1 (fixed previously): plural mismatch (HOME_TOKENS has 'curtain', not 'curtains')
  { name: 'Home: "blackout curtains for shift workers" (plural) ALLOWED',
    fn: homeModule.isRelevantQuery, query: 'blackout curtains for shift workers', expect: true },
  { name: 'Home: "blackout curtain for shift workers" (singular) still ALLOWED (no regression)',
    fn: homeModule.isRelevantQuery, query: 'blackout curtain for shift workers', expect: true },

  // Reported bug #2 (fixed previously): missing abbreviation (FITNESS_TOKENS had 'bcaa' but not 'eaa')
  { name: 'Fitness: "EAA supplement" ALLOWED',
    fn: fitnessModule.isRelevantQuery, query: 'EAA supplement', expect: true },
  { name: 'Fitness: "BCAA powder" still ALLOWED (no regression)',
    fn: fitnessModule.isRelevantQuery, query: 'BCAA powder', expect: true },

  // Other plural-mismatch instances of the same root cause, across other modules.
  { name: 'Pets: plural form of a singular-only vocab word is allowed (dog treats)',
    fn: petsModule.isRelevantQuery, query: 'dog treats for puppies', expect: true },
  { name: 'Beauty: plural "serums" matches singular-listed "serum"',
    fn: beautyModule.isRelevantQuery, query: 'anti-aging serums for sensitive skin', expect: true },
  { name: 'Supplements: plural "capsules" matches singular-listed "capsule"',
    fn: supplementsModule.isRelevantQuery, query: 'turmeric capsules for joint health', expect: true },

  // THIS ROUND — manually-reproduced bug: hair loss rejected by closed vocabulary
  // (BEAUTY_TOKENS only has 'hair' inside fixed phrases like 'hair mask'/'hair
  // oil', never as its own token; 'loss' never appears at all). Must now pass
  // via the LLM fallback since the fast vocabulary check still correctly misses it.
  { name: 'Beauty: "hair loss treatment" (the reported bug) must now be ALLOWED via LLM fallback',
    fn: beautyModule.isRelevantQuery, query: 'hair loss treatment', expect: true },
  { name: 'Beauty: "hair loss serum for women" must now be ALLOWED via LLM fallback',
    fn: beautyModule.isRelevantQuery, query: 'hair loss serum for women', expect: true },

  // THIS ROUND — the 100-case production simulation's other missing-vocabulary
  // false negatives, all confirmed absent from their vocab lists by direct grep.
  { name: 'Beauty: "dark spot corrector" (production-sim finding) must now be ALLOWED',
    fn: beautyModule.isRelevantQuery, query: 'dark spot corrector', expect: true },
  { name: 'Beauty: "blue light face mist" (production-sim finding) must now be ALLOWED',
    fn: beautyModule.isRelevantQuery, query: 'blue light face mist', expect: true },
  { name: 'Fitness: "ankle weights" (production-sim finding) must now be ALLOWED',
    fn: fitnessModule.isRelevantQuery, query: 'ankle weights', expect: true },
  { name: 'Fitness: "weighted vest for walking" (production-sim finding) must now be ALLOWED',
    fn: fitnessModule.isRelevantQuery, query: 'weighted vest for walking', expect: true },
  { name: 'Home: "shower head filter" (production-sim finding) must now be ALLOWED',
    fn: homeModule.isRelevantQuery, query: 'shower head filter', expect: true },
  { name: 'Home: "smart plug" (production-sim finding) must now be ALLOWED',
    fn: homeModule.isRelevantQuery, query: 'smart plug', expect: true },
  { name: 'Home: "mattress topper for back pain" (production-sim finding) must now be ALLOWED',
    fn: homeModule.isRelevantQuery, query: 'mattress topper for back pain', expect: true },

  // Negative controls — the gate must still reject genuinely irrelevant queries
  // via the LLM fallback too, confirming the fix adds coverage without becoming
  // a rubber stamp (this is the most important regression check: the LLM
  // fallback must say NO when a query really doesn't belong).
  { name: 'Home: a genuinely irrelevant query is still REJECTED (vocabulary miss + LLM confirms NO)',
    fn: homeModule.isRelevantQuery, query: 'mortgage refinancing calculator', expect: false },
  { name: 'Fitness: a genuinely irrelevant query is still REJECTED (vocabulary miss + LLM confirms NO)',
    fn: fitnessModule.isRelevantQuery, query: 'tax preparation software', expect: false },
  { name: 'Beauty: a genuinely irrelevant query is still REJECTED (vocabulary miss + LLM confirms NO)',
    fn: beautyModule.isRelevantQuery, query: 'car insurance comparison tool', expect: false },
  { name: 'Pets: a genuinely irrelevant query is still REJECTED (vocabulary miss + LLM confirms NO)',
    fn: petsModule.isRelevantQuery, query: 'cryptocurrency trading app', expect: false },
]

async function main() {
  let failures = 0
  for (const c of cases) {
    const result = await c.fn(c.query)
    const pass = result === c.expect
    if (!pass) failures++
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name} ("${c.query}" -> ${result}, expected ${c.expect})`)
  }

  console.log(`\n${cases.length - failures}/${cases.length} passed`)
  if (failures > 0) process.exit(1)
}

main()
