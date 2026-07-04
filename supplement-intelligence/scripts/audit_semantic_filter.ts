/**
 * Semantic Filter Audit — zero new API calls.
 *
 * For every stored memo that has keyword_intelligence.top_buying data, classifies
 * each keyword through the full two-stage filter (navigational + semantic) and
 * reports:
 *
 *   - What the old engine used (top_buying[0], no filtering)
 *   - What the new engine uses (first keyword passing both filters)
 *   - How many keywords were nav-rejected vs sem-rejected vs accepted
 *   - Whether the product fell back to signal_evidence / null demand
 *   - Potential FALSE NEGATIVES: sem-rejected keywords that look product-specific
 *   - Potential FALSE POSITIVES: accepted keywords that look off-category
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/audit_semantic_filter.ts
 */

import { createClient } from '@supabase/supabase-js'
import {
  checkKeywordIntent,
  checkKeywordProductSignals,
  checkKeywordSemanticRelevance,
} from '@/lib/keyword-engine/relevance-guard'
import { computeDemand } from '@/lib/scoring'
import type { MemoData } from '@/types/index'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(s: string, n: number) { return s.slice(0, n).padEnd(n) }
function ln(ch = '─', n = 78) { return ch.repeat(n) }

// Heuristic for FALSE NEGATIVE detection:
// A keyword is flagged as a potential false negative when:
//   1. It was rejected by the semantic filter (not navigational)
//   2. It shares at least one word with the product query that is NOT a generic
//      descriptor word — meaning it has specific product vocabulary overlap
//      that the scoring-time signal-count check missed.
//
// This heuristic cannot be perfect (we'd need human labels), but it surfaces
// the most actionable cases for manual review.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'be', 'it',
  'this', 'that', 'my', 'your', 'up', 'do', 'what', 'how',
])

// Mirrors GENERIC_DESCRIPTORS from relevance-guard.ts — kept in sync manually.
const GENERIC_CHECK = new Set([
  'best', 'good', 'great', 'top', 'premium', 'advanced', 'ultimate', 'complete',
  'essential', 'pure', 'clean', 'fresh', 'raw', 'whole', 'natural', 'organic',
  'super', 'ultra', 'pro', 'max', 'plus', 'extra', 'new', 'better',
  'high', 'low', 'fast', 'quick', 'strong', 'powerful', 'effective', 'wild',
  'health', 'healthy', 'wellness', 'support', 'boost', 'help', 'relief',
  'care', 'nutrition', 'nutritional', 'fitness', 'lifestyle', 'active', 'life',
  'breakfast', 'lunch', 'dinner', 'snack', 'snacks', 'meal', 'meals',
  'morning', 'night', 'evening', 'day', 'daily', 'week', 'weekly',
  'food', 'foods', 'diet', 'dietary', 'recipe', 'recipes',
  'product', 'products', 'brand', 'item', 'items',
  'bar', 'bars', 'drink', 'drinks', 'shot', 'shots',
  'mix', 'stack', 'system', 'kit', 'set', 'bundle', 'pack', 'packs',
  'solution', 'formula', 'blend', 'complex',
  'sleep', 'energy', 'fatigue', 'focus', 'memory', 'stress', 'anxiety', 'mood',
  'immune', 'immunity', 'gut', 'joint', 'muscle', 'muscles', 'recovery',
  'hair', 'skin', 'nail', 'nails', 'body', 'face',
])

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 1 && !STOPWORDS.has(w))
}

function productAnchorWords(query: string): Set<string> {
  const s = new Set<string>()
  for (const w of tokenize(query)) if (!GENERIC_CHECK.has(w)) s.add(w)
  return s
}

function sharedSpecificWords(anchors: Set<string>, keyword: string): string[] {
  const kwTokens = new Set(tokenize(keyword))
  return [...anchors].filter(a => kwTokens.has(a))
}

