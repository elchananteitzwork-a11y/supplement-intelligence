// Plain assertion script for lib/analysis-slot-policy.ts — no test
// framework is configured in this repo (see scripts/test-keyword-
// relevance-guard.ts for the same convention). Run with:
// npx tsx scripts/test-slot-fairness.ts
import { shouldConsumeSlot } from '../lib/analysis-slot-policy'

interface Case { name: string; skipReason: string | null; devUnlimited: boolean; expect: boolean }

const cases: Case[] = [
  { name: 'A complete, valid analysis (no skipReason) consumes a slot',
    skipReason: null, devUnlimited: false, expect: true },
  { name: 'json_parse_failure must NOT consume a slot',
    skipReason: 'json_parse_failure', devUnlimited: false, expect: false },
  { name: 'incomplete_memo must NOT consume a slot',
    skipReason: 'incomplete_memo', devUnlimited: false, expect: false },
  { name: 'Dev-unlimited mode never consumes a slot, even on success',
    skipReason: null, devUnlimited: true, expect: false },
  { name: 'Dev-unlimited mode never consumes a slot on technical failure either',
    skipReason: 'incomplete_memo', devUnlimited: true, expect: false },
]

let failures = 0
for (const c of cases) {
  const result = shouldConsumeSlot(c.skipReason, c.devUnlimited)
  const pass = result === c.expect
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name} (got ${result}, expected ${c.expect})`)
}

console.log(`\n${cases.length - failures}/${cases.length} passed`)
if (failures > 0) process.exit(1)
