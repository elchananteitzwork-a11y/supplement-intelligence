// ═══════════════════════════════════════════════════════════════════════
// Evidence & Confidence — coverage, score breakdown, evidence breadth +
// sources, and consistency checks. Direct successor to the old
// EvidenceConfidenceSection in components/MemoDisplay.tsx — identical
// computations (computeEvidenceCoverage, computeGroundedScore,
// checkConsistency), restyled onto HardCard/WitnessDots.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import type { ConfidenceAssessment } from '@/lib/confidence'
import { computeGroundedScore, CHANNEL_COVERAGE_NOTES } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import { HardCard, WitnessDots } from '@/components/ui'
import {
  computeEvidenceCoverage, opportunityScoreProvenance,
  consistencyFlagProvenance, evidenceBreadthProvenance, channelConcentrationProvenance,
  coverageNoteProvenance, categoryCreationProvenance, confidenceAssessmentProvenance,
} from '@/lib/provenance'
import { EvidenceBadge, ProvenanceCaption, ConfidencePill, shortFactValue, deriveConfidenceDisplay } from './shared'

// Roadmap M1.4 (Phase 3 integration) — real independence-aware confidence
// breakdown per scored dimension. Reuses WitnessDots (already the real
// evidence-breadth primitive elsewhere in this exact file) for each
// dimension's own confirmingChannelCount/witnesses.length, instead of a
// single opaque number.
function IndependenceConfidenceBlock({ assessment }: { assessment: ConfidenceAssessment }) {
  const pct = assessment.overallConfidence !== null ? Math.round(assessment.overallConfidence * 100) : null
  return (
    <div className="mt-7 pt-6 border-t border-black">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[10px] text-outline uppercase tracking-widest">Independence-Aware Confidence</p>
        <span className={`font-mono text-lg font-bold ${pct !== null && pct >= 50 ? 'text-verdict-positive' : pct !== null && pct >= 25 ? 'text-verdict-caution-text' : 'text-outline'}`}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <p className="text-[11px] text-ink-variant mb-1">
        {assessment.weakestDimension
          ? `Weakest-link composite — capped by "${assessment.weakestDimension}," this analysis's least-evidenced load-bearing dimension.`
          : 'No scored dimension had a real confidence reading for this analysis.'}
      </p>
      <p className="text-[11px] text-ink-variant mb-3">
        Confirmed by {assessment.distinctConfirmingChannels} distinct independent channel{assessment.distinctConfirmingChannels === 1 ? '' : 's'} across all scored dimensions.
      </p>
      <ProvenanceCaption p={confidenceAssessmentProvenance()} />

      <div className="mt-3 space-y-2.5">
        {assessment.dimensions.map(d => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-xs text-ink-variant w-40 shrink-0 truncate">{d.label}</span>
            {d.confidence !== null ? (
              <>
                <WitnessDots filled={d.confirmingChannelCount} total={Math.max(d.witnesses.length, d.confirmingChannelCount, 1)} size="sm" />
                <span className="font-mono text-xs text-ink-variant w-10 text-right shrink-0">{Math.round(d.confidence * 100)}%</span>
              </>
            ) : (
              <span className="flex-1 text-xs text-outline italic">No real evidence to be confident about</span>
            )}
            {d.channelMismatch && <span className="text-[9px] text-verdict-caution-text uppercase tracking-wider shrink-0">Channel gap</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EvidenceConfidence({
  m, decision, confidenceAssessment,
}: {
  m: MemoData; decision: BuildDecision
  confidenceAssessment: ConfidenceAssessment
}) {
  const cov = computeEvidenceCoverage(m)
  const { dimensions, groundedPct, insufficientEvidence, evidenceBreadth, categoryCreationContext } = computeGroundedScore(m)
  const scored      = dimensions.filter(d => d.weight > 0)
  const qualitative = dimensions.filter(d => d.weight === 0)
  const contributedChannels = evidenceBreadth.channelBreakdown.filter(c => c.contributed)
  const flags = checkConsistency(m, decision)
  const confidence = deriveConfidenceDisplay(confidenceAssessment)
  const facts = ([
    ['Market', m.market_size ? 'Not independently verified — AI estimate only' : undefined],
    ['Margin', m.gross_margin],
  ] as [string, string | undefined][]).filter((p): p is [string, string] => !!p[1] && p[1] !== 'N/A')

  return (
    <HardCard className="animate-in">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-black">Evidence &amp; Confidence</p>
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>

      {facts.length > 0 && (
        <div className="flex gap-6 mb-6 pb-6 border-b border-black sm:hidden">
          {facts.map(([l, v]) => (
            <div key={l} className="text-center">
              <p className="text-[10px] text-outline uppercase tracking-wider">{l}</p>
              <p className="font-mono text-xs font-semibold text-verdict-caution-text mt-0.5">{shortFactValue(v)}</p>
            </div>
          ))}
        </div>
      )}

      {categoryCreationContext && (
        <div className="mb-5 bg-white border border-black px-3.5 py-3">
          <p className="text-[9px] text-black uppercase tracking-widest font-semibold mb-1.5">Category Creation Candidate</p>
          <ProvenanceCaption p={categoryCreationProvenance(categoryCreationContext.broadQuery)} />
        </div>
      )}

      {/* Evidence Coverage */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-[10px] text-outline uppercase tracking-widest">Evidence Coverage</p>
          <span className={`font-mono text-lg font-bold ${cov.pct >= 50 ? 'text-verdict-positive' : cov.pct >= 25 ? 'text-verdict-caution-text' : 'text-verdict-negative'}`}>{cov.pct}%</span>
        </div>
        <div className="h-1.5 bg-outline-variant overflow-hidden mb-2">
          <div className={`h-full ${cov.pct >= 50 ? 'bg-verdict-positive' : cov.pct >= 25 ? 'bg-verdict-caution' : 'bg-verdict-negative'}`} style={{ width: `${cov.pct}%` }} />
        </div>
        <p className="text-[11px] text-ink-variant">
          {cov.groundedCount} of {cov.totalCount} report fields are backed by real provider data ({cov.verifiedCount} verified, {cov.estimatedCount} estimated) — the rest ({cov.synthesizedCount + cov.unknownCount}) are AI judgment or unavailable for this query.
        </p>
      </div>

      {/* Score Breakdown */}
      <div className="mt-7 pt-6 border-t border-black">
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">
          Score Breakdown {insufficientEvidence ? '— insufficient real evidence to score' : `— ${groundedPct}% grounded in real data`}
        </p>
        <ProvenanceCaption p={opportunityScoreProvenance(groundedPct, insufficientEvidence)} />

        {scored.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {scored.map(d => (
              <div key={d.key}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-variant w-40 shrink-0 truncate">{d.label}</span>
                  <div className="flex-1 h-1.5 bg-outline-variant overflow-hidden">
                    <div className="h-full bg-black" style={{ width: `${(d.rawScore ?? 0) * 10}%` }} />
                  </div>
                  <span className="font-mono text-xs text-ink-variant w-10 text-right shrink-0">{d.rawScore}/10</span>
                  <EvidenceBadge type={d.source} source={d.sourceLabel} detail={`Weighted ${Math.round(d.weight * 100)}% of the final score.`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {qualitative.length > 0 && (
          <div className="mt-4 pt-3 border-t border-black space-y-2.5">
            <p className="text-[9px] text-outline uppercase tracking-wider">Not Scored — AI Judgment Only, 0% Weight</p>
            {qualitative.map(d => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-xs text-ink-variant w-40 shrink-0 truncate italic">{d.label}</span>
                <span className="flex-1 text-xs text-outline italic">{d.qualitativeLevel ?? 'Not assessed'}</span>
                <EvidenceBadge type={d.source} source={d.sourceLabel} detail="Excluded from the 0-100 score entirely — shown for context only, never converted to a number." />
              </div>
            ))}
          </div>
        )}
      </div>

      <IndependenceConfidenceBlock assessment={confidenceAssessment} />

      {/* Evidence Breadth + Sources */}
      <div className="mt-7 pt-6 border-t border-black">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <p className="text-[9px] text-outline uppercase tracking-wider">Evidence Breadth</p>
          <span className="font-mono text-xs text-ink-variant">{evidenceBreadth.contributingProviders.length} / {evidenceBreadth.totalScoreEligibleProviders} providers</span>
        </div>
        <WitnessDots filled={evidenceBreadth.contributingProviders.length} total={evidenceBreadth.totalScoreEligibleProviders} />
        <div className="mt-3"><ProvenanceCaption p={evidenceBreadthProvenance()} /></div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {evidenceBreadth.channelBreakdown.map(c => (
            <span
              key={c.channel}
              title={CHANNEL_COVERAGE_NOTES[c.channel]}
              className={`text-[10px] px-2 py-1 border ${c.contributed ? 'text-verdict-positive bg-white border-black' : 'text-outline bg-surface-container border-black'}`}
            >
              {c.label}
            </span>
          ))}
        </div>

        <p className="mt-2.5 text-[10px] text-outline">
          {evidenceBreadth.crossChannelCorroborated
            ? `Corroborated across ${evidenceBreadth.distinctChannelTypes} distinct channel types.`
            : contributedChannels.length === 1
              ? `Backed by only one channel type (${contributedChannels[0].label}) — no independent corroboration from a different kind of source.`
              : 'No real channel contributed evidence to this score.'}
        </p>
        <div className="mt-2"><ProvenanceCaption p={channelConcentrationProvenance()} /></div>

        {evidenceBreadth.contributingProviders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-black">
            <p className="text-[9px] text-outline uppercase tracking-wider mb-2">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {evidenceBreadth.contributingProviders.map(p => (
                <span key={p} className="font-mono text-[10px] text-black bg-white border border-black px-2 py-1">{p}</span>
              ))}
            </div>
          </div>
        )}

        {contributedChannels.length > 0 && (
          <div className="mt-3 space-y-1">
            {contributedChannels.map(c => (
              <p key={c.channel} className="text-[10px] text-outline leading-relaxed">
                <span className="text-ink-variant">{c.label}:</span> {CHANNEL_COVERAGE_NOTES[c.channel]}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2"><ProvenanceCaption p={coverageNoteProvenance()} /></div>
      </div>

      {/* Consistency Check */}
      <div className="mt-7 pt-6 border-t border-black">
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">Consistency Check</p>
        {flags.length === 0 ? (
          <ProvenanceCaption p={{ level: 'verified', source: 'Consistency check', detail: 'No contradictions found between this memo’s claims and the real evidence collected for it.' }} />
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => <ProvenanceCaption key={i} p={consistencyFlagProvenance(f)} />)}
          </div>
        )}
      </div>
    </HardCard>
  )
}
