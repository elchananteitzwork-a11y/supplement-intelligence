'use client'

import Link from 'next/link'
import type { FounderProfile } from '@/lib/stage25/fit-layer'
import { HardCard, GhostLinkButton } from '@/components/ui'

interface Props {
  profile: FounderProfile | null
  returnTo?: string
  compact?: boolean
}

const GOAL_LABEL: Record<string, string> = {
  lifestyle_business: 'Lifestyle business',
  scale_to_exit:      'Scale to exit',
  strategic_asset:    'Strategic asset',
}

const RISK_LABEL: Record<string, string> = {
  capital_preservation: 'Capital-preservation',
  balanced:             'Balanced risk',
  high_risk_tolerance:  'High risk tolerance',
}

const CHANNEL_LABEL: Record<string, string> = {
  none:                 'Cold launch (no channel)',
  social_audience:      'Social audience',
  email_list:           'Email list',
  retail_relationships: 'Retail relationships',
  wholesale:            'Wholesale / B2B',
  multiple:             'Multiple channels',
}

const HORIZON_LABEL: Record<string, string> = {
  under_6mo:  '< 6 months',
  '6_to_18mo': '6–18 months',
  '18_plus_mo': '18+ months',
}

function fmtCapital(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

export function FounderProfileBanner({ profile, returnTo, compact = false }: Props) {
  const editHref = returnTo
    ? `/research/profile?return_to=${encodeURIComponent(returnTo)}`
    : '/research/profile'

  if (!profile) {
    return (
      <div className="rounded-xl border border-dashed border-pi-hairline bg-pi-card px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-pi-ink">No founder profile</p>
          <p className="text-xs text-pi-sub mt-0.5">
            Add your profile to unlock personalized investment recommendations, capital adequacy checks, and fit scoring.
          </p>
        </div>
        <Link
          href={editHref}
          className="shrink-0 rounded-lg bg-pi-ink text-pi-cream font-semibold px-3 py-1.5 text-xs transition-colors duration-200 hover:bg-[#24262B]"
        >
          Set up profile →
        </Link>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-pi-hairline bg-pi-card px-4 py-2.5 flex items-center justify-between gap-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
        <div className="flex items-center gap-3 flex-wrap text-xs font-mono text-pi-sub">
          <span className="text-pi-ink font-semibold">{fmtCapital(profile.capital_available)}</span>
          <span className="text-pi-faint">·</span>
          <span>{CHANNEL_LABEL[profile.channel_type]}</span>
          <span className="text-pi-faint">·</span>
          <span>{HORIZON_LABEL[profile.time_horizon]}</span>
          <span className="text-pi-faint">·</span>
          <span>{GOAL_LABEL[profile.long_term_goal]}</span>
        </div>
        <GhostLinkButton variant="pi" href={editHref}>Edit</GhostLinkButton>
      </div>
    )
  }

  return (
    <HardCard variant="pi" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Your Founder Profile</p>
        <GhostLinkButton variant="pi" href={editHref}>Edit profile</GhostLinkButton>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider">Capital</p>
          <p className="text-sm font-medium text-pi-ink">{fmtCapital(profile.capital_available)}</p>
          <p className="text-[10px] text-pi-faint">{profile.capital_confidence}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider">Channel</p>
          <p className="text-sm font-medium text-pi-ink">{CHANNEL_LABEL[profile.channel_type]}</p>
          {profile.channel_size && (
            <p className="text-[10px] text-pi-faint">{(profile.channel_size / 1000).toFixed(0)}k audience</p>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider">Timeline</p>
          <p className="text-sm font-medium text-pi-ink">{HORIZON_LABEL[profile.time_horizon]}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider">Goal</p>
          <p className="text-sm font-medium text-pi-ink">{GOAL_LABEL[profile.long_term_goal]}</p>
          <p className="text-[10px] text-pi-faint">{RISK_LABEL[profile.risk_posture]}</p>
        </div>
      </div>
    </HardCard>
  )
}
