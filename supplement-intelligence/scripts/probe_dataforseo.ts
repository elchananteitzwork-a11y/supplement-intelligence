/**
 * DataForSEO coverage investigation — Task 6
 * Examines all stored memos for keyword_intelligence presence/absence,
 * provider distribution, and category breakdown.
 * Run with: npx tsx --env-file=.env.local scripts/probe_dataforseo.ts
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

  const seen = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    const key = (r.raw_input ?? '').toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r)
  }

  const memos = Array.from(seen.values())
  console.log(`\nTotal unique products: ${memos.length} (from ${rows.length} rows)`)
  console.log('─'.repeat(70))

  let withKI = 0, withTopBuying = 0, withOpportunity = 0
  let svFallbackOnly = 0, emptyTopBuying = 0
  const providerCounts: Record<string, number> = {}
  const categoryMap: Record<string, { total: number; withKI: number }> = {}
  const withKI_products: string[] = []
  const withoutKI_products: string[] = []

  for (const r of memos) {
    const m = r.memo_data as MemoData | null
    const ki = m?.keyword_intelligence
    const cat = m?.category_name ?? 'unknown'

    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, withKI: 0 }
    categoryMap[cat].total++

    if (ki) {
      withKI++
      categoryMap[cat].withKI++
      if (ki.top_buying?.length) withTopBuying++; else emptyTopBuying++
      if (ki.opportunity?.length) withOpportunity++
      const prov = ki.provider ?? 'unknown'
      providerCounts[prov] = (providerCounts[prov] ?? 0) + 1
      if (prov === 'dataforseo-search-volume') svFallbackOnly++

      const topVol = ki.top_buying?.[0]?.monthly_searches
      const topKW  = ki.top_buying?.[0]?.keyword
      withKI_products.push(
        `  ✓ [${prov}] ${r.raw_input}` +
        (topVol ? ` — "${topKW}" ${topVol.toLocaleString()}/mo` : ' — empty top_buying')
      )
    } else {
      withoutKI_products.push(`  ✗ ${r.raw_input}`)
    }
  }

  const pct = (n: number, d = memos.length) => `${Math.round(n / d * 100)}%`

  console.log(`\n── Coverage ──────────────────────────────────────────────────────────`)
  console.log(`  keyword_intelligence PRESENT: ${withKI}/${memos.length} (${pct(withKI)})`)
  console.log(`  keyword_intelligence ABSENT:  ${memos.length - withKI}/${memos.length} (${pct(memos.length - withKI)})`)
  console.log(`\n── Among those WITH keyword_intelligence ─────────────────────────────`)
  console.log(`  with non-empty top_buying:  ${withTopBuying}/${withKI} (${pct(withTopBuying, withKI || 1)}%)`)
  console.log(`  with opportunity keywords:  ${withOpportunity}/${withKI}`)
  console.log(`  search_volume/live fallback (SV only): ${svFallbackOnly}/${withKI}`)
  console.log(`  empty top_buying (relevance guard rejected all): ${emptyTopBuying}/${withKI}`)

  console.log(`\n── Provider breakdown ────────────────────────────────────────────────`)
  for (const [prov, cnt] of Object.entries(providerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${prov}: ${cnt}`)
  }

  console.log(`\n── Category breakdown ────────────────────────────────────────────────`)
  for (const [cat, { total, withKI: wki }] of Object.entries(categoryMap).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${cat}: ${wki}/${total} have KI`)
  }

  if (withKI_products.length) {
    console.log(`\n── Products WITH keyword_intelligence ────────────────────────────────`)
    for (const p of withKI_products) console.log(p)
  }

  if (withoutKI_products.length) {
    console.log(`\n── Products WITHOUT keyword_intelligence ─────────────────────────────`)
    for (const p of withoutKI_products) console.log(p)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
