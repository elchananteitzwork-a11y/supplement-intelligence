// ═══════════════════════════════════════════════════════════════════════
// Signal indicators — reskinned to the neo-brutalist system.
// Small, reused glyphs: ascending signal bars, TikTok-flavored pulse rings.
// ═══════════════════════════════════════════════════════════════════════

export function SignalBars({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const filled = level === 'Strong' ? 3 : level === 'Moderate' ? 2 : 1
  const color  = level === 'Strong' ? 'bg-[#008a00]' : level === 'Moderate' ? 'bg-[#a67c00]' : 'bg-[#7e7576]'
  return (
    <div className="flex items-end gap-0.5 h-3.5 shrink-0">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`w-1 ${i < filled ? color : 'bg-[#e2e2e2]'}`}
          style={{ height: `${40 + i * 30}%` }}
        />
      ))}
    </div>
  )
}

/** Reserved for the virality row specifically — the one signal that's
 * genuinely social/platform-native rather than a market metric. */
export function PulseRings({ level }: { level: 'Strong' | 'Moderate' | 'Weak' }) {
  const color = level === 'Strong' ? '#008a00' : level === 'Moderate' ? '#a67c00' : '#7e7576'
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
