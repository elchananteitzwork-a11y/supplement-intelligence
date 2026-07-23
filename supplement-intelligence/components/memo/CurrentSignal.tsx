'use client'

// ═══════════════════════════════════════════════════════════════════════
// Current Signal — canonical Stitch section (Investor Report §1):
// `<h2>Current Signal</h2>` + a large solid-fill verdict pill
// (`bg-[#5C7A29] text-white px-4 py-2 text-headline-md`) + a circular
// "phase" gauge, inside one bordered panel. Replaces the old
// FirstScreenSummary.tsx "Investment Dossier" hero card — that component
// was never restructured to match Stitch's actual compact scale for this
// section; see docs/STITCH_NARRATIVE_REMAPPING.md and the follow-up
// migration checklist. Real per-opportunity signal-card list
// (writer_output.causal_paragraph, risk_sentence, per-dimension SignalRow
// cards) has been relocated: causal_paragraph + confidence now open The
// Thesis section (it's reasoning, not verdict display); risk_sentence now
// opens Strategic Readiness (it's a risk statement, the same family as
// that section's existing Risk Assessment); the per-dimension SignalRow
// mini-cards were dropped outright — superseded by the much more detailed
// real evidence panels Demand Intensity/Concordance and Supply Landscape
// already render further down, so keeping both was pure duplication.
//
// Phase 3 integration (Roadmap M2.2/M2.4, 2026-07-13): Stitch's circular
// "phase" gauge used to show groundedPct (Evidence Breadth's grounded
// flag) as a stand-in — groundedPct is a binary 0/100 value, not a
// continuous quantity, so a circular gauge could only ever show a full or
// empty ring. That stand-in is replaced here with the real lifecycle
// stage (lib/lifecycle.ts), using the same LifecycleArc primitive already
// built for exactly this "real, sparse discrete-stage data" case
// (components/ui/LifecycleArc.tsx). Also adds, as new real rows within
// this same bordered panel (not a new section, not a layout change): the
// real gap-velocity metric and the Roadmap M2.4 V2 verdict/quality — kept
// visually and semantically separate from the legacy BuildDecision pill
// per explicit instruction, since the two verdict systems are independent
// and not guaranteed to agree.
//
// Roadmap M2.23 (2026-07-14) hid the V2 verdict row behind a "Show
// technical detail →" toggle. Data-density pass (2026-07-24, owner-
// approved mockup, option B) goes further: a second complete verdict
// system — even collapsed — answers the same question as the pill above
// it, and its own caption admitted the two are "not guaranteed to match."
// The toggle and the V2 row/badge are gone; in their place, a single
// cross-check line renders ONLY when the two verdict systems genuinely
// disagree (see field-derivations.ts's deriveVerdictCrossCheck for the
// conservative agreement bands). When they agree — the common case —
// nothing extra renders at all.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { LifecycleArc } from '@/components/ui'
import { lifecycleProvenance, gapVelocityProvenance, v2VerdictProvenance } from '@/lib/provenance'
import { ProvenanceBadge, deriveLifecycleDisplay, formatGapVelocity, deriveVerdictCrossCheck, LabNoData } from './shared'

