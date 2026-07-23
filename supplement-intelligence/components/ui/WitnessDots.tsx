// Core evidence-confidence primitive from the Stitch design system. Was a
// row of discrete filled/hollow dots; owner asked (2026-07-24) for a graph
// instead of dots, so this now renders the exact same filled/total ratio as
// a horizontal fill meter — same props contract, same real data (never
// invents a total — `filled`/`total` must both come from real data, e.g.
// real evidenceBreadth.contributingProviders / totalScoreEligibleProviders),
// same component name (kept as-is to avoid an unrelated rename touching all
// 9 call sites), just a different visual form for the identical ratio.
//
// `variant="pi"` (UIv2-M2 Phase 2, 2026-07-21): additive opt-in restyle —
// default ('legacy') stays byte-identical for whatever still-unmigrated
// consumer needs it. (Corrected 2026-07-21 audit: app/alerts and
// app/watchlist already pass variant="pi" — only app/research/history and
// the rest of the old research/* tree are still genuinely on 'legacy'.)
export function WitnessDots({
  filled, total, size = 'md', label, variant = 'legacy',
}: { filled: number; total: number; size?: 'sm' | 'md' | 'lg'; label?: string; variant?: 'legacy' | 'pi' }) {
  const dims = size === 'sm' ? { w: 40, h: 6 } : size === 'lg' ? { w: 80, h: 10 } : { w: 56, h: 8 }
  const trackCls = variant === 'pi' ? 'bg-pi-card border border-pi-hairline' : 'bg-white border border-black'
  const fillCls  = variant === 'pi' ? 'bg-pi-ink' : 'bg-black'
  const pct = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${trackCls}`}
      style={{ width: dims.w, height: dims.h }}
      role="img"
      aria-label={label ?? `${filled} of ${total} witnesses confirmed`}
    >
      <div className={`absolute inset-y-0 left-0 rounded-full ${fillCls}`} style={{ width: `${pct * 100}%` }} />
    </div>
  )
}
