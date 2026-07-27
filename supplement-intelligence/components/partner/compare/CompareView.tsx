'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BuildDecision } from '@/types/index'
import { VERDICT_TONE, INSUFFICIENT_EVIDENCE_TONE, positionVerdictLabel } from '@/lib/partner-copy'
import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import { METRICS, findWinner } from '@/app/research/compare/metrics'
import { buildSeparationEngine, pickLeaderIndex, isWeakSet } from '@/app/research/compare/separationEngine'

// V4 Compare view (owner-approved mockup + refinements, 2026-07-27):
// (1) conclusion first — a deterministic line from the real separation
//     engine (pickLeaderIndex + buildSeparationEngine), never an LLM call;
// (2) "Show me the numbers" expands the full table on the same page and
//     STAYS open (refinement #1 — no accordion churn; the button retires);
// (3) the one-line candidate summary stays exactly one line (refinement #2);
// (4) selection from all analyses, active positions preselected
//     (refinement #3). The 0–100 score renders here and only here
//     (V4_PRODUCT_ARCHITECTURE.md §3).
export interface CompareCandidate {
  id: string
  categoryName: string
  decision: BuildDecision
  createdAt: string
  isPosition: boolean
}

function toneFor(item: AnalysisComparisonItem) {
  return item.insufficientEvidence ? INSUFFICIENT_EVIDENCE_TONE : VERDICT_TONE[item.decision]
}

export function CompareView({ candidates, defaultSelectedIds }: { candidates: CompareCandidate[]; defaultSelectedIds: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds)
  const [items, setItems] = useState<AnalysisComparisonItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTable, setShowTable] = useState(false)

  function toggle(id: string) {
    setItems(null)
    setShowTable(false)
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 4 ? prev : [...prev, id])
  }

  async function run() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/research/compare?ids=${selected.join(',')}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Comparison failed.'); return }
      setItems(data.items)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const leaderIdx = items ? pickLeaderIndex(items) : 0
  const separation = items ? buildSeparationEngine(items, leaderIdx, METRICS) : null
  const weak = items ? isWeakSet(items, leaderIdx) : false
  const leader = items?.[leaderIdx] ?? null

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-24 pt-12 sm:pt-16">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
        Compare · {selected.length} of your candidates
      </p>
      <h1 className="mb-1 font-serif text-[28px] font-semibold leading-snug tracking-tight">What actually separates them.</h1>
      <p className="mb-6 text-sm text-pi-sub">Same evidence scale for every candidate. Pick 2–4.</p>

      {/* selection — positions first (preselected), then the rest */}
      <div className="mb-6 flex flex-wrap gap-2">
        {candidates.map(c => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-all duration-200 ${
                on
                  ? 'border-pi-ink bg-pi-ink text-pi-cream shadow-[0_2px_6px_-2px_rgba(22,23,26,0.3)]'
                  : 'border-pi-hairline bg-pi-card text-pi-sub hover:-translate-y-px hover:border-pi-ink/25 hover:text-pi-ink'
              }`}
            >
              {c.isPosition && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-pi-gold-deep align-[1px]" />}
              {c.categoryName}
            </button>
          )
        })}
      </div>

      {!items && (
        <button
          type="button"
          onClick={run}
          disabled={loading || selected.length < 2}
          className="min-h-[44px] w-full rounded-xl bg-pi-ink px-5 py-3 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? 'Reading the evidence…' : 'Compare →'}
        </button>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-pi-risk/30 bg-pi-risk/10 px-4 py-3 text-sm text-pi-risk">{error}</p>}

      {items && separation && leader && (
        <section className="mt-2">
          {/* (1) the conclusion — deterministic, from the real separation engine */}
          <p className="max-w-[65ch] text-[16px] leading-relaxed text-pi-ink">
            {weak ? (
              <>None of these clears the bar — the lead below is relative, not an endorsement. </>
            ) : (
              <>If I had to pick one to validate first: <span className="font-semibold">{leader.category_name}</span>. </>
            )}
            {separation.forPool.length > 0 && (
              <>What separates it: {separation.forPool.slice(0, 2).map(m => m.metric.label.toLowerCase()).join(' and ')}.</>
            )}
            {separation.against.length > 0 && (
              <span className="text-pi-sub"> Running against it: {separation.against[0].metric.label.toLowerCase()}.</span>
            )}
          </p>

          {/* (3) exactly one summary line */}
          <p className="mt-3 truncate text-[12.5px] text-pi-sub">
            {items.map((it, i) => (
              <span key={it.analysis_id}>
                {i > 0 && ' · '}
                <span aria-hidden className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-[1px] ${toneFor(it).dot}`} />
                <span className={i === leaderIdx ? 'font-semibold text-pi-ink' : ''}>{it.category_name}</span>
              </span>
            ))}
          </p>

          {/* (2) the button — expands once, then retires */}
          {!showTable ? (
            <button
              type="button"
              onClick={() => setShowTable(true)}
              className="mt-6 min-h-[44px] w-full rounded-xl bg-pi-ink px-5 py-3 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B]"
            >
              Show me the numbers ↓
            </button>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-pi-hairline bg-pi-card shadow-[0_1px_3px_rgba(22,23,26,0.05),0_10px_24px_-14px_rgba(22,23,26,0.14)]">
              <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-serif text-[13px] font-semibold">&nbsp;</th>
                    {items.map((it, i) => (
                      <th key={it.analysis_id} className="p-3 text-right font-serif text-[13px] font-semibold">
                        <span aria-hidden className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[1px] ${toneFor(it).dot}`} />
                        {it.category_name}
                        {i === leaderIdx && <span className="ml-1 text-pi-gold-deep">★</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-pi-hairline">
                    <td className="p-3 text-pi-sub">Verdict</td>
                    {items.map(it => (
                      <td key={it.analysis_id} className="p-3 text-right font-mono text-[10px] uppercase tracking-wide">
                        <span className={toneFor(it).text}>{positionVerdictLabel(it.decision, it.insufficientEvidence)}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-pi-hairline">
                    <td className="p-3 text-pi-sub">Score</td>
                    {items.map((it, i) => (
                      <td key={it.analysis_id} className={`p-3 text-right font-mono text-lg font-bold tabular-nums ${i === leaderIdx ? 'text-pi-gold' : ''}`}>
                        {it.insufficientEvidence ? '—' : it.score}
                      </td>
                    ))}
                  </tr>
                  {METRICS.filter(m => m.id !== 'score' && m.id !== 'verdict').map(metric => {
                    const values = items.map(it => metric.getValue(it))
                    const winners = findWinner(metric.dir, values)
                    return (
                      <tr key={metric.id} className="border-t border-pi-hairline">
                        <td className="p-3 text-pi-sub">{metric.label}</td>
                        {items.map((it, i) => (
                          <td key={it.analysis_id} className={`p-3 text-right font-mono tabular-nums ${winners.has(i) ? 'font-bold text-pi-gold' : ''}`}>
                            {metric.format(values[i])}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href={`/app/brief/${leader.analysis_id}`} className="text-sm text-pi-gold hover:underline">
              Open the Brief: {leader.category_name} →
            </Link>
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link href="/app" className="text-sm text-pi-faint hover:text-pi-ink">← Back to the Stream</Link>
      </div>
    </div>
  )
}
