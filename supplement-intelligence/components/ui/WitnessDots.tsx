// Core evidence-confidence primitive from the Stitch design system: filled
// dots = confirmed/verified, hollow dots = missing/required. Never invents
// a total — `filled`/`total` must both come from real data (e.g. real
// evidenceBreadth.contributingProviders / totalScoreEligibleProviders).
//
// `variant="pi"` (UIv2-M2 Phase 2, 2026-07-21): additive opt-in restyle —
// default ('legacy') stays byte-identical for whatever still-unmigrated
// consumer needs it. (Corrected 2026-07-21 audit: app/alerts and
// app/watchlist already pass variant="pi" — only app/research/history and
// the rest of the old research/* tree are still genuinely on 'legacy'.)
export function WitnessDots({
  filled, total, size = 'md', label, variant = 'legacy',
}: { filled: number; total: number; size?: 'sm' | 'md' | 'lg'; label?: string; variant?: 'legacy' | 'pi' }) {
  const px = size === 'sm' ? 8 : size === 'lg' ? 16 : 12
  const gap = size === 'sm' ? 'gap-1' : 'gap-1.5'
  const filledCls = variant === 'pi' ? 'rounded-full bg-pi-ink' : 'rounded-full bg-black'
  const emptyCls  = variant === 'pi' ? 'rounded-full bg-pi-card border border-pi-hairline' : 'rounded-full bg-white border border-black'
  return (
    <div className={`flex items-center ${gap}`} role="img" aria-label={label ?? `${filled} of ${total} witnesses confirmed`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={i < filled ? filledCls : emptyCls}
          style={{ width: px, height: px }}
        />
      ))}
    </div>
  )
}
