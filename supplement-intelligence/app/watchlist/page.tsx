import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AvatarMenu } from '@/components/partner/AvatarMenu'
import { WatchlistView } from './WatchlistView'

// ── /watchlist — V4 shell (owner request 2026-07-27: "watchlist still
// brings me to the old page"). Server wrapper provides auth + the
// AvatarMenu's real email/usage (same pattern as /app/analyses); all list
// behavior lives in WatchlistView (client), byte-identical /api/watchlist
// calls to the prior AppShell/LedgerTable version.
export default async function WatchlistPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  return (
    <div className="min-h-screen bg-pi-cream text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <WatchlistView />
    </div>
  )
}
