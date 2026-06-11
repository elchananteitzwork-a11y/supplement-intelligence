import Link from 'next/link'
import type { Analysis } from '@/types/memo'
import { DecisionDot } from './BuildDecisionBadge'

function scoreColor(s: number) {
  if (s >= 65) return 'text-emerald-400'
  if (s >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function timeAgo(dateStr: string) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function AnalysisCard({ analysis: a }: { analysis: Analysis }) {
  const dimScores = [
    { l: 'Demand', s: a.score_demand },
    { l: 'Competition', s: a.score_competition },
    { l: 'Virality', s: a.score_virality },
    { l: 'Subscription', s: a.score_subscription },
    { l: 'Mfg', s: a.score_manufacturing },
    { l: 'Defense', s: a.score_defensibility },
  ]

  return (
    <Link
      href={`/memo/${a.id}`}
      className="card-hover p-5 flex flex-col gap-4 group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-sm leading-snug group-hover:text-white transition-colors line-clamp-2">
          {a.category_name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <DecisionDot decision={a.build_decision} />
          <span
            className={`font-mono font-bold text-xl leading-none ${scoreColor(a.opportunity_score)}`}
          >
            {Math.round(a.opportunity_score)}
          </span>
        </div>
      </div>

      {/* Dim scores mini grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {dimScores.map((d) => (
          <div key={d.l} className="bg-zinc-800/50 rounded-md p-2 text-center">
            <p className="text-[10px] text-zinc-600 mb-0.5">{d.l}</p>
            <span
              className={`text-xs font-mono font-semibold ${
                (d.s ?? 0) >= 8
                  ? 'text-emerald-400'
                  : (d.s ?? 0) >= 6
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {d.s ?? '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>{a.biggest_competitor_name ? `vs ${a.biggest_competitor_name}` : ''}</span>
        <span>{timeAgo(a.created_at)}</span>
      </div>
    </Link>
  )
}
