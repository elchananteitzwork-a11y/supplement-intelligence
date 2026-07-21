// Small metric block — replaces the ad-hoc "Instrument readouts" divs
// duplicated across dashboard/leaderboard in the old frontend.
//
// `variant="pi"` (UIv2-M2 Phase 2, 2026-07-21): additive opt-in restyle —
// default ('legacy') stays byte-identical for whatever still-unmigrated
// consumer needs it. (Corrected 2026-07-21 audit: app/dashboard and
// app/leaderboard themselves already pass variant="pi" — this comment had
// drifted out of date the moment that migration landed.)
export function StatTile({
  label, value, color, sub, variant = 'legacy',
}: { label: string; value: string; color?: string; sub?: string; variant?: 'legacy' | 'pi' }) {
  if (variant === 'pi') {
    return (
      <div className="rounded-lg bg-pi-sand px-4 py-4">
        <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider mb-2">{label}</p>
        <p className="text-2xl font-bold font-mono leading-none text-pi-ink" style={color ? { color } : undefined}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-pi-faint mt-1">{sub}</p>}
      </div>
    )
  }
  return (
    <div className="bg-white border border-black px-4 py-4">
      <p className="text-[10px] font-mono text-outline uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-black font-mono leading-none" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-outline mt-0.5">{sub}</p>}
    </div>
  )
}
