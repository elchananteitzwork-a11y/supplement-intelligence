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

// ── In-flight lock (self-critique round, 2026-07-28) ────────────────────────
// The engine run takes ~1-3 real minutes. Without a lock, a user whose
// connection dropped mid-run retries the POST, the read-before-run finds
// nothing persisted yet, and a SECOND engine run starts — double real spend.
// The lock reuses unique(analysis_id): POST inserts a stub row BEFORE
// running; a concurrent POST's stub insert hits 23505 and returns
// "running" instead of spending. A crash between stub and update would
// strand the slot, so stubs older than STALE_STUB_MS are deleted and re-run.
const STALE_STUB_MS = 10 * 60 * 1000

interface StubReport { __running: true; started_at: string }
function isStub(report: unknown): report is StubReport {
  return !!report && typeof report === 'object' && (report as { __running?: unknown }).__running === true
}
function stubIsStale(stub: StubReport): boolean {
  const t = Date.parse(stub.started_at)
  return !Number.isFinite(t) || Date.now() - t > STALE_STUB_MS
}

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
  if (isStub(row.report)) {
    return NextResponse.json({ running: true, started_at: (row.report as StubReport).started_at })
  }
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

  // Pay-once: a stored report always wins; a fresh in-flight stub means a
  // run is already spending — never start a second one.
  const { data: existing, error: readErr } = await sb
    .from('competitive_review_reports')
    .select('report, created_at, asins_analyzed')
    .eq('analysis_id', analysis.id)
    .maybeSingle()
  if (readErr && isMissingTableError(readErr)) return err(MIGRATION_PENDING_MSG, 503)
  if (existing && !isStub(existing.report)) {
    return NextResponse.json({ report: existing.report, created_at: existing.created_at, asins_analyzed: existing.asins_analyzed, reused: true })
  }
  if (existing && isStub(existing.report)) {
    if (!stubIsStale(existing.report)) {
      return NextResponse.json({ running: true, started_at: existing.report.started_at })
    }
    // Crashed run's stranded stub — clear it and allow a fresh start.
    await sb.from('competitive_review_reports').delete().eq('analysis_id', analysis.id)
  }

  const asins = competitorAsinsFrom(analysis.memo_data)
  if (asins.length < 2) {
    return err('This analysis has no stored competitor set to interrogate — it predates the measured-competitor data. Run a fresh analysis of this hunch first.', 422)
  }

  // Acquire the lock: stub insert BEFORE any spend. A concurrent POST's
  // stub hits unique(analysis_id) → 23505 → it reports "running" instead
  // of starting a second paid run.
  const stub: StubReport = { __running: true, started_at: new Date().toISOString() }
  const { error: stubErr } = await sb.from('competitive_review_reports').insert({
    user_id:        user.id,
    analysis_id:    analysis.id,
    report:         stub,
    engine_version: 'pending',
    asins_analyzed: asins,
  })
  if (stubErr) {
    if (isMissingTableError(stubErr)) return err(MIGRATION_PENDING_MSG, 503)
    if (stubErr.code === '23505') return NextResponse.json({ running: true })
    return err('Failed to start the analysis', 500)
  }

  let report: MarketReport
  try {
    const engine = new CompetitiveReviewEngine()
    report = await engine.analyzeByASINs(asins, ENGINE_OPTIONS, { categoryName: analysis.category_name })
  } catch (e: unknown) {
    // Release the lock so the user can retry — nothing was persisted.
    await sb.from('competitive_review_reports').delete().eq('analysis_id', analysis.id)
    const message = e instanceof Error ? e.message : 'Unknown error'
    // Classified provider messages (llm-cost-rate-governance retrofit in
    // lib/review-engine/ai/claude.ts) are user-showable as-is.
    const isUserError = message.includes('AI provider') || message.includes('No competitors found') || message.includes('CompetitiveReviewEngine:')
    console.error('[competitive-reviews] engine failed', { analysisId: analysis.id, message })
    return err(isUserError ? message : 'Competitive review analysis failed — try again.', isUserError ? 400 : 500)
  }

  // Cost traceability (llm-cost-rate-governance item 5): what ran, how big.
  console.log('[competitive-reviews] completed', {
    analysisId: analysis.id,
    products: report.products_analyzed,
    reviewsCollected: report.total_reviews_collected,
    reviewsAnalyzed: report.total_reviews_analyzed,
    engineVersion: report.analysis_version,
  })

  const { error: updateErr } = await sb.from('competitive_review_reports')
    .update({ report, engine_version: report.analysis_version, asins_analyzed: report.asins_analyzed })
    .eq('analysis_id', analysis.id)
  if (updateErr) {
    // The run succeeded and cost real money — return the report even if
    // persistence failed, but say so honestly (stub row remains and will
    // go stale-recoverable rather than blocking forever).
    console.error('[competitive-reviews] persist failed', { analysisId: analysis.id, code: updateErr.code, message: updateErr.message })
    return NextResponse.json({ report, persisted: false, warning: 'Report generated but could not be saved — it will not be stored for later visits.' })
  }

  return NextResponse.json({ report, asins_analyzed: report.asins_analyzed })
}
