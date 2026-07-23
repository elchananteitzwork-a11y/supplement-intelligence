'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// A stage is a named group in a calm vertical list — deliberately NOT a
// kanban column (Screen Definition S1: stage transitions are rituals with
// consequences; drag-and-drop would trivialize them).
export function StageGroup({
  name,
  count,
  hint,
  ghost = false,
  children,
}: {
  name: string
  count: number
  /** One-line meaning of the stage — always shown for ghosts, title elsewhere. */
  hint: string
  /** Ghost stages exist in the model but have no backend yet — shown honestly empty. */
  ghost?: boolean
  children?: ReactNode
}) {
  return (
    <section aria-label={name} className="mb-8">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className={cn('text-sm font-bold tracking-wide text-pi-ink', ghost && 'text-pi-faint')}>{name}</h2>
        <span className="font-mono text-xs tabular-nums text-pi-sub">{count}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-pi-hairline to-transparent" aria-hidden />
      </div>
      {ghost ? (
        <p className="rounded-xl border border-dashed border-pi-ink/15 px-5 py-4 text-[13px] italic text-pi-sub">
          {hint}
        </p>
      ) : count === 0 ? (
        <p className="rounded-xl border border-dashed border-pi-ink/15 px-5 py-4 text-[13px] text-pi-sub">{hint}</p>
      ) : (
        <ul className="space-y-2.5">{children}</ul>
      )}
    </section>
  )
}
