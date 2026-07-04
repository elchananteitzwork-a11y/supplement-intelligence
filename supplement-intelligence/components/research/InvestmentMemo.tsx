'use client'

import type { MarketVerdict, FounderVerdict } from '@/lib/stage4/verdict'
import type { MemoSections } from '@/lib/stage4/memo-generator'
import type { FullUnitEconomics } from '@/lib/stage4/unit-economics'
import type { LaunchCostScenario } from '@/lib/stage4/launch-cost'

interface MemoRow {
  id: string
  sections: MemoSections
  market_verdict: MarketVerdict
  founder_verdict: FounderVerdict | null
  verdict_divergence: string | null
  freshness_notice: string
  ai_model_version: string
  created_at: string
  unit_economics?: FullUnitEconomics | null
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
  unit_economics_narrative: '7. Unit Economics — Analysis',
  go_to_market:             '8. Go-to-Market',
  key_milestones:           '9. Key Milestones',
  final_considerations:     '10. Final Considerations',
}

const SECTION_ORDER: (keyof MemoSections)[] = [
  'executive_summary', 'market_opportunity', 'competitive_landscape',
  'product_strategy', 'customer_thesis', 'risk_analysis',
  'unit_economics_narrative', 'go_to_market', 'key_milestones', 'final_considerations',
]

