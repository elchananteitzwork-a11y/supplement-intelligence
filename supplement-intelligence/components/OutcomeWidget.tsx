'use client'

import { useState, useEffect } from 'react'
import { IconCheck } from '@/components/icons'
import type { BuiltStatus, LaunchStatus, OutcomeVerdict } from '@/types/index'

const BUILT_OPTIONS: { value: BuiltStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'built',       label: 'Built' },
  { value: 'abandoned',   label: 'Abandoned' },
]

const LAUNCH_OPTIONS: { value: LaunchStatus; label: string }[] = [
  { value: 'not_launched', label: 'Not launched' },
  { value: 'launched',     label: 'Launched' },
  { value: 'discontinued', label: 'Discontinued' },
]

const VERDICT_OPTIONS: { value: OutcomeVerdict; label: string }[] = [
  { value: 'too_early_to_tell', label: 'Too early to tell' },
  { value: 'success',           label: 'Success' },
  { value: 'failure',           label: 'Failure' },
]

interface OutcomeData {
  built_status:        BuiltStatus
  launch_status:        LaunchStatus
  monthly_revenue_usd:  number | null
  outcome_verdict:      OutcomeVerdict | null
  notes:                string | null
  updated_at:           string | null
}

// Real, user-reported ground truth for this specific analysis — the only
// mechanism this platform has for eventually checking whether its own
// BUILD_NOW/SKIP verdicts mean anything. Stays editable indefinitely
// (unlike FeedbackWidget's one-shot submission) since real-world status
// changes over weeks or months after a single analysis.
export default function OutcomeWidget({ analysisId }: { analysisId: string }) {
  const [data, setData]       = useState<OutcomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/outcomes?analysis_id=${analysisId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [analysisId])

  async function save(next: OutcomeData) {
    setData(next)
    setSaving(true)
    try {
      const res = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: analysisId, ...next }),
      })
      if (res.ok) {
        const saved = await res.json()
        setData(saved)
        setSavedAt(Date.now())
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) {
    return <div className="card p-6 text-sm text-zinc-500">Loading outcome tracker…</div>
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 4000

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">What actually happened with this idea?</p>
          <p className="text-xs text-zinc-500 mt-1">
            Real outcomes — yours and everyone else's — are the only way we'll ever know if this score means anything. Update this anytime.
          </p>
        </div>
        {justSaved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 shrink-0">
            <IconCheck className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Did you build it?</p>
        <div className="flex flex-wrap gap-2">
          {BUILT_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => save({ ...data, built_status: o.value })}
              disabled={saving}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                data.built_status === o.value
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-white/[0.06] border-white/[0.1] text-zinc-400 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Launch status</p>
        <div className="flex flex-wrap gap-2">
          {LAUNCH_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => save({ ...data, launch_status: o.value })}
              disabled={saving}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                data.launch_status === o.value
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-white/[0.06] border-white/[0.1] text-zinc-400 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">How did it go? (only once you actually know)</p>
        <div className="flex flex-wrap gap-2">
          {VERDICT_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => save({ ...data, outcome_verdict: o.value })}
              disabled={saving}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                data.outcome_verdict === o.value
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-white/[0.06] border-white/[0.1] text-zinc-400 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Monthly revenue (optional, never shared individually)</p>
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          defaultValue={data.monthly_revenue_usd ?? ''}
          onBlur={e => {
            const v = e.target.value.trim()
            const n = v === '' ? null : Number(v)
            if (n !== data.monthly_revenue_usd) save({ ...data, monthly_revenue_usd: n })
          }}
          placeholder="e.g. 2400"
          className="input-base text-sm w-40"
        />
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Notes (optional)</p>
        <textarea
          defaultValue={data.notes ?? ''}
          onBlur={e => {
            const v = e.target.value
            if (v !== (data.notes ?? '')) save({ ...data, notes: v || null })
          }}
          placeholder="What actually happened — manufacturing surprises, real CAC, anything the score didn't predict."
          className="input-base text-sm resize-none h-20"
          maxLength={2000}
        />
      </div>

      {data.updated_at && (
        <p className="text-[11px] text-zinc-600">
          Last updated {new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  )
}
