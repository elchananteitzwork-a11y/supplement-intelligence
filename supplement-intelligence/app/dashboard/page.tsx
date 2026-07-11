import Link          from 'next/link'
import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'
import AppSidebar     from '@/components/AppSidebar'
import OpportunityCard from '@/components/OpportunityCard'
import { IconTarget } from '@/components/icons'

function timeAgo(d: string | null | undefined) {
  if (!d) return 'unknown'
  const t = new Date(d).getTime()
  if (isNaN(t)) return 'unknown'
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default async function Dashboard() {
  const sb = createClient()
  const { data: authData, error: authError } = await sb.auth.getUser()
  if (authError || !authData?.user) redirect('/login')
  const user = authData.user

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
    <div className="min-h-screen lg:flex font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
      <AppSidebar active="dashboard" used={used} limit={limit} canAnalyze={canAnalyze} />

      <main className="flex-1 px-4 py-8 lg:px-10 lg:py-10 min-w-0">
        <div className="max-w-6xl">

          {/* ── Mobile top bar ── */}
          <div className="flex items-center justify-between mb-8 gap-4 lg:hidden border-b-2 border-black pb-4">
            <div>
              <p className="text-base font-black uppercase tracking-tight text-black">
                Intelligence Lab
              </p>
              <p className="text-xs font-mono text-[#4c4546] mt-0.5">
                {used} of {limit} analyses used
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canAnalyze
                ? <Link href="/analyze" className="text-sm font-black uppercase text-white bg-black px-4 py-2 border-2 border-black">+ New</Link>
                : null}
              <form action="/auth/signout" method="post">
                <button className="text-xs font-mono uppercase text-[#4c4546] px-2 py-1">Sign out</button>
              </form>
            </div>
          </div>

          {/* ── Page header ── */}
          <div className="hidden lg:flex items-baseline justify-between mb-8 border-b-2 border-black pb-4">
            <h1 className="text-xl font-black uppercase tracking-tight text-black">Analyses</h1>
            <p className="text-xs font-mono text-[#7e7576]">{total} total</p>
          </div>

          {/* ── Instrument readouts ── */}
          {total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {([
                { label: 'Total Runs',   value: String(total),      color: '#000000', mono: true  },
                { label: 'Build Rate',   value: `${buildRate}%`,    color: buildRate >= 50 ? '#008a00' : '#000000', mono: true },
                { label: 'Avg Score',    value: String(avgScore),   color: avgScore >= 65 ? '#008a00' : avgScore >= 50 ? '#fbc02d' : '#d32f2f', mono: true },
                { label: 'Last Run',     value: timeAgo(list[0].created_at), color: '#4c4546', mono: false },
              ] as { label: string; value: string; color: string; mono: boolean }[]).map(s => (
                <div key={s.label} className="bg-white border border-black px-4 py-4">
                  <p className="text-[10px] font-mono text-[#7e7576] uppercase tracking-wider mb-2">{s.label}</p>
                  <p
                    className={`text-2xl font-black leading-none ${s.mono ? 'font-mono' : ''}`}
                    style={{ color: s.color }}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state ── */}
          {list.length === 0 ? (
            <div className="bg-white border border-black py-24 px-6 text-center">
              <div className="w-12 h-12 border-2 border-black flex items-center justify-center mx-auto mb-5">
                <IconTarget className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-lg font-black uppercase tracking-tight mb-2">Run your first analysis</h2>
              <p className="text-sm text-[#4c4546] mb-8 max-w-xs mx-auto leading-relaxed">
                Type any product idea. Get a complete intelligence memo in 60 seconds.
              </p>
              {canAnalyze && (
                <Link
                  href="/analyze"
                  className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white bg-black hover:bg-white hover:text-black border-2 border-black px-6 py-2.5 transition-colors duration-200 active:scale-[0.98]"
                >
                  Start analyzing →
                </Link>
              )}
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
