import { redirect }  from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis, Profile } from '@/types/index'
import { AppShell } from '@/components/shell/AppShell'
import OpportunityCard from '@/components/OpportunityCard'
import { StatTile, PrimaryLinkButton } from '@/components/ui'
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
    <AppShell active="home" canAnalyze={canAnalyze}>
      <div className="max-w-6xl">
        <div className="flex items-baseline justify-between mb-8 border-b-2 border-black pb-4">
          <h1 className="text-headline-md text-black">Home</h1>
          <p className="text-xs font-mono text-outline">{used}/{limit} analyses used · {total} total</p>
        </div>

        {total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatTile label="Total Runs" value={String(total)} />
            <StatTile label="Build Rate" value={`${buildRate}%`} color={buildRate >= 50 ? '#008a00' : undefined} />
            <StatTile label="Avg Score" value={String(avgScore)} color={avgScore >= 65 ? '#008a00' : avgScore >= 50 ? '#a67c00' : '#d32f2f'} />
            <StatTile label="Last Run" value={timeAgo(list[0]?.created_at)} />
          </div>
        )}

        {list.length === 0 ? (
          <div className="bg-white border border-black py-24 px-6 text-center">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mx-auto mb-5">
              <IconTarget className="w-5 h-5 text-black" />
            </div>
            <h2 className="text-headline-md text-black mb-2">Run your first analysis</h2>
            <p className="text-sm text-ink-variant mb-8 max-w-xs mx-auto leading-relaxed">
              Type any product idea. Get a complete intelligence memo in 60 seconds.
            </p>
            {canAnalyze && <PrimaryLinkButton href="/analyze">Start Analyzing →</PrimaryLinkButton>}
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
    </AppShell>
  )
}
