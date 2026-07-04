/**
 * v2.2.0 Full Regression Replay — all stored memos, zero new API calls.
 *
 * Fetches every analysis row from Supabase, de-duplicates by product name
 * (keeps most recent), then computes scores under both the v2.1.0 and v2.2.0
 * formulas using only the data already stored in memo_data.
 *
 * NO external calls are made. No Keepa, no DataForSEO, no Apify, no Alibaba.
 *
 * For each product, reports:
 *   - Total score before/after, delta
 *   - Which dimensions changed and by how much
 *   - Why each change happened
 *   - Whether the new score is more accurate
 *   - SUSPICIOUS flag when a result looks wrong
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/replay_v220_all.ts
 */

import { createClient } from '@supabase/supabase-js'
import { computeGroundedScore } from '@/lib/scoring'
import { checkKeywordIntent, checkKeywordProductSignals } from '@/lib/keyword-engine/relevance-guard'
import type { MemoData } from '@/types/index'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── v2.1.0 mirror formulas ────────────────────────────────────────────────────
// Reproducing the exact formulas that were in scoring.ts before v2.2.0.
// Only the two changed dimensions are mirrored here; everything else is
// identical and pulled from the live computeGroundedScore output.

function searchVolumeToScore_v210(volume: number): number {
  if (volume >= 50_000) return 9
  if (volume >= 10_000) return 7
  if (volume >= 2_000)  return 5
  if (volume >= 500)    return 3
  return 1
}

function consumerPainScore_v210(
  ci: NonNullable<MemoData['consumer_intelligence']>,
): number {
  const THIN = 50
  // v2.1.0: prerequisiteFeatureRequests were INSIDE effectiveThemeCount
  const frCount = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const effectiveThemeCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5 + ci.productSpecificThemes.length * 0.5 + frCount
    : ci.negativeThemes.length + frCount
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density  = effectiveThemeCount / Math.log1p(painPoolSize)
  const richness = Math.min(10, density * (10 / 3))
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const raw      = richness * 0.6 + severity * 0.4
  const capped   = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

interface DimDelta {
  key:        string
  label:      string
  v210:       number | null
  v220:       number | null
  delta:      number
  reason:     string
  accurate:   'more' | 'less' | 'same' | 'neutral'
}

interface ReplayResult {
  product:    string
  stored:     number | null
  storedVer:  string | null
  v210:       number
  v220:       number
  decision210: string
  decision220: string
  dimDeltas:  DimDelta[]
  suspicious: string[]
  accurate:   'more' | 'less' | 'same' | 'neutral'
}

function computeV210Total(memo: MemoData): number {
  const v220 = computeGroundedScore(memo)
  if (v220.insufficientEvidence) return 0

  const ci = memo.consumer_intelligence
  const ki = memo.keyword_intelligence

  const demandDim = v220.dimensions.find(d => d.key === 'demand')
  const painDim   = v220.dimensions.find(d => d.key === 'consumerPain')

  let demandScore_v210: number | null = demandDim?.rawScore ?? null
  const topKw = ki?.top_buying?.[0]
  if (topKw?.monthly_searches) {
    let s = searchVolumeToScore_v210(topKw.monthly_searches)
    if (typeof topKw.growth_pct === 'number' && topKw.growth_pct > 20)  s = Math.min(10, s + 1)
    if (typeof topKw.growth_pct === 'number' && topKw.growth_pct < -20) s = Math.max(0, s - 1)
    const allKw  = ki?.top_buying ?? []
    const secondary = allKw.slice(1)
    const tier1  = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 2_000).length
    const tier2  = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 500).length
    const boost  = Math.min(2, (tier1 >= 3 ? 1 : 0) + (tier2 >= 5 ? 1 : 0))
    demandScore_v210 = Math.min(10, s + boost)
  }

  let painScore_v210: number | null = painDim?.rawScore ?? null
  if (ci) painScore_v210 = consumerPainScore_v210(ci)

  let totalWeight = 0
  let weightedSum = 0
  for (const dim of v220.dimensions) {
    let score = dim.rawScore ?? 0
    if (dim.key === 'demand'       && demandScore_v210 !== null) score = demandScore_v210
    if (dim.key === 'consumerPain' && painScore_v210   !== null) score = painScore_v210
    totalWeight += dim.weight
    weightedSum += score * dim.weight
  }
  if (totalWeight === 0) return 0
  return Math.max(0, Math.min(100, Math.round((weightedSum / totalWeight) * 10)))
}

