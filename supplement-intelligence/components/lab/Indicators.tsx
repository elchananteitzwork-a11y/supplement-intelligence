// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — signal indicators
// Small, reused glyphs: ascending signal bars, TikTok-flavored pulse rings.
// ═══════════════════════════════════════════════════════════════════════

export function SignalBars({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const filled = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  const color  = level === 'Strong' ? 'bg-lab-verdant' : level === 'Moderate' ? 'bg-lab-amber' : 'bg-lab-text-tertiary'
  return (
    <div className="flex items-end gap-0.5 h-3.5 shrink-0">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i < filled ? color : 'bg-white/[0.12]'}`}
          style={{ height: `${40 + i * 30}%` }}
        />
      ))}
    </div>
  )
}

/** Reserved for the virality row specifically — the one signal that's
 * genuinely social/platform-native rather than a market metric. */
export function PulseRings({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const color = level === 'Strong' ? '#34d9a0' : level === 'Moderate' ? '#f5b947' : '#686c78'
  const rings = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  return (
    <div className="relative w-4 h-4 shrink-0 grid place-items-center">
      {Array.from({ length: rings }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full border"
          style={{
            borderColor: color, width: '60%', height: '60%',
            animation: 'tiktokPulse 2.2s ease-out infinite', animationDelay: `${i * 0.45}s`,
          }}
        />
      ))}
      <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    </div>
  )
}
