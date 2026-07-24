'use client'

// V4-native lifecycle indicator (V4 Phase 2). Deliberately NOT a reuse of
// components/ui/LifecycleArc — that module is banned from this namespace
// by eslint.config.mjs's V4 reset rule, regardless of its 'pi' variant.
// Same real 6-stage data (components/memo/field-derivations.ts's
// LIFECYCLE_STAGES via deriveLifecycleDisplay), rebuilt as a plain dot-line
// using this namespace's own pi-* tokens and voice conventions.
export function LifecycleArc({ stages, currentIndex }: { stages: string[]; currentIndex: number }) {
  const activeLabel = stages[currentIndex] ?? null
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center" role="img" aria-label={`Category lifecycle: ${activeLabel ?? 'unknown'}`}>
        {stages.map((label, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          const isLast = i === stages.length - 1
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <span
                aria-hidden
                className={
                  active
                    ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-pi-gold-deep shadow-[0_0_0_3px_rgba(212,169,74,0.18)]'
                    : done
                      ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-pi-ink'
                      : 'h-1.5 w-1.5 shrink-0 rounded-full border border-pi-hairline bg-pi-card'
                }
              />
              {!isLast && <span aria-hidden className={`mx-1 h-[1.5px] flex-1 ${done ? 'bg-pi-ink' : 'bg-pi-hairline'}`} />}
            </div>
          )
        })}
      </div>
      {activeLabel && (
        <span aria-hidden className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-pi-gold-deep">
          {activeLabel}
        </span>
      )}
    </div>
  )
}
