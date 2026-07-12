'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InvestmentMemo } from '@/components/research/InvestmentMemo'
import { FounderFitPanel } from '@/components/research/FounderFitPanel'
import { FounderProfileBanner } from '@/components/research/FounderProfileBanner'
import { HardCard, PrimaryButton, PrimaryLinkButton, GhostLinkButton } from '@/components/ui'
import type { Stage4FounderInputs, FullUnitEconomics } from '@/lib/stage4/unit-economics'
import type { InvestmentThesis, FounderFitAnnotation } from '@/lib/stage2/types'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

interface StoredThesis extends InvestmentThesis { id: string }
interface StoredMemo {
  id: string
  unit_economics?: FullUnitEconomics | null
  fit_annotation?: FounderFitAnnotation | null
  founder_profile?: FounderProfile | null
  [key: string]: unknown
}

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
        if (data && data.sections) {
          setMemo(data)  // GET already includes unit_economics, fit_annotation, founder_profile
          setFromCache(true)
          setStage('done')
        }
        // data === null or missing sections → no memo yet, leave stage as 'idle'
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
      setMemo({
        ...data.memo,
        unit_economics:   data.unit_economics ?? null,
        fit_annotation:   data.fit_annotation ?? null,
        founder_profile:  data.founder_profile ?? null,
      })
      setFromCache(data.from_cache)
      setStage('done')
    } catch {
      setError('Network error — please try again')
      setStage('error')
    }
  }, [selected, actualCOGS, targetPrice, adBudget])

  const selectedNotReady = selected !== null && !debateReady.has(selected)

  return (
    <main className="min-h-screen bg-surface font-sans text-ink max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs font-mono text-outline uppercase flex-wrap">
        <Link href="/research" className="hover:text-black transition-colors">Research</Link>
        <span className="text-outline-variant">/</span>
        <Link href={`/research/${signal_id}`} className="hover:text-black transition-colors">
          {query || signal_id.slice(0, 8) + '…'}
        </Link>
        <span className="text-outline-variant">/</span>
        <Link href={`/research/${signal_id}/opportunity`} className="hover:text-black transition-colors">Opportunity</Link>
        <span className="text-outline-variant">/</span>
        <Link href={`/research/${signal_id}/evaluate`} className="hover:text-black transition-colors">Evaluate</Link>
        <span className="text-outline-variant">/</span>
        <span className="text-ink-variant">Investment Memo</span>
      </div>

      <div className="space-y-1 border-b-2 border-black pb-4">
        <h1 className="text-headline-md text-black">Investment Memo</h1>
        <p className="text-sm text-ink-variant">
          Stage 4 — Deterministic verdicts, unit economics, and AI-written memo prose.
          Verdicts are computed from data, not generated by AI.
        </p>
      </div>

      {/* Thesis selector */}
      {theses.length > 1 && (
        <div className="space-y-2">
          <p className="text-[11px] font-mono font-semibold text-outline uppercase tracking-wider">Thesis</p>
          <div className="flex flex-col gap-2">
            {theses.map((t, i) => {
              const ready = debateReady.has(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`text-left border px-3 py-2.5 transition-colors bg-white ${
                    selected === t.id
                      ? 'border-2 border-black'
                      : 'border-black hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-outline">#{i + 1}</span>
                    {ready ? (
                      <span className="text-[10px] px-1.5 py-0.5 border border-verdict-positive text-verdict-positive font-mono uppercase">
                        Stage 3 done
                      </span>
                    ) : debateReady.size > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 border border-black text-outline font-mono uppercase">
                        needs Stage 3
                      </span>
                    ) : null}
                  </div>
                  <p className={`text-xs mt-1 ${selected === t.id ? 'text-black' : 'text-ink-variant'}`}>
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
        <div className="border border-verdict-caution-text bg-white px-4 py-3 text-xs text-verdict-caution-text space-y-1">
          <p className="font-bold">Stage 3 not completed for this thesis</p>
          <p>Run the adversarial evaluation first before generating an investment memo.</p>
          <Link
            href={`/research/${signal_id}/evaluate`}
            className="inline-block mt-1 underline hover:text-black"
          >
            Go to Stage 3 →
          </Link>
        </div>
      )}

      {/* Optional Stage 4 inputs */}
      <HardCard className="space-y-3">
        <button
          onClick={() => setShowInputs(v => !v)}
          className="text-xs font-mono uppercase tracking-wide text-ink-variant hover:text-black flex items-center gap-2"
        >
          {showInputs ? '−' : '+'} Add your real numbers (optional — improves economics accuracy)
        </button>
        {showInputs && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs text-ink-variant">Actual COGS/unit ($)</label>
              <input
                type="number" value={actualCOGS}
                onChange={e => setActualCOGS(e.target.value)}
                placeholder="e.g. 6.50"
                className="w-full border border-black bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-variant">Target launch price ($)</label>
              <input
                type="number" value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                placeholder="e.g. 29.99"
                className="w-full border border-black bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-variant">Monthly ad budget ($)</label>
              <input
                type="number" value={adBudget}
                onChange={e => setAdBudget(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full border border-black bg-white px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
          </div>
        )}
      </HardCard>

      {/* Generate button */}
      {stage !== 'done' && (
        <PrimaryButton
          onClick={generateMemo}
          disabled={!selected || stage === 'generating' || selectedNotReady}
          className="w-full"
        >
          {stage === 'generating' ? 'Generating memo…' : 'Generate Investment Memo'}
        </PrimaryButton>
      )}

      {stage === 'generating' && (
        <p className="text-xs text-center text-outline font-mono animate-pulse">
          Computing unit economics → determining verdicts → writing 10-section memo… ~30–60s
        </p>
      )}

      {error && (
        <p className="text-xs text-verdict-negative bg-white border border-verdict-negative px-3 py-2">{error}</p>
      )}

      {/* Memo */}
      {memo && stage === 'done' && (
        <div className="space-y-6">
          {fromCache && (
            <div className="flex items-center justify-between text-xs font-mono text-outline">
              <span>From cache.</span>
              <button
                onClick={() => { setMemo(null); setStage('idle'); setFromCache(false) }}
                className="underline hover:text-black"
              >
                Regenerate
              </button>
            </div>
          )}

          {/* Founder profile context — always shown at top of memo */}
          <FounderProfileBanner
            profile={memo.founder_profile ?? null}
            returnTo={`/research/${signal_id}/memo`}
            compact
          />

          <InvestmentMemo memo={memo as unknown as Parameters<typeof InvestmentMemo>[0]['memo']} />

          {/* Founder fit breakdown — shown after the market memo */}
          {memo.fit_annotation && (
            <HardCard>
              <FounderFitPanel annotation={memo.fit_annotation} />
            </HardCard>
          )}

          {/* Completion CTA */}
          <div className="border-t-2 border-black pt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <PrimaryLinkButton href="/research">Analyze another product →</PrimaryLinkButton>
            <GhostLinkButton href="/research">Back to research</GhostLinkButton>
          </div>
        </div>
      )}
    </main>
  )
}
