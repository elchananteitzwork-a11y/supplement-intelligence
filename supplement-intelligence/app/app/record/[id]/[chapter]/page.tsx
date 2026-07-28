import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis } from '@/types/index'
import { buildRecordChapters, buildGapLetter } from '@/lib/partner-copy-record'
import { ChapterPage } from '@/components/partner/record/ChapterPage'
import { AvatarMenu } from '@/components/partner/AvatarMenu'

// ── /app/record/[id]/[chapter] — one Record chapter (V4 Phase 2,
// RD_V4_PHASE2.md Milestone B). Real route, deep-linkable; Back returns to
// the Record index via the browser's own history (ChapterPage's back
// button calls router.back(), never a hardcoded href).
export default async function RecordChapterPage({ params }: { params: { id: string; chapter: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb.from('analyses').select('*').eq('id', params.id).single()
  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  const m = a.memo_data
  const chapters = buildRecordChapters(m)
  const chapter = chapters.find(c => c.key === params.chapter)
  if (!chapter) notFound()

  const gap = chapter.key === 'gap' ? buildGapLetter(m) : null

  // Item ג (docs/RD_V4_COMPETITIVE_REVIEWS.md): the Competition chapter can
  // interrogate the analysis' own stored competitor set. Gated server-side —
  // a legacy analysis with <2 stored competitor ASINs renders nothing (never
  // an offer that would 422). The stored report row is read here (RLS-scoped)
  // so a finished interrogation renders instantly with no client fetch; a
  // missing 031 table (migration pending) just means no section yet.
  let competitiveReviews: {
    analysisId: string; topN: number
    initialReport: import('@/lib/competitive-review-engine').MarketReport | null
    initiallyRunning: boolean
  } | null = null
  if (chapter.key === 'competition') {
    const revAsins = (m.signal_evidence?.revenue?.value?.top_competitor_revenues ?? []).map(r => r.productId)
    const rvAsins  = (m.signal_evidence?.review_velocity?.value?.top_competitors ?? []).map(c => c.productId)
    const distinct = new Set([...revAsins, ...rvAsins].map(x => x.toUpperCase()))
    const topN = Math.min(5, distinct.size)
    if (topN >= 2) {
      const { data: reportRow } = await sb
        .from('competitive_review_reports')
        .select('report')
        .eq('analysis_id', a.id)
        .maybeSingle()
      const stored = reportRow?.report as Record<string, unknown> | undefined
      const isStub = !!stored && stored.__running === true
      competitiveReviews = {
        analysisId: a.id,
        topN,
        initialReport: stored && !isStub ? (stored as unknown as import('@/lib/competitive-review-engine').MarketReport) : null,
        initiallyRunning: isStub,
      }
    }
  }

  const { data: profileRow } = await sb.from('profiles').select('analyses_used, analyses_limit').eq('id', user.id).single()
  const usage = profileRow ? { used: profileRow.analyses_used ?? 0, limit: profileRow.analyses_limit ?? 3 } : null

  return (
    <>
      <AvatarMenu email={user.email ?? null} usage={usage} />
      <ChapterPage chapter={chapter} gap={gap} competitiveReviews={competitiveReviews} />
    </>
  )
}
