// Core evidence-confidence primitive from the Stitch design system: filled
// dots = confirmed/verified, hollow dots = missing/required. Never invents
// a total — `filled`/`total` must both come from real data (e.g. real
// evidenceBreadth.contributingProviders / totalScoreEligibleProviders).
export function WitnessDots({
  filled, total, size = 'md', label,
}: { filled: number; total: number; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const px = size === 'sm' ? 8 : size === 'lg' ? 16 : 12
  const gap = size === 'sm' ? 'gap-1' : 'gap-1.5'
  return (
    <div className={`flex items-center ${gap}`} role="img" aria-label={label ?? `${filled} of ${total} witnesses confirmed`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={i < filled ? 'rounded-full bg-black' : 'rounded-full bg-white border border-black'}
          style={{ width: px, height: px }}
        />
      ))}
    </div>
  )
}
