'use client'

// ═══════════════════════════════════════════════════════════════════════
// Alerts — Phase 3 integration (Alerts only).
//
// Real Stitch reference:
// stitch-import/product-intelligence-design-foundation/screens/
// d781acc77a774bff97e375096c6f4df7.html ("Alerts Center"). Layout mirrored:
// day-grouped sections with a bracket header + rule + real count, each
// alert as a bordered card with a colored severity dot, headline, detail
// line, a "See what changed" link out to the real Investor Report, and a
// right-side "Internal Verdict"-style mini panel.
//
// The Stitch reference's specific alert copy ("19 listings under 6 months
// old", "Conf: 94%", verdict word "SCALING", etc.) is fabricated mockup
// content — not reproduced. The real backend (migration 023_watchlist.sql)
// only ever writes two alert types under a hard check constraint
// (stage_transition, kill_criteria_triggered) — there is no persisted
// "market verdict changed" or "confidence changed" alert. Per instruction
// to reuse the existing backend rather than invent one, each alert's
// right-side panel shows the watch's CURRENT real verdict/confidence
// (via lib/watchlist/alerts-display.ts's enrichAlert, itself built on the
// exact same enrichWatch() the Watchlist page already uses) as honest
// context — labeled "Current," never "change," since no change history
// exists to show.
//
// Renders via <AppShell active={null}> — components/shell/SideNav.tsx has
// no Alerts entry, and adding one would touch a file shared by every
// other page (Dashboard, Compare, History, Track Record, etc.), all out
// of scope this pass. Same resolution already used for /watchlist.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { VerdictBadge, WitnessDots } from '@/components/ui'
import type { EnrichedAlert, AlertDayGroup } from '@/lib/watchlist/alerts-display'
import { groupAlertsByDay } from '@/lib/watchlist/alerts-display'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function AlertCard({ item }: { item: EnrichedAlert }) {
  const dotColor = item.severity === 'critical' ? 'bg-verdict-negative' : 'bg-black'
  const labelColor = item.severity === 'critical' ? 'text-verdict-negative' : 'text-black'

  return (
    <div className="border border-black bg-white p-6 flex flex-col md:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-xs font-mono uppercase font-bold tracking-wide ${labelColor}`}>{item.severityLabel}</span>
          <span className="text-[10px] font-mono text-outline ml-auto md:ml-2 whitespace-nowrap">{formatTime(item.alert.created_at)}</span>
        </div>
        <h3 className="text-lg font-bold text-black leading-snug mb-1">{item.headline}</h3>
        {item.detail && <p className="text-xs font-mono text-ink-variant mb-3">{item.detail}</p>}
        <Link
          href={`/memo/${item.analysisId}`}
          className="inline-flex items-center gap-1 text-xs font-mono font-bold uppercase border-b-2 border-black hover:border-transparent transition-colors"
        >
          See what changed →
        </Link>
      </div>

      <div className="md:w-56 shrink-0">
        <div className="border border-black bg-surface-container p-4 h-full flex flex-col justify-between gap-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-outline">Current Verdict</p>
          {item.currentVerdict
            ? <VerdictBadge scheme="v2-verdict" verdict={item.currentVerdict} size="sm" />
            : <span className="text-xs text-outline-variant">Not available</span>}
          <div className="mt-auto">
            <p className="text-[10px] font-mono uppercase tracking-widest text-outline mb-1">Current Confidence</p>
            {item.currentConfidencePct !== null
              ? <div className="flex items-center gap-2"><WitnessDots filled={Math.round(item.currentConfidencePct / 20)} total={5} size="sm" /><span className="font-mono text-xs">{item.currentConfidencePct}%</span></div>
              : <span className="text-xs text-outline-variant">Not available</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayGroup({ group }: { group: AlertDayGroup }) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xs font-mono uppercase font-black bg-black text-white px-3 py-1">{group.label}</h2>
        <div className="h-px flex-1 bg-black" />
        <span className="text-[10px] font-mono text-outline whitespace-nowrap">
          {group.items.length} {group.items.length === 1 ? 'LOG' : 'LOGS'}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {group.items.map(item => <AlertCard key={item.alert.id} item={item} />)}
      </div>
    </section>
  )
}

export default function AlertsPage() {
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
    <AppShell active={null}>
      <div className="max-w-5xl space-y-6">
        <div className="border-b-2 border-black pb-4">
          <h1 className="text-headline-md text-black">Alerts</h1>
          <p className="text-sm text-ink-variant">
            {loading ? 'Loading…' : `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'} from your watchlist`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-black bg-white p-6 animate-pulse">
                <div className="h-4 bg-surface-container w-64 mb-2" />
                <div className="h-3 bg-surface-container w-40" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="border border-black bg-white p-12 text-center space-y-3">
            <p className="text-[10px] font-mono text-outline uppercase tracking-[0.2em]">Status: Quiet</p>
            <p className="text-ink-variant text-sm max-w-sm mx-auto">
              No alerts yet. Watch a market from its Investor Report and we&rsquo;ll notify you here the moment its lifecycle stage shifts or a kill criterion triggers.
            </p>
            <Link href="/watchlist" className="inline-block text-xs font-mono uppercase tracking-wide text-black border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors">
              Go to Watchlist →
            </Link>
          </div>
        )}

        {!loading && !error && groups.map(group => <DayGroup key={group.label} group={group} />)}
      </div>
    </AppShell>
  )
}
