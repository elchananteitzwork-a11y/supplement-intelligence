import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

interface CommonProps {
  children: ReactNode
  className?: string
}

export function SecondaryButton({
  children, className = '', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 bg-white text-black border border-black font-bold uppercase tracking-wide text-sm px-5 py-2.5 transition-colors duration-150 hover:bg-surface-container active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryLinkButton({
  children, className = '', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`inline-flex items-center justify-center gap-2 bg-white text-black border border-black font-bold uppercase tracking-wide text-sm px-5 py-2.5 transition-colors duration-150 hover:bg-surface-container active:scale-[0.98] ${className}`}
    >
      {children}
    </Link>
  )
}

// Ghost variant — text-only, used for back-links and low-emphasis actions.
export function GhostButton({
  children, className = '', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-ink-variant hover:text-black transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostLinkButton({
  children, className = '', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wide text-ink-variant hover:text-black transition-colors ${className}`}
    >
      {children}
    </Link>
  )
}
