'use client'

import type { FounderFitAnnotation } from '@/lib/stage2/types'
import { WitnessDots } from '@/components/ui'

interface Props {
  annotation: FounderFitAnnotation
}

const CAPITAL_COLORS: Record<string, string> = {
  sufficient:    'text-pi-build border-pi-build/40',
  tight:         'text-pi-gold border-pi-gold/40',
  insufficient:  'text-pi-risk border-pi-risk/40',
}
const CAPITAL_LABEL: Record<string, string> = {
  sufficient: 'Sufficient', tight: 'Tight', insufficient: 'Insufficient',
}

const CHANNEL_COLORS: Record<string, string> = {
  strong:  'text-pi-build border-pi-build/40',
  partial: 'text-pi-gold border-pi-gold/40',
  weak:    'text-pi-risk border-pi-risk/40',
}
const CHANNEL_LABEL: Record<string, string> = {
  strong: 'Strong', partial: 'Partial', weak: 'Weak',
}

const TIMELINE_COLORS: Record<string, string> = {
  feasible:   'text-pi-build border-pi-build/40',
  stretched:  'text-pi-gold border-pi-gold/40',
  infeasible: 'text-pi-risk border-pi-risk/40',
}
const TIMELINE_LABEL: Record<string, string> = {
  feasible: 'Feasible', stretched: 'Stretched', infeasible: 'Infeasible',
}

function FitBadge({ level, colors, labels }: { level: string; colors: Record<string, string>; labels: Record<string, string> }) {
  const cls = colors[level] ?? 'text-pi-sub border-pi-hairline'
  return (
    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border bg-pi-card ${cls}`}>
      {labels[level] ?? level}
    </span>
  )
}

export function FounderFitPanel({ annotation }: Props) {
  const { capital_fit, channel_fit, timeline_fit, experience_gaps, advantages, gaps, fit_rank } = annotation

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold text-pi-ink tracking-tight border-b border-pi-hairline pb-2">
        Founder Fit — Personalized Assessment
      </h2>

      {/* Overall fit rank */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
          Overall Fit Score
        </p>
        <WitnessDots filled={fit_rank} total={5} size="md" />
        <p className="text-[10px] text-pi-faint">
          Composite of capital adequacy, channel strength, timeline viability, and execution gaps ({fit_rank}/5)
        </p>
      </div>

      {/* Three dimensions: capital / channel / timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-pi-hairline p-3 space-y-1.5 bg-pi-card">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">Capital</p>
            <FitBadge level={capital_fit.level} colors={CAPITAL_COLORS} labels={CAPITAL_LABEL} />
          </div>
          <p className="text-xs text-pi-sub leading-relaxed">{capital_fit.note}</p>
          {capital_fit.buffer_pct !== undefined && (
            <p className="text-[10px] font-mono text-pi-faint">
              {capital_fit.buffer_pct >= 0 ? '+' : ''}{capital_fit.buffer_pct}% buffer
            </p>
          )}
        </div>

        <div className="rounded-xl border border-pi-hairline p-3 space-y-1.5 bg-pi-card">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">Channel</p>
            <FitBadge level={channel_fit.level} colors={CHANNEL_COLORS} labels={CHANNEL_LABEL} />
          </div>
          <p className="text-xs text-pi-sub leading-relaxed">{channel_fit.note}</p>
        </div>

        <div className="rounded-xl border border-pi-hairline p-3 space-y-1.5 bg-pi-card">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">Timeline</p>
            <FitBadge level={timeline_fit.level} colors={TIMELINE_COLORS} labels={TIMELINE_LABEL} />
          </div>
          <p className="text-xs text-pi-sub leading-relaxed">{timeline_fit.note}</p>
        </div>
      </div>

      {/* Advantages */}
      {advantages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono font-semibold text-pi-build uppercase tracking-wider">
            Your Advantages
          </p>
          <ul className="space-y-1">
            {advantages.map((a, i) => (
              <li key={i} className="text-xs text-pi-sub flex gap-2">
                <span className="shrink-0 text-pi-build">✓</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Execution gaps */}
      {experience_gaps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono font-semibold text-pi-gold uppercase tracking-wider">
            Execution Gaps — Action Required
          </p>
          <ul className="space-y-1">
            {experience_gaps.map((g, i) => (
              <li key={i} className="text-xs text-pi-gold flex gap-2">
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
          <p className="text-[10px] font-mono font-semibold text-pi-risk uppercase tracking-wider">
            Critical Blockers
          </p>
          <ul className="space-y-1">
            {gaps.filter(g => !experience_gaps.includes(g)).map((g, i) => (
              <li key={i} className="text-xs text-pi-risk flex gap-2">
                <span className="shrink-0">✗</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clean state */}
      {experience_gaps.length === 0 && gaps.length === 0 && advantages.length > 0 && (
        <div className="rounded-xl border border-pi-build/40 bg-pi-card px-3 py-2">
          <p className="text-xs text-pi-build">No execution gaps identified — your profile aligns well with this thesis.</p>
        </div>
      )}
    </section>
  )
}
