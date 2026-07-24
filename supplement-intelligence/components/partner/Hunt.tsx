'use client'

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { RotorSpinner } from './RotorSpinner'

// ── S-Hunt (V4_PRODUCT_ARCHITECTURE.md §5) ───────────────────────────────
// "Real evidence arriving as it actually arrives — real events only, max
// ~4 visible lines... A batch that completes together is shown completing
// together. Never simulated ticks, never fake incremental progress."
//
// /api/generate is a single request (RD_V4_PHASE1.md §4 risk 1) — there is
// no real per-provider progress signal to show. This renders the checked
// SET (what the run is actually doing) as one honest batch: every line
// present from the first frame, all sharing one real in-flight/done state
// — never a staged timer advancing them one-by-one (the legacy
// app/analyze/page.tsx InvestigationConsole's fixed-interval step timer is
// explicitly not a reference here).
//
// Visual-polish pass (2026-07-24): the stagger below animates all 4 lines
// ENTERING together on mount (a ~40ms offset each, so they read as "here's
// the batch," not "step 2 just finished") — never a per-line completion
// state change over time, which would recreate the fake-incremental-
// progress pattern this component's whole design explicitly rejects.
const CHECKED_SET = [
  'Checking demand',
  'The competitive field',
  'Unit economics',
  'Buyer complaints',
]

export function Hunt({ done }: { done: boolean }) {
  const reduce = useReducedMotion()

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-pi-hairline bg-pi-card px-6 py-7 shadow-[0_1px_3px_rgba(22,23,26,0.05),0_12px_28px_-12px_rgba(22,23,26,0.14)]"
      >
        <div className="mb-5 flex items-center gap-3">
          <RotorSpinner spinning={!done} className="h-7 w-7 shrink-0 text-pi-gold-deep" />
          <p className="text-sm font-medium text-pi-ink">
            {done ? "Done — here's what I found." : "Reading the market on this one…"}
          </p>
        </div>
        <ul className="space-y-2.5">
          {CHECKED_SET.map((line, i) => (
            <m.li
              key={line}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduce ? 0 : 0.35, delay: reduce ? 0 : i * 0.06, ease: 'easeOut' }}
              className="flex items-center gap-2.5 text-sm text-pi-sub"
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-pi-build' : 'bg-pi-gold-deep animate-pulse'}`}
              />
              {line}
            </m.li>
          ))}
        </ul>
        {!done && (
          <p className="mt-5 text-xs text-pi-faint">
            You can leave — the run completes on the server. I'll have it waiting for you.
          </p>
        )}
      </div>
    </LazyMotion>
  )
}
