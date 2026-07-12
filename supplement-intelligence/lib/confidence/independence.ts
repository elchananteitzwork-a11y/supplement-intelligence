// ── Independence-aware confidence — core computation ─────────────────────────
//
// V2 Blueprint §10. Three components, exactly as specified:
//   1. Sample sufficiency — already enforced upstream: a dimension cannot
//      reach weight > 0 ('verified') without first passing its own
//      real-data minimum-sample gates inside lib/scoring.ts (e.g.
//      THIN_SAMPLE_THRESHOLD, REVIEW_MOAT_MIN_REVIEWS, keyword specificity
//      floors). Re-implementing a parallel sample-size check here would
//      duplicate that logic rather than reuse it, so this module trusts
//      "weight > 0" as sample sufficiency already having been cleared.
//   2. Source reliability — lib/confidence/priors.ts.
//   3. Channel independence — this file: how many distinct channels
//      actually confirmed a dimension for THIS query, each counted once at
//      its max reliability regardless of how many same-channel signals
//      exist.
//
// Formula: confidence(dimension) = 1 − Π(1 − rᵢ) over distinct confirming
// channels i. Composite: weakest-link (min), never an average.
//
// ARCHITECTURE: takes only the two fields it needs (dimensions +
// evidenceBreadth), not a full GroundedScore — this lets lib/scoring.ts's
// channel-independence gate (Milestone 3) call it mid-computation, before
// `decision` exists yet, without constructing a fake GroundedScore. A full
// GroundedScore still satisfies this type structurally, so the Milestone 2
// call site (app/api/generate/route.ts, post-computeGroundedScore) is
// unaffected. Pure and read-only either way: never mutates its input, and
// computing it never changes score, decision, or weights on its own — it
// only ever becomes a decision input where lib/scoring.ts explicitly wires
// it into a gate (see computeChannelIndependenceGateTier).
import type { ScoreDimension, EvidenceBreadth, ChannelType } from '@/lib/scoring'
import { DIMENSION_ELIGIBLE_CHANNELS, DIMENSION_ELIGIBLE_PROVIDERS } from './eligibility'
import { reliabilityOf } from './priors'
import type { ConfidenceAssessment, DimensionConfidence, ChannelWitness } from './types'

// 1.1.0 (Roadmap M1.3, 2026-07-12): no formula change here — the version
// bump reflects that the channels this module reads from eligibility.ts
// changed meaning (social_community split into social_attention /
// consumer_voice / paid_media in lib/scoring.ts's PROVIDER_CHANNEL). A
// virality confidence computed under 1.0.0 for a query where both tiktok
// and meta-ads fired would have seen 1 confirming channel; the same query
// re-run under 1.1.0 sees up to 3 — not comparable across this boundary,
// same convention as SCORING_ENGINE_VERSION bumps in lib/scoring.ts.
export const CONFIDENCE_MODEL_VERSION = '1.1.0'

export interface ConfidenceInput {
  dimensions:      ScoreDimension[]
  evidenceBreadth: EvidenceBreadth
}

function computeDimensionConfidence(
  dim: ScoreDimension,
  evidenceBreadth: EvidenceBreadth,
): DimensionConfidence {
  const eligibleChannels  = DIMENSION_ELIGIBLE_CHANNELS[dim.key]  ?? []
  const eligibleProviders = new Set(DIMENSION_ELIGIBLE_PROVIDERS[dim.key] ?? [])

  // No real evidence basis at all (excluded or qualitative-only dimension)
  // — report no confidence rather than a fabricated default.
  if (dim.weight === 0) {
    return {
      key: dim.key, label: dim.label, confidence: null,
      witnesses: eligibleChannels.map((channel): ChannelWitness => ({
        channel, confirmed: false, providers: [], reliability: 0,
      })),
      confirmingChannelCount: 0,
      channelMismatch: false,
    }
  }

  const witnesses: ChannelWitness[] = eligibleChannels.map((channel): ChannelWitness => {
    const entry = evidenceBreadth.channelBreakdown.find((c: { channel: ChannelType }) => c.channel === channel)
    // Only credit providers that (a) actually contributed to THIS channel
    // on THIS query per real evidenceBreadth data, AND (b) are structurally
    // eligible to have fed THIS specific dimension (not a same-channel
    // provider that only ever feeds a different dimension).
    const realProviders = (entry?.providers ?? []).filter(p => eligibleProviders.has(p))
    if (!entry?.contributed || realProviders.length === 0) {
      return { channel, confirmed: false, providers: [], reliability: 0 }
    }
    const reliability = Math.max(...realProviders.map(reliabilityOf))
    return { channel, confirmed: true, providers: realProviders, reliability }
  })

  const confirmed = witnesses.filter(w => w.confirmed)

  // A verified (weight > 0) dimension with zero confirming channels is a
  // structural gap in the eligibility map, not a real "no evidence" case —
  // flag it rather than silently reporting null or a fabricated number.
  if (confirmed.length === 0) {
    return {
      key: dim.key, label: dim.label, confidence: null, witnesses,
      confirmingChannelCount: 0, channelMismatch: true,
    }
  }

  // 1 − Π(1 − rᵢ): each additional distinct channel raises confidence
  // (multiplicatively, with diminishing returns); a second same-channel
  // provider within an already-confirmed channel changes nothing, because
  // it was already folded into that channel's single max-reliability term.
  const confidence = 1 - confirmed.reduce((acc, w) => acc * (1 - w.reliability), 1)

  return {
    key: dim.key, label: dim.label,
    confidence: Math.round(confidence * 1000) / 1000,
    witnesses,
    confirmingChannelCount: confirmed.length,
    channelMismatch: false,
  }
}

export function computeConfidenceAssessment(input: ConfidenceInput): ConfidenceAssessment {
  const dimensions = input.dimensions.map(d => computeDimensionConfidence(d, input.evidenceBreadth))

  // confidence is non-null only when weight > 0 (see computeDimensionConfidence) —
  // filtering on confidence alone is sufficient to select verified dimensions.
  const scored = dimensions.filter((d): d is DimensionConfidence & { confidence: number } => d.confidence !== null)

  let overallConfidence: number | null = null
  let weakestDimension:  string | null = null
  if (scored.length > 0) {
    const weakest = scored.reduce((min, d) => (d.confidence < min.confidence ? d : min))
    overallConfidence = weakest.confidence
    weakestDimension  = weakest.key
  }

  const distinctConfirmingChannels = new Set(
    dimensions.flatMap(d => d.witnesses.filter(w => w.confirmed).map(w => w.channel)),
  ).size

  return {
    confidenceModelVersion: CONFIDENCE_MODEL_VERSION,
    dimensions,
    overallConfidence,
    weakestDimension,
    distinctConfirmingChannels,
  }
}
