import { GlassPanel, type GlassTone } from './GlassPanel'

// ═══════════════════════════════════════════════════════════════════════
// GlassInstrument — a compact metric/verdict tile built on GlassPanel: a
// label, a value, and an optional real live-data trace with a traveling
// comet dot. Used for the Landing verdict modules and reused for any
// other compact real-metric readout across the redesign.
//
// Honesty rule: `trace` is optional and only ever real data (e.g. a
// verdict's own trend, a score's history). No trace is rendered — not a
// placeholder, not a flat line — when the caller has no real series to
// pass. Point-to-path normalization mirrors the existing convention in
// components/ui/SparklineChart.tsx (min/max into a fixed viewBox).
// ═══════════════════════════════════════════════════════════════════════

export type InstrumentTone = GlassTone

// Exported so other instruments (e.g. cine/ProofCard.tsx) reuse the exact
// same tone palette and trace math rather than redefining it.
export const TONE_TEXT: Record<InstrumentTone, string> = {
  build: '#a7e0bf',
  invest: '#a9c2ea',
  risk: '#eab3a5',
  neutral: '#F6E7B8',
}
export const TONE_LINE: Record<InstrumentTone, string> = {
  build: '#3FA36E',
  invest: '#5B7FBB',
  risk: '#C9573F',
  neutral: '#D4A94A',
}
export const TONE_GLOW: Record<InstrumentTone, string> = {
  build: 'rgba(63,163,110,.5)',
  invest: 'rgba(91,127,187,.5)',
  risk: 'rgba(201,87,63,.5)',
  neutral: 'rgba(212,169,74,.5)',
}

export function buildTracePath(values: number[], w: number, h: number, pad = 3) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const stepX = (w - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`
  const offsetPath = `M${pts.map(p => `${p[0]},${p[1]}`).join(' L')}`
  const [lastX, lastY] = pts[pts.length - 1]
  return { line, area, offsetPath, lastX, lastY }
}

export function GlassInstrument({
  label,
  value,
  tone = 'neutral',
  trace,
  cometDelay = 0,
  className = '',
}: {
  label: string
  value: React.ReactNode
  tone?: InstrumentTone
  /** Real data points only — omit entirely rather than fabricate a trend. */
  trace?: number[]
  /** Stagger multiple instruments' comet animations out of phase (seconds, negative). */
  cometDelay?: number
  className?: string
}) {
  const hasTrace = !!trace && trace.length >= 2
  const graph = hasTrace ? buildTracePath(trace!, 148, 38) : null
  const gradId = `gi-grad-${label.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <GlassPanel tone={tone} hover3d className={`min-w-[196px] px-5 pb-4 pt-[18px] ${className}`}>
      <div className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-pi-cream/50 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
        {label}
      </div>
      <div className="font-mono text-xl font-bold tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]" style={{ color: TONE_TEXT[tone] }}>
        {value}
      </div>

      {hasTrace && graph && (
        <div className="relative mt-2.5 h-[38px] w-full">
          <svg viewBox="0 0 148 38" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.25))' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="38" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={TONE_LINE[tone]} stopOpacity="0.85" />
                <stop offset="100%" stopColor={TONE_LINE[tone]} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={graph.area} fill={`url(#${gradId})`} opacity="0.9" />
            <path d={graph.line} fill="none" stroke={TONE_LINE[tone]} strokeWidth="2" />
            <circle cx={graph.lastX} cy={graph.lastY} r="2.6" fill={TONE_LINE[tone]} className="motion-safe:animate-cine-pulse" />
          </svg>
          <span
            className="absolute left-0 top-0 -mt-[3.5px] -ml-[18px] flex h-[7px] w-[22px] items-center motion-safe:animate-cine-travel"
            style={{ offsetPath: `path('${graph.offsetPath}')`, animationDelay: `${cometDelay}s` } as React.CSSProperties}
          >
            <span className="h-[2px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${TONE_LINE[tone]})` }} />
            <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: `radial-gradient(circle, #fff, ${TONE_LINE[tone]} 60%)`, filter: `drop-shadow(0 0 5px ${TONE_GLOW[tone]})` }} />
          </span>
        </div>
      )}
    </GlassPanel>
  )
}
