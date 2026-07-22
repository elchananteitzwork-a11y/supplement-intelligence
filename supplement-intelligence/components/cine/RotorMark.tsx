// Shared brand mark — same 6-blade rotor geometry used throughout the app
// (components/pi/candidate-core/buildRotorGeometry.ts, app/login/page.tsx's
// own RotorMark). Kept as one small shared component here so every cine/*
// surface (CineShell nav, Login instrument, etc.) references one source
// instead of re-pasting the path data per file.
export function RotorMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Product Intelligence" className={className}>
      <path d="M 132.45 86.89 L 133.47 110.23 L 172.75 142.00 L 182.97 86.86 Z" fill="#D4A94A" />
      <path d="M 127.58 121.55 L 107.87 134.10 L 100.00 184.00 L 152.86 165.28 Z" fill="#D4A94A" opacity="0.86" />
      <path d="M 95.13 134.66 L 74.40 123.87 L 27.25 142.00 L 69.90 178.42 Z" fill="#D4A94A" opacity="0.72" />
      <path d="M 67.55 113.11 L 66.53 89.77 L 27.25 58.00 L 17.03 113.14 Z" fill="#D4A94A" opacity="0.58" />
      <path d="M 72.42 78.45 L 92.13 65.90 L 100.00 16.00 L 47.14 34.72 Z" fill="#D4A94A" opacity="0.72" />
      <path d="M 104.87 65.34 L 125.60 76.13 L 172.75 58.00 L 130.10 21.58 Z" fill="#D4A94A" opacity="0.86" />
      <circle cx="100" cy="100" r="27" fill="#0f0e0c" />
    </svg>
  )
}
