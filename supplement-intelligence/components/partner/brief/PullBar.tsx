'use client'

import { useState } from 'react'
import type { PullVerb } from '@/lib/partner-copy'

// Thumb-zone bottom bar (V4_PRODUCT_ARCHITECTURE.md §5 S-Pull): ONE
// recommended primary action, alternatives behind "or…". 44px+ targets.
export function PullBar({
  recommendedVerb, recommendedSublabel, alternativeVerbs, onChoose,
}: {
  recommendedVerb: PullVerb
  recommendedSublabel: string
  alternativeVerbs: PullVerb[]
  onChoose: (verb: PullVerb) => void
}) {
  const [showAlts, setShowAlts] = useState(false)

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pi-hairline bg-pi-cream/90 px-5 py-3 shadow-[0_-8px_24px_-8px_rgba(22,23,26,0.14)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[640px] items-center gap-3">
        <button
          type="button"
          onClick={() => onChoose(recommendedVerb)}
          className="min-h-[44px] flex-1 rounded-xl bg-pi-ink px-5 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_8px_20px_-6px_rgba(22,23,26,0.4)] active:translate-y-0"
        >
          {recommendedVerb} <span className="font-normal opacity-70">— {recommendedSublabel}</span>
        </button>

        {!showAlts ? (
          <button
            type="button"
            onClick={() => setShowAlts(true)}
            className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-pi-sub hover:text-pi-ink"
          >
            or…
          </button>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            {alternativeVerbs.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => onChoose(v)}
                className="min-h-[44px] rounded-xl border border-pi-hairline bg-pi-card px-3.5 text-sm text-pi-sub hover:border-pi-ink/30 hover:text-pi-ink"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
