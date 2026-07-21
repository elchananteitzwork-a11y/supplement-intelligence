'use client'

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { CompareResults } from '@/components/pi/compare/CompareResults'
import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import type { PipelineCandidate } from '@/components/pi/types'

// Rewired (2026-07-2x) onto the real `analyses` pipeline: the selection
// phase now lists the user's own real analyses (same real fetch pattern
// /pipeline already uses — see app/research/compare/page.tsx, which fetches
// via derivePipelineViewModel and passes the result down as `candidates`)
// instead of the old thesis-based /api/research/history + /api/research/thesis
// endpoints (zero real rows in production for this pipeline).

// Copied verbatim from components/pi/CandidateRow.tsx's own (private,
// unexported) DECISION_CHIP — same "copied verbatim" convention already used
// elsewhere in this codebase (e.g. coreDataAdapter.ts's PILL_LABEL) so the
// selection list's badge always agrees with Pipeline's own.
const DECISION_CHIP: Record<PipelineCandidate['decision'], { label: string; cls: string; glyph: string }> = {
  BUILD_NOW:                    { label: 'Build now',        cls: 'text-pi-build bg-pi-build/10',   glyph: '▲' },
  VALIDATE_FURTHER:             { label: 'Validate further', cls: 'text-pi-invest bg-pi-invest/10', glyph: '◆' },
  SKIP:                         { label: 'Skip',             cls: 'text-pi-pass bg-pi-pass/10',     glyph: '—' },
  CATEGORY_CREATION_CANDIDATE:  { label: 'Category play',    cls: 'text-pi-gold bg-pi-gold/10',     glyph: '✦' },
}

function relativeAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 28) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function CompareContentInner({ candidates }: { candidates: PipelineCandidate[] }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const idsParam     = searchParams.get('ids') ?? ''
  const selectedIds  = useMemo(() => idsParam.split(',').filter(Boolean), [idsParam])

  const [selectionIds, setSelectionIds]       = useState<Set<string>>(new Set())

  const [compItems, setCompItems]             = useState<AnalysisComparisonItem[]>([])
  const [compLoading, setCompLoading]         = useState(false)
  const [compError, setCompError]             = useState<string | null>(null)

  const [recommendation, setRecommendation]   = useState<string | null>(null)
  const [recLoading, setRecLoading]           = useState(false)
  const [recError, setRecError]               = useState<string | null>(null)

  // Phase: 'select' if no ids in URL, 'compare' otherwise
  const phase = selectedIds.length >= 2 ? 'compare' : 'select'

  // Pre-beta audit fix: no request-id guard here meant a slower, older
  // in-flight fetch resolving after a newer one (e.g. rapid re-selection,
  // browser back/forward) could overwrite fresh compItems with stale data.
  // requestIdRef tracks only the latest call; any response that isn't from
  // the most recent call is discarded rather than applied.
  const requestIdRef = useRef(0)

  // Fetch comparison data when ids are in URL
  const loadComparison = useCallback(async (ids: string[]) => {
    if (ids.length < 2) return
    const requestId = ++requestIdRef.current
    setCompLoading(true)
    setCompError(null)
    setRecommendation(null)
    try {
      const res = await fetch(`/api/research/compare?ids=${ids.join(',')}`)
      const data = await res.json()
      if (requestId !== requestIdRef.current) return // a newer request has since started
      if (!res.ok) { setCompError(data.error ?? 'Failed to load comparison'); return }
      setCompItems(data.items ?? [])
    } catch {
      if (requestId !== requestIdRef.current) return
      setCompError('Network error — please try again')
    } finally {
      if (requestId === requestIdRef.current) setCompLoading(false)
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
        // Pre-beta security fix: send ids, not the client's own compItems —
        // the server now re-fetches and re-derives everything itself.
        body: JSON.stringify({ ids: selectedIds }),
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

  function toggleSelection(analysisId: string) {
    setSelectionIds(prev => {
      const next = new Set(prev)
      if (next.has(analysisId)) next.delete(analysisId)
      else if (next.size < 4) next.add(analysisId)
      return next
    })
  }

  function goCompare() {
    const ids = Array.from(selectionIds)
    router.push(`/research/compare?ids=${ids.join(',')}`)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AppShell active="compare" variant="pi">
      <div className="max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-pi-hairline pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-pi-gold">Compare</p>
            <h1 className="font-serif text-[26px] font-semibold tracking-tight text-pi-ink">Comparison Mode</h1>
            <p className="text-sm text-pi-sub">
              {phase === 'select'
                ? 'Select 2–4 analyses to compare side-by-side.'
                : `Comparing ${compItems.length} ${compItems.length === 1 ? 'analysis' : 'analyses'} — all metrics are verified, computed data.`
              }
            </p>
          </div>
          {phase === 'compare' && (
            <Link
              href="/research/compare"
              className="text-xs font-mono uppercase text-pi-sub hover:text-pi-ink transition-colors px-3 py-2 rounded-lg border border-pi-hairline"
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
              <div className="sticky top-4 z-10 flex items-center justify-between rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 shadow-[0_2px_4px_rgba(22,23,26,0.05),0_10px_20px_rgba(22,23,26,0.08)]">
                <p className="text-sm font-mono text-pi-ink">
                  {selectionIds.size} selected — up to 4
                </p>
                <button
                  onClick={goCompare}
                  className="text-sm font-semibold px-4 py-1.5 rounded-lg text-pi-cream bg-pi-ink hover:bg-[#24262B] transition-colors duration-150"
                >
                  Compare →
                </button>
              </div>
            )}

            {candidates.length === 0 && (
              <div className="rounded-xl border border-pi-hairline bg-pi-card p-10 text-center space-y-3">
                <p className="text-pi-sub text-sm">No analyses found. Run at least 2 analyses first.</p>
                <Link
                  href="/analyze"
                  className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg text-pi-cream bg-pi-ink hover:bg-[#24262B] transition-colors duration-150"
                >
                  Start an analysis →
                </Link>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-pi-faint uppercase tracking-wider font-semibold">
                  {candidates.length} analyses
                </p>
                {candidates.map(c => {
                  const checked = selectionIds.has(c.id)
                  const disabled = !checked && selectionIds.size >= 4
                  const chip = DECISION_CHIP[c.decision]
                  return (
                    <label
                      key={c.id}
                      className={`flex items-start gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-colors bg-pi-card ${
                        checked   ? 'border-pi-gold-deep bg-pi-sand'
                        : disabled ? 'border-pi-hairline opacity-40 cursor-not-allowed'
                        : 'border-pi-hairline hover:bg-pi-sand/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => !disabled && toggleSelection(c.id)}
                        className="mt-0.5 accent-pi-ink"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-pi-ink font-medium truncate">{c.name}</p>
                        <p className="text-xs text-pi-faint truncate">{relativeAge(c.createdAtIso)}</p>
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>
                          {chip.glyph} {chip.label}
                        </span>
                        <p className="text-[10px] text-pi-faint">Score {c.score}</p>
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
                <p className="text-sm text-pi-sub animate-pulse font-mono">Loading comparison data…</p>
              </div>
            )}

            {compError && (
              <p className="text-sm text-pi-risk bg-pi-card rounded-lg border border-pi-risk px-3 py-2">{compError}</p>
            )}

            {!compLoading && compItems.length >= 2 && (
              <div className="rounded-2xl border border-pi-hairline bg-pi-cream p-6 sm:p-9">
                <CompareResults
                  items={compItems}
                  recommendation={recommendation}
                  recLoading={recLoading}
                  recError={recError}
                  onGetRecommendation={getRecommendation}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export function CompareContent({ candidates }: { candidates: PipelineCandidate[] }) {
  return (
    <Suspense fallback={
      <AppShell active="compare" variant="pi">
        <div className="flex items-center justify-center py-24">
          <p className="text-pi-sub text-sm animate-pulse font-mono">Loading…</p>
        </div>
      </AppShell>
    }>
      <CompareContentInner candidates={candidates} />
    </Suspense>
  )
}
