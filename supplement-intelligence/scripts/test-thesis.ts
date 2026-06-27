/**
 * Step 4 end-to-end synthesis test
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/test-thesis.ts
 *
 * What this exercises:
 *   1. Every enabled signal provider (Keepa, Google Trends, TikTok; Reddit if
 *      credentials present; Amazon/Meta Ads when implemented)
 *   2. Signal → Signal[] adapter in the thesis orchestrator
 *   3. Cross-source convergence clustering
 *   4. Claude synthesis into the five thesis sections
 *   5. Thesis cache (Supabase) — graceful skip if SERVICE_ROLE_KEY absent
 *   6. Complete MarketThesis assembly with source attribution and confidence
 */

import { signalEngine }  from '@/lib/signal-engine'
import { synthesize }    from '@/lib/thesis-engine'
import type { MarketThesis }      from '@/lib/thesis-engine'
import type { AggregatedSignals } from '@/lib/signal-engine/types'

// ── helpers ────────────────────────────────────────────────────────────────

const QUERY = 'gut health supplements'
const DEPTH = 'standard' as const

function hr(title: string) {
  const line = '─'.repeat(60)
  console.log(`\n${line}`)
  console.log(` ${title}`)
  console.log(line)
}

function pp(label: string, value: unknown) {
  console.log(`\n[${label}]`)
  console.log(JSON.stringify(value, null, 2))
}

function summariseSignals(agg: AggregatedSignals) {
  const dims: [string, unknown][] = [
    ['demand',          agg.demand],
    ['competition',     agg.competition],
    ['growth',          agg.growth],
    ['seasonality',     agg.seasonality],
    ['pricing',         agg.pricing],
    ['virality',        agg.virality],
    ['review_velocity', agg.review_velocity],
  ]
  for (const [name, dim] of dims) {
    if (!dim) continue
    const d = dim as { value: { score: number; confidence: number }; sources: string[]; confidence: number }
    console.log(`  ${name.padEnd(18)} score=${d.value.score}/10  conf=${Math.round(d.confidence * 100)}%  sources=[${d.sources.join(', ')}]`)
  }
}

