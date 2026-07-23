'use client'

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
const CHECKED_SET = [
  'Checking demand',
  'The competitive field',
  'Unit economics',
  'Buyer complaints',
]

export function Hunt({ done }: { done: boolean }) {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-pi-hairline bg-pi-card px-6 py-7">
      <p className="mb-4 text-sm font-medium text-pi-ink">
        {done ? "Done — here's what I found." : "Reading the market on this one…"}
      </p>
      <ul className="space-y-2">
        {CHECKED_SET.map(line => (
          <li key={line} className="flex items-center gap-2.5 text-sm text-pi-sub">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-pi-build' : 'bg-pi-gold-deep animate-pulse'}`}
            />
            {line}
          </li>
        ))}
      </ul>
      {!done && (
        <p className="mt-5 text-xs text-pi-faint">
          You can leave — the run completes on the server. I'll have it waiting for you.
        </p>
      )}
    </div>
  )
}
