'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { LedgerTable, WitnessDots, type LedgerColumn } from '@/components/ui'
import type { MarketVerdictCode } from '@/lib/stage4/verdict'

// Terminal Noir port (2026-07-23) — presentation-only re-skin of this real
// history list onto the dark register. No fetch/filter/sort/favorite/
// delete/duplicate logic changed; every field read is byte-identical to
// before.
//
// This page was still on the original 'legacy' (black/white, border-black)
// shell, not the pi-cream register most other routes already migrated to
// (see components/shell/SideNav.tsx's own comment: "only /research/history
// ... still genuinely 'legacy'") — so this pass goes straight from
// legacy -> pi-noir, matching the same real dark tokens the rest of this
// rollout uses (design-prototypes/candidate-detail-noir.html's vocabulary),
// rather than porting to the intermediate cream skin first.
//
// components/ui/VerdictBadge.tsx and the PrimaryButton/SecondaryButton/
// HardShadowSearchInput family have no pi/pi-noir variant mechanism at all
// (VerdictBadge is keyed by `scheme`, not a display variant; the buttons
// are permanently black/white per design-system.md's neo-brutalist spec)
// and are still used by other out-of-scope legacy screens — same
// resolution app/watchlist/page.tsx already uses for the identical
// problem: local, hand-rolled pi-noir markup in this file instead of
// editing those shared components. LedgerTable and WitnessDots DO already
// have a real `variant="pi-noir"` (shipped by the parallel Watchlist/
// Alerts/Track Record/Settings port) and are used as-is here, unmodified.
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
  blocked: 'text-pi-risk-noir border-pi-risk-noir/40',
  stage1:  'text-pi-noir-sub border-pi-noir-hairline',
  stage2:  'text-pi-noir-text border-pi-noir-hairline',
  stage3:  'text-pi-gold-deep border-pi-gold-deep/40',
  stage4:  'text-pi-build-noir border-pi-build-noir/40',
}

// quality_grade only ever has 3 real levels — map to a 3-dot confidence readout
const QUALITY_DOTS: Record<string, number> = { sufficient: 3, thin: 2, insufficient: 1 }

