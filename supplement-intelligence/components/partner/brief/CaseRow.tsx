'use client'

import type { CaseDriver } from '@/lib/partner-copy'

// One row of "The Case" (V4_PRODUCT_ARCHITECTURE.md §5): words left, one
// real number right, the whole row a tap target that opens the grounded
// evidence sheet for exactly that claim. `suggested` (max 3, post-verdict
// only — V4 §5 Interrogation) renders a light "tap to see the numbers"
// affordance on the first few rows so the tap target isn't undiscoverable
// without resorting to a hover-only hint.
export function CaseRow({ driver, suggested, onTap }: { driver: CaseDriver; suggested: boolean; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 text-left transition-colors hover:border-pi-ink/30"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-pi-ink">{driver.text}</span>
        {suggested && (
          <span className="mt-1 block text-[11px] text-pi-gold-bright">Tap to see the real numbers →</span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-pi-ink">
        {driver.number}
      </span>
    </button>
  )
}