function summariseThesis(thesis: MarketThesis) {
  hr('VERDICT')
  console.log(`  Signal strength  : ${thesis.verdict.signal_strength}`)
  console.log(`  Opportunity score: ${thesis.verdict.opportunity_score}/100`)
  console.log(`  One-liner        : ${thesis.verdict.one_liner}`)
  console.log(`  Confidence       : ${thesis.verdict.confidence.label} (${Math.round(thesis.verdict.confidence.value * 100)}%)`)
  console.log(`  Summary          : ${thesis.verdict.summary}`)

  hr('TIMING')
  console.log(`  Verdict          : ${thesis.timing.timing_verdict}`)
  console.log(`  Phase            : ${thesis.timing.phase_label}`)
  console.log(`  Window           : ${thesis.timing.window_estimate.direction} — ${thesis.timing.window_estimate.explanation}`)
  console.log(`  Summary          : ${thesis.timing.summary}`)

  hr('MARKET FAILURES')
  for (const f of thesis.market_failures.failures) {
    console.log(`  [${f.tier.toUpperCase().padEnd(9)}] [${f.severity.padEnd(6)}] ${f.title}`)
    console.log(`    → ${f.opportunity}`)
  }

  hr('DIFFICULTY')
  console.log(`  Overall          : ${thesis.difficulty.overall_label}`)
  console.log(`  Primary challenge: ${thesis.difficulty.primary_challenge}`)
  for (const dim of thesis.difficulty.dimensions) {
    console.log(`  ${dim.name.padEnd(20)} ${dim.label.padEnd(6)}  ${dim.explanation}`)
  }

  hr('PRODUCT THESIS')
  console.log(`  Positioning      : "${thesis.product_thesis.positioning_angle}"`)
  console.log(`  Pricing position : ${thesis.product_thesis.pricing_position ?? 'not specified'}`)
  console.log(`  Differentiation  : ${thesis.product_thesis.differentiation.vector} — ${thesis.product_thesis.differentiation.description}`)
  console.log(`  Next steps:`)
  for (const step of thesis.product_thesis.recommended_steps) {
    console.log(`    [${step.priority.padEnd(12)}] ${step.action}`)
  }

  hr('RISKS')
  for (const risk of thesis.risks) {
    console.log(`  [${risk.severity.padEnd(6)}] [${risk.category.padEnd(12)}] ${risk.title}`)
    console.log(`    ${risk.description}`)
    if (risk.mitigation) console.log(`    Mitigation: ${risk.mitigation}`)
  }

  hr('SCOPE LIMITATIONS')
  for (const sc of thesis.scope_limitations) {
    console.log(`  ${sc.dimension}: ${sc.impact}`)
    console.log(`    Verify with: ${sc.verify_with}`)
  }

  hr('PROVENANCE')
  console.log(`  Thesis ID        : ${thesis.id}`)
  console.log(`  Analysis version : ${thesis.analysis_version}`)
  console.log(`  Analysis depth   : ${thesis.analysis_depth}`)
  console.log(`  Created at       : ${thesis.created_at}`)
  console.log(`  Refresh after    : ${thesis.refresh_after}`)
  console.log(`  Providers attempted: [${thesis.providers_attempted.join(', ')}]`)
  console.log(`  Providers succeeded: [${thesis.providers_succeeded.join(', ')}]`)
  console.log(`  Providers failed   : [${thesis.providers_failed.join(', ')}]`)

  hr('SIGNAL SUMMARY')
  console.log(`  Total signals    : ${thesis.all_signals.length}`)
  console.log(`  Signal clusters  : ${thesis.converging_signals.length}`)
  for (const cluster of thesis.converging_signals) {
    const conv = cluster.convergent ? '✓ CONVERGENT' : '~ mixed'
    console.log(`  ${cluster.topic_key.padEnd(30)} ${conv}  providers=[${cluster.providers.join('+')}]`)
  }

  hr('OVERALL CONFIDENCE')
  const oc = thesis.overall_confidence
  console.log(`  Score  : ${Math.round(oc.value * 100)}% (${oc.label})`)
  console.log(`  Support: ${oc.supports}`)
  console.log(`  Limits : ${oc.limits}`)
  console.log(`  Sources: [${oc.providers.join(', ')}]`)
}

// ── environment check ──────────────────────────────────────────────────────