function fmt(n: number) { return n.toLocaleString() }
function fmtK(n: number | undefined | null) {
  if (n == null || isNaN(n)) return '—'
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`
}
function fmtUsd(n: number) { return `$${n.toFixed(2)}` }

function AiSynthesisBadge() {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-purple-900 text-purple-400 bg-purple-950/20 whitespace-nowrap shrink-0">
      AI synthesis · not independently verified
    </span>
  )
}

function UnitEconomicsPanel({ econ }: { econ: FullUnitEconomics }) {
  const base = econ.sensitivity.base_case
  const opt  = econ.sensitivity.optimistic
  const pes  = econ.sensitivity.pessimistic
  const rev  = econ.revenue_envelope
  const gmt  = econ.sensitivity.gm_thresholds

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300 tracking-tight border-b border-gray-800 pb-2">
        7. Unit Economics — Numbers
      </h2>

      <p className="text-xs text-gray-500">{econ.sensitivity.cogs_sensitivity_note}</p>

      {/* Breakeven COGS grid — 3 price scenarios */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Breakeven COGS at Target 50% GM — 3 Price Scenarios
        </p>
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Scenario</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Price</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Net Revenue</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Max COGS</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">FBA Fee</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Referral</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Pessimistic (−20%)', row: pes },
                { label: 'Base case (median)', row: base },
                { label: 'Optimistic (+20%)',  row: opt },
              ].map(({ label, row }) => (
                <tr key={label} className="border-b border-gray-900 hover:bg-gray-900/30">
                  <td className="px-3 py-2 text-gray-300">{label}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-200">{fmtUsd(row.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-200">{fmtUsd(row.net_revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-100 font-semibold">{fmtUsd(row.breakeven_cogs)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{fmtUsd(row.fba_fee)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{row.referral_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GM threshold sensitivity */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Max COGS at Different GM Targets — Base Price {fmtUsd(base.price)}
        </p>
        <div className="flex flex-wrap gap-2">
          {gmt.map(({ gm_pct, breakeven_cogs }) => {
            const isTarget = gm_pct === base.target_gm_pct
            return (
              <div
                key={gm_pct}
                className={`rounded border px-3 py-2 text-center min-w-[72px] ${
                  isTarget
                    ? 'border-indigo-700 bg-indigo-950/30'
                    : 'border-gray-800 bg-gray-900/40'
                }`}
              >
                <p className={`text-[10px] font-mono ${isTarget ? 'text-indigo-300' : 'text-gray-500'}`}>
                  {gm_pct}% GM
                </p>
                <p className={`text-sm font-mono font-semibold ${breakeven_cogs <= 0 ? 'text-red-400' : 'text-gray-100'}`}>
                  {breakeven_cogs <= 0 ? 'N/A' : fmtUsd(breakeven_cogs)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Launch cost model */}
      {econ.launch_cost && (() => {
        const lc = econ.launch_cost
        const RISK_COLORS: Record<string, string> = {
          Low:     'text-green-400 border-green-800 bg-green-950/20',
          Medium:  'text-yellow-400 border-yellow-800 bg-yellow-950/20',
          High:    'text-orange-400 border-orange-800 bg-orange-950/20',
          Extreme: 'text-red-400 border-red-800 bg-red-950/20',
        }
        const scenarios: LaunchCostScenario[] = [lc.minimum, lc.conservative, lc.aggressive]
        return (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              True Launch Cost Estimate — Bottom-Up (Category Estimates)
            </p>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="px-3 py-2 text-left text-gray-400 font-medium">Component</th>
                    <th className="px-3 py-2 text-right text-gray-400 font-medium">Minimum</th>
                    <th className="px-3 py-2 text-right text-gray-400 font-medium">Conservative</th>
                    <th className="px-3 py-2 text-right text-gray-400 font-medium">Aggressive</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Inventory (MOQ)', 'first_inventory_order'],
                    ['FBA prep + shipping', 'amazon_fba_prep_shipping'],
                    ['Testing & compliance', 'product_testing_compliance'],
                    ['Photography & creative', 'photography_creative'],
                    ['A+ content', 'a_plus_content'],
                    ['Amazon Vine', 'amazon_vine'],
                    ['Initial PPC budget', 'initial_ppc_budget'],
                    ['Contingency', 'contingency'],
                  ] as [string, keyof LaunchCostScenario][]).map(([label, key]) => (
                    <tr key={key} className="border-b border-gray-900">
                      <td className="px-3 py-1.5 text-gray-400">{label}</td>
                      {scenarios.map(s => (
                        <td key={s.label} className="px-3 py-1.5 text-right font-mono text-gray-300">
                          {s[key] != null ? fmtK(s[key] as number) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-gray-900/30">
                    <td className="px-3 py-2 text-gray-200 font-semibold">Total</td>
                    {scenarios.map(s => (
                      <td key={s.label} className="px-3 py-2 text-right font-mono font-semibold">
                        <span className={RISK_COLORS[s.capital_risk_level] ?? ''}>
                          {fmtK(s.total)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-gray-500 text-[10px]">MOQ (units)</td>
                    {scenarios.map(s => (
                      <td key={s.label} className="px-3 py-1.5 text-right font-mono text-gray-600 text-[10px]">
                        {s.moq_units.toLocaleString()} × ${s.est_cogs_per_unit.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-yellow-600">
              Undercapitalized threshold: {fmtK(lc.undercapitalized_at)} minimum — get real supplier quotes before committing
            </p>
            <div className="px-1 space-y-0.5">
              {lc.limitations.map((l, i) => (
                <p key={i} className="text-[10px] text-gray-600">· {l}</p>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Founder's actual numbers (if provided) */}
      {(econ.founder_target_gm_pct !== undefined || econ.founder_breakeven_units_mo !== undefined) && (
        <div className="rounded-lg border border-indigo-800 bg-indigo-950/20 p-4 space-y-2">
          <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
            Your Numbers
          </p>
          <div className="flex flex-wrap gap-6 text-xs">
            {econ.founder_target_gm_pct !== undefined && (
              <div>
                <p className="text-gray-500">Actual GM at your COGS</p>
                <p className={`text-lg font-mono font-semibold ${econ.founder_target_gm_pct >= 40 ? 'text-green-400' : econ.founder_target_gm_pct >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {econ.founder_target_gm_pct.toFixed(1)}%
                </p>
              </div>
            )}
            {econ.founder_breakeven_units_mo !== undefined && (
              <div>
                <p className="text-gray-500">Units/mo to cover ad spend</p>
                <p className="text-lg font-mono font-semibold text-gray-100">
                  {fmt(econ.founder_breakeven_units_mo)}
                </p>
              </div>
            )}
            {econ.founder_inputs?.actual_cogs_per_unit !== undefined && (
              <div>
                <p className="text-gray-500">Your COGS/unit</p>
                <p className="text-lg font-mono font-semibold text-gray-100">
                  {fmtUsd(econ.founder_inputs.actual_cogs_per_unit)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revenue envelope */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Revenue Envelope — New Entrant Scenarios
        </p>
        {rev.is_estimate && (
          <div className="rounded border border-yellow-800 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-300 space-y-0.5">
            <p className="font-medium">Search-volume-based estimate · Low confidence</p>
            <p className="text-yellow-500">Keepa sales data was unavailable. Projections below are derived from search volume × estimated conversion rate and should not be treated as real revenue figures.</p>
          </div>
        )}
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Scenario</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Market Share</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Monthly Rev</th>
                <th className="px-3 py-2 text-right text-gray-400 font-medium">Year 1 (ramped)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-900">
                <td className="px-3 py-2 text-gray-400">Conservative</td>
                <td className="px-3 py-2 text-right font-mono text-gray-500">{rev.market_share_pct.conservative}%</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{rev.is_estimate ? '~' : ''}{fmtK(rev.conservative_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_conservative)}</td>
              </tr>
              <tr className="border-b border-gray-900 bg-gray-900/20">
                <td className="px-3 py-2 text-gray-200 font-medium">Base</td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">{rev.market_share_pct.base}%</td>
                <td className="px-3 py-2 text-right font-mono text-gray-100 font-semibold">{rev.is_estimate ? '~' : ''}{fmtK(rev.base_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-gray-100 font-semibold">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_base)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-400">Optimistic</td>
                <td className="px-3 py-2 text-right font-mono text-gray-500">{rev.market_share_pct.optimistic}%</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{rev.is_estimate ? '~' : ''}{fmtK(rev.optimistic_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_optimistic)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-1 pt-1 space-y-0.5">
          {rev.assumptions.map((a, i) => (
            <p key={i} className="text-[10px] text-gray-600">· {a}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

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

      {/* 10 prose sections — unit_economics section (7) is split: numbers first, then narrative */}
      {SECTION_ORDER.map(key => {
        if (key === 'unit_economics_narrative') {
          return (
            <div key={key} className="space-y-6">
              {/* Deterministic numbers panel */}
              {memo.unit_economics && <UnitEconomicsPanel econ={memo.unit_economics} />}
              {/* AI-written narrative */}
              {memo.sections[key] && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-800 pb-2">
                    <h2 className="text-sm font-semibold text-gray-300 tracking-tight">
                      {SECTION_TITLES[key]}
                    </h2>
                    <AiSynthesisBadge />
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed space-y-3">
                    {memo.sections[key].split('\n\n').filter(Boolean).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )
        }

        const text = memo.sections[key]
        if (!text) return null
        return (
          <section key={key} className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-gray-800 pb-2">
              <h2 className="text-sm font-semibold text-gray-300 tracking-tight">
                {SECTION_TITLES[key]}
              </h2>
              <AiSynthesisBadge />
            </div>
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
