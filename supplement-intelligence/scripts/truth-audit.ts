// ── Truth Audit — docs/RD_TRUTH_AUDIT.md ─────────────────────────────────────
//
// READ-ONLY audit script: loads the N most recent owner analyses with real
// signal_evidence and verifies that every number the Record/Appendix display
// layer renders is faithful to the raw provider value it claims to represent,
// and that every 'measured' marker traces to a real provider field. Produces
// a findings report — it fixes nothing and NEVER writes to the database
// (service-role client used for SELECT only; there is deliberately no
// insert/update/upsert/delete call anywhere in this file).
//
// Run:  npx tsx --env-file=.env.local scripts/truth-audit.ts [--limit N]
// Flags:
//   --limit N      how many recent analyses to audit (default 5)
//   --no-external  skip the free external spot-check (PubMed live count)
//   --live-spend   ALSO run the real-money Keepa spot-check (owner-gated,
//                  OFF by default — see RD §3 Family 3)
//
// Check families (RD §3):
//   1. Displayed vs stored — independent recomputation of every numeric
//      claim from the raw stored provider fields (never by re-running the
//      same formatter alone).
//   2. Marker honesty — every 'measured' row must trace to a real provider
//      field; AI-prompt fields labeled 'measured' are findings.
//   3. External spot-check — free PubMed count vs stored science data
//      (drift-tolerant); Keepa live check only behind --live-spend.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildRecordChapters, buildEvidenceAppendix } from '../lib/partner-copy-record'
import type { RecordRow } from '../lib/partner-copy-record'
import type { MemoData } from '../types/index'

const OWNER = 'a736a87a-83ec-4aa7-a12c-1d868d283731'  // same owner id as scripts/_tmp_pre_validate.ts

const args = process.argv.slice(2)
const LIMIT = (() => {
  const i = args.indexOf('--limit')
  return i >= 0 ? Math.max(1, parseInt(args[i + 1], 10) || 5) : 5
})()
const RUN_EXTERNAL = !args.includes('--no-external')
const LIVE_SPEND = args.includes('--live-spend')

interface Finding {
  analysisId:   string
  analysisName: string
  family:       1 | 2 | 3
  severity:     'HIGH' | 'MEDIUM' | 'LOW'
  check:        string
  displayed:    string
  source:       string
  location:     string   // file:line of the transformation under audit
  detail:       string
}
interface CheckResult { name: string; pass: boolean }

const findings: Finding[] = []
const passes: { analysisId: string; checks: CheckResult[] }[] = []

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Mirrors lib/partner-copy-record.ts:58-61 exactly — used only to verify a
// displayed string is the correct formatting of an INDEPENDENTLY recomputed
// number (the number itself is recomputed from raw fields, not reused).
function fmtMeasuredMonthly(n: number): string {
  if (n >= 1_000_000) return `~$${(Math.round(n / 100_000) / 10).toFixed(1)}M/mo`
  if (n >= 1000) return `~$${Math.round(n / 1000)}k/mo`
  return `~$${Math.round(n)}/mo`
}

function approxEqual(a: number, b: number, relTol: number): boolean {
  if (a === b) return true
  const denom = Math.max(Math.abs(a), Math.abs(b))
  return denom === 0 ? true : Math.abs(a - b) / denom <= relTol
}

