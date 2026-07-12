import Link from 'next/link'
import { PrimaryLinkButton } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 font-sans">
      <div className="text-center space-y-5">
        <p className="text-headline-xl text-outline-variant">404</p>
        <h1 className="text-headline-md text-black">Page not found</h1>
        <p className="text-sm text-ink-variant">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <PrimaryLinkButton href="/dashboard">Go to dashboard</PrimaryLinkButton>
      </div>
    </div>
  )
}
