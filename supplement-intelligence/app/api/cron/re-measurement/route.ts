import { NextRequest, NextResponse } from 'next/server'
import { runRemeasurement } from '@/lib/re-measurement/pipeline'

// ── Quarterly re-measurement — batch entry point (Roadmap M2.9) ────────────
// Same CRON_SECRET-protected pattern as the science/VOC/watchlist cron
// routes. Runs weekly (not literally quarterly) so each ledger row's own
// individual 3/6/12-month anniversary is caught promptly regardless of
// when it landed — the per-row due-checkpoint logic (lib/re-measurement/
// checkpoints.ts) is what makes this "quarterly," not the job's own cadence.

export const maxDuration = 60
export const dynamic = 'force-dynamic'   // see app/api/cron/science-pipeline's header comment for why this is required

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('Re-measurement: CRON_SECRET not configured — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 401 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const result = await runRemeasurement()
  const durationMs = Date.now() - startedAt

  console.log('Re-measurement run complete', { ...result, durationMs })
  return NextResponse.json({ ...result, durationMs })
}
