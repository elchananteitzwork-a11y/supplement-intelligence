// ═══════════════════════════════════════════════════════════════════════
// Evidence & Confidence — coverage, score breakdown, evidence breadth +
// sources, and consistency checks. Direct successor to the old
// EvidenceConfidenceSection in components/MemoDisplay.tsx — identical
// computations (computeEvidenceCoverage, computeGroundedScore,
// checkConsistency), restyled onto PiCard/WitnessDots (pi-* migration,
// UIv2-M2 Phase 2, 2026-07-21 — was HardCard/WitnessDots).
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData, BuildDecision } from '@/types/index'
import type { ConfidenceAssessment } from '@/lib/confidence'
import { computeGroundedScore, CHANNEL_COVERAGE_NOTES } from '@/lib/scoring'
import { checkConsistency } from '@/lib/consistency'
import { WitnessDots } from '@/components/ui'
import {
  computeEvidenceCoverage, opportunityScoreProvenance,
  consistencyFlagProvenance, evidenceBreadthProvenance, channelConcentrationProvenance,
  coverageNoteProvenance, categoryCreationProvenance, confidenceAssessmentProvenance,
} from '@/lib/provenance'
import { EvidenceBadge, ProvenanceCaption, ConfidencePill, shortFactValue, deriveConfidenceDisplay, PiCard } from './shared'

