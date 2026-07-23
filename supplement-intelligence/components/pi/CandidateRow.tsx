'use client'

import Link from 'next/link'
import { m, useReducedMotion } from 'framer-motion'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PipelineCandidate } from './types'
import { DECISION_CHIP } from './decisionChip'

function relativeAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 28) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export function CandidateRow({ c, index }: { c: PipelineCandidate; index: number }) {
  const reduce = useReducedMotion()
  const chip = DECISION_CHIP[c.decision]

  return (
    // Real hydration-mismatch fix (found live, on a machine with OS-level
    // reduced motion actually ON): `useReducedMotion()` reads `null` during
    // SSR (no `window`) but the real client-side value synchronously on
    // first render — for a `prefers-reduced-motion: reduce` user, the
    // server computed `initial={{opacity:0,y:16}}` while the client
    // computed `initial={false}` (renders straight at the animate target),
    // a genuine style-attribute mismatch React's hydration check caught.
    // `initial`/`animate` must stay IDENTICAL between server and client's
    // first render; reduced motion is honored by zeroing the *transition*
    // duration/delay instead (duration:0 = instant, visually equivalent to
    // no animation, and transition config isn't part of what hydration
    // diffs).
    <m.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : Math.min(0.06 * index, 0.48), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={c.memoHref}
        className={cn(
          'group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-pi-hairline bg-pi-card px-5 py-4',
          'shadow-[0_1px_3px_rgba(22,23,26,0.06)] transition-all duration-200',
          'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(22,23,26,0.05),0_10px_20px_rgba(22,23,26,0.08)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright',
        )}
      >
        {/* full-width on mobile so the name never starves; flexes inline from sm up */}
        <span className="w-full min-w-0 sm:w-auto sm:flex-1">
          <span className="block truncate text-[15px] font-semibold text-pi-ink">{c.name}</span>
          <span className="mt-0.5 block text-xs text-pi-sub">Analyzed {relativeAge(c.createdAtIso)}</span>
        </span>

        {c.insufficientEvidence && (
          <span
            className="hidden items-center gap-1 rounded-full bg-pi-risk/10 px-2.5 py-1 text-[11px] font-semibold text-pi-risk sm:inline-flex"
            title="Flagged as insufficient evidence for this analysis"
          >
            <AlertTriangle size={11} aria-hidden /> thin evidence
          </span>
        )}

        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide', chip.cls)}>
          <span aria-hidden className="text-[9px] leading-none">{chip.glyph}</span>
          {chip.label}
        </span>

        <span className="w-12 shrink-0 text-right font-mono text-lg font-semibold tabular-nums text-pi-ink">
          {c.score}
        </span>

        <ChevronRight
          size={16}
          aria-hidden
          className="shrink-0 text-pi-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-pi-gold"
        />
      </Link>
    </m.li>
  )
}
