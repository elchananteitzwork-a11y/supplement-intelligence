'use client'

import type { InvestmentThesis } from '@/lib/stage2/types'
import type { FounderFitAnnotation } from '@/lib/stage2/types'
import { WitnessDots } from '@/components/ui'

interface Props {
  thesis: InvestmentThesis & { id: string }
  fit?: FounderFitAnnotation
  rank: number
  expanded?: boolean
  onToggle?: () => void
}

const CAPITAL_COLORS: Record<string, string> = {
  sufficient:   'text-verdict-positive',
  tight:        'text-verdict-caution-text',
  insufficient: 'text-verdict-negative',
}

const CHANNEL_COLORS: Record<string, string> = {
  strong:  'text-verdict-positive',
  partial: 'text-verdict-caution-text',
  weak:    'text-verdict-negative',
}

const TIMELINE_COLORS: Record<string, string> = {
  feasible:   'text-verdict-positive',
  stretched:  'text-verdict-caution-text',
  infeasible: 'text-verdict-negative',
}

const COMPLEXITY_COLORS: Record<string, string> = {
  low:    'text-verdict-positive',
  medium: 'text-verdict-caution-text',
  high:   'text-verdict-negative',
}

const PAIN_INTENSITY_COLORS: Record<string, string> = {
  severe:   'text-verdict-negative',
  moderate: 'text-verdict-caution-text',
  mild:     'text-outline',
}

function AiSynthesisBadge() {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 border border-black text-black bg-white whitespace-nowrap shrink-0 uppercase">
      AI synthesis
    </span>
  )
}

export function ThesisCard({ thesis, fit, rank, expanded, onToggle }: Props) {
  return (
    <div className="border border-black bg-white overflow-hidden font-sans">
      {/* Header — always visible */}
      <button
        className="w-full text-left px-5 py-4 hover:bg-surface-container-low transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-outline">#{rank}</span>
              {fit && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 border border-black">
                  Fit <WitnessDots filled={fit.fit_rank} total={5} size="sm" />
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 border border-black font-mono uppercase ${
                COMPLEXITY_COLORS[thesis.quick_economics_check.launch_complexity]
              }`}>
                {thesis.quick_economics_check.launch_complexity} complexity
              </span>
              {thesis.quick_economics_check.margin_viable ? (
                <span className="text-xs px-2 py-0.5 border border-verdict-positive text-verdict-positive font-mono uppercase">margin viable</span>
              ) : (
                <span className="text-xs px-2 py-0.5 border border-verdict-negative text-verdict-negative font-mono uppercase">margin risk</span>
              )}
            </div>
            <h3 className="text-base font-bold text-black leading-snug">
              {thesis.product_angle}
            </h3>
            <p className="text-xs text-ink-variant">{thesis.target_customer}</p>
          </div>
          <span className="text-black text-lg mt-0.5 font-bold">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {/* Body — expanded only */}
      {expanded && (
        <div className="border-t border-black px-5 py-4 space-y-5">
          {/* Differentiation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Differentiation</p>
              <AiSynthesisBadge />
            </div>
            <p className="text-sm text-black">{thesis.differentiation}</p>
            <p className="text-xs text-outline italic">
              Evidence: {thesis.differentiation_source}
            </p>
          </div>

          {/* Customer pain */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Customer Pain</p>
              <AiSynthesisBadge />
            </div>
            <p className="text-sm text-black">{thesis.customer_pain.problem}</p>
            <div className="flex gap-3 text-xs mt-1">
              <span className={PAIN_INTENSITY_COLORS[thesis.customer_pain.pain_intensity]}>
                {thesis.customer_pain.pain_intensity} intensity
              </span>
              <span className="text-outline">·</span>
              <span className="text-ink-variant">{thesis.customer_pain.frequency}</span>
              <span className="text-outline">·</span>
              <span className="text-outline italic">{thesis.customer_pain.evidence_source}</span>
            </div>
          </div>

          {/* Economics */}
          <div className="border border-black bg-surface-container-low p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Quick Economics</p>
              <AiSynthesisBadge />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-outline">Price target</span>
                <p className="text-black font-mono">{thesis.quick_economics_check.price_point_estimate}</p>
              </div>
              <div>
                <span className="text-outline">Min capital</span>
                <p className="text-black font-mono">{(() => { const c = thesis.quick_economics_check.min_capital_required; return c >= 1000 ? `$${(c / 1000).toFixed(0)}k` : `$${Math.round(c)}` })()}</p>
              </div>
            </div>
            <p className="text-xs text-ink-variant">{thesis.quick_economics_check.margin_note}</p>
            {thesis.quick_economics_check.complexity_drivers.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {thesis.quick_economics_check.complexity_drivers.map(d => (
                  <span key={d} className="text-[10px] bg-white border border-black text-ink-variant px-1.5 py-0.5 font-mono">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Supporting evidence */}
          {thesis.supporting_evidence?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">Evidence Citations</p>
              <ul className="space-y-1">
                {thesis.supporting_evidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 text-[10px] px-1 py-0 border font-mono shrink-0 ${
                      ev.source_type === 'primary_measurement'
                        ? 'border-verdict-positive text-verdict-positive bg-white'
                        : ev.source_type === 'provider_model'
                        ? 'border-black text-black bg-white'
                        : 'border-outline text-outline bg-white'
                    }`}>
                      {ev.source_type === 'primary_measurement' ? 'M' : ev.source_type === 'provider_model' ? 'P' : 'C'}
                    </span>
                    <span className="text-ink-variant">{ev.value}</span>
                    <span className="text-outline shrink-0">· {ev.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Founder fit detail */}
          {fit && (
            <div className="border border-black bg-surface-container-low p-3 space-y-3">
              <p className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
                Your Fit · Score {fit.fit_rank}/5
              </p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-outline">Capital</span>
                  <p className={CAPITAL_COLORS[fit.capital_fit.level]}>{fit.capital_fit.level}</p>
                </div>
                <div>
                  <span className="text-outline">Channel</span>
                  <p className={CHANNEL_COLORS[fit.channel_fit.level]}>{fit.channel_fit.level}</p>
                </div>
                <div>
                  <span className="text-outline">Timeline</span>
                  <p className={TIMELINE_COLORS[fit.timeline_fit.level]}>{fit.timeline_fit.level}</p>
                </div>
              </div>

              <p className="text-xs text-ink-variant">{fit.capital_fit.note}</p>

              {fit.advantages.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono font-semibold text-verdict-positive uppercase tracking-wider mb-1">Your advantages</p>
                  <ul className="space-y-0.5">
                    {fit.advantages.map((a, i) => (
                      <li key={i} className="text-xs text-ink-variant flex gap-1.5">
                        <span className="text-verdict-positive">+</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fit.gaps.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono font-semibold text-verdict-negative uppercase tracking-wider mb-1">Gaps to bridge</p>
                  <ul className="space-y-0.5">
                    {fit.gaps.map((g, i) => (
                      <li key={i} className="text-xs text-ink-variant flex gap-1.5">
                        <span className="text-verdict-negative">−</span>{g}
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
