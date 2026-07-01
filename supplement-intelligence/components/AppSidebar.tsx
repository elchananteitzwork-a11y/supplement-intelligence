import Link from 'next/link'

const NAV = [
  { href: '/dashboard',   label: 'Analyses',    id: 'dashboard'   as const },
  { href: '/leaderboard', label: 'Leaderboard', id: 'leaderboard' as const },
]

export default function AppSidebar({
  active, used, limit, canAnalyze,
}: {
  active: 'dashboard' | 'leaderboard'
  used: number
  limit: number
  canAnalyze: boolean
}) {
  const pct = Math.min(100, Math.round((used / limit) * 100))

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[220px] lg:shrink-0 lg:border-r lg:border-lab-border-soft lg:px-5 lg:py-8 lg:sticky lg:top-0 lg:h-screen">

      {/* Brand */}
      <Link href="/" className="flex items-center gap-2.5 mb-10 group">
        <span className="w-1 h-5 rounded-full bg-lab-photon group-hover:bg-lab-photon-bright transition-colors" />
        <span className="font-display text-sm font-semibold tracking-tight text-lab-text-primary">
          Intelligence <span className="text-lab-photon">Lab</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="space-y-0.5 mb-8">
        {NAV.map(n => (
          <Link
            key={n.id}
            href={n.href}
            className={`flex items-center gap-2.5 text-sm px-3 py-2 rounded-lab-sm transition-colors duration-lab-fast ${
              active === n.id
                ? 'bg-lab-photon/10 text-lab-photon font-medium border-l-2 border-lab-photon -ml-px pl-[11px]'
                : 'text-lab-text-tertiary hover:text-lab-text-secondary hover:bg-white/[0.04]'
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
          className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-[#050507] bg-lab-photon hover:bg-lab-photon-bright rounded-lab-sm py-2.5 mb-8 transition-colors duration-lab-fast"
        >
          + New Analysis
        </Link>
      ) : (
        <div className="text-xs text-lab-text-tertiary bg-white/[0.03] border border-lab-border-soft rounded-lab-sm px-3 py-2.5 text-center mb-8">
          No analyses left
        </div>
      )}

      {/* Usage meter */}
      <div className="mt-auto bg-lab-void-2 border border-lab-border-soft rounded-lab-md p-4">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-[10px] text-lab-text-tertiary uppercase tracking-wider">Beta Usage</span>
          <span className="lab-text-data text-xs text-lab-text-secondary">{used}<span className="text-lab-text-tertiary">/{limit}</span></span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: '#4fa8ff', boxShadow: '0 0 8px rgba(79,168,255,0.6)' }}
          />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-6 rounded flex items-center justify-center lab-text-data text-[10px] transition-colors ${
                i < used
                  ? 'bg-[rgba(79,168,255,0.15)] text-lab-photon border border-[rgba(79,168,255,0.25)]'
                  : 'bg-white/[0.03] text-lab-text-tertiary border border-lab-border-faint'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      <form action="/auth/signout" method="post" className="mt-4">
        <button className="text-xs text-lab-text-tertiary hover:text-lab-text-secondary transition-colors px-3 py-1">
          Sign out
        </button>
      </form>
    </aside>
  )
}
