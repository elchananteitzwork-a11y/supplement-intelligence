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
// Roadmap M2.23 (2026-07-14, Analyst Experience Consolidation): the V2
// verdict/quality row above was rendering unconditionally, which meant
// this screen showed two complete verdict systems at once — a real
// violation of the locked "one visible verdict vocabulary" / "progressive
// disclosure" principles, self-acknowledged by this file's own prior
// comment ("not guaranteed to agree"). It's now collapsed by default
// behind TechnicalDetailToggle, same "Show ... more →" idiom already used
// by shared.tsx's NumList and KeywordIntelligence.tsx's
// ExpandableKeywordTable — no data, computation, or prop changed, only
// default visibility. The legacy BuildDecision pill remains the one
// unconditional, primary verdict on this screen.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { MemoData, BuildDecision } from '@/types/index'
import type { MarketVerdict as V2Verdict } from '@/lib/verdict-matrix'
import { computeGroundedScore } from '@/lib/scoring'
import { LifecycleArc } from '@/components/ui'
import { lifecycleProvenance, gapVelocityProvenance, v2VerdictProvenance } from '@/lib/provenance'
import { ProvenanceBadge, deriveLifecycleDisplay, formatGapVelocity, deriveV2VerdictDisplay, LabNoData } from './shared'

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

