'use client'

import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { ComparisonItem } from '@/app/api/research/compare/route'

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryItem {
  id: string
  query: string
  category_id: string
  created_at: string
  status: string
  verdict_code: string | null
  opportunity_score: number
  thesis_count: number
  // We'll fetch thesis ids separately
}

interface ThesisOption {
  signal_id: string
  thesis_id: string
  label: string      // product_angle
  query:  string
  status: string
  opportunity_score: number
  created_at: string
}

// ── Metric definitions ─────────────────────────────────────────────────────

type Direction = 'higher' | 'lower' | 'bool_true' | 'verdict' | 'complexity' | 'fit_level'

interface MetricDef {
  id:        string
  label:     string
  section:   string
  dir:       Direction
  getValue:  (item: ComparisonItem) => number | string | boolean | null
  format:    (v: number | string | boolean | null) => string
}

const VERDICT_RANK: Record<string, number> = {
  PURSUE: 4, PURSUE_WITH_CAUTION: 3, INVESTIGATE_FURTHER: 2, DO_NOT_PURSUE: 1,
}
const VERDICT_COLOR: Record<string, string> = {
  PURSUE:               'text-green-400',
  PURSUE_WITH_CAUTION:  'text-yellow-400',
  INVESTIGATE_FURTHER:  'text-blue-400',
  DO_NOT_PURSUE:        'text-red-400',
}
const COMPLEXITY_RANK: Record<string, number> = { low: 3, medium: 2, high: 1 }
const FIT_LEVEL_RANK:  Record<string, number> = { sufficient: 3, strong: 3, feasible: 3, partial: 2, tight: 2, stretched: 2, insufficient: 1, weak: 1, infeasible: 1 }

function fmtK(n: number | string | boolean | null): string {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000)     return `$${(num / 1_000).toFixed(0)}k`
  return `$${num.toFixed(0)}`
}
function fmtN(n: number | string | boolean | null, suffix = ''): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return `${num.toLocaleString()}${suffix}`
}
function fmtPct(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : `${num > 0 ? '+' : ''}${num.toFixed(1)}%`
}
function fmtUsd(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : `$${num.toFixed(2)}`
}
function fmtStr(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'boolean') return n ? 'Yes' : 'No'
  return String(n).replace(/_/g, ' ')
}

