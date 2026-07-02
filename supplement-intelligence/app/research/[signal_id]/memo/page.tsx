'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InvestmentMemo } from '@/components/research/InvestmentMemo'
import type { Stage4FounderInputs, FullUnitEconomics } from '@/lib/stage4/unit-economics'
import type { InvestmentThesis } from '@/lib/stage2/types'

interface StoredThesis extends InvestmentThesis { id: string }
interface StoredMemo { id: string; unit_economics?: FullUnitEconomics | null; [key: string]: unknown }

type Stage = 'idle' | 'generating' | 'done' | 'error'

export default function MemoPage() {
  const { signal_id } = useParams<{ signal_id: string }>()

  const [stage, setStage]         = useState<Stage>('idle')
  const [error, setError]         = useState<string | null>(null)
  const [theses, setTheses]       = useState<StoredThesis[]>([])
  const [selected, setSelected]   = useState<string | null>(null)
  const [memo, setMemo]           = useState<StoredMemo | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [query, setQuery]         = useState('')
  // Which thesis IDs have a completed Stage 3 debate
  const [debateReady, setDebateReady] = useState<Set<string>>(new Set())

  // Founder inputs (Stage 4 optional form)
  const [showInputs, setShowInputs]   = useState(false)
  const [actualCOGS, setActualCOGS]   = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [adBudget, setAdBudget]       = useState('')

  // Fetch theses — then check which have debates, default to first debate-ready one
  useEffect(() => {
    fetch(`/api/research/thesis?signal_id=${signal_id}`)
      .then(r => r.json())
      .then(async (data: { theses: StoredThesis[] }) => {
        const list = data?.theses ?? []
        if (!list.length) return
        setTheses(list)

        // Parallel: check which theses already have a debate
        const debateChecks = await Promise.all(
          list.map(t =>
            fetch(`/api/research/adversarial?thesis_id=${t.id}`)
              .then(r => r.json())
              .then(d => (d ? t.id : null))
              .catch(() => null)
          )
        )
        const ready = new Set(debateChecks.filter((id): id is string => id !== null))
        setDebateReady(ready)

        // Default to first debate-ready thesis, else first thesis
        const defaultId = debateChecks.find(id => id !== null) ?? list[0].id
        setSelected(defaultId)
      })
      .catch(() => {})
  }, [signal_id])

  // Fetch signal query for breadcrumb
  useEffect(() => {
    fetch(`/api/research/market-signal?id=${signal_id}`)
      .then(r => r.json())
      .then(data => { if (data?.query) setQuery(data.query) })
      .catch(() => {})
  }, [signal_id])

  // Fetch existing memo when thesis selected
  useEffect(() => {
    if (!selected) return
    setMemo(null)
    setStage('idle')
    fetch(`/api/research/memo?thesis_id=${selected}`)
      .then(r => r.json())
      .then(data => {
        if (data) { setMemo(data); setFromCache(true); setStage('done') }
      })
      .catch(() => {})
  }, [selected])

  const generateMemo = useCallback(async () => {
    if (!selected) return
    setStage('generating')
    setError(null)

    const founderInputs: Stage4FounderInputs = {}
    if (actualCOGS)  founderInputs.actual_cogs_per_unit  = parseFloat(actualCOGS)
    if (targetPrice) founderInputs.target_launch_price   = parseFloat(targetPrice)
    if (adBudget)    founderInputs.planned_ad_budget_mo  = parseFloat(adBudget)

    try {
      const res = await fetch('/api/research/memo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          thesis_id:      selected,
          founder_inputs: Object.keys(founderInputs).length ? founderInputs : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Memo generation failed'); setStage('error'); return }
      setMemo({ ...data.memo, unit_economics: data.unit_economics ?? null })
      setFromCache(data.from_cache)
      setStage('done')
    } catch {
      setError('Network error — please try again')
      setStage('error')
    }
  }, [selected, actualCOGS, targetPrice, adBudget])

  const selectedNotReady = selected !== null && !debateReady.has(selected) && debateReady.size > 0

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        <Link href="/research" className="hover:text-gray-300 transition-colors">Research</Link>
        <span className="text-gray-700">/</span>
        <Link href={`/research/${signal_id}`} className="hover:text-gray-300 transition-colors">
          {query || signal_id.slice(0, 8) + '…'}
        </Link>
        <span className="text-gray-700">/</span>
        <Link href={`/research/${signal_id}/opportunity`} className="hover:text-gray-300 transition-colors">Opportunity</Link>
        <span className="text-gray-700">/</span>
        <Link href={`/research/${signal_id}/evaluate`} className="hover:text-gray-300 transition-colors">Evaluate</Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400">Investment Memo</span>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Investment Memo</h1>
        <p className="text-sm text-gray-400">
          Stage 4 — Deterministic verdicts, unit economics, and AI-written memo prose.
          Verdicts are computed from data, not generated by AI.
        </p>
      </div>

      {/* Thesis selector */}
      {theses.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Thesis</p>
          <div className="flex flex-col gap-2">
            {theses.map((t, i) => {
              const ready = debateReady.has(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selected === t.id
                      ? 'border-indigo-600 bg-indigo-950/30'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500">#{i + 1}</span>
                    {ready ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-800 text-green-400 bg-green-950/20">
                        Stage 3 done
                      </span>
                    ) : debateReady.size > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500">
                        needs Stage 3
                      </span>
                    ) : null}
                  </div>
                  <p className={`text-xs mt-1 ${selected === t.id ? 'text-indigo-200' : 'text-gray-300'}`}>
                    {t.product_angle}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Warning if selected thesis has no debate */}
      {selectedNotReady && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-950/20 px-4 py-3 text-xs text-yellow-300 space-y-1">
          <p className="font-medium">Stage 3 not completed for this thesis</p>
          <p>Run the adversarial evaluation first before generating an investment memo.</p>
          <Link
            href={`/research/${signal_id}/evaluate`}
            className="inline-block mt-1 text-yellow-400 underline hover:text-yellow-200"
          >
            Go to Stage 3 →
          </Link>
        </div>
      )}

      {/* Optional Stage 4 inputs */}
      <div className="rounded-lg border border-gray-800 p-4 space-y-3">
        <button
          onClick={() => setShowInputs(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-2"
        >
          {showInputs ? '−' : '+'} Add your real numbers (optional — improves economics accuracy)
        </button>
        {showInputs && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Actual COGS/unit ($)</label>
              <input
                type="number" value={actualCOGS}
                onChange={e => setActualCOGS(e.target.value)}
                placeholder="e.g. 6.50"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Target launch price ($)</label>
              <input
                type="number" value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder="e.g. 29.99"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Monthly ad budget ($)</label>
              <input
                type="number" value={adBudget}
                onChange={e => setAdBudget(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      {stage !== 'done' && (
        <button
          onClick={generateMemo}
          disabled={!selected || stage === 'generating' || selectedNotReady}
          className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {stage === 'generating' ? 'Generating memo…' : 'Generate Investment Memo'}
        </button>
      )}

      {stage === 'generating' && (
        <p className="text-xs text-center text-gray-500 animate-pulse">
          Computing unit economics → determining verdicts → writing 10-section memo… ~30–60s
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">{error}</p>
      )}

      {/* Memo */}
      {memo && stage === 'done' && (
        <div className="space-y-4">
          {fromCache && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>From cache.</span>
              <button
                onClick={() => { setMemo(null); setStage('idle'); setFromCache(false) }}
                className="text-gray-500 underline hover:text-gray-400"
              >
                Regenerate
              </button>
            </div>
          )}
          <InvestmentMemo memo={memo as unknown as Parameters<typeof InvestmentMemo>[0]['memo']} />

          {/* Completion CTA */}
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/research"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium hover:bg-indigo-500 transition-colors"
            >
              Analyze another product →
            </Link>
            <Link
              href="/research"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Back to research
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
