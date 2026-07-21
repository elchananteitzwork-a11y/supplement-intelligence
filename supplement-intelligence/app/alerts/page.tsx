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
import { WitnessDots } from '@/components/ui'
import type { V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { EnrichedAlert, AlertDayGroup } from '@/lib/watchlist/alerts-display'
import { groupAlertsByDay } from '@/lib/watchlist/alerts-display'

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function AlertCard({ item }: { item: EnrichedAlert }) {
  const dotColor = item.severity === 'critical' ? 'bg-pi-risk' : 'bg-pi-ink'
  const labelColor = item.severity === 'critical' ? 'text-pi-risk' : 'text-pi-ink'

  return (
    <div className="rounded-xl border border-pi-hairline bg-pi-card p-6 flex flex-col md:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-xs font-mono uppercase font-bold tracking-wide ${labelColor}`}>{item.severityLabel}</span>
          <span className="text-[10px] font-mono text-pi-faint ml-auto md:ml-2 whitespace-nowrap">{formatTime(item.alert.created_at)}</span>
        </div>
        <h3 className="text-lg font-semibold text-pi-ink leading-snug mb-1">{item.headline}</h3>
        {item.detail && <p className="text-xs font-mono text-pi-sub mb-3">{item.detail}</p>}
        <Link
          href={`/memo/${item.analysisId}`}
          className="inline-flex items-center gap-1 text-xs font-mono font-bold uppercase border-b border-pi-ink hover:border-transparent hover:text-pi-gold-bright transition-colors"
        >
          See what changed →
        </Link>
      </div>

      <div className="md:w-56 shrink-0">
        <div className="rounded-lg border border-pi-hairline bg-pi-sand p-4 h-full flex flex-col justify-between gap-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-pi-faint">Current Verdict</p>
          {item.currentVerdict
            ? <V2VerdictPill verdict={item.currentVerdict} />
            : <span className="text-xs text-pi-faint">Not available</span>}
          <div className="mt-auto">
            <p className="text-[10px] font-mono uppercase tracking-widest text-pi-faint mb-1">Current Confidence</p>
            {item.currentConfidencePct !== null
              ? <div className="flex items-center gap-2"><WitnessDots variant="pi" filled={Math.round(item.currentConfidencePct / 20)} total={5} size="sm" /><span className="font-mono text-xs text-pi-ink">{item.currentConfidencePct}%</span></div>
              : <span className="text-xs text-pi-faint">Not available</span>}
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
        <h2 className="text-xs font-mono uppercase font-bold bg-pi-ink text-pi-cream rounded-full px-3 py-1">{group.label}</h2>
        <div className="h-px flex-1 bg-pi-hairline" />
        <span className="text-[10px] font-mono text-pi-faint whitespace-nowrap">
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
    <AppShell active={null} variant="pi">
      <div className="max-w-5xl space-y-6">
        <div className="border-b border-pi-hairline pb-4">
          <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">Alerts</h1>
          <p className="text-sm text-pi-sub">
            {loading ? 'Loading…' : `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'} from your watchlist`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-pi-risk rounded-lg border border-pi-risk/30 bg-pi-risk/10 px-3 py-2">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-pi-hairline bg-pi-card p-6 animate-pulse">
                <div className="h-4 bg-pi-sand w-64 mb-2" />
                <div className="h-3 bg-pi-sand w-40" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="rounded-xl border border-pi-hairline bg-pi-card p-12 text-center space-y-3">
            <p className="text-[10px] font-mono text-pi-faint uppercase tracking-[0.2em]">Status: Quiet</p>
            <p className="text-pi-sub text-sm max-w-sm mx-auto">
              No alerts yet. Watch a market from its Investor Report and we&rsquo;ll notify you here the moment its lifecycle stage shifts or a kill criterion triggers.
            </p>
            <Link
              href="/watchlist"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-pi-ink px-4 py-2 text-xs font-mono uppercase tracking-wide text-pi-cream hover:bg-[#24262B] transition-colors"
            >
              Go to Watchlist →
            </Link>
          </div>
        )}

        {!loading && !error && groups.map(group => <DayGroup key={group.label} group={group} />)}
      </div>
    </AppShell>
  )
}
