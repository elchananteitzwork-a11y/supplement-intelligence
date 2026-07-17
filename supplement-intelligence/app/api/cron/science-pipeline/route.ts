import { NextRequest, NextResponse } from 'next/server'
import { runScienceIngestionPipeline } from '@/lib/science-engine/pipeline'
import { TRACKED_INGREDIENTS } from '@/lib/science-engine/tracked-ingredients'
import { runDiscoveryDetection } from '@/lib/discovery-engine/run'
import { runDivergenceDetection } from '@/lib/divergence-detector/run'
import { getRecentObservations, type NicheSeries } from '@/lib/discovery-engine/service-store'

// ── Science pipeline — nightly batch entry point (Roadmap M2.5) ─────────────
//
// Triggered by Vercel Cron (see vercel.json's `crons` entry) once nightly.
// Real work happens in lib/science-engine/pipeline.ts — this route is just
// the HTTP entry point + auth check, matching the standard Vercel Cron
// protection pattern (a shared secret compared against the request's
// Authorization header, since cron-triggered requests are not an
// authenticated user session — same "not client-trusted state" principle
// already applied to app/api/billing/webhook's signature check).
//
// Absent CRON_SECRET, the route fails closed (401) rather than running
// unauthenticated — same safe-by-default posture as the Billing routes
// when their own required env vars are unset.
//
// Roadmap M2.12: also runs Discovery Engine detection right after
// ingestion, for the same TRACKED_INGREDIENTS this pipeline just wrote
// fresh niche_timeseries observations for — this is the only real writer
// for these candidates today, so detection belongs on this exact cadence.
// lib/discovery-engine/run.ts itself is category-agnostic (takes a
// candidate list as a parameter); TRACKED_INGREDIENTS is supplied here,
// at the call site, not assumed inside the engine.
//
// Roadmap M2.22: runs Divergence Detector right alongside it, over the
// identical TRACKED_INGREDIENTS candidate list — same read-only pass over
// niche_timeseries, same cadence rationale, same category-agnostic
// (candidate-list-as-parameter) engine shape.
//
// Review fix: both detectors read the exact same niche_timeseries rows for
// the exact same candidate list in this one request, so this route fetches
// getRecentObservations(nicheKey) once per candidate up front and hands
// the shared result to both — avoiding the duplicate read (6 queries
// instead of 3 for today's 3 tracked ingredients) that running each
// detector's own self-fetch would otherwise cause here.

// 3 ingredients, each running PubMed (6 sequential year calls + a bounded
// evidence-type sample), ClinicalTrials.gov (2 calls), and DSLD (Roadmap
// M2.17: 1 search + up to 20 bounded, concurrency-capped label detail
// calls) concurrently via Promise.all — real network I/O, seconds not
// minutes; M2.16's live validation measured ~8s for all 3 ingredients
// before DSLD was added, so 60s retains real headroom.
export const maxDuration = 60
// Without this, Next.js's build-time static-render detection doesn't
// recognize req.headers.get() (a NextRequest method, not next/headers'
// cookies()/headers()) as dynamic — it actually invoked this route once
// during `next build`'s page-data-collection pass (harmlessly short-
// circuited by the missing-CRON_SECRET check above, but a cron endpoint
// must never be eligible for static caching regardless).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('Science pipeline: CRON_SECRET not configured — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 401 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results = await runScienceIngestionPipeline()

  const observationsByNicheKey = new Map<string, NicheSeries[]>()
  for (const nicheKey of TRACKED_INGREDIENTS) {
    observationsByNicheKey.set(nicheKey, await getRecentObservations(nicheKey))
  }

  const detectionNow = new Date()
  const discovery = await runDiscoveryDetection([...TRACKED_INGREDIENTS], detectionNow, observationsByNicheKey)
  const divergence = await runDivergenceDetection([...TRACKED_INGREDIENTS], detectionNow, observationsByNicheKey)
  const durationMs = Date.now() - startedAt

  const succeeded = results.filter(r => r.success).length
  console.log('Science pipeline run complete', { succeeded, total: results.length, discovery, divergence, durationMs })

  return NextResponse.json({ results, succeeded, total: results.length, discovery, divergence, durationMs })
}
