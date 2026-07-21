import { notFound } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { PipelineView } from '@/components/pi/PipelineView'
import { derivePipelineViewModel } from '@/components/pi/derive'
import type { Analysis } from '@/types/index'

// DEV-ONLY visual verification route (documented in RD-UIv2-M1 §3/§5):
// renders the exact same view over the same real rows via the service
// client, so the screen can be exercised in a browser without a login
// session. Hard 404 in production — this never ships.

export const dynamic = 'force-dynamic'

export default async function PipelinePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) notFound()

  const sb = createServiceClient(url, key)
  const [{ data: analyses }, { data: watches }] = await Promise.all([
    sb.from('analyses').select('*').eq('is_archived', false).order('created_at', { ascending: false }).limit(50),
    sb.from('watchlist').select('analysis_id').eq('active', true),
  ])

  const watchedIds = new Set<string>((watches ?? []).map((w: { analysis_id: string }) => w.analysis_id))
  const vm = derivePipelineViewModel((analyses ?? []) as Analysis[], watchedIds)

  return <PipelineView vm={vm} />
}
