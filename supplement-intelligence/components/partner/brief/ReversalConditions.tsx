'use client'

import type { ReversalConditionVM } from './types'
import { VocabularyTerm } from '../VocabularyTerm'

// "Reversal conditions" (V4_PRODUCT_ARCHITECTURE.md §3/§5) — real kill
// criteria (lib/kill-criteria.ts via components/memo/field-derivations.ts's
// deriveKillCriteriaItems) + live watch state when genuinely watchlisted,
// "re-checked weekly." Renders nothing (never a fabricated placeholder)
// when this analysis predates the kill-criteria feature.
export function ReversalConditions({ items }: { items: ReversalConditionVM[] }) {
  if (items.length === 0) return null

  return (
    <section className="mb-8">
      <VocabularyTerm term="reversal_conditions" subtitle="What would change my mind on this." className="mb-3 block">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Reversal conditions</p>
      </VocabularyTerm>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 text-sm text-pi-sub shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-shadow hover:shadow-[0_4px_12px_-4px_rgba(22,23,26,0.1)]">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.watching ? 'bg-pi-build' : 'bg-pi-faint'}`} />
              <span>
                {item.label}
                {item.watching && <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-pi-build">watching · re-checked weekly</span>}
              </span>
            </div>
            {item.marker && (
              <div className="mt-2 pl-5" aria-hidden>
                <svg viewBox="0 0 240 16" width="100%" height="16" preserveAspectRatio="none">
                  <line x1="4" y1="8" x2="236" y2="8" stroke="currentColor" strokeWidth="2" className="text-pi-hairline" />
                  <line
                    x1={4 + (item.marker.thresholdPct / 100) * 232}
                    y1="2"
                    x2={4 + (item.marker.thresholdPct / 100) * 232}
                    y2="14"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-pi-risk"
                  />
                  <circle cx={4 + (item.marker.currentPct / 100) * 232} cy="8" r="3.5" fill="currentColor" className="text-pi-ink" />
                </svg>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
