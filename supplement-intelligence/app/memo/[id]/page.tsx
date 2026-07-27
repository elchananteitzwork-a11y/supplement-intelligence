import { redirect } from 'next/navigation'

// Screen-consolidation pass (owner decision, 2026-07-27): /memo/[id] (the
// legacy Candidate Detail report) and /app/brief/[id] (+ /app/record) were
// two full views of the SAME `analyses` row — every internal link now
// points at the Brief, and this route 301s old bookmarks/alert emails to
// it too, so exactly one view of an analysis exists. The Brief does its
// own auth + ownership checks (redirect('/login') / notFound), so nothing
// is lost by not repeating them here. The legacy implementation
// (MemoDetailBody + MemoDisplay and friends) is intact in git history and
// still on disk for any future decision to restore parts of it.
export default function MemoPage({ params }: { params: { id: string } }) {
  redirect(`/app/brief/${params.id}`)
}
