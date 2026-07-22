'use client'

import Link from 'next/link'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { ChangedItem } from './types'

// Home rebuild (UIv2-M3) — renders the SAME derived attention events
// derive.ts already produces (`analysis-complete` / `stale-watch`, real
// FRESH_WINDOW_MS / STALE_WATCH_MS thresholds, unchanged) in the mockup's
// card layout (design-prototypes/home-cream.html). All fields below are
// composed from already-derived real values (ChangedItem + the matching
// PipelineCandidate's real decision/score) — no new derivation logic.
export interface AttentionItemVM {
  key: string
  kind: ChangedItem['kind']
  name: string
  href: string
  /** Fully-composed real sentence tail, e.g. "finished analyzing — verdict: Build now, score 71."
   *  or "is shortlisted but its evidence is 3 weeks old." */
  message: string
  /** "6h ago" for analysis-complete (real timestamp); "watched" (a stage label, not a timestamp) for stale-watch. */
  whenLabel: string
  actionLabel: string
}

export function AttentionCard({ item, index }: { item: AttentionItemVM; index: number }) {
  const reduce = useReducedMotion()
  const isStale = item.kind === 'stale-watch'

  return (
    <m.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(0.06 * index, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className="flex items-start justify-between gap-3.5 rounded-2xl border border-pi-hairline bg-pi-card px-5 py-4 shadow-[0_1px_3px_rgba(22,23,26,0.05)] sm:items-center sm:gap-4"
    >
      <span
        aria-hidden
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full sm:mt-0', isStale ? 'bg-pi-risk' : 'bg-pi-gold-deep')}
      />
      <p className="flex-1 text-sm leading-relaxed text-pi-ink">
        <b className="font-semibold">{item.name}</b> {item.message}
      </p>
      <span className="hidden shrink-0 whitespace-nowrap font-mono text-[10.5px] text-pi-sub sm:block">{item.whenLabel}</span>
      <Link
        href={item.href}
        className="shrink-0 whitespace-nowrap text-xs font-semibold text-pi-gold transition-colors duration-150 hover:text-pi-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright"
      >
        {item.actionLabel}
      </Link>
    </m.li>
  )
}
