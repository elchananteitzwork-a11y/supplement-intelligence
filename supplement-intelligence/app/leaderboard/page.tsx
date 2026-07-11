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
    { label: 'Entry Supported',     value: build,            color: '#008a00' },
    { label: 'Validation Required', value: validate,          color: '#a67c00' },
    { label: 'Category Creation',   value: categoryCreation,  color: '#000000' },
    { label: 'Not Supported',       value: skip,              color: '#d32f2f' },
  ]

  return (
    <div className="min-h-screen lg:flex font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
      <AppSidebar active="leaderboard" used={used} limit={limit} canAnalyze={canAnalyze} />

      <main className="flex-1 px-4 py-8 lg:px-10 lg:py-10 min-w-0">
        <div className="max-w-6xl">

          {/* Mobile header */}
          <div className="flex items-center justify-between mb-8 lg:hidden border-b-2 border-black pb-4">
            <p className="text-base font-black uppercase tracking-tight text-black">Leaderboard</p>
            <nav className="flex items-center gap-3">
              <Link href="/dashboard"   className="text-xs font-mono uppercase text-[#7e7576]">Analyses</Link>
              <Link href="/leaderboard" className="text-xs font-mono uppercase text-black font-bold">Leaderboard</Link>
            </nav>
          </div>

          <div className="hidden lg:flex items-baseline justify-between mb-8 border-b-2 border-black pb-4">
            <h1 className="text-xl font-black uppercase tracking-tight text-black">Leaderboard</h1>
            <p className="font-mono text-xs text-[#7e7576]">{rows.length} categories ranked</p>
          </div>

          {/* Verdict distribution */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {stats.map(s => (
              <div key={s.label} className="bg-white border border-black px-4 py-4">
                <p
                  className="font-mono text-2xl font-black mb-1 leading-none"
                  style={{ color: s.color }}
                >
                  {s.value}
                </p>
                <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider">{s.label}</p>
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
