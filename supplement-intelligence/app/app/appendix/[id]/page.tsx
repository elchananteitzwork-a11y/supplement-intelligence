import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis } from '@/types/index'
import { computeGroundedScore } from '@/lib/scoring'
import { verdictWord, freshnessStamp } from '@/lib/partner-copy'
import { buildEvidenceAppendix } from '@/lib/partner-copy-record'
import { EvidenceAppendix } from '@/components/partner/record/EvidenceAppendix'
import { AvatarMenu } from '@/components/partner/AvatarMenu'

// ── /app/appendix/[id] — the Evidence appendix (V4 Phase 2,
// RD_V4_PHASE2.md Milestone B). Auth/fetch/ownership pattern reused
// verbatim from app/app/brief/[id]/page.tsx.
export default async function AppendixPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb.from('analyses').select('*').eq('id', params.id).single()
  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  const m = a.memo_data
  const grounded = computeGroundedScore(m)
  const vm = buildEvidenceAppendix(m)

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  return (
    <>
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <EvidenceAppendix
        categoryName={a.category_name}
        verdictWord={verdictWord(grounded)}
        freshness={freshnessStamp(a.created_at)}
        vm={vm}
      />
    </>
  )
}
