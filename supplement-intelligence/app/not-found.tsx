import { PrimaryLinkButton } from '@/components/ui'

// Home duplication fix (2026-07-26): 404 sends to /app, the product's one
// home. Re-skinned to pi tokens in the same pass (was the legacy
// black-and-white surface palette).
export default function NotFound() {
  return (
    <div className="min-h-screen bg-pi-cream flex items-center justify-center px-4 font-sans">
      <div className="text-center space-y-5">
        <p className="font-serif text-[56px] font-semibold leading-none text-pi-faint">404</p>
        <h1 className="font-serif text-[26px] font-semibold leading-snug tracking-tight text-pi-ink">Page not found</h1>
        <p className="text-sm text-pi-sub">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <PrimaryLinkButton variant="pi" href="/app">Go home</PrimaryLinkButton>
      </div>
    </div>
  )
}
