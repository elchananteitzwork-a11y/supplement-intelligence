'use client'

import Link from 'next/link'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

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
      <div className="rounded-lg border border-dashed border-indigo-800 bg-indigo-950/10 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-300">No founder profile</p>
          <p className="text-xs text-indigo-400/70 mt-0.5">
            Add your profile to unlock personalized investment recommendations, capital adequacy checks, and fit scoring.
          </p>
        </div>
        <Link
          href={editHref}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500 transition-colors"
        >
          Set up profile →
        </Link>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
          <span className="text-gray-300 font-medium">{fmtCapital(profile.capital_available)}</span>
          <span className="text-gray-700">·</span>
          <span>{CHANNEL_LABEL[profile.channel_type]}</span>
          <span className="text-gray-700">·</span>
          <span>{HORIZON_LABEL[profile.time_horizon]}</span>
          <span className="text-gray-700">·</span>
          <span>{GOAL_LABEL[profile.long_term_goal]}</span>
        </div>
        <Link
          href={editHref}
          className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Edit
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Founder Profile</p>
        <Link href={editHref} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Edit profile
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Capital</p>
          <p className="text-sm font-medium text-gray-200">{fmtCapital(profile.capital_available)}</p>
          <p className="text-[10px] text-gray-500">{profile.capital_confidence}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Channel</p>
          <p className="text-sm font-medium text-gray-200">{CHANNEL_LABEL[profile.channel_type]}</p>
          {profile.channel_size && (
            <p className="text-[10px] text-gray-500">{(profile.channel_size / 1000).toFixed(0)}k audience</p>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Timeline</p>
          <p className="text-sm font-medium text-gray-200">{HORIZON_LABEL[profile.time_horizon]}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Goal</p>
          <p className="text-sm font-medium text-gray-200">{GOAL_LABEL[profile.long_term_goal]}</p>
          <p className="text-[10px] text-gray-500">{RISK_LABEL[profile.risk_posture]}</p>
        </div>
      </div>
    </div>
  )
}
