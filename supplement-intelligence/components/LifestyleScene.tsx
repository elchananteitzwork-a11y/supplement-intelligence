import { MINI_PATHS, inferProductShape } from '@/components/ProductGlyph'

type TimeOfDay = 'morning' | 'midday' | 'evening'

function inferTimeOfDay(dosing: string): TimeOfDay {
  const d = (dosing ?? '').toLowerCase()
  if (['am', 'morning', 'breakfast', 'wake'].some(t => d.includes(t))) return 'morning'
  if (['pm', 'night', 'evening', 'bed', 'wind-down', 'wind down'].some(t => d.includes(t))) return 'evening'
  return 'midday'
}

const PALETTE: Record<TimeOfDay, { sky: [string, string]; orb: string; orbGlow: string; label: string }> = {
  morning: { sky: ['#2a2118', '#0a0a0c'], orb: '#F1C77A', orbGlow: '#F1C77A', label: 'Morning routine' },
  midday:  { sky: ['#1c1f24', '#0a0a0c'], orb: '#cfd6dd', orbGlow: '#9aa7b5', label: 'Midday moment' },
  evening: { sky: ['#1a1530', '#0a0a0c'], orb: '#a78bd6', orbGlow: '#7c6bb3', label: 'Evening wind-down' },
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
    <div className="rounded-xl border border-white/[0.07] overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 pt-5">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Lifestyle Concept</p>
        <p className="text-[10px] text-zinc-600 italic">Generated scene — not a photo</p>
      </div>
      <svg viewBox="0 0 400 200" className="w-full h-auto" style={{ animation: 'heroRenderIn .9s var(--ease-premium, ease) both' }}>
        <defs>
          <linearGradient id="lsSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.sky[0]} />
            <stop offset="100%" stopColor={pal.sky[1]} />
          </linearGradient>
          <radialGradient id="lsOrb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pal.orbGlow} stopOpacity="0.55" />
            <stop offset="100%" stopColor={pal.orbGlow} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="200" fill="url(#lsSky)" />

        {/* orb + glow, position varies by time of day */}
        <circle cx={time === 'morning' ? 70 : time === 'evening' ? 330 : 200} cy="46" r="70" fill="url(#lsOrb)" />
        <circle cx={time === 'morning' ? 70 : time === 'evening' ? 330 : 200} cy="46" r="11" fill={pal.orb} opacity="0.9" />

        {/* ambient particles */}
        {[[40, 110], [320, 70], [250, 140], [110, 150], [360, 130]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="1.6" fill="#ffffff" opacity="0.18" />
        ))}

        {/* counter / surface line */}
        <line x1="0" y1="158" x2="400" y2="158" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.5" />
        <rect x="0" y="158" width="400" height="42" fill="#000000" opacity="0.22" />

        {/* abstract figure — same bust-glyph vocabulary as the persona card */}
        <g transform="translate(248,90)" opacity="0.92">
          <path d="M-34,68 Q-34,30 8,26 Q50,30 50,68" fill="none" stroke="#C8A463" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="8" cy="2" r="24" fill="#0d0d10" stroke="#C8A463" strokeWidth="2.5" />
        </g>

        {/* product, placed on the counter near the figure — raw path in this
            svg's own coordinate space (nesting a full <svg> here would size
            against the viewport, not the 400x200 scene viewBox) */}
        <g transform="translate(176,128) scale(1.15)">
          <path d={MINI_PATHS[shape]} fill="#C8A463" fillRule="evenodd" />
        </g>
      </svg>
      <p className="text-center text-xs text-zinc-500 pb-4 pt-1">{pal.label}</p>
    </div>
  )
}
