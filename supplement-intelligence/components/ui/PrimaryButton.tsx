import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import type { PrimitiveVariant } from './HardCard'

interface CommonProps {
  children: ReactNode
  className?: string
  variant?: PrimitiveVariant
}

// `variant="pi"` (2026-07-24): pi warm-cream opt-in, same convention as
// AppShell/HardCard. Default ('legacy') unchanged.
const LEGACY_PRIMARY = 'inline-flex items-center justify-center gap-2 bg-black text-white border-2 border-black font-black uppercase tracking-wide text-sm px-6 py-3 transition-colors duration-150 hover:bg-white hover:text-black active:scale-[0.98]'
const PI_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-pi-ink text-pi-cream font-semibold text-sm px-5 py-2.5 shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_8px_20px_-6px_rgba(22,23,26,0.4)] active:translate-y-0 active:scale-[0.98]'

export function PrimaryButton({
  children, className = '', variant = 'legacy', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${variant === 'pi' ? PI_PRIMARY : LEGACY_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none disabled:hover:translate-y-0 ${className}`}
    >
      {children}
    </button>
  )
}

export function PrimaryLinkButton({
  children, className = '', variant = 'legacy', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`${variant === 'pi' ? PI_PRIMARY : LEGACY_PRIMARY} ${className}`}
    >
      {children}
    </Link>
  )
}
