import { NextRequest, NextResponse } from 'next/server'
import { runWatchlistRecheck } from '@/lib/watchlist/recheck'

// ── Watchlist re-check — weekly batch entry point (Roadmap M2.8) ────────────
// Same CRON_SECRET-protected pattern as the science/VOC cron routes.

export const maxDuration = 60
export const dynamic = 'force-dynamic'   // see app/api/cron/science-pipeline's header comment for why this is required

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('Watchlist recheck: CRON_SECRET not configured — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 401 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const summary = await runWatchlistRecheck()
  const durationMs = Date.now() - startedAt

  console.log('Watchlist recheck run complete', { ...summary, durationMs })
  return NextResponse.json({ ...summary, durationMs })
}
