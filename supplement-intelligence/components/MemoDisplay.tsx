'use client'

import { useState } from 'react'
import type { MemoData } from '@/types/index'

// ── primitives ────────────────────────────────────────────────

function DecisionChip({ d }: { d: string }) {
  if (d === 'BUILD_NOW')        return <span className="chip-build">🟢 BUILD NOW</span>
  if (d === 'VALIDATE_FURTHER') return <span className="chip-validate">🟡 VALIDATE FURTHER</span>
  return                               <span className="chip-skip">🔴 SKIP</span>
}

function ScoreRing({ s }: { s: number }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (circ * s) / 100
  const c = s >= 65 ? '#34d399' : s >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="#27272a" strokeWidth="7"/>
        <circle cx="52" cy="52" r={r} fill="none" stroke={c} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-3xl leading-none" style={{ color: c }}>{s}</span>
        <span className="text-zinc-500 text-xs mt-1">/ 100</span>
      </div>
    </div>
  )
}

function DimScore({ label, score, notes }: { label: string; score: number; notes?: string }) {
  const pct = (score / 10) * 100
  const [color, bg] =
    score >= 8 ? ['text-emerald-400', 'bg-emerald-400'] :
    score >= 6 ? ['text-amber-400',   'bg-amber-400']   :
                 ['text-red-400',     'bg-red-400']
  return (
    <div className={`rounded-xl border p-4 ${
      score >= 8 ? 'bg-emerald-400/5 border-emerald-400/20' :
      score >= 6 ? 'bg-amber-400/5  border-amber-400/20'   :
                   'bg-red-400/5    border-red-400/20'
    }`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <span className={`font-mono font-bold text-lg ${color}`}>{score}<span className="text-zinc-600 text-xs font-normal">/10</span></span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%`, transition: 'width 0.8s ease' }}/>
      </div>
      {notes && <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{notes}</p>}
    </div>
  )
}

function Section({ title, badge, defaultOpen = false, children }: {
  title: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{title}</span>
          {badge}
        </div>
        <svg className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div className="px-6 pb-6 pt-5 border-t border-zinc-800 animate-in">{children}</div>}
    </div>
  )
}

function Num({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="font-mono text-zinc-600 shrink-0 w-5 text-right pt-px">{i + 1}.</span>
          <span className="text-zinc-300 leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function ProbBar({ label, value }: { label: string; value: string }) {
  const pct = parseInt(value, 10) || 0
  const c = pct >= 60 ? 'bg-emerald-400' : pct >= 30 ? 'bg-amber-400' : 'bg-zinc-600'
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c} transition-all duration-700`} style={{ width: `${pct}%` }}/>
      </div>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────

export default function MemoDisplay({ memo: m }: { memo: MemoData }) {
  return (
    <div className="space-y-4 animate-in">

      {/* ── HERO ── */}
      <div className="card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="shrink-0 text-center">
            <ScoreRing s={m.opportunity_score} />
            <p className="text-xs text-zinc-500 mt-2">Opportunity Score</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="label mb-1">Category</p>
            <h1 className="text-2xl font-bold mb-4 leading-tight">{m.category_name}</h1>
            <DecisionChip d={m.build_decision} />
          </div>
          <div className="hidden sm:grid gap-3 text-right">
            {([['Market', m.market_size], ['LTV', m.sub_ltv], ['Margin', m.gross_margin]] as [string, string][]).map(([l, v]) => (
              <div key={l}>
                <p className="text-xs text-zinc-500">{l}</p>
                <p className="text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </div>
        {/* mobile meta */}
        <div className="sm:hidden grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-zinc-800">
          {([['Market', m.market_size], ['LTV', m.sub_ltv], ['Margin', m.gross_margin]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="text-center">
              <p className="text-xs text-zinc-500">{l}</p>
              <p className="text-xs font-semibold mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SCORES ── */}
      <Section title="Dimension Scores" defaultOpen>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.entries(m.scores) as [string, { score: number; notes: string }][]).map(([k, v]) => (
            <DimScore key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} score={v.score} notes={v.notes} />
          ))}
        </div>
      </Section>

      {/* ── SUMMARY ── */}
      <Section title="Executive Summary" defaultOpen>
        <p className="text-sm text-zinc-300 leading-relaxed mb-4">{m.executive_summary}</p>
        <div className="bg-zinc-800/50 rounded-lg p-4 mb-4">
          <p className="label mb-1.5">Verdict</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{m.build_explanation}</p>
        </div>
        {m.biggest_competitor && (
          <div className="grid sm:grid-cols-3 gap-3">
            {([['Top Competitor', m.biggest_competitor.name], ['Revenue Est.', m.biggest_competitor.revenue], ['Their Gap', m.biggest_competitor.gap]] as [string, string][]).map(([l, v]) => (
              <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">{l}</p>
                <p className="text-sm text-zinc-300">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── MARKET GAPS ── */}
      <Section title="Market Gaps" badge={<span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{m.market_gaps.length}</span>}>
        <Num items={m.market_gaps} />
      </Section>

      {/* ── BRAND ANGLES ── */}
      <Section title="Brand Positioning Angles" badge={<span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{m.brand_opportunities.length}</span>}>
        <Num items={m.brand_opportunities} />
      </Section>

      {/* ── CUSTOMER LANGUAGE ── */}
      <Section title="Customer Language">
        <div className="space-y-6">
          <div>
            <p className="label mb-3">Frustrations</p>
            <div className="space-y-2">
              {m.customer_language.frustrations.map((q, i) => (
                <div key={i} className="bg-zinc-800/50 rounded-lg px-4 py-3 text-sm text-zinc-300 border-l-2 border-zinc-600">
                  &ldquo;{q}&rdquo;
                </div>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="label mb-3">Desires</p>
              <ul className="space-y-2">
                {m.customer_language.desires.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-300">
                    <span className="text-emerald-400 shrink-0 mt-0.5">→</span>{d}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label mb-3">Fears</p>
              <ul className="space-y-2">
                {m.customer_language.fears.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-300">
                    <span className="text-red-400 shrink-0 mt-0.5">✕</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <p className="label mb-3">Ad-Ready Phrases</p>
            <div className="space-y-2">
              {m.customer_language.ad_phrases.map((ap, i) => (
                <div key={i} className="grid sm:grid-cols-2 gap-2 text-sm">
                  <div className="bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-zinc-600 text-xs block mb-1">They say</span>
                    <span className="text-zinc-400">&ldquo;{ap.they_say}&rdquo;</span>
                  </div>
                  <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-4 py-3">
                    <span className="text-emerald-500 text-xs block mb-1">Use in copy</span>
                    <span className="text-zinc-300">{ap.use_in_copy}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── FORMULA ── */}
      <Section title="Product Recommendation">
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {([['Format', m.product_recommendation.format], ['Dosing', m.product_recommendation.dosing], ['COGS', m.product_recommendation.cogs_estimate], ['Retail', m.product_recommendation.retail_price]] as [string, string][]).map(([l, v]) => (
              <div key={l} className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">{l}</p>
                <p className="text-sm text-zinc-300">{v}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="label mb-3">Formula</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="text-left py-2.5 px-3 w-[32%]">Ingredient</th>
                    <th className="text-left py-2.5 px-3 w-[12%]">Dose</th>
                    <th className="text-left py-2.5 px-3">Role</th>
                    <th className="text-center py-2.5 px-3 w-[14%]">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {m.product_recommendation.formula.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                      <td className="py-3 px-3 font-medium">{row.ingredient}</td>
                      <td className="py-3 px-3 font-mono text-emerald-400 text-xs">{row.dose}</td>
                      <td className="py-3 px-3 text-zinc-400 text-xs leading-relaxed">{row.role}</td>
                      <td className="py-3 px-3 text-center text-sm">{row.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {m.product_recommendation.avoid.length > 0 && (
            <div>
              <p className="label mb-3">Avoid</p>
              <ul className="space-y-2">
                {m.product_recommendation.avoid.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-300">
                    <span className="text-red-400 shrink-0 mt-0.5">✕</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* ── FINANCIALS ── */}
      <Section title="Financial Projections">
        <div className="space-y-6">
          <div className="space-y-4">
            <ProbBar label="$10k / month"  value={m.financial_projections.ten_k_probability} />
            <ProbBar label="$100k / month" value={m.financial_projections.hundred_k_probability} />
            <ProbBar label="$1M / month"   value={m.financial_projections.one_m_probability} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              ['Gross Margin',      m.financial_projections.gross_margin],
              ['Net at Scale',     m.financial_projections.net_margin_at_scale],
              ['Subscription LTV', m.financial_projections.subscription_ltv],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500 mb-1">{l}</p>
                <p className="font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <p className="label mb-2">Path to $10M ARR</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{m.financial_projections.path_to_10m}</p>
          </div>
        </div>
      </Section>
    </div>
  )
}
