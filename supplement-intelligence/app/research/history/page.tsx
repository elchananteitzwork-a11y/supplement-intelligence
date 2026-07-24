'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import type { MarketVerdictCode } from '@/lib/stage4/verdict'

// Research History — re-skinned to the pi-* warm-cream system (owner
// request 2026-07-24: "the colors there are black and white, it's not our
// new design language"). Visual pass ONLY: every behavior is byte-
// identical to the prior neo-brutalist version — same /api/research/
// history fetch, same optimistic favorite toggle, same delete-confirm
// flow, same duplicate → /research?q= handoff, same per-stage openItem()
// routing, same filters/sort. The legacy components/ui pieces (LedgerTable,
// HardShadowSearchInput, VerdictBadge, WitnessDots) are replaced with
// pi-token markup in place; AppShell keeps navigation via its existing
// `variant="pi"` (same opt-in the billing page already uses).

interface HistoryItem {
  id: string
  query: string
  category_id: string
  quality_grade: string
  pipeline_blocked: boolean
  blocked_reason: string | null
  created_at: string
  status: 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'blocked'
  thesis_count: number
  has_debates: boolean
  has_memo: boolean
  verdict_code: string | null
  verdict_headline: string | null
  opportunity_score: number
  is_favorited: boolean
}

type SortKey = 'newest' | 'oldest' | 'score' | 'alpha'
type FilterKey = 'all' | 'favorited' | 'complete' | 'blocked' | string

const STATUS_LABEL: Record<string, string> = {
  blocked: 'Blocked',
  stage1:  'Stage 1',
  stage2:  'Stage 2',
  stage3:  'Stage 3',
  stage4:  'Complete',
}
// Same real status semantics, pi tokens instead of black/white.
const STATUS_DOT: Record<string, string> = {
  blocked: 'bg-pi-risk',
  stage1:  'bg-pi-faint',
  stage2:  'bg-pi-sub',
  stage3:  'bg-pi-gold-bright',
  stage4:  'bg-pi-build',
}
const STATUS_TEXT: Record<string, string> = {
  blocked: 'text-pi-risk',
  stage1:  'text-pi-faint',
  stage2:  'text-pi-sub',
  stage3:  'text-pi-gold',
  stage4:  'text-pi-build',
}

// MARKET_VERDICT_CFG (components/ui/VerdictBadge.tsx) restated with pi
// tones — same labels, same 4 real codes, no reinterpretation.
const VERDICT_CFG: Record<MarketVerdictCode, { label: string; dot: string; text: string }> = {
  PURSUE:              { label: 'Pursue',              dot: 'bg-pi-build',       text: 'text-pi-build' },
  PURSUE_WITH_CAUTION: { label: 'Pursue with Caution', dot: 'bg-pi-gold-bright', text: 'text-pi-gold' },
  INVESTIGATE_FURTHER: { label: 'Investigate Further', dot: 'bg-pi-invest',      text: 'text-pi-invest' },
  DO_NOT_PURSUE:       { label: 'Do Not Pursue',       dot: 'bg-pi-risk',        text: 'text-pi-risk' },
}

// quality_grade only ever has 3 real levels — map to a 3-dot confidence readout
const QUALITY_DOTS: Record<string, number> = { sufficient: 3, thin: 2, insufficient: 1 }

