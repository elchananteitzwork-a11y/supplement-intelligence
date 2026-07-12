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
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'

const PILL_CFG: Record<BuildDecision, { label: string; bg: string; text: string }> = {
  BUILD_NOW:                   { label: 'Entry Supported',     bg: 'bg-verdict-positive', text: 'text-white' },
  VALIDATE_FURTHER:            { label: 'Validation Required', bg: 'bg-verdict-caution',  text: 'text-black' },
  SKIP:                        { label: 'Not Supported',       bg: 'bg-verdict-negative', text: 'text-white' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation',   bg: 'bg-black',            text: 'text-white' },
}

function RadialGauge({ pct }: { pct: number }) {
  const r = 40, c = 2 * Math.PI * r
  return (
    <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e2e2" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="#000000" strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[9px] leading-none uppercase text-outline">Grounded</span>
        <span className="font-bold text-lg leading-none mt-1">{pct}%</span>
      </div>
    </div>
  )
}

export default function CurrentSignal({ m }: { m: MemoData; generatedAt?: string }) {
  const { score, decision, groundedPct, insufficientEvidence } = computeGroundedScore(m)
  const cfg = insufficientEvidence ? { label: 'Insufficient Data', bg: 'bg-white border-2 border-black', text: 'text-ink' } : PILL_CFG[decision]
  const consumerIntelTimedOut = !m.consumer_intelligence && !!m.signal_metadata?.consumer_intelligence_attempted

  return (
    <section id="current-signal" className="scroll-mt-20">
      <div className="flex items-center justify-between gap-6 p-6 sm:p-8 border-2 border-black bg-white">
        <div className="min-w-0">
          <p className="text-[10px] font-mono text-outline uppercase tracking-widest mb-2">Current Signal</p>
          <div className={`inline-block px-4 py-2 font-bold text-headline-md leading-none mb-1 ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </div>
          <p className="font-mono text-xs text-outline mt-2">{m.category_name} — {score} / 100</p>
        </div>
        <RadialGauge pct={groundedPct} />
      </div>

      {consumerIntelTimedOut && (
        <div className="mt-3 border border-black bg-white px-3 py-2.5">
          <p className="text-xs font-semibold text-verdict-caution-text mb-0.5">Partial results available</p>
          <p className="text-[11px] text-ink-variant">Most real-data providers responded normally. The Consumer Intelligence review-data provider timed out for this run.</p>
        </div>
      )}
    </section>
  )
}
