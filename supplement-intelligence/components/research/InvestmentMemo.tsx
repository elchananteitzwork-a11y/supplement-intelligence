'use client'

import type { MarketVerdict, FounderVerdict } from '@/lib/stage4/verdict'
import type { MemoSections } from '@/lib/stage4/memo-generator'
import type { FullUnitEconomics } from '@/lib/stage4/unit-economics'
import type { LaunchCostScenario } from '@/lib/stage4/launch-cost'
import { HardCard, VerdictBadge } from '@/components/ui'

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

const MARKET_VERDICT_ACCENT: Record<string, string> = {
  PURSUE:               'border-pi-build/40',
  PURSUE_WITH_CAUTION:  'border-pi-gold/40',
  INVESTIGATE_FURTHER:  'border-pi-hairline',
  DO_NOT_PURSUE:        'border-pi-risk/40',
}
const MARKET_VERDICT_TEXT: Record<string, string> = {
  PURSUE:               'text-pi-build',
  PURSUE_WITH_CAUTION:  'text-pi-gold',
  INVESTIGATE_FURTHER:  'text-pi-ink',
  DO_NOT_PURSUE:        'text-pi-risk',
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
    <span className="rounded-xl text-[10px] font-mono uppercase px-1.5 py-0.5 border border-pi-hairline text-pi-sub bg-pi-card whitespace-nowrap shrink-0">
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
      <h2 className="text-sm font-bold text-pi-ink tracking-tight border-b border-pi-hairline pb-2">
        7. Unit Economics — Numbers
      </h2>

      <p className="text-xs text-pi-faint">{econ.sensitivity.cogs_sensitivity_note}</p>

      {/* Breakeven COGS grid — 3 price scenarios */}
      <div className="space-y-1">
        <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
          Breakeven COGS at Target 50% GM — 3 Price Scenarios
        </p>
        <div className="border border-pi-hairline overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="rounded-xl border-b border-pi-hairline bg-pi-sand">
                <th className="px-3 py-2 text-left text-pi-faint font-mono uppercase">Scenario</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Price</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Net Revenue</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Max COGS</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">FBA Fee</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Referral</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Pessimistic (−20%)', row: pes },
                { label: 'Base case (median)', row: base },
                { label: 'Optimistic (+20%)',  row: opt },
              ].map(({ label, row }) => (
                <tr key={label} className="rounded-xl border-b border-pi-hairline/10 hover:bg-pi-sand">
                  <td className="px-3 py-2 text-pi-sub">{label}</td>
                  <td className="px-3 py-2 text-right font-mono text-pi-ink">{fmtUsd(row.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-pi-ink">{fmtUsd(row.net_revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-pi-ink font-bold">{fmtUsd(row.breakeven_cogs)}</td>
                  <td className="px-3 py-2 text-right font-mono text-pi-faint">{fmtUsd(row.fba_fee)}</td>
                  <td className="px-3 py-2 text-right font-mono text-pi-faint">{row.referral_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GM threshold sensitivity */}
      <div className="space-y-1">
        <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
          Max COGS at Different GM Targets — Base Price {fmtUsd(base.price)}
        </p>
        <div className="flex flex-wrap gap-2">
          {gmt.map(({ gm_pct, breakeven_cogs }) => {
            const isTarget = gm_pct === base.target_gm_pct
            return (
              <div
                key={gm_pct}
                className={`border px-3 py-2 text-center min-w-[72px] ${
                  isTarget
                    ? 'border border-pi-hairline bg-pi-sand'
                    : 'border-pi-hairline bg-pi-card'
                }`}
              >
                <p className={`text-[10px] font-mono ${isTarget ? 'text-pi-ink font-bold' : 'text-pi-faint'}`}>
                  {gm_pct}% GM
                </p>
                <p className={`text-sm font-mono font-bold ${breakeven_cogs <= 0 ? 'text-pi-risk' : 'text-pi-ink'}`}>
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
          Low:     'text-pi-build',
          Medium:  'text-pi-gold',
          High:    'text-pi-risk',
          Extreme: 'text-pi-cream bg-pi-risk px-1',
        }
        const scenarios: LaunchCostScenario[] = [lc.minimum, lc.conservative, lc.aggressive]
        return (
          <div className="space-y-2">
            <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
              True Launch Cost Estimate — Bottom-Up (Category Estimates)
            </p>
            <div className="border border-pi-hairline overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="rounded-xl border-b border-pi-hairline bg-pi-sand">
                    <th className="px-3 py-2 text-left text-pi-faint font-mono uppercase">Component</th>
                    <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Minimum</th>
                    <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Conservative</th>
                    <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Aggressive</th>
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
                    <tr key={key} className="border-b border-pi-hairline/10">
                      <td className="px-3 py-1.5 text-pi-sub">{label}</td>
                      {scenarios.map(s => (
                        <td key={s.label} className="px-3 py-1.5 text-right font-mono text-pi-sub">
                          {s[key] != null ? fmtK(s[key] as number) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-pi-sand">
                    <td className="px-3 py-2 text-pi-ink font-bold">Total</td>
                    {scenarios.map(s => (
                      <td key={s.label} className="px-3 py-2 text-right font-mono font-bold">
                        <span className={RISK_COLORS[s.capital_risk_level] ?? ''}>
                          {fmtK(s.total)}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-pi-faint text-[10px]">MOQ (units)</td>
                    {scenarios.map(s => (
                      <td key={s.label} className="px-3 py-1.5 text-right font-mono text-pi-faint text-[10px]">
                        {s.moq_units.toLocaleString()} × ${s.est_cogs_per_unit.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-pi-gold">
              Undercapitalized threshold: {fmtK(lc.undercapitalized_at)} minimum — get real supplier quotes before committing
            </p>
            <div className="px-1 space-y-0.5">
              {lc.limitations.map((l, i) => (
                <p key={i} className="text-[10px] text-pi-faint">· {l}</p>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Founder's actual numbers (if provided) */}
      {(econ.founder_target_gm_pct !== undefined || econ.founder_breakeven_units_mo !== undefined) && (
        <HardCard variant="pi" className="space-y-2">
          <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
            Your Numbers
          </p>
          <div className="flex flex-wrap gap-6 text-xs">
            {econ.founder_target_gm_pct !== undefined && (
              <div>
                <p className="text-pi-faint">Actual GM at your COGS</p>
                <p className={`text-lg font-mono font-bold ${econ.founder_target_gm_pct >= 40 ? 'text-pi-build' : econ.founder_target_gm_pct >= 30 ? 'text-pi-gold' : 'text-pi-risk'}`}>
                  {econ.founder_target_gm_pct.toFixed(1)}%
                </p>
              </div>
            )}
            {econ.founder_breakeven_units_mo !== undefined && (
              <div>
                <p className="text-pi-faint">Units/mo to cover ad spend</p>
                <p className="text-lg font-mono font-bold text-pi-ink">
                  {fmt(econ.founder_breakeven_units_mo)}
                </p>
              </div>
            )}
            {econ.founder_inputs?.actual_cogs_per_unit !== undefined && (
              <div>
                <p className="text-pi-faint">Your COGS/unit</p>
                <p className="text-lg font-mono font-bold text-pi-ink">
                  {fmtUsd(econ.founder_inputs.actual_cogs_per_unit)}
                </p>
              </div>
            )}
          </div>
        </HardCard>
      )}

      {/* Revenue envelope */}
      <div className="space-y-1">
        <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
          Revenue Envelope — New Entrant Scenarios
        </p>
        {rev.is_estimate && (
          <div className="rounded-xl border border-pi-gold/40 bg-pi-card px-3 py-2 text-xs text-pi-gold space-y-0.5">
            <p className="font-bold">Search-volume-based estimate · Low confidence</p>
            <p>Keepa sales data was unavailable. Projections below are derived from search volume × estimated conversion rate and should not be treated as real revenue figures.</p>
          </div>
        )}
        <div className="border border-pi-hairline overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="rounded-xl border-b border-pi-hairline bg-pi-sand">
                <th className="px-3 py-2 text-left text-pi-faint font-mono uppercase">Scenario</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Market Share</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Monthly Rev</th>
                <th className="px-3 py-2 text-right text-pi-faint font-mono uppercase">Year 1 (ramped)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-pi-hairline/10">
                <td className="px-3 py-2 text-pi-sub">Conservative</td>
                <td className="px-3 py-2 text-right font-mono text-pi-faint">{rev.market_share_pct.conservative}%</td>
                <td className="px-3 py-2 text-right font-mono text-pi-sub">{rev.is_estimate ? '~' : ''}{fmtK(rev.conservative_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-pi-sub">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_conservative)}</td>
              </tr>
              <tr className="rounded-xl border-b border-pi-hairline/10 bg-pi-sand">
                <td className="px-3 py-2 text-pi-ink font-medium">Base</td>
                <td className="px-3 py-2 text-right font-mono text-pi-sub">{rev.market_share_pct.base}%</td>
                <td className="px-3 py-2 text-right font-mono text-pi-ink font-bold">{rev.is_estimate ? '~' : ''}{fmtK(rev.base_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-pi-ink font-bold">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_base)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-pi-sub">Optimistic</td>
                <td className="px-3 py-2 text-right font-mono text-pi-faint">{rev.market_share_pct.optimistic}%</td>
                <td className="px-3 py-2 text-right font-mono text-pi-sub">{rev.is_estimate ? '~' : ''}{fmtK(rev.optimistic_monthly)}/mo</td>
                <td className="px-3 py-2 text-right font-mono text-pi-sub">{rev.is_estimate ? '~' : ''}{fmtK(rev.year1_optimistic)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-1 pt-1 space-y-0.5">
          {rev.assumptions.map((a, i) => (
            <p key={i} className="text-[10px] text-pi-faint">· {a}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

export function InvestmentMemo({ memo }: Props) {
  const mv = memo.market_verdict
  const fv = memo.founder_verdict
  const accent = MARKET_VERDICT_ACCENT[mv.code] ?? MARKET_VERDICT_ACCENT.INVESTIGATE_FURTHER
  const mvText = MARKET_VERDICT_TEXT[mv.code] ?? MARKET_VERDICT_TEXT.INVESTIGATE_FURTHER

  return (
    <article className="space-y-8">
      {/* Dual verdict panel */}
      <div className={`border-2 ${accent} bg-pi-card p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <VerdictBadge scheme="market-verdict" verdict={mv.code} />
              {fv && <VerdictBadge scheme="founder-fit" verdict={fv.code} />}
            </div>
            <p className={`text-base font-bold ${mvText}`}>{mv.headline}</p>
            {fv && <p className="text-sm text-pi-sub">{fv.headline}</p>}
          </div>
          <div className="text-xs text-pi-faint text-right font-mono">
            <p>Data confidence: {mv.data_confidence}</p>
            <p>{memo.ai_model_version}</p>
            <p>{new Date(memo.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Rationale */}
        {mv.rationale.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
              {mv.code === 'PURSUE' || mv.code === 'PURSUE_WITH_CAUTION'
                ? 'Market rationale'
                : 'What passed despite the blockers'}
            </p>
            <ul className="space-y-1">
              {mv.rationale.map((r, i) => (
                <li key={i} className="text-xs text-pi-sub flex gap-2">
                  <span className={`shrink-0 ${
                    mv.code === 'PURSUE' || mv.code === 'PURSUE_WITH_CAUTION'
                      ? 'text-pi-build'
                      : 'text-pi-faint'
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
            <p className="text-[10px] font-mono font-semibold text-pi-risk uppercase tracking-wider">Blockers</p>
            <ul className="space-y-1">
              {mv.blockers.map((b, i) => (
                <li key={i} className="text-xs text-pi-risk flex gap-2">
                  <span className="shrink-0">✗</span>{b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conditions */}
        {mv.conditions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-mono font-semibold text-pi-gold uppercase tracking-wider">Conditions</p>
            <ul className="space-y-1">
              {mv.conditions.map((c, i) => (
                <li key={i} className="text-xs text-pi-gold flex gap-2">
                  <span className="shrink-0">△</span>{c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Founder verdict detail */}
        {fv && (
          <div className="border-t border-pi-hairline/20 pt-4 space-y-2">
            {fv.requirements.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-mono font-semibold text-pi-gold uppercase tracking-wider">Before you proceed</p>
                <ul className="space-y-1">
                  {fv.requirements.map((r, i) => (
                    <li key={i} className="text-xs text-pi-gold flex gap-2">
                      <span className="shrink-0">→</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fv.divergence && (
              <p className="text-xs text-pi-sub border-l-2 border-pi-gold-deep pl-3 italic">{fv.divergence}</p>
            )}
          </div>
        )}
      </div>

      {/* Freshness notice */}
      <HardCard>
        <p className="text-xs text-pi-faint">{memo.freshness_notice}</p>
      </HardCard>

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
                  <div className="flex items-center justify-between gap-3 border-b border-pi-hairline pb-2">
                    <h2 className="text-sm font-bold text-pi-ink tracking-tight">
                      {SECTION_TITLES[key]}
                    </h2>
                    <AiSynthesisBadge />
                  </div>
                  <div className="text-sm text-pi-sub leading-relaxed space-y-3">
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
            <div className="flex items-center justify-between gap-3 border-b border-pi-hairline pb-2">
              <h2 className="text-sm font-bold text-pi-ink tracking-tight">
                {SECTION_TITLES[key]}
              </h2>
              <AiSynthesisBadge />
            </div>
            <div className="text-sm text-pi-sub leading-relaxed space-y-3">
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
