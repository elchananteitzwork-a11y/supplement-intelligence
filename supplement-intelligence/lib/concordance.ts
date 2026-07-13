// ── Concordance Matrix — Roadmap M2.1 ──────────────────────────────────────
//
// "Each demand channel emits accelerating / stable / decelerating / absent;
// build the cross-channel concordance matrix; render it in the report as a
// per-channel scorecard with actual numbers."
//
// Real per-channel directional reads, not a blended average: engine.ts's
// aggregateDimension() blends every contributing provider's `growth.momentum`
// into ONE final value (whichever provider had the highest confidence "wins"
// the string fields) — the individual providers' own readings were
// discarded once aggregation ran. This module reads them back out via
// AggregatedDimension.perProviderValues (added this milestone, see
// lib/signal-engine/types.ts), which preserves every contributing
// provider's own, un-blended GrowthSignal.
//
// Scoped to demand's three real channels (search_intent via dataforseo/
// google-trends, amazon_market via keepa, consumer_voice via reddit) —
// these are the channels that actually populate `growth` in this codebase
// today (see lib/signal-engine/providers/*.ts). tiktok/meta-ads populate
// `virality`, not `growth`, so they are correctly absent from a demand
// concordance read, not a gap.
//
// SCOPING DECISION (documented, not silently limited): this module computes
// and exposes `agreement`, but does NOT feed it into lib/confidence's
// confidence formula (M1.4) — the roadmap's own text says this matrix is
// "consumed by M2.2" (the lifecycle classifier), which does not exist yet.
// Wiring a real consumer's actual needs into M1.4's already-shipped,
// already-tested formula ahead of that consumer existing would be a guess
// at what M2.2 will actually want. `agreement` is real, computed, and
// rendered — just not yet an input to any decision.

import type { AggregatedSignals } from './signal-engine/types'
import { PROVIDER_CHANNEL, CHANNEL_LABELS, type ChannelType } from './scoring'

// Fixed, structural — every provider that currently populates `growth` in
// this codebase maps to exactly one of these three (see PROVIDER_CHANNEL).
// Not derived from DIMENSION_ELIGIBLE_CHANNELS.demand (lib/confidence/
// eligibility.ts) on purpose: that map describes what demand's SCORE can
// draw from (dataforseo primary, keepa/google-trends/reddit as growth
// fallback inputs); this matrix describes what `growth` itself reports,
// which is the field that actually carries a momentum reading.
const DEMAND_CHANNELS: ChannelType[] = ['search_intent', 'amazon_market', 'consumer_voice']

export type Momentum = 'Accelerating' | 'Stable' | 'Decelerating' | 'Absent'

export interface ConcordanceChannelRead {
  channel:  ChannelType
  label:    string
  provider?: string   // real provider name that reported this channel's read; absent when momentum is 'Absent'
  momentum: Momentum
}

export interface ConcordanceMatrix {
  dimension: 'demand'
  reads: ConcordanceChannelRead[]
  // How many of the 3 channels actually reported a real (non-Absent) momentum.
  distinctReportingChannels: number
  // 'Insufficient' below 2 reporting channels — agreement/disagreement is
  // not a meaningful concept with only one witness. Matches this codebase's
  // existing ≥2-channel threshold for cross-channel corroboration
  // (lib/scoring.ts's crossChannelCorroborated).
  agreement: 'Unanimous' | 'Majority' | 'Mixed' | 'Insufficient'
}

export function computeConcordanceMatrix(se: AggregatedSignals | undefined): ConcordanceMatrix | null {
  const contributions = se?.growth?.perProviderValues
  if (!contributions?.length) return null

  const byChannel = new Map<ChannelType, { provider: string; momentum: Momentum; confidence: number }>()
  for (const { source, value } of contributions) {
    const channel = PROVIDER_CHANNEL[source]
    if (!channel || !DEMAND_CHANNELS.includes(channel)) continue
    if (!value.momentum) continue
    // Every current growth-reporting provider maps 1:1 to a distinct demand
    // channel (dataforseo/google-trends both -> search_intent is the only
    // real overlap; keep the higher-confidence one if both fire).
    const existing = byChannel.get(channel)
    if (existing && existing.confidence >= value.confidence) continue
    byChannel.set(channel, { provider: source, momentum: value.momentum, confidence: value.confidence })
  }

  const reads: ConcordanceChannelRead[] = DEMAND_CHANNELS.map(channel => {
    const hit = byChannel.get(channel)
    return {
      channel,
      label:    CHANNEL_LABELS[channel],
      provider: hit?.provider,
      momentum: hit?.momentum ?? 'Absent',
    }
  })

  const reporting = reads.filter(r => r.momentum !== 'Absent')
  const distinctReportingChannels = reporting.length

  let agreement: ConcordanceMatrix['agreement']
  if (distinctReportingChannels < 2) {
    agreement = 'Insufficient'
  } else {
    const counts = new Map<Momentum, number>()
    for (const r of reporting) counts.set(r.momentum, (counts.get(r.momentum) ?? 0) + 1)
    const maxCount = Math.max(...Array.from(counts.values()))
    agreement = maxCount === reporting.length ? 'Unanimous'
      : maxCount / reporting.length > 0.5 ? 'Majority'
      : 'Mixed'
  }

  return { dimension: 'demand', reads, distinctReportingChannels, agreement }
}
