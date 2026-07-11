import Link from 'next/link'

const NAV = [
  { href: '/dashboard',   label: 'Analyses',    id: 'dashboard'   as const },
  { href: '/leaderboard', label: 'Leaderboard', id: 'leaderboard' as const },
  { href: '/research',    label: 'Research',    id: 'research'    as const },
]

export default function AppSidebar({
  active, used, limit, canAnalyze,
}: {
  active: 'dashboard' | 'leaderboard' | 'research'
  used: number
  limit: number
  canAnalyze: boolean
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100))

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[220px] lg:shrink-0 lg:border-r-2 lg:border-black lg:px-5 lg:py-8 lg:sticky lg:top-0 lg:h-screen font-sans" style={{ background: '#f9f9f9' }}>

      {/* Brand */}
      <Link href="/" className="mb-10">
        <span className="text-sm font-black tracking-tight uppercase text-black">
          Intelligence Lab
        </span>
      </Link>

      {/* Nav */}
      <nav className="space-y-0.5 mb-8">
        {NAV.map(n => (
          <Link
            key={n.id}
            href={n.href}
            className={`flex items-center gap-2.5 text-sm px-3 py-2 transition-colors font-mono uppercase tracking-wide ${
              active === n.id
                ? 'bg-black text-white font-bold'
                : 'text-[#4c4546] hover:text-black hover:bg-black/5'
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>

      {/* New Analysis CTA */}
      {canAnalyze ? (
        <Link
          href="/analyze"
          className="flex items-center justify-center gap-2 w-full text-sm font-black uppercase tracking-wide text-white bg-black hover:bg-white hover:text-black border-2 border-black py-2.5 mb-8 transition-colors duration-200 active:scale-[0.98]"
        >
          + New Analysis
        </Link>
      ) : (
        <div className="text-xs font-mono uppercase tracking-wide text-[#4c4546] border border-black px-3 py-2.5 text-center mb-8">
          No analyses left
        </div>
      )}

      {/* Usage meter */}
      <div className="mt-auto border border-black bg-white p-4">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-[10px] font-mono text-[#4c4546] uppercase tracking-wider">Beta Usage</span>
          <span className="font-mono text-xs text-black">{used}<span className="text-[#7e7576]">/{limit}</span></span>
        </div>
        <div className="h-1.5 bg-[#e2e2e2] overflow-hidden mb-3">
          <div
            className="h-full bg-black transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-6 flex items-center justify-center font-mono text-[10px] transition-colors border ${
                i < used
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-[#7e7576] border-[#cfc4c5]'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      <form action="/auth/signout" method="post" className="mt-4">
        <button className="text-xs font-mono uppercase tracking-wide text-[#4c4546] hover:text-black transition-colors px-3 py-1">
          Sign out
        </button>
      </form>
    </aside>
  )
}
