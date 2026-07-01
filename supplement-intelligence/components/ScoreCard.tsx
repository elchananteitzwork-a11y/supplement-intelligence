function scoreColor(s: number) {
  if (s >= 8) return 'text-lab-verdant'
  if (s >= 6) return 'text-lab-amber'
  return 'text-lab-ember'
}

function scoreBg(s: number) {
  if (s >= 8) return 'bg-emerald-400/10 border-emerald-400/20'
  if (s >= 6) return 'bg-amber-400/10 border-amber-400/20'
  return 'bg-red-400/10 border-red-400/20'
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100
  const color =
    score >= 8 ? 'bg-emerald-400' : score >= 6 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function ScoreCard({
  label,
  score,
  notes,
}: {
  label: string
  score: number
  notes?: string
}) {
  return (
    <div className={`rounded-xl border p-4 ${scoreBg(score)}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          {label}
        </p>
        <span className={`font-mono font-bold text-lg leading-none ${scoreColor(score)}`}>
          {score}
          <span className="text-zinc-600 text-xs font-normal">/10</span>
        </span>
      </div>
      <ScoreBar score={score} />
      {notes && (
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{notes}</p>
      )}
    </div>
  )
}

export function OpportunityScore({ score }: { score: number }) {
  const color =
    score >= 65 ? 'text-lab-verdant' : score >= 50 ? 'text-lab-amber' : 'text-lab-ember'
  const ring =
    score >= 65 ? 'stroke-emerald-400' : score >= 50 ? 'stroke-amber-400' : 'stroke-red-400'
  const circumference = 2 * Math.PI * 48
  const dashOffset = circumference - (circumference * score) / 100

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r="48" fill="none" stroke="#27272a" strokeWidth="8" />
        <circle
          cx="56"
          cy="56"
          r="48"
          fill="none"
          className={ring}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono font-bold text-3xl leading-none ${color}`}>
          {score}
        </span>
        <span className="text-zinc-500 text-xs mt-1">/ 100</span>
      </div>
    </div>
  )
}

export function InlineScore({ score }: { score: number }) {
  return (
    <span className={`font-mono font-semibold ${scoreColor(score)}`}>
      {score}
      <span className="text-zinc-600 text-xs font-normal">/10</span>
    </span>
  )
}
