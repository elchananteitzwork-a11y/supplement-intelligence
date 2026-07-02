'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ThesisCard } from '@/components/research/ThesisCard'
import type { InvestmentThesis, FounderFitAnnotation } from '@/lib/stage2/types'
import type { LaunchThresholdAssessment } from '@/lib/stage25/launch-threshold'

interface StoredThesis extends InvestmentThesis {
  id: string
  created_at: string
}

type Stage = 'idle' | 'generating' | 'scoring_fit' | 'done' | 'error'

const THRESHOLD_RESULT_COLORS: Record<string, string> = {
  pass: 'text-green-400',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
}

export default function OpportunityMapPage() {
  const { signal_id } = useParams<{ signal_id: string }>()
  const router = useRouter()

  const [stage, setStage]             = useState<Stage>('idle')
  const [error, setError]             = useState<string | null>(null)
  const [theses, setTheses]           = useState<StoredThesis[]>([])
  const [fitMap, setFitMap]           = useState<Record<string, FounderFitAnnotation>>({})
  const [thresholds, setThresholds]   = useState<LaunchThresholdAssessment | null>(null)
  const [hasProfile, setHasProfile]   = useState<boolean | null>(null)
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [generationNote, setNote]     = useState<string>('')
  const [fromCache, setFromCache]     = useState(false)
  const [query, setQuery]             = useState('')

  // Check if user has a founder profile
  useEffect(() => {
    fetch('/api/research/founder-profile')
      .then(r => r.json())
      .then(data => setHasProfile(!!data))
      .catch(() => setHasProfile(false))
  }, [])

  // Fetch existing theses on mount
  useEffect(() => {
    fetch(`/api/research/thesis?signal_id=${signal_id}`)
      .then(r => r.json())
      .then(async (data: { theses: StoredThesis[]; launch_thresholds: LaunchThresholdAssessment | null }) => {
        if (data?.theses?.length) {
          setTheses(data.theses)
          setThresholds(data.launch_thresholds ?? null)
          setFromCache(true)
          setStage('done')
        }
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

  const generateTheses = useCallback(async () => {
    setStage('generating')
    setError(null)

    try {
      const res = await fetch('/api/research/thesis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signal_id }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Thesis generation failed')
        setStage('error')
        return
      }

      setTheses(data.theses)
      setThresholds(data.launch_thresholds ?? null)
      setNote(data.generation_note ?? '')
      setFromCache(data.from_cache ?? false)

      // Auto-score fit if profile exists
      if (hasProfile) {
        await scoreFit()
      } else {
        setStage('done')
      }
    } catch (err) {
      setError('Network error — please try again')
      setStage('error')
    }
  }, [signal_id, hasProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  const scoreFit = useCallback(async () => {
    setStage('scoring_fit')
    try {
      const res = await fetch('/api/research/fit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ signal_id }),
      })
      const data = await res.json()
      if (res.ok && data.annotations) {
        const map: Record<string, FounderFitAnnotation> = {}
        for (const a of data.annotations) map[a.thesis_id] = a
        setFitMap(map)
      }
    } finally {
      setStage('done')
    }
  }, [signal_id])

  // Auto-generate when the page first loads with theses already available from cache
  useEffect(() => {
    if (fromCache && theses.length > 0 && hasProfile === true && Object.keys(fitMap).length === 0) {
      scoreFit()
    }
  }, [fromCache, theses.length, hasProfile, fitMap, scoreFit])

  // Sort theses: by fit_rank desc if available, else by thesis_index
  const sortedTheses = [...theses].sort((a, b) => {
    const fa = fitMap[a.id]?.fit_rank ?? 0
    const fb = fitMap[b.id]?.fit_rank ?? 0
    if (fa !== fb) return fb - fa
    return a.thesis_index - b.thesis_index
  })

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <Link href="/research" className="hover:text-gray-300 transition-colors">Research</Link>
        <span className="text-gray-700">/</span>
        <Link href={`/research/${signal_id}`} className="hover:text-gray-300 transition-colors">
          {query || signal_id.slice(0, 8) + '…'}
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400">Opportunity Map</span>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunity Map</h1>
        <p className="text-sm text-gray-400">
          Stage 2 — AI synthesizes {theses.length > 0 ? theses.length : '3–5'} investment theses
          grounded in Stage 1 evidence.
          {Object.keys(fitMap).length > 0 && ' Sorted by your founder fit score.'}
        </p>
      </div>

      {/* Launch thresholds */}
      {thresholds && (
        <div className="rounded-lg border border-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Launch Thresholds</p>
            <span className={`text-xs font-mono ${THRESHOLD_RESULT_COLORS[thresholds.overall]}`}>
              {thresholds.overall.toUpperCase()} ({thresholds.pass_count}P / {thresholds.warn_count}W / {thresholds.fail_count}F)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {thresholds.checks.map(c => (
              <div key={c.metric} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 font-bold ${THRESHOLD_RESULT_COLORS[c.result]}`}>
                  {c.result === 'pass' ? '✓' : c.result === 'warn' ? '⚠' : '✗'}
                </span>
                <div>
                  <span className="text-gray-300">{c.metric}</span>
                  {' '}
                  <span className="text-gray-500 font-mono">{c.value}</span>
                  <p className="text-gray-600">{c.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Founder profile notice */}
      {hasProfile === false && theses.length === 0 && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-950/20 px-4 py-3 space-y-2">
          <p className="text-sm text-yellow-300">
            No founder profile — theses will be generated without fit scoring.
          </p>
          <Link
            href={`/research/profile?return_to=/research/${signal_id}/opportunity`}
            className="text-xs text-yellow-400 underline hover:text-yellow-200"
          >
            Complete profile first for personalized fit scores →
          </Link>
        </div>
      )}

      {/* Generate button */}
      {theses.length === 0 && stage !== 'generating' && (
        <button
          onClick={generateTheses}
          disabled={stage === 'error'}
          className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          Generate Investment Theses
        </button>
      )}

      {/* Status */}
      {stage === 'generating' && (
        <div className="text-center py-8 space-y-2">
          <div className="text-gray-400 text-sm animate-pulse">Generating investment theses…</div>
          <p className="text-xs text-gray-600">Claude is synthesizing Stage 1 evidence into product opportunities. ~30–60s</p>
        </div>
      )}
      {stage === 'scoring_fit' && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 animate-pulse">Scoring founder fit (deterministic)…</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Generation note */}
      {generationNote && (
        <p className="text-xs text-gray-500 italic border-l-2 border-gray-700 pl-3">{generationNote}</p>
      )}

      {fromCache && theses.length > 0 && (
        <p className="text-xs text-gray-600">
          Theses from previous generation.{' '}
          <button
            className="text-gray-500 underline hover:text-gray-400"
            onClick={() => {
              setTheses([])
              setStage('idle')
              setFromCache(false)
            }}
          >
            Regenerate
          </button>
        </p>
      )}

      {/* Thesis cards */}
      {sortedTheses.length > 0 && (
        <div className="space-y-3">
          {sortedTheses.map((t, i) => (
            <ThesisCard
              key={t.id}
              thesis={t}
              fit={fitMap[t.id]}
              rank={i + 1}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(prev => prev === t.id ? null : t.id)}
            />
          ))}
        </div>
      )}

      {/* Footer actions */}
      {theses.length > 0 && hasProfile === false && (
        <div className="border-t border-gray-800 pt-6 space-y-3">
          <p className="text-sm text-gray-400">Add a founder profile to see which thesis fits your situation best.</p>
          <Link
            href={`/research/profile?return_to=/research/${signal_id}/opportunity`}
            className="inline-block rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm hover:bg-gray-700 transition-colors"
          >
            Complete Founder Profile →
          </Link>
        </div>
      )}

      {/* Next: Stage 3 */}
      {theses.length > 0 && (
        <div className="rounded-lg border border-indigo-800 bg-indigo-950/20 px-5 py-4">
          <p className="text-sm font-medium text-indigo-300 mb-1">Stage 3 — Adversarial Evaluation</p>
          <p className="text-xs text-indigo-400/70">
            Bull case (temp 0.5) and Bear case (temp 0.8) run in parallel with no shared context.
            Kill switches then execute deterministically before synthesis.
          </p>
          <Link
            href={`/research/${signal_id}/evaluate`}
            className="inline-block mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Run Adversarial Evaluation →
          </Link>
        </div>
      )}
    </main>
  )
}
