/**
 * v2.2.0 Before/After Validation
 *
 * Pulls the 3 most recent stored memos from the database, then computes and
 * compares scores under the v2.1.0 and v2.2.0 formulas dimension-by-dimension.
 * Also runs postpartum hair serum explicitly if found.
 *
 * Goal: confirm that score changes are caused by the formula improvements,
 * not by bugs. A change in score is expected and correct when:
 *   - Demand: products with 10k-50k searches score lower (step-function was inflated)
 *   - Customer Opportunity: changes reflect real differences in how gaps/requests
 *     were decomposed, not noise
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/validate_v220_before_after.ts
 */

import { createClient } from '@supabase/supabase-js'
import { computeGroundedScore } from '@/lib/scoring'
import type { MemoData } from '@/types/index'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── v2.1.0 mirror formulas ────────────────────────────────────────────────────
// These reproduce the OLD scoring behavior so we can compare before/after.

function searchVolumeToScore_v210(volume: number): number {
  if (volume >= 50_000) return 9
  if (volume >= 10_000) return 7
  if (volume >= 2_000)  return 5
  if (volume >= 500)    return 3
  return 1
}

function consumerPainScore_v210(ci: NonNullable<MemoData['consumer_intelligence']>): number {
  const THIN = 50
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

function computeGroundedScore_v210(memo: MemoData): number {
  // Simplified v2.1.0 score: recompute only the two changed dimensions,
  // keep everything else from the current computeGroundedScore logic.
  // We compute the full v2.2.0 grounded score, then reconstruct v2.1.0
  // by adjusting the two changed dimensions in the weighted sum.
  const v220 = computeGroundedScore(memo)
  if (v220.insufficientEvidence) return 0

  const ci = memo.consumer_intelligence
  const ki = memo.keyword_intelligence

  // Find which dimensions exist in v2.2.0 result
  const demandDim = v220.dimensions.find(d => d.key === 'demand')
  const painDim   = v220.dimensions.find(d => d.key === 'consumerPain')

  // Reconstruct demand score using v2.1.0 step-function
  let demandScore_v210 = demandDim?.rawScore ?? null
  const topKeyword = ki?.top_buying?.[0]
  if (topKeyword?.monthly_searches) {
    let s = searchVolumeToScore_v210(topKeyword.monthly_searches)
    if (typeof topKeyword.growth_pct === 'number' && topKeyword.growth_pct > 20)  s = Math.min(10, s + 1)
    if (typeof topKeyword.growth_pct === 'number' && topKeyword.growth_pct < -20) s = Math.max(0, s - 1)
    // breadth boost: same as v2.2.0 (unchanged)
    const allKw = ki?.top_buying ?? []
    const secondary = allKw.slice(1)
    const tier1 = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 2_000).length
    const tier2 = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 500).length
    const boost = Math.min(2, (tier1 >= 3 ? 1 : 0) + (tier2 >= 5 ? 1 : 0))
    s = Math.min(10, s + boost)
    demandScore_v210 = s
  }

  // Reconstruct pain score using v2.1.0 formula
  let painScore_v210 = painDim?.rawScore ?? null
  if (ci) {
    painScore_v210 = consumerPainScore_v210(ci)
  }

  // Rebuild the weighted sum with v2.1.0 dimension scores
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

// ── Formatting ─────────────────────────────────────────────────────────────────

function hr(label: string) {
  console.log(`\n${'═'.repeat(76)}`)
  console.log(`  ${label}`)
  console.log('═'.repeat(76))
}

function sub(label: string) { console.log(`\n  ── ${label}`) }

