import type { ReactNode, ElementType } from 'react'
import Link from 'next/link'

// Universal surface primitive — 1px solid black border, white fill, 0px
// radius. The base container for every card/panel in the design system.
//
// `variant="pi"` (2026-07-24): additive opt-in for pages migrated to the
// pi-* warm-cream system — same convention AppShell/SideNav/LedgerTable/
// WitnessDots/StatTile already use. Default ('legacy') is unchanged so
// every not-yet-migrated consumer keeps rendering exactly as before.
export type PrimitiveVariant = 'legacy' | 'pi'

export function HardCard({
  children, className = '', as: As = 'div', padded = true, variant = 'legacy',
}: { children: ReactNode; className?: string; as?: ElementType; padded?: boolean; variant?: PrimitiveVariant }) {
  const base = variant === 'pi'
    ? `rounded-xl border border-pi-hairline bg-pi-card shadow-[0_1px_2px_rgba(22,23,26,0.04)] ${padded ? 'p-5' : ''}`
    : `bg-white border border-black ${padded ? 'p-gutter' : ''}`
  return (
    <As className={`${base} ${className}`}>
      {children}
    </As>
  )
}

// Interactive variant — shows the hard-shadow lift on hover, used for
// clickable cards (opportunity tiles, list rows presented as cards).
export function HardCardInteractive({
  children, className = '', onClick, href, variant = 'legacy',
}: { children: ReactNode; className?: string; onClick?: () => void; href?: string; variant?: PrimitiveVariant }) {
  const cls = variant === 'pi'
    ? `rounded-xl border border-pi-hairline bg-pi-card shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)] cursor-pointer block ${className}`
    : `bg-white border border-black transition-all duration-150 hover:shadow-hard hover:-translate-x-px hover:-translate-y-px cursor-pointer block ${className}`
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    )
  }
  return (
    <div className={cls} onClick={onClick}>
      {children}
    </div>
  )
}
