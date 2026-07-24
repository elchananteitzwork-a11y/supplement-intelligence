'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { revealTransition, verdictTone, type PullVerb } from '@/lib/partner-copy'
import { logEvent } from '@/lib/positions'
import type { BriefViewModel } from './types'
import { CaseRow } from './CaseRow'
import { InterrogationSheet } from './InterrogationSheet'
import { ReversalConditions } from './ReversalConditions'
import { PullBar } from './PullBar'
import { PullSheet } from './PullSheet'
import { VocabularyTerm } from '../VocabularyTerm'
import { LifecycleArc } from './LifecycleArc'

// ── S-Brief (V4_PRODUCT_ARCHITECTURE.md §5) ──────────────────────────────
// First viewport, exactly three things: the verdict (the only large
// element), the why sentence, the one recommended move. Reveal lands as
// ONE beat (verdict word, then the page; <1s; instant under
// prefers-reduced-motion) — same LazyMotion/useReducedMotion convention
// already used by components/pi/AttentionCard.tsx (identical
// initial/animate between server and client renders; reduced motion is
// honored by zeroing the *transition* duration, never by branching
// initial/animate, which would be a hydration mismatch).
export function BriefView({ vm }: { vm: BriefViewModel }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [openClaimKey, setOpenClaimKey] = useState<string | null>(null)
  const [openPullVerb, setOpenPullVerb] = useState<PullVerb | null>(null)

  useEffect(() => {
    logEvent({ event: 'verdict_viewed', analysisId: vm.analysisId }).catch(err => {
      console.warn('[partner-events] verdict_viewed failed to log (non-blocking):', err)
    })
  }, [vm.analysisId])

  const allDrivers = [...vm.forDrivers, ...vm.againstDrivers]
  const openDriver = allDrivers.find(d => d.claimKey === openClaimKey) ?? null
  const openEvidence = openClaimKey ? vm.claimEvidence[openClaimKey] : undefined
  const tone = verdictTone({ decision: vm.decision, insufficientEvidence: vm.insufficientEvidence })

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen bg-pi-cream pb-28 text-pi-ink">
        <div className="relative mx-auto max-w-[640px] px-5 pt-12 sm:pt-16">

          {/* ── First viewport: exactly three elements ──────────────────
              (1) the answer — the verdict word, WITH conviction folded
              into its own language (V4_PRODUCT_ARCHITECTURE.md §5: "the
              answer ... Conviction is folded into the answer's own
              language" — not a separate 4th paragraph);
              (2) the why sentence;
              (3) the one recommended move.

              QA fix: a min-h-screen wrapper (not content length) is what
              actually guarantees "The Case" starts below the fold — a
              short real analysis (few case rows, one clean why-sentence)
              otherwise leaves enough spare vertical room at 390x844 for
              "The Case" to peek into the first viewport even with a
              structurally-correct 3-element block above it. This reserves
              the full viewport for the answer regardless of how long or
              short its real content happens to be.

              Visual-polish pass (2026-07-24): a soft radial wash tinted by
              the real verdict's tone sits behind the answer — ambient
              depth, not a new claim (color follows the same decision the
              text already carries). Absolutely positioned + aria-hidden so
              it never affects layout or is read by a screen reader.
              Anchored inside the flex-centered block (not the outer
              scroll container) so it tracks the answer's real position —
              content above/below shifts where "centered" lands, and a
              container-top anchor would miss it entirely on a short
              analysis. */}
          <div className="relative flex min-h-screen flex-col justify-center py-10">
            <div
              aria-hidden
              className={`pointer-events-none absolute left-1/2 top-1/2 z-0 h-[440px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-radial ${tone.wash} to-transparent blur-3xl`}
            />
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={revealTransition(!!reduce)}
              className="mb-2 flex items-center gap-2"
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              <h1 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
                {vm.categoryName}
              </h1>
            </m.div>

            {/* (1) The answer */}
            <m.div
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={revealTransition(!!reduce, 0.05)}
              className="mb-6"
            >
              <p className={`text-balance font-serif text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-[46px] ${tone.text}`}>
                {vm.verdictWord}
              </p>
              {!vm.insufficientEvidence && (
                <VocabularyTerm term="conviction" subtitle="Conviction — how sure I am.">
                  <p className="mt-2 text-sm text-pi-sub">{vm.convictionSentence}</p>
                </VocabularyTerm>
              )}
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={revealTransition(!!reduce, 0.12)}
              className="space-y-3"
            >
              {vm.insufficientEvidence ? (
                <>
                  {/* (2) The why sentence — insufficient-evidence variant */}
                  <p className="max-w-[65ch] text-[15px] leading-relaxed text-pi-ink">
                    {vm.emptyChannels.length > 0
                      ? `I don't have real evidence across enough channels yet — empty: ${vm.emptyChannels.join(', ')}.`
                      : "I don't have enough independently-confirmed evidence to call this one yet."}
                  </p>
                </>
              ) : (
                /* (2) The why sentence */
                <p className="max-w-[65ch] text-[15px] leading-relaxed text-pi-ink">{vm.whySentence}</p>
              )}
              {/* (3) The one recommended move (insufficient evidence borrows this slot for the callable condition, its own honest "what would make it callable" instead of a market judgment) */}
              <p className="max-w-[65ch] text-sm font-medium text-pi-ink">
                {vm.insufficientEvidence && vm.callableCondition ? vm.callableCondition : `My call: ${vm.recommendedVerb} — ${vm.recommendedSublabel}.`}
              </p>
            </m.div>
          </div>

          {/* ── One scroll below: the case, the window, reversal conditions, freshness ── */}
          {(vm.forDrivers.length > 0 || vm.againstDrivers.length > 0) && (
            <section className="mb-8">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">The case</p>
              <div className="space-y-2">
                {vm.forDrivers.map((d, i) => (
                  <CaseRow key={d.claimKey} driver={d} suggested={i < 3} polarity="for" onTap={() => setOpenClaimKey(d.claimKey)} />
                ))}
                {vm.againstDrivers.map(d => (
                  <CaseRow key={`against-${d.claimKey}`} driver={d} suggested={false} polarity="against" onTap={() => setOpenClaimKey(d.claimKey)} />
                ))}
              </div>
            </section>
          )}

          {vm.windowText && (
            <section className="mb-8">
              {vm.lifecycle && (
                <div className="mb-3">
                  <LifecycleArc stages={vm.lifecycle.stages} currentIndex={vm.lifecycle.currentIndex} />
                </div>
              )}
              <p className="max-w-[65ch] text-sm text-pi-sub">{vm.windowText}</p>
              {vm.windowNumbers && (
                <p className="mt-1 font-mono text-[11px] tabular-nums text-pi-faint">
                  {vm.windowNumbers.demandLabel} · {vm.windowNumbers.supplyLabel}
                </p>
              )}
            </section>
          )}

          {vm.whyNow && (
            <section className="mb-8">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Why now</p>
              <p className="max-w-[65ch] text-sm leading-relaxed text-pi-ink">{vm.whyNow}</p>
            </section>
          )}

          {vm.channelAgreement && (
            <p className="mb-8 max-w-[65ch] text-xs text-pi-faint">{vm.channelAgreement}</p>
          )}

          <ReversalConditions items={vm.reversalConditions} />

          <p className="mb-3 text-xs text-pi-faint">{vm.freshness}</p>

          <div className="mb-10 flex flex-wrap justify-center gap-5 text-sm text-pi-gold">
            <Link href={`/app/record/${vm.analysisId}`} className="hover:underline">
              Read the full record →
            </Link>
            {vm.hasGapChapter && (
              <Link href={`/app/record/${vm.analysisId}/gap`} className="hover:underline">
                The gap — how you'd win →
              </Link>
            )}
          </div>

          {/* Not Supported fallback (Milestone D) — corpus browsing only,
              never a specific "build this instead" suggestion (RD_V4_
              PHASE2.md §7 Non-goals): a generic link back to the user's own
              other positive-verdict analyses, not a computed alternative. */}
          {!vm.insufficientEvidence && vm.decision === 'SKIP' && (
            <div className="mb-10 text-center">
              <Link href="/app#opportunities" className="text-sm text-pi-gold hover:underline">
                Not what you hoped? Browse other opportunities →
              </Link>
            </div>
          )}
        </div>

        <PullBar
          recommendedVerb={vm.recommendedVerb}
          recommendedSublabel={vm.recommendedSublabel}
          alternativeVerbs={vm.alternativeVerbs}
          onChoose={setOpenPullVerb}
        />

        {openDriver && openEvidence && (
          <InterrogationSheet
            driver={openDriver}
            evidence={openEvidence}
            analysisId={vm.analysisId}
            onClose={() => setOpenClaimKey(null)}
          />
        )}

        {openPullVerb && (
          <PullSheet
            verb={openPullVerb}
            analysisId={vm.analysisId}
            validationSteps={vm.validationSteps}
            validationBudget={vm.validationBudget}
            successMetrics={vm.successMetrics}
            reversalConditions={vm.reversalConditions}
            killRedirect={vm.killRedirect}
            onClose={() => setOpenPullVerb(null)}
            onCommitted={() => router.push('/app')}
          />
        )}
      </div>
    </LazyMotion>
  )
}
