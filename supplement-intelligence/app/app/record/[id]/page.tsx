import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Analysis } from '@/types/index'
import { buildRecordChapters } from '@/lib/partner-copy-record'
import { ChapterIndex } from '@/components/partner/record/ChapterIndex'

// ── /app/record/[id] — the Record index (V4 Phase 2, RD_V4_PHASE2.md
// Milestone B). Auth/fetch/ownership-check pattern reused verbatim from
// app/app/brief/[id]/page.tsx.
export default async function RecordIndexPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await sb.from('analyses').select('*').eq('id', params.id).single()
  if (error || !data) notFound()

  const a = data as Analysis
  if (a.user_id !== user.id) notFound()

  const m = a.memo_data
  const chapters = buildRecordChapters(m)
  const thesis = m.writer_output?.product_thesis_full ?? null

  return (
    <ChapterIndex
      analysisId={a.id}
      categoryName={a.category_name}
      thesis={thesis}
      chapters={chapters}
      appendixHref={`/app/appendix/${a.id}`}
    />
  )
}
