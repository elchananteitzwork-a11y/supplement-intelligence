'use client'

import Link from 'next/link'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { GlassPanel } from '@/components/cine/GlassPanel'
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
    // Real hydration-mismatch fix (found live via qa-production-agent, on a
    // machine with OS-level reduced motion actually ON): `useReducedMotion()`
    // reads `null` during SSR (no `window`) but the real client-side value
    // synchronously on first render — for a `prefers-reduced-motion: reduce`
    // user, the server computed `initial={{opacity:0,y:10}}` while the
    // client computed `initial={false}` (renders straight at the animate
    // target), a genuine style-attribute mismatch React's hydration check
    // caught. `initial`/`animate` must stay IDENTICAL between server and
    // client's first render; reduced motion is honored by zeroing the
    // *transition* duration/delay instead (duration:0 = instant, visually
    // equivalent to no animation, and transition config isn't part of what
    // hydration diffs). Same fix applied to CandidateRow.tsx's identical
    // pattern.
    <m.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : Math.min(0.06 * index, 0.3), ease: [0.16, 1, 0.3, 1] }}
    >
      {/* One GlassPanel per attention item — the "attention cards" surface
          named in the Terminal Noir rollout instructions. */}
      <GlassPanel radius="rounded-2xl" className="flex items-start justify-between gap-3.5 px-5 py-4 sm:items-center sm:gap-4">
        <span
          aria-hidden
          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full sm:mt-0', isStale ? 'bg-pi-risk-noir' : 'bg-pi-gold-deep')}
        />
        <p className="flex-1 text-sm leading-relaxed text-pi-noir-text">
          <b className="font-semibold">{item.name}</b> {item.message}
        </p>
        <span className="hidden shrink-0 whitespace-nowrap font-mono text-[10.5px] text-pi-noir-sub sm:block">{item.whenLabel}</span>
        <Link
          href={item.href}
          className="shrink-0 whitespace-nowrap text-xs font-semibold text-pi-gold-deep transition-colors duration-150 hover:text-pi-noir-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-deep"
        >
          {item.actionLabel}
        </Link>
      </GlassPanel>
    </m.li>
  )
}
