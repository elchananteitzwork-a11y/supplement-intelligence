import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CompetitiveReviewEngine } from '@/lib/competitive-review-engine'
import type { MarketReport } from '@/lib/competitive-review-engine'
import { checkRateLimit, REVIEWS_COMPETITIVE_LIMIT } from '@/lib/rate-limit'
import type { MemoData } from '@/types/index'

// ── Per-analysis competitive review interrogation — item ג ──────────────────
// (docs/RD_V4_COMPETITIVE_REVIEWS.md §3.2)
//
// The V4 trigger for lib/competitive-review-engine — distinct from the
// generic POST /api/reviews/competitive in three deliberate ways:
//   1. Pay-once: this run spends real money (~$1.5-2.5 Apify + Anthropic at
//      the fixed options below). The result persists in
//      competitive_review_reports with unique(analysis_id); a second POST —
//      including a double-click race, absorbed via the 23505 conflict path —
//      returns the stored report with zero new spend.
//   2. Niche-scoped input: competitor ASINs come from THIS analysis' own
//      stored evidence (item ב's category-filtered, brand-deduped
//      top_competitor_revenues first; review_velocity's top_competitors as
//      fallback) — never re-resolved from a category node.
//   3. Fixed server-side options: the client sends no tuning at all, so a
//      caller can never request a 500-review spend.
//
// Table 031 may not exist in production yet (supabase/PENDING_MIGRATIONS.sql)
// — every call detects that and returns an honest 503, same contract as
// app/api/positions/route.ts.

export const maxDuration = 300

const ENGINE_OPTIONS = {
  max_products:        5,
  reviews_per_product: 40,
  sort_by:             'helpful' as const,
}
const MAX_ASINS = 5

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return msg.includes('schema cache') || /relation .* does not exist/.test(msg)
}

const MIGRATION_PENDING_MSG =
  'Competitive review reports are not yet available on this deployment — a pending database migration must be applied first.'

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Competitor ASINs from the analysis' own stored evidence — measured
// revenue table first (niche-scoped, guarded), review-velocity competitor
// list as fallback. Deduped, capped at MAX_ASINS, empty when neither exists
// (legacy analyses) — the caller answers 422, never resolves from a node.
function competitorAsinsFrom(memo: MemoData | null): string[] {
  const rev = memo?.signal_evidence?.revenue?.value
  const fromRevenue = (rev?.top_competitor_revenues ?? []).map(r => r.productId)
  const fromReviewVelocity = (memo?.signal_evidence?.review_velocity?.value?.top_competitors ?? []).map(c => c.productId)
  const seen = new Set<string>()
  const out: string[] = []
  for (const asin of [...fromRevenue, ...fromReviewVelocity]) {
    const key = asin.toUpperCase()
    if (!asin || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= MAX_ASINS) break
  }
  return out
}

async function ownedAnalysis(analysisId: string, userId: string) {
  const sb = createClient()
  const { data } = await sb
    .from('analyses')
    .select('id, category_name, memo_data')
    .eq('id', analysisId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as { id: string; category_name: string; memo_data: MemoData | null } | null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  const analysis = await ownedAnalysis(params.id, user.id)
  if (!analysis) return err('Analysis not found', 404)

  const { data: row, error } = await sb
    .from('competitive_review_reports')
    .select('report, created_at, asins_analyzed')
    .eq('analysis_id', analysis.id)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) return err(MIGRATION_PENDING_MSG, 503)
    return err('Failed to load report', 500)
  }
  if (!row) return err('No report yet', 404)
  return NextResponse.json({ report: row.report, created_at: row.created_at, asins_analyzed: row.asins_analyzed })
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)
  if (!(await checkRateLimit(user.id, REVIEWS_COMPETITIVE_LIMIT))) {
    return err('Too many requests — please wait a moment', 429)
  }

  const analysis = await ownedAnalysis(params.id, user.id)
  if (!analysis) return err('Analysis not found', 404)

  // Pay-once: a stored report always wins over a new spend.
  const { data: existing, error: readErr } = await sb
    .from('competitive_review_reports')
    .select('report, created_at, asins_analyzed')
    .eq('analysis_id', analysis.id)
    .maybeSingle()
  if (readErr && isMissingTableError(readErr)) return err(MIGRATION_PENDING_MSG, 503)
  if (existing) {
    return NextResponse.json({ report: existing.report, created_at: existing.created_at, asins_analyzed: existing.asins_analyzed, reused: true })
  }

  const asins = competitorAsinsFrom(analysis.memo_data)
  if (asins.length < 2) {
    return err('This analysis has no stored competitor set to interrogate — it predates the measured-competitor data. Run a fresh analysis of this hunch first.', 422)
  }

  let report: MarketReport
  try {
    const engine = new CompetitiveReviewEngine()
    report = await engine.analyzeByASINs(asins, ENGINE_OPTIONS, { categoryName: analysis.category_name })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    // Classified provider messages (llm-cost-rate-governance retrofit in
    // lib/review-engine/ai/claude.ts) are user-showable as-is.
    const isUserError = message.includes('AI provider') || message.includes('No competitors found') || message.includes('CompetitiveReviewEngine:')
    console.error('[competitive-reviews] engine failed', { analysisId: analysis.id, message })
    return err(isUserError ? message : 'Competitive review analysis failed — nothing was charged twice; try again.', isUserError ? 400 : 500)
  }

  // Cost traceability (llm-cost-rate-governance item 5): what ran, how big.
  console.log('[competitive-reviews] completed', {
    analysisId: analysis.id,
    products: report.products_analyzed,
    reviewsCollected: report.total_reviews_collected,
    reviewsAnalyzed: report.total_reviews_analyzed,
    engineVersion: report.analysis_version,
  })

  const { error: insertErr } = await sb.from('competitive_review_reports').insert({
    user_id:        user.id,
    analysis_id:    analysis.id,
    report,
    engine_version: report.analysis_version,
    asins_analyzed: report.asins_analyzed,
  })
  if (insertErr) {
    if (isMissingTableError(insertErr)) return err(MIGRATION_PENDING_MSG, 503)
    // Unique-violation race (double POST): the other request won — return
    // its stored report rather than surfacing an error for a paid success.
    if (insertErr.code === '23505') {
      const { data: winner } = await sb
        .from('competitive_review_reports')
        .select('report, created_at, asins_analyzed')
        .eq('analysis_id', analysis.id)
        .maybeSingle()
      if (winner) return NextResponse.json({ report: winner.report, created_at: winner.created_at, asins_analyzed: winner.asins_analyzed, reused: true })
    }
    // The run itself succeeded and cost real money — return the report even
    // if persistence failed, but say so honestly.
    console.error('[competitive-reviews] persist failed', { analysisId: analysis.id, code: insertErr.code, message: insertErr.message })
    return NextResponse.json({ report, persisted: false, warning: 'Report generated but could not be saved — it will not be stored for later visits.' })
  }

  return NextResponse.json({ report, asins_analyzed: report.asins_analyzed })
}
