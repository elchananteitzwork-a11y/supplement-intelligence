import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

interface CommonProps {
  children: ReactNode
  className?: string
}

export function PrimaryButton({
  children, className = '', ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 bg-black text-white border-2 border-black font-black uppercase tracking-wide text-sm px-6 py-3 transition-colors duration-150 hover:bg-white hover:text-black active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  )
}

export function PrimaryLinkButton({
  children, className = '', href, ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={`inline-flex items-center justify-center gap-2 bg-black text-white border-2 border-black font-black uppercase tracking-wide text-sm px-6 py-3 transition-colors duration-150 hover:bg-white hover:text-black active:scale-[0.98] ${className}`}
    >
      {children}
    </Link>
  )
}
