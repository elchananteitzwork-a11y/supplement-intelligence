import { NextRequest, NextResponse } from 'next/server'
import { runVocPipeline } from '@/lib/voc-pipeline/pipeline'

// ── VOC problem-cluster pipeline — weekly batch entry point (Roadmap M2.7) ──
//
// Triggered by Vercel Cron (see vercel.json's `crons` entry) once weekly.
// Same CRON_SECRET-protected pattern as app/api/cron/science-pipeline
// (Roadmap M2.5) — one shared secret protects both cron endpoints.

export const maxDuration = 60   // ~17 subreddits sequential x (1 real fetch + 250ms delay) — seconds, not minutes
export const dynamic = 'force-dynamic'   // see app/api/cron/science-pipeline's own header comment for why this is required

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('VOC pipeline: CRON_SECRET not configured — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 401 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const result = await runVocPipeline()
  const durationMs = Date.now() - startedAt

  if (!result) {
    console.error('VOC pipeline run failed to start', { durationMs })
    return NextResponse.json({ error: 'Pipeline did not run (see logs)' }, { status: 502 })
  }

  console.log('VOC pipeline run complete', { ...result, durationMs })
  return NextResponse.json({ ...result, durationMs })
}
