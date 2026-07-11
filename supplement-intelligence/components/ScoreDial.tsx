import type { BuildDecision } from '@/types/index'

const DECISION_COLOR: Record<BuildDecision, string> = {
  BUILD_NOW:        '#008a00',
  VALIDATE_FURTHER: '#fbc02d',
  SKIP:             '#d32f2f',
  CATEGORY_CREATION_CANDIDATE: '#000000',
}

// Compact full-circle progress ring — a mini instrument reading for card
// corners and list rows, distinct register from the big semicircle gauge
// used on the memo masthead (that one's a dial; this one's a KPI ring).
export function ScoreDial({ score, decision, size = 52 }: { score: number; decision: BuildDecision; size?: number }) {
  const c = DECISION_COLOR[decision]
  const strokeW = Math.max(2.5, size * 0.07)
  const r  = size / 2 - strokeW
  const cx = size / 2, cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (circumference * Math.min(100, Math.max(0, score))) / 100

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000000" strokeOpacity="0.1" strokeWidth={strokeW} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={strokeW} strokeLinecap="butt"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono font-bold leading-none" style={{ color: c, fontSize: size * 0.3 }}>
        {Math.round(score)}
      </span>
    </div>
  )
}
