import { GlassPanel } from './GlassPanel'
import { TONE_LINE, TONE_TEXT, TONE_GLOW, buildTracePath, type InstrumentTone } from './GlassInstrument'

// ═══════════════════════════════════════════════════════════════════════
// ProofCard — the richer Landing verdict panel (category + name + verdict
// pill + live trace + thesis excerpt). Same GlassPanel surface and trace
// technique as GlassInstrument, just a bigger composition for a screen
// that needs to tell a short story per card, not just show a number.
// ═══════════════════════════════════════════════════════════════════════

const VERDICT_LABEL: Record<InstrumentTone, string> = {
  build: 'Build now',
  invest: 'Validate further',
  risk: 'Skip',
  neutral: '—',
}
const VERDICT_PILL_BG: Record<InstrumentTone, string> = {
  build: 'rgba(63,163,110,.16)',
  invest: 'rgba(91,127,187,.16)',
  risk: 'rgba(201,87,63,.16)',
  neutral: 'rgba(212,169,74,.16)',
}

export function ProofCard({
  window: windowLabel,
  name,
  tone,
  thesis,
  trace,
  cometDelay = 0,
}: {
  window: string
  name: string
  tone: InstrumentTone
  thesis: string
  trace: number[]
  cometDelay?: number
}) {
  const graph = buildTracePath(trace, 200, 40)
  const gradId = `pc-grad-${name.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <GlassPanel tone={tone} hover3d className="px-[26px] pb-[22px] pt-[26px]">
      <div className="mb-3.5 flex items-start justify-between gap-2.5">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {windowLabel}
          </div>
          <div className="font-serif text-[16.5px] font-semibold text-pi-cream [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
            {name}
          </div>
        </div>
        <span
          className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] font-mono text-[11px] font-bold"
          style={{ color: TONE_TEXT[tone], background: VERDICT_PILL_BG[tone] }}
        >
          {VERDICT_LABEL[tone]}
        </span>
      </div>

      <div className="relative mb-3.5 h-10">
        <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="h-full w-full overflow-visible" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.25))' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={TONE_LINE[tone]} stopOpacity="0.8" />
              <stop offset="100%" stopColor={TONE_LINE[tone]} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={graph.area} fill={`url(#${gradId})`} />
          <path d={graph.line} fill="none" stroke={TONE_LINE[tone]} strokeWidth="1.8" />
          <circle cx={graph.lastX} cy={graph.lastY} r="2.8" fill={TONE_LINE[tone]} />
        </svg>
        <span
          className="absolute left-0 top-0 -mt-[3.5px] -ml-[18px] flex h-[7px] w-[22px] items-center motion-safe:animate-cine-travel"
          style={{ offsetPath: `path('${graph.offsetPath}')`, animationDelay: `${cometDelay}s` } as React.CSSProperties}
        >
          <span className="h-[2px] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${TONE_LINE[tone]})` }} />
          <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: `radial-gradient(circle, #fff, ${TONE_LINE[tone]} 60%)`, filter: `drop-shadow(0 0 5px ${TONE_GLOW[tone]})` }} />
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-pi-cream/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">{thesis}</p>
    </GlassPanel>
  )
}
