import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AvatarMenu } from '@/components/partner/AvatarMenu'
import { BillingClient } from './BillingClient'

// ── /settings/billing — V4 shell (2026-07-27, same server-wrapper pattern
// as /watchlist and /alerts). All billing behavior — the real
// /api/billing/status read and checkout/portal calls — lives unchanged in
// BillingClient (was this file's own client content, moved verbatim).
export default async function BillingPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  return (
    <div className="min-h-screen bg-pi-cream text-pi-ink">
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <BillingClient />
    </div>
  )
}
