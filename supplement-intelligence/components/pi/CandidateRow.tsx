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

// Terminal Noir port (2026-07-23): DECISION_CHIP.cls (text-pi-build etc.)
// is tuned for a tinted chip on a WHITE/cream card — those dark verdict
// hues read at ~2:1 against the near-black pi-stage/pi-void surface this
// row now sits on. decisionChip.ts is a SHARED module (also consumed by
// app/research/compare, still cream, and CandidateCoreHero.tsx, mid-port
// by a parallel agent) so it is not edited here — this is a local,
// additive mapping onto the SAME dark-safe verdict tokens tailwind.config
// already ships (`pi-*-noir`), scoped to this Home-exclusive component
// only. `label`/`glyph` still come from the real shared DECISION_CHIP —
// only the color classes are local.
const CHIP_CLS_NOIR: Record<PipelineCandidate['decision'], string> = {
  BUILD_NOW:                   'text-pi-build-noir bg-pi-build-noir/10',
  VALIDATE_FURTHER:            'text-pi-invest-noir bg-pi-invest-noir/10',
  SKIP:                        'text-pi-pass-noir bg-pi-pass-noir/10',
  CATEGORY_CREATION_CANDIDATE: 'text-pi-gold-deep bg-pi-gold-deep/10',
}

export function CandidateRow({ c, index }: { c: PipelineCandidate; index: number }) {
  const reduce = useReducedMotion()
  const chip = DECISION_CHIP[c.decision]
  const chipClsNoir = CHIP_CLS_NOIR[c.decision]

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
      {/* No own card surface — this row lives inside StageGroup's single
          shared GlassPanel (hairline-divided list), Terminal Noir's
          "pipeline row groups" surface. Hover reads via a background wash
          instead of the old per-row lift/shadow, since a per-row glass
          card floating on top of the group's own glass would double up. */}
      <Link
        href={c.memoHref}
        className={cn(
          'group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4',
          'transition-colors duration-200 hover:bg-pi-noir-text/[0.04]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-deep focus-visible:-outline-offset-2',
        )}
      >
        {/* full-width on mobile so the name never starves; flexes inline from sm up */}
        <span className="w-full min-w-0 sm:w-auto sm:flex-1">
          <span className="block truncate text-[15px] font-semibold text-pi-noir-text">{c.name}</span>
          <span className="mt-0.5 block text-xs text-pi-noir-sub">Analyzed {relativeAge(c.createdAtIso)}</span>
        </span>

        {c.insufficientEvidence && (
          <span
            className="hidden items-center gap-1 rounded-full bg-pi-risk-noir/10 px-2.5 py-1 text-[11px] font-semibold text-pi-risk-noir sm:inline-flex"
            title="Flagged as insufficient evidence for this analysis"
          >
            <AlertTriangle size={11} aria-hidden /> thin evidence
          </span>
        )}

        {/* label/glyph from the real shared DECISION_CHIP; color classes are
            the local noir-safe mapping above — see CHIP_CLS_NOIR comment. */}
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide', chipClsNoir)}>
          <span aria-hidden className="text-[9px] leading-none">{chip.glyph}</span>
          {chip.label}
        </span>

        {/* Deliberately neutral (not verdict-colored) — a colored score
            beside a colored chip is exactly the "two colors disagreeing"
            bug class this screen fixed once already; the chip alone is the
            verdict signal. */}
        <span className="w-12 shrink-0 text-right font-mono text-lg font-semibold tabular-nums text-pi-noir-text">
          {c.score}
        </span>

        <ChevronRight
          size={16}
          aria-hidden
          className="shrink-0 text-pi-noir-sub transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-pi-gold-deep"
        />
      </Link>
    </m.li>
  )
}