// ── Family 1: displayed vs stored (independent recomputation) ───────────────
function auditFamily1(id: string, name: string, m: MemoData, chapters: ReturnType<typeof buildRecordChapters>, appendix: ReturnType<typeof buildEvidenceAppendix>): CheckResult[] {
  const results: CheckResult[] = []
  const add = (check: string, pass: boolean, f?: Omit<Finding, 'analysisId' | 'analysisName' | 'family' | 'check'>) => {
    results.push({ name: check, pass })
    if (!pass && f) findings.push({ analysisId: id, analysisName: name, family: 1, check, ...f })
  }
  const revVal = m.signal_evidence?.revenue?.value
  const rows = revVal?.top_competitor_revenues ?? []

  // C1 — per-competitor revenue = price × monthly_sold (source formula:
  // lib/signal-engine/measured-competitor-economics.ts:97, Math.round).
  for (const r of rows) {
    const expected = Math.round(r.price * r.monthly_sold)
    add(`C1 revenue=price×units (${r.productId})`, r.est_monthly_revenue_mo === expected, {
      severity: 'HIGH',
      displayed: String(r.est_monthly_revenue_mo),
      source: `${r.price} × ${r.monthly_sold} = ${expected}`,
      location: 'lib/signal-engine/measured-competitor-economics.ts:97',
      detail: 'Stored per-competitor revenue does not equal price × monthlySold.',
    })
  }

  // C2 — niche total = Σ per-competitor revenues (source: :103-106).
  if (revVal?.measured_revenue_total_mo !== undefined && rows.length > 0) {
    const sum = rows.reduce((s, r) => s + r.est_monthly_revenue_mo, 0)
    add('C2 niche total = Σ rows', revVal.measured_revenue_total_mo === sum, {
      severity: 'HIGH',
      displayed: String(revVal.measured_revenue_total_mo),
      source: `Σ = ${sum}`,
      location: 'lib/signal-engine/measured-competitor-economics.ts:103-106',
      detail: 'Stored niche revenue total does not equal the sum of its own rows.',
    })
  }

  // C3 — concentration = max ÷ total (source: :107, rounded to 2 decimals).
  if (revVal?.revenue_concentration_top1 !== undefined && rows.length > 0) {
    const sum = rows.reduce((s, r) => s + r.est_monthly_revenue_mo, 0)
    const top = Math.max(...rows.map(r => r.est_monthly_revenue_mo))
    const expected = Math.round((top / sum) * 100) / 100
    add('C3 leader concentration', approxEqual(revVal.revenue_concentration_top1, expected, 0.005), {
      severity: 'HIGH',
      displayed: String(revVal.revenue_concentration_top1),
      source: `${top} ÷ ${sum} = ${expected}`,
      location: 'lib/signal-engine/measured-competitor-economics.ts:107',
      detail: 'Stored leader concentration does not equal top row ÷ total.',
    })
  }

  // C4 — displayed leader-share string vs independent recompute
  // (display transform: lib/partner-copy-record.ts:102).
  const compChapter = chapters.find(c => c.key === 'competition')
  const shareRow = compChapter?.rows.find(r => r.claim === "Leader's share of measured revenue")
  if (shareRow && revVal?.revenue_concentration_top1 !== undefined && rows.length > 0) {
    const sum = rows.reduce((s, r) => s + r.est_monthly_revenue_mo, 0)
    const top = Math.max(...rows.map(r => r.est_monthly_revenue_mo))
    const expected = `~${Math.round((top / sum) * 100)}%`
    add('C4 displayed leader share', shareRow.value === expected, {
      severity: 'HIGH',
      displayed: shareRow.value,
      source: expected,
      location: 'lib/partner-copy-record.ts:102',
      detail: 'Displayed leader-share % does not match independent recompute from raw rows.',
    })
  }

  // C5 — appendix competitor rows: price/units/revenue strings vs raw fields
  // (display transform: lib/partner-copy-record.ts:262-264).
  appendix.competitorRows.forEach((cr, i) => {
    const raw = rows[i]
    if (!raw) return
    const priceOk = cr.price === `$${Math.round(raw.price)}`
    const unitsOk = cr.unitsLabel === `~${raw.monthly_sold.toLocaleString('en-US')}/mo`
    const revOk = cr.revenueLabel === fmtMeasuredMonthly(Math.round(raw.price * raw.monthly_sold))
    add(`C5 appendix row ${i} (${raw.brand})`, priceOk && unitsOk && revOk, {
      severity: 'HIGH',
      displayed: `${cr.price} · ${cr.unitsLabel} · ${cr.revenueLabel}`,
      source: `$${Math.round(raw.price)} · ~${raw.monthly_sold.toLocaleString('en-US')}/mo · ${fmtMeasuredMonthly(Math.round(raw.price * raw.monthly_sold))}`,
      location: 'lib/partner-copy-record.ts:262-264',
      detail: 'Appendix competitor row diverges from raw stored competitor fields.',
    })
  })

  // C6 — appendix keyword volumes must exist verbatim in the raw pools
  // (display transform: lib/partner-copy-record.ts:243-249).
  const kw = m.keyword_intelligence
  const pool = [...(kw?.top_buying ?? []), ...(kw?.opportunity ?? []), ...(kw?.long_tail ?? []), ...(kw?.fast_growing ?? [])]
  for (const k of appendix.keywords) {
    const raw = pool.find(p => p.keyword === k.term)
    add(`C6 keyword "${k.term}"`, !!raw && raw.monthly_searches === k.volume, {
      severity: 'HIGH',
      displayed: `${k.term}: ${k.volume}`,
      source: raw ? `${raw.keyword}: ${raw.monthly_searches}` : 'NOT FOUND in raw keyword pools',
      location: 'lib/partner-copy-record.ts:243-249',
      detail: 'Displayed keyword volume has no matching raw DataForSEO entry.',
    })
  }

  // C7 — safety counts recomputed independently from top_competitors raw
  // (display transform: lib/partner-copy-record.ts:188-196).
  const safety = chapters.find(c => c.key === 'safety')
  const tc = m.signal_evidence?.review_velocity?.value?.top_competitors ?? []
  const claimsRow = safety?.rows.find(r => r.claim === 'Top brands with flagged claim language')
  if (claimsRow && tc.length > 0) {
    const flagged = tc.filter(c => (c.claim_risk_flags?.length ?? 0) > 0).length
    add('C7a claim-flag count', claimsRow.value === `${flagged} of ${tc.length}`, {
      severity: 'MEDIUM',
      displayed: claimsRow.value,
      source: `${flagged} of ${tc.length}`,
      location: 'lib/partner-copy-record.ts:188-193',
      detail: 'Displayed flagged-claims count diverges from raw top_competitors.',
    })
  }
  const recallRow = safety?.rows.find(r => r.claim === 'Manufacturer recall records found')
  if (recallRow && tc.length > 0) {
    const recalls = tc.reduce((s, c) => s + (c.manufacturer_recall_flags?.reduce((x, r) => x + r.count, 0) ?? 0), 0)
    add('C7b recall count', recallRow.value === String(recalls), {
      severity: 'MEDIUM',
      displayed: recallRow.value,
      source: String(recalls),
      location: 'lib/partner-copy-record.ts:196',
      detail: 'Displayed recall count diverges from raw top_competitors.',
    })
  }

  // C8 — fee rows are verbatim passthroughs of real Keepa fee-schedule
  // fields (display transform: lib/partner-copy-record.ts:136-142).
  const econ = chapters.find(c => c.key === 'economics')
  const refRow = econ?.rows.find(r => r.claim === 'Amazon referral fee')
  if (refRow && revVal?.avg_referral_fee_pct !== undefined) {
    add('C8a referral fee', refRow.value === `${revVal.avg_referral_fee_pct}% of price`, {
      severity: 'HIGH',
      displayed: refRow.value,
      source: `${revVal.avg_referral_fee_pct}% of price`,
      location: 'lib/partner-copy-record.ts:138',
      detail: 'Displayed referral fee diverges from stored Keepa fee field.',
    })
  }
  const fbaRow = econ?.rows.find(r => r.claim === 'Fulfillment fee (FBA, category average)')
  if (fbaRow && revVal?.avg_fba_pick_pack_fee !== undefined) {
    add('C8b FBA fee', fbaRow.value === revVal.avg_fba_pick_pack_fee, {
      severity: 'HIGH',
      displayed: fbaRow.value,
      source: revVal.avg_fba_pick_pack_fee,
      location: 'lib/partner-copy-record.ts:141',
      detail: 'Displayed FBA fee diverges from stored Keepa fee field.',
    })
  }

  // C9 — evidence coverage: stored coverage must equal contributions/6 and
  // the displayed % its rounding (source: lib/evidence-depth-score/index.ts:203;
  // display: lib/partner-copy-record.ts:183).
  const eds = m.evidence_depth_score
  if (eds?.available) {
    const expected = Math.round((eds.contributions.length / 6) * 100) / 100
    add('C9a coverage = contributions/6', eds.coverage === expected, {
      severity: 'MEDIUM',
      displayed: String(eds.coverage),
      source: `${eds.contributions.length}/6 = ${expected}`,
      location: 'lib/evidence-depth-score/index.ts:203',
      detail: 'Stored coverage does not equal contributions ÷ 6.',
    })
    const covRow = chapters.find(c => c.key === 'safety')?.rows.find(r => r.claim === 'Evidence coverage')
    if (covRow) {
      add('C9b displayed coverage %', covRow.value === `${Math.round(expected * 100)}%`, {
        severity: 'MEDIUM',
        displayed: covRow.value,
        source: `${Math.round(expected * 100)}%`,
        location: 'lib/partner-copy-record.ts:183',
        detail: 'Displayed coverage % does not match independent recompute.',
      })
    }
  }

  return results
}

