import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="font-mono text-6xl font-bold text-zinc-800 mb-4">404</p>
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
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
