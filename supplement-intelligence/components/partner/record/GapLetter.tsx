import type { GapLetterVM } from '@/lib/partner-copy-record'

// "The gap — and how you'd win" (V4 Phase 2, RD_V4_PHASE2.md Milestone B).
// Deliberately NOT the ledger/card language the rest of the Record uses —
// this chapter is the partner's own commitment (build advice), so it earns
// the same serif-reading treatment the Brief's verdict word does. A single
// reading column, no cards, no dotted leaders.
export function GapLetter({ gap }: { gap: GapLetterVM }) {
  return (
    <div className="mx-auto max-w-[34em]">
      {gap.noReviewCorpus && (
        <p className="mb-6 font-serif text-[19px] italic leading-[1.75] text-pi-sub">
          No consumer review corpus yet — these gaps come from market structure, not customer complaints.
        </p>
      )}

      <p className="mb-7 font-serif text-[19px] leading-[1.75] text-pi-ink">
        <span aria-hidden className="float-left pr-2 pt-1 text-[56px] font-semibold leading-[0.85] text-pi-ink">
          {gap.openingFirstLetter}
        </span>
        {gap.openingRest}
      </p>

      {gap.gapStatements.map((g, i) => (
        <p key={i} className="mb-5 font-serif text-[19px] leading-[1.75] text-pi-ink">
          {g.text}
          <span
            aria-hidden
            className={`ml-2 inline-block h-1.5 w-1.5 rounded-full ${g.marker === 'measured' ? 'bg-pi-ink' : 'bg-pi-gold'}`}
          />
        </p>
      ))}

      <p className="mb-2 mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-pi-sub">If I were building this</p>
      <p className="mb-5 font-serif text-[19px] leading-[1.75] text-pi-ink">{gap.specIntro}</p>

      {gap.specRows.length > 0 && (
        <div className="mb-5 border-l-2 border-pi-hairline pl-5">
          {gap.specRows.map((row, i) => (
            <p key={i} className="font-serif text-[19px] leading-[1.75] text-pi-ink">
              {row.claim} — {row.value}
            </p>
          ))}
        </div>
      )}

      {gap.avoidLine && (
        <p className="mb-5 font-serif text-[19px] leading-[1.75] text-pi-ink">{gap.avoidLine}</p>
      )}

      {gap.brandMoves.length > 0 && (
        <>
          <p className="mb-2 mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-pi-sub">How you'd sell it</p>
          {gap.brandMoves.map((move, i) => (
            <p key={i} className="mb-3 font-serif text-[19px] leading-[1.75] text-pi-ink">{move}</p>
          ))}
        </>
      )}

      {gap.customerQuote && (
        <p className="my-8 border-y border-pi-hairline py-6 text-center font-serif text-[20px] italic leading-relaxed text-pi-ink">
          {gap.customerQuote}
        </p>
      )}

      <p className="mt-8 font-serif text-[19px] leading-[1.75] text-pi-ink">{gap.closingLine}</p>
    </div>
  )
}
