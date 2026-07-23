'use client'

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { GlassPanel } from '@/components/cine/GlassPanel'
import { CompareResults } from '@/components/pi/compare/CompareResults'
import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import type { PipelineCandidate } from '@/components/pi/types'
import { DECISION_CHIP } from '@/components/pi/decisionChip'

// Rewired (2026-07-2x) onto the real `analyses` pipeline: the selection
// phase now lists the user's own real analyses (same real fetch pattern
// /pipeline already uses — see app/research/compare/page.tsx, which fetches
// via derivePipelineViewModel and passes the result down as `candidates`)
// instead of the old thesis-based /api/research/history + /api/research/thesis
// endpoints (zero real rows in production for this pipeline).
//
// UIv2-M3 Home rebuild: DECISION_CHIP now imported from the shared
// components/pi/decisionChip.ts module (built for CandidateRow/dashboard's
// own RSC-boundary needs) instead of a third hand-copied table — one real
// source of truth for decision->label/style, not two.
//
// Terminal Noir port (2026-07-23): presentation-only re-skin onto the dark
// register — same fetch/selection/comparison logic, byte-identical. Cream
// tokens (pi-cream/pi-ink/pi-sub/pi-hairline/pi-sand/pi-card) remapped to
// their noir equivalents (pi-void/pi-stage/pi-elevated/pi-noir-text/
// pi-noir-sub/pi-noir-hairline). AppShell/SideNav's own additive
// `variant="pi-noir"` (already shipped by the parallel Watchlist/Alerts/
// Track Record/Settings port) is reused as-is here, not re-implemented.
// DECISION_CHIP.cls is tuned for a chip on a cream/white surface — same
// resolution CandidateRow.tsx already used for the identical problem: a
// LOCAL, additive noir color map (CHIP_CLS_NOIR below) onto the shared
// dark-safe verdict tokens tailwind.config already ships, rather than
// editing the shared decisionChip.ts module other pi-cream consumers
// (app/dashboard, candidate-core) still read as cream-tuned.
const CHIP_CLS_NOIR: Record<PipelineCandidate['decision'], string> = {
  BUILD_NOW:                    'text-pi-build-noir bg-pi-build-noir/10',
  VALIDATE_FURTHER:             'text-pi-invest-noir bg-pi-invest-noir/10',
  SKIP:                         'text-pi-pass-noir bg-pi-pass-noir/10',
  CATEGORY_CREATION_CANDIDATE:  'text-pi-gold-deep bg-pi-gold-deep/10',
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
    <AppShell active="compare" variant="pi-noir">
      <div className="max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-pi-noir-hairline pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-pi-gold-deep">Compare</p>
            <h1 className="font-serif text-[26px] font-semibold tracking-tight text-pi-noir-text">Comparison Mode</h1>
            <p className="text-sm text-pi-noir-sub">
              {phase === 'select'
                ? 'Select 2–4 analyses to compare side-by-side.'
                : `Comparing ${compItems.length} ${compItems.length === 1 ? 'analysis' : 'analyses'} — all metrics are verified, computed data.`
              }
            </p>
          </div>
          {phase === 'compare' && (
            <Link
              href="/research/compare"
              className="text-xs font-mono uppercase text-pi-noir-sub hover:text-pi-noir-text transition-colors px-3 py-2 rounded-lg border border-pi-noir-hairline"
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
              <GlassPanel radius="rounded-xl" className="sticky top-4 z-10 flex items-center justify-between px-4 py-3">
                <p className="text-sm font-mono text-pi-noir-text">
                  {selectionIds.size} selected — up to 4
                </p>
                <button
                  onClick={goCompare}
                  className="text-sm font-semibold px-4 py-1.5 rounded-lg text-[#16130a] bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright hover:brightness-105 transition-[filter] duration-150"
                >
                  Compare →
                </button>
              </GlassPanel>
            )}

            {candidates.length === 0 && (
              <div className="rounded-xl border border-pi-noir-hairline bg-pi-stage p-10 text-center space-y-3">
                <p className="text-pi-noir-sub text-sm">No analyses found. Run at least 2 analyses first.</p>
                <Link
                  href="/analyze"
                  className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg text-[#16130a] bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright hover:brightness-105 transition-[filter] duration-150"
                >
                  Start an analysis →
                </Link>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-mono text-pi-noir-sub uppercase tracking-wider font-semibold">
                  {candidates.length} analyses
                </p>
                <GlassPanel radius="rounded-xl">
                  <div className="divide-y divide-pi-noir-hairline">
                    {candidates.map(c => {
                      const checked = selectionIds.has(c.id)
                      const disabled = !checked && selectionIds.size >= 4
                      const chip = DECISION_CHIP[c.decision]
                      const chipClsNoir = CHIP_CLS_NOIR[c.decision]
                      return (
                        <label
                          key={c.id}
                          className={`flex items-start gap-4 px-4 py-3 cursor-pointer transition-colors ${
                            checked   ? 'bg-pi-gold-deep/10'
                            : disabled ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-pi-noir-text/[0.04]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => !disabled && toggleSelection(c.id)}
                            className="mt-0.5 accent-pi-gold-deep"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-pi-noir-text font-medium truncate">{c.name}</p>
                            <p className="text-xs text-pi-noir-sub truncate">{relativeAge(c.createdAtIso)}</p>
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${chipClsNoir}`}>
                              {chip.glyph} {chip.label}
                            </span>
                            <p className="text-[10px] text-pi-noir-sub">Score {c.score}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </GlassPanel>
              </div>
            )}
          </div>
        )}

        {/* ── COMPARISON PHASE ─────────────────────────────────────────────── */}
        {phase === 'compare' && (
          <div className="space-y-6">
            {compLoading && (
              <div className="text-center py-12">
                <p className="text-sm text-pi-noir-sub animate-pulse font-mono">Loading comparison data…</p>
              </div>
            )}

            {compError && (
              <p className="text-sm text-pi-risk-noir bg-pi-stage rounded-lg border border-pi-risk-noir/40 px-3 py-2">{compError}</p>
            )}

            {!compLoading && compItems.length >= 2 && (
              <GlassPanel radius="rounded-2xl" className="p-6 sm:p-9">
                <CompareResults
                  items={compItems}
                  recommendation={recommendation}
                  recLoading={recLoading}
                  recError={recError}
                  onGetRecommendation={getRecommendation}
                />
              </GlassPanel>
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
      <AppShell active="compare" variant="pi-noir">
        <div className="flex items-center justify-center py-24">
          <p className="text-pi-noir-sub text-sm animate-pulse font-mono">Loading…</p>
        </div>
      </AppShell>
    }>
      <CompareContentInner candidates={candidates} />
    </Suspense>
  )
}
