import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis } from '@/types/index'
import { buildRecordChapters, buildGapLetter } from '@/lib/partner-copy-record'
import { ChapterPage } from '@/components/partner/record/ChapterPage'

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

  return <ChapterPage chapter={chapter} gap={gap} />
}
