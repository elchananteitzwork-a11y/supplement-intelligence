/**
 * v2.3.0 scoring validation.
 * Pulls stored memos, scores them with the full engine, then produces a
 * counterfactual v2.2.0 score (no Review Moat, no Customer Opportunity
 * weight-exclusion) to show the delta.
 *
 * Run: npx tsx --env-file=.env.local scripts/validate_v230.ts
 */

import { createClient } from '@supabase/supabase-js'
import type { MemoData }           from '@/types/index'
import { computeGroundedScore }     from '@/lib/scoring'
import type { ScoreDimension }      from '@/lib/scoring'
import { keywordSpecificity, checkKeywordIntent, checkKeywordSemanticRelevance, checkKeywordProductSignals } from '@/lib/keyword-engine/relevance-guard'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Re-implementation of v2.4.0 Review Moat for inspection ──────────────────

const THIN          = 50
const MIN_SEARCH    = 1_000
const MIN_REVS      = 10
const SPEC_FLOOR    = 0.2

interface MoatDebug {
  rawSearches:      number | undefined
  validatedKw:      string | null
  specificity:      number | null
  effectiveSearches: number | null
  avgReviews:       number | undefined
  ratio:            number | null
  score:            number | null
  gateReason:       string | null
}

function reviewMoatDebug(m: MemoData): MoatDebug {
  const avgReviews  = m.signal_evidence?.review_velocity?.value.avg_review_count
  const kws         = m.keyword_intelligence?.top_buying ?? []

  const validKw = kws
    .filter(kw => typeof kw.monthly_searches === 'number' && kw.monthly_searches > 0)
    .filter(kw => !checkKeywordIntent(kw.keyword).navigational)
    .find(kw =>
      m.product_query
        ? checkKeywordSemanticRelevance(m.product_query, kw.keyword).allowed
        : checkKeywordProductSignals(kw.keyword).valid,
    )

  const rawSearches = validKw?.monthly_searches
  const rawTop0     = kws[0]?.monthly_searches

  if (typeof avgReviews !== 'number' || avgReviews < MIN_REVS) {
    return { rawSearches: rawTop0, validatedKw: null, specificity: null, effectiveSearches: null,
             avgReviews, ratio: null, score: null,
             gateReason: `avg_review_count (${avgReviews ?? 'missing'}) < ${MIN_REVS}` }
  }
  if (!validKw) {
    return { rawSearches: rawTop0, validatedKw: null, specificity: null, effectiveSearches: null,
             avgReviews, ratio: null, score: null, gateReason: 'no validated keyword passes semantic filter' }
  }

  const specificity       = m.product_query ? keywordSpecificity(m.product_query, validKw.keyword) : 1.0
  const effectiveSearches = (rawSearches as number) * Math.max(specificity, SPEC_FLOOR)

  if (effectiveSearches < MIN_SEARCH) {
    return { rawSearches: rawSearches as number, validatedKw: validKw.keyword, specificity,
             effectiveSearches, avgReviews, ratio: null, score: null,
             gateReason: `effective searches ${effectiveSearches.toFixed(0)} < ${MIN_SEARCH} (raw ${(rawSearches as number).toLocaleString()} × specificity ${specificity.toFixed(2)})` }
  }

  const ratio      = effectiveSearches / avgReviews
  const logClamped = Math.max(-3, Math.min(3, Math.log10(ratio)))
  const score      = Math.round(((logClamped + 3) / 6) * 10 * 10) / 10
  return { rawSearches: rawSearches as number, validatedKw: validKw.keyword, specificity,
           effectiveSearches, avgReviews, ratio, score, gateReason: null }
}

// v2.3.0 moat score (old formula, for comparison)
function v230MoatScore(m: MemoData): number | null {
  const searches   = m.keyword_intelligence?.top_buying?.[0]?.monthly_searches
  const avgReviews = m.signal_evidence?.review_velocity?.value.avg_review_count
  if (typeof searches !== 'number' || searches < MIN_SEARCH ||
      typeof avgReviews !== 'number' || avgReviews < MIN_REVS) return null
  const ratio      = searches / avgReviews
  const logClamped = Math.max(-2, Math.min(2, Math.log10(ratio)))
  return Math.round(((logClamped + 2) / 4) * 10 * 10) / 10
}

