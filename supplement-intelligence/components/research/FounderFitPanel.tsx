'use client'

import type { FounderFitAnnotation } from '@/lib/stage2/types'

interface Props {
  annotation: FounderFitAnnotation
}

const CAPITAL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  sufficient:    { bg: 'bg-green-950/40 border-green-900', text: 'text-green-400', label: 'Sufficient' },
  tight:         { bg: 'bg-yellow-950/40 border-yellow-900', text: 'text-yellow-400', label: 'Tight' },
  insufficient:  { bg: 'bg-red-950/40 border-red-900', text: 'text-red-400', label: 'Insufficient' },
}

const CHANNEL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  strong:  { bg: 'bg-green-950/40 border-green-900', text: 'text-green-400', label: 'Strong' },
  partial: { bg: 'bg-yellow-950/40 border-yellow-900', text: 'text-yellow-400', label: 'Partial' },
  weak:    { bg: 'bg-red-950/40 border-red-900', text: 'text-red-400', label: 'Weak' },
}

const TIMELINE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  feasible:   { bg: 'bg-green-950/40 border-green-900', text: 'text-green-400', label: 'Feasible' },
  stretched:  { bg: 'bg-yellow-950/40 border-yellow-900', text: 'text-yellow-400', label: 'Stretched' },
  infeasible: { bg: 'bg-red-950/40 border-red-900', text: 'text-red-400', label: 'Infeasible' },
}

function FitBadge({ level, colors }: { level: string; colors: typeof CAPITAL_COLORS }) {
  const c = colors[level] ?? { bg: 'bg-gray-900 border-gray-700', text: 'text-gray-400', label: level }
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

function RankBar({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= rank ? 'bg-indigo-500' : 'bg-gray-800'
          }`}
        />
      ))}
      <span className="text-xs font-mono text-gray-400 ml-1">{rank}/5</span>
    </div>
  )
}

export function FounderFitPanel({ annotation }: Props) {
  const { capital_fit, channel_fit, timeline_fit, experience_gaps, advantages, gaps, fit_rank } = annotation

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300 tracking-tight border-b border-gray-800 pb-2">
        Founder Fit — Personalized Assessment
      </h2>

      {/* Overall fit rank */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Overall Fit Score
        </p>
        <RankBar rank={fit_rank} />
        <p className="text-[10px] text-gray-600">
          Composite of capital adequacy, channel strength, timeline viability, and execution gaps
        </p>
      </div>

      {/* Three dimensions: capital / channel / timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 space-y-1.5 border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Capital</p>
            <FitBadge level={capital_fit.level} colors={CAPITAL_COLORS} />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{capital_fit.note}</p>
          {capital_fit.buffer_pct !== undefined && (
            <p className="text-[10px] font-mono text-gray-600">
              {capital_fit.buffer_pct >= 0 ? '+' : ''}{capital_fit.buffer_pct}% buffer
            </p>
          )}
        </div>

        <div className="rounded-lg border p-3 space-y-1.5 border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Channel</p>
            <FitBadge level={channel_fit.level} colors={CHANNEL_COLORS} />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{channel_fit.note}</p>
        </div>

        <div className="rounded-lg border p-3 space-y-1.5 border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Timeline</p>
            <FitBadge level={timeline_fit.level} colors={TIMELINE_COLORS} />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{timeline_fit.note}</p>
        </div>
      </div>

      {/* Advantages */}
      {advantages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider">
            Your Advantages
          </p>
          <ul className="space-y-1">
            {advantages.map((a, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-2">
                <span className="shrink-0 text-green-600">✓</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Execution gaps */}
      {experience_gaps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider">
            Execution Gaps — Action Required
          </p>
          <ul className="space-y-1">
            {experience_gaps.map((g, i) => (
              <li key={i} className="text-xs text-orange-300/80 flex gap-2">
                <span className="shrink-0">→</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary gaps (combines capital/timeline blockers) */}
      {gaps.filter(g => !experience_gaps.includes(g)).length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">
            Critical Blockers
          </p>
          <ul className="space-y-1">
            {gaps.filter(g => !experience_gaps.includes(g)).map((g, i) => (
              <li key={i} className="text-xs text-red-300/80 flex gap-2">
                <span className="shrink-0 text-red-500">✗</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clean state */}
      {experience_gaps.length === 0 && gaps.length === 0 && advantages.length > 0 && (
        <div className="rounded-lg border border-green-900 bg-green-950/20 px-3 py-2">
          <p className="text-xs text-green-300">No execution gaps identified — your profile aligns well with this thesis.</p>
        </div>
      )}
    </section>
  )
}
