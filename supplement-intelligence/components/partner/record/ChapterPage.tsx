'use client'

import { useRouter } from 'next/navigation'
import type { RecordChapterVM, GapLetterVM } from '@/lib/partner-copy-record'
import { GapLetter } from './GapLetter'

// One Record chapter (V4 Phase 2, RD_V4_PHASE2.md Milestone B) — pushed
// screen with a back arrow, same top-bar pattern the Interrogation sheet
// already uses elsewhere in this namespace.
export function ChapterPage({ chapter, gap }: { chapter: RecordChapterVM; gap: GapLetterVM | null }) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-pi-cream pb-16 text-pi-ink">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-pi-hairline bg-pi-cream/90 px-5 py-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)] backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-pi-sub transition-colors hover:bg-pi-card"
        >
          ←
        </button>
        <span className="font-serif text-[17px] font-semibold text-pi-ink">{chapter.title}</span>
      </div>

      <div className="mx-auto max-w-[640px] px-5 pt-10">
        {chapter.key === 'gap' && gap ? (
          <GapLetter gap={gap} />
        ) : (
          <>
            <p className="mb-6 max-w-[65ch] text-[15px] leading-relaxed text-pi-sub">{chapter.headline}</p>

            {chapter.rows.length > 0 && (
              <div className="mb-6 divide-y divide-pi-hairline rounded-2xl border border-pi-hairline bg-pi-card px-5 shadow-[0_1px_3px_rgba(22,23,26,0.05),0_10px_24px_-14px_rgba(22,23,26,0.14)]">
                {chapter.rows.map((row, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-4 text-sm">
                    <span className="min-w-0 max-w-[60%] text-pi-ink">{row.claim}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap font-mono font-semibold tabular-nums text-pi-ink">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${row.marker === 'measured' ? 'bg-pi-ink' : 'bg-pi-gold'}`}
                      />
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {chapter.read && (
              <div className="relative overflow-hidden rounded-xl border border-pi-hairline bg-pi-card py-4 pl-5 pr-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-pi-gold-deep" />
                <p className="max-w-[65ch] font-serif text-[16px] italic leading-relaxed text-pi-ink">
                  <span className="not-italic font-mono text-[10px] font-bold uppercase tracking-wide text-pi-gold-deep">My read </span>
                  <br />
                  {chapter.read}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
