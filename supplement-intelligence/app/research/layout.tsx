import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Market Intelligence | Supplement Intelligence',
  description: 'Product Intelligence & Investment Decision Engine',
}

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {children}
    </div>
  )
}
