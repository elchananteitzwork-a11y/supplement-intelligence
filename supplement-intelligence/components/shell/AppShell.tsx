import type { ReactNode } from 'react'
import { SideNav, MobileNav, type NavId, type ShellVariant } from './SideNav'

// Replaces the old AppSidebar — the single shared authenticated-app shell
// used by every route that has a nav destination (Home, Research, Compare,
// History, Track Record, Thesis, Settings). Drill-down pages (memo detail,
// signal detail, etc.) render without `active` highlighted, or compose
// their own breadcrumb inside `children` without using AppShell at all.
//
// `variant="pi"` (UIv2-M2, 2026-07-21): additive opt-in for pages already
// migrated to the pi-* warm-cream system — see SideNav.tsx's own comment.
// Default ('legacy') is unchanged, so every not-yet-migrated route keeps
// its current shell exactly as-is.
export function AppShell({
  active, canAnalyze = true, variant = 'legacy', children,
}: { active: NavId | null; canAnalyze?: boolean; variant?: ShellVariant; children: ReactNode }) {
  const pi = variant === 'pi'
  return (
    <div className={`min-h-screen lg:flex font-sans ${pi ? 'bg-pi-cream text-pi-ink' : 'bg-surface text-ink'}`}>
      <SideNav active={active} canAnalyze={canAnalyze} variant={variant} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav active={active} canAnalyze={canAnalyze} variant={variant} />
        <main className="flex-1 px-4 py-8 lg:px-10 lg:py-10 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