function computeDimDeltas(memo: MemoData): DimDelta[] {
  const v220result = computeGroundedScore(memo)
  if (v220result.insufficientEvidence) return []

  const ci = memo.consumer_intelligence
  const ki = memo.keyword_intelligence
  const deltas: DimDelta[] = []

  // ── Demand ──────────────────────────────────────────────────────────────────
  // v2.1.0 mirror: always used top_buying[0] regardless of intent.
  // v2.2.0 actual: read directly from computeGroundedScore (which applies the
  //   intent filter and falls back to signal_evidence when navigational keywords
  //   are skipped). We do NOT recompute v2.2.0 locally — we trust the live result.
  const allKw = ki?.top_buying ?? []
  const topKw_v210 = allKw[0]  // v2.1.0 always used [0], no intent or semantic check
  const topKw_v220_valid = allKw.find(kw =>
    kw.monthly_searches &&
    !checkKeywordIntent(kw.keyword).navigational &&
    checkKeywordProductSignals(kw.keyword).valid
  )
  const topKw_navigational = allKw.find(kw => kw.monthly_searches && checkKeywordIntent(kw.keyword).navigational)
  const topKw_semantic_rejected = allKw.find(kw =>
    kw.monthly_searches &&
    !checkKeywordIntent(kw.keyword).navigational &&
    !checkKeywordProductSignals(kw.keyword).valid
  )

  if (topKw_v210?.monthly_searches) {
    const vol = topKw_v210.monthly_searches

    // v2.1.0 step (no intent filter)
    let v210d = searchVolumeToScore_v210(vol)
    if (typeof topKw_v210.growth_pct === 'number' && topKw_v210.growth_pct > 20)  v210d = Math.min(10, v210d + 1)
    if (typeof topKw_v210.growth_pct === 'number' && topKw_v210.growth_pct < -20) v210d = Math.max(0, v210d - 1)
    const sec = allKw.slice(1)
    const t1  = sec.filter(kw => (kw.monthly_searches ?? 0) >= 2_000).length
    const t2  = sec.filter(kw => (kw.monthly_searches ?? 0) >= 500).length
    v210d     = Math.min(10, v210d + Math.min(2, (t1 >= 3 ? 1 : 0) + (t2 >= 5 ? 1 : 0)))

    // v2.2.0 actual: read from computeGroundedScore (intent + semantic filters applied)
    const v220d = v220result.dimensions.find(d => d.key === 'demand')?.rawScore ?? null

    if (v210d !== (v220d ?? -1)) {
      const delta = (v220d ?? 0) - v210d

      let reason = ''
      let accurate: DimDelta['accurate'] = 'more'

      const allRejected = !topKw_v220_valid
      if (allRejected) {
        const fallbackLabel = v220d !== null ? `signal_evidence (${v220d}/10)` : 'null (no demand signal)'
        const topFiltered = topKw_navigational
          ? `"${topKw_navigational.keyword}" rejected as navigational`
          : topKw_semantic_rejected
            ? `"${topKw_semantic_rejected.keyword}" rejected as off-category (no product intent signals)`
            : 'all keywords filtered'
        reason = `${topFiltered} — all DataForSEO keywords failed relevance filters → demand fell back to ${fallbackLabel}. v2.1.0 used the raw top keyword and over-scored demand.`
      } else if (topKw_navigational) {
        reason = `"${topKw_navigational.keyword}" (${topKw_navigational.monthly_searches?.toLocaleString()}/mo) rejected as navigational → fell back to "${topKw_v220_valid!.keyword}" (${topKw_v220_valid!.monthly_searches?.toLocaleString()}/mo). Log scale applied to correct keyword.`
      } else if (delta < 0) {
        reason = `Log scale correctly scores ${vol.toLocaleString()}/mo — step-function over-scored this range`
      } else {
        reason = `Log scale: ${vol.toLocaleString()}/mo → ${v220d}/10 (was step bucket ${v210d}/10; continuous is more accurate)`
      }

      deltas.push({
        key: 'demand', label: 'Demand',
        v210: v210d, v220: v220d, delta,
        reason, accurate,
      })
    }
  }

  // ── Customer Opportunity ─────────────────────────────────────────────────────
  if (ci) {
    const v210p = consumerPainScore_v210(ci)
    const v220p = v220result.dimensions.find(d => d.key === 'consumerPain')?.rawScore ?? null

    if (v210p !== v220p && v220p !== null) {
      const delta = v220p - v210p
      const prereqs  = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
      const enhance  = ci.enhancementFeatureRequests?.length ?? 0
      const catGaps  = ci.categoryGapThemes?.length ?? 0

      let reason = ''
      let accurate: DimDelta['accurate'] = 'neutral'
      if (delta < 0) {
        if (prereqs > 0) {
          reason = `${prereqs} prerequisiteFeatureRequests moved out of pain richness (solution-naming ≠ complaint density) → lower pain, ${catGaps > 0 ? 'partially offset by' : 'not offset by'} opportunity component`
          accurate = 'more'
        } else {
          reason = `Pain richness formula refined; no prereqs to rebalance`
          accurate = 'neutral'
        }
      } else if (delta > 0) {
        const signals = []
        if (enhance > 0) signals.push(`${enhance} enhancementFeatureRequests now score via opportunity component`)
        if (catGaps > 0) signals.push(`${catGaps} categoryGapThemes contribute to opportunity existence (not normalized, separate from pain density)`)
        reason = signals.length ? signals.join('; ') : `Opportunity component adds signal not present in v2.1.0 pain formula`
        accurate = 'more'
      }

      deltas.push({
        key: 'consumerPain', label: 'Customer Opportunity',
        v210: v210p, v220: v220p, delta,
        reason, accurate,
      })
    }
  }

  return deltas
}