// Roadmap M1.4 (Phase 3 integration) — real independence-aware confidence
// breakdown per scored dimension. Reuses WitnessDots (already the real
// evidence-breadth primitive elsewhere in this exact file) for each
// dimension's own confirmingChannelCount/witnesses.length, instead of a
// single opaque number.
function IndependenceConfidenceBlock({ assessment }: { assessment: ConfidenceAssessment }) {
  const pct = assessment.overallConfidence !== null ? Math.round(assessment.overallConfidence * 100) : null
  return (
    <div className="mt-7 pt-6 border-t border-pi-hairline">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[10px] text-pi-faint uppercase tracking-widest">Independence-Aware Confidence</p>
        <span className={`font-mono text-lg font-bold ${pct !== null && pct >= 50 ? 'text-pi-build' : pct !== null && pct >= 25 ? 'text-pi-gold-bright' : 'text-pi-faint'}`}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <p className="text-[11px] text-pi-sub mb-1">
        {assessment.weakestDimension
          ? `Weakest-link composite — capped by "${assessment.weakestDimension}," this analysis's least-evidenced load-bearing dimension.`
          : 'No scored dimension had a real confidence reading for this analysis.'}
      </p>
      <p className="text-[11px] text-pi-sub mb-3">
        Confirmed by {assessment.distinctConfirmingChannels} distinct independent channel{assessment.distinctConfirmingChannels === 1 ? '' : 's'} across all scored dimensions.
      </p>
      <ProvenanceCaption p={confidenceAssessmentProvenance()} />

      <div className="mt-3 space-y-2.5">
        {assessment.dimensions.map(d => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-xs text-pi-sub w-40 shrink-0 truncate">{d.label}</span>
            {d.confidence !== null ? (
              <>
                <WitnessDots filled={d.confirmingChannelCount} total={Math.max(d.witnesses.length, d.confirmingChannelCount, 1)} size="sm" variant="pi" />
                <span className="font-mono text-xs text-pi-sub w-10 text-right shrink-0">{Math.round(d.confidence * 100)}%</span>
              </>
            ) : (
              <span className="flex-1 text-xs text-pi-faint italic">No real evidence to be confident about</span>
            )}
            {d.channelMismatch && <span className="text-[9px] text-pi-gold-bright uppercase tracking-wider shrink-0">Channel gap</span>}
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
    <PiCard padded={false} className="rounded-2xl p-6 sm:p-8 animate-in">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-pi-ink">Evidence &amp; Confidence</p>
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>

      {facts.length > 0 && (
        <div className="flex gap-6 mb-6 pb-6 border-b border-pi-hairline sm:hidden">
          {facts.map(([l, v]) => (
            <div key={l} className="text-center">
              <p className="text-[10px] text-pi-faint uppercase tracking-wider">{l}</p>
              <p className="font-mono text-xs font-semibold text-pi-gold-bright mt-0.5">{shortFactValue(v)}</p>
            </div>
          ))}
        </div>
      )}

      {categoryCreationContext && (
        <div className="mb-5 rounded-lg border border-pi-hairline bg-pi-card px-3.5 py-3">
          <p className="text-[9px] text-pi-ink uppercase tracking-widest font-semibold mb-1.5">Category Creation Candidate</p>
          <ProvenanceCaption p={categoryCreationProvenance(categoryCreationContext.broadQuery)} />
        </div>
      )}

      {/* Evidence Coverage */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="text-[10px] text-pi-faint uppercase tracking-widest">Evidence Coverage</p>
          <span className={`font-mono text-lg font-bold ${cov.pct >= 50 ? 'text-pi-build' : cov.pct >= 25 ? 'text-pi-gold-bright' : 'text-pi-risk'}`}>{cov.pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-pi-hairline overflow-hidden mb-2">
          <div className={`h-full ${cov.pct >= 50 ? 'bg-pi-build' : cov.pct >= 25 ? 'bg-pi-gold-deep' : 'bg-pi-risk'}`} style={{ width: `${cov.pct}%` }} />
        </div>
        <p className="text-[11px] text-pi-sub">
          {cov.groundedCount} of {cov.totalCount} report fields are backed by real provider data ({cov.verifiedCount} verified, {cov.estimatedCount} estimated) — the rest ({cov.synthesizedCount + cov.unknownCount}) are AI judgment or unavailable for this query.
        </p>
      </div>

      {/* Score Breakdown */}
      <div className="mt-7 pt-6 border-t border-pi-hairline">
        <p className="text-[10px] text-pi-faint uppercase tracking-widest mb-3">
          Score Breakdown {insufficientEvidence ? '— insufficient real evidence to score' : `— ${groundedPct}% grounded in real data`}
        </p>
        <ProvenanceCaption p={opportunityScoreProvenance(groundedPct, insufficientEvidence)} />

        {scored.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {scored.map(d => (
              <div key={d.key}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-pi-sub w-40 shrink-0 truncate">{d.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-pi-hairline overflow-hidden">
                    <div className="h-full bg-pi-ink" style={{ width: `${(d.rawScore ?? 0) * 10}%` }} />
                  </div>
                  <span className="font-mono text-xs text-pi-sub w-10 text-right shrink-0">{d.rawScore}/10</span>
                  <EvidenceBadge type={d.source} source={d.sourceLabel} detail={`Weighted ${Math.round(d.weight * 100)}% of the final score.`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {qualitative.length > 0 && (
          <div className="mt-4 pt-3 border-t border-pi-hairline space-y-2.5">
            <p className="text-[9px] text-pi-faint uppercase tracking-wider">Not Scored — AI Judgment Only, 0% Weight</p>
            {qualitative.map(d => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-xs text-pi-sub w-40 shrink-0 truncate italic">{d.label}</span>
                <span className="flex-1 text-xs text-pi-faint italic">{d.qualitativeLevel ?? 'Not assessed'}</span>
                <EvidenceBadge type={d.source} source={d.sourceLabel} detail="Excluded from the 0-100 score entirely — shown for context only, never converted to a number." />
              </div>
            ))}
          </div>
        )}
      </div>

      <IndependenceConfidenceBlock assessment={confidenceAssessment} />

      {/* Evidence Breadth + Sources */}
      <div className="mt-7 pt-6 border-t border-pi-hairline">
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <p className="text-[9px] text-pi-faint uppercase tracking-wider">Evidence Breadth</p>
          <span className="font-mono text-xs text-pi-sub">{evidenceBreadth.contributingProviders.length} / {evidenceBreadth.totalScoreEligibleProviders} providers</span>
        </div>
        <WitnessDots filled={evidenceBreadth.contributingProviders.length} total={evidenceBreadth.totalScoreEligibleProviders} variant="pi" />
        <div className="mt-3"><ProvenanceCaption p={evidenceBreadthProvenance()} /></div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {evidenceBreadth.channelBreakdown.map(c => (
            <span
              key={c.channel}
              title={CHANNEL_COVERAGE_NOTES[c.channel]}
              className={`text-[10px] rounded-full px-2 py-1 border ${c.contributed ? 'text-pi-build bg-pi-card border-pi-hairline' : 'text-pi-faint bg-pi-sand border-pi-hairline'}`}
            >
              {c.label}
            </span>
          ))}
        </div>

        <p className="mt-2.5 text-[10px] text-pi-faint">
          {evidenceBreadth.crossChannelCorroborated
            ? `Corroborated across ${evidenceBreadth.distinctChannelTypes} distinct channel types.`
            : contributedChannels.length === 1
              ? `Backed by only one channel type (${contributedChannels[0].label}) — no independent corroboration from a different kind of source.`
              : 'No real channel contributed evidence to this score.'}
        </p>
        <div className="mt-2"><ProvenanceCaption p={channelConcentrationProvenance()} /></div>

        {evidenceBreadth.contributingProviders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-pi-hairline">
            <p className="text-[9px] text-pi-faint uppercase tracking-wider mb-2">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {evidenceBreadth.contributingProviders.map(p => (
                <span key={p} className="font-mono text-[10px] text-pi-ink bg-pi-card border border-pi-hairline rounded-full px-2 py-1">{p}</span>
              ))}
            </div>
          </div>
        )}

        {contributedChannels.length > 0 && (
          <div className="mt-3 space-y-1">
            {contributedChannels.map(c => (
              <p key={c.channel} className="text-[10px] text-pi-faint leading-relaxed">
                <span className="text-pi-sub">{c.label}:</span> {CHANNEL_COVERAGE_NOTES[c.channel]}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2"><ProvenanceCaption p={coverageNoteProvenance()} /></div>
      </div>

      {/* Consistency Check */}
      <div className="mt-7 pt-6 border-t border-pi-hairline">
        <p className="text-[10px] text-pi-faint uppercase tracking-widest mb-3">Consistency Check</p>
        {flags.length === 0 ? (
          <ProvenanceCaption p={{ level: 'verified', source: 'Consistency check', detail: 'No contradictions found between this memo’s claims and the real evidence collected for it.' }} />
        ) : (
          <div className="space-y-2">
            {flags.map((f, i) => <ProvenanceCaption key={i} p={consistencyFlagProvenance(f)} />)}
          </div>
        )}
      </div>
    </PiCard>
  )
}