const METRICS: MetricDef[] = [
  // Summary
  { id: 'score',       label: 'Opportunity Score',      section: 'Summary',    dir: 'higher',     getValue: i => i.opportunity_score,    format: v => v === null ? '—' : `${v}/100` },
  { id: 'verdict',     label: 'Market Verdict',         section: 'Summary',    dir: 'verdict',    getValue: i => i.verdict_code,         format: fmtStr },
  { id: 'fit',         label: 'Founder Fit (1–5)',      section: 'Summary',    dir: 'higher',     getValue: i => i.fit_rank,             format: v => v === null ? '—' : `${v}/5` },
  // Market signals
  { id: 'revenue',     label: 'Market Revenue /mo',     section: 'Market',     dir: 'higher',     getValue: i => i.market_revenue_mo,    format: fmtK },
  { id: 'price',       label: 'Median Price',           section: 'Market',     dir: 'higher',     getValue: i => i.median_price,         format: v => fmtN(v, '') ? `$${Number(v).toFixed(0)}` : '—' },
  { id: 'momentum',    label: '90-day Momentum',        section: 'Market',     dir: 'higher',     getValue: i => i.momentum_90d_pct,    format: fmtPct },
  { id: 'trend',       label: 'Trend Direction',        section: 'Market',     dir: 'higher',     getValue: i => i.trend_direction,      format: fmtStr },
  { id: 'tiktok',      label: 'TikTok Views',           section: 'Market',     dir: 'higher',     getValue: i => i.tiktok_view_count,   format: fmtN },
  // Competition
  { id: 'competitors', label: 'Competitor Count',       section: 'Competition', dir: 'lower',     getValue: i => i.competitor_count,    format: fmtN },
  { id: 'revconc',     label: 'Review Concentration',  section: 'Competition', dir: 'lower',      getValue: i => i.review_concentration, format: v => (v === null || v === undefined) ? '—' : `${Math.round(Number(v) * 100)}%` },
  // Quality gates
  { id: 'thresholds',  label: 'Thresholds Passed',      section: 'Gates',      dir: 'higher',     getValue: i => i.threshold_pass_count, format: v => `${v}/5` },
  { id: 'killsw',      label: 'Kill Switches Clear',    section: 'Gates',      dir: 'bool_true',  getValue: i => i.all_switches_clear,  format: v => v === null ? '—' : v ? 'All clear' : 'Flagged' },
  // Economics
  { id: 'complexity',  label: 'Launch Complexity',      section: 'Economics',  dir: 'complexity', getValue: i => i.launch_complexity,   format: fmtStr },
  { id: 'capital',     label: 'Min Capital Required',   section: 'Economics',  dir: 'lower',      getValue: i => i.min_capital_required, format: fmtK },
  { id: 'cogs',        label: 'Max COGS /unit',         section: 'Economics',  dir: 'higher',     getValue: i => i.breakeven_cogs,      format: fmtUsd },
  { id: 'year1',       label: 'Year 1 Revenue (base)',  section: 'Economics',  dir: 'higher',     getValue: i => i.year1_base,          format: fmtK },
  { id: 'margin',      label: 'Margin Viable (50% GM)', section: 'Economics',  dir: 'bool_true',  getValue: i => i.margin_viable,       format: v => v ? 'Yes' : 'No' },
  // Founder fit detail
  { id: 'capfit',      label: 'Capital Fit',            section: 'Founder Fit', dir: 'fit_level', getValue: i => i.capital_fit_level,   format: fmtStr },
  { id: 'tlfit',       label: 'Timeline Fit',           section: 'Founder Fit', dir: 'fit_level', getValue: i => i.timeline_fit_level,  format: fmtStr },
]

// Determine numeric rank for comparison (winner detection)
function getNumericRank(dir: Direction, val: number | string | boolean | null): number | null {
  if (val === null || val === undefined) return null
  switch (dir) {
    case 'higher':     return typeof val === 'number' ? val : null
    case 'lower':      return typeof val === 'number' ? -val : null
    case 'bool_true':  return val === true ? 1 : val === false ? 0 : null
    case 'verdict':    return VERDICT_RANK[String(val)] ?? null
    case 'complexity': return COMPLEXITY_RANK[String(val)] ?? null
    case 'fit_level':  return FIT_LEVEL_RANK[String(val)] ?? null
  }
}

function findWinner(dir: Direction, values: (number | string | boolean | null)[]): Set<number> {
  const ranks = values.map(v => getNumericRank(dir, v))
  const validRanks = ranks.filter(r => r !== null) as number[]
  if (validRanks.length < 2) return new Set()  // no winner when only one has data
  const best = Math.max(...validRanks)
  const winners = new Set<number>()
  ranks.forEach((r, i) => { if (r === best) winners.add(i) })
  // No winner if all tied
  if (winners.size === values.length) return new Set()
  return winners
}

// ── Section headers ────────────────────────────────────────────────────────

const SECTION_ORDER = ['Summary', 'Market', 'Competition', 'Gates', 'Economics', 'Founder Fit']

// ── Main component ─────────────────────────────────────────────────────────

function CompareContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const idsParam     = searchParams.get('ids') ?? ''
  const selectedIds  = useMemo(() => idsParam.split(',').filter(Boolean), [idsParam])

  const [historyItems, setHistoryItems]       = useState<HistoryItem[]>([])
  const [thesisOptions, setThesisOptions]     = useState<ThesisOption[]>([])
  const [selectionIds, setSelectionIds]       = useState<Set<string>>(new Set())
  const [historyLoading, setHistoryLoading]   = useState(true)

  const [compItems, setCompItems]             = useState<ComparisonItem[]>([])
  const [compLoading, setCompLoading]         = useState(false)
  const [compError, setCompError]             = useState<string | null>(null)
  const [hasProfile, setHasProfile]           = useState(false)

  const [recommendation, setRecommendation]   = useState<string | null>(null)
  const [recLoading, setRecLoading]           = useState(false)
  const [recError, setRecError]               = useState<string | null>(null)

  // Phase: 'select' if no ids in URL, 'compare' otherwise
  const phase = selectedIds.length >= 2 ? 'compare' : 'select'

  // Load history for selection phase
  useEffect(() => {
    fetch('/api/research/history')
      .then(r => r.json())
      .then(data => {
        const items: HistoryItem[] = (data.items ?? []).filter((i: HistoryItem) => i.thesis_count > 0)
        setHistoryItems(items)
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  // Fetch thesis ids for each history item to build thesis options
  useEffect(() => {
    if (historyItems.length === 0) return
    // Only stage4 items for now (best experience); also show stage3/2 with warning
    const relevant = historyItems.slice(0, 40)

    Promise.all(
      relevant.map(item =>
        fetch(`/api/research/thesis?signal_id=${item.id}`)
          .then(r => r.json())
          .then((data: { theses: Array<{ id: string; product_angle: string }> }) =>
            (data.theses ?? []).map(t => ({
              signal_id:         item.id,
              thesis_id:         t.id,
              label:             t.product_angle,
              query:             item.query,
              status:            item.status,
              opportunity_score: item.opportunity_score,
              created_at:        item.created_at,
            }))
          )
          .catch(() => [] as ThesisOption[])
      )
    ).then(results => setThesisOptions(results.flat()))
  }, [historyItems])

  // Fetch comparison data when ids are in URL
  const loadComparison = useCallback(async (ids: string[]) => {
    if (ids.length < 2) return
    setCompLoading(true)
    setCompError(null)
    setRecommendation(null)
    try {
      const res = await fetch(`/api/research/compare?ids=${ids.join(',')}`)
      const data = await res.json()
      if (!res.ok) { setCompError(data.error ?? 'Failed to load comparison'); return }
      setCompItems(data.items ?? [])
      setHasProfile(data.has_profile ?? false)
    } catch {
      setCompError('Network error — please try again')
    } finally {
      setCompLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'compare') {
      loadComparison(selectedIds)
    }
  }, [phase, selectedIds, loadComparison])

  async function getRecommendation() {
    setRecLoading(true)
    setRecError(null)
    try {
      const res = await fetch('/api/research/compare/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: compItems }),
      })
      const data = await res.json()
      if (!res.ok) { setRecError(data.error ?? 'Failed'); return }
      setRecommendation(data.recommendation)
    } catch {
      setRecError('Network error')
    } finally {
      setRecLoading(false)
    }
  }

  function toggleSelection(thesisId: string) {
    setSelectionIds(prev => {
      const next = new Set(prev)
      if (next.has(thesisId)) next.delete(thesisId)
      else if (next.size < 4) next.add(thesisId)
      return next
    })
  }

  function goCompare() {
    const ids = Array.from(selectionIds)
    router.push(`/research/compare?ids=${ids.join(',')}`)
  }

  // Filtered metrics — hide Founder Fit rows if no profile
  const visibleMetrics = hasProfile
    ? METRICS
    : METRICS.filter(m => m.section !== 'Founder Fit' && m.id !== 'fit')

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="max-w-6xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
            <Link href="/research" className="hover:text-gray-300">Research</Link>
            <span className="text-gray-700">/</span>
            <Link href="/research/history" className="hover:text-gray-300">History</Link>
            <span className="text-gray-700">/</span>
            <span className="text-gray-400">Compare</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparison Mode</h1>
          <p className="text-sm text-gray-400">
            {phase === 'select'
              ? 'Select 2–4 theses to compare side-by-side.'
              : `Comparing ${compItems.length} ${compItems.length === 1 ? 'thesis' : 'theses'} — all metrics are verified, computed data.`
            }
          </p>
        </div>
        {phase === 'compare' && (
          <Link
            href="/research/compare"
            className="text-xs border border-gray-700 rounded-lg px-3 py-2 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            ← New comparison
          </Link>
        )}
      </div>

      {/* ── SELECTION PHASE ──────────────────────────────────────────────── */}
      {phase === 'select' && (
        <div className="space-y-4">
          {/* Floating action bar */}
          {selectionIds.size >= 2 && (
            <div className="sticky top-4 z-10 flex items-center justify-between rounded-xl border border-indigo-700 bg-indigo-950/80 backdrop-blur px-4 py-3">
              <p className="text-sm text-indigo-300">
                {selectionIds.size} selected — up to 4
              </p>
              <button
                onClick={goCompare}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Compare →
              </button>
            </div>
          )}

          {historyLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl border border-gray-800 animate-pulse bg-gray-900/40" />)}
            </div>
          )}

          {!historyLoading && thesisOptions.length === 0 && (
            <div className="rounded-xl border border-gray-800 p-10 text-center space-y-3">
              <p className="text-gray-400 text-sm">No theses found. Run at least 2 market analyses first.</p>
              <Link href="/research" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
                Start an analysis →
              </Link>
            </div>
          )}

          {thesisOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                {thesisOptions.length} theses across {historyItems.length} analyses
              </p>
              {thesisOptions.map(opt => {
                const checked = selectionIds.has(opt.thesis_id)
                const disabled = !checked && selectionIds.size >= 4
                return (
                  <label
                    key={opt.thesis_id}
                    className={`flex items-start gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                      checked   ? 'border-indigo-600 bg-indigo-950/20'
                      : disabled ? 'border-gray-900 opacity-40 cursor-not-allowed'
                      : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => !disabled && toggleSelection(opt.thesis_id)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100 font-medium truncate">{opt.label}</p>
                      <p className="text-xs text-gray-500 truncate">{opt.query}</p>
                    </div>
                    <div className="shrink-0 text-right space-y-0.5">
                      <p className={`text-xs font-mono ${
                        opt.status === 'stage4' ? 'text-green-400'
                        : opt.status === 'stage3' ? 'text-yellow-400'
                        : 'text-gray-500'
                      }`}>
                        {opt.status === 'stage4' ? 'Complete'
                          : opt.status === 'stage3' ? 'S3'
                          : opt.status === 'stage2' ? 'S2'
                          : 'S1'}
                      </p>
                      <p className="text-[10px] text-gray-600">Score {opt.opportunity_score}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COMPARISON PHASE ─────────────────────────────────────────────── */}
      {phase === 'compare' && (
        <div className="space-y-6">
          {compLoading && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 animate-pulse">Loading comparison data…</p>
            </div>
          )}

          {compError && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">{compError}</p>
          )}

          {!compLoading && compItems.length >= 2 && (
            <>
              {/* Thesis headers */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm" style={{ minWidth: `${180 + compItems.length * 200}px` }}>
                  <colgroup>
                    <col style={{ width: 180 }} />
                    {compItems.map((_, i) => <col key={i} style={{ width: 200 }} />)}
                  </colgroup>

                  {/* Column headers */}
                  <thead>
                    <tr className="border-b-2 border-gray-800">
                      <th className="px-3 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                        Metric
                      </th>
                      {compItems.map((item, i) => (
                        <th key={i} className="px-3 py-3 text-left align-top">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-100 leading-tight">{item.product_angle}</p>
                            <p className="text-[10px] text-gray-500 leading-tight truncate">{item.target_customer}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-mono ${
                                item.stage === 'stage4' ? 'text-green-500'
                                : item.stage === 'stage3' ? 'text-yellow-500'
                                : 'text-gray-500'
                              }`}>
                                {item.stage === 'stage4' ? 'Complete' : item.stage === 'stage3' ? 'Stage 3' : 'Stage 2'}
                              </span>
                              <Link
                                href={
                                  item.stage === 'stage4'
                                    ? `/research/${item.signal_id}/memo`
                                    : item.stage === 'stage3'
                                    ? `/research/${item.signal_id}/evaluate`
                                    : `/research/${item.signal_id}`
                                }
                                className="text-[10px] text-indigo-500 hover:text-indigo-300"
                              >
                                Open →
                              </Link>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {SECTION_ORDER.map(section => {
                      const sectionMetrics = visibleMetrics.filter(m => m.section === section)
                      if (sectionMetrics.length === 0) return null
                      return (
                        <React.Fragment key={`section-${section}`}>
                          {/* Section divider */}
                          <tr className="border-t border-gray-800">
                            <td
                              colSpan={compItems.length + 1}
                              className="px-3 py-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-900/40"
                            >
                              {section}
                            </td>
                          </tr>

                          {sectionMetrics.map(metric => {
                            const values = compItems.map(item => metric.getValue(item))
                            const winners = findWinner(metric.dir, values)

                            return (
                              <tr
                                key={metric.id}
                                className="border-b border-gray-900 hover:bg-gray-900/20 transition-colors"
                              >
                                <td className="px-3 py-2.5 text-xs text-gray-500 align-top whitespace-nowrap">
                                  {metric.label}
                                </td>
                                {values.map((val, i) => {
                                  const isWinner = winners.has(i)
                                  const formatted = metric.format(val)
                                  const isVerdict = metric.id === 'verdict'

                                  return (
                                    <td
                                      key={i}
                                      className={`px-3 py-2.5 text-xs align-top transition-colors ${
                                        isWinner ? 'bg-green-950/20' : ''
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        {isWinner && (
                                          <span className="text-green-500 text-[10px] shrink-0" title="Best in class">▲</span>
                                        )}
                                        <span className={`font-mono ${
                                          isVerdict
                                            ? VERDICT_COLOR[String(val)] ?? 'text-gray-400'
                                            : isWinner
                                            ? 'text-green-300 font-semibold'
                                            : formatted === '—'
                                            ? 'text-gray-700'
                                            : 'text-gray-300'
                                        }`}>
                                          {formatted}
                                        </span>
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Winner summary bar */}
              {(() => {
                const winCounts = compItems.map((_, j) =>
                  visibleMetrics.reduce((acc, m) => {
                    const vals = compItems.map(x => m.getValue(x))
                    return acc + (findWinner(m.dir, vals).has(j) ? 1 : 0)
                  }, 0)
                )
                const maxWins = Math.max(...winCounts)
                return (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Best-in-class count</p>
                    <div className="flex gap-4 flex-wrap">
                      {compItems.map((item, i) => (
                        <div key={i} className="text-center min-w-[100px]">
                          <p className="text-[10px] text-gray-500 truncate">{item.product_angle.slice(0, 25)}…</p>
                          <p className={`text-xl font-mono font-bold ${
                            maxWins > 0 && winCounts[i] === maxWins ? 'text-green-400' : 'text-gray-400'
                          }`}>
                            {winCounts[i]}
                          </p>
                          <p className="text-[10px] text-gray-600">of {visibleMetrics.length}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* AI Recommendation */}
              <div className="rounded-xl border border-gray-800 p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">AI Recommendation</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Claude synthesizes the data above — numbers are never modified, only explained.
                    </p>
                  </div>
                  {!recommendation && (
                    <button
                      onClick={getRecommendation}
                      disabled={recLoading}
                      className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                    >
                      {recLoading ? 'Analyzing…' : 'Get Recommendation →'}
                    </button>
                  )}
                </div>

                {recLoading && (
                  <p className="text-xs text-gray-400 animate-pulse">
                    Synthesizing comparison data — comparing {compItems.length} theses…
                  </p>
                )}

                {recError && (
                  <p className="text-xs text-red-400">{recError}</p>
                )}

                {recommendation && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-4">
                      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{recommendation}</p>
                    </div>
                    <button
                      onClick={getRecommendation}
                      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </main>
    }>
      <CompareContent />
    </Suspense>
  )
}
