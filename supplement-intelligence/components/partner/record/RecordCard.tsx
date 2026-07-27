import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Shared card shell for every Record chapter (Demand, Competition,
// Economics, Customers, Signals & Safety, and any future chapter) —
// ChapterPage.tsx is itself the one shared renderer for all of these, but
// each card variant hand-rolled its own Tailwind string, so overflow safety
// had to be remembered per call site instead of guaranteed once. Fixed here
// instead of per-section:
//   - overflow-hidden: keeps content within the rounded corners.
//   - break-words (overflow-wrap: break-word) on the card itself: this CSS
//     property inherits to every descendant, so any child text — present or
//     future — wraps a too-long unbroken run (a competitor name, a
//     comma-joined brand list, a review-derived phrase with no spaces)
//     instead of pushing the card wider than its container.
//   - min-w-0: lets the card shrink inside a flex/grid ancestor rather than
//     being floored at its content's natural width.
//   - no fixed height anywhere: the card always grows to fit wrapped
//     content vertically; that's just default block flow, left alone.
// className carries whatever's still per-variant (radius, shadow, padding,
// divide-y) so visual differences between cards are untouched.
export function RecordCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'min-w-0 overflow-hidden break-words rounded-2xl border border-pi-hairline bg-pi-card shadow-[0_1px_3px_rgba(22,23,26,0.05),0_10px_24px_-14px_rgba(22,23,26,0.14)]',
      className,
    )}>
      {children}
    </div>
  )
}

// The claim/value row pattern (label left, number/value right) used inside
// a RecordCard. min-w-0 + break-words on BOTH columns is deliberate, not
// just the label: `value` looks like a short number ("$48.2M", "1,200/mo")
// in the common case, but lib/partner-copy-record.ts also feeds this same
// slot real prose (e.g. `dominant_brands`, typed "prose" in types/index.ts,
// not a number) — a fixed whitespace-nowrap here previously assumed every
// value would stay short and let that one row overflow. Capping both
// columns at a max-width share (60/40) and letting both wrap keeps short
// values single-line (nothing to wrap) and makes long ones grow the row
// vertically instead of pushing it wider than the card.
export function RecordCardRow({ claim, value, marker }: { claim: ReactNode; value: ReactNode; marker: 'measured' | 'judgment' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-4 text-sm">
      <span className="min-w-0 max-w-[60%] break-words text-pi-ink">{claim}</span>
      <span className="flex min-w-0 max-w-[40%] items-center gap-2 break-words text-right font-mono font-semibold tabular-nums text-pi-ink">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${marker === 'measured' ? 'bg-pi-ink' : 'bg-pi-gold'}`} />
        <span className="min-w-0 break-words">{value}</span>
      </span>
    </div>
  )
}
