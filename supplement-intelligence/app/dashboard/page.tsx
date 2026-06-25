import Link          from 'next/link'
import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'
import { IconTarget } from '@/components/icons'
import AppSidebar     from '@/components/AppSidebar'
import OpportunityCard from '@/components/OpportunityCard'

function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

export default async function Dashboard() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: analyses }, { data: profile }] = await Promise.all([
    sb.from('analyses').select('*').eq('user_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).limit(30),
    sb.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const list = (analyses ?? []) as Analysis[]
  const pro  = profile as Profile | null
  const used = pro?.analyses_used  ?? 0
  const limit = pro?.analyses_limit ?? 3
  const devUnlimited = process.env.DEV_UNLIMITED_ANALYSES === 'true'
  const left  = Math.max(0, limit - used)
  const canAnalyze = devUnlimited || left > 0

  const total     = list.length
  const buildNow  = list.filter(a => a.build_decision === 'BUILD_NOW').length
  const buildRate = total ? Math.round((buildNow / total) * 100) : 0
  const avgScore  = total ? Math.round(list.reduce((s, a) => s + a.opportunity_score, 0) / total) : 0

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar active="dashboard" used={used} limit={limit} canAnalyze={canAnalyze} />

      <main className="flex-1 px-4 py-8 lg:px-12 lg:py-10">
        <div className="max-w-6xl">

          {/* ── mobile-only top bar (sidebar is desktop-only) ── */}
          <div className="flex items-center justify-between mb-8 gap-4 lg:hidden">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <span className="font-serif text-lg tracking-tight">Supplement <span className="italic text-brass">Intelligence</span></span>
                <nav className="hidden sm:flex items-center gap-1 ml-2">
                  <Link href="/dashboard"   className="btn-ghost text-xs">Analyses</Link>
                  <Link href="/leaderboard" className="btn-ghost text-xs">Leaderboard</Link>
                </nav>
              </div>
              <p className="text-xs text-zinc-500">
                {used} of {limit} analyses used
                {!devUnlimited && left > 0 && <span className="text-zinc-600"> · {left} remaining</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {canAnalyze
                ? <Link href="/analyze" className="btn-white text-sm py-2 px-5">+ New Analysis</Link>
                : <span className="text-xs text-zinc-600 bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2">No analyses left</span>
              }
              <form action="/auth/signout" method="post">
                <button className="btn-ghost text-xs text-zinc-500">Sign out</button>
              </form>
            </div>
          </div>

          <div className="lg:hidden card p-5 mb-8 flex items-center gap-5">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-2.5">
                <span className="text-zinc-500 uppercase tracking-wider text-[11px]">Beta usage</span>
                <span className="text-zinc-400 font-mono">{used}/{limit}</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full bg-brass rounded-full transition-all" style={{ width: `${Math.round((used/limit)*100)}%` }} />
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {Array.from({ length: limit }).map((_, i) => (
                <div key={i} className={`w-7 h-7 rounded-md grid place-items-center text-xs font-mono
                  ${i < used ? 'bg-brass/15 text-brass' : 'bg-white/[0.04] text-zinc-600'}`}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* ── desktop page heading ── */}
          <div className="hidden lg:flex items-baseline justify-between mb-6">
            <h1 className="font-serif text-2xl font-medium">Analyses</h1>
          </div>

          {/* ── instrument readouts — the command-center "vitals," not stat cards ── */}
          {total > 0 && (
            <div className="flex flex-wrap divide-x divide-white/[0.08] border-y border-white/[0.08] mb-8 -mx-1">
              {([
                ['Total Analyses', String(total), 'text-zinc-100'],
                ['Build Rate',     `${buildRate}%`, buildRate >= 50 ? 'text-emerald-400' : 'text-zinc-100'],
                ['Avg Score',      String(avgScore), avgScore >= 65 ? 'text-emerald-400' : avgScore >= 50 ? 'text-amber-400' : 'text-red-400'],
                ['Last Run',       timeAgo(list[0].created_at), 'text-zinc-100'],
              ] as [string, string, string][]).map(([l, v, c]) => (
                <div key={l} className="flex-1 min-w-[130px] py-5 px-4 first:pl-1">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{l}</p>
                  <p className={`font-serif text-3xl font-medium ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── opportunity grid — visual tiles, not a blotter row you read column by column ── */}
          {list.length === 0 ? (
            <div className="card-premium p-20 text-center">
              <IconTarget className="w-8 h-8 text-brass/70 mx-auto mb-5" />
              <h2 className="font-serif text-xl mb-2">Run your first analysis</h2>
              <p className="text-sm text-zinc-500 mb-7 max-w-xs mx-auto">
                Type any supplement idea. Get a complete investment memo in 60 seconds.
              </p>
              {canAnalyze && <Link href="/analyze" className="btn-white">Start analyzing →</Link>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((a, i) => (
                <OpportunityCard
                  key={a.id}
                  href={`/memo/${a.id}`}
                  rank={i + 1}
                  gridIndex={i}
                  categoryName={a.category_name}
                  score={a.opportunity_score}
                  decision={a.build_decision}
                  format={a.memo_data?.product_recommendation?.format}
                  competitor={a.biggest_competitor}
                  marketSize={a.market_size}
                  timeLabel={timeAgo(a.created_at)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
