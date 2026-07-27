'use client'

// Watchlist — V4 re-skin (owner request 2026-07-27: "watchlist still
// brings me to the old page"). Same real behavior as the prior AppShell/
// LedgerTable version — same /api/watchlist fetch, add/remove calls,
// enriched fields, honest "Not available" states — recomposed in the V4
// ledger-card language (same rows as Desk//app/analyses, AvatarMenu shell
// provided by the server page). LedgerTable/PiCard/WitnessDots imports
// dropped with the table layout; every real data field they displayed is
// kept below in compact line form.

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import type { V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { EnrichedWatch } from '@/lib/watchlist/enrich'
import { nextScheduledRecheck } from '@/lib/watchlist/schedule'

type V2Verdict = V2VerdictDisplay['verdict']
const V2_TONE: Record<V2Verdict, { dot: string; text: string; label: string }> = {
  BUILD_NOW:               { dot: 'bg-pi-build',     text: 'text-pi-build', label: 'Build Now' },
  BUILD_IF_DIFFERENTIATED: { dot: 'bg-pi-gold-deep', text: 'text-pi-gold',  label: 'Build If Differentiated' },
  WATCH_CLOSELY:           { dot: 'bg-pi-gold-deep', text: 'text-pi-gold',  label: 'Watch Closely' },
  WATCH:                   { dot: 'bg-pi-faint',     text: 'text-pi-sub',   label: 'Watch' },
  INVESTIGATE:             { dot: 'bg-pi-faint',     text: 'text-pi-sub',   label: 'Investigate' },
  AVOID:                   { dot: 'bg-pi-risk',      text: 'text-pi-risk',  label: 'Avoid' },
  PASS:                    { dot: 'bg-pi-risk',      text: 'text-pi-risk',  label: 'Pass' },
}

interface EligibleAnalysis {
  id: string
  category_name: string
  created_at: string
  opportunity_score: number
}

type WatchRow = EnrichedWatch & { id: string }

function formatRelative(iso: string | null): string {
  if (!iso) return 'not yet checked'
  const diff = Date.now() - new Date(iso).getTime()
  const day = 86_400_000
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / day)}d ago`
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

export function WatchlistView() {
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

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-24 pt-12 sm:pt-16">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
        Watchlist{!loading && ` · ${watches.length} ${watches.length === 1 ? 'market' : 'markets'}`}
      </p>
      <h1 className="mb-1 font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink">What I&rsquo;m re-checking for you.</h1>
      <p className="mb-8 text-sm text-pi-sub">You&rsquo;ll hear from me only when the evidence moves.</p>

      {error && (
        <p role="alert" className="rounded-xl border border-pi-risk/30 bg-pi-risk/10 px-4 py-3 text-sm text-pi-risk">{error}</p>
      )}

      {loading && (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-pi-hairline bg-pi-card p-5 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
              <div className="mb-2 h-4 w-48 rounded bg-pi-sand" />
              <div className="h-3 w-24 rounded bg-pi-sand" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && watches.length === 0 && (
        <div className="space-y-4 rounded-2xl border border-pi-hairline bg-pi-card p-10 text-center shadow-[0_1px_3px_rgba(22,23,26,0.05)]">
          <p className="text-sm leading-relaxed text-pi-sub">
            Nothing watched yet. Watch a market and I&rsquo;ll re-check it on schedule — you&rsquo;ll hear from me only when the evidence moves.
          </p>
          <Link href="/app" className="text-sm text-pi-gold hover:underline">Run an analysis →</Link>
        </div>
      )}

      {!loading && !error && watches.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {watches.map(w => {
              const tone = w.marketVerdict ? V2_TONE[w.marketVerdict] : null
              const killTotal = w.entry.kill_criteria.length
              const killTripped = w.triggeredKillCriteria.length
              return (
                <li key={w.id} className="rounded-xl border border-pi-hairline bg-pi-card px-5 py-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-shadow hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.1)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/app/brief/${w.entry.analysis_id}`} className="font-serif text-[17px] font-semibold text-pi-ink hover:underline">
                        {w.entry.category_name}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-pi-sub">
                        {tone && (
                          <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide ${tone.text}`}>
                            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                            {tone.label}
                          </span>
                        )}
                        {w.currentStage && (
                          <span className="font-mono text-[10px] uppercase tracking-wide">
                            {w.currentStage}
                            {w.previousStage && <span className="text-pi-faint"> (was {w.previousStage})</span>}
                          </span>
                        )}
                        {killTotal > 0 && (
                          <span className={`font-mono text-[10px] uppercase tracking-wide ${killTripped ? 'font-bold text-pi-risk' : 'text-pi-faint'}`} title={w.triggeredKillCriteria.join('; ')}>
                            {killTripped}/{killTotal} kill criteria
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-pi-faint">
                        {[
                          w.qualityScore !== null ? `Quality ${w.qualityScore}/100` : null,
                          w.gapVelocityDisplay ? `Gap ${w.gapVelocityDisplay}` : null,
                          w.confidencePct !== null ? `Confidence ${w.confidencePct}%` : null,
                          `checked ${formatRelative(w.entry.last_checked_at)}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      onClick={() => removeWatch(w.id)}
                      disabled={actioning === w.id}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-pi-faint transition-colors hover:bg-pi-risk/10 hover:text-pi-risk disabled:opacity-40"
                    >
                      {actioning === w.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 font-mono text-[10px] text-pi-faint">
            Next scheduled re-check for all watches: {formatDate(nextCheck)}
          </p>
        </>
      )}

      {!loading && !error && eligible.length > 0 && (
        <section className="mt-10">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Add to watchlist</p>
          <ul className="space-y-2">
            {eligible.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
                <div className="min-w-0">
                  <p className="truncate text-sm text-pi-ink">{a.category_name}</p>
                </div>
                <button
                  onClick={() => addWatch(a.id)}
                  disabled={actioning === a.id}
                  className="shrink-0 rounded-lg border border-pi-hairline px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide text-pi-ink transition-colors hover:bg-pi-ink hover:text-pi-cream disabled:opacity-40"
                >
                  {actioning === a.id ? 'Watching…' : '+ Watch'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link href="/app" className="text-sm text-pi-faint hover:text-pi-ink">← Back to the Stream</Link>
      </div>
    </div>
  )
}