type KeywordVerdict = {
  keyword:    string
  volume:     number
  navRejected: boolean
  semRejected: boolean   // rejected by semantic filter (not navigational)
  accepted:   boolean
  navReason:  string
  semReason:  string
  potentialFP: boolean   // accepted, but might be off-category
  potentialFN: boolean   // rejected, but shares specific product anchor words
  sharedAnchors: string[]
}

function classifyKeyword(productQuery: string, keyword: string, volume: number): KeywordVerdict {
  const navCheck = checkKeywordIntent(keyword)
  const navRejected = navCheck.navigational

  let semRejected = false
  let semReason = ''
  if (!navRejected) {
    const semCheck = checkKeywordProductSignals(keyword)
    semRejected = !semCheck.valid
    semReason = semCheck.reason
  }

  const accepted = !navRejected && !semRejected

  const anchors = productAnchorWords(productQuery)
  const shared  = sharedSpecificWords(anchors, keyword)

  // Potential FALSE NEGATIVE: rejected semantically but shares specific product vocab
  const potentialFN = semRejected && shared.length > 0

  // Potential FALSE POSITIVE: accepted but shares ZERO specific product anchor words
  // AND none of the keyword's words are in the product query at all. This can surface
  // keywords that got through on generic signals alone without any product connection.
  const kwTokenSet = new Set(tokenize(keyword))
  const productTokens = new Set(tokenize(productQuery))
  const anyOverlap = [...kwTokenSet].some(w => productTokens.has(w))
  const potentialFP = accepted && !anyOverlap && anchors.size > 0

  return {
    keyword, volume,
    navRejected, semRejected, accepted,
    navReason: navCheck.reason,
    semReason,
    potentialFP, potentialFN,
    sharedAnchors: shared,
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(ln('═'))
  console.log('  Semantic Filter Audit — stored corpus, zero new API calls')
  console.log(`  Run: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
  console.log(ln('═'))

  const { data: rows, error } = await sb
    .from('analyses')
    .select('id, raw_input, memo_data, created_at')
    .order('created_at', { ascending: false })

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No rows found.'); return }

  // Deduplicate by product name
  const seen = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    const key = r.raw_input.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r)
  }
  const memos = [...seen.values()]
  console.log(`\n  Total unique products in corpus: ${memos.length}`)

  // ── Per-product analysis ──────────────────────────────────────────────────

  type ProductReport = {
    product:         string
    hasKI:           boolean
    kwCount:         number
    navRejected:     KeywordVerdict[]
    semRejected:     KeywordVerdict[]
    accepted:        KeywordVerdict[]
    effectiveKw:     string | null        // what new engine actually uses
    effectiveSource: string               // "dataforseo" | "keepa" | "signal_evidence" | "null"
    oldTopKw:        string | null        // what old engine used (top_buying[0])
    oldTopVol:       number | null
    topKwChanged:    boolean
    potentialFNs:    KeywordVerdict[]
    potentialFPs:    KeywordVerdict[]
  }

  const reports: ProductReport[] = []
  let totalKw = 0
  let totalNav = 0
  let totalSem = 0
  let totalAccepted = 0

  for (const row of memos) {
    const memo   = row.memo_data as MemoData
    const ki     = memo.keyword_intelligence
    const allKw  = ki?.top_buying ?? []
    const withVol = allKw.filter(kw => kw.monthly_searches)

    if (withVol.length === 0) {
      reports.push({
        product: row.raw_input, hasKI: false,
        kwCount: 0, navRejected: [], semRejected: [], accepted: [],
        effectiveKw: null, effectiveSource: 'null',
        oldTopKw: null, oldTopVol: null, topKwChanged: false,
        potentialFNs: [], potentialFPs: [],
      })
      continue
    }

    const verdicts: KeywordVerdict[] = withVol.map(kw =>
      classifyKeyword(row.raw_input, kw.keyword, kw.monthly_searches!)
    )

    const navRejected  = verdicts.filter(v => v.navRejected)
    const semRejected  = verdicts.filter(v => v.semRejected)
    const accepted     = verdicts.filter(v => v.accepted)
    const potentialFNs = verdicts.filter(v => v.potentialFN)
    const potentialFPs = verdicts.filter(v => v.potentialFP)

    totalKw       += withVol.length
    totalNav      += navRejected.length
    totalSem      += semRejected.length
    totalAccepted += accepted.length

    // What does the new scoring engine actually use?
    const demand = computeDemand(memo)
    const sl = demand.sourceLabel ?? ''
    let effectiveSource: ProductReport['effectiveSource'] = 'null'
    if (sl.startsWith('dataforseo')) effectiveSource = 'dataforseo'
    else if (sl.includes('keepa') || sl.includes('monthlySold') || sl.includes('bsr')) effectiveSource = 'keepa'
    else if (demand.rawScore !== null) effectiveSource = 'signal_evidence'

    const effectiveKw = accepted[0]?.keyword ?? null

    const oldTopKw  = withVol[0]?.keyword ?? null
    const oldTopVol = withVol[0]?.volume ?? null
    const topKwChanged = effectiveKw !== oldTopKw

    reports.push({
      product: row.raw_input, hasKI: true,
      kwCount: withVol.length,
      navRejected, semRejected, accepted,
      effectiveKw, effectiveSource,
      oldTopKw, oldTopVol,
      topKwChanged,
      potentialFNs, potentialFPs,
    })
  }

  // ── Aggregate stats ───────────────────────────────────────────────────────

  const withKI         = reports.filter(r => r.hasKI)
  const noChange       = withKI.filter(r => !r.topKwChanged)
  const topKwChanged   = withKI.filter(r => r.topKwChanged)
  const allFiltered    = withKI.filter(r => r.accepted.length === 0)
  const fallbackKeepa  = withKI.filter(r => r.effectiveSource === 'keepa')
  const fallbackSigEv  = withKI.filter(r => r.effectiveSource === 'signal_evidence')
  const fallbackNull   = withKI.filter(r => r.effectiveSource === 'null')
  const hasFNs         = withKI.filter(r => r.potentialFNs.length > 0)
  const hasFPs         = withKI.filter(r => r.potentialFPs.length > 0)

  console.log(`\n${ln()}`)
  console.log(`  AGGREGATE SUMMARY`)
  console.log(ln())
  console.log(`\n  Corpus`)
  console.log(`  ${'Total unique products:'.padEnd(40)} ${memos.length}`)
  console.log(`  ${'Products with keyword data:'.padEnd(40)} ${withKI.length}`)
  console.log(`  ${'Products without keyword data:'.padEnd(40)} ${memos.length - withKI.length}`)
  console.log(`\n  Keywords`)
  console.log(`  ${'Total keywords examined:'.padEnd(40)} ${totalKw}`)
  console.log(`  ${'Accepted (pass both filters):'.padEnd(40)} ${totalAccepted}  (${pct(totalAccepted, totalKw)})`)
  console.log(`  ${'Nav-rejected (intent filter):'.padEnd(40)} ${totalNav}  (${pct(totalNav, totalKw)})`)
  console.log(`  ${'Sem-rejected (semantic filter):'.padEnd(40)} ${totalSem}  (${pct(totalSem, totalKw)})`)
  console.log(`\n  Top-keyword impact`)
  console.log(`  ${'Top keyword unchanged:'.padEnd(40)} ${noChange.length}  (${pct(noChange.length, withKI.length)})`)
  console.log(`  ${'Top keyword changed by filter:'.padEnd(40)} ${topKwChanged.length}  (${pct(topKwChanged.length, withKI.length)})`)
  console.log(`  ${'All keywords filtered (no valid kw):'.padEnd(40)} ${allFiltered.length}  (${pct(allFiltered.length, withKI.length)})`)
  console.log(`\n  Demand source after filter`)
  console.log(`  ${'DataForSEO (valid keyword found):'.padEnd(40)} ${withKI.length - allFiltered.length}  (${pct(withKI.length - allFiltered.length, withKI.length)})`)
  console.log(`  ${'Keepa/signal_evidence fallback:'.padEnd(40)} ${fallbackKeepa.length + fallbackSigEv.length}  (${pct(fallbackKeepa.length + fallbackSigEv.length, withKI.length)})`)
  console.log(`  ${'  → Keepa (monthlySold/BSR):'.padEnd(40)} ${fallbackKeepa.length}`)
  console.log(`  ${'  → Other signal_evidence:'.padEnd(40)} ${fallbackSigEv.length}`)
  console.log(`  ${'Null demand (no evidence at all):'.padEnd(40)} ${fallbackNull.length}`)
  console.log(`\n  Precision / recall flags`)
  console.log(`  ${'Potential false negatives (prod with ≥1):'.padEnd(40)} ${hasFNs.length} products`)
  console.log(`  ${'Potential false positives (prod with ≥1):'.padEnd(40)} ${hasFPs.length} products`)

  // ── Category breakdowns ───────────────────────────────────────────────────

  // Section 1: Products where all keywords were filtered → show what fallback is used
  console.log(`\n\n${ln('═')}`)
  console.log(`  SECTION 1 — ALL KEYWORDS FILTERED (${allFiltered.length} products)`)
  console.log(`  These products use Keepa/signal_evidence or null for Demand.`)
  console.log(`  Review: are the rejections correct? Or did the filter over-reach?`)
  console.log(ln('═'))

  for (const r of allFiltered) {
    console.log(`\n  ── "${r.product}"`)
    const allVerdicts = [...r.navRejected, ...r.semRejected]
    for (const v of allVerdicts.slice(0, 6)) {
      const tag = v.navRejected ? '[NAV]' : '[SEM]'
      const anchor = v.sharedAnchors.length > 0 ? `  ← shares "${v.sharedAnchors.join('", "')}" with product` : ''
      console.log(`    ${tag} "${v.keyword}" (${v.volume.toLocaleString()}/mo)${anchor}`)
      if (v.semRejected) console.log(`         ${v.semReason}`)
    }
    if (allVerdicts.length > 6) console.log(`    … and ${allVerdicts.length - 6} more rejected keywords`)
    console.log(`    → Demand source: ${r.effectiveSource.toUpperCase()}`)
    if (r.potentialFNs.length > 0) {
      console.log(`    ⚠ POTENTIAL FALSE NEGATIVE(S):`)
      for (const fn of r.potentialFNs) {
        console.log(`      "${fn.keyword}" — shares "${fn.sharedAnchors.join('", "')}" with product query`)
      }
    }
  }

  // Section 2: Potential false negatives across all products
  console.log(`\n\n${ln('═')}`)
  console.log(`  SECTION 2 — POTENTIAL FALSE NEGATIVES (${hasFNs.length} products with flagged rejections)`)
  console.log(`  Semantically rejected keywords that share specific (non-generic) words`)
  console.log(`  with the product name. May indicate a gap in the signal vocabulary.`)
  console.log(ln('═'))

  if (hasFNs.length === 0) {
    console.log('\n  None found — semantic filter appears to have no obvious over-rejections.')
  } else {
    for (const r of hasFNs) {
      console.log(`\n  ── "${r.product}"`)
      console.log(`     Product anchor words: ${[...productAnchorWords(r.product)].join(', ') || '(none — all-generic name)'}`)
      for (const fn of r.potentialFNs) {
        console.log(`     ⚠ "${fn.keyword}" (${fn.volume.toLocaleString()}/mo) — rejected but shares "${fn.sharedAnchors.join('", "')}"`)
        console.log(`       Rejection reason: ${fn.semReason}`)
      }
      console.log(`     Effective demand source: ${r.effectiveSource} (kw: ${r.effectiveKw ?? 'none'})`)
    }
  }

  // Section 3: Top-keyword changed but valid fallback found
  const changedWithFallback = topKwChanged.filter(r => r.accepted.length > 0)
  console.log(`\n\n${ln('═')}`)
  console.log(`  SECTION 3 — TOP KW CHANGED, VALID FALLBACK FOUND (${changedWithFallback.length} products)`)
  console.log(`  Filter rejected top_buying[0] and used a secondary keyword instead.`)
  console.log(`  Verify: is the fallback keyword better than what was rejected?`)
  console.log(ln('═'))

  for (const r of changedWithFallback) {
    const rejected = [...r.navRejected, ...r.semRejected].find(v => v.keyword === r.oldTopKw)
    const tag = rejected?.navRejected ? 'NAV' : 'SEM'
    console.log(`\n  ── "${r.product}"`)
    console.log(`     OLD (top_buying[0]): "${r.oldTopKw}" (${r.oldTopVol?.toLocaleString()}/mo) → REJECTED [${tag}]`)
    console.log(`     NEW (effective kw):  "${r.effectiveKw}" (${r.accepted[0]?.volume.toLocaleString()}/mo) → ACCEPTED`)
    if (rejected?.potentialFN) {
      console.log(`     ⚠ Old keyword may be a false negative (shares "${rejected.sharedAnchors.join('", "')}") — review`)
    }
  }

  // Section 4: Potential false positives
  console.log(`\n\n${ln('═')}`)
  console.log(`  SECTION 4 — POTENTIAL FALSE POSITIVES (${hasFPs.length} products)`)
  console.log(`  Accepted keywords with NO word overlap with the product query.`)
  console.log(`  These passed via the ≥2 product-signal fallback. Verify they're relevant.`)
  console.log(ln('═'))

  if (hasFPs.length === 0) {
    console.log('\n  None found — all accepted keywords share at least one word with the product query.')
  } else {
    for (const r of hasFPs) {
      console.log(`\n  ── "${r.product}"`)
      for (const fp of r.potentialFPs) {
        console.log(`     ⚠ "${fp.keyword}" (${fp.volume.toLocaleString()}/mo) — 0 words overlap with product name`)
      }
      console.log(`     Effective keyword: "${r.effectiveKw}"`)
    }
  }

  // Section 5: Summary table — all products with keyword changes
  console.log(`\n\n${ln('═')}`)
  console.log(`  SECTION 5 — SUMMARY TABLE (products where filter changed something)`)
  console.log(ln('═'))
  console.log(`\n  ${'Product'.padEnd(44)} ${'Old kw'.padEnd(30)} ${'New kw / source'.padEnd(30)} ${'Nav'.padEnd(4)} ${'Sem'.padEnd(4)} FN?`)
  console.log(`  ${ln('-', 120)}`)

  for (const r of withKI.sort((a, b) => b.navRejected.length + b.semRejected.length - a.navRejected.length - a.semRejected.length)) {
    const oldKw = r.oldTopKw ? r.oldTopKw.slice(0, 28) : '—'
    const newKw = r.effectiveKw ? r.effectiveKw.slice(0, 28) : r.effectiveSource.toUpperCase()
    const fn = r.potentialFNs.length > 0 ? '⚠' : ''
    console.log(`  ${pad(r.product, 44)} ${pad(oldKw, 30)} ${pad(newKw, 30)} ${String(r.navRejected.length).padEnd(4)} ${String(r.semRejected.length).padEnd(4)} ${fn}`)
  }

  console.log(`\n${ln('═')}`)
  console.log(`  END OF AUDIT`)
  console.log(ln('═'))
}

function pct(n: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((n / total) * 100)}%`
}

main().catch(e => { console.error(e); process.exit(1) })
