import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="font-serif text-7xl italic text-white/[0.12] mb-5">404</p>
        <h1 className="font-serif text-xl font-medium mb-2">Page not found</h1>
        <p className="text-zinc-500 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/dashboard" className="btn-primary">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
