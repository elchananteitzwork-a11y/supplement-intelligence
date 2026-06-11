import Link          from 'next/link'
import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'

function DecisionDot({ d }: { d: string }) {
  const c = d === 'BUILD_NOW' ? 'bg-emerald-400' : d === 'VALIDATE_FURTHER' ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`w-2 h-2 rounded-full shrink-0 ${c}`} />
}

function ScoreColor({ s }: { s: number }) {
  const c = s >= 65 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-mono font-bold text-xl ${c}`}>{Math.round(s)}</span>
}

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
  const left  = Math.max(0, limit - used)

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-5xl mx-auto">

        {/* ── top bar ── */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-semibold text-lg">Supplement<span className="text-emerald-400">Intelligence</span></span>
              <nav className="hidden sm:flex items-center gap-1 ml-2">
                <Link href="/dashboard"   className="btn-ghost text-xs">Analyses</Link>
                <Link href="/leaderboard" className="btn-ghost text-xs">Leaderboard</Link>
              </nav>
            </div>
            <p className="text-xs text-zinc-500">
              {used} of {limit} analyses used
              {left > 0 && <span className="text-zinc-600"> · {left} remaining</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {left > 0
              ? <Link href="/analyze" className="btn-white text-sm py-2 px-5">+ New Analysis</Link>
              : <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">No analyses left</span>
            }
            <SignOutButton />
          </div>
        </div>

        {/* ── usage bar ── */}
        <div className="card p-4 mb-8 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-500">Beta usage</span>
              <span className="text-zinc-400 font-mono">{used}/{limit}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.round((used/limit)*100)}%` }}
              />
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} className={`w-7 h-7 rounded-md grid place-items-center text-xs font-mono
                ${i < used ? 'bg-emerald-400/15 text-emerald-400' : 'bg-zinc-800 text-zinc-600'}`}>
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* ── grid ── */}
        {list.length === 0 ? (
          <div className="card p-20 text-center">
            <p className="text-4xl mb-4">◎</p>
            <h2 className="text-lg font-semibold mb-2">Run your first analysis</h2>
            <p className="text-sm text-zinc-400 mb-6 max-w-xs mx-auto">
              Type any supplement idea. Get a complete investment memo in 60 seconds.
            </p>
            {left > 0 && <Link href="/analyze" className="btn-white">Start analyzing →</Link>}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map(a => (
              <Link key={a.id} href={`/memo/${a.id}`} className="card-hover p-5 flex flex-col gap-4 group">
                {/* header */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-sm leading-snug group-hover:text-white line-clamp-2">
                    {a.category_name}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <DecisionDot d={a.build_decision} />
                    <ScoreColor s={a.opportunity_score} />
                  </div>
                </div>

                {/* mini score grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['Demand',  a.score_demand],
                    ['Comp.',   a.score_competition],
                    ['Viral',   a.score_virality],
                    ['Sub.',    a.score_subscription],
                    ['Mfg',    a.score_manufacturing],
                    ['Defense', a.score_defensibility],
                  ] as [string, number][]).map(([l, s]) => (
                    <div key={l} className="bg-zinc-800/60 rounded p-1.5 text-center">
                      <p className="text-[9px] text-zinc-600 mb-0.5">{l}</p>
                      <span className={`text-xs font-mono font-semibold ${
                        s >= 8 ? 'text-emerald-400' : s >= 6 ? 'text-amber-400' : 'text-red-400'
                      }`}>{s}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xs text-zinc-600">
                  <span>{a.biggest_competitor ? `vs ${a.biggest_competitor}` : ''}</span>
                  <span>{timeAgo(a.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn-ghost text-xs text-zinc-500">Sign out</button>
    </form>
  )
}
