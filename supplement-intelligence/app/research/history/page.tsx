'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { LedgerTable, VerdictBadge, WitnessDots, PrimaryLinkButton, SecondaryLinkButton, HardShadowSearchInput, type LedgerColumn } from '@/components/ui'
import type { MarketVerdictCode } from '@/lib/stage4/verdict'

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
  blocked: 'text-verdict-negative border-verdict-negative',
  stage1:  'text-outline border-black',
  stage2:  'text-black border-black',
  stage3:  'text-verdict-caution-text border-verdict-caution-text',
  stage4:  'text-verdict-positive border-verdict-positive',
}

// quality_grade only ever has 3 real levels — map to a 3-dot confidence readout
const QUALITY_DOTS: Record<string, number> = { sufficient: 3, thin: 2, insufficient: 1 }

function scoreColor(score: number): string {
  if (score >= 70) return 'text-verdict-positive'
  if (score >= 45) return 'text-verdict-caution-text'
  return 'text-verdict-negative'
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

  const columns: LedgerColumn<HistoryItem>[] = [
    {
      key: 'favorite', header: '', align: 'left',
      render: item => (
        <button
          onClick={() => toggleFavorite(item)}
          disabled={actioning === item.id}
          className={`text-base leading-none transition-colors disabled:opacity-40 ${
            item.is_favorited ? 'text-verdict-caution-text hover:text-black' : 'text-outline-variant hover:text-verdict-caution-text'
          }`}
          title={item.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          {item.is_favorited ? '★' : '☆'}
        </button>
      ),
    },
    {
      key: 'market', header: 'Market',
      render: item => (
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-bold text-black truncate max-w-[220px]">{item.query}</p>
          <p className="text-[10px] font-mono text-outline uppercase tracking-wide">{categoryLabel(item.category_id)}</p>
          {item.blocked_reason && <p className="text-[10px] text-verdict-negative">{item.blocked_reason}</p>}
        </div>
      ),
    },
    {
      key: 'date', header: 'Date', hideOnMobile: true,
      render: item => <span className="text-xs font-mono text-outline whitespace-nowrap">{formatDate(item.created_at)}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: item => (
        <span className={`text-[10px] px-2 py-0.5 border font-mono uppercase whitespace-nowrap ${STATUS_COLOR[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      ),
    },
    {
      key: 'verdict', header: 'Verdict', hideOnMobile: true,
      render: item => item.verdict_code
        ? <VerdictBadge scheme="market-verdict" verdict={item.verdict_code as MarketVerdictCode} size="sm" />
        : <span className="text-xs text-outline-variant">—</span>,
    },
    {
      key: 'score', header: 'Score', align: 'right',
      render: item => item.status !== 'blocked'
        ? <span className={`text-sm font-mono font-bold ${scoreColor(item.opportunity_score)}`}>{item.opportunity_score}</span>
        : <span className="text-xs text-outline-variant">—</span>,
    },
    {
      key: 'confidence', header: 'Confidence', hideOnMobile: true,
      render: item => <WitnessDots filled={QUALITY_DOTS[item.quality_grade] ?? 0} total={3} size="sm" label={`${item.quality_grade} data quality`} />,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      render: item => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <Link
            href={openItem(item)}
            className="bg-black text-white font-black uppercase tracking-wide border border-black px-2.5 py-1 text-[10px] hover:bg-white hover:text-black transition-colors duration-150"
          >
            Open →
          </Link>
          <button
            onClick={() => duplicateItem(item.query)}
            className="px-2 py-1 text-[10px] font-mono text-outline hover:text-black hover:bg-surface-container-low transition-colors"
            title="Re-run analysis"
          >
            Duplicate
          </button>
          {deleting === item.id ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-verdict-negative">Delete?</span>
              <button
                onClick={() => deleteItem(item.id)}
                disabled={actioning === item.id}
                className="px-1.5 py-1 text-[10px] text-verdict-negative hover:bg-verdict-negative/10 transition-colors disabled:opacity-40"
              >
                Yes
              </button>
              <button
                onClick={() => setDeleting(null)}
                className="px-1.5 py-1 text-[10px] text-outline hover:text-black hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setDeleting(item.id)}
              className="px-2 py-1 text-[10px] text-outline hover:text-verdict-negative transition-colors"
              title="Delete analysis"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <AppShell active="history">
      <div className="max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b-2 border-black pb-4">
          <div className="space-y-1">
            <h1 className="text-headline-md text-black">Research History</h1>
            <p className="text-sm text-ink-variant">
              {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'analysis' : 'analyses'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SecondaryLinkButton href="/research/compare">Compare →</SecondaryLinkButton>
            <PrimaryLinkButton href="/research">+ New Analysis</PrimaryLinkButton>
          </div>
        </div>

        {/* Search + Sort + Filter bar */}
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <HardShadowSearchInput
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by product or category…"
              className="flex-1 min-w-48"
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
                    : 'border-black text-outline hover:bg-surface-container-low hover:text-black'
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
                    : 'border-black text-outline hover:bg-surface-container-low hover:text-black'
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-black bg-white p-5 animate-pulse">
                <div className="h-4 bg-surface-container w-48 mb-2" />
                <div className="h-3 bg-surface-container w-24" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayed.length === 0 && (
          <div className="border border-black bg-white p-12 text-center space-y-3">
            <p className="text-ink-variant text-sm">
              {items.length === 0
                ? 'No analyses yet — run your first market signal to get started.'
                : 'No results match your current filters.'}
            </p>
            {items.length === 0 && (
              <PrimaryLinkButton href="/research">Start an analysis →</PrimaryLinkButton>
            )}
            {items.length > 0 && (
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="text-xs font-mono uppercase tracking-wide text-black underline hover:text-ink-variant"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Ledger table */}
        {!loading && displayed.length > 0 && (
          <LedgerTable columns={columns} rows={displayed} />
        )}

        {/* Bottom count */}
        {!loading && displayed.length > 0 && (
          <p className="text-xs text-center text-outline font-mono">
            Showing {displayed.length} of {items.length}
          </p>
        )}
      </div>
    </AppShell>
  )
}
