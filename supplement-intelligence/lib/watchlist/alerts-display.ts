// ── Alert display enrichment — Phase 3 Alerts UI integration ────────────────
//
// Pure, non-JSX. The real backend (migration 023_watchlist.sql) only ever
// writes two alert_type values — a hard `check` constraint enforces this —
// so "Market Verdict changes" and "Confidence changes" have no persisted
// history to show as alerts; lib/watchlist/recheck.ts explicitly does not
// recompute market_verdict on re-check (only lifecycle stage, per V2
// Blueprint §14). Rather than fabricating a change feed that doesn't exist,
// every alert card is enriched with the watch's CURRENT real verdict/
// confidence (via enrichWatch — the exact same function the Watchlist page
// uses, not a second calculation) as honest context, never labeled as a
// "change."

import type { WatchlistAlert, WatchlistEntry } from './types'
import type { KillCriterionComparator } from '@/lib/kill-criteria'
import type { MarketVerdict } from '@/lib/verdict-matrix'
import type { MemoData } from '@/types/index'
import { enrichWatch } from './enrich'

export type AlertSeverity = 'critical' | 'informational'

export interface EnrichedAlert {
  alert:        WatchlistAlert
  categoryName: string
  analysisId:   string

  // Derived directly from the real, persisted `alert_type` enum — never a
  // new classification scheme.
  severity:      AlertSeverity
  severityLabel: string

  // Built only from real, already-persisted fields on the alert/watch rows
  // — never fabricated commentary.
  headline: string
  detail:   string | null

  // Real CURRENT verdict/confidence for the watched market (via
  // enrichWatch) — context, not a "change," since none is tracked.
  currentVerdict:        MarketVerdict | null
  currentConfidencePct:  number | null
}

const COMPARATOR_LABEL: Record<KillCriterionComparator, string> = {
  lt: 'falls below',
  gt: 'exceeds',
  eq: 'equals',
  in: 'is one of',
}

export function describeComparator(comparator: KillCriterionComparator): string {
  return COMPARATOR_LABEL[comparator]
}

export function enrichAlert(alert: WatchlistAlert, watch: WatchlistEntry, memo: MemoData | null): EnrichedAlert {
  const severity: AlertSeverity = alert.alert_type === 'kill_criteria_triggered' ? 'critical' : 'informational'
  const severityLabel = alert.alert_type === 'kill_criteria_triggered' ? 'Kill Criterion Breach' : 'Lifecycle Transition'

  const headline = alert.alert_type === 'stage_transition'
    ? `${watch.category_name} moved ${alert.previous_stage ?? 'an unrecorded stage'} → ${alert.new_stage ?? 'an unrecorded stage'}`
    : `${watch.category_name} crossed kill criterion: ${alert.kill_criterion_label ?? 'an unlabeled criterion'}`

  // Only for kill_criteria_triggered, and only when the matching criterion
  // is still on the watch's own kill_criteria snapshot (a fixed watch-time
  // list, never edited afterward) — real metric/comparator/threshold/
  // generation-time value, no invented commentary.
  let detail: string | null = null
  if (alert.alert_type === 'kill_criteria_triggered' && alert.kill_criterion_key) {
    const criterion = watch.kill_criteria.find(c => c.key === alert.kill_criterion_key)
    if (criterion) {
      const threshold = Array.isArray(criterion.threshold) ? criterion.threshold.join(', ') : criterion.threshold
      const generationValue = criterion.valueAtGeneration ?? 'unrecorded'
      detail = `${criterion.metric} ${describeComparator(criterion.comparator)} ${threshold} (was ${generationValue} when this watch was created)`
    }
  }

  const { marketVerdict, confidencePct } = enrichWatch(watch, memo, [])

  return {
    alert, categoryName: watch.category_name, analysisId: watch.analysis_id,
    severity, severityLabel, headline, detail,
    currentVerdict: marketVerdict, currentConfidencePct: confidencePct,
  }
}

export interface AlertDayGroup {
  label: string
  items: EnrichedAlert[]
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// Groups by the alert's own real created_at calendar date (UTC) — assumes
// the caller already sorted alerts newest-first (listAlerts() does this),
// preserving that order across groups.
export function groupAlertsByDay(alerts: EnrichedAlert[], now: Date = new Date()): AlertDayGroup[] {
  const todayKey = dayKey(now)
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000))

  const order: string[] = []
  const groups = new Map<string, EnrichedAlert[]>()
  for (const item of alerts) {
    const key = dayKey(new Date(item.alert.created_at))
    if (!groups.has(key)) { groups.set(key, []); order.push(key) }
    groups.get(key)!.push(item)
  }

  return order.map(key => ({
    label: key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatDayLabel(key),
    items: groups.get(key)!,
  }))
}