function checkEnv() {
  hr('ENVIRONMENT CHECK')

  const required: [string, boolean][] = [
    ['ANTHROPIC_API_KEY',        !!process.env.ANTHROPIC_API_KEY],
    ['NEXT_PUBLIC_SUPABASE_URL', !!process.env.NEXT_PUBLIC_SUPABASE_URL],
  ]
  const optional: [string, boolean][] = [
    ['KEEPA_API_KEY',              !!process.env.KEEPA_API_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY',  !!process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['REDDIT_CLIENT_ID',           !!process.env.REDDIT_CLIENT_ID],
    ['REDDIT_CLIENT_SECRET',       !!process.env.REDDIT_CLIENT_SECRET],
    ['GOOGLE_TRENDS_DISABLED',     process.env.GOOGLE_TRENDS_DISABLED === 'true'],
    ['TIKTOK_DISABLED',            process.env.TIKTOK_DISABLED === 'true'],
  ]

  console.log('\n  Required:')
  let missingRequired = false
  for (const [key, present] of required) {
    console.log(`    ${present ? '✓' : '✗'} ${key}`)
    if (!present) missingRequired = true
  }

  console.log('\n  Optional / provider keys:')
  for (const [key, present] of optional) {
    console.log(`    ${present ? '✓' : '○'} ${key}`)
  }

  if (missingRequired) {
    console.error('\n  FATAL: Missing required environment variables (see above).')
    console.error('  Add them to supplement-intelligence/.env.local and re-run.')
    process.exit(1)
  }

  console.log('\n  ✓ All required vars present')
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  THESIS ENGINE — END-TO-END TEST')
  console.log(`  Query : "${QUERY}"`)
  console.log(`  Depth : ${DEPTH}`)
  console.log('══════════════════════════════════════════════════════════════')

  checkEnv()

  // ── Phase 1: Signal collection ─────────────────────────────────────────
  hr('PHASE 1: SIGNAL COLLECTION')
  console.log(`\n  Fetching signals for "${QUERY}" (timeout 20s)...`)

  const t0  = Date.now()
  const agg = await signalEngine.fetch({ query: QUERY }, 20_000)
  const ms1 = Date.now() - t0

  if (!agg) {
    console.warn(`\n  ⚠ No signal data returned (all providers unavailable or timed out)`)
    console.warn('  Synthesis will proceed with AI-only knowledge (PRELIMINARY confidence)')
  } else {
    console.log(`\n  Signals collected in ${ms1}ms`)
    console.log(`  Providers used       : [${agg.providers_used.join(', ')}]`)
    console.log(`  Overall confidence   : ${Math.round(agg.overall_confidence * 100)}%`)
    console.log('\n  Per-dimension:')
    summariseSignals(agg)
  }

  // ── Phase 2: Full synthesis ────────────────────────────────────────────
  hr('PHASE 2: SYNTHESIS')
  console.log(`\n  Calling Claude to synthesize MarketThesis...`)
  console.log('  (Events will print as they arrive)')

  const t1 = Date.now()
  let thesis: MarketThesis

  try {
    thesis = await synthesize(
      { query: QUERY, depth: DEPTH, force_refresh: true },
      (event) => {
        switch (event.event) {
          case 'analysis:started':
            console.log(`\n  [event] analysis:started  depth=${event.depth}`)
            break
          case 'intent:classified':
            console.log(`  [event] intent:classified  type=${event.intent.type}`)
            break
          case 'cache:hit':
            console.log(`  [event] cache:hit  thesis_id=${event.thesis_id}`)
            break
          case 'source:started':
            console.log(`  [event] source:started    ${event.provider}`)
            break
          case 'source:completed':
            console.log(`  [event] source:completed  ${event.provider}  signals=${event.signal_count}`)
            break
          case 'source:failed':
            console.log(`  [event] source:failed     ${event.provider}  error="${event.error}"`)
            break
          case 'synthesis:started':
            console.log(`  [event] synthesis:started`)
            break
          case 'thesis:section':
            console.log(`  [event] thesis:section    section=${event.section}`)
            break
          case 'thesis:complete':
            console.log(`  [event] thesis:complete   id=${event.thesis.id}`)
            break
          case 'analysis:error':
            console.log(`  [event] analysis:error    message="${event.message}"`)
            break
        }
      },
    )
  } catch (err) {
    console.error('\n  SYNTHESIS FAILED:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const ms2 = Date.now() - t1
  console.log(`\n  Synthesis complete in ${ms2}ms`)

  // ── Phase 3: Print thesis ──────────────────────────────────────────────
  summariseThesis(thesis)

  // ── Phase 4: JSON snapshot ─────────────────────────────────────────────
  hr('JSON SNAPSHOT (truncated)')
  const snapshot = {
    id:                  thesis.id,
    query:               thesis.query,
    category_name:       thesis.category_name,
    analysis_depth:      thesis.analysis_depth,
    analysis_version:    thesis.analysis_version,
    opportunity_score:   thesis.verdict.opportunity_score,
    signal_strength:     thesis.verdict.signal_strength,
    timing_verdict:      thesis.timing.timing_verdict,
    overall_confidence:  thesis.overall_confidence.label,
    providers_succeeded: thesis.providers_succeeded,
    providers_failed:    thesis.providers_failed,
    signal_count:        thesis.all_signals.length,
    cluster_count:       thesis.converging_signals.length,
    failure_count:       thesis.market_failures.failures.length,
    risk_count:          thesis.risks.length,
  }
  pp('Summary', snapshot)

  console.log('\n\n══════════════════════════════════════════════════════════════')
  console.log('  ✓ END-TO-END TEST PASSED')
  console.log(`  Total time: ${Date.now() - t0}ms`)
  console.log('══════════════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
