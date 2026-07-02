'use client'

import type { MarketVerdict, FounderVerdict } from '@/lib/stage4/verdict'
import type { MemoSections } from '@/lib/stage4/memo-generator'

interface MemoRow {
  id: string
  sections: MemoSections
  market_verdict: MarketVerdict
  founder_verdict: FounderVerdict | null
  verdict_divergence: string | null
  freshness_notice: string
  ai_model_version: string
  created_at: string
}

interface Props { memo: MemoRow }

const MARKET_VERDICT_COLORS: Record<string, { border: string; label: string; text: string }> = {
  PURSUE:               { border: 'border-green-700',  label: 'bg-green-950 border-green-700 text-green-300',  text: 'text-green-400' },
  PURSUE_WITH_CAUTION:  { border: 'border-yellow-700', label: 'bg-yellow-950 border-yellow-700 text-yellow-300', text: 'text-yellow-400' },
  INVESTIGATE_FURTHER:  { border: 'border-blue-700',   label: 'bg-blue-950 border-blue-700 text-blue-300',   text: 'text-blue-400' },
  DO_NOT_PURSUE:        { border: 'border-red-700',    label: 'bg-red-950 border-red-700 text-red-300',    text: 'text-red-400' },
}

const FOUNDER_VERDICT_COLORS: Record<string, string> = {
  STRONG_FIT:       'text-green-400 bg-green-950 border-green-700',
  CONDITIONAL_FIT:  'text-yellow-400 bg-yellow-950 border-yellow-700',
  MISALIGNED:       'text-orange-400 bg-orange-950 border-orange-700',
  NOT_READY:        'text-red-400 bg-red-950 border-red-700',
}

const SECTION_TITLES: Record<keyof MemoSections, string> = {
  executive_summary:        '1. Executive Summary',
  market_opportunity:       '2. Market Opportunity',
  competitive_landscape:    '3. Competitive Landscape',
  product_strategy:         '4. Product Strategy',
  customer_thesis:          '5. Customer Thesis',
  risk_analysis:            '6. Risk Analysis',
  unit_economics_narrative: '7. Unit Economics',
  go_to_market:             '8. Go-to-Market',
  key_milestones:           '9. Key Milestones',
  final_considerations:     '10. Final Considerations',
}

const SECTION_ORDER: (keyof MemoSections)[] = [
  'executive_summary', 'market_opportunity', 'competitive_landscape',
  'product_strategy', 'customer_thesis', 'risk_analysis',
  'unit_economics_narrative', 'go_to_market', 'key_milestones', 'final_considerations',
]

function VerdictBadge({ code, type }: { code: string; type: 'market' | 'founder' }) {
  const colorMap = type === 'market' ? MARKET_VERDICT_COLORS : {}
  const colors   = type === 'market' ? colorMap[code] : null
  const className = type === 'market'
    ? `text-xs font-mono px-3 py-1 rounded border ${colors?.label ?? ''}`
    : `text-xs font-mono px-3 py-1 rounded border ${FOUNDER_VERDICT_COLORS[code] ?? ''}`
  return <span className={className}>{code.replace(/_/g, ' ')}</span>
}

export function InvestmentMemo({ memo }: Props) {
  const mv = memo.market_verdict
  const fv = memo.founder_verdict
  const mvColors = MARKET_VERDICT_COLORS[mv.code] ?? MARKET_VERDICT_COLORS.INVESTIGATE_FURTHER

  return (
    <article className="space-y-8">
      {/* Dual verdict panel */}
      <div className={`rounded-xl border-2 ${mvColors.border} bg-gray-900 p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <VerdictBadge code={mv.code} type="market" />
              {fv && <VerdictBadge code={fv.code} type="founder" />}
            </div>
            <p className={`text-base font-semibold ${mvColors.text}`}>{mv.headline}</p>
            {fv && <p className="text-sm text-gray-300">{fv.headline}</p>}
          </div>
          <div className="text-xs text-gray-500 text-right">
            <p>Data confidence: {mv.data_confidence}</p>
            <p className="font-mono">{memo.ai_model_version}</p>
            <p>{new Date(memo.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Rationale */}
        {mv.rationale.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              {mv.code === 'PURSUE' || mv.code === 'PURSUE_WITH_CAUTION'
                ? 'Market rationale'
                : 'What passed despite the blockers'}
            </p>
            <ul className="space-y-1">
              {mv.rationale.map((r, i) => (
                <li key={i} className="text-xs text-gray-300 flex gap-2">
                  <span className={`shrink-0 ${
                    mv.code === 'PURSUE' || mv.code === 'PURSUE_WITH_CAUTION'
                      ? 'text-green-600'
                      : 'text-gray-600'
                  }`}>
                    {mv.code === 'PURSUE' || mv.code === 'PURSUE_WITH_CAUTION' ? '✓' : '·'}
                  </span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Blockers */}
        {mv.blockers.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Blockers</p>
            <ul className="space-y-1">
              {mv.blockers.map((b, i) => (
                <li key={i} className="text-xs text-red-300 flex gap-2">
                  <span className="shrink-0">✗</span>{b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conditions */}
        {mv.conditions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider">Conditions</p>
            <ul className="space-y-1">
              {mv.conditions.map((c, i) => (
                <li key={i} className="text-xs text-yellow-300 flex gap-2">
                  <span className="shrink-0">△</span>{c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Founder verdict detail */}
        {fv && (
          <div className="border-t border-gray-800 pt-4 space-y-2">
            {fv.requirements.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">Before you proceed</p>
                <ul className="space-y-1">
                  {fv.requirements.map((r, i) => (
                    <li key={i} className="text-xs text-orange-300 flex gap-2">
                      <span className="shrink-0">→</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fv.divergence && (
              <p className="text-xs text-gray-400 border-l-2 border-yellow-700 pl-3 italic">{fv.divergence}</p>
            )}
          </div>
        )}
      </div>

      {/* Freshness notice */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
        <p className="text-xs text-gray-500">{memo.freshness_notice}</p>
      </div>

      {/* 10 sections */}
      {SECTION_ORDER.map(key => {
        const text = memo.sections[key]
        if (!text) return null
        return (
          <section key={key} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-300 tracking-tight border-b border-gray-800 pb-2">
              {SECTION_TITLES[key]}
            </h2>
            <div className="text-sm text-gray-300 leading-relaxed space-y-3">
              {text.split('\n\n').filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        )
      })}
    </article>
  )
}
