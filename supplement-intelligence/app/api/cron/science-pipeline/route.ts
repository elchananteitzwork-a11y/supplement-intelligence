import { NextRequest, NextResponse } from 'next/server'
import { runScienceIngestionPipeline } from '@/lib/science-engine/pipeline'

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

export const maxDuration = 60   // 3 ingredients x (6 sequential PubMed calls + 1 ClinicalTrials.gov call) — seconds, not minutes, but real network I/O
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
  const durationMs = Date.now() - startedAt

  const succeeded = results.filter(r => r.success).length
  console.log('Science pipeline run complete', { succeeded, total: results.length, durationMs })

  return NextResponse.json({ results, succeeded, total: results.length, durationMs })
}
