import type { ReactNode } from 'react'
import { SideNav, MobileNav, type NavId } from './SideNav'

// Replaces the old AppSidebar — the single shared authenticated-app shell
// used by every route that has a nav destination (Home, Research, Compare,
// History, Track Record, Thesis, Settings). Drill-down pages (memo detail,
// signal detail, etc.) render without `active` highlighted, or compose
// their own breadcrumb inside `children` without using AppShell at all.
export function AppShell({
  active, canAnalyze = true, children,
}: { active: NavId | null; canAnalyze?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex font-sans bg-surface text-ink">
      <SideNav active={active} canAnalyze={canAnalyze} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav active={active} canAnalyze={canAnalyze} />
        <main className="flex-1 px-4 py-8 lg:px-10 lg:py-10 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