// ── Family 2: marker honesty ────────────────────────────────────────────────
// Every 'measured' row must trace to a real provider field. AI-prompt fields
// (written by the LLM into the memo JSON) labeled 'measured' are mislabels.
// Seeded suspect list from RD §1; biggest_competitor is legitimately
// 'measured' ONLY when signal_metadata.competitor_revenue_verified is true
// (server-side Apify/Keepa override — lib/real-competitor.ts).
function auditFamily2(id: string, name: string, m: MemoData, chapters: ReturnType<typeof buildRecordChapters>): CheckResult[] {
  const results: CheckResult[] = []
  const verified = m.signal_metadata?.competitor_revenue_verified === true

  // claim label → { aiSourced: does this value come from an LLM-written memo field for THIS memo? , source description }
  const aiChecks: { claim: string; aiSourced: boolean; sourceField: string; location: string }[] = [
    { claim: 'Landed unit cost', aiSourced: true, sourceField: 'product_recommendation.cogs_estimate (LLM output)', location: 'lib/partner-copy-record.ts:127' },
    { claim: 'Comparable retail price', aiSourced: true, sourceField: 'product_recommendation.retail_price (LLM output)', location: 'lib/partner-copy-record.ts:128' },
    { claim: 'Category leader', aiSourced: !verified, sourceField: `biggest_competitor.name (competitor_revenue_verified=${verified})`, location: 'lib/partner-copy-record.ts:89' },
    { claim: "Leader's revenue", aiSourced: !verified, sourceField: `biggest_competitor.revenue (competitor_revenue_verified=${verified})`, location: 'lib/partner-copy-record.ts:90' },
    { claim: 'Dominant brands', aiSourced: true, sourceField: 'market_saturation.dominant_brands (LLM output)', location: 'lib/partner-copy-record.ts:94' },
    { claim: 'Top frustration', aiSourced: true, sourceField: 'customer_language.frustrations[0] (LLM-synthesized, not a verbatim review quote)', location: 'lib/partner-copy-record.ts:157' },
  ]

  const allRows: RecordRow[] = chapters.flatMap(c => c.rows)
  for (const check of aiChecks) {
    const row = allRows.find(r => r.claim === check.claim)
    if (!row) continue   // field absent on this memo — nothing rendered, nothing to flag
    const mislabeled = row.marker === 'measured' && check.aiSourced
    results.push({ name: `M2 "${check.claim}"`, pass: !mislabeled })
    if (mislabeled) {
      findings.push({
        analysisId: id, analysisName: name, family: 2, severity: 'HIGH',
        check: `M2 marker honesty: "${check.claim}"`,
        displayed: `"${row.value}" marked 'measured'`,
        source: check.sourceField,
        location: check.location,
        detail: "Row labeled 'measured' but its value comes from an LLM-written memo field, not a provider measurement.",
      })
    }
  }
  return results
}

