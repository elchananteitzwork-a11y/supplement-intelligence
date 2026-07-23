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
  coverageNoteProvenance, categoryCreationProvenance,
} from '@/lib/provenance'
import { EvidenceBadge, ProvenanceCaption, ConfidencePill, deriveConfidenceDisplay, PiCard } from './shared'

// Data-density pass (2026-07-24, owner-approved mockup): this used to be a
// SEPARATE block repeating the exact same 6 dimension rows the Score
// Breakdown section above already lists — one bar-per-dimension for score,
// then this whole second block re-listing the identical dimensions as a
// dot-count-per-dimension for confidence. Merged directly into the Score
// Breakdown loop below instead (bar length = score, a tick mark on the bar
// = confidence) — same two real numbers per dimension, one row instead of
// two. The overall confidence % this header used to show is not lost: it's
// the same number already in the ConfidencePill at the top of this card
// (`deriveConfidenceDisplay(confidenceAssessment)`), so restating it here
// a second time was itself part of the duplication. weakestDimension /
// distinctConfirmingChannels are now one compact sentence under the merged
// list instead of their own header block.

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

  return (
    <PiCard padded={false} className="rounded-2xl p-6 sm:p-8 animate-in">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-pi-ink">Evidence &amp; Confidence</p>
        <ConfidencePill level={confidence.level} note={confidence.note} />
      </div>

      {/* The mobile-only Market/Margin "facts" strip that used to render
          here was cut in the 2026-07-24 data-density pass (owner-approved):
          its Market cell literally displayed a disclaimer ("Not verified")
          styled as a stat value, and the real margin figure already lives
          in the Economics chapter with its full context. */}
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
            {scored.map(d => {
              const conf = confidenceAssessment.dimensions.find(cd => cd.key === d.key)
              const confPct = conf?.confidence !== null && conf?.confidence !== undefined ? Math.round(conf.confidence * 100) : null
              const tickColor = confPct === null ? '' : confPct >= 50 ? 'bg-pi-build' : confPct >= 25 ? 'bg-pi-gold-bright' : 'bg-pi-risk'
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="text-xs text-pi-sub w-40 shrink-0 truncate">{d.label}</span>
                  <div className="relative flex-1 h-1.5 rounded-full bg-pi-hairline overflow-visible">
                    <div className="h-full rounded-full bg-pi-ink" style={{ width: `${(d.rawScore ?? 0) * 10}%` }} />
                    {confPct !== null && (
                      <span
                        className={`absolute -top-0.5 w-0.5 h-2.5 rounded-full ${tickColor}`}
                        style={{ left: `${confPct}%` }}
                        title={`${confPct}% confidence${conf?.channelMismatch ? ' — channel gap' : ''}`}
                      />
                    )}
                  </div>
                  <span className="font-mono text-xs text-pi-sub w-10 text-right shrink-0">{d.rawScore}/10</span>
                  <EvidenceBadge compact type={d.source} source={d.sourceLabel} detail={`Weighted ${Math.round(d.weight * 100)}% of the final score.`} />
                </div>
              )
            })}
          </div>
        )}

        {qualitative.length > 0 && (
          <div className="mt-4 pt-3 border-t border-pi-hairline space-y-2.5">
            <p className="text-[9px] text-pi-faint uppercase tracking-wider">Not Scored — AI Judgment Only, 0% Weight</p>
            {qualitative.map(d => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-xs text-pi-sub w-40 shrink-0 truncate italic">{d.label}</span>
                <span className="flex-1 text-xs text-pi-faint italic">{d.qualitativeLevel ?? 'Not assessed'}</span>
                <EvidenceBadge compact type={d.source} source={d.sourceLabel} detail="Excluded from the 0-100 score entirely — shown for context only, never converted to a number." />
              </div>
            ))}
          </div>
        )}

        {/* Shared legend, once, instead of the old separate "Independence-
            Aware Confidence" header block + its own per-dimension dot-count
            list — same weakest-link/channel facts, one line. */}
        <div className="mt-4 pt-3 border-t border-pi-hairline flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-pi-sub"><span className="w-2 h-2 rounded-full bg-pi-ink" />Verified data</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-pi-sub"><span className="w-2 h-2 rounded-full bg-pi-gold-bright" />AI interpretation</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-pi-sub"><span className="w-2 h-2 rounded-full bg-pi-risk" />Unsupported</span>
          <span className="text-[10px] text-pi-faint">| the tick on each bar is that dimension's confidence</span>
        </div>
        <p className="mt-2 text-[11px] text-pi-sub">
          {confidenceAssessment.weakestDimension
            ? `Weakest link: ${confidenceAssessment.weakestDimension} — confirmed by ${confidenceAssessment.distinctConfirmingChannels} distinct independent channel${confidenceAssessment.distinctConfirmingChannels === 1 ? '' : 's'} across all scored dimensions.`
            : 'No scored dimension had a real confidence reading for this analysis.'}
        </p>
      </div>

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
