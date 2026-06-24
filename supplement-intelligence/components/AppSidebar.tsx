import Link from 'next/link'

export default function AppSidebar({
  active, used, limit, canAnalyze,
}: {
  active: 'dashboard' | 'leaderboard'
  used: number
  limit: number
  canAnalyze: boolean
}) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[240px] lg:shrink-0 lg:border-r lg:border-white/[0.06] lg:px-6 lg:py-8 lg:sticky lg:top-0 lg:h-screen">
      <Link href="/" className="flex items-center gap-2.5 mb-10">
        <span className="w-1.5 h-5 rounded-full bg-brass" />
        <span className="font-serif text-base tracking-tight">Supplement <span className="italic text-brass">Intelligence</span></span>
      </Link>

      <nav className="space-y-1 mb-8">
        <Link
          href="/dashboard"
          className={`block text-sm px-3 py-2 rounded-lg transition-colors ${
            active === 'dashboard' ? 'bg-white/[0.06] text-white font-medium' : 'text-zinc-500 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          Analyses
        </Link>
        <Link
          href="/leaderboard"
          className={`block text-sm px-3 py-2 rounded-lg transition-colors ${
            active === 'leaderboard' ? 'bg-white/[0.06] text-white font-medium' : 'text-zinc-500 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          Leaderboard
        </Link>
      </nav>

      {canAnalyze
        ? <Link href="/analyze" className="btn-white text-sm py-2.5 text-center mb-8">+ New Analysis</Link>
        : <span className="text-xs text-zinc-600 bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2.5 text-center mb-8">No analyses left</span>
      }

      <div className="card-premium p-4 mt-auto">
        <div className="flex justify-between text-xs mb-2.5">
          <span className="text-zinc-500 uppercase tracking-wider text-[11px]">Beta usage</span>
          <span className="text-zinc-400 font-mono">{used}/{limit}</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-3">
          <div className="h-full bg-brass rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((used / limit) * 100))}%` }} />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className={`flex-1 aspect-square rounded-md grid place-items-center text-[11px] font-mono ${i < used ? 'bg-brass/15 text-brass' : 'bg-white/[0.04] text-zinc-600'}`}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      <form action="/auth/signout" method="post" className="mt-4">
        <button className="text-xs text-zinc-500 hover:text-white transition-colors px-3">Sign out</button>
      </form>
    </aside>
  )
}
