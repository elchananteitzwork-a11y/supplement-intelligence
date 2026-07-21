import { MINI_PATHS, inferProductShape } from '@/components/ProductGlyph'

type TimeOfDay = 'morning' | 'midday' | 'evening'

function inferTimeOfDay(dosing: string): TimeOfDay {
  const d = (dosing ?? '').toLowerCase()
  if (['am', 'morning', 'breakfast', 'wake'].some(t => d.includes(t))) return 'morning'
  if (['pm', 'night', 'evening', 'bed', 'wind-down', 'wind down'].some(t => d.includes(t))) return 'evening'
  return 'midday'
}

// pi-* warm-cream palette (UIv2-M2 Phase 2, 2026-07-21) — was the legacy
// monochrome surface/ink hex triplet; remapped onto the same real
// time-of-day logic below, values only.
const PALETTE: Record<TimeOfDay, { sky: [string, string]; orb: string; orbGlow: string; label: string }> = {
  morning: { sky: ['#F6F0E0', '#FBF7EE'], orb: '#16171A', orbGlow: '#16171A', label: 'Morning routine' },
  midday:  { sky: ['#EFE6CC', '#FBF7EE'], orb: '#16171A', orbGlow: '#16171A', label: 'Midday moment' },
  evening: { sky: ['#E4D3B8', '#FBF7EE'], orb: '#16171A', orbGlow: '#16171A', label: 'Evening wind-down' },
}

// ── Lifestyle Scene — a generated concept scene, not a photo. Time-of-day
// (and so the palette/orb) is inferred from the actual dosing field, not
// invented; the product glyph placed in-scene is the same shape used by
// the hero render and dashboard cards. Honesty framing matches the
// existing "concept render" disclaimer pattern used elsewhere in the memo.
export function LifestyleScene({ format, dosing }: { format: string; dosing: string }) {
  const time = inferTimeOfDay(dosing)
  const pal  = PALETTE[time]
  const shape = inferProductShape(format)

  return (
    <div className="rounded-xl border border-pi-hairline overflow-hidden bg-pi-card">
      <div className="flex items-center justify-between px-5 sm:px-6 pt-5">
        <p className="text-[10px] font-mono text-pi-faint uppercase tracking-wider">Lifestyle Concept</p>
        <p className="text-[10px] font-mono text-pi-faint italic">Generated scene — not a photo</p>
      </div>
      <svg viewBox="0 0 400 200" className="w-full h-auto">
        <defs>
          <linearGradient id="lsSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.sky[0]} />
            <stop offset="100%" stopColor={pal.sky[1]} />
          </linearGradient>
          <radialGradient id="lsOrb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pal.orbGlow} stopOpacity="0.12" />
            <stop offset="100%" stopColor={pal.orbGlow} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="200" fill="url(#lsSky)" />

        {/* orb + glow, position varies by time of day */}
        <circle cx={time === 'morning' ? 70 : time === 'evening' ? 330 : 200} cy="46" r="70" fill="url(#lsOrb)" />
        <circle cx={time === 'morning' ? 70 : time === 'evening' ? 330 : 200} cy="46" r="11" fill={pal.orb} opacity="0.85" />

        {/* ambient particles */}
        {[[40, 110], [320, 70], [250, 140], [110, 150], [360, 130]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.6" fill="#16171A" opacity="0.15" />
        ))}

        {/* counter / surface line */}
        <line x1="0" y1="158" x2="400" y2="158" stroke="#16171A" strokeOpacity="0.15" strokeWidth="1.5" />
        <rect x="0" y="158" width="400" height="42" fill="#16171A" opacity="0.06" />

        {/* abstract figure — same bust-glyph vocabulary as the persona card */}
        <g transform="translate(248,90)" opacity="0.85">
          <path d="M-34,68 Q-34,30 8,26 Q50,30 50,68" fill="none" stroke="#16171A" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="8" cy="2" r="24" fill="#FBF7EE" stroke="#16171A" strokeWidth="2.5" />
        </g>

        {/* product, placed on the counter near the figure — raw path in this
            svg's own coordinate space (nesting a full <svg> here would size
            against the viewport, not the 400x200 scene viewBox) */}
        <g transform="translate(176,128) scale(1.15)">
          <path d={MINI_PATHS[shape]} fill="#16171A" fillRule="evenodd" />
        </g>
      </svg>
      <p className="text-center text-xs font-mono text-pi-faint pb-4 pt-1">{pal.label}</p>
    </div>
  )
}
