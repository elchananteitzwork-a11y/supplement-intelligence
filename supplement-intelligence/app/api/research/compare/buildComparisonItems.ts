import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { adaptAggregatedSignals } from '@/lib/evidence/adapter'
import { listWatches, listAlerts } from '@/lib/watchlist/store'
import { buildKillCriteria } from '@/components/pi/candidate-core/coreDataAdapter'
import type { WatchlistAlert, WatchlistEntry } from '@/lib/watchlist/types'
import type { Analysis, BuildDecision } from '@/types/index'
import type { MarketVerdict, QualityTier } from '@/lib/verdict-matrix'

// Not a route file — Next.js only allows recognized handler exports
// (GET/POST/etc.) from app/api/**/route.ts, so this shared logic (used by
// both the GET compare route and the POST recommend route) lives here
// instead.

// ── AnalysisComparisonItem ───────────────────────────────────────────────────
//
// Real, leaner replacement for the old thesis/market_signal-based
// `ComparisonItem` (which read `investment_theses`/`market_signals` —
// zero real rows in production). This shape carries ONLY fields with a
// real, honest equivalent in the currently-used `analyses` pipeline
// (`analyses.memo_data`, written by /api/generate). Every field the old
// type carried that has NO real equivalent here — product_angle,
// target_customer, differentiation, Stage 2.5 quick-economics, the launch-
// threshold gate, unit-economics sensitivity figures, and Founder Fit
// entirely — has been dropped rather than fabricated or left misleadingly
// empty (2026-07 architecture-audit, owner-approved).
export interface AnalysisComparisonItem {
  analysis_id:   string   // analyses.id
  category_name: string   // Analysis.category_name — a real category label, NOT the old AI-written product_angle
  created_at:    string   // Analysis.created_at ≈ the old signal_created_at

  // Score + decision — lib/scoring.ts computeGroundedScore(memo_data), read-only.
  score:                number   // 0-100, always a real computed number (never fabricated null)
  decision:             BuildDecision
  insufficientEvidence: boolean
  // The ONE confidence number used everywhere else in the product —
  // lib/confidence's computeConfidenceAssessment(grounded).overallConfidence,
  // already rounded to an integer percent (same convention as
  // components/pi/derive.ts's PipelineCandidate.confidencePct).
  confidencePct: number | null

  // Verdict — MemoData.market_verdict (lib/verdict-matrix.ts), computed once
  // at generation time. Null for analyses generated before this field
  // existed (backward compat), never backfilled.
  verdict:     MarketVerdict | null
  qualityTier: QualityTier | null

  // 7 real market/evidence numbers, derived from MemoData.signal_evidence via
  // lib/evidence/adapter.ts's adaptAggregatedSignals — null (not a fabricated
  // 0) whenever the underlying evidence point was never collected.
  market_revenue_mo:    number | null
  competitor_count:     number | null
  review_concentration: number | null
  median_price:         number | null
  momentum_90d_pct:     number | null
  trend_direction:      string | null
  tiktok_view_count:    number | null

  // Kill criteria — derived via components/pi/candidate-core/coreDataAdapter's
  // exact, already-audited buildKillCriteria (see its own HONESTY CAVEAT):
  // a criterion only ever reads as real "triggered" when this analysis is on
  // the user's watchlist AND a real watchlist_alerts row already exists for
  // it. kill_criteria_clear is null whenever that real determination cannot
  // honestly be made yet — never true-by-default.
  //   - null: no kill criteria exist for this analysis, OR none of them are
  //     actively watchlisted (so "clear" has never actually been checked).
  //   - true: at least one criterion is being watched and none have triggered.
  //   - false: at least one watched criterion has a real triggered alert.
  kill_criteria_clear:     boolean | null
  triggered_kill_criteria: string[]   // real triggered-criterion labels only
}

export function supabaseAuthClient() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function killCriteriaSummary(
  killCriteria: Analysis['memo_data']['kill_criteria'],
  watch: { entry: WatchlistEntry | null; alerts: WatchlistAlert[] }
): { clear: boolean | null; triggered: string[] } {
  const items = buildKillCriteria(killCriteria, watch)
  if (items.length === 0) return { clear: null, triggered: [] }
  const anyWatched = items.some(c => c.watchState !== 'not-watched')
  if (!anyWatched) return { clear: null, triggered: [] }
  const triggered = items.filter(c => c.watchState === 'triggered').map(c => c.label)
  return { clear: triggered.length === 0, triggered }
}

// Shared fetch+build logic — extracted so /recommend can reuse the exact
// same real, RLS-scoped, server-side derivation instead of trusting a
// client-supplied `items` array (security audit finding, pre-beta:
// recommend previously took AnalysisComparisonItem[] straight from the
// request body with no re-fetch/ownership check, letting an authenticated
// caller feed fabricated numbers or another user's real analysis_id into
// the LLM prompt). Both the GET compare route and the POST recommend route
// call this rather than either one re-deriving or trusting client input.
export async function fetchAnalysisComparisonItems(
  sb: ReturnType<typeof supabaseAuthClient>,
  userId: string,
  ids: string[],
): Promise<{ items: AnalysisComparisonItem[]; error?: string }> {
  const [{ data: rows, error: fetchError }, watches, alerts] = await Promise.all([
    sb.from('analyses').select('*').in('id', ids).eq('user_id', userId),
    listWatches(sb, userId),
    listAlerts(sb, userId),
  ])
  if (fetchError) {
    console.error('compare fetch error', fetchError)
    return { items: [], error: 'Failed to load analyses' }
  }

  const analyses = (rows ?? []) as Analysis[]
  const byId = new Map(analyses.map(a => [a.id, a]))

  const items: AnalysisComparisonItem[] = ids
    .map(id => byId.get(id))
    .filter((a): a is Analysis => !!a)
    .map(a => {
      const m = a.memo_data
      const grounded = computeGroundedScore(m)
      const confidence = computeConfidenceAssessment(grounded).overallConfidence
      const evidence = m.signal_evidence ? adaptAggregatedSignals(m.signal_evidence, a.created_at) : undefined
      const watchEntry = watches.find(w => w.analysis_id === a.id) ?? null
      const { clear, triggered } = killCriteriaSummary(m.kill_criteria, { entry: watchEntry, alerts })

      return {
        analysis_id:   a.id,
        category_name: a.category_name,
        created_at:    a.created_at,

        score:                grounded.score,
        decision:             grounded.decision,
        insufficientEvidence: grounded.insufficientEvidence,
        confidencePct:        typeof confidence === 'number' ? Math.round(confidence * 100) : null,

        verdict:     m.market_verdict?.verdict ?? null,
        qualityTier: m.market_verdict?.qualityTier ?? null,

        market_revenue_mo:    evidence?.est_monthly_revenue?.value ?? null,
        competitor_count:     evidence?.competitor_count?.value ?? null,
        review_concentration: evidence?.review_concentration?.value ?? null,
        median_price:         evidence?.median_price?.value ?? null,
        momentum_90d_pct:     evidence?.momentum_90d_pct?.value ?? null,
        trend_direction:      evidence?.trend_direction?.value ?? null,
        tiktok_view_count:    evidence?.tiktok_view_count?.value ?? null,

        kill_criteria_clear:     clear,
        triggered_kill_criteria: triggered,
      }
    })

  return { items }
}