function parseDollarString(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function v220ConsumerPainDampened(m: MemoData): number | null {
  const ci = m.consumer_intelligence
  if (!ci) return null

  const gapLen  = ci.categoryGapThemes?.length ?? 0
  const specLen = ci.productSpecificThemes?.length ?? 0
  const effectiveThemes = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? gapLen * 1.5 + specLen * 0.5
    : ci.negativeThemes.length

  const painPool = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density  = effectiveThemes / Math.log1p(painPool)
  const richness = Math.min(10, density * (10 / 3))
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const painComp = richness * 0.6 + severity * 0.4

  const prereqCount  = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const enhanceCount = ci.enhancementFeatureRequests?.length  ?? 0
  const structGaps   = gapLen * 1.5
  const solNaming    = (prereqCount + enhanceCount) * 0.8
  const total        = structGaps + solNaming
  const oppComp      = total === 0 ? 0 : total < 1.5 ? 2 : total < 3 ? 4 : total < 5 ? 6 : total < 7.5 ? 8 : 10

  const raw    = painComp * 0.6 + oppComp * 0.4
  const capped = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// v2.2.0 Market Accessibility: same 3 sub-signals, no Review Moat
function v220MarketAccessibility(m: MemoData): number | null {
  const se = m.signal_evidence
  const subs: { score: number; weight: number }[] = []
  if (se?.review_velocity) subs.push({ score: se.review_velocity.value.score, weight: 0.45 })
  if (se?.competition)     subs.push({ score: se.competition.value.score,      weight: 0.30 })
  const diff = m.keyword_intelligence?.top_buying?.[0]?.difficulty
  if (typeof diff === 'number') subs.push({ score: Math.max(0, Math.min(10, Math.round((100 - diff) / 10))), weight: 0.25 })
  if (!subs.length) return null
  const totalW  = subs.reduce((s, x) => s + x.weight, 0)
  return Math.round(subs.reduce((s, x) => s + x.score * (x.weight / totalW), 0) * 10) / 10
}

// ── v2.2.0 counterfactual score ──────────────────────────────────────────────
// Must use BASE weights (not the re-normalized v2.3.0 weights from dimensions[])
// to avoid mixing normalized fractions (0.232) with un-normalized bases (22).

const BASE_WEIGHTS = {
  demand: 22, marketAccessibility: 18, profitability: 20,
  consumerPain: 18, virality: 10, subscription: 7, manufacturing: 5,
}

function counterfactualV220Score(m: MemoData, v230dims: ScoreDimension[]): number | null {
  // Helper: the rawScore for a key from v230 (unchanged dimensions).
  const getScore = (key: string) => v230dims.find(d => d.key === key)?.rawScore ?? null

  // Helper: was this dimension excluded (weight=0) in v230?
  // After scoreFromCandidates re-normalization, excluded dimensions have weight=0.
  const isExcluded = (key: string) => {
    const d = v230dims.find(d => d.key === key)
    return !d || d.weight === 0
  }

  // v2.2.0 Market Accessibility (no Review Moat).
  const ma220 = v220MarketAccessibility(m)
  // v2.2.0 Consumer Pain: always scored (no weight-exclusion rule).
  // If consumer_intelligence is absent, also null in v2.2.0.
  const cp220 = v220ConsumerPainDampened(m)

  // Assign base weight to a dimension unless it was excluded in v230 because
  // of missing data (which would also cause exclusion in v2.2.0).
  // Exception: consumerPain — in v2.2.0 it's never excluded by the new rule,
  // so always assign base weight if consumer_intelligence exists.
  const entries: { w: number; s: number }[] = [
    { w: isExcluded('demand')          ? 0 : BASE_WEIGHTS.demand,              s: getScore('demand')          ?? 0 },
    { w: ma220 !== null               ? BASE_WEIGHTS.marketAccessibility : 0,  s: ma220 ?? 0 },
    { w: isExcluded('profitability')   ? 0 : BASE_WEIGHTS.profitability,       s: getScore('profitability')   ?? 0 },
    { w: cp220 !== null               ? BASE_WEIGHTS.consumerPain : 0,         s: cp220 ?? 0 },
    { w: isExcluded('virality')        ? 0 : BASE_WEIGHTS.virality,            s: getScore('virality')        ?? 0 },
    { w: isExcluded('subscription')    ? 0 : BASE_WEIGHTS.subscription,        s: getScore('subscription')    ?? 0 },
    { w: isExcluded('manufacturing')   ? 0 : BASE_WEIGHTS.manufacturing,       s: getScore('manufacturing')   ?? 0 },
  ]

  const totalW = entries.reduce((s, e) => s + e.w, 0)
  if (!totalW) return null
  const wavg = entries.reduce((s, e) => s + e.s * e.w, 0)
  return Math.max(0, Math.min(100, Math.round((wavg / totalW) * 10)))
}

// ── Display helpers ───────────────────────────────────────────────────────────

function bar(score: number, max = 10, width = 20): string {
  const filled = Math.round((score / max) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${score.toFixed(1)}/10`
}

function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }

function decisionSymbol(d: string): string {
  return d === 'BUILD_NOW' ? '✅ BUILD_NOW' : d === 'VALIDATE_FURTHER' ? '⚡ VALIDATE_FURTHER' : '❌ SKIP'
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: rows, error } = await sb
    .from('analyses')
    .select('id, raw_input, created_at, memo_data, scoring_version')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No rows found.'); return }

  // De-duplicate by product name, keep most recent
  const seen = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    const key = (r.raw_input ?? '').toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r)
  }

  const allMemos = Array.from(seen.values())

  type Scored = {
    name: string
    m: MemoData
    moat: MoatDebug
    v230: ReturnType<typeof computeGroundedScore>
    v220MarketAccess: number | null
    v220ConsumerPain: number | null
    v220Score: number | null
    consumerPainDim: ScoreDimension | undefined
    marketAccessDim: ScoreDimension | undefined
    exclusionActivated: boolean
  }

  const scored: Scored[] = []
  for (const r of allMemos) {
    const m = r.memo_data as MemoData | null
    if (!m) continue
    const moat     = reviewMoatDebug(m)
    const v230     = computeGroundedScore(m)
    const maDim    = v230.dimensions.find(d => d.key === 'marketAccessibility')
    const cpDim    = v230.dimensions.find(d => d.key === 'consumerPain')
    const excluded = cpDim?.source !== 'verified' && cpDim?.weight === 0
    scored.push({
      name: r.raw_input ?? '?', m, moat, v230,
      v220MarketAccess: v220MarketAccessibility(m),
      v220ConsumerPain: v220ConsumerPainDampened(m),
      v220Score: counterfactualV220Score(m, v230.dimensions),
      consumerPainDim: cpDim, marketAccessDim: maDim, exclusionActivated: excluded,
    })
  }

  // Pick 3: most dramatic high moat, most dramatic low moat, exclusion active
  const withMoat      = scored.filter(s => s.moat.score !== null)
  const withExclusion = scored.filter(s => s.exclusionActivated)
  withMoat.sort((a, b) => Math.abs((b.moat.score ?? 5) - 5) - Math.abs((a.moat.score ?? 5) - 5))
  const picks: Scored[] = []
  const moatHigh = withMoat.find(s => (s.moat.score ?? 5) > 5)
  const moatLow  = withMoat.find(s => (s.moat.score ?? 5) < 5 && s !== moatHigh)
  if (moatHigh) picks.push(moatHigh)
  if (moatLow)  picks.push(moatLow)
  const exclPick = withExclusion.find(s => !picks.includes(s))
  if (exclPick) picks.push(exclPick)
  for (const s of scored) { if (picks.length >= 3) break; if (!picks.includes(s)) picks.push(s) }
  const products = picks.slice(0, 3)

  console.log('\n' + '═'.repeat(72))
  console.log('  SCORING ENGINE v2.4.0 — VALIDATION REPORT')
  console.log('  Review Moat: specificity discount + extended log scale [-3,3]')
  console.log('═'.repeat(72))
  console.log(`  Source: ${allMemos.length} unique stored memos  ·  Showing ${products.length} products`)
  console.log('═'.repeat(72) + '\n')

  for (let i = 0; i < products.length; i++) {
    const { name, m, moat, v230, v220MarketAccess, v220ConsumerPain,
            v220Score, consumerPainDim, marketAccessDim, exclusionActivated } = products[i]

    const ci = m.consumer_intelligence
    const se = m.signal_evidence
    const kw = m.keyword_intelligence?.top_buying?.[0]

    console.log(`── PRODUCT ${i + 1}: ${name.toUpperCase()} ` + '─'.repeat(Math.max(0, 68 - name.length)))

    // ── Key raw signals ───────────────────────────────────────────────────────
    console.log('\n  KEY RAW SIGNALS')
    console.log(`  product_query               : ${m.product_query ?? '(legacy — no product_query stored)'}`)
    console.log(`  Top validated keyword       : ${moat.validatedKw ?? (kw?.keyword ?? 'n/a')}`)
    console.log(`  DataForSEO raw searches     : ${moat.rawSearches?.toLocaleString() ?? 'n/a'}`)
    console.log(`  Keyword specificity         : ${moat.specificity !== null ? (moat.specificity * 100).toFixed(0) + '%' : 'n/a'}`)
    console.log(`  Effective searches (×spec)  : ${moat.effectiveSearches !== null ? Math.round(moat.effectiveSearches).toLocaleString() : 'n/a'}`)
    console.log(`  Apify avg competitor reviews: ${moat.avgReviews?.toLocaleString() ?? 'n/a'}`)
    console.log(`  DataForSEO keyword difficulty: ${kw?.difficulty ?? 'n/a'}`)
    console.log(`  Keepa competition score     : ${se?.competition?.value.score ?? 'n/a'}/10`)
    console.log(`  Apify review-concentration  : ${se?.review_velocity?.value.score ?? 'n/a'}/10`)
    console.log(`  Consumer corpus size        : ${ci?.totalReviewsCollected ?? 'n/a'} reviews (thin threshold: ${THIN})`)
    console.log(`  Keepa est. units/mo         : ${se?.revenue?.value.est_monthly_units_sold ?? 'n/a'}`)

    // ── Review Moat ───────────────────────────────────────────────────────────
    console.log('\n  REVIEW MOAT (v2.4.0)')
    const v230MoatS = v230MoatScore(m)
    if (moat.gateReason) {
      console.log(`  Status    : ⚠  GATED OUT — ${moat.gateReason}`)
      console.log(`  Sub-signal: not added to Market Accessibility composite`)
    } else {
      const score = moat.score!
      const interpretation = score >= 8.0 ? 'VERY ACCESSIBLE — demand far exceeds review base' :
                             score >= 6.5 ? 'ACCESSIBLE — demand exceeds review density' :
                             score >= 5.5 ? 'NEUTRAL-HIGH — demand slightly exceeds reviews' :
                             score >= 4.5 ? 'NEUTRAL — searches ≈ review base' :
                             score >= 3.5 ? 'NEUTRAL-LOW — moderate review moat' :
                             score >= 2.0 ? 'MOATED — incumbents hold significant review advantage' :
                                           'HEAVILY MOATED — incumbents dominate review base'
      console.log(`  Status              : ✓  ACTIVE`)
      console.log(`  Effective ratio     : ${Math.round(moat.effectiveSearches!).toLocaleString()} / ${moat.avgReviews!.toLocaleString()} = ${moat.ratio!.toFixed(2)}:1`)
      console.log(`  log₁₀(ratio)        : ${Math.log10(moat.ratio!).toFixed(3)}  (clamped to [-3,3] from [-2,2])`)
      console.log(`  Score v2.4.0        : ${bar(score)}`)
      console.log(`  Score v2.3.0 (old)  : ${v230MoatS !== null ? bar(v230MoatS) : 'gated'}`)
      console.log(`  Specificity delta   : raw ${moat.rawSearches!.toLocaleString()} → effective ${Math.round(moat.effectiveSearches!).toLocaleString()} (${((moat.effectiveSearches! / moat.rawSearches!) * 100).toFixed(0)}% of raw)`)
      console.log(`  Reading             : ${interpretation}`)
    }

    // ── Market Accessibility breakdown ────────────────────────────────────────
    console.log('\n  MARKET ACCESSIBILITY BREAKDOWN')
    const reviewConc = se?.review_velocity?.value.score
    const compScore  = se?.competition?.value.score
    const diffScore  = typeof kw?.difficulty === 'number' ? Math.max(0, Math.min(10, Math.round((100 - kw.difficulty) / 10))) : null

    const subs: { label: string; raw: number | null; w230: number; w220: number }[] = [
      { label: 'Review concentration (Apify)', raw: reviewConc ?? null, w230: 0.45, w220: 0.45 },
      { label: 'Keepa competition',            raw: compScore  ?? null, w230: 0.30, w220: 0.30 },
      { label: 'Keyword difficulty (DataForSEO)', raw: diffScore,       w230: 0.25, w220: 0.25 },
      { label: 'Review Moat (v2.4.0)',         raw: moat.score,         w230: 0.10, w220: 0    },
    ]
    const present220 = subs.filter(s => s.raw !== null && s.w220 > 0)
    const present230 = subs.filter(s => s.raw !== null && s.w230 > 0)
    const tot220 = present220.reduce((s, x) => s + x.w220, 0)
    const tot230 = present230.reduce((s, x) => s + x.w230, 0)

    console.log(`  ${'Signal'.padEnd(38)} ${'Score'.padEnd(12)} ${'v2.2.0 w%'.padEnd(12)} v2.4.0 w%`)
    console.log('  ' + '─'.repeat(68))
    for (const s of subs) {
      const scoreStr = s.raw !== null ? s.raw.toFixed(1) : 'gated'
      const w220str  = s.raw !== null && s.w220 > 0 ? pct(s.w220 / tot220) : '—'
      const w230str  = s.raw !== null && s.w230 > 0 ? pct(s.w230 / tot230) : '—'
      console.log(`  ${s.label.padEnd(38)} ${scoreStr.padEnd(12)} ${w220str.padEnd(12)} ${w230str}`)
    }
    const ma230 = marketAccessDim?.rawScore ?? null
    console.log('  ' + '─'.repeat(68))
    console.log(`  ${'COMPOSITE'.padEnd(38)} ${'v2.2.0: ' + (v220MarketAccess?.toFixed(1) ?? 'n/a') + '/10'}`)
    console.log(`  ${''.padEnd(38)} ${'v2.4.0: ' + (ma230?.toFixed(1) ?? 'n/a') + '/10'}  (Δ ${ma230 !== null && v220MarketAccess !== null ? (ma230 - v220MarketAccess > 0 ? '+' : '') + (ma230 - v220MarketAccess).toFixed(1) : 'n/a'})`)

    // ── Customer Opportunity ──────────────────────────────────────────────────
    console.log('\n  CUSTOMER OPPORTUNITY')
    const keepaMonthly = parseDollarString(se?.revenue?.value.est_monthly_units_sold) ?? 0
    const dfSearches   = kw?.monthly_searches ?? 0
    const thinCorpus   = (ci?.totalReviewsCollected ?? Infinity) < THIN
    const crossVal     = dfSearches >= 10_000 || keepaMonthly >= 5_000

    if (exclusionActivated) {
      console.log(`  Status            : ✓  EXCLUSION ACTIVATED`)
      console.log(`  Corpus size       : ${ci?.totalReviewsCollected ?? '?'} reviews < ${THIN} (thin)`)
      console.log(`  Cross-validation  : ${dfSearches >= 10_000 ? `DataForSEO ${dfSearches.toLocaleString()} ≥ 10K` : ''}${dfSearches >= 10_000 && keepaMonthly >= 5_000 ? ' + ' : ''}${keepaMonthly >= 5_000 ? `Keepa ${keepaMonthly.toLocaleString()} ≥ 5K units/mo` : ''}`)
      console.log(`  v2.2.0 score      : ${v220ConsumerPain ?? 'n/a'}/10 (damped, full 18% weight → penalized)`)
      console.log(`  v2.4.0 treatment  : weight excluded (0%) + redistributed — "not yet measurable"`)
    } else if (thinCorpus && !crossVal) {
      console.log(`  Status            : ⚠  SCENARIO A — thin corpus, no demand cross-validation`)
      console.log(`  Treatment         : damped score retained (${v220ConsumerPain ?? 'n/a'}/10)`)
    } else if (!ci) {
      console.log(`  Status            : ⚠  NO CONSUMER INTELLIGENCE — dimension qualitative`)
    } else {
      const cpScore = consumerPainDim?.rawScore ?? null
      console.log(`  Status            : ✓  NORMAL${thinCorpus ? ' (thin, confidence-dampened)' : ''}`)
      console.log(`  Score             : ${cpScore ?? 'n/a'}/10  (unchanged from v2.3.0)`)
    }

    // ── Final Score ───────────────────────────────────────────────────────────
    console.log('\n  FINAL SCORE COMPARISON')
    const s230 = v230.score
    const s220 = v220Score
    const delta = s220 !== null ? s230 - s220 : null
    console.log(`  v2.2.0 score : ${s220 ?? 'n/a'} / 100`)
    console.log(`  v2.4.0 score : ${s230} / 100   (Δ ${delta !== null ? (delta > 0 ? '+' : '') + delta : 'n/a'})`)
    console.log(`  Decision     : ${decisionSymbol(v230.decision)}`)
    if (v230.insufficientEvidence) console.log(`  Gate cap     : insufficient evidence`)

    // ── Dimension summary ─────────────────────────────────────────────────────
    console.log('\n  ALL DIMENSIONS (v2.4.0, re-normalized weights)')
    console.log(`  ${'Dimension'.padEnd(30)} ${'Score'.padEnd(10)} ${'Weight%'.padEnd(10)} Source`)
    console.log('  ' + '─'.repeat(70))
    for (const d of v230.dimensions) {
      const scoreStr  = d.rawScore !== null ? `${d.rawScore}/10` : 'qualitative'
      const weightStr = pct(d.weight)
      const srcShort  = (d.sourceLabel ?? 'AI').slice(0, 36)
      const marker    = d.source !== 'verified' ? ' ⊘' : ''
      console.log(`  ${d.label.padEnd(30)} ${scoreStr.padEnd(10)} ${weightStr.padEnd(10)} ${srcShort}${marker}`)
    }
    console.log('\n' + '═'.repeat(72) + '\n')
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log('SUMMARY')
  console.log('─'.repeat(72))
  console.log(`${'Product'.padEnd(32)} ${'v2.2.0'.padEnd(8)} ${'v2.4.0'.padEnd(8)} ${'Δ'.padEnd(6)} Moat  Spec  Excl  Decision`)
  console.log('─'.repeat(72))
  for (const s of products) {
    const delta    = s.v220Score !== null ? s.v230.score - s.v220Score : null
    const deltaStr = delta !== null ? (delta > 0 ? '+' : '') + delta : 'n/a'
    const moatStr  = s.moat.score !== null ? s.moat.score.toFixed(1) : '—'
    const specStr  = s.moat.specificity !== null ? (s.moat.specificity * 100).toFixed(0) + '%' : '—'
    const exclStr  = s.exclusionActivated ? 'YES' : '—'
    console.log(`${s.name.slice(0, 31).padEnd(32)} ${String(s.v220Score ?? '?').padEnd(8)} ${String(s.v230.score).padEnd(8)} ${deltaStr.padEnd(6)} ${moatStr.padEnd(6)} ${specStr.padEnd(6)} ${exclStr.padEnd(6)} ${s.v230.decision}`)
  }
  console.log('─'.repeat(72) + '\n')
}

main().catch(err => { console.error(err); process.exit(1) })
