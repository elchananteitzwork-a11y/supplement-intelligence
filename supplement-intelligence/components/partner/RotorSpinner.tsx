// V4-native rotor mark (visual-polish pass, 2026-07-24). Deliberately NOT a
// reuse of components/cine/RotorMark — that module is banned from this
// namespace by eslint.config.mjs's V4 reset rule (components/cine is the
// cinematic redesign, out of Phase-1/2 scope here). Same real 6-blade
// geometry (the locked brand mark), rebuilt as a plain SVG for the Hunt
// "researching" state — a slow, honest ambient spin (not a fake progress
// indicator; the checked-set lines beside it are what carry real state).
export function RotorSpinner({ spinning, className }: { spinning: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label="Product Intelligence"
      className={`${spinning ? 'motion-safe:animate-spin' : ''} ${className ?? ''}`}
      style={spinning ? { animationDuration: '3.2s' } : undefined}
    >
      <path d="M 132.45 86.89 L 133.47 110.23 L 172.75 142.00 L 182.97 86.86 Z" fill="currentColor" />
      <path d="M 127.58 121.55 L 107.87 134.10 L 100.00 184.00 L 152.86 165.28 Z" fill="currentColor" opacity="0.86" />
      <path d="M 95.13 134.66 L 74.40 123.87 L 27.25 142.00 L 69.90 178.42 Z" fill="currentColor" opacity="0.72" />
      <path d="M 67.55 113.11 L 66.53 89.77 L 27.25 58.00 L 17.03 113.14 Z" fill="currentColor" opacity="0.58" />
      <path d="M 72.42 78.45 L 92.13 65.90 L 100.00 16.00 L 47.14 34.72 Z" fill="currentColor" opacity="0.72" />
      <path d="M 104.87 65.34 L 125.60 76.13 L 172.75 58.00 L 130.10 21.58 Z" fill="currentColor" opacity="0.86" />
      {/* Core matches pi-card (#FFFFFF) — the only surface this renders on. */}
      <circle cx="100" cy="100" r="27" fill="#FFFFFF" />
    </svg>
  )
}