// components/ui/VerdictBadge.tsx renders the legacy black/white verdict-*
// vocabulary and is still used by several out-of-scope pages (dashboard,
// leaderboard, watchlist, alerts) — inlined here instead of reused so this
// screen doesn't reintroduce that palette next to the pi-* hero above it.
const V2_VERDICT_CFG: Record<V2Verdict, { label: string; cls: string }> = {
  BUILD_NOW:                { label: 'Build Now',                cls: 'text-pi-build-noir border-pi-build-noir/40 bg-pi-build-noir/10' },
  BUILD_IF_DIFFERENTIATED:  { label: 'Build If Differentiated',   cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH_CLOSELY:            { label: 'Watch Closely',             cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH:                    { label: 'Watch',                     cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  INVESTIGATE:              { label: 'Investigate',               cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  AVOID:                    { label: 'Avoid',                     cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
  PASS:                     { label: 'Pass',                      cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
}

function V2VerdictBadge({ verdict }: { verdict: V2Verdict }) {
  const cfg = V2_VERDICT_CFG[verdict]
  return (
    <span className={`inline-flex items-center font-bold uppercase tracking-wide rounded-full border text-[10px] px-2.5 py-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function LifecycleStageBlock({ m }: { m: MemoData }) {
  const lifecycle = deriveLifecycleDisplay(m)
  if (!lifecycle) {
    return (
      <div className="w-full sm:w-auto sm:min-w-[280px] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest">Lifecycle Stage</span>
        </div>
        <LabNoData label="Not computed for this analysis" />
      </div>
    )
  }
  return (
    <div className="w-full sm:w-auto sm:min-w-[280px] shrink-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest">Lifecycle Stage</span>
        <ProvenanceBadge p={lifecycleProvenance()} />
      </div>
      <LifecycleArc stages={lifecycle.stages} currentIndex={lifecycle.currentIndex} variant="pi-noir" />
      {lifecycle.unmeasuredScience && (
        <p className="text-[10px] text-pi-noir-sub italic mt-2">Classified without a real Science-dimension signal for this query.</p>
      )}
    </div>
  )
}

function GapVelocityRow({ m }: { m: MemoData }) {
  const gv = formatGapVelocity(m.gap_velocity)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-pi-noir-hairline pt-3 mt-3">
      <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest">Gap Velocity</span>
      {gv ? (
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm ${gv.value > 0 ? 'text-pi-build-noir' : gv.value < 0 ? 'text-pi-risk-noir' : 'text-pi-noir-sub'}`}>{gv.display}</span>
          <ProvenanceBadge p={gapVelocityProvenance()} />
        </div>
      ) : <LabNoData label="Not available — demand or supply acceleration missing" />}
    </div>
  )
}

function V2VerdictRow({ m }: { m: MemoData }) {
  const v2 = deriveV2VerdictDisplay(m.opportunity_quality, m.market_verdict)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-pi-noir-hairline pt-3 mt-3">
      <div>
        <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest">Alternate Verdict Check</span>
        <p className="text-[9px] text-pi-noir-sub italic mt-0.5">Separate, parallel verdict — not guaranteed to match the pill above.</p>
      </div>
      {v2 ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-pi-noir-sub">Quality {v2.qualityScore}/100 ({v2.qualityTier})</span>
          <V2VerdictBadge verdict={v2.verdict} />
          <ProvenanceBadge p={v2VerdictProvenance()} />
        </div>
      ) : <LabNoData label="Not computed for this analysis" />}
    </div>
  )
}

// Roadmap M2.23 — collapsed by default, same "Show ... →" idiom already
// used by components/memo/shared.tsx's NumList and KeywordIntelligence.tsx's
// ExpandableKeywordTable, reused here rather than inventing a new pattern.
// Keeps the legacy build-decision pill as the one unconditional, primary
// verdict on this screen; the second (V2) verdict system stays fully
// intact and unchanged, just pulled rather than pushed — per the locked
// "progressive disclosure" / "one visible verdict vocabulary" principles.
function TechnicalDetailToggle({ m }: { m: MemoData }) {
  const [expanded, setExpanded] = useState(false)
  if (expanded) return <V2VerdictRow m={m} />
  return (
    <div className="flex items-center justify-between gap-3 border-t border-pi-noir-hairline pt-3 mt-3">
      <span className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest">Technical Detail</span>
      <button onClick={() => setExpanded(true)} className="text-[11px] text-pi-gold-bright hover:underline transition-colors">
        Show technical detail →
      </button>
    </div>
  )
}

export default function CurrentSignal({ m }: { m: MemoData; generatedAt?: string }) {
  const { score, decision, insufficientEvidence } = computeGroundedScore(m)
  const cfg = insufficientEvidence ? { label: 'Insufficient Data', cls: 'bg-pi-elevated border border-pi-noir-hairline text-pi-noir-text' } : PILL_CFG[decision]
  const consumerIntelTimedOut = !m.consumer_intelligence && !!m.signal_metadata?.consumer_intelligence_attempted

  return (
    <section id="current-signal" className="scroll-mt-20">
      <div className="rounded-2xl p-6 sm:p-8 border border-pi-noir-hairline bg-pi-elevated">
        {/* Pre-beta audit fix: this row never stacked below `sm`, but
            LifecycleStageBlock's own wrapper (w-full sm:w-auto) assumes a
            parent that does — the two together forced real, measured
            horizontal overflow at 375px (confirmed: 463px rendered width).
            flex-col sm:flex-row is the actual fix; LifecycleStageBlock's
            classes were already correct, this was the missing half. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-pi-noir-sub uppercase tracking-widest mb-2">Current Signal</p>
            <div className={`inline-block px-4 py-2 rounded-full font-bold text-[20px] leading-none mb-1 ${cfg.cls}`}>
              {cfg.label}
            </div>
            <p className="font-mono text-xs text-pi-noir-sub mt-2">{m.category_name} — {score} / 100</p>
            <p className="text-[9px] text-pi-noir-sub uppercase tracking-wider mt-1">Legacy build-decision verdict</p>
          </div>
          <LifecycleStageBlock m={m} />
        </div>

        <GapVelocityRow m={m} />
        <TechnicalDetailToggle m={m} />
      </div>

      {consumerIntelTimedOut && (
        <div className="mt-3 rounded-lg border border-pi-noir-hairline bg-pi-elevated px-3 py-2.5">
          <p className="text-xs font-semibold text-pi-gold-bright mb-0.5">Partial results available</p>
          <p className="text-[11px] text-pi-noir-sub">Most real-data providers responded normally. The Consumer Intelligence review-data provider timed out for this run.</p>
        </div>
      )}
    </section>
  )
}