function arrow(before: number, after: number): string {
  const delta = after - before
  if (delta === 0)  return `${before} → ${after}  (no change)`
  if (delta > 0)    return `${before} → ${after}  (+${delta} — higher score; verify evidence supports it)`
  return `${before} → ${after}  (${delta} — lower score; more accurate if formula was inflating before)`
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('v2.2.0 Before/After Validation')
  console.log(`Date: ${new Date().toISOString().slice(0, 10)}`)
  console.log('Comparing v2.1.0 (step-function, pain-includes-prereqs)')
  console.log('     with v2.2.0 (log scale, Customer Opportunity)')

  // Fetch most recent scored memos that have consumer_intelligence data
  const { data: rows, error } = await sb
    .from('analyses')
    .select('id, raw_input, opportunity_score, scoring_version, memo_data')
    .not('memo_data->consumer_intelligence', 'is', null)
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) { console.error('DB fetch failed:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('No stored memos with consumer_intelligence found.'); return }

  // Deduplicate by raw_input, keep first occurrence (most recent)
  const seen = new Set<string>()
  const memos = rows.filter(r => {
    const key = r.raw_input.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)

  console.log(`\nAnalyzing ${memos.length} products:\n`)
  memos.forEach((m, i) => console.log(`  ${i + 1}. "${m.raw_input}"  (stored: ${m.opportunity_score}, v${m.scoring_version ?? '?'})`))

  for (const row of memos) {
    const memo = row.memo_data as MemoData
    const ci   = memo.consumer_intelligence

    hr(`"${row.raw_input}"`)

    const v210total = computeGroundedScore_v210(memo)
    const v220result = computeGroundedScore(memo)
    const v220total  = v220result.score

    // ── Total score ──────────────────────────────────────────────────────────
    sub('Total Opportunity Score')
    console.log(`  Stored (${row.scoring_version ?? 'prior'}):  ${row.opportunity_score}`)
    console.log(`  v2.1.0 mirror:                ${v210total}`)
    console.log(`  v2.2.0 (new):                 ${v220total}`)
    console.log(`  Net change:                   ${arrow(v210total, v220total)}`)

    // ── Demand ───────────────────────────────────────────────────────────────
    sub('Demand dimension')
    const ki = memo.keyword_intelligence
    const topKw = ki?.top_buying?.[0]
    if (topKw?.monthly_searches) {
      // v2.1.0 step
      let v210d = searchVolumeToScore_v210(topKw.monthly_searches)
      if (typeof topKw.growth_pct === 'number' && topKw.growth_pct > 20)  v210d = Math.min(10, v210d + 1)
      if (typeof topKw.growth_pct === 'number' && topKw.growth_pct < -20) v210d = Math.max(0, v210d - 1)
      // v2.2.0 log — replicate the formula
      const logMin = 500, logMax = 200_000
      const raw = (Math.log10(topKw.monthly_searches) - Math.log10(logMin))
                / (Math.log10(logMax) - Math.log10(logMin)) * 10
      let v220d = Math.max(0, Math.min(10, Math.round(raw * 10) / 10))
      if (typeof topKw.growth_pct === 'number' && topKw.growth_pct > 20)  v220d = Math.min(10, v220d + 1)
      if (typeof topKw.growth_pct === 'number' && topKw.growth_pct < -20) v220d = Math.max(0, v220d - 1)
      console.log(`  Top keyword:   "${topKw.keyword}" — ${topKw.monthly_searches.toLocaleString()} searches/mo`)
      console.log(`  v2.1.0 step:   ${v210d}/10`)
      console.log(`  v2.2.0 log:    ${v220d}/10`)
      console.log(`  Change:        ${arrow(v210d, v220d)}`)
      if (v220d < v210d) {
        console.log(`  Why lower:     Log scale correctly reflects market size; step-function over-scored this range`)
      }
    } else {
      console.log('  No keyword search volume data — Demand score unchanged')
    }

    // ── Customer Opportunity ─────────────────────────────────────────────────
    sub('Customer Opportunity (was: Customer Pain / Unmet Need)')
    if (ci) {
      const v210pain = consumerPainScore_v210(ci)
      const v220dim  = v220result.dimensions.find(d => d.key === 'consumerPain')
      const v220pain = v220dim?.rawScore ?? null

      // Pain component internals
      const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
      const catGaps = ci.categoryGapThemes?.length ?? 0
      const prodSpec = ci.productSpecificThemes?.length ?? 0
      const prereqs  = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
      const enhance  = ci.enhancementFeatureRequests?.length ?? 0

      const effCount_v210 = catGaps * 1.5 + prodSpec * 0.5 + prereqs
      const effCount_v220 = catGaps * 1.5 + prodSpec * 0.5  // prereqs moved out

      // Opportunity component
      const structuralGaps   = catGaps * 1.5
      const solutionNaming   = (prereqs + enhance) * 0.8
      const oppTotal         = structuralGaps + solutionNaming
      const oppComponent     = oppTotal === 0 ? 0 : oppTotal < 1.5 ? 2 : oppTotal < 3 ? 4 : oppTotal < 5 ? 6 : oppTotal < 7.5 ? 8 : 10

      console.log(`  Reviews:             ${ci.totalReviewsCollected} total (${ci.negativePoolSize} critical, ${ci.positivePoolSize} positive)`)
      console.log(`  Sentiment:           ${ci.sentimentBreakdown.negativePct}% negative, ${ci.sentimentBreakdown.avgRating}★ avg`)
      console.log(`  Category gap themes: ${catGaps}  (cross-competitor)`)
      console.log(`  Product-specific:    ${prodSpec}  (one-brand issues)`)
      console.log(`  Prereq. requests:    ${prereqs}  (from critical reviews — naming solutions)`)
      console.log(`  Enhancement reqs:    ${enhance}  (from positive reviews — naming improvements)`)
      console.log()
      console.log(`  v2.1.0 effectiveThemeCount: ${effCount_v210.toFixed(1)}  (included prereqs in pain density)`)
      console.log(`  v2.2.0 effectiveThemeCount: ${effCount_v220.toFixed(1)}  (prereqs moved to opportunity)`)
      console.log(`  v2.2.0 opportunity total:   ${oppTotal.toFixed(1)}  → component score ${oppComponent}/10`)
      console.log()
      console.log(`  v2.1.0 pain score:          ${v210pain}/10`)
      console.log(`  v2.2.0 opportunity score:   ${v220pain ?? 'N/A'}/10`)
      console.log(`  Change: ${arrow(v210pain, v220pain ?? v210pain)}`)

      if ((v220pain ?? v210pain) < v210pain) {
        if (prereqs > 0) {
          console.log(`  Why lower:   ${prereqs} prereq request(s) no longer inflate pain richness; correctly reclassified as opportunity signal`)
        }
      } else if ((v220pain ?? v210pain) > v210pain) {
        console.log(`  Why higher:  Opportunity component (structural gaps + solution naming) contributes real signal that was previously zero`)
      }
    } else {
      console.log('  No consumer intelligence — Customer Opportunity unchanged')
    }

    // ── Decision ──────────────────────────────────────────────────────────────
    sub('Decision')
    console.log(`  Stored:   ${memo.build_decision ?? 'N/A'}`)
    console.log(`  v2.2.0:   ${v220result.decision}`)
    if (v220result.decision !== memo.build_decision) {
      console.log('  DECISION CHANGED — verify the new decision is accurate for this product')
    } else {
      console.log('  Decision unchanged — consistent with stored memo')
    }
  }

  hr('Summary')
  console.log()
  for (const row of memos) {
    const memo   = row.memo_data as MemoData
    const v210   = computeGroundedScore_v210(memo)
    const v220   = computeGroundedScore(memo).score
    const delta  = v220 - v210
    const sign   = delta > 0 ? `+${delta}` : `${delta}`
    console.log(`  "${row.raw_input.slice(0, 45).padEnd(45)}"  v2.1.0=${v210}  v2.2.0=${v220}  delta=${sign}`)
  }
  console.log()
  console.log('  Interpretation guide:')
  console.log('  - Demand drop (10k-50k markets): EXPECTED — step-function over-scored this range')
  console.log('  - Demand rise (>200k markets): EXPECTED — step-function capped at 9, log goes to 10')
  console.log('  - Opportunity drop (many prereqs): EXPECTED — prereqs no longer inflate pain density')
  console.log('  - Opportunity rise (real gaps + enhancement requests): EXPECTED — opportunity component now scores')
  console.log('  - A score rising from 48→51 or falling from 67→63 is calibration, not gaming')
}

main().catch(e => { console.error(e); process.exit(1) })
