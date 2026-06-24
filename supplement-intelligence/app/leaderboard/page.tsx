import Link          from 'next/link'
import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { LeaderboardRow, Profile } from '@/types/index'
import AppSidebar from '@/components/AppSidebar'

function Dot({ d }: { d: string }) {
  const c = d === 'BUILD_NOW' ? 'bg-emerald-400' : d === 'VALIDATE_FURTHER' ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c}`} />
}

function Score({ s }: { s: number }) {
  const c = s >= 65 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-serif font-medium text-lg ${c}`}>{Math.round(s)}</span>
}

function Label({ d }: { d: string }) {
  if (d === 'BUILD_NOW')        return <span className="text-emerald-400 text-xs font-semibold">Build Now</span>
  if (d === 'VALIDATE_FURTHER') return <span className="text-amber-400  text-xs font-semibold">Validate</span>
  return                               <span className="text-red-400    text-xs font-semibold">Skip</span>
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

          {/* ── Desktop table ── */}
          <div className="card hidden sm:block overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.03] text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 w-8">#</th>
                  <th className="text-left px-5 py-3">Category</th>
                  <th className="text-center px-5 py-3 w-20">Score</th>
                  <th className="text-left px-5 py-3 w-28">Decision</th>
                  <th className="text-left px-5 py-3 hidden lg:table-cell">Competitor</th>
                  <th className="text-left px-5 py-3 hidden lg:table-cell w-24">Market</th>
                  <th className="text-left px-5 py-3 hidden xl:table-cell w-24">LTV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-zinc-600 font-mono text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Dot d={r.build_decision} />
                        <span className="font-medium text-zinc-200">{r.category_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center"><Score s={r.opportunity_score} /></td>
                    <td className="px-5 py-3.5"><Label d={r.build_decision} /></td>
                    <td className="px-5 py-3.5 text-zinc-500 text-xs hidden lg:table-cell">{r.biggest_competitor ?? '—'}</td>
                    <td className="px-5 py-3.5 text-zinc-500 text-xs hidden lg:table-cell">{r.market_size ?? '—'}</td>
                    <td className="px-5 py-3.5 text-zinc-500 text-xs hidden xl:table-cell">{r.sub_ltv ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile list ── */}
          <div className="sm:hidden ledger">
            {rows.map((r, i) => (
              <div key={r.id} className="ledger-row justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-zinc-600 font-mono text-xs w-4 text-right shrink-0">{i + 1}</span>
                  <Dot d={r.build_decision} />
                  <span className="text-sm font-medium truncate">{r.category_name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Label d={r.build_decision} />
                  <Score s={r.opportunity_score} />
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  )
}