// pi-* decision colors — same mapping as CandidateCoreHero's DECISION_COLOR
// (components/pi/candidate-core/CandidateCoreHero.tsx) so this legacy
// build-decision pill reads as one continuous verdict language with the
// hero directly above it, not two different palettes for the same value.
const PILL_CFG: Record<BuildDecision, { label: string; cls: string }> = {
  BUILD_NOW:                   { label: 'Entry Supported',     cls: 'bg-pi-build text-pi-cream' },
  VALIDATE_FURTHER:            { label: 'Validation Required', cls: 'bg-pi-invest text-pi-cream' },
  SKIP:                        { label: 'Not Supported',       cls: 'bg-pi-pass text-pi-cream' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation',   cls: 'bg-pi-gold-deep text-pi-ink' },
}

function LifecycleStageBlock({ m }: { m: MemoData }) {
  const lifecycle = deriveLifecycleDisplay(m)
  if (!lifecycle) {
    return (
      <div className="w-full sm:w-auto sm:min-w-[280px] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-mono text-pi-faint uppercase tracking-widest">Lifecycle Stage</span>
        </div>
        <LabNoData label="Not computed for this analysis" />
      </div>
    )
  }
  return (
    <div className="w-full sm:w-auto sm:min-w-[280px] shrink-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] font-mono text-pi-faint uppercase tracking-widest">Lifecycle Stage</span>
        <ProvenanceBadge p={lifecycleProvenance()} />
      </div>
      <LifecycleArc stages={lifecycle.stages} currentIndex={lifecycle.currentIndex} variant="pi" />
      {lifecycle.unmeasuredScience && (
        <p className="text-[10px] text-pi-faint italic mt-2">Classified without a real Science-dimension signal for this query.</p>
      )}
    </div>
  )
}

function GapVelocityRow({ m }: { m: MemoData }) {
  const gv = formatGapVelocity(m.gap_velocity)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-pi-hairline pt-3 mt-3">
      <span className="text-[10px] font-mono text-pi-faint uppercase tracking-widest">Gap Velocity</span>
      {gv ? (
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${gv.value > 0 ? 'text-pi-build' : gv.value < 0 ? 'text-pi-risk' : 'text-pi-sub'}`}>{gv.display}</span>
          <ProvenanceBadge p={gapVelocityProvenance()} />
        </div>
      ) : <LabNoData label="Not available — demand or supply acceleration missing" />}
    </div>
  )
}

// Renders ONLY on real disagreement between the two verdict systems —
// null (nothing at all) when they agree or when V2 wasn't computed. The
// legacy pill's own label is passed in so the sentence names both sides
// with the exact wording the reader sees on screen.
function VerdictCrossCheckRow({ m, decision, decisionLabel }: { m: MemoData; decision: BuildDecision; decisionLabel: string }) {
  const cc = deriveVerdictCrossCheck(decision, m.opportunity_quality, m.market_verdict)
  if (!cc) return null
  return (
    <div className="flex items-start justify-between gap-3 border-t border-pi-hairline pt-3 mt-3">
      <p className="flex items-start gap-2 text-[11px] text-pi-sub leading-relaxed">
        <span aria-hidden className="shrink-0 text-pi-gold-bright">⚠</span>
        <span>
          Cross-check: the model&apos;s own quality score ({cc.qualityScore}/100, {cc.qualityTier}) leans {cc.direction} —
          &ldquo;{cc.v2Label},&rdquo; not &ldquo;{decisionLabel}.&rdquo;
        </span>
      </p>
      <ProvenanceBadge p={v2VerdictProvenance()} />
    </div>
  )
}

export default function CurrentSignal({ m }: { m: MemoData; generatedAt?: string }) {
  const { score, decision, insufficientEvidence } = computeGroundedScore(m)
  const cfg = insufficientEvidence ? { label: 'Insufficient Data', cls: 'bg-pi-card border border-pi-hairline text-pi-ink' } : PILL_CFG[decision]
  const consumerIntelTimedOut = !m.consumer_intelligence && !!m.signal_metadata?.consumer_intelligence_attempted

  return (
    <section id="current-signal" className="scroll-mt-20">
      <div className="rounded-2xl p-6 sm:p-8 border border-pi-hairline bg-pi-card">
        {/* Pre-beta audit fix: this row never stacked below `sm`, but
            LifecycleStageBlock's own wrapper (w-full sm:w-auto) assumes a
            parent that does — the two together forced real, measured
            horizontal overflow at 375px (confirmed: 463px rendered width).
            flex-col sm:flex-row is the actual fix; LifecycleStageBlock's
            classes were already correct, this was the missing half. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-pi-faint uppercase tracking-widest mb-2">Current Signal</p>
            <div className={`inline-block px-4 py-2 rounded-full font-bold text-[20px] leading-none mb-1 ${cfg.cls}`}>
              {cfg.label}
            </div>
            <p className="font-mono text-xs text-pi-faint mt-2">{m.category_name} — {score} / 100</p>
          </div>
          <LifecycleStageBlock m={m} />
        </div>

        <GapVelocityRow m={m} />
        {/* No cross-check when the pill itself says "Insufficient Data" —
            there's no real verdict on this side to compare against. */}
        {!insufficientEvidence && <VerdictCrossCheckRow m={m} decision={decision} decisionLabel={cfg.label} />}
      </div>

      {consumerIntelTimedOut && (
        <div className="mt-3 rounded-lg border border-pi-hairline bg-pi-card px-3 py-2.5">
          <p className="text-xs font-semibold text-pi-gold-bright mb-0.5">Partial results available</p>
          <p className="text-[11px] text-pi-sub">Most real-data providers responded normally. The Consumer Intelligence review-data provider timed out for this run.</p>
        </div>
      )}
    </section>
  )
}