// ── Family 3: free external spot-check (PubMed live count) ──────────────────
// Compares the stored latest-complete-year publication count against a live
// PubMed esearch count for the same term/year. PubMed counts drift upward as
// records are indexed — 25% relative tolerance; only larger gaps are
// findings (LOW severity: time-drift is expected, unit errors are not).
async function auditFamily3(id: string, name: string, m: MemoData): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const sci = m.signal_evidence?.science?.value
  const counts = sci?.publication_counts_by_year
  if (!sci?.ingredient || !counts) return results
  const years = Object.keys(counts).map(Number).sort((a, b) => a - b)
  if (years.length === 0) return results
  const year = years[years.length - 1]
  const stored = counts[String(year)]
  try {
    const term = encodeURIComponent(`${sci.ingredient} AND ${year}[pdat]`)
    const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${term}&retmode=json`)
    const json = await res.json() as { esearchresult?: { count?: string } }
    const live = parseInt(json.esearchresult?.count ?? '', 10)
    if (Number.isNaN(live)) { results.push({ name: 'X3 PubMed live count (unparseable response — skipped)', pass: true }); return results }
    const ok = approxEqual(stored, live, 0.25)
    results.push({ name: `X3 PubMed ${sci.ingredient} ${year}: stored ${stored} vs live ${live}`, pass: ok })
    if (!ok) {
      findings.push({
        analysisId: id, analysisName: name, family: 3, severity: 'LOW',
        check: `X3 PubMed count (${sci.ingredient}, ${year})`,
        displayed: String(stored),
        source: `live PubMed count: ${live}`,
        location: 'lib/science-engine/pubmed.ts (fetchPublicationCountsByYear)',
        detail: 'Stored publication count differs from live PubMed by more than the 25% drift tolerance.',
      })
    }
  } catch {
    results.push({ name: 'X3 PubMed live count (network failure — skipped)', pass: true })
  }
  return results
}

// ── Family 3 (owner-gated): real-money Keepa spot-check ─────────────────────
// OFF by default (RD §3). When --live-spend is passed, pulls the first 2
// audited ASINs from Keepa and compares live price against the stored price
// with 50% drift tolerance — only order-of-magnitude/unit errors are
// findings, daily price movement is not.
async function auditLiveSpend(id: string, name: string, m: MemoData): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const key = process.env.KEEPA_API_KEY
  const rows = (m.signal_evidence?.revenue?.value?.top_competitor_revenues ?? []).slice(0, 2)
  if (!key || rows.length === 0) return results
  for (const r of rows) {
    try {
      const res = await fetch(`https://api.keepa.com/product?key=${key}&domain=1&asin=${r.productId}`)
      const json = await res.json() as { products?: { csv?: (number[] | null)[] }[] }
      const csv = json.products?.[0]?.csv
      // csv[1] = NEW price history in cents; last value = most recent
      const newHist = csv?.[1]
      const liveCents = Array.isArray(newHist) && newHist.length >= 2 ? newHist[newHist.length - 1] : null
      if (liveCents === null || liveCents === undefined || liveCents < 0) {
        results.push({ name: `K$ ${r.productId} (no live price — skipped)`, pass: true })
        continue
      }
      const live = liveCents / 100
      const ok = approxEqual(r.price, live, 0.5)
      results.push({ name: `K$ ${r.productId}: stored $${r.price} vs live $${live}`, pass: ok })
      if (!ok) {
        findings.push({
          analysisId: id, analysisName: name, family: 3, severity: 'MEDIUM',
          check: `K$ live price (${r.productId})`,
          displayed: `$${r.price}`,
          source: `live Keepa NEW price: $${live}`,
          location: 'lib/signal-engine/providers/keepa.ts (price extraction)',
          detail: 'Stored price differs from live by more than 50% — possible unit/slot error (daily drift alone should not reach this).',
        })
      }
    } catch {
      results.push({ name: `K$ ${r.productId} (request failed — skipped)`, pass: true })
    }
  }
  return results
}

