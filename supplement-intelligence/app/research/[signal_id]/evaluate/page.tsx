'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AdversarialDebate } from '@/components/research/AdversarialDebate'
import { PrimaryButton } from '@/components/ui'
import type { InvestmentThesis } from '@/lib/stage2/types'
import type { AdversarialDebateResult } from '@/lib/stage3/adversarial'

interface StoredThesis extends InvestmentThesis {
  id: string
  created_at: string
}

interface StoredDebate {
  id: string
  thesis_id: string
  bull_case: AdversarialDebateResult['bull_case']
  bear_case: AdversarialDebateResult['bear_case']
  conflicts: string[]
  unknowns: string[]
  kill_switches: AdversarialDebateResult['kill_switches']['results']
  all_switches_clear: boolean
  ai_model_version: string
}

type Stage = 'idle' | 'running' | 'done' | 'error'

export default function EvaluatePage() {
  const { signal_id } = useParams<{ signal_id: string }>()

  const [theses, setTheses]         = useState<StoredThesis[]>([])
  const [debates, setDebates]       = useState<Record<string, StoredDebate>>({})
  const [selected, setSelected]     = useState<string | null>(null)
  const [stage, setStage]           = useState<Stage>('idle')
  const [error, setError]           = useState<string | null>(null)
  const [query, setQuery]           = useState('')

  // Fetch theses on mount
  useEffect(() => {
    fetch(`/api/research/thesis?signal_id=${signal_id}`)
      .then(r => r.json())
      .then((data: { theses: StoredThesis[] }) => {
        const list = data?.theses ?? []
        if (list.length) {
          setTheses(list)
          setSelected(list[0].id)
        }
      })
      .catch(() => {})
  }, [signal_id])

  // Fetch signal query
  useEffect(() => {
    fetch(`/api/research/market-signal?id=${signal_id}`)
      .then(r => r.json())
      .then(data => { if (data?.query) setQuery(data.query) })
      .catch(() => {})
  }, [signal_id])

  // Fetch existing debates for all theses; switch selection to first debated thesis
  useEffect(() => {
    if (!theses.length) return
    Promise.all(
      theses.map(t =>
        fetch(`/api/research/adversarial?thesis_id=${t.id}`)
          .then(r => r.json())
          .then(data => ({ thesisId: t.id, debate: data as StoredDebate | null }))
          .catch(() => ({ thesisId: t.id, debate: null }))
      )
    ).then(results => {
      const map: Record<string, StoredDebate> = {}
      let firstDebatedId: string | null = null
      for (const { thesisId, debate } of results) {
        if (debate && debate.bull_case && debate.bear_case) {
          map[thesisId] = debate
          if (!firstDebatedId) firstDebatedId = thesisId
        }
      }
      if (Object.keys(map).length) {
        setDebates(map)
        // Default selection to the first thesis that already has a debate
        if (firstDebatedId) setSelected(firstDebatedId)
      }
    })
  }, [theses])

  const runDebate = useCallback(async (thesisId: string) => {
    setStage('running')
    setError(null)
    try {
      const res = await fetch('/api/research/adversarial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesis_id: thesisId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Adversarial evaluation failed'); setStage('error'); return }
      setDebates(prev => ({ ...prev, [thesisId]: data.debate }))
      setStage('done')
    } catch {
      setError('Network error — please try again')
      setStage('error')
    }
  }, [])

  const selectedThesis = theses.find(t => t.id === selected)
  const selectedDebate = selected ? debates[selected] : null

  return (
    <main className="min-h-screen bg-surface font-sans text-ink max-w-4xl mx-auto px-6 py-12 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs font-mono text-outline uppercase">
        <Link href="/research" className="hover:text-black transition-colors">Research</Link>
        <span className="text-outline-variant">/</span>
        <Link href={`/research/${signal_id}`} className="hover:text-black transition-colors">
          {query || signal_id.slice(0, 8) + '…'}
        </Link>
        <span className="text-outline-variant">/</span>
        <Link href={`/research/${signal_id}/opportunity`} className="hover:text-black transition-colors">
          Opportunity Map
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-ink-variant">Adversarial Evaluation</span>
      </div>

      <div className="space-y-1 border-b-2 border-black pb-4">
        <h1 className="text-headline-md text-black">Adversarial Evaluation</h1>
        <p className="text-sm text-ink-variant">
          Stage 3 — Bull (temp 0.5) and Bear (temp 0.8) run in parallel with no shared context.
          Kill switches execute deterministically after both complete.
        </p>
      </div>

      {theses.length === 0 ? (
        <div className="border border-black bg-white p-6 text-center space-y-3">
          <p className="text-sm text-ink-variant">No theses found for this signal.</p>
          <Link
            href={`/research/${signal_id}/opportunity`}
            className="inline-block text-xs text-black underline hover:text-ink-variant"
          >
            ← Generate theses first
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Thesis selector */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono font-semibold text-outline uppercase tracking-wider">Select Thesis</p>
            <div className="space-y-2">
              {theses.map((t, i) => (
                <div
                  key={t.id}
                  className={`border cursor-pointer transition-colors bg-white ${
                    selected === t.id
                      ? 'border-2 border-black'
                      : 'border-black hover:bg-surface-container-low'
                  }`}
                  onClick={() => setSelected(t.id)}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-outline font-mono">#{i + 1}</span>
                      {debates[t.id] && (
                        <span className={`text-xs px-1.5 py-0.5 border font-mono uppercase ${
                          debates[t.id].all_switches_clear
                            ? 'border-verdict-positive text-verdict-positive'
                            : 'border-verdict-caution-text text-verdict-caution-text'
                        }`}>
                          {debates[t.id].all_switches_clear ? 'evaluated ✓' : 'evaluated ⚠'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink mt-1">{t.product_angle}</p>
                    <p className="text-xs text-outline">{t.target_customer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evaluate button */}
          {selected && !selectedDebate && (
            <div className="space-y-3">
              {stage === 'running' ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-ink-variant animate-pulse">
                    Running adversarial debate — 3 parallel AI calls…
                  </p>
                  <p className="text-xs text-outline">Bull case · Bear case · Synthesis · Kill switches · ~60–90s</p>
                </div>
              ) : (
                <PrimaryButton onClick={() => selected && runDebate(selected)} className="w-full">
                  Run Adversarial Evaluation for Thesis #{theses.findIndex(t => t.id === selected) + 1}
                </PrimaryButton>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
          )}

          {/* Debate result */}
          {selectedDebate && selectedThesis && (
            <AdversarialDebate
              debate={selectedDebate}
              thesisLabel={selectedThesis.product_angle}
            />
          )}

          {/* Next: Stage 4 */}
          {selectedDebate && (
            <div className="border-2 border-black bg-white px-5 py-4">
              <p className="text-sm font-bold text-black mb-1">Stage 4 — Investment Memo</p>
              <p className="text-xs text-ink-variant mb-3">
                Deterministic verdicts, unit economics engine, sensitivity analysis, and 10-section investment memo.
              </p>
              <Link
                href={`/research/${signal_id}/memo`}
                className="inline-block bg-black border-2 border-black text-white px-4 py-2 text-sm font-black uppercase tracking-wide hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98]"
              >
                Generate Investment Memo →
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
