'use client'

import Link from 'next/link'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { Plus, Compass } from 'lucide-react'
import { CandidateRow } from './CandidateRow'
import { StageGroup } from './StageGroup'
import { WhatChangedStrip } from './WhatChangedStrip'
import type { PipelineViewModel } from './types'

// UIv2-M1 — the Pipeline home (Screen Definition S1), read-only v1.
// Stage truth today: every analysis is Analyzed; active watchlist rows are
// Shortlisted. Captured / Committed / Killed have no backend yet and render
// as honest ghost stages — never fabricated content.

function anchorSentence(counts: PipelineViewModel['counts']): string {
  const { analyzed, shortlisted } = counts
  if (analyzed + shortlisted === 0) return 'Your pipeline is empty. It won’t stay that way.'
  const parts: string[] = []
  const total = analyzed + shortlisted
  parts.push(`${total} candidate${total === 1 ? '' : 's'}`)
  if (shortlisted > 0) parts.push(`${shortlisted} being watched`)
  return parts.join(' · ') + '.'
}

export function PipelineView({ vm }: { vm: PipelineViewModel }) {
  const reduce = useReducedMotion()
  const shortlisted = vm.candidates.filter(c => c.stage === 'shortlisted')
  const analyzed = vm.candidates.filter(c => c.stage === 'analyzed')
  const empty = vm.candidates.length === 0

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen bg-pi-cream text-pi-ink">
        <main className="mx-auto max-w-3xl px-6 pb-28 pt-14">

          {/* the anchor: one serif sentence stating the founder's true position */}
          <m.header
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10"
          >
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-pi-gold">Pipeline</p>
            <h1 className="font-serif text-[28px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[32px]">
              {anchorSentence(vm.counts)}
            </h1>
          </m.header>

          <WhatChangedStrip items={vm.changed} />

          {/* the two intake doors */}
          <m.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mb-12 flex flex-wrap gap-3"
          >
            <Link
              href="/analyze"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-pi-ink px-5 py-2.5 text-sm font-semibold text-pi-cream shadow-[0_1px_3px_rgba(22,23,26,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_4px_10px_rgba(22,23,26,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright active:scale-[0.985]"
            >
              <Plus size={15} aria-hidden /> Log a hunch
            </Link>
            <span
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-pi-hairline px-5 py-2.5 text-sm font-medium text-pi-faint"
              title="Discovery isn't wired into this build yet — honestly disabled, not hidden"
              aria-disabled="true"
            >
              <Compass size={15} aria-hidden /> Discover — not yet available
            </span>
          </m.div>

          {empty ? (
            /* first-run: teach by structure, never demo data (S1) */
            <div>
              <StageGroup name="Shortlisted" count={0} hint="Ideas you're serious about. Shortlisting arms monitoring — the product starts watching your back." />
              <StageGroup name="Analyzed" count={0} hint="Every idea the engine has examined lands here with its verdict." />
              <StageGroup name="Hunches" count={0} ghost hint="Ideas noted before analysis — arriving in a later release." />
            </div>
          ) : (
            <div>
              <StageGroup name="Shortlisted" count={shortlisted.length} hint="Nothing shortlisted yet — shortlist a candidate to start watching it.">
                {shortlisted.map((c, i) => <CandidateRow key={c.id} c={c} index={i} />)}
              </StageGroup>
              <StageGroup name="Analyzed" count={analyzed.length} hint="No analyzed candidates.">
                {analyzed.map((c, i) => <CandidateRow key={c.id} c={c} index={i} />)}
              </StageGroup>
              <StageGroup name="Hunches" count={0} ghost hint="Capturing ideas before analysis arrives in a later release." />
              <StageGroup name="Committed / Killed" count={0} ghost hint="Commitment and kill records arrive with the ritual flows — nothing is hidden here, they don't exist yet." />
            </div>
          )}

          <p className="mt-14 border-t border-pi-hairline pt-5 text-xs leading-relaxed text-pi-sub">
            Every number on this page traces to your real stored analyses — verdicts, scores, and confidence are
            never re-derived for display, and never re-computed differently on different screens. Confidence is
            gated by an analysis's single weakest input, never averaged. Stages shown as dashed outlines exist in
            the product model but have no data yet.
          </p>
        </main>
      </div>
    </LazyMotion>
  )
}
