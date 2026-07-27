'use client'

// Alerts — V4 shell pass (2026-07-27, same treatment as /watchlist).
// Identical /api/alerts fetch and day-grouping as the prior AppShell
// version; presentation recomposed to the V4 ledger-card language.
// WitnessDots dropped for the same plain "Confidence NN%" line the
// watchlist uses; alert links already point at the Brief.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { EnrichedAlert, AlertDayGroup } from '@/lib/watchlist/alerts-display'
import { groupAlertsByDay } from '@/lib/watchlist/alerts-display'

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function AlertCard({ item }: { item: EnrichedAlert }) {
  const critical = item.severity === 'critical'
  const tone = item.currentVerdict ? V2_TONE[item.currentVerdict] : null
  return (
    <li className={`relative overflow-hidden rounded-xl border bg-pi-card py-4 pl-5 pr-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)] ${critical ? 'border-pi-risk/30' : 'border-pi-hairline'}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${critical ? 'bg-pi-risk' : 'bg-pi-gold-deep'} opacity-70`} />
      <p className="flex items-center gap-2">
        <span className={`font-mono text-[10px] font-bold uppercase tracking-wide ${critical ? 'text-pi-risk' : 'text-pi-ink'}`}>{item.severityLabel}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-pi-faint">{formatTime(item.alert.created_at)}</span>
      </p>
      <h3 className="mt-1 font-serif text-[16px] font-semibold leading-snug text-pi-ink">{item.headline}</h3>
      {item.detail && <p className="mt-1 text-[12.5px] text-pi-sub">{item.detail}</p>}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-pi-faint">
        {tone && (
          <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide ${tone.text}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            Current: {tone.label}
          </span>
        )}
        {item.currentConfidencePct !== null && <span>Confidence {item.currentConfidencePct}%</span>}
      </p>
      <Link href={`/app/brief/${item.analysisId}`} className="mt-2 inline-block text-[13px] text-pi-gold hover:underline">
        See what changed →
      </Link>
    </li>
  )
}

function DayGroup({ group }: { group: AlertDayGroup }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">{group.label}</h2>
        <div className="h-px flex-1 bg-pi-hairline" />
        <span className="font-mono text-[10px] tabular-nums text-pi-faint">{group.items.length}</span>
      </div>
      <ul className="space-y-2.5">
        {group.items.map(item => <AlertCard key={item.alert.id} item={item} />)}
      </ul>
    </section>
  )
}

export function AlertsView() {
  const [alerts, setAlerts] = useState<EnrichedAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/alerts')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load alerts'); return }
      setAlerts(data.alerts ?? [])
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const groups = groupAlertsByDay(alerts)

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-24 pt-12 sm:pt-16">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
        Alerts{!loading && ` · ${alerts.length}`}
      </p>
      <h1 className="mb-1 font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink">When the evidence moved.</h1>
      <p className="mb-8 text-sm text-pi-sub">Every stage shift and tripped condition from your watchlist.</p>

      {error && <p role="alert" className="rounded-xl border border-pi-risk/30 bg-pi-risk/10 px-4 py-3 text-sm text-pi-risk">{error}</p>}

      {loading && (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-pi-hairline bg-pi-card p-5 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
              <div className="mb-2 h-4 w-56 rounded bg-pi-sand" />
              <div className="h-3 w-32 rounded bg-pi-sand" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="space-y-4 rounded-2xl border border-pi-hairline bg-pi-card p-10 text-center shadow-[0_1px_3px_rgba(22,23,26,0.05)]">
          <p className="text-sm leading-relaxed text-pi-sub">
            Quiet so far. Watch a market from its Brief and I&rsquo;ll notify you here the moment its lifecycle stage shifts or a kill criterion trips.
          </p>
          <Link href="/watchlist" className="text-sm text-pi-gold hover:underline">Go to the watchlist →</Link>
        </div>
      )}

      {!loading && !error && groups.map(group => <DayGroup key={group.label} group={group} />)}

      <div className="mt-10 text-center">
        <Link href="/app" className="text-sm text-pi-faint hover:text-pi-ink">← Back to the Stream</Link>
      </div>
    </div>
  )
}
