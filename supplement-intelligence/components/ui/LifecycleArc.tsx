// Canonical stage-progression visual — a horizontal dot-line. Chosen over
// the other 3 implementations seen in the Stitch mockups (circular gauge,
// bubble scatter, curved SVG arc) because it degrades cleanest to real,
// sparse discrete-stage data (e.g. stage1→stage4/blocked) without implying
// continuous progress that doesn't exist in the data.
//
// `variant="pi"` (UIv2-M2 Phase 2, 2026-07-21): additive opt-in restyle for
// the pi-* report migration — its only consumer today is
// components/memo/CurrentSignal.tsx, but kept as a default-preserving
// variant (not a hard swap) in case another legacy screen adopts this
// component before its own migration lands.
//
// `variant="pi-noir"` (Terminal Noir Candidate Detail port, 2026-07-23):
// additive dark-stage restyle — 'pi's near-black dots/connector/border
// (bg-pi-ink, bg-pi-card, text-pi-ink, bg-pi-hairline) are all tuned for a
// white pi-card surface and read as invisible-on-near-black or unreadable
// text once CurrentSignal.tsx moved onto the dark pi-stage chapter panel
// (Terminal Noir port). Same dark-safe token swap as every other port this
// pass (pi-ink→pi-noir-text, pi-card→pi-elevated, pi-hairline→
// pi-noir-hairline, pi-faint→pi-noir-sub, pi-risk→pi-risk-noir), same
// "additive variant, existing 'legacy'/'pi' consumers untouched" discipline
// WitnessDots.tsx already established for its own pi-noir variant.
export function LifecycleArc({
  stages, currentIndex, blocked = false, className = '', variant = 'legacy',
}: { stages: string[]; currentIndex: number; blocked?: boolean; className?: string; variant?: 'legacy' | 'pi' | 'pi-noir' }) {
  const isPi = variant === 'pi'
  const isPiNoir = variant === 'pi-noir'
  return (
    <div className={`flex items-center ${className}`}>
      {stages.map((label, i) => {
        const done = !blocked && i < currentIndex
        const active = !blocked && i === currentIndex
        const isLast = i === stages.length - 1
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <span
                className={`w-3 h-3 rounded-full border-2 ${isPiNoir ? 'border-pi-noir-text' : isPi ? 'border-pi-ink' : 'border-black'} ${
                  blocked && i === currentIndex
                    ? (isPiNoir ? 'bg-pi-risk-noir' : isPi ? 'bg-pi-risk' : 'bg-verdict-negative')
                    : done || active
                      ? (isPiNoir ? 'bg-pi-noir-text' : isPi ? 'bg-pi-ink' : 'bg-black')
                      : (isPiNoir ? 'bg-pi-elevated' : isPi ? 'bg-pi-card' : 'bg-white')
                }`}
              />
              <span className={`text-[10px] font-mono uppercase tracking-wider whitespace-nowrap ${active ? (isPiNoir ? 'text-pi-noir-text font-bold' : isPi ? 'text-pi-ink font-bold' : 'text-black font-bold') : (isPiNoir ? 'text-pi-noir-sub' : isPi ? 'text-pi-faint' : 'text-outline')}`}>
                {label}
              </span>
            </div>
            {!isLast && <div className={`h-[2px] flex-1 mx-1.5 ${done ? (isPiNoir ? 'bg-pi-noir-text' : isPi ? 'bg-pi-ink' : 'bg-black') : (isPiNoir ? 'bg-pi-noir-hairline' : isPi ? 'bg-pi-hairline' : 'bg-outline-variant')}`} />}
          </div>
        )
      })}
    </div>
  )
}