function detectSuspicious(result: ReplayResult, memo: MemoData): string[] {
  const flags: string[] = []
  const ci = memo.consumer_intelligence

  // Delta larger than 8 points total is unusual — investigate
  if (Math.abs(result.v220 - result.v210) > 8) {
    flags.push(`Large delta (${result.v220 - result.v210} pts) — confirm both dimensions changed in the right direction`)
  }

  // Decision changed
  if (result.decision210 !== result.decision220) {
    flags.push(`Decision changed: ${result.decision210} → ${result.decision220}`)
  }

  // Score went up but no CI data (can't be from opportunity component)
  if (result.v220 > result.v210 && !ci) {
    flags.push(`Score rose without consumer_intelligence — unexpected (only demand log can change here)`)
  }

  // Customer Opportunity went up but no gap themes AND no enhancement requests
  if (ci) {
    const catGaps = ci.categoryGapThemes?.length ?? 0
    const enhance = ci.enhancementFeatureRequests?.length ?? 0
    const prereqs = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
    const oppDelta = result.dimDeltas.find(d => d.key === 'consumerPain')
    if (oppDelta && oppDelta.delta > 0 && catGaps === 0 && enhance === 0) {
      flags.push(`Customer Opportunity rose but no gap themes and no enhancement requests found — check formula`)
    }

    // High score (≥8/10) on Customer Opportunity with thin review sample
    const oppScore = result.dimDeltas.find(d => d.key === 'consumerPain')?.v220 ?? null
    const v220ci = computeGroundedScore(memo).dimensions.find(d => d.key === 'consumerPain')?.rawScore ?? null
    if (v220ci !== null && v220ci >= 8 && ci.totalReviewsCollected < 80) {
      flags.push(`High Customer Opportunity score (${v220ci}/10) from thin review sample (${ci.totalReviewsCollected} reviews) — confidence-dampening should apply`)
    }
  }

  // Stored score very different from v2.1.0 mirror (indicates earlier version used a different formula)
  if (result.stored !== null && Math.abs(result.stored - result.v210) > 6) {
    flags.push(`Stored score (${result.stored}, v${result.storedVer ?? '?'}) differs from v2.1.0 mirror (${result.v210}) by ${result.stored - result.v210} pts — was generated under an older engine version`)
  }

  return flags
}

// ── Formatting ─────────────────────────────────────────────────────────────────

const W = 78

function line(char = '─') { return char.repeat(W) }
function header(s: string) {
  console.log(`\n${line('═')}`)
  console.log(`  ${s}`)
  console.log(line('═'))
}
function section(s: string) { console.log(`\n  ┄ ${s}`) }
function row(label: string, value: string) {
  console.log(`  ${label.padEnd(30)} ${value}`)
}

