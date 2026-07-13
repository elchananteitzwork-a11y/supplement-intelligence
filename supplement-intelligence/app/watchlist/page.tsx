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

import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import {
  LedgerTable, VerdictBadge, WitnessDots, HardCard, PrimaryLinkButton, type LedgerColumn,
} from '@/components/ui'
import type { EnrichedWatch } from '@/lib/watchlist/enrich'
import { nextScheduledRecheck } from '@/lib/watchlist/schedule'

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
          <p className="text-sm font-bold text-black truncate max-w-[200px]">{w.entry.category_name}</p>
          <p className="text-[10px] font-mono text-outline uppercase tracking-wide">watched {formatRelative(w.entry.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'verdict', header: 'Verdict',
      render: w => w.marketVerdict
        ? <VerdictBadge scheme="v2-verdict" verdict={w.marketVerdict} size="sm" />
        : <span className="text-xs text-outline-variant">Not available</span>,
    },
    {
      key: 'lifecycle', header: 'Lifecycle Stage',
      render: w => (
        <div className="font-mono text-xs">
          {w.currentStage ? <span className="uppercase font-semibold text-black">{w.currentStage}</span> : <span className="text-outline-variant">Not available</span>}
          {w.previousStage && (
            <p className="text-[10px] text-outline mt-0.5">was: <span className="uppercase">{w.previousStage}</span></p>
          )}
        </div>
      ),
    },
    {
      key: 'quality', header: 'Quality', hideOnMobile: true,
      render: w => w.qualityScore !== null
        ? <span className="font-mono text-sm">{w.qualityScore}/100 <span className="text-outline text-[10px]">({w.qualityTier})</span></span>
        : <span className="text-xs text-outline-variant">Not available</span>,
    },
    {
      key: 'gap_velocity', header: 'Gap Velocity', hideOnMobile: true,
      render: w => w.gapVelocityDisplay
        ? <span className={`font-mono text-sm font-semibold ${w.gapVelocityDisplay.startsWith('+') ? 'text-verdict-positive' : 'text-verdict-negative'}`}>{w.gapVelocityDisplay}</span>
        : <span className="text-xs text-outline-variant">Not available</span>,
    },
    {
      key: 'confidence', header: 'Confidence', hideOnMobile: true,
      render: w => w.confidencePct !== null
        ? <div className="flex items-center gap-2"><WitnessDots filled={Math.round(w.confidencePct / 20)} total={5} size="sm" /><span className="font-mono text-xs">{w.confidencePct}%</span></div>
        : <span className="text-xs text-outline-variant">Not available</span>,
    },
    {
      key: 'kill_criteria', header: 'Kill Criteria',
      render: w => w.entry.kill_criteria.length
        ? (
          <span className={`font-mono text-xs ${w.triggeredKillCriteria.length ? 'text-verdict-negative font-bold' : 'text-outline'}`} title={w.triggeredKillCriteria.join('; ')}>
            {w.triggeredKillCriteria.length}/{w.entry.kill_criteria.length} active
          </span>
        )
        : <span className="text-xs text-outline-variant">None defined</span>,
    },
    {
      key: 'last_checked', header: 'Last Checked', hideOnMobile: true,
      render: w => <span className="text-xs font-mono text-outline whitespace-nowrap">{formatRelative(w.entry.last_checked_at)}</span>,
    },
    {
      key: 'next_check', header: 'Next Check', hideOnMobile: true,
      render: () => <span className="text-xs font-mono text-outline whitespace-nowrap">{formatDate(nextCheck)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: w => (
        <button
          onClick={() => removeWatch(w.id)}
          disabled={actioning === w.id}
          className="text-xs font-mono uppercase tracking-wide text-outline hover:text-verdict-negative disabled:opacity-40 transition-colors"
        >
          {actioning === w.id ? '…' : 'Remove'}
        </button>
      ),
    },
  ]

  return (
    <AppShell active={null}>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap border-b-2 border-black pb-4">
          <div className="space-y-1">
            <h1 className="text-headline-md text-black">Watchlist</h1>
            <p className="text-sm text-ink-variant">
              {loading ? 'Loading…' : `${watches.length} ${watches.length === 1 ? 'market' : 'markets'} watched`}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-black bg-white p-5 animate-pulse">
                <div className="h-4 bg-surface-container w-48 mb-2" />
                <div className="h-3 bg-surface-container w-24" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && watches.length === 0 && (
          <div className="border border-black bg-white p-12 text-center space-y-3">
            <p className="text-[10px] font-mono text-outline uppercase tracking-[0.2em]">Status: Inactive</p>
            <p className="text-ink-variant text-sm max-w-sm mx-auto">
              Watch a market and we&rsquo;ll re-check it on schedule — you&rsquo;ll hear from us only when the evidence moves.
            </p>
            <PrimaryLinkButton href="/analyze">Run an analysis →</PrimaryLinkButton>
            <p className="text-[10px] font-mono text-outline opacity-60 uppercase tracking-wide">No markets currently monitored</p>
          </div>
        )}

        {!loading && !error && watches.length > 0 && (
          <LedgerTable columns={columns} rows={watches} />
        )}

        {!loading && !error && eligible.length > 0 && (
          <HardCard>
            <p className="text-[10px] font-mono text-outline uppercase tracking-widest mb-3">Add to Watchlist</p>
            <div className="divide-y divide-black/10">
              {eligible.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{a.category_name}</p>
                    <p className="text-[10px] font-mono text-outline">Score {a.opportunity_score}</p>
                  </div>
                  <button
                    onClick={() => addWatch(a.id)}
                    disabled={actioning === a.id}
                    className="text-xs font-mono uppercase tracking-wide text-black border border-black px-3 py-1.5 hover:bg-black hover:text-white disabled:opacity-40 transition-colors shrink-0"
                  >
                    {actioning === a.id ? 'Watching…' : '+ Watch'}
                  </button>
                </div>
              ))}
            </div>
          </HardCard>
        )}
      </div>
    </AppShell>
  )
}
