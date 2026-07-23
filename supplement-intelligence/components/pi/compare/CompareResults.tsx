'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import { METRICS, SECTION_ORDER, VERDICT_META_NOIR, getNumericRank, type MetricDef } from '@/app/research/compare/metrics'
import {
  buildSeparationEngine,
  pickLeaderIndex,
  isWeakSet,
  DECISIVE_THRESHOLD,
  DECISIVE_CAP,
  type ScoredMetric,
} from '@/app/research/compare/separationEngine'

// Owner-approved Compare redesign (scratchpad/compare_mockup.html), wired to
// the real /api/research/compare data. Ports the mockup's visual layout and
// its separationOf/rankValue/buildEngine computation 1:1 — see
// app/research/compare/separationEngine.ts for the computation itself,
// built on top of the real getNumericRank/findWinner in metrics.ts.
//
// Rewired (2026-07-2x) onto AnalysisComparisonItem (the real `analyses`
// pipeline) — Founder Fit, quick-economics, and unit-economics rows are gone
// entirely (no real equivalent — see app/api/research/compare/route.ts's own
// header comment), and kill-switch display now reads the real, watchlist-
// gated kill_criteria_clear/triggered_kill_criteria fields instead of the
// old adversarial-debate all_switches_clear/triggered_switches.
//
// Honesty deviations from the mockup's illustrative dataset (no real field
// backs these on AnalysisComparisonItem):
//   - "N signals" / "thin evidence" badge — dropped entirely.
//   - confidence/age line — real confidencePct + created_at only.
//   - kill-criterion state — real kill_criteria_clear/triggered_kill_criteria
//     only, which is itself only ever non-null once an analysis is
//     watchlisted (see route.ts's HONESTY CAVEAT) — no fabricated
//     in-between "Watching" state is invented here either.
//   - weak-set "why" text — the mockup hand-authored a per-metric gate
//     explanation for its (explicitly unwired) demo tab. No stored field
//     backs an authored claim like that, so this shows each candidate's own
//     real quality tier + verdict instead.
//
// Terminal Noir port (2026-07-23): presentation-only re-skin, same
// computation (buildSeparationEngine/pickLeaderIndex/isWeakSet — all
// untouched) and same real fields. Cream tokens remapped to the dark
// register; VERDICT_META_NOIR (an additive sibling to metrics.ts's
// still-cream VERDICT_META) supplies dark-safe verdict pill colors.

const GLYPH: Record<string, string> = {
  BUILD_NOW:               '▲',
  BUILD_IF_DIFFERENTIATED: '✦',
  WATCH_CLOSELY:           '✦',
  WATCH:                   '◇',
  INVESTIGATE:             '◆',
  AVOID:                   '—',
  PASS:                    '—',
}

function relativeAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 28) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 365)}y ago`
}

function memoHref(item: AnalysisComparisonItem): string {
  return `/memo/${item.analysis_id}`
}

function itemLabel(item: AnalysisComparisonItem): string {
  return item.category_name
}

function shortLabel(item: AnalysisComparisonItem): string {
  return item.category_name.split(' ').slice(0, 2).join(' ')
}

function confMetaText(item: AnalysisComparisonItem): string {
  const age = relativeAge(item.created_at)
  return item.confidencePct !== null ? `${item.confidencePct}% confidence · ${age}` : `confidence not available · ${age}`
}

function killCaption(item: AnalysisComparisonItem): string {
  if (item.kill_criteria_clear === null) return ''
  if (item.kill_criteria_clear) return ' — nothing flagged against it.'
  const n = item.triggered_kill_criteria.length
  return n > 0 ? ` — though ${n} kill ${n === 1 ? 'criterion is' : 'criteria are'} flagged.` : ' — though a kill criterion is flagged.'
}

function normPositions(dir: MetricDef['dir'], values: (number | string | boolean | null)[]) {
  const ranks = values.map(v => getNumericRank(dir, v))
  const valid = ranks.filter((r): r is number => r !== null)
  if (valid.length === 0) return ranks.map(() => null)
  const lo = Math.min(...valid)
  const hi = Math.max(...valid)
  return ranks.map(r => (r === null ? null : hi === lo ? 0.5 : (r - lo) / (hi - lo)))
}

// ── Dot-plot row ─────────────────────────────────────────────────────────

function SigTrackRow({
  x, items, leaderIdx, weak, onJump,
}: {
  x: ScoredMetric
  items: AnalysisComparisonItem[]
  leaderIdx: number
  weak: boolean
  onJump: (id: string) => void
}) {
  const { metric, values } = x
  const positions = normPositions(metric.dir, values)
  const leaderName = shortLabel(items[leaderIdx])

  function activate() { onJump(`sig-${metric.id}`) }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } }}
      className="cursor-pointer rounded-lg border-b border-pi-noir-hairline px-1 py-3 last:border-b-0 hover:bg-pi-gold-deep/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-deep"
      aria-label={`${metric.label}, jump to full evidence`}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
        <span className="text-[13px] font-bold text-pi-noir-text">{metric.label}</span>
        <span className={cn('font-mono text-[10.5px] font-bold', weak ? 'text-pi-risk-noir' : 'text-pi-gold-deep')}>
          {leaderName} {weak ? 'behind' : 'ahead'}
        </span>
      </div>
      <div className="relative mx-[9px] h-1 rounded-full bg-pi-noir-hairline">
        {values.map((v, i) => {
          const p = positions[i] === null ? 50 : (positions[i] as number) * 100
          const isLeader = i === leaderIdx
          return (
            <div
              key={i}
              title={`${itemLabel(items[i])}: ${metric.format(v)}`}
              style={{ left: `${p}%` }}
              className={cn(
                '-translate-y-1/2 absolute top-1/2 -translate-x-1/2 rounded-full border-2 border-pi-stage shadow-[0_1px_3px_rgba(0,0,0,0.4)]',
                isLeader
                  ? weak
                    ? 'z-10 h-[17px] w-[17px] bg-pi-risk-noir shadow-[0_2px_10px_rgba(232,120,94,0.45)]'
                    : 'z-10 h-[17px] w-[17px] bg-pi-gold-deep shadow-[0_2px_10px_rgba(212,169,74,0.55)]'
                  : 'h-3 w-3 bg-pi-noir-sub'
              )}
            />
          )
        })}
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-pi-noir-sub">
        {values.map((v, i) => (
          <span key={i}>
            {i > 0 && ' · '}
            <span className={i === leaderIdx ? 'font-bold text-pi-noir-text' : undefined}>
              {shortLabel(items[i])}: {metric.format(v)}
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function CompareResults({
  items, recommendation, recLoading, recError, onGetRecommendation,
}: {
  items: AnalysisComparisonItem[]
  recommendation: string | null
  recLoading: boolean
  recError: string | null
  onGetRecommendation: () => void
}) {
  const visibleMetrics = METRICS
  const leaderIdx = useMemo(() => pickLeaderIndex(items), [items])
  const weakSet = useMemo(() => isWeakSet(items, leaderIdx), [items, leaderIdx])
  const engine = useMemo(
    () => buildSeparationEngine(items, leaderIdx, visibleMetrics),
    [items, leaderIdx, visibleMetrics]
  )

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [])

  const [allOpen, setAllOpen] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  function jumpToEvidence(targetId: string) {
    setAllOpen(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = rowRefs.current[targetId]
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setFlashId(targetId)
        setTimeout(() => setFlashId(null), 1600)
      })
    })
  }

  const tiedCount = visibleMetrics.length - Object.keys(engine.decisiveIds).length

  const sections = SECTION_ORDER
    .map(name => ({ name, rows: visibleMetrics.filter(m => m.section === name) }))
    .filter(s => s.rows.length > 0)

  // ── Weak-set state: none of the compared items clears the bar ──────────
  if (weakSet) {
    return (
      <div className="space-y-6">
        <p className="rounded-xl border-l-[3px] border-pi-risk-noir bg-pi-elevated px-[22px] py-5 font-serif text-[21px] font-semibold leading-relaxed tracking-tight text-pi-noir-text">
          <b className="text-pi-risk-noir">None of these {items.length} clears the bar.</b>{' '}
          The strongest of them still comes back {VERDICT_META_NOIR[items[leaderIdx].verdict!]?.label ?? 'unresolved'} —
          this comparison has no winner to declare.
        </p>

        <div className={cn('grid gap-2.5', items.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {items.map((item, i) => {
            const meta = item.verdict ? VERDICT_META_NOIR[item.verdict] : null
            const isLeader = i === leaderIdx
            return (
              <div
                key={item.analysis_id}
                className={cn(
                  'rounded-xl border border-pi-noir-hairline bg-pi-stage p-4',
                  isLeader && 'shadow-[0_0_0_1.5px_#D4A94A] bg-pi-gold-deep/[0.06]'
                )}
              >
                {isLeader && (
                  <span className="mb-2 block w-fit rounded-full bg-pi-noir-hairline px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-pi-noir-sub">
                    Best of a weak set
                  </span>
                )}
                {meta && (
                  <span className={cn('mb-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold', meta.cls)}>
                    <span className="text-[9px]" aria-hidden>{item.verdict ? GLYPH[item.verdict] : ''}</span>{meta.label}
                  </span>
                )}
                <p className="mb-1.5 text-sm font-bold leading-tight text-pi-noir-text">{itemLabel(item)}</p>
                <p className="font-mono text-[22px] font-bold text-pi-noir-text">
                  {item.score} <span className="text-[11px] font-normal text-pi-noir-sub">/100</span>
                </p>
                <p className="mt-1 font-mono text-[10.5px] text-pi-noir-sub">{confMetaText(item)}</p>
                <Link href={memoHref(item)} className="mt-1.5 inline-block text-[11px] text-pi-noir-text underline underline-offset-2 hover:text-pi-gold-deep">
                  Open →
                </Link>
              </div>
            )
          })}
        </div>

        <div>
          <p className="mb-1 inline-block text-[15px] font-bold text-pi-noir-text">Why none of them clear it</p>
          <p className="mb-3.5 text-xs text-pi-noir-sub">Each candidate&apos;s own real verdict + quality tier — not a ranking of runners-up.</p>
          <div className="flex flex-col gap-2">
            {items.map(item => (
              <div key={item.analysis_id} className="w-full rounded-xl border border-pi-noir-hairline bg-pi-stage px-[18px] py-3.5">
                <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-pi-noir-sub">{itemLabel(item)}</p>
                <p className="text-sm leading-relaxed text-pi-noir-text">
                  {item.verdict
                    ? `${VERDICT_META_NOIR[item.verdict].label}${item.qualityTier ? ` — ${item.qualityTier} quality` : ''}.`
                    : 'No verdict is stored for this analysis yet.'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="border-t border-pi-noir-hairline pt-4 text-[11.5px] leading-relaxed text-pi-noir-sub">
          This state renders whenever every compared candidate&apos;s own verdict falls short of Watch Closely — the
          screen will never promote a &quot;least-bad&quot; option into looking like a recommendation. Re-run analysis
          or widen the search instead of building on any of these as-is.
        </p>
      </div>
    )
  }

  // ── Normal state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-1">
      {/* Layer 0 — the proof: bar length is the real score field */}
      <div className="mb-2.5 flex flex-col gap-3">
        {items.map((item, i) => {
          const isLeader = i === leaderIdx
          const meta = item.verdict ? VERDICT_META_NOIR[item.verdict] : null
          const pct = mounted ? item.score : 0
          return (
            <div key={item.analysis_id} className="grid grid-cols-[minmax(96px,150px)_1fr_46px] items-center gap-2 sm:gap-3.5">
              <div className="text-[13px] font-bold leading-tight text-pi-noir-text">
                {itemLabel(item)}
                <small className="mt-0.5 block text-[10.5px] font-normal text-pi-noir-sub">{confMetaText(item)}</small>
              </div>
              <div
                className={cn(
                  'relative h-[38px] overflow-hidden rounded-[9px] bg-pi-elevated',
                  isLeader && 'shadow-[0_0_0_1.5px_#D4A94A]'
                )}
              >
                {meta && (
                  <span className={cn('absolute left-2.5 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold', isLeader ? 'text-[#16130a]' : 'text-pi-noir-text')}>
                    {item.verdict ? GLYPH[item.verdict] : ''} {meta.label}
                  </span>
                )}
                <div
                  style={{ width: `${pct}%` }}
                  className={cn(
                    'absolute inset-0 rounded-[9px] transition-[width] duration-1000 ease-out motion-reduce:transition-none',
                    isLeader
                      ? 'bg-gradient-to-r from-[#c9a13f] to-pi-gold-deep shadow-[0_0_16px_rgba(212,169,74,0.4)]'
                      : 'bg-gradient-to-r from-pi-noir-sub/25 to-pi-noir-sub/35'
                  )}
                />
              </div>
              <div className={cn('text-right font-mono text-xl font-bold', isLeader ? 'text-pi-gold-deep' : 'text-pi-noir-text')}>
                {item.score}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mb-7 font-mono text-[10.5px] text-pi-noir-sub">
        <b className="text-pi-noir-text">{itemLabel(items[leaderIdx])}</b>{killCaption(items[leaderIdx])}
      </p>

      {/* Layer 1 — decisive signals as dot-plots, computed by separationEngine */}
      <p className="mb-1 inline-block text-[15px] font-bold text-pi-noir-text">
        What actually separates them
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-pi-gold-deep/[0.14] px-2 py-0.5 align-middle font-mono text-[9.5px] font-bold uppercase tracking-wide text-pi-gold-deep">
          ⚙ computed, not chosen
        </span>
      </p>
      <p className="mb-3.5 text-xs text-pi-noir-sub">
        {engine.forPool.length} signal{engine.forPool.length === 1 ? '' : 's'} cleared the bar.
      </p>
      <div className="mb-5">
        {engine.forPool.length === 0 && (
          <p className="m-0 text-sm text-pi-noir-sub">No signal clears the separation bar for {itemLabel(items[leaderIdx])} — the lead is thin.</p>
        )}
        {engine.forPool.map(x => (
          <SigTrackRow key={x.metric.id} x={x} items={items} leaderIdx={leaderIdx} weak={false} onJump={jumpToEvidence} />
        ))}
      </div>

      <p className="mb-1 mt-6 text-[15px] font-bold text-pi-noir-text">Where {shortLabel(items[leaderIdx])} is weakest</p>
      <p className="mb-3 text-xs text-pi-noir-sub">The single largest gap running against the pick — also computed, not chosen.</p>
      <div className="mb-5">
        {engine.against.length === 0 && (
          <p className="m-0 text-sm text-pi-noir-sub">No signal goes against {itemLabel(items[leaderIdx])} — it leads or ties on every stored metric.</p>
        )}
        {engine.against.map(x => (
          <SigTrackRow key={x.metric.id} x={x} items={items} leaderIdx={leaderIdx} weak onJump={jumpToEvidence} />
        ))}
      </div>

      {/* Layer 3 — the tied floor + full evidence, one click away */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3.5 border-t border-pi-noir-hairline pt-3">
        <p className="m-0 text-[13px] text-pi-noir-sub">
          {tiedCount} more signal{tiedCount === 1 ? '' : 's'} sit below the threshold that surfaced these {Object.keys(engine.decisiveIds).length} — gaps too small to move the decision.
        </p>
        <button
          type="button"
          onClick={() => setAllOpen(o => !o)}
          aria-expanded={allOpen}
          className="font-mono text-xs font-semibold text-pi-gold-deep underline underline-offset-4 hover:text-pi-gold-bright"
        >
          {allOpen ? 'Hide the full list ▴' : `See all ${visibleMetrics.length} signals ▾`}
        </button>
      </div>

      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none', allOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="mb-2 overflow-x-auto rounded-xl border border-pi-noir-hairline">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-pi-noir-hairline bg-pi-elevated/60">
                  <th className="px-3.5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-pi-noir-sub">Signal</th>
                  {items.map((item, i) => (
                    <th key={i} className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-pi-noir-sub">
                      {shortLabel(item)}{i === leaderIdx ? ' ★' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map(sec => (
                  <Fragment key={sec.name}>
                    <tr>
                      <td colSpan={items.length + 1} className="bg-pi-elevated/40 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-pi-noir-sub">
                        {sec.name}
                      </td>
                    </tr>
                    {sec.rows.map(metric => {
                      const kind = engine.decisiveIds[metric.id]
                      const values = items.map(i => metric.getValue(i))
                      const ranks = values.map(v => getNumericRank(metric.dir, v))
                      const validRanks = ranks.filter((r): r is number => r !== null)
                      const best = validRanks.length ? Math.max(...validRanks) : null
                      const winnerIdx = best === null ? -1 : ranks.indexOf(best)
                      return (
                        <tr
                          key={metric.id}
                          id={`sig-${metric.id}`}
                          ref={el => { rowRefs.current[`sig-${metric.id}`] = el }}
                          className={cn(
                            'border-b border-pi-noir-hairline transition-colors duration-1000 motion-reduce:transition-none',
                            kind === 'for' && 'border-l-2 border-l-pi-gold-deep bg-pi-gold-deep/5',
                            kind === 'against' && 'border-l-2 border-l-pi-risk-noir bg-pi-risk-noir/5',
                            flashId === `sig-${metric.id}` && 'bg-pi-gold-deep/25'
                          )}
                        >
                          <td className="px-3.5 py-2.5 text-pi-noir-sub">{metric.label}</td>
                          {values.map((v, i) => (
                            <td
                              key={i}
                              className={cn(
                                'px-3 py-2.5 font-mono',
                                kind === 'for' && i === winnerIdx ? 'font-bold text-pi-gold-deep'
                                  : kind === 'against' && i === winnerIdx ? 'font-bold text-pi-risk-noir'
                                  : 'text-pi-noir-text'
                              )}
                            >
                              {metric.format(v)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-2 mt-2.5 text-[11px] text-pi-noir-sub">
            Gold rows are the &quot;for&quot; signals, red the &quot;against&quot; signal, both from the list above — computed, not authored. Everything else is shown exactly as stored.
          </p>
        </div>
      </div>

      <p className="mt-7 border-t border-pi-noir-hairline pt-4 text-[11.5px] leading-relaxed text-pi-noir-sub">
        Every claim above is computed, not chosen: each stored metric is converted to a direction-adjusted rank, then
        scored by (max rank − min rank) / max(1, max|rank|) — the same polarity rules metrics.ts already uses for
        winner detection. The top-scoring signals the leader wins (cap {DECISIVE_CAP}, min score {DECISIVE_THRESHOLD}) become
        &quot;what separates them&quot;; the single highest-scoring signal it loses becomes &quot;where it is weakest.&quot;
        Both numbers are disclosed constants, not hidden logic. Confidence and age are the same fields shown on each
        candidate&apos;s own memo.
      </p>

      {/* Tie-breaker: real, unmodified AI recommendation flow */}
      <div className="mt-7 rounded-2xl border border-pi-noir-hairline bg-pi-stage p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-sm font-bold text-pi-noir-text">Still deciding?</p>
            <p className="m-0 max-w-[44ch] text-xs text-pi-noir-sub">
              Claude spells out the full reasoning across everything above — numbers are never modified, only explained.
            </p>
          </div>
          {!recommendation && (
            <button
              type="button"
              onClick={onGetRecommendation}
              disabled={recLoading}
              className="shrink-0 whitespace-nowrap rounded-lg bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-4 py-2.5 text-[13px] font-semibold text-[#16130a] transition-[filter] duration-150 hover:brightness-105 disabled:opacity-50"
            >
              {recLoading ? 'Analyzing…' : 'Get the full reasoning →'}
            </button>
          )}
        </div>
        {recError && <p className="mt-2 text-xs text-pi-risk-noir">{recError}</p>}
        {recommendation && (
          <div className="mt-3.5 space-y-2">
            <div className="rounded-[10px] bg-pi-elevated px-[18px] py-4 text-[13.5px] leading-relaxed text-pi-noir-text whitespace-pre-wrap">
              {recommendation}
            </div>
            <button
              type="button"
              onClick={onGetRecommendation}
              className="font-mono text-[10px] uppercase tracking-wide text-pi-noir-sub hover:text-pi-noir-text"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
