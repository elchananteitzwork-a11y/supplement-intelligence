// Plain assertion script for lib/keyword-engine/relevance-guard.ts — no test
// framework (jest/vitest) is configured in this repo, so this follows the
// existing project convention of a runnable tsx script rather than adding
// new test infrastructure. Run with: npx tsx scripts/test-keyword-relevance-guard.ts
import { checkKeywordRelevance } from '../lib/keyword-engine/relevance-guard'

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
]

let failures = 0
for (const c of cases) {
  const result = checkKeywordRelevance(c.original, c.candidate)
  const pass = result.allowed === c.expectAllowed
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`)
  console.log(`  original="${c.original}" candidate="${c.candidate}" -> allowed=${result.allowed} (expected ${c.expectAllowed})`)
  console.log(`  reason: ${result.reason}`)
}

console.log(`\n${cases.length - failures}/${cases.length} passed`)
if (failures > 0) process.exit(1)
