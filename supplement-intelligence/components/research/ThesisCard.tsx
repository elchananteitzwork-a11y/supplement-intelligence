'use client'

import type { InvestmentThesis } from '@/lib/stage2/types'
import type { FounderFitAnnotation } from '@/lib/stage2/types'

interface Props {
  thesis: InvestmentThesis & { id: string }
  fit?: FounderFitAnnotation
  rank: number
  expanded?: boolean
  onToggle?: () => void
}

const FIT_RANK_COLORS: Record<number, string> = {
  5: 'text-green-400 bg-green-950/40 border-green-700',
  4: 'text-green-400 bg-green-950/30 border-green-800',
  3: 'text-yellow-400 bg-yellow-950/30 border-yellow-800',
  2: 'text-orange-400 bg-orange-950/30 border-orange-800',
  1: 'text-red-400 bg-red-950/30 border-red-800',
}

const CAPITAL_COLORS: Record<string, string> = {
  sufficient:   'text-green-400',
  tight:        'text-yellow-400',
  insufficient: 'text-red-400',
}

const CHANNEL_COLORS: Record<string, string> = {
  strong:  'text-green-400',
  partial: 'text-yellow-400',
  weak:    'text-red-400',
}

const TIMELINE_COLORS: Record<string, string> = {
  feasible:   'text-green-400',
  stretched:  'text-yellow-400',
  infeasible: 'text-red-400',
}

const COMPLEXITY_COLORS: Record<string, string> = {
  low:    'text-green-400',
  medium: 'text-yellow-400',
  high:   'text-red-400',
}

const PAIN_INTENSITY_COLORS: Record<string, string> = {
  severe:   'text-red-400',
  moderate: 'text-yellow-400',
  mild:     'text-gray-400',
}

export function ThesisCard({ thesis, fit, rank, expanded, onToggle }: Props) {
  const fitColor = fit ? (FIT_RANK_COLORS[fit.fit_rank] ?? FIT_RANK_COLORS[3]) : ''

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      {/* Header — always visible */}
      <button
        className="w-full text-left px-5 py-4 hover:bg-gray-800/40 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">#{rank}</span>
              {fit && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${fitColor}`}>
                  Fit {fit.fit_rank}/5
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded border border-gray-700 ${
                COMPLEXITY_COLORS[thesis.quick_economics_check.launch_complexity]
              }`}>
                {thesis.quick_economics_check.launch_complexity} complexity
              </span>
              {thesis.quick_economics_check.margin_viable ? (
                <span className="text-xs px-2 py-0.5 rounded border border-green-800 text-green-400">margin viable</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded border border-red-800 text-red-400">margin risk</span>
              )}
            </div>
            <h3 className="text-base font-semibold text-gray-100 leading-snug">
              {thesis.product_angle}
            </h3>
            <p className="text-xs text-gray-400">{thesis.target_customer}</p>
          </div>
          <span className="text-gray-600 text-lg mt-0.5">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {/* Body — expanded only */}
      {expanded && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-5">
          {/* Differentiation */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Differentiation</p>
            <p className="text-sm text-gray-200">{thesis.differentiation}</p>
            <p className="text-xs text-gray-500 italic">
              Evidence: {thesis.differentiation_source}
            </p>
          </div>

          {/* Customer pain */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer Pain</p>
            <p className="text-sm text-gray-200">{thesis.customer_pain.problem}</p>
            <div className="flex gap-3 text-xs mt-1">
              <span className={PAIN_INTENSITY_COLORS[thesis.customer_pain.pain_intensity]}>
                {thesis.customer_pain.pain_intensity} intensity
              </span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-400">{thesis.customer_pain.frequency}</span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-500 italic">{thesis.customer_pain.evidence_source}</span>
            </div>
          </div>

          {/* Economics */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick Economics</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Price target</span>
                <p className="text-gray-200 font-mono">{thesis.quick_economics_check.price_point_estimate}</p>
              </div>
              <div>
                <span className="text-gray-500">Min capital</span>
                <p className="text-gray-200 font-mono">${(thesis.quick_economics_check.min_capital_required / 1000).toFixed(0)}k</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">{thesis.quick_economics_check.margin_note}</p>
            {thesis.quick_economics_check.complexity_drivers.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {thesis.quick_economics_check.complexity_drivers.map(d => (
                  <span key={d} className="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Supporting evidence */}
          {thesis.supporting_evidence?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Evidence Citations</p>
              <ul className="space-y-1">
                {thesis.supporting_evidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 text-[10px] px-1 py-0 rounded border font-mono shrink-0 ${
                      ev.source_type === 'primary_measurement'
                        ? 'border-green-800 text-green-400 bg-green-950/30'
                        : ev.source_type === 'provider_model'
                        ? 'border-blue-800 text-blue-400 bg-blue-950/30'
                        : 'border-gray-700 text-gray-400 bg-gray-800'
                    }`}>
                      {ev.source_type === 'primary_measurement' ? 'M' : ev.source_type === 'provider_model' ? 'P' : 'C'}
                    </span>
                    <span className="text-gray-300">{ev.value}</span>
                    <span className="text-gray-600 shrink-0">· {ev.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Founder fit detail */}
          {fit && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Your Fit · Score {fit.fit_rank}/5
              </p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Capital</span>
                  <p className={CAPITAL_COLORS[fit.capital_fit.level]}>{fit.capital_fit.level}</p>
                </div>
                <div>
                  <span className="text-gray-500">Channel</span>
                  <p className={CHANNEL_COLORS[fit.channel_fit.level]}>{fit.channel_fit.level}</p>
                </div>
                <div>
                  <span className="text-gray-500">Timeline</span>
                  <p className={TIMELINE_COLORS[fit.timeline_fit.level]}>{fit.timeline_fit.level}</p>
                </div>
              </div>

              <p className="text-xs text-gray-400">{fit.capital_fit.note}</p>

              {fit.advantages.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">Your advantages</p>
                  <ul className="space-y-0.5">
                    {fit.advantages.map((a, i) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-green-600">+</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fit.gaps.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Gaps to bridge</p>
                  <ul className="space-y-0.5">
                    {fit.gaps.map((g, i) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-red-600">−</span>{g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