// Local, noir-safe pill for MarketVerdictCode — same real label vocabulary
// components/ui/VerdictBadge.tsx's MARKET_VERDICT_CFG uses, re-tuned onto
// dark-safe tokens (VerdictBadge itself has no display-variant mechanism —
// see this file's header comment for why it's inlined here rather than
// edited, same resolution app/watchlist/page.tsx already established).
const NOIR_MARKET_VERDICT_CFG: Record<MarketVerdictCode, { label: string; cls: string }> = {
  PURSUE:              { label: 'Pursue',               cls: 'text-pi-build-noir border-pi-build-noir/30 bg-pi-build-noir/10' },
  PURSUE_WITH_CAUTION: { label: 'Pursue with Caution',  cls: 'text-pi-gold-deep border-pi-gold-deep/30 bg-pi-gold-deep/10' },
  INVESTIGATE_FURTHER: { label: 'Investigate Further',  cls: 'text-pi-gold-deep border-pi-gold-deep/30 bg-pi-gold-deep/10' },
  DO_NOT_PURSUE:        { label: 'Do Not Pursue',        cls: 'text-pi-risk-noir border-pi-risk-noir/30 bg-pi-risk-noir/10' },
}
function NoirVerdictPill({ verdict }: { verdict: MarketVerdictCode }) {
  const cfg = NOIR_MARKET_VERDICT_CFG[verdict]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-pi-build-noir'
  if (score >= 45) return 'text-pi-gold-deep'
  return 'text-pi-risk-noir'
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
            item.is_favorited ? 'text-pi-gold-deep hover:text-pi-noir-text' : 'text-pi-noir-sub hover:text-pi-gold-deep'
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
          <p className="text-sm font-bold text-pi-noir-text truncate max-w-[220px]">{item.query}</p>
          <p className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-wide">{categoryLabel(item.category_id)}</p>
          {item.blocked_reason && <p className="text-[10px] text-pi-risk-noir">{item.blocked_reason}</p>}
        </div>
      ),
    },
    {
      key: 'date', header: 'Date', hideOnMobile: true,
      render: item => <span className="text-xs font-mono text-pi-noir-sub whitespace-nowrap">{formatDate(item.created_at)}</span>,
    },
    {
      key: 'status', header: 'Status',
      render: item => (
        <span className={`text-[10px] px-2 py-0.5 border rounded-full font-mono uppercase whitespace-nowrap ${STATUS_COLOR[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      ),
    },
    {
      key: 'verdict', header: 'Verdict', hideOnMobile: true,
      render: item => item.verdict_code
        ? <NoirVerdictPill verdict={item.verdict_code as MarketVerdictCode} />
        : <span className="text-xs text-pi-noir-sub">—</span>,
    },
    {
      key: 'score', header: 'Score', align: 'right',
      render: item => item.status !== 'blocked'
        ? <span className={`text-sm font-mono font-bold ${scoreColor(item.opportunity_score)}`}>{item.opportunity_score}</span>
        : <span className="text-xs text-pi-noir-sub">—</span>,
    },
    {
      key: 'confidence', header: 'Confidence', hideOnMobile: true,
      render: item => <WitnessDots variant="pi-noir" filled={QUALITY_DOTS[item.quality_grade] ?? 0} total={3} size="sm" label={`${item.quality_grade} data quality`} />,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      render: item => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <Link
            href={openItem(item)}
            className="rounded-md bg-pi-gold-deep px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#16130a] transition-[filter] duration-150 hover:brightness-110"
          >
            Open →
          </Link>
          <button
            onClick={() => duplicateItem(item.query)}
            className="px-2 py-1 text-[10px] font-mono text-pi-noir-sub hover:text-pi-noir-text hover:bg-pi-elevated rounded-md transition-colors"
            title="Re-run analysis"
          >
            Duplicate
          </button>
          {deleting === item.id ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-pi-risk-noir">Delete?</span>
              <button
                onClick={() => deleteItem(item.id)}
                disabled={actioning === item.id}
                className="px-1.5 py-1 text-[10px] text-pi-risk-noir hover:bg-pi-risk-noir/10 rounded-md transition-colors disabled:opacity-40"
              >
                Yes
              </button>
              <button
                onClick={() => setDeleting(null)}
                className="px-1.5 py-1 text-[10px] text-pi-noir-sub hover:text-pi-noir-text hover:bg-pi-elevated rounded-md transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setDeleting(item.id)}
              className="px-2 py-1 text-[10px] text-pi-noir-sub hover:text-pi-risk-noir transition-colors"
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
    <AppShell active="history" variant="pi-noir">
      <div className="max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-pi-noir-hairline pb-4">
          <div className="space-y-1">
            <h1 className="text-headline-md text-pi-noir-text">Research History</h1>
            <p className="text-sm text-pi-noir-sub">
              {loading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'analysis' : 'analyses'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/research/compare"
              className="inline-flex items-center gap-1.5 rounded-lg border border-pi-noir-hairline px-4 py-2 text-sm font-semibold text-pi-noir-text hover:bg-pi-elevated transition-colors"
            >
              Compare →
            </Link>
            <Link
              href="/research"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-4 py-2 text-sm font-semibold text-[#16130a] shadow-[0_8px_18px_-8px_rgba(212,169,74,0.5)] transition-transform duration-200 hover:-translate-y-px"
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
              className="flex-1 min-w-48 rounded-lg border border-pi-noir-hairline bg-pi-stage px-4 py-3 text-sm text-pi-noir-text placeholder-pi-noir-sub focus:outline-none focus:border-pi-gold-deep transition-colors"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-pi-noir-hairline bg-pi-stage px-3 py-2 text-sm text-pi-noir-text focus:outline-none focus:border-pi-gold-deep transition-colors"
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
                className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${
                  filter === f
                    ? 'border-pi-gold-deep bg-pi-gold-deep/15 text-pi-gold-deep font-semibold'
                    : 'border-pi-noir-hairline text-pi-noir-sub hover:bg-pi-elevated hover:text-pi-noir-text'
                }`}
              >
                {f === 'all' ? 'All' : f === 'favorited' ? '★ Favorites' : f === 'complete' ? 'Stage 4 Complete' : 'Blocked'}
              </button>
            ))}
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat === filter ? 'all' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${
                  filter === cat
                    ? 'border-pi-gold-deep bg-pi-gold-deep/15 text-pi-gold-deep font-semibold'
                    : 'border-pi-noir-hairline text-pi-noir-sub hover:bg-pi-elevated hover:text-pi-noir-text'
                }`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-pi-risk-noir bg-pi-stage border border-pi-risk-noir/40 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-5 animate-pulse">
                <div className="h-4 bg-pi-elevated w-48 mb-2 rounded" />
                <div className="h-3 bg-pi-elevated w-24 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayed.length === 0 && (
          <div className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-12 text-center space-y-3">
            <p className="text-pi-noir-sub text-sm">
              {items.length === 0
                ? 'No analyses yet — run your first market signal to get started.'
                : 'No results match your current filters.'}
            </p>
            {items.length === 0 && (
              <Link
                href="/research"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-5 py-2.5 text-sm font-semibold text-[#16130a] shadow-[0_8px_18px_-8px_rgba(212,169,74,0.5)] transition-transform duration-200 hover:-translate-y-px"
              >
                Start an analysis →
              </Link>
            )}
            {items.length > 0 && (
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="text-xs font-mono uppercase tracking-wide text-pi-noir-text underline hover:text-pi-gold-deep"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Ledger table */}
        {!loading && displayed.length > 0 && (
          <LedgerTable variant="pi-noir" columns={columns} rows={displayed} />
        )}

        {/* Bottom count */}
        {!loading && displayed.length > 0 && (
          <p className="text-xs text-center text-pi-noir-sub font-mono">
            Showing {displayed.length} of {items.length}
          </p>
        )}
      </div>
    </AppShell>
  )
}
