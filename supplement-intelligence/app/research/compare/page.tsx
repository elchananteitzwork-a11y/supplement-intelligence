import { redirect } from 'next/navigation'

// Screen-consolidation (2026-07-27): the V4 Compare lives at /app/compare;
// this route redirects old links there. metrics.ts/separationEngine stay in
// this directory — they are the live engine the V4 screen imports.
export const dynamic = 'force-dynamic'
export default function LegacyComparePage() {
  redirect('/app/compare')
}
