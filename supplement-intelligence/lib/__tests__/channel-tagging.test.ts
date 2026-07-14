// Channel tagging tests — Roadmap M1.3.
//
// Acceptance criteria under test here (roadmap, verbatim):
//   "Every signal reaching the Decision Engine carries exactly one channel
//    tag." / "Keepa-derived signals tag as amazon-market." / "Type-level
//    enforcement: untagged signals fail the build."
//
// True compiler-level enforcement isn't available here — providers are
// registered in lib/signal-engine/registry.ts by plain string name
// (SignalProvider.name: string), not a closed union type, so a missing
// PROVIDER_CHANNEL entry cannot be a TypeScript error. This test is the
// substitute: it imports the exact same provider classes registry.ts
// registers and fails loudly if any of their `.name` values has no
// PROVIDER_CHANNEL entry — the same protection in spirit (a missing tag
// breaks `npm test`, which gates every commit), enforced at test time
// instead of compile time.

import { describe, it, expect } from 'vitest'
import { PROVIDER_CHANNEL, CHANNEL_LABELS, CHANNEL_COVERAGE_NOTES } from '../scoring'
import type { ChannelType } from '../scoring'
import { computeConfidenceAssessment } from '../confidence'
import { DIMENSION_ELIGIBLE_CHANNELS, DIMENSION_ELIGIBLE_PROVIDERS } from '../confidence/eligibility'
import { KeepaProvider } from '../signal-engine/providers/keepa'
import { GoogleTrendsProvider } from '../signal-engine/providers/google-trends'
import { TikTokProvider } from '../signal-engine/providers/tiktok'
import { RedditProvider } from '../signal-engine/providers/reddit'
import { MetaAdsProvider } from '../signal-engine/providers/meta-ads'
import { CompetitionSignalProvider } from '../signal-engine/providers/competition'
import type { GroundedScore } from '../scoring'

const REGISTERED_PROVIDERS = [
  new KeepaProvider(),
  new GoogleTrendsProvider(),
  new TikTokProvider(),
  new RedditProvider(),
  new MetaAdsProvider(),
  new CompetitionSignalProvider(),
]

describe('PROVIDER_CHANNEL — completeness against the real provider registry', () => {
  it('every provider registered in lib/signal-engine/registry.ts has a channel tag', () => {
    for (const provider of REGISTERED_PROVIDERS) {
      expect(PROVIDER_CHANNEL[provider.name], `provider "${provider.name}" is registered but has no PROVIDER_CHANNEL entry`).toBeDefined()
    }
  })

  it('every PROVIDER_CHANNEL entry points at a real ChannelType with a label and a coverage note', () => {
    for (const [provider, channel] of Object.entries(PROVIDER_CHANNEL)) {
      expect(CHANNEL_LABELS[channel], `provider "${provider}" tagged with channel "${channel}" which has no CHANNEL_LABELS entry`).toBeDefined()
      expect(CHANNEL_COVERAGE_NOTES[channel], `channel "${channel}" has no CHANNEL_COVERAGE_NOTES entry`).toBeDefined()
    }
  })

  it('Keepa-derived signals tag as amazon_market, per the roadmap acceptance criterion', () => {
    expect(PROVIDER_CHANNEL['keepa']).toBe('amazon_market')
  })
})

describe('Meta Ad Library / TikTok / Reddit — now three distinct channels, not one', () => {
  it('meta-ads, tiktok, and reddit each tag a different channel', () => {
    const metaAdsChannel = PROVIDER_CHANNEL['meta-ads']
    const tiktokChannel  = PROVIDER_CHANNEL['tiktok']
    const redditChannel  = PROVIDER_CHANNEL['reddit']

    expect(metaAdsChannel).toBe('paid_media')
    expect(tiktokChannel).toBe('social_attention')
    expect(redditChannel).toBe('consumer_voice')

    const distinct = new Set<ChannelType>([metaAdsChannel, tiktokChannel, redditChannel])
    expect(distinct.size).toBe(3)
  })

  it("Roadmap M2.10 — social_commerce and video_research are real channel types with labels and coverage notes, reserved ahead of their providers", () => {
    const newChannels: ChannelType[] = ['social_commerce', 'video_research']
    for (const channel of newChannels) {
      expect(CHANNEL_LABELS[channel], `channel "${channel}" has no CHANNEL_LABELS entry`).toBeDefined()
      expect(CHANNEL_COVERAGE_NOTES[channel], `channel "${channel}" has no CHANNEL_COVERAGE_NOTES entry`).toBeDefined()
      // Deliberately reserved: no provider registered yet (M3.5 / M2.13 respectively).
      expect(Object.values(PROVIDER_CHANNEL)).not.toContain(channel)
    }
  })

  it('Roadmap M2.10 — TikTok Creative Center and Amazon Q&A deliberately do NOT get their own channels', () => {
    // Creative Center shares paid_media with meta-ads (both paid/organic attention
    // mechanics) so the two can never be double-counted as independent witnesses.
    // Amazon Q&A shares amazon_market with keepa (same marketplace data surface,
    // same precedent as M2.3's supply-velocity sub-signal). Neither has its own
    // ChannelType, by design, per the Master Execution Plan.
    const allChannelTypes = new Set(Object.keys(CHANNEL_LABELS))
    expect(allChannelTypes.has('creative_center')).toBe(false)
    expect(allChannelTypes.has('amazon_qa')).toBe(false)
  })

  it("virality's eligible channels include all three, not the old single social_community bucket", () => {
    expect(DIMENSION_ELIGIBLE_CHANNELS.virality).toEqual(['social_attention', 'consumer_voice', 'paid_media'])
    expect(DIMENSION_ELIGIBLE_PROVIDERS.virality).toEqual(['tiktok', 'reddit', 'meta-ads'])
  })

  it('a query where both tiktok AND meta-ads fire now reports 2 confirming channels for virality, not 1', () => {
    const grounded: GroundedScore = {
      score: 60,
      decision: 'VALIDATE_FURTHER',
      dimensions: [
        { key: 'virality', label: 'Virality', weight: 0.10, rawScore: 7, source: 'verified', sourceLabel: 'tiktok + meta-ads' },
      ],
      groundedPct: 100,
      insufficientEvidence: false,
      evidenceBreadth: {
        contributingProviders: ['tiktok', 'meta-ads'],
        totalScoreEligibleProviders: 8,
        pct: 25,
        channelBreakdown: [
          { channel: 'social_attention', label: 'Social Attention', contributed: true, providers: ['tiktok'] },
          { channel: 'paid_media',       label: 'Paid Media',       contributed: true, providers: ['meta-ads'] },
        ],
        distinctChannelTypes: 2,
        crossChannelCorroborated: true,
      },
    }
    const assessment = computeConfidenceAssessment(grounded)
    const virality = assessment.dimensions.find(d => d.key === 'virality')!
    // Before M1.3, both tiktok and meta-ads mapped to social_community, so
    // this exact evidenceBreadth shape was unreachable — a query with both
    // firing would have produced one contributed:true social_community
    // entry, capping confirmingChannelCount at 1 regardless of how many
    // of the three providers actually fired.
    expect(virality.confirmingChannelCount).toBe(2)
  })
})
