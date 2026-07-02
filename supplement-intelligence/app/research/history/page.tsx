'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
const STATUS_COLOR: Record<string, string> = {
  blocked: 'bg-red-950/40 text-red-400 border-red-900',
  stage1:  'bg-gray-900 text-gray-500 border-gray-700',
  stage2:  'bg-blue-950/30 text-blue-400 border-blue-900',
  stage3:  'bg-yellow-950/30 text-yellow-400 border-yellow-900',
  stage4:  'bg-green-950/30 text-green-400 border-green-900',
}

const VERDICT_COLOR: Record<string, string> = {
  PURSUE:               'text-green-400',
  PURSUE_WITH_CAUTION:  'text-yellow-400',
  INVESTIGATE_FURTHER:  'text-blue-400',
  DO_NOT_PURSUE:        'text-red-400',
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400'
  if (score >= 45) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-950/40 border-green-900'
  if (score >= 45) return 'bg-yellow-950/40 border-yellow-900'
  return 'bg-red-950/30 border-red-900'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function categoryLabel(id: string): string {
  if (!id) return 'Unknown'
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ')
}

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
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
            <Link href="/research" className="hover:text-gray-300 transition-colors">Research</Link>
            <span className="text-gray-700">/</span>
            <span className="text-gray-400">History</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Research History</h1>
          <p className="text-sm text-gray-400">
            {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'analysis' : 'analyses'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/research/compare"
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Compare →
          </Link>
          <Link
            href="/research"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
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
            className="flex-1 min-w-48 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
                filter === f
                  ? 'border-indigo-600 bg-indigo-950/50 text-indigo-300'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'all' ? 'All' : f === 'favorited' ? '★ Favorites' : f === 'complete' ? 'Stage 4 Complete' : 'Blocked'}
            </button>
          ))}
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat === filter ? 'all' : cat)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filter === cat
                  ? 'border-indigo-600 bg-indigo-950/50 text-indigo-300'
                  : 'border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400'
              }`}
            >
              {categoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-gray-800 p-5 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-800/60 rounded w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && displayed.length === 0 && (
        <div className="rounded-xl border border-gray-800 p-12 text-center space-y-3">
          <p className="text-gray-400 text-sm">
            {items.length === 0
              ? 'No analyses yet — run your first market signal to get started.'
              : 'No results match your current filters.'}
          </p>
          {items.length === 0 && (
            <Link
              href="/research"
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
            >
              Start an analysis →
            </Link>
          )}
          {items.length > 0 && (
            <button
              onClick={() => { setSearch(''); setFilter('all') }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Item list */}
      {!loading && displayed.length > 0 && (
        <div className="space-y-2">
          {displayed.map(item => (
            <div
              key={item.id}
              className={`rounded-xl border bg-gray-950 transition-colors ${
                item.is_favorited ? 'border-yellow-900/50' : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                {/* Favorite star */}
                <button
                  onClick={() => toggleFavorite(item)}
                  disabled={actioning === item.id}
                  className={`shrink-0 mt-0.5 text-lg leading-none transition-colors disabled:opacity-40 ${
                    item.is_favorited ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-700 hover:text-yellow-600'
                  }`}
                  title={item.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {item.is_favorited ? '★' : '☆'}
                </button>

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-gray-100 truncate">{item.query}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                          {categoryLabel(item.category_id)}
                        </span>
                        <span className="text-gray-700">·</span>
                        <span className="text-[10px] text-gray-600">{formatDate(item.created_at)}</span>
                      </div>
                    </div>

                    {/* Score + Verdict */}
                    <div className="flex items-center gap-3 shrink-0 flex-wrap">
                      {item.status !== 'blocked' && (
                        <div className={`rounded-lg border px-2.5 py-1 text-center min-w-[52px] ${scoreBg(item.opportunity_score)}`}>
                          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Score</p>
                          <p className={`text-base font-mono font-bold leading-tight ${scoreColor(item.opportunity_score)}`}>
                            {item.opportunity_score}
                          </p>
                        </div>
                      )}

                      {item.verdict_code && (
                        <span className={`text-xs font-mono ${VERDICT_COLOR[item.verdict_code] ?? 'text-gray-400'}`}>
                          {item.verdict_code.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage progress + quality */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_COLOR[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className={`text-[10px] font-mono ${
                      item.quality_grade === 'sufficient' ? 'text-green-600'
                      : item.quality_grade === 'thin' ? 'text-yellow-600'
                      : 'text-red-600'
                    }`}>
                      {item.quality_grade.toUpperCase()}
                    </span>
                    {/* Stage dots */}
                    <div className="flex items-center gap-1 ml-1">
                      {(['S1','S2','S3','S4'] as const).map((s, i) => {
                        const filled = (
                          (i === 0 && !item.pipeline_blocked) ||
                          (i === 1 && item.thesis_count > 0) ||
                          (i === 2 && item.has_debates) ||
                          (i === 3 && item.has_memo)
                        )
                        return (
                          <span
                            key={s}
                            className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                              filled ? 'text-indigo-300 bg-indigo-950/50' : 'text-gray-700 bg-gray-900'
                            }`}
                          >
                            {s}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {item.blocked_reason && (
                    <p className="text-[10px] text-red-500">{item.blocked_reason}</p>
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="border-t border-gray-800/50 px-4 py-2 flex items-center gap-1">
                <Link
                  href={openItem(item)}
                  className="rounded px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 transition-colors mr-2"
                >
                  Open →
                </Link>

                {/* Stage links */}
                {!item.pipeline_blocked && (
                  <Link href={`/research/${item.id}`} className="rounded px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
                    S1
                  </Link>
                )}
                {item.thesis_count > 0 && (
                  <Link href={`/research/${item.id}/opportunity`} className="rounded px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
                    S2
                  </Link>
                )}
                {item.has_debates && (
                  <Link href={`/research/${item.id}/evaluate`} className="rounded px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
                    S3
                  </Link>
                )}
                {item.has_memo && (
                  <Link href={`/research/${item.id}/memo`} className="rounded px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
                    S4
                  </Link>
                )}

                <div className="flex-1" />

                {/* Duplicate */}
                <button
                  onClick={() => duplicateItem(item.query)}
                  className="rounded px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  title="Re-run analysis"
                >
                  Duplicate
                </button>

                {/* Delete */}
                {deleting === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-400">Delete?</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      disabled={actioning === item.id}
                      className="rounded px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors disabled:opacity-40"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      className="rounded px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleting(item.id)}
                    className="rounded px-2.5 py-1.5 text-[10px] text-gray-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                    title="Delete analysis"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom count */}
      {!loading && displayed.length > 0 && (
        <p className="text-xs text-center text-gray-700">
          Showing {displayed.length} of {items.length}
        </p>
      )}
    </main>
  )
}
