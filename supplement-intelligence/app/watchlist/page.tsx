'use client'

// ═══════════════════════════════════════════════════════════════════════
// Watchlist — Phase 3 integration (Watchlist only).
//
// Real Stitch reference:
// stitch-import/product-intelligence-design-foundation/screens/
// 3de16bc5f9224adfab4c774292b427bd.html ("Watchlist") + 6b48dfec...html
// ("Watchlist - Empty State"). Reuses the same LedgerTable row/column
// pattern already established for /research/history (same component, same
// loading-skeleton/error/empty-state conventions) rather than hand-rolling
// Stitch's raw grid-cols markup a second time. The Stitch mockup's own
// footer "Integrity Score / Signals Tracked / Latency / System Uptime"
// stat row is explicitly decorative/fabricated in the reference itself —
// omitted here rather than replicated, per "no placeholder values."
//
// Deliberately renders via <AppShell active={null}> (a value AppShell's
// own type already supports, for drill-down-style pages) rather than
// adding a new entry to components/shell/SideNav.tsx's shared NAV array —
// that file is rendered by every other page (Dashboard, Compare, History,
// Track Record, etc.), all explicitly out of scope this pass. The page is
// fully real and reachable by URL; it is just not yet linked from the
// sidebar — a disclosed, deliberate limitation, not an oversight.
// ═══════════════════════════════════════════════════════════════════════

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { LedgerTable, WitnessDots, type LedgerColumn } from '@/components/ui'
import { PiCard } from '@/components/memo/shared'
import type { V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { EnrichedWatch } from '@/lib/watchlist/enrich'
import { nextScheduledRecheck } from '@/lib/watchlist/schedule'

// pi-* verdict pill — same mapping as components/memo/CurrentSignal.tsx's
// local V2VerdictBadge (components/ui/VerdictBadge.tsx has no pi variant
// and is still used by other out-of-scope legacy pages, so it is inlined
// here rather than modified — same resolution used there).
type V2Verdict = V2VerdictDisplay['verdict']
const V2_VERDICT_CFG: Record<V2Verdict, { label: string; cls: string }> = {
  BUILD_NOW:                { label: 'Build Now',                cls: 'text-pi-build border-pi-build/40 bg-pi-build/10' },
  BUILD_IF_DIFFERENTIATED:  { label: 'Build If Differentiated',   cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH_CLOSELY:            { label: 'Watch Closely',             cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH:                    { label: 'Watch',                     cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  INVESTIGATE:              { label: 'Investigate',               cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  AVOID:                    { label: 'Avoid',                     cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
  PASS:                     { label: 'Pass',                      cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
}
function V2VerdictPill({ verdict }: { verdict: V2Verdict }) {
  const cfg = V2_VERDICT_CFG[verdict]
  return (
    <span className={`inline-flex items-center font-bold uppercase tracking-wide rounded-full border text-[10px] px-2.5 py-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

interface EligibleAnalysis {
  id: string
  category_name: string
  created_at: string
  opportunity_score: number
}

type WatchRow = EnrichedWatch & { id: string }

function formatRelative(iso: string | null): string {
  if (!iso) return 'Not yet checked'
  const diff = Date.now() - new Date(iso).getTime()
  const day = 86_400_000
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / day)}d ago`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

export default function WatchlistPage() {
  const [watches, setWatches]   = useState<WatchRow[]>([])
  const [eligible, setEligible] = useState<EligibleAnalysis[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/watchlist')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load watchlist'); return }
      setWatches((data.watches ?? []).map((w: EnrichedWatch) => ({ ...w, id: w.entry.id })))
      setEligible(data.eligibleAnalyses ?? [])
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addWatch(analysisId: string) {
    setActioning(analysisId)
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: analysisId }),
      })
      if (res.ok) await load()
    } catch {
      // silent — a reload will show the real current state
    } finally {
      setActioning(null)
    }
  }

  async function removeWatch(watchlistId: string) {
    setActioning(watchlistId)
    try {
      const res = await fetch(`/api/watchlist/${watchlistId}`, { method: 'DELETE' })
      if (res.ok) setWatches(prev => prev.filter(w => w.id !== watchlistId))
    } catch {
      // silent — a reload will show the real current state
    } finally {
      setActioning(null)
    }
  }

  const nextCheck = nextScheduledRecheck()

  const columns: LedgerColumn<WatchRow>[] = [
    {
      key: 'market', header: 'Market',
      render: w => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-pi-ink truncate max-w-[200px]">{w.entry.category_name}</p>
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wide">watched {formatRelative(w.entry.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'verdict', header: 'Verdict',
      render: w => w.marketVerdict
        ? <V2VerdictPill verdict={w.marketVerdict} />
        : <span className="text-xs text-pi-faint">Not available</span>,
    },
    {
      key: 'lifecycle', header: 'Lifecycle Stage',
      render: w => (
        <div className="font-mono text-xs">
          {w.currentStage ? <span className="uppercase font-semibold text-pi-ink">{w.currentStage}</span> : <span className="text-pi-faint">Not available</span>}
          {w.previousStage && (
            <p className="text-[10px] text-pi-faint mt-0.5">was: <span className="uppercase">{w.previousStage}</span></p>
          )}
        </div>
      ),
    },
    {
      key: 'quality', header: 'Quality', hideOnMobile: true,
      render: w => w.qualityScore !== null
        ? <span className="font-mono text-sm text-pi-ink">{w.qualityScore}/100 <span className="text-pi-faint text-[10px]">({w.qualityTier})</span></span>
        : <span className="text-xs text-pi-faint">Not available</span>,
    },
    {
      key: 'gap_velocity', header: 'Gap Velocity', hideOnMobile: true,
      render: w => w.gapVelocityDisplay
        ? <span className={`font-mono text-sm font-semibold ${w.gapVelocityDisplay.startsWith('+') ? 'text-pi-build' : 'text-pi-risk'}`}>{w.gapVelocityDisplay}</span>
        : <span className="text-xs text-pi-faint">Not available</span>,
    },
    {
      key: 'confidence', header: 'Confidence', hideOnMobile: true,
      render: w => w.confidencePct !== null
        ? <div className="flex items-center gap-2"><WitnessDots variant="pi" filled={Math.round(w.confidencePct / 20)} total={5} size="sm" /><span className="font-mono text-xs text-pi-ink">{w.confidencePct}%</span></div>
        : <span className="text-xs text-pi-faint">Not available</span>,
    },
    {
      key: 'kill_criteria', header: 'Kill Criteria',
      render: w => w.entry.kill_criteria.length
        ? (
          <span className={`font-mono text-xs ${w.triggeredKillCriteria.length ? 'text-pi-risk font-bold' : 'text-pi-faint'}`} title={w.triggeredKillCriteria.join('; ')}>
            {w.triggeredKillCriteria.length}/{w.entry.kill_criteria.length} active
          </span>
        )
        : <span className="text-xs text-pi-faint">None defined</span>,
    },
    {
      key: 'last_checked', header: 'Last Checked', hideOnMobile: true,
      render: w => <span className="text-xs font-mono text-pi-faint whitespace-nowrap">{formatRelative(w.entry.last_checked_at)}</span>,
    },
    {
      key: 'next_check', header: 'Next Check', hideOnMobile: true,
      render: () => <span className="text-xs font-mono text-pi-faint whitespace-nowrap">{formatDate(nextCheck)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: w => (
        <button
          onClick={() => removeWatch(w.id)}
          disabled={actioning === w.id}
          className="text-xs font-mono uppercase tracking-wide text-pi-faint hover:text-pi-risk disabled:opacity-40 transition-colors"
        >
          {actioning === w.id ? '…' : 'Remove'}
        </button>
      ),
    },
  ]

  return (
    <AppShell active={null} variant="pi">
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-pi-hairline pb-4">
          <div className="space-y-1">
            <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">Watchlist</h1>
            <p className="text-sm text-pi-sub">
              {loading ? 'Loading…' : `${watches.length} ${watches.length === 1 ? 'market' : 'markets'} watched`}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-pi-risk rounded-lg border border-pi-risk/30 bg-pi-risk/10 px-3 py-2">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-pi-hairline bg-pi-card p-5 animate-pulse">
                <div className="h-4 bg-pi-sand w-48 mb-2" />
                <div className="h-3 bg-pi-sand w-24" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && watches.length === 0 && (
          <div className="rounded-xl border border-pi-hairline bg-pi-card p-12 text-center space-y-3">
            <p className="text-[10px] font-mono text-pi-faint uppercase tracking-[0.2em]">Status: Inactive</p>
            <p className="text-pi-sub text-sm max-w-sm mx-auto">
              Watch a market and we&rsquo;ll re-check it on schedule — you&rsquo;ll hear from us only when the evidence moves.
            </p>
            <Link
              href="/analyze"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pi-ink px-6 py-3 text-sm font-semibold text-pi-cream shadow-[0_1px_3px_rgba(22,23,26,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_4px_10px_rgba(22,23,26,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright active:scale-[0.985]"
            >
              Run an analysis →
            </Link>
            <p className="text-[10px] font-mono text-pi-faint opacity-60 uppercase tracking-wide">No markets currently monitored</p>
          </div>
        )}

        {!loading && !error && watches.length > 0 && (
          <LedgerTable variant="pi" columns={columns} rows={watches} />
        )}

        {!loading && !error && eligible.length > 0 && (
          <PiCard>
            <p className="text-[10px] font-mono text-pi-faint uppercase tracking-widest mb-3">Add to Watchlist</p>
            <div className="divide-y divide-pi-hairline">
              {eligible.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-pi-ink truncate">{a.category_name}</p>
                    <p className="text-[10px] font-mono text-pi-faint">Score {a.opportunity_score}</p>
                  </div>
                  <button
                    onClick={() => addWatch(a.id)}
                    disabled={actioning === a.id}
                    className="text-xs font-mono uppercase tracking-wide text-pi-ink border border-pi-hairline rounded-lg px-3 py-1.5 hover:bg-pi-ink hover:text-pi-cream disabled:opacity-40 transition-colors shrink-0"
                  >
                    {actioning === a.id ? 'Watching…' : '+ Watch'}
                  </button>
                </div>
              ))}
            </div>
          </PiCard>
        )}
      </div>
    </AppShell>
  )
}
