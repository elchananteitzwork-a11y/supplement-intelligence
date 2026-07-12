import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRow, Profile } from '@/types/index'
import { AppShell } from '@/components/shell/AppShell'
import OpportunityCard from '@/components/OpportunityCard'
import { StatTile } from '@/components/ui'

function timeLabelFor(r: LeaderboardRow) {
  return `${r.analysis_count} run${r.analysis_count === 1 ? '' : 's'}`
}

export default async function Leaderboard() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data }, { data: profile }] = await Promise.all([
    sb.from('leaderboard').select('*').order('opportunity_score', { ascending: false }).limit(100),
    sb.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const rows = (data ?? []) as LeaderboardRow[]
  const build            = rows.filter(r => r.build_decision === 'BUILD_NOW').length
  const validate         = rows.filter(r => r.build_decision === 'VALIDATE_FURTHER').length
  const skip             = rows.filter(r => r.build_decision === 'SKIP').length
  const categoryCreation = rows.filter(r => r.build_decision === 'CATEGORY_CREATION_CANDIDATE').length

  const pro   = profile as Profile | null
  const used  = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = process.env.DEV_UNLIMITED_ANALYSES === 'true'
  const canAnalyze = devUnlimited || used < limit

  return (
    <AppShell active="track" canAnalyze={canAnalyze}>
      <div className="max-w-6xl">
        <div className="flex items-baseline justify-between mb-8 border-b-2 border-black pb-4">
          <h1 className="text-headline-md text-black">Track Record</h1>
          <p className="font-mono text-xs text-outline">{rows.length} categories ranked</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatTile label="Entry Supported" value={String(build)} color="#008a00" />
          <StatTile label="Validation Required" value={String(validate)} color="#a67c00" />
          <StatTile label="Category Creation" value={String(categoryCreation)} color="#000000" />
          <StatTile label="Not Supported" value={String(skip)} color="#d32f2f" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r, i) => (
            <OpportunityCard
              key={r.id}
              rank={i + 1}
              gridIndex={i}
              categoryName={r.category_name}
              score={r.opportunity_score}
              decision={r.build_decision}
              competitor={r.biggest_competitor}
              marketSize={r.market_size}
              timeLabel={timeLabelFor(r)}
            />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
