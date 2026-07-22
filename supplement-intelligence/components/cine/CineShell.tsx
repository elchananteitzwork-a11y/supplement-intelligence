import Link from 'next/link'
import { RotorMark } from './RotorMark'
import { AmbientWorld, type AmbientIntensity } from './AmbientWorld'

// ═══════════════════════════════════════════════════════════════════════
// CineShell — the "One World" replacement for <AppShell> on the 6 routes
// in this redesign (Landing, Login, Dashboard, Discover, Candidate
// Detail). No fixed sidebar — a minimal floating/blurred nav over the
// persistent AmbientWorld, so the same environment carries across pages
// instead of resetting into a dashboard-with-sidebar layout each time.
//
// Everything outside this component's scope is unchanged: Watchlist,
// Alerts, Leaderboard, Settings/Billing, Compare, History stay on the
// current pi-* <AppShell> — this is additive, not a replacement for it.
// ═══════════════════════════════════════════════════════════════════════

const NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/research/compare', label: 'Compare' },
  { href: '/leaderboard', label: 'Track Record' },
  { href: '/settings/billing', label: 'Settings' },
] as const

export function CineNav({ dark = true }: { dark?: boolean }) {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-8">
      <Link href="/dashboard" className="flex items-center gap-2.5 text-sm font-semibold">
        <RotorMark className="h-5 w-5" />
        <span className={dark ? 'text-pi-cream' : 'text-pi-ink'}>Product Intelligence</span>
      </Link>
      <div className="hidden items-center gap-1 sm:flex">
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3.5 py-2 text-[13.5px] transition-colors duration-cine-fast ease-cine ${
              dark
                ? 'text-pi-cream/70 hover:bg-white/[0.08] hover:text-pi-cream'
                : 'text-pi-sub hover:bg-pi-ink/[0.04] hover:text-pi-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export function CineShell({
  image,
  imagePosition,
  intensity = 'full',
  nav = true,
  children,
  className = '',
}: {
  /** This screen's own approved composition — see AmbientWorld's own doc comment. */
  image: string
  imagePosition?: string
  intensity?: AmbientIntensity
  nav?: boolean
  children?: React.ReactNode
  className?: string
}) {
  return (
    <AmbientWorld image={image} imagePosition={imagePosition} intensity={intensity} className={`min-h-screen ${className}`}>
      {nav && <CineNav />}
      {children}
    </AmbientWorld>
  )
}
