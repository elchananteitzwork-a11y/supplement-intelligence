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
import type { V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { EnrichedWatch } from '@/lib/watchlist/enrich'
import { nextScheduledRecheck } from '@/lib/watchlist/schedule'

// Terminal Noir port (2026-07-23): dark-stage verdict pill — same mapping
// as before, colors re-tuned to the noir TEXT tokens (pi-build-noir/
// pi-risk-noir, pi-gold-deep) since the cream tokens (pi-build/pi-risk/
// pi-gold) are tuned for white-card-on-cream and read muddy/low-contrast
// on pi-stage. components/ui/VerdictBadge.tsx still has no pi/noir variant
// (still used by other out-of-scope legacy pages), so this stays inlined —
// same resolution already used pre-port.
type V2Verdict = V2VerdictDisplay['verdict']
const V2_VERDICT_CFG: Record<V2Verdict, { label: string; cls: string }> = {
  BUILD_NOW:                { label: 'Build Now',                cls: 'text-pi-build-noir border-pi-build-noir/40 bg-pi-build-noir/10' },
  BUILD_IF_DIFFERENTIATED:  { label: 'Build If Differentiated',   cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH_CLOSELY:            { label: 'Watch Closely',             cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH:                    { label: 'Watch',                     cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  INVESTIGATE:              { label: 'Investigate',               cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  AVOID:                    { label: 'Avoid',                     cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
  PASS:                     { label: 'Pass',                      cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
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
          <p className="text-sm font-semibold text-pi-noir-text truncate max-w-[200px]">{w.entry.category_name}</p>
          <p className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-wide">watched {formatRelative(w.entry.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'verdict', header: 'Verdict',
      render: w => w.marketVerdict
        ? <V2VerdictPill verdict={w.marketVerdict} />
        : <span className="text-xs text-pi-noir-sub">Not available</span>,
    },
    {
      key: 'lifecycle', header: 'Lifecycle Stage',
      render: w => (
        <div className="font-mono text-xs">
          {w.currentStage ? <span className="uppercase font-semibold text-pi-noir-text">{w.currentStage}</span> : <span className="text-pi-noir-sub">Not available</span>}
          {w.previousStage && (
            <p className="text-[10px] text-pi-noir-sub mt-0.5">was: <span className="uppercase">{w.previousStage}</span></p>
          )}
        </div>
      ),
    },
    {
      key: 'quality', header: 'Quality', hideOnMobile: true,
      render: w => w.qualityScore !== null
        ? <span className="font-mono text-sm text-pi-noir-text">{w.qualityScore}/100 <span className="text-pi-noir-sub text-[10px]">({w.qualityTier})</span></span>
        : <span className="text-xs text-pi-noir-sub">Not available</span>,
    },
    {
      key: 'gap_velocity', header: 'Gap Velocity', hideOnMobile: true,
      render: w => w.gapVelocityDisplay
        ? <span className={`font-mono text-sm font-semibold ${w.gapVelocityDisplay.startsWith('+') ? 'text-pi-build-noir' : 'text-pi-risk-noir'}`}>{w.gapVelocityDisplay}</span>
        : <span className="text-xs text-pi-noir-sub">Not available</span>,
    },
    {
      key: 'confidence', header: 'Confidence', hideOnMobile: true,
      render: w => w.confidencePct !== null
        ? <div className="flex items-center gap-2"><WitnessDots variant="pi-noir" filled={Math.round(w.confidencePct / 20)} total={5} size="sm" /><span className="font-mono text-xs text-pi-noir-text">{w.confidencePct}%</span></div>
        : <span className="text-xs text-pi-noir-sub">Not available</span>,
    },
    {
      key: 'kill_criteria', header: 'Kill Criteria',
      render: w => w.entry.kill_criteria.length
        ? (
          <span className={`font-mono text-xs ${w.triggeredKillCriteria.length ? 'text-pi-risk-noir font-bold' : 'text-pi-noir-sub'}`} title={w.triggeredKillCriteria.join('; ')}>
            {w.triggeredKillCriteria.length}/{w.entry.kill_criteria.length} active
          </span>
        )
        : <span className="text-xs text-pi-noir-sub">None defined</span>,
    },
    {
      key: 'last_checked', header: 'Last Checked', hideOnMobile: true,
      render: w => <span className="text-xs font-mono text-pi-noir-sub whitespace-nowrap">{formatRelative(w.entry.last_checked_at)}</span>,
    },
    {
      key: 'next_check', header: 'Next Check', hideOnMobile: true,
      render: () => <span className="text-xs font-mono text-pi-noir-sub whitespace-nowrap">{formatDate(nextCheck)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: w => (
        <button
          onClick={() => removeWatch(w.id)}
          disabled={actioning === w.id}
          className="text-xs font-mono uppercase tracking-wide text-pi-noir-sub hover:text-pi-risk-noir disabled:opacity-40 transition-colors"
        >
          {actioning === w.id ? '…' : 'Remove'}
        </button>
      ),
    },
  ]

  return (
    <AppShell active={null} variant="pi-noir">
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-pi-noir-hairline pb-4">
          <div className="space-y-1">
            <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-noir-text sm:text-[32px]">Watchlist</h1>
            <p className="text-sm text-pi-noir-sub">
              {loading ? 'Loading…' : `${watches.length} ${watches.length === 1 ? 'market' : 'markets'} watched`}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-pi-risk-noir rounded-lg border border-pi-risk-noir/30 bg-pi-risk-noir/10 px-3 py-2">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-5 animate-pulse">
                <div className="h-4 bg-pi-elevated w-48 mb-2" />
                <div className="h-3 bg-pi-elevated w-24" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && watches.length === 0 && (
          <div className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-12 text-center space-y-3">
            <p className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-[0.2em]">Status: Inactive</p>
            <p className="text-pi-noir-sub text-sm max-w-sm mx-auto">
              Watch a market and we&rsquo;ll re-check it on schedule — you&rsquo;ll hear from us only when the evidence moves.
            </p>
            <Link
              href="/analyze"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pi-gold-deep px-6 py-3 text-sm font-semibold text-[#16130a] shadow-[0_8px_18px_-8px_rgba(212,169,74,0.5)] transition-all duration-200 hover:-translate-y-px hover:bg-pi-gold-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-deep active:scale-[0.985]"
            >
              Run an analysis →
            </Link>
            <p className="text-[10px] font-mono text-pi-noir-sub opacity-60 uppercase tracking-wide">No markets currently monitored</p>
          </div>
        )}

        {!loading && !error && watches.length > 0 && (
          <LedgerTable variant="pi-noir" columns={columns} rows={watches} />
        )}

        {!loading && !error && eligible.length > 0 && (
          <div className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-4 sm:p-5">
            <p className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest mb-3">Add to Watchlist</p>
            <div className="divide-y divide-pi-noir-hairline">
              {eligible.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-pi-noir-text truncate">{a.category_name}</p>
                    <p className="text-[10px] font-mono text-pi-noir-sub">Score {a.opportunity_score}</p>
                  </div>
                  <button
                    onClick={() => addWatch(a.id)}
                    disabled={actioning === a.id}
                    className="text-xs font-mono uppercase tracking-wide text-pi-noir-text border border-pi-noir-hairline rounded-lg px-3 py-1.5 hover:bg-pi-gold-deep hover:text-[#16130a] hover:border-pi-gold-deep disabled:opacity-40 transition-colors shrink-0"
                  >
                    {actioning === a.id ? 'Watching…' : '+ Watch'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
