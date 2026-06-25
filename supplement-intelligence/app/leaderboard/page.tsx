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
  const build    = rows.filter(r => r.build_decision === 'BUILD_NOW').length
  const validate = rows.filter(r => r.build_decision === 'VALIDATE_FURTHER').length
  const skip     = rows.filter(r => r.build_decision === 'SKIP').length

  const pro   = profile as Profile | null
  const used  = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = process.env.DEV_UNLIMITED_ANALYSES === 'true'
  const canAnalyze = devUnlimited || used < limit

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar active="leaderboard" used={used} limit={limit} canAnalyze={canAnalyze} />

      <main className="flex-1 px-4 py-8 lg:px-12 lg:py-10">
        <div className="max-w-6xl">

          {/* ── mobile-only nav ── */}
          <div className="flex items-center gap-4 mb-8 lg:hidden">
            <span className="font-serif tracking-tight">Supplement <span className="italic text-brass">Intelligence</span></span>
            <nav className="hidden sm:flex items-center gap-1">
              <Link href="/dashboard"   className="btn-ghost text-xs">Analyses</Link>
              <Link href="/leaderboard" className="btn-ghost text-xs bg-white/[0.06] text-white">Leaderboard</Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/analyze" className="btn-white text-xs py-2 px-4">+ New Analysis</Link>
              <form action="/auth/signout" method="post">
                <button className="btn-ghost text-xs text-zinc-500">Sign out</button>
              </form>
            </div>
          </div>

          <h1 className="hidden lg:block font-serif text-2xl font-medium mb-8">Leaderboard</h1>

          {/* stats */}
          <div className="flex divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] overflow-hidden mb-8">
            {[
              { l: 'Build Now', n: build,    c: 'text-emerald-400' },
              { l: 'Validate',  n: validate,  c: 'text-amber-400'   },
              { l: 'Skip',      n: skip,      c: 'text-red-400'     },
            ].map(s => (
              <div key={s.l} className="flex-1 px-4 py-4">
                <p className={`text-2xl font-serif font-medium ${s.c}`}>{s.n}</p>
                <p className="text-xs text-zinc-500 mt-1">{s.l}</p>
              </div>
            ))}
          </div>

          <p className="label mb-4">
            {rows.length} categories ranked
          </p>

          {/* ── opportunity grid — same visual tile language as the Dashboard ── */}
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
