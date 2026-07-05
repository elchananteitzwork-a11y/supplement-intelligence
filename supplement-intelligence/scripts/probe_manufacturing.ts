/**
 * Quick probe — checks how many stored memos have manufacturing_estimate
 * populated (from eager generation-time fetch) vs. absent (Apify failed/timed out).
 * No API calls made. Run with: npx tsx --env-file=.env.local scripts/probe_manufacturing.ts
 */
import { createClient } from '@supabase/supabase-js'
import type { MemoData } from '@/types/index'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

async function main() {
  const { data: rows, error } = await sb
    .from('analyses')
    .select('id, raw_input, created_at, memo_data, scoring_version')
    .order('created_at', { ascending: false })

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No rows found.'); return }

  // De-duplicate by product name, keep most recent
  const seen = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    const key = (r.raw_input ?? '').toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r)
  }

  const memos = Array.from(seen.values())
  console.log(`\nTotal unique products: ${memos.length} (from ${rows.length} rows)`)
  console.log('─'.repeat(60))

  let withEstimate = 0
  let withSuppliers = 0
  let withUnitCost = 0
  let withLeadTime = 0
  const missingProducts: string[] = []
  const presentProducts: string[] = []

  for (const r of memos) {
    const m = r.memo_data as MemoData | null
    const est = m?.manufacturing_estimate
    if (est) {
      withEstimate++
      if (est.top_suppliers?.length) withSuppliers++
      if (est.realistic_unit_cost) withUnitCost++
      if (est.lead_time_days) withLeadTime++
      presentProducts.push(`  ✓ ${r.raw_input} — suppliers=${est.top_suppliers?.length ?? 0}, unit_cost=$${est.realistic_unit_cost?.low ?? '?'}-$${est.realistic_unit_cost?.high ?? '?'}`)
    } else {
      missingProducts.push(`  ✗ ${r.raw_input}`)
    }
  }

  console.log(`\n manufacturing_estimate PRESENT: ${withEstimate}/${memos.length}`)
  console.log(`   with top_suppliers:            ${withSuppliers}/${memos.length}`)
  console.log(`   with realistic_unit_cost:      ${withUnitCost}/${memos.length}`)
  console.log(`   with lead_time_days:           ${withLeadTime}/${memos.length}`)
  console.log(`\n manufacturing_estimate ABSENT:  ${memos.length - withEstimate}/${memos.length}`)

  if (presentProducts.length) {
    console.log('\n── Products WITH manufacturing_estimate ─────────────────')
    for (const p of presentProducts) console.log(p)
  }

  if (missingProducts.length) {
    console.log('\n── Products WITHOUT manufacturing_estimate ──────────────')
    for (const p of missingProducts) console.log(p)
  }

  // Show scoring impact: when top_suppliers is present, manufacturing feasibility
  // produces a real score instead of falling back to qualitative (weight=0).
  const feasibilityWeight = 5
  console.log(`\n── Scoring impact ───────────────────────────────────────`)
  console.log(`  Manufacturing Feasibility weight: ${feasibilityWeight}%`)
  console.log(`  Products scoring this dimension:  ${withSuppliers}/${memos.length}`)
  console.log(`  Remaining products: dimension weight redistributed to other 6 dimensions`)
}

main().catch(err => { console.error(err); process.exit(1) })
