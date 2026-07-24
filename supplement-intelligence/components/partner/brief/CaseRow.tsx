'use client'

import type { CaseDriver } from '@/lib/partner-copy'

// One row of "The Case" (V4_PRODUCT_ARCHITECTURE.md §5): words left, one
// real number right, the whole row a tap target that opens the grounded
// evidence sheet for exactly that claim. `suggested` (max 3, post-verdict
// only — V4 §5 Interrogation) renders a light "tap to see the numbers"
// affordance on the first few rows so the tap target isn't undiscoverable
// without resorting to a hover-only hint.
//
// `polarity` is a pure visual read of which real list (forDrivers vs
// againstDrivers) the caller already put this row in — no new claim, just
// making an existing distinction legible at a glance via a left accent
// instead of requiring every row to be read to tell for from against.
export function CaseRow({
  driver, suggested, polarity, onTap,
}: {
  driver: CaseDriver
  suggested: boolean
  polarity: 'for' | 'against'
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`group relative flex w-full items-start justify-between gap-4 overflow-hidden rounded-xl border border-pi-hairline bg-pi-card py-3.5 pl-5 pr-4 text-left shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)]`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${polarity === 'for' ? 'bg-pi-build' : 'bg-pi-risk'} opacity-60 transition-opacity group-hover:opacity-100`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-pi-ink">{driver.text}</span>
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
