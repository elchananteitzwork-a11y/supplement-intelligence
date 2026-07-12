import type { ReactNode, ElementType } from 'react'
import Link from 'next/link'

// Universal surface primitive — 1px solid black border, white fill, 0px
// radius. The base container for every card/panel in the design system.
export function HardCard({
  children, className = '', as: As = 'div', padded = true,
}: { children: ReactNode; className?: string; as?: ElementType; padded?: boolean }) {
  return (
    <As className={`bg-white border border-black ${padded ? 'p-gutter' : ''} ${className}`}>
      {children}
    </As>
  )
}

// Interactive variant — shows the hard-shadow lift on hover, used for
// clickable cards (opportunity tiles, list rows presented as cards).
export function HardCardInteractive({
  children, className = '', onClick, href,
}: { children: ReactNode; className?: string; onClick?: () => void; href?: string }) {
  const cls = `bg-white border border-black transition-all duration-150 hover:shadow-hard hover:-translate-x-px hover:-translate-y-px cursor-pointer block ${className}`
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
