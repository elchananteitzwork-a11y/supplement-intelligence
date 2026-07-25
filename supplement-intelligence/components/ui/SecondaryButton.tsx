import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import type { PrimitiveVariant } from './HardCard'

interface CommonProps {
  children: ReactNode
  className?: string
  variant?: PrimitiveVariant
}

// `variant="pi"` (2026-07-24): pi warm-cream opt-in, same convention as
// AppShell/HardCard/PrimaryButton. Default ('legacy') unchanged.
const LEGACY_SECONDARY = 'inline-flex items-center justify-center gap-2 bg-white text-black border border-black font-bold uppercase tracking-wide text-sm px-5 py-2.5 transition-colors duration-150 hover:bg-surface-container active:scale-[0.98]'
const PI_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl border border-pi-hairline bg-pi-card text-pi-ink font-medium text-sm px-4 py-2.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_4px_10px_-2px_rgba(22,23,26,0.1)] active:translate-y-0 active:scale-[0.98]'
const LEGACY_GHOST = 'inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-ink-variant hover:text-black transition-colors'
const PI_GHOST = 'inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-pi-sub hover:text-pi-ink transition-colors'

export function SecondaryButton({
  children, className = '', variant = 'legacy', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${variant === 'pi' ? PI_SECONDARY : LEGACY_SECONDARY} disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryLinkButton({
  children, className = '', variant = 'legacy', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`${variant === 'pi' ? PI_SECONDARY : LEGACY_SECONDARY} ${className}`}
    >
      {children}
    </Link>
  )
}

// Ghost variant — text-only, used for back-links and low-emphasis actions.
export function GhostButton({
  children, className = '', variant = 'legacy', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${variant === 'pi' ? PI_GHOST : LEGACY_GHOST} ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostLinkButton({
  children, className = '', variant = 'legacy', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`${variant === 'pi' ? PI_GHOST : LEGACY_GHOST} ${className}`}
    >
      {children}
    </Link>
  )
}
