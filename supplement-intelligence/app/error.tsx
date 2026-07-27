'use client'

// Root error boundary (beta-basics pass, 2026-07-27): before this file
// existed, any uncaught runtime error rendered Next's unstyled default
// screen. Same pi register as not-found.tsx. `reset()` re-renders the
// segment — the honest first remedy for transient failures.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-pi-cream px-4 font-sans">
      <div className="max-w-[420px] space-y-5 text-center">
        <p className="font-serif text-[26px] font-semibold leading-snug tracking-tight text-pi-ink">
          Something broke on my side.
        </p>
        <p className="text-sm leading-relaxed text-pi-sub">
          Not your fault — the page hit an error while rendering. Your data is untouched; trying again usually fixes it.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] uppercase tracking-wider text-pi-faint">Error ref: {error.digest}</p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-pi-ink px-5 py-2.5 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B]"
          >
            Try again
          </button>
          <a
            href="/app"
            className="rounded-xl border border-pi-hairline bg-pi-card px-5 py-2.5 text-sm font-medium text-pi-ink shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  )
}
