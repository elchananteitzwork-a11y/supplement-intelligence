// Small metric block — replaces the ad-hoc "Instrument readouts" divs
// duplicated across dashboard/leaderboard in the old frontend.
export function StatTile({
  label, value, color,
}: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-black px-4 py-4">
      <p className="text-[10px] font-mono text-outline uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-black font-mono leading-none" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  )
}
