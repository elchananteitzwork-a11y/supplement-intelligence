'use client'

import { useEffect } from 'react'
import type { CaseDriver, ClaimEvidence } from '@/lib/partner-copy'
import { logEvent } from '@/lib/positions'

// ── Tap-to-interrogate (V4_PRODUCT_ARCHITECTURE.md §5 Interrogation) ──────
// "Templated grounded lookups (no free-text LLM chat)... each number
// carrying its source." Renders the real ClaimEvidence the server page
// already derived (lib/partner-copy.ts buildClaimEvidence) — no client
// fetch, no LLM call. Fires claim_tapped fire-and-forget on open (failures
// silent-logged, never blocking the UI — same honesty contract
// lib/positions.ts's logEvent already documents).
export function InterrogationSheet({
  driver, evidence, analysisId, onClose,
}: {
  driver:     CaseDriver
  evidence:   ClaimEvidence
  analysisId: string
  onClose:    () => void
}) {
  useEffect(() => {
    logEvent({ event: 'claim_tapped', analysisId }).catch(err => {
      console.warn('[partner-events] claim_tapped failed to log (non-blocking):', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.claimKey])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-pi-ink/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`Evidence for ${evidence.title}`}>
      <div className="w-full max-w-[480px] rounded-t-2xl border border-pi-hairline bg-pi-card p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">{evidence.title}</p>
            <p className="mt-1 text-sm text-pi-sub">{driver.text}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full border border-pi-hairline p-1.5 text-pi-sub hover:text-pi-ink">
            ✕
          </button>
        </div>

        {evidence.facts.length === 0 ? (
          <p className="text-sm text-pi-faint italic">No further real evidence is on record for this claim.</p>
        ) : (
          <ul className="space-y-3">
            {evidence.facts.map((f, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-pi-hairline pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-pi-sub">{f.label}</span>
                <span className="text-right">
                  <span className="block font-mono text-sm font-semibold text-pi-ink">{f.value}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-pi-faint">{f.provenance}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
