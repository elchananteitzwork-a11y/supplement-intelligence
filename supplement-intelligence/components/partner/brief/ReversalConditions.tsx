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
          <li key={i} className="flex items-start gap-2.5 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 text-sm text-pi-sub">
            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.watching ? 'bg-pi-build' : 'bg-pi-faint'}`} />
            <span>
              {item.label}
              {item.watching && <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-pi-build">watching · re-checked weekly</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
