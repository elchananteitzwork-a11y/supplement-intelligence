'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { GlassPanel } from '@/components/cine/GlassPanel'

// A stage is a named group in a calm vertical list — deliberately NOT a
// kanban column (Screen Definition S1: stage transitions are rituals with
// consequences; drag-and-drop would trivialize them).
//
// Terminal Noir port (2026-07-23): the real-rows case now sits inside one
// shared GlassPanel per stage (the "pipeline row groups" surface named in
// the noir rollout instructions) — individual CandidateRow items are plain
// hairline-divided rows inside it, not each its own floating card. Ghost /
// empty-stage dashed placeholders stay lightweight (no glass) since there
// is nothing real to give weight to.
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
        <h2 className={cn('text-sm font-bold tracking-wide text-pi-noir-text', ghost && 'text-pi-noir-sub')}>{name}</h2>
        <span className="font-mono text-xs tabular-nums text-pi-noir-sub">{count}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-pi-noir-hairline to-transparent" aria-hidden />
      </div>
      {ghost ? (
        <p className="rounded-xl border border-dashed border-pi-noir-hairline px-5 py-4 text-[13px] italic text-pi-noir-sub">
          {hint}
        </p>
      ) : count === 0 ? (
        <p className="rounded-xl border border-dashed border-pi-noir-hairline px-5 py-4 text-[13px] text-pi-noir-sub">{hint}</p>
      ) : (
        <GlassPanel radius="rounded-xl">
          <ul className="divide-y divide-pi-noir-hairline">{children}</ul>
        </GlassPanel>
      )}
    </section>
  )
}