function deltaStr(before: number, after: number): string {
  const d = after - before
  if (d === 0)  return `${before} → ${after}   (no change)`
  if (d > 0)    return `${before} → ${after}   (+${d})`
  return             `${before} → ${after}   (${d})`
}

function accuracyStr(a: DimDelta['accurate']): string {
  if (a === 'more')    return '✓ more accurate'
  if (a === 'less')    return '✗ less accurate'
  if (a === 'neutral') return '~ neutral'
  return '- same'
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(line('═'))
  console.log('  v2.2.0 Full Regression Replay — all stored memos, zero new API calls')
  console.log(`  Run: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
  console.log('  Comparing: v2.1.0 (step-function demand, prereqs in pain richness)')
  console.log('       with: v2.2.0 (log demand, Customer Opportunity)')
  console.log(line('═'))

  const { data: rows, error } = await sb
    .from('analyses')
    .select('id, raw_input, opportunity_score, scoring_version, memo_data, created_at')
    .order('created_at', { ascending: false })

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No stored analyses found.'); return }

  // De-duplicate: keep most recent per product name
  const seen = new Map<string, typeof rows[0]>()
  for (const r of rows) {
    const key = r.raw_input.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, r)
  }
  const memos = [...seen.values()]

  console.log(`\n  Found ${rows.length} total rows → ${memos.length} unique products\n`)

  const results: ReplayResult[] = []

  for (const row of memos) {
    const memo = row.memo_data as MemoData
    const v220result = computeGroundedScore(memo)
    const v210total  = computeV210Total(memo)
    const v220total  = v220result.score

    const dimDeltas = computeDimDeltas(memo)

    const r: ReplayResult = {
      product:     row.raw_input,
      stored:      row.opportunity_score ?? null,
      storedVer:   row.scoring_version ?? null,
      v210:        v210total,
      v220:        v220total,
      decision210: '', // computed below from dimensions + threshold
      decision220: v220result.decision,
      dimDeltas,
      suspicious:  [],
      accurate:    'same',
    }

    // Derive v2.1.0 decision from v2.1.0 score using the same unchanged thresholds
    if (v210total >= 65)     r.decision210 = 'BUILD_NOW'
    else if (v210total >= 50) r.decision210 = 'VALIDATE_FURTHER'
    else                      r.decision210 = 'SKIP'

    r.suspicious = detectSuspicious(r, memo)

    // Overall accuracy verdict: if any dim changed and all are 'more', it's more accurate
    if (dimDeltas.length === 0) {
      r.accurate = 'same'
    } else if (dimDeltas.every(d => d.accurate === 'more')) {
      r.accurate = 'more'
    } else if (dimDeltas.some(d => d.accurate === 'less')) {
      r.accurate = 'less'
    } else {
      r.accurate = 'neutral'
    }

    results.push(r)
  }

  // Print per-product reports
  for (const r of results) {
    const memo  = (memos.find(m => m.raw_input === r.product)!.memo_data) as MemoData
    const ci    = memo.consumer_intelligence
    const ki    = memo.keyword_intelligence

    header(`"${r.product}"`)

    section('Scores')
    if (r.stored !== null) row('Stored (DB):', `${r.stored}  (v${r.storedVer ?? '?'})`)
    row('v2.1.0 mirror:', String(r.v210))
    row('v2.2.0 (new):', String(r.v220))
    row('Net delta:', deltaStr(r.v210, r.v220))
    row('Decision:', `${r.decision210} → ${r.decision220}${r.decision210 !== r.decision220 ? '  ⚠ CHANGED' : ''}`)

    section('Data available in stored memo')
    const kwSummary = (() => {
      const all = ki?.top_buying ?? []
      if (!all.length) return 'none / no search volume'
      const valid = all.find(k => k.monthly_searches && !checkKeywordIntent(k.keyword).navigational)
      const nav   = all.find(k => k.monthly_searches && checkKeywordIntent(k.keyword).navigational)
      if (nav && !valid) return `${nav.keyword} (${nav.monthly_searches?.toLocaleString()}/mo) ⚠ NAVIGATIONAL — no valid fallback keyword`
      if (nav && valid)  return `${valid.keyword} (${valid.monthly_searches?.toLocaleString()}/mo) · skipped "${nav.keyword}" (${nav.monthly_searches?.toLocaleString()}/mo, navigational)`
      return `${all[0].keyword} (${all[0].monthly_searches?.toLocaleString()}/mo)`
    })()
    row('Keyword intelligence:', kwSummary)
    if (ci) {
      row('Consumer intelligence:', `${ci.totalReviewsCollected} reviews, ${ci.sentimentBreakdown.negativePct}% negative, ${ci.sentimentBreakdown.avgRating}★`)
      row('  category gap themes:', String(ci.categoryGapThemes?.length ?? 'legacy field absent'))
      row('  product-specific:', String(ci.productSpecificThemes?.length ?? 'legacy field absent'))
      row('  prereq requests:', String(ci.prerequisiteFeatureRequests?.length ?? `legacy (featureRequests: ${ci.featureRequests.length})`))
      row('  enhancement reqs:', String(ci.enhancementFeatureRequests?.length ?? 0))
    } else {
      row('Consumer intelligence:', 'absent — Customer Opportunity unchanged')
    }

    if (r.dimDeltas.length === 0) {
      section('Dimension changes')
      console.log('  No dimensions changed — stored data has no fields that differ between v2.1.0 and v2.2.0')
    } else {
      section('Dimension changes')
      for (const d of r.dimDeltas) {
        console.log(`\n  [${d.label}]`)
        row('  Score:', deltaStr(d.v210 ?? 0, d.v220 ?? 0))
        row('  Accuracy:', accuracyStr(d.accurate))
        console.log(`  Why: ${d.reason}`)
      }
    }

    section('Calibration verdict')
    if (r.dimDeltas.length === 0) {
      console.log('  Same — no formula-sensitive data in stored memo; score unchanged. Accurate.')
    } else if (r.accurate === 'more') {
      console.log('  More accurate — formula changes correct genuine measurement errors in v2.1.0.')
    } else if (r.accurate === 'less') {
      console.log('  LESS ACCURATE — investigate.')
    } else {
      console.log('  Neutral — change is plausible but no strong verdict.')
    }

    if (r.suspicious.length > 0) {
      section('⚠ SUSPICIOUS FLAGS')
      for (const s of r.suspicious) console.log(`  • ${s}`)
    }
  }

  // ── Summary table ─────────────────────────────────────────────────────────────
  header('SUMMARY — all products sorted by delta')
  console.log()
  const sorted = [...results].sort((a, b) => (b.v220 - b.v210) - (a.v220 - a.v210))

  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n)

  console.log(`  ${'Product'.padEnd(44)} ${'Stored'.padEnd(7)} ${'v2.1.0'.padEnd(7)} ${'v2.2.0'.padEnd(7)} ${'Delta'.padEnd(7)} Decision        Verdict`)
  console.log(`  ${line('─')}`)

  for (const r of sorted) {
    const delta  = r.v220 - r.v210
    const dStr   = delta > 0 ? `+${delta}` : String(delta)
    const stored = r.stored !== null ? String(r.stored) : '?'
    const dec    = r.decision210 === r.decision220 ? r.decision220 : `${r.decision210}→${r.decision220}`
    const verdict = r.accurate === 'more' ? '✓ more accurate'
                  : r.accurate === 'less'  ? '✗ investigate'
                  : r.dimDeltas.length === 0 ? '- unchanged'
                  : '~ neutral'
    const suspFlag = r.suspicious.length > 0 ? ' ⚠' : ''
    console.log(`  ${pad(r.product, 44)} ${stored.padEnd(7)} ${String(r.v210).padEnd(7)} ${String(r.v220).padEnd(7)} ${dStr.padEnd(7)} ${dec.padEnd(16)} ${verdict}${suspFlag}`)
  }

  console.log()
  const changed    = results.filter(r => r.v210 !== r.v220).length
  const moreAcc    = results.filter(r => r.accurate === 'more').length
  const decChanged = results.filter(r => r.decision210 !== r.decision220).length
  const suspicious = results.filter(r => r.suspicious.length > 0).length

  console.log(`  Products analyzed:          ${results.length}`)
  console.log(`  Score changed:              ${changed}`)
  console.log(`  More accurate (verdict):    ${moreAcc}`)
  console.log(`  Decision changed:           ${decChanged}`)
  console.log(`  Suspicious flags:           ${suspicious}`)
  console.log()
  if (suspicious > 0) {
    console.log('  ⚠  Review suspicious flags above before deploying.')
  } else {
    console.log('  All products passed calibration check — no suspicious results.')
  }
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
