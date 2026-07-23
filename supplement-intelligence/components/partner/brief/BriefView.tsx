'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import type { PullVerb } from '@/lib/partner-copy'
import { logEvent } from '@/lib/positions'
import type { BriefViewModel } from './types'
import { CaseRow } from './CaseRow'
import { InterrogationSheet } from './InterrogationSheet'
import { ReversalConditions } from './ReversalConditions'
import { PullBar } from './PullBar'
import { PullSheet } from './PullSheet'
import { VocabularyTerm } from '../VocabularyTerm'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.analysisId])

  const allDrivers = [...vm.forDrivers, ...vm.againstDrivers]
  const openDriver = allDrivers.find(d => d.claimKey === openClaimKey) ?? null
  const openEvidence = openClaimKey ? vm.claimEvidence[openClaimKey] : undefined

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-screen bg-pi-cream pb-28 text-pi-ink">
        <div className="mx-auto max-w-[640px] px-5 pt-12 sm:pt-16">

          {/* ── First viewport: exactly three elements ──────────────────
              (1) the answer — the verdict word, WITH conviction folded
              into its own language (V4_PRODUCT_ARCHITECTURE.md §5: "the
              answer ... Conviction is folded into the answer's own
              language" — not a separate 4th paragraph);
              (2) the why sentence;
              (3) the one recommended move. */}
          <m.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold"
          >
            {vm.categoryName}
          </m.h1>

          {/* (1) The answer */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <p className="font-serif text-[34px] font-semibold leading-tight tracking-tight text-pi-ink sm:text-[42px]">
              {vm.verdictWord}
            </p>
            {!vm.insufficientEvidence && (
              <VocabularyTerm term="conviction" subtitle="Conviction — how sure I am.">
                <p className="mt-1.5 text-sm text-pi-sub">{vm.convictionSentence}</p>
              </VocabularyTerm>
            )}
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8 space-y-3"
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

          {/* ── One scroll below: the case, the window, reversal conditions, freshness ── */}
          {(vm.forDrivers.length > 0 || vm.againstDrivers.length > 0) && (
            <section className="mb-8">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">The case</p>
              <div className="space-y-2">
                {vm.forDrivers.map((d, i) => (
                  <CaseRow key={d.claimKey} driver={d} suggested={i < 3} onTap={() => setOpenClaimKey(d.claimKey)} />
                ))}
                {vm.againstDrivers.map(d => (
                  <CaseRow key={`against-${d.claimKey}`} driver={d} suggested={false} onTap={() => setOpenClaimKey(d.claimKey)} />
                ))}
              </div>
            </section>
          )}

          {vm.windowText && (
            <p className="mb-8 max-w-[65ch] text-sm text-pi-sub">{vm.windowText}</p>
          )}

          <ReversalConditions items={vm.reversalConditions} />

          <p className="mb-10 text-xs text-pi-faint">{vm.freshness}</p>
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
