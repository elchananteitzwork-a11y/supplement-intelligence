import Link          from 'next/link'
import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRow, Profile } from '@/types/index'
import AppSidebar from '@/components/AppSidebar'
import OpportunityCard from '@/components/OpportunityCard'

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

  const stats = [
    { label: 'Build Now',   value: build,            color: '#34d9a0' },
    { label: 'Validate',    value: validate,          color: '#f5b947' },
    { label: 'Category',    value: categoryCreation,  color: '#8b7cff' },
    { label: 'Pass',        value: skip,             color: '#ff6259' },
  ]

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar active="leaderboard" used={used} limit={limit} canAnalyze={canAnalyze} />

      <main className="flex-1 px-4 py-8 lg:px-10 lg:py-10 min-w-0">
        <div className="max-w-6xl">

          {/* Mobile header */}
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <p className="font-display text-base font-semibold text-lab-text-primary">Leaderboard</p>
            <nav className="flex items-center gap-2">
              <Link href="/dashboard"   className="text-xs text-lab-text-tertiary">Analyses</Link>
              <Link href="/leaderboard" className="text-xs text-lab-photon">Leaderboard</Link>
            </nav>
          </div>

          <div className="hidden lg:flex items-baseline justify-between mb-8">
            <h1 className="font-display text-xl font-semibold text-lab-text-primary">Leaderboard</h1>
            <p className="lab-text-data text-xs text-lab-text-tertiary">{rows.length} categories ranked</p>
          </div>

          {/* Verdict distribution */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {stats.map(s => (
              <div key={s.label} className="bg-lab-void-2 border border-lab-border-soft rounded-lab-md px-4 py-4">
                <p
                  className="lab-text-data text-2xl font-bold mb-1 leading-none"
                  style={{ color: s.color }}
                >
                  {s.value}
                </p>
                <p className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Grid */}
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
      </main>
    </div>
  )
}
