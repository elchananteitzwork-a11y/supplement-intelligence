import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Market Intelligence | Product Intelligence',
  description: 'Product Intelligence & Investment Decision Engine',
}

// This file was the entire root cause of the old "indigo-dark" theme
// (previously: `bg-gray-950 text-gray-100`) applied to every /research/*
// route. Pass-through only now — each page renders its own AppShell.
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
