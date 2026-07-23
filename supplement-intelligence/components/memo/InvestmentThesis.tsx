// ═══════════════════════════════════════════════════════════════════════
// Investment Thesis Detail — opens with the real thesis reasoning that
// doesn't fit Stitch's single-paragraph "The Thesis" pattern (why_now,
// writer_output.causal_paragraph, verdict confidence — relocated here from
// MemoDisplay.tsx's TheThesis, which was previously overloaded with these
// extra blocks; Stitch's canonical Investor Report §2 is one bordered
// blockquote and nothing else), then bull/bear case synthesis, then first
// validation plan. This component is real synthesis-of-existing-evidence
// with no Stitch section of its own (see docs/STITCH_NARRATIVE_REMAPPING.md
// §1) — kept as a disclosed extension, not deleted, restyled onto the
// row-based evidence pattern used throughout the rest of the report
// (Demand Intensity, Supply Landscape) instead of the old numbered-list-
// with-bracket-tag format, and renamed "Top 3 Reasons to Build"/"Top 3
// Risks" to "Bull Case"/"Bear Case" — matching the investor-memo voice
// Stitch's own Kill Criteria section uses ("we would reverse this verdict
// if…"), not the old app's internal tagging vocabulary.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import { IconTrendUp, IconTrendDown, IconBeaker, IconArrowRight } from '@/components/icons'
import { computeVerdictConfidence } from '@/lib/ai-interpretation/verdict'
import {
  EvidenceBadge, ConfidencePill, SEVERITY_CFG, PiCard,
  deriveDecisionBlocks, deriveTop3Build, deriveTop3Risks, deriveValidationSteps,
} from './shared'

const BLOCK_CFG = [
  { key: 'win'      as const, Icon: IconTrendUp,    title: 'Why this could win',      head: 'text-pi-build-noir' },
  { key: 'fail'     as const, Icon: IconTrendDown,  title: 'Why this could fail',     head: 'text-pi-risk-noir' },
  { key: 'validate' as const, Icon: IconBeaker,     title: 'Validate first',          head: 'text-pi-gold-bright' },
  { key: 'angle'    as const, Icon: IconArrowRight, title: 'Recommended entry angle', head: 'text-pi-noir-text' },
]

const CONFIDENCE_LABEL: Record<'HIGH' | 'MODERATE' | 'LOW', string> = { HIGH: 'High confidence', MODERATE: 'Moderate confidence', LOW: 'Limited confidence' }
const CONFIDENCE_EXPLANATION: Record<'HIGH' | 'MODERATE' | 'LOW', string> = {
  HIGH:     'Three or more independent data sources agree on this conclusion.',
  MODERATE: 'Based on limited independent confirmation — reasonable estimate, not fully verified.',
  LOW:      'Insufficient data to reach a confident conclusion. Treat this verdict with caution.',
}

export default function InvestmentThesis({ m, decision }: { m: MemoData; decision: BuildDecision }) {
  const blocks = deriveDecisionBlocks(m)
  const buildPts = deriveTop3Build(m)
  const risks    = deriveTop3Risks(m)
  const steps    = deriveValidationSteps(m, decision)

  const { writer_output, expandable_cards, first_screen_signal_ids } = m
  const hasWriterLayer = !!(writer_output && expandable_cards && first_screen_signal_ids)
  const verdictConfidence = hasWriterLayer ? computeVerdictConfidence(expandable_cards!) : null

  return (
    <PiCard padded={false} className="rounded-2xl overflow-hidden animate-in">
      <div className="px-gutter py-5 border-b border-pi-noir-hairline flex items-center justify-end gap-3">
        <EvidenceBadge
          type="synthesized"
          detail="This section re-ranks and restates the dimension scores and market fields shown elsewhere in this memo — it does not add independent evidence of its own."
        />
      </div>

      <div className="px-gutter py-6 space-y-6">
        {(m.why_now || hasWriterLayer) && (
          <div className="space-y-3 pb-6 border-b border-pi-noir-hairline">
            {hasWriterLayer && (
              <ConfidencePill level={verdictConfidence === 'HIGH' ? 'High' : verdictConfidence === 'MODERATE' ? 'Medium' : 'Low'} note={CONFIDENCE_LABEL[verdictConfidence!]} />
            )}
            {hasWriterLayer && <p className="text-[11px] text-pi-noir-sub leading-relaxed">{CONFIDENCE_EXPLANATION[verdictConfidence!]}</p>}
            {hasWriterLayer && <p className="text-[15px] text-pi-noir-sub leading-[1.7]">{writer_output!.causal_paragraph}</p>}
            {m.why_now && (
              <div>
                <p className="text-[10px] text-pi-noir-sub uppercase tracking-widest mb-1.5">Why Now</p>
                <p className="text-sm text-pi-noir-sub leading-relaxed">{m.why_now}</p>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {BLOCK_CFG.map(b => (
            <div key={b.key} className="rounded-lg border border-pi-noir-hairline p-4">
              <div className={`flex items-center gap-1.5 mb-2 ${b.head}`}>
                <b.Icon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{b.title}</span>
              </div>
              <p className="text-xs text-pi-noir-sub leading-relaxed">{blocks[b.key]}</p>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] text-pi-noir-sub uppercase tracking-wider mb-2.5">Bull Case</p>
            <div className="rounded-lg border border-pi-noir-hairline divide-y divide-pi-noir-hairline overflow-hidden">
              {buildPts.map((pt, i) => (
                <div key={i} className="px-3 py-2.5">
                  <p className="text-xs text-pi-noir-sub leading-relaxed">{pt.text}</p>
                  <p className={`text-[10px] mt-1 font-mono ${pt.evidence ? 'text-pi-build-noir' : 'text-pi-noir-sub'}`}>
                    {pt.evidence ? pt.evidence : 'Model judgment — no independent evidence'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-pi-noir-sub uppercase tracking-wider mb-2.5">Bear Case</p>
            <div className="rounded-lg border border-pi-noir-hairline divide-y divide-pi-noir-hairline overflow-hidden">
              {risks.map((r, i) => {
                const cfg = SEVERITY_CFG[r.severity]
                return (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-pi-noir-sub leading-relaxed flex-1">{r.text}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] rounded-full border px-1.5 py-0.5 shrink-0 ${cfg.cls}`}>
                        <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />{r.severity}
                      </span>
                    </div>
                    <p className={`text-[10px] mt-1 font-mono ${r.evidence ? 'text-pi-build-noir' : 'text-pi-noir-sub'}`}>
                      {r.evidence ? r.evidence : 'Model judgment — no independent evidence'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-pi-elevated p-4">
          <p className="text-[10px] text-pi-noir-sub uppercase tracking-wider mb-2.5">Next 30–60 Days</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-pi-noir-sub leading-relaxed">
                <span className="font-mono text-pi-noir-sub shrink-0 mt-px w-4 text-right">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PiCard>
  )
}