function scoreColor(score: number): string {
  if (score >= 70) return 'text-pi-build'
  if (score >= 45) return 'text-pi-gold'
  return 'text-pi-risk'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function categoryLabel(id: string): string {
  if (!id) return 'Unknown'
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ')
}

const chipCls = (selected: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-xs transition-all duration-200 ${
    selected
      ? 'border-pi-ink bg-pi-ink text-pi-cream shadow-[0_2px_6px_-2px_rgba(22,23,26,0.3)]'
      : 'border-pi-hairline bg-pi-card text-pi-sub shadow-[0_1px_2px_rgba(22,23,26,0.03)] hover:-translate-y-px hover:border-pi-ink/25 hover:text-pi-ink'
  }`

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems]         = useState<HistoryItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [sort, setSort]           = useState<SortKey>('newest')
  const [filter, setFilter]       = useState<FilterKey>('all')
  const [deleting, setDeleting]   = useState<string | null>(null)  // id being confirmed
  const [actioning, setActioning] = useState<string | null>(null)  // id being mutated

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/research/history')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load history'); return }
      setItems(data.items ?? [])
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category_id).filter(Boolean))
    return Array.from(cats).sort()
  }, [items])

  // Filtered + sorted list
  const displayed = useMemo(() => {
    let list = items.slice()

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.query.toLowerCase().includes(q) ||
        i.category_id.toLowerCase().includes(q)
      )
    }

    // Status / category filter
    if (filter === 'favorited')  list = list.filter(i => i.is_favorited)
    else if (filter === 'complete') list = list.filter(i => i.status === 'stage4')
    else if (filter === 'blocked')  list = list.filter(i => i.status === 'blocked')
    else if (filter !== 'all')      list = list.filter(i => i.category_id === filter)

    // Sort
    if (sort === 'newest') list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    else if (sort === 'oldest') list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    else if (sort === 'score') list.sort((a, b) => b.opportunity_score - a.opportunity_score)
    else if (sort === 'alpha') list.sort((a, b) => a.query.localeCompare(b.query))

    return list
  }, [items, search, filter, sort])

  async function toggleFavorite(item: HistoryItem) {
    const newVal = !item.is_favorited
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorited: newVal } : i))
    setActioning(item.id)
    try {
      const res = await fetch('/api/research/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, favorited: newVal }),
      })
      if (!res.ok) {
        // Revert on failure
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorited: item.is_favorited } : i))
      }
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorited: item.is_favorited } : i))
    } finally {
      setActioning(null)
    }
  }

  async function deleteItem(id: string) {
    setActioning(id)
    setDeleting(null)
    try {
      const res = await fetch(`/api/research/history?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
      }
    } catch {
      // silent — reload will show the item again
    } finally {
      setActioning(null)
    }
  }

  function duplicateItem(query: string) {
    router.push(`/research?q=${encodeURIComponent(query)}`)
  }

  function openItem(item: HistoryItem): string {
    if (item.status === 'stage4') return `/research/${item.id}/memo`
    if (item.status === 'stage3') return `/research/${item.id}/evaluate`
    if (item.status === 'stage2') return `/research/${item.id}/opportunity`
    return `/research/${item.id}`
  }

  return (
    <AppShell active="history" variant="pi">
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap border-b border-pi-hairline pb-5">
          <div className="space-y-1">
            <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">Research History</h1>
            <p className="text-sm text-pi-sub">
              {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'analysis' : 'analyses'}`}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/research/compare"
              className="rounded-xl border border-pi-hairline bg-pi-card px-4 py-2.5 text-sm font-medium text-pi-ink shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_4px_10px_-2px_rgba(22,23,26,0.1)]"
            >
              Compare →
            </Link>
            <Link
              href="/research"
              className="rounded-xl bg-pi-ink px-4 py-2.5 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_8px_20px_-6px_rgba(22,23,26,0.4)]"
            >
              + New Analysis
            </Link>
          </div>
        </div>

        {/* Search + Sort + Filter bar */}
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by product or category…"
              className="min-w-48 flex-1 rounded-xl border border-pi-hairline bg-pi-card px-4 py-2.5 text-sm text-pi-ink shadow-[0_1px_2px_rgba(22,23,26,0.04)] placeholder:text-pi-faint focus:outline-none focus:ring-2 focus:ring-pi-gold-bright"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="rounded-xl border border-pi-hairline bg-pi-card px-3 py-2.5 text-sm text-pi-ink shadow-[0_1px_2px_rgba(22,23,26,0.04)] focus:outline-none focus:ring-2 focus:ring-pi-gold-bright"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="score">Highest score</option>
              <option value="alpha">A–Z</option>
            </select>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'favorited', 'complete', 'blocked'] as FilterKey[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={chipCls(filter === f)}>
                {f === 'all' ? 'All' : f === 'favorited' ? '★ Favorites' : f === 'complete' ? 'Complete' : 'Blocked'}
              </button>
            ))}
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilter(cat === filter ? 'all' : cat)} className={chipCls(filter === cat)}>
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-xl border border-pi-risk/30 bg-pi-risk/10 px-4 py-3 text-sm text-pi-risk">{error}</p>
        )}

        {/* Loading skeleton */}
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

        {/* Empty state */}
        {!loading && displayed.length === 0 && (
          <div className="space-y-4 rounded-2xl border border-pi-hairline bg-pi-card p-12 text-center shadow-[0_1px_3px_rgba(22,23,26,0.05)]">
            <p className="text-sm text-pi-sub">
              {items.length === 0
                ? 'No analyses yet — run your first market signal to get started.'
                : 'No results match your current filters.'}
            </p>
            {items.length === 0 && (
              <Link
                href="/research"
                className="inline-block rounded-xl bg-pi-ink px-5 py-2.5 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B]"
              >
                Start an analysis →
              </Link>
            )}
            {items.length > 0 && (
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="text-xs text-pi-gold underline decoration-pi-gold-deep/30 underline-offset-2 hover:text-pi-ink"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Ledger rows */}
        {!loading && displayed.length > 0 && (
          <ul className="space-y-2.5">
            {displayed.map(item => {
              const verdict = item.verdict_code ? VERDICT_CFG[item.verdict_code as MarketVerdictCode] : null
              const qualityFilled = QUALITY_DOTS[item.quality_grade] ?? 0
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-shadow hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.1)] sm:px-5"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleFavorite(item)}
                      disabled={actioning === item.id}
                      className={`mt-0.5 text-base leading-none transition-colors disabled:opacity-40 ${
                        item.is_favorited ? 'text-pi-gold-bright hover:text-pi-ink' : 'text-pi-faint/60 hover:text-pi-gold-bright'
                      }`}
                      title={item.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {item.is_favorited ? '★' : '☆'}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="truncate text-sm font-semibold text-pi-ink">{item.query}</p>
                        <span className="font-mono text-[10px] uppercase tracking-wide text-pi-faint">{categoryLabel(item.category_id)}</span>
                        <span className="hidden font-mono text-[10px] tabular-nums text-pi-faint sm:inline">{formatDate(item.created_at)}</span>
                      </div>
                      {item.blocked_reason && <p className="mt-0.5 text-[11px] text-pi-risk">{item.blocked_reason}</p>}

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_TEXT[item.status]}`}>
                          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
                          {STATUS_LABEL[item.status]}
                        </span>
                        {verdict && (
                          <span className={`hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide sm:flex ${verdict.text}`}>
                            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${verdict.dot}`} />
                            {verdict.label}
                          </span>
                        )}
                        <span
                          aria-hidden
                          className="hidden items-center gap-1 sm:flex"
                          title={`${item.quality_grade} data quality`}
                        >
                          {[1, 2, 3].map(n => (
                            <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= qualityFilled ? 'bg-pi-ink' : 'border border-pi-hairline bg-pi-card'}`} />
                          ))}
                        </span>
                      </div>
                    </div>

                    {item.status !== 'blocked' && (
                      <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${scoreColor(item.opportunity_score)}`}>
                        {item.opportunity_score}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-pi-hairline pt-2.5">
                    <Link
                      href={openItem(item)}
                      className="rounded-lg bg-pi-ink px-3 py-1.5 text-[11px] font-semibold text-pi-cream transition-colors hover:bg-[#24262B]"
                    >
                      Open →
                    </Link>
                    <button
                      onClick={() => duplicateItem(item.query)}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] text-pi-sub transition-colors hover:bg-pi-sand hover:text-pi-ink"
                      title="Re-run analysis"
                    >
                      Duplicate
                    </button>
                    {deleting === item.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-[11px] text-pi-risk">Delete?</span>
                        <button
                          onClick={() => deleteItem(item.id)}
                          disabled={actioning === item.id}
                          className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-pi-risk transition-colors hover:bg-pi-risk/10 disabled:opacity-40"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleting(null)}
                          className="rounded-lg px-2 py-1.5 text-[11px] text-pi-sub transition-colors hover:bg-pi-sand hover:text-pi-ink"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleting(item.id)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-pi-sub transition-colors hover:bg-pi-risk/10 hover:text-pi-risk"
                        title="Delete analysis"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Bottom count */}
        {!loading && displayed.length > 0 && (
          <p className="text-center font-mono text-xs text-pi-faint">
            Showing {displayed.length} of {items.length}
          </p>
        )}
      </div>
    </AppShell>
  )
}
