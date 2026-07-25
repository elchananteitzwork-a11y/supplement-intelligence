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
  sufficient:   'text-pi-build',
  tight:        'text-pi-gold',
  insufficient: 'text-pi-risk',
}

const CHANNEL_COLORS: Record<string, string> = {
  strong:  'text-pi-build',
  partial: 'text-pi-gold',
  weak:    'text-pi-risk',
}

const TIMELINE_COLORS: Record<string, string> = {
  feasible:   'text-pi-build',
  stretched:  'text-pi-gold',
  infeasible: 'text-pi-risk',
}

const COMPLEXITY_COLORS: Record<string, string> = {
  low:    'text-pi-build',
  medium: 'text-pi-gold',
  high:   'text-pi-risk',
}

const PAIN_INTENSITY_COLORS: Record<string, string> = {
  severe:   'text-pi-risk',
  moderate: 'text-pi-gold',
  mild:     'text-pi-faint',
}

function AiSynthesisBadge() {
  return (
    <span className="rounded-xl text-[10px] font-mono px-1.5 py-0.5 border border-pi-hairline text-pi-ink bg-pi-card whitespace-nowrap shrink-0 uppercase">
      AI synthesis
    </span>
  )
}

export function ThesisCard({ thesis, fit, rank, expanded, onToggle }: Props) {
  return (
    <div className="rounded-xl border border-pi-hairline bg-pi-card overflow-hidden font-sans">
      {/* Header — always visible */}
      <button
        className="w-full text-left px-5 py-4 hover:bg-pi-sand transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-pi-faint">#{rank}</span>
              {fit && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 border border-pi-hairline">
                  Fit <WitnessDots filled={fit.fit_rank} total={5} size="sm" />
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 border border-pi-hairline font-mono uppercase ${
                COMPLEXITY_COLORS[thesis.quick_economics_check.launch_complexity]
              }`}>
                {thesis.quick_economics_check.launch_complexity} complexity
              </span>
              {thesis.quick_economics_check.margin_viable ? (
                <span className="text-xs px-2 py-0.5 border border-pi-build/40 text-pi-build font-mono uppercase">margin viable</span>
              ) : (
                <span className="text-xs px-2 py-0.5 border border-pi-risk/40 text-pi-risk font-mono uppercase">margin risk</span>
              )}
            </div>
            <h3 className="text-base font-bold text-pi-ink leading-snug">
              {thesis.product_angle}
            </h3>
            <p className="text-xs text-pi-sub">{thesis.target_customer}</p>
          </div>
          <span className="text-pi-ink text-lg mt-0.5 font-bold">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {/* Body — expanded only */}
      {expanded && (
        <div className="border-t border-pi-hairline px-5 py-4 space-y-5">
          {/* Differentiation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Differentiation</p>
              <AiSynthesisBadge />
            </div>
            <p className="text-sm text-pi-ink">{thesis.differentiation}</p>
            <p className="text-xs text-pi-faint italic">
              Evidence: {thesis.differentiation_source}
            </p>
          </div>

          {/* Customer pain */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Customer Pain</p>
              <AiSynthesisBadge />
            </div>
            <p className="text-sm text-pi-ink">{thesis.customer_pain.problem}</p>
            <div className="flex gap-3 text-xs mt-1">
              <span className={PAIN_INTENSITY_COLORS[thesis.customer_pain.pain_intensity]}>
                {thesis.customer_pain.pain_intensity} intensity
              </span>
              <span className="text-pi-faint">·</span>
              <span className="text-pi-sub">{thesis.customer_pain.frequency}</span>
              <span className="text-pi-faint">·</span>
              <span className="text-pi-faint italic">{thesis.customer_pain.evidence_source}</span>
            </div>
          </div>

          {/* Economics */}
          <div className="rounded-xl border border-pi-hairline bg-pi-sand p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Quick Economics</p>
              <AiSynthesisBadge />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-pi-faint">Price target</span>
                <p className="text-pi-ink font-mono">{thesis.quick_economics_check.price_point_estimate}</p>
              </div>
              <div>
                <span className="text-pi-faint">Min capital</span>
                <p className="text-pi-ink font-mono">{(() => { const c = thesis.quick_economics_check.min_capital_required; return c >= 1000 ? `$${(c / 1000).toFixed(0)}k` : `$${Math.round(c)}` })()}</p>
              </div>
            </div>
            <p className="text-xs text-pi-sub">{thesis.quick_economics_check.margin_note}</p>
            {thesis.quick_economics_check.complexity_drivers.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {thesis.quick_economics_check.complexity_drivers.map(d => (
                  <span key={d} className="rounded-xl text-[10px] bg-pi-card border border-pi-hairline text-pi-sub px-1.5 py-0.5 font-mono">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Supporting evidence */}
          {thesis.supporting_evidence?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">Evidence Citations</p>
              <ul className="space-y-1">
                {thesis.supporting_evidence.map((ev, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 text-[10px] px-1 py-0 border font-mono shrink-0 ${
                      ev.source_type === 'primary_measurement'
                        ? 'border-pi-build/40 text-pi-build bg-pi-card'
                        : ev.source_type === 'provider_model'
                        ? 'border-pi-hairline text-pi-ink bg-pi-card'
                        : 'border-pi-hairline text-pi-faint bg-pi-card'
                    }`}>
                      {ev.source_type === 'primary_measurement' ? 'M' : ev.source_type === 'provider_model' ? 'P' : 'C'}
                    </span>
                    <span className="text-pi-sub">{ev.value}</span>
                    <span className="text-pi-faint shrink-0">· {ev.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Founder fit detail */}
          {fit && (
            <div className="rounded-xl border border-pi-hairline bg-pi-sand p-3 space-y-3">
              <p className="text-xs font-mono font-semibold text-pi-faint uppercase tracking-wider">
                Your Fit · Score {fit.fit_rank}/5
              </p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-pi-faint">Capital</span>
                  <p className={CAPITAL_COLORS[fit.capital_fit.level]}>{fit.capital_fit.level}</p>
                </div>
                <div>
                  <span className="text-pi-faint">Channel</span>
                  <p className={CHANNEL_COLORS[fit.channel_fit.level]}>{fit.channel_fit.level}</p>
                </div>
                <div>
                  <span className="text-pi-faint">Timeline</span>
                  <p className={TIMELINE_COLORS[fit.timeline_fit.level]}>{fit.timeline_fit.level}</p>
                </div>
              </div>

              <p className="text-xs text-pi-sub">{fit.capital_fit.note}</p>

              {fit.advantages.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono font-semibold text-pi-build uppercase tracking-wider mb-1">Your advantages</p>
                  <ul className="space-y-0.5">
                    {fit.advantages.map((a, i) => (
                      <li key={i} className="text-xs text-pi-sub flex gap-1.5">
                        <span className="text-pi-build">+</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fit.gaps.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono font-semibold text-pi-risk uppercase tracking-wider mb-1">Gaps to bridge</p>
                  <ul className="space-y-0.5">
                    {fit.gaps.map((g, i) => (
                      <li key={i} className="text-xs text-pi-sub flex gap-1.5">
                        <span className="text-pi-risk">−</span>{g}
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
