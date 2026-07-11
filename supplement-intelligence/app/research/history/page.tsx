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
  blocked: 'bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]',
  stage1:  'bg-[#f3f3f3] text-[#7e7576] border-black',
  stage2:  'bg-white text-black border-black',
  stage3:  'bg-[#fdf6e3] text-[#a67c00] border-[#a67c00]',
  stage4:  'bg-[#e6f4e6] text-[#008a00] border-[#008a00]',
}

const VERDICT_COLOR: Record<string, string> = {
  PURSUE:               'text-[#008a00]',
  PURSUE_WITH_CAUTION:  'text-[#a67c00]',
  INVESTIGATE_FURTHER:  'text-black',
  DO_NOT_PURSUE:        'text-[#d32f2f]',
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-[#008a00]'
  if (score >= 45) return 'text-[#a67c00]'
  return 'text-[#d32f2f]'
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-[#e6f4e6] border-[#008a00]'
  if (score >= 45) return 'bg-[#fdf6e3] border-[#a67c00]'
  return 'bg-[#ffdad6] border-[#d32f2f]'
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
    <div className="min-h-screen w-full font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs font-mono uppercase text-[#7e7576] mb-2">
            <Link href="/research" className="hover:text-black transition-colors">Research</Link>
            <span className="text-[#cfc4c5]">/</span>
            <span className="text-[#4c4546]">History</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-black">Research History</h1>
          <p className="text-sm text-[#4c4546]">
            {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'analysis' : 'analyses'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/research/compare"
            className="bg-white border border-black px-3 py-2 text-sm text-black hover:bg-[#f3f3f3] transition-colors"
          >
            Compare →
          </Link>
          <Link
            href="/research"
            className="bg-black text-white font-black uppercase tracking-wide border-2 border-black px-4 py-2 text-sm hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98]"
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
            className="flex-1 min-w-48 border border-black bg-white px-4 py-2 text-sm text-black placeholder:text-[#7e7576] focus:outline-none focus:ring-2 focus:ring-black"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="border border-black bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
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
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wide border transition-colors ${
                filter === f
                  ? 'border-2 border-black bg-black text-white'
                  : 'border-black text-[#7e7576] hover:bg-[#f3f3f3] hover:text-black'
              }`}
            >
              {f === 'all' ? 'All' : f === 'favorited' ? '★ Favorites' : f === 'complete' ? 'Stage 4 Complete' : 'Blocked'}
            </button>
          ))}
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat === filter ? 'all' : cat)}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wide border transition-colors ${
                filter === cat
                  ? 'border-2 border-black bg-black text-white'
                  : 'border-black text-[#7e7576] hover:bg-[#f3f3f3] hover:text-black'
              }`}
            >
              {categoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-[#93000a] bg-[#ffdad6] border border-[#ba1a1a] px-3 py-2">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-black bg-white p-5 animate-pulse">
              <div className="h-4 bg-[#e0dede] w-48 mb-2" />
              <div className="h-3 bg-[#e0dede] w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && displayed.length === 0 && (
        <div className="border border-black bg-white p-12 text-center space-y-3">
          <p className="text-[#4c4546] text-sm">
            {items.length === 0
              ? 'No analyses yet — run your first market signal to get started.'
              : 'No results match your current filters.'}
          </p>
          {items.length === 0 && (
            <Link
              href="/research"
              className="inline-block bg-black text-white font-black uppercase tracking-wide border-2 border-black px-4 py-2 text-sm hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98]"
            >
              Start an analysis →
            </Link>
          )}
          {items.length > 0 && (
            <button
              onClick={() => { setSearch(''); setFilter('all') }}
              className="text-xs font-mono uppercase tracking-wide text-black underline hover:text-[#4c4546]"
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
              className={`border bg-white transition-colors ${
                item.is_favorited ? 'border-2 border-[#a67c00]' : 'border-black hover:bg-[#f9f9f9]'
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                {/* Favorite star */}
                <button
                  onClick={() => toggleFavorite(item)}
                  disabled={actioning === item.id}
                  className={`shrink-0 mt-0.5 text-lg leading-none transition-colors disabled:opacity-40 ${
                    item.is_favorited ? 'text-[#a67c00] hover:text-black' : 'text-[#cfc4c5] hover:text-[#a67c00]'
                  }`}
                  title={item.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {item.is_favorited ? '★' : '☆'}
                </button>

                {/* Main content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-black truncate">{item.query}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wide">
                          {categoryLabel(item.category_id)}
                        </span>
                        <span className="text-[#cfc4c5]">·</span>
                        <span className="text-[10px] font-mono text-[#7e7576]">{formatDate(item.created_at)}</span>
                      </div>
                    </div>

                    {/* Score + Verdict */}
                    <div className="flex items-center gap-3 shrink-0 flex-wrap">
                      {item.status !== 'blocked' && (
                        <div className={`border-2 px-2.5 py-1 text-center min-w-[52px] ${scoreBg(item.opportunity_score)}`}>
                          <p className="text-[9px] font-mono text-[#7e7576] uppercase tracking-wider">Score</p>
                          <p className={`text-base font-mono font-bold leading-tight ${scoreColor(item.opportunity_score)}`}>
                            {item.opportunity_score}
                          </p>
                        </div>
                      )}

                      {item.verdict_code && (
                        <span className={`text-xs font-mono ${VERDICT_COLOR[item.verdict_code] ?? 'text-[#7e7576]'}`}>
                          {item.verdict_code.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage progress + quality */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 border ${STATUS_COLOR[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className={`text-[10px] font-mono ${
                      item.quality_grade === 'sufficient' ? 'text-[#008a00]'
                      : item.quality_grade === 'thin' ? 'text-[#a67c00]'
                      : 'text-[#d32f2f]'
                    }`}>
                      {item.quality_grade.toUpperCase()}
                    </span>
                    {/* Stage dots */}
                    <div className="flex items-center gap-1 ml-1">
                      {(['S1','S2','S3','S4'] as const).map((s, i) => {
                        const filled = (
                          (i === 0) ||  // S1 always complete — signal exists in DB
                          (i === 1 && item.thesis_count > 0) ||
                          (i === 2 && item.has_debates) ||
                          (i === 3 && item.has_memo)
                        )
                        return (
                          <span
                            key={s}
                            className={`text-[9px] font-mono px-1 py-0.5 border border-black ${
                              filled ? 'text-white bg-black' : 'text-[#7e7576] bg-white'
                            }`}
                          >
                            {s}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {item.blocked_reason && (
                    <p className="text-[10px] text-[#d32f2f]">{item.blocked_reason}</p>
                  )}
                </div>
              </div>

              {/* Action row */}
              <div className="border-t border-black px-4 py-2 flex items-center gap-1">
                <Link
                  href={openItem(item)}
                  className="bg-black text-white font-black uppercase tracking-wide border border-black px-3 py-1.5 text-xs hover:bg-white hover:text-black transition-colors duration-200 mr-2"
                >
                  Open →
                </Link>

                {/* Stage links */}
                {!item.pipeline_blocked && (
                  <Link href={`/research/${item.id}`} className="px-2.5 py-1.5 text-[10px] font-mono text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                    S1
                  </Link>
                )}
                {item.thesis_count > 0 && (
                  <Link href={`/research/${item.id}/opportunity`} className="px-2.5 py-1.5 text-[10px] font-mono text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                    S2
                  </Link>
                )}
                {item.has_debates && (
                  <Link href={`/research/${item.id}/evaluate`} className="px-2.5 py-1.5 text-[10px] font-mono text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                    S3
                  </Link>
                )}
                {item.has_memo && (
                  <Link href={`/research/${item.id}/memo`} className="px-2.5 py-1.5 text-[10px] font-mono text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors">
                    S4
                  </Link>
                )}

                <div className="flex-1" />

                {/* Duplicate */}
                <button
                  onClick={() => duplicateItem(item.query)}
                  className="px-2.5 py-1.5 text-[10px] font-mono text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors"
                  title="Re-run analysis"
                >
                  Duplicate
                </button>

                {/* Delete */}
                {deleting === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#d32f2f]">Delete?</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      disabled={actioning === item.id}
                      className="px-2 py-1 text-[10px] text-[#d32f2f] hover:text-[#93000a] hover:bg-[#ffdad6] transition-colors disabled:opacity-40"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      className="px-2 py-1 text-[10px] text-[#7e7576] hover:text-black hover:bg-[#f3f3f3] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleting(item.id)}
                    className="px-2.5 py-1.5 text-[10px] text-[#7e7576] hover:text-[#d32f2f] hover:bg-[#ffdad6] transition-colors"
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
        <p className="text-xs text-center text-[#7e7576] font-mono">
          Showing {displayed.length} of {items.length}
        </p>
      )}
    </main>
    </div>
  )
}
