import Link from 'next/link'
import type { RecordChapterVM } from '@/lib/partner-copy-record'

// The Record index (V4 Phase 2, RD_V4_PHASE2.md Milestone B) — a chapter
// list, not one long scroll. Real routes (not client state) so each
// chapter is deep-linkable and Back behaves correctly.
export function ChapterIndex({
  analysisId, categoryName, thesis, chapters, appendixHref,
}: {
  analysisId: string
  categoryName: string
  thesis: string | null
  chapters: RecordChapterVM[]
  appendixHref: string
}) {
  return (
    <div className="min-h-screen bg-pi-cream pb-20 text-pi-ink">
      <div className="mx-auto max-w-[640px] px-5 pt-12 sm:pt-16">
        <div className="mb-10 text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-pi-faint">Full record</p>
          <p className="text-balance font-serif text-[28px] font-semibold tracking-tight">{categoryName}</p>
        </div>

        {/* Visual-polish fix (2026-07-24): a long real thesis paragraph
            centered end-to-end is genuinely hard to read — center-aligned
            text only works for short lines. Left-aligned in its own reading
            column, same treatment as any other prose block on this page. */}
        {thesis && (
          <p className="mx-auto mb-10 max-w-[58ch] text-left font-serif text-[18px] italic leading-relaxed text-pi-ink">
            {thesis}
          </p>
        )}

        <ul className="divide-y divide-pi-hairline overflow-hidden rounded-2xl border border-pi-hairline bg-pi-card shadow-[0_1px_3px_rgba(22,23,26,0.05),0_10px_24px_-14px_rgba(22,23,26,0.14)]">
          {chapters.map(ch => (
            <li key={ch.key}>
              <Link
                href={`/app/record/${analysisId}/${ch.key}`}
                className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-pi-sand/60"
              >
                <span className="min-w-0">
                  <span className="block font-serif text-[17px] font-semibold text-pi-ink">{ch.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-pi-sub">{ch.headline}</span>
                </span>
                <span aria-hidden className="shrink-0 text-pi-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-pi-gold-deep">→</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 text-center">
          <Link href={appendixHref} className="text-sm text-pi-gold hover:underline">
            Download the full evidence appendix →
          </Link>
        </div>
      </div>
    </div>
  )
}
