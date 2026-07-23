'use client'

import { useState } from 'react'
import type { PullVerb } from '@/lib/partner-copy'
import { upsertPosition, logEvent } from '@/lib/positions'
import type { ReversalConditionVM } from './types'

// ── S-Pull commitment sheet (V4_PRODUCT_ARCHITECTURE.md §5) ───────────────
// Validate: the real plan (steps + real budget + success metrics) — "I'll
// hold you to these numbers" — POSTs the metrics snapshot.
// Watch: confirms exactly what's guarded (the real kill criteria).
// Kill: optional one-line reason; redirection line only when real.
//
// Honest-failure path (RD_V4_PHASE1.md contract): a 503/404 (positions
// table doesn't exist yet / migration pending) or any other non-2xx
// surfaces as a quiet, retriable line — never swallowed, never a fake
// success state.
export function PullSheet({
  verb, analysisId,
  validationSteps, validationBudget, successMetrics,
  reversalConditions, killRedirect,
  onClose, onCommitted,
}: {
  verb: PullVerb
  analysisId: string
  validationSteps: string[]
  validationBudget: { range: string; breakdown: string }
  successMetrics: string[]
  reversalConditions: ReversalConditionVM[]
  killRedirect: string | null
  onClose: () => void
  onCommitted: () => void
}) {
  const [killReason, setKillReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function commit() {
    setSaving(true)
    setError('')
    try {
      const state = verb === 'Validate' ? 'validating' : verb === 'Watch' ? 'watching' : 'killed'
      await upsertPosition({
        analysisId,
        state,
        successMetrics: verb === 'Validate' ? successMetrics : undefined,
        killReason: verb === 'Kill' && killReason.trim() ? killReason.trim() : undefined,
      })
      logEvent({ event: 'pull_committed', analysisId }).catch(err => {
        console.warn('[partner-events] pull_committed failed to log (non-blocking):', err)
      })
      setDone(true)
    } catch (err: unknown) {
      setError(
        err instanceof Error && /503|not.*live|pending/i.test(err.message)
          ? "Couldn't save — the positions store isn't live yet."
          : "Couldn't save that — try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-pi-ink/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-[480px] rounded-t-2xl border border-pi-hairline bg-pi-card p-6 sm:rounded-2xl">
        {done ? (
          <div className="py-4 text-center">
            <p className="mb-4 text-sm text-pi-ink">
              {verb === 'Validate' && "Saved. I'll hold you to those numbers."}
              {verb === 'Watch' && "Saved. I'm watching those conditions for you."}
              {verb === 'Kill' && 'Recorded as a save. Nothing wrong with walking away from this one.'}
            </p>
            <button
              type="button"
              onClick={onCommitted}
              className="min-h-[44px] w-full rounded-xl bg-pi-ink px-5 text-sm font-semibold text-pi-cream"
            >
              Back to the Stream
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
                {verb === 'Validate' ? 'Validate this' : verb === 'Watch' ? 'Watch this' : 'Kill this'}
              </p>
              <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-pi-hairline p-1.5 text-pi-sub hover:text-pi-ink">✕</button>
            </div>

            {verb === 'Validate' && (
              <div className="mb-5 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pi-faint">The plan</p>
                  <ol className="space-y-2">
                    {validationSteps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-pi-sub">
                        <span className="font-mono text-pi-faint">{i + 1}.</span>{s}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-lg bg-pi-sand p-4">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-pi-faint">Real budget</p>
                  <p className="font-mono text-lg font-bold text-pi-ink">{validationBudget.range}</p>
                  <p className="mt-0.5 text-xs text-pi-faint">{validationBudget.breakdown}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pi-faint">Success metrics — I&rsquo;ll hold you to these</p>
                  <ul className="space-y-1.5">
                    {successMetrics.map((m, i) => <li key={i} className="text-sm text-pi-sub">— {m}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {verb === 'Watch' && (
              <div className="mb-5">
                <p className="mb-2 text-sm text-pi-sub">Here&rsquo;s exactly what I&rsquo;ll be guarding, re-checked weekly:</p>
                {reversalConditions.length === 0 ? (
                  <p className="text-sm italic text-pi-faint">No falsifiable reversal conditions are on record for this analysis yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {reversalConditions.map((c, i) => <li key={i} className="rounded-xl border border-pi-hairline bg-pi-sand px-3.5 py-2.5 text-sm text-pi-sub">{c.label}</li>)}
                  </ul>
                )}
              </div>
            )}

            {verb === 'Kill' && (
              <div className="mb-5">
                <label htmlFor="kill-reason" className="mb-2 block text-sm text-pi-sub">Why, in one line? (optional)</label>
                <input
                  id="kill-reason"
                  value={killReason}
                  onChange={e => setKillReason(e.target.value)}
                  className="w-full rounded-xl border border-pi-hairline bg-pi-card px-3.5 py-2.5 text-sm text-pi-ink placeholder:text-pi-faint focus:outline-none focus:ring-2 focus:ring-pi-gold-bright"
                  placeholder="e.g. margin doesn't work for me"
                />
                {killRedirect && <p className="mt-3 text-sm text-pi-sub">{killRedirect}</p>}
              </div>
            )}

            {error && (
              <p role="alert" className="mb-3 text-sm text-pi-risk">{error}</p>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={() => void commit()}
              className="min-h-[44px] w-full rounded-xl bg-pi-ink px-5 text-sm font-semibold text-pi-cream transition-colors hover:bg-[#24262B] disabled:opacity-50"
            >
              {saving ? 'Saving…' : error ? 'Try again' :
                verb === 'Validate' ? "Start validating — I'll hold you to these numbers" :
                verb === 'Watch' ? 'Start watching' : 'Kill it'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