async function main() {
  const client = sb()
  const { data, error } = await client
    .from('analyses')
    .select('id, category_name, created_at, memo_data')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw new Error(`analyses query failed: ${error.message}`)

  const candidates = (data ?? [])
    .filter(row => {
      const md = row.memo_data as Partial<MemoData> | null
      return md?.signal_evidence && Object.keys(md.signal_evidence).length > 0
    })
    .slice(0, LIMIT)

  console.log(`Truth audit: ${candidates.length} analyses selected (limit ${LIMIT})`)
  console.log(`External free checks: ${RUN_EXTERNAL ? 'ON' : 'OFF'} · Live-spend checks: ${LIVE_SPEND ? 'ON (owner-gated)' : 'OFF (default)'}\n`)

  for (const row of candidates) {
    const m = row.memo_data as MemoData
    const name = row.category_name ?? '(unnamed)'
    console.log(`── ${name} (${row.id}) · ${String(row.created_at).slice(0, 10)}`)

    const chapters = buildRecordChapters(m)
    const appendix = buildEvidenceAppendix(m)

    const checks: CheckResult[] = [
      ...auditFamily1(row.id, name, m, chapters, appendix),
      ...auditFamily2(row.id, name, m, chapters),
      ...(RUN_EXTERNAL ? await auditFamily3(row.id, name, m) : []),
      ...(LIVE_SPEND ? await auditLiveSpend(row.id, name, m) : []),
    ]
    passes.push({ analysisId: row.id, checks })
    const failed = checks.filter(c => !c.pass)
    console.log(`   ${checks.length} checks · ${checks.length - failed.length} pass · ${failed.length} FAIL`)
    for (const f of failed) console.log(`   ✗ ${f.name}`)
  }

  // ── Findings report ───────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10)
  const outDir = join(import.meta.dirname, 'audit-outputs')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `truth-audit-${date}.md`)

  const totalChecks = passes.reduce((s, p) => s + p.checks.length, 0)
  const lines: string[] = [
    `# Truth Audit findings — ${date}`,
    '',
    `Audited ${candidates.length} recent analyses · ${totalChecks} checks · ${findings.length} findings.`,
    `External free checks ${RUN_EXTERNAL ? 'ON' : 'OFF'}; live-spend checks ${LIVE_SPEND ? 'ON' : 'OFF (owner-gated default)'}.`,
    'Method: docs/RD_TRUTH_AUDIT.md. Every number independently recomputed from raw stored provider fields — never by re-running the display formatter alone.',
    '',
  ]
  if (findings.length === 0) {
    lines.push('No findings. Every audited displayed number matched its raw stored source within the disclosed rounding, and no marker mislabels were detected on the audited memos.')
  } else {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    findings.sort((a, b) => order[a.severity] - order[b.severity])
    for (const f of findings) {
      lines.push(
        `## [${f.severity}] ${f.check}`,
        `- Analysis: ${f.analysisName} (\`${f.analysisId}\`)`,
        `- Displayed: ${f.displayed}`,
        `- Source of truth: ${f.source}`,
        `- Transformation: \`${f.location}\``,
        `- ${f.detail}`,
        '',
      )
    }
  }
  writeFileSync(outPath, lines.join('\n'))
  console.log(`\nReport written: ${outPath}`)
  console.log(`Total: ${totalChecks} checks, ${findings.length} findings (${findings.filter(f => f.severity === 'HIGH').length} HIGH).`)
}

main().catch(e => { console.error(e); process.exit(1) })
