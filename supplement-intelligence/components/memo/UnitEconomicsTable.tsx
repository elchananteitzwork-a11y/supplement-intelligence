// ═══════════════════════════════════════════════════════════════════════
// Unit Economics — canonical Stitch section (Investor Report §5): a
// literal Target Sale Price → Referral Fee → FBA Fulfillment → Landed COGS
// → Contribution Margin ledger, not the Gross/Net Margin summary rows this
// file used to lead with. Real inputs: product_recommendation.retail_price
// / .cogs_estimate (AI-estimated, disclosed as such) combined with
// signal_evidence.revenue.avg_referral_fee_pct / .avg_fba_pick_pack_fee
// (real Amazon fee-schedule data, when present) — same fields already
// fetched and partially shown as a "cross-check" callout; now the primary
// table. When real fee data is absent, the ledger degrades to Price → COGS
// only, disclosed, rather than fabricating a fee. Falls back to the old
// Gross/Net Margin rows below when `retail_price`/`cogs_estimate` are
// themselves absent (older memos). See docs/STITCH_NARRATIVE_REMAPPING.md §1.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import { toConfidenceBand, realFeeDataProvenance, STATIC_PROVENANCE } from '@/lib/provenance'
import { LedgerTable, type LedgerColumn } from '@/components/ui'
import { ProvenanceBadge, SectionIntro } from './shared'
import ManufacturingIntelligence from './ManufacturingIntelligence'

function parseUsd(v: string | undefined): number | null {
  if (!v) return null
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

interface LedgerRow { id: string; label: string; amount: number | null; isTotal?: boolean; real: boolean }

function EconomicsLedger({ m }: { m: MemoData }) {
  const rec = m.product_recommendation
  const rev = m.signal_evidence?.revenue?.value
  const price = parseUsd(rec?.retail_price)
  const cogs  = parseUsd(rec?.cogs_estimate)
  if (price === null || cogs === null) return null

  const referralPct = rev?.avg_referral_fee_pct
  const fbaFee       = parseUsd(rev?.avg_fba_pick_pack_fee)
  const hasRealFees  = referralPct !== undefined || fbaFee !== null
  const referralAmt  = referralPct !== undefined ? -(price * referralPct / 100) : null
  const fbaAmt        = fbaFee !== null ? -fbaFee : null

  const contribution = price + (referralAmt ?? 0) + (fbaAmt ?? 0) - cogs
  const contributionPct = price > 0 ? Math.round((contribution / price) * 100) : 0

  const rows: LedgerRow[] = [
    { id: 'price', label: 'Target Sale Price', amount: price, real: false },
    ...(referralAmt !== null ? [{ id: 'referral', label: `Referral Fee${referralPct !== undefined ? ` (${referralPct}%)` : ''}`, amount: referralAmt, real: true }] : []),
    ...(fbaAmt !== null ? [{ id: 'fba', label: 'FBA Fulfillment', amount: fbaAmt, real: true }] : []),
    { id: 'cogs', label: 'Landed COGS (est.)', amount: -cogs, real: false },
    { id: 'contribution', label: 'Contribution Margin', amount: contribution, isTotal: true, real: hasRealFees },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] text-outline uppercase tracking-widest">Unit Economics Ledger</p>
        <ProvenanceBadge p={hasRealFees ? realFeeDataProvenance(m.signal_evidence)! : { level: 'estimated', source: 'AI estimate', detail: 'Price and COGS are the model’s own estimate — no real Amazon fee-schedule data was available for this query to cross-check them.' }} />
      </div>
      <div className="bg-white border-2 border-black overflow-hidden">
        <table className="w-full font-mono text-sm text-left">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 uppercase text-[10px] tracking-wider text-outline">Component</th>
              <th className="p-3 uppercase text-[10px] tracking-wider text-outline text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {rows.map(r => (
              <tr key={r.id} className={r.isTotal ? 'bg-black text-white' : ''}>
                <td className={`p-3 ${r.isTotal ? 'font-bold uppercase' : ''}`}>{r.label}</td>
                <td className={`p-3 text-right ${r.isTotal ? 'font-bold' : ''}`}>
                  {r.amount === null ? '—' : r.amount < 0 ? `($${Math.abs(r.amount).toFixed(2)})` : `$${r.amount.toFixed(2)}`}
                  {r.isTotal && ` (${contributionPct}%)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasRealFees && (
        <p className="mt-2 text-[10px] text-outline italic">No real Amazon fee-schedule data for this query — Contribution Margin above is Price minus COGS only, before marketplace fees.</p>
      )}
    </div>
  )
}

// Legacy memos only (pre-2026-06-26): had real-looking probability strings
// with no real base-rate model behind them. New memos never populate
// these — computeTractionBand replaces this entirely.
function TrajectoryTimeline({ fp }: { fp: MemoData['financial_projections'] }) {
  if (!fp.ten_k_probability && !fp.hundred_k_probability && !fp.one_m_probability) return null
  const pct = (v?: string) => (v ? parseInt(v, 10) || 0 : 0)
  const colorFor = (p: number) => (p >= 60 ? 'text-verdict-positive' : p >= 30 ? 'text-verdict-caution-text' : 'text-outline')

  const milestones = [
    { label: 'Validate',   value: undefined as string | undefined },
    { label: '$10k / mo',  value: fp.ten_k_probability },
    { label: '$100k / mo', value: fp.hundred_k_probability },
    { label: '$1M / mo',   value: fp.one_m_probability },
  ]

  return (
    <div className="bg-white border border-black p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-[10px] text-outline uppercase tracking-wider">Revenue Trajectory (legacy)</p>
        <ProvenanceBadge p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: 'Legacy field from a memo generated before 2026-06-26 — these probability percentages were generated to look like forecasting-tool output, with no statistical base-rate model behind them. Memos generated after this date use a qualitative traction band instead.' }} />
      </div>
      <div className="flex justify-between">
        {milestones.map(ms => (
          <div key={ms.label} className="flex flex-col items-center flex-1">
            <span className="text-sm font-semibold text-black text-center">{ms.label}</span>
            <span className={`text-xs font-mono mt-1 ${ms.value ? colorFor(pct(ms.value)) : 'text-outline'}`}>
              {ms.value ? toConfidenceBand(ms.value) : '30–60 days'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TractionBandCard({ band }: { band: string }) {
  const cls = band === 'Strong comparable traction' ? 'text-verdict-positive border-black bg-white'
    : band === 'Some comparable traction' ? 'text-verdict-caution-text border-black bg-white'
    : 'text-ink-variant border-outline-variant bg-surface-container-low'
  return (
    <div className={`border p-5 sm:p-7 ${cls}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] uppercase tracking-wider opacity-80">Traction Read</p>
        <ProvenanceBadge p={{ level: 'estimated', source: 'Server-side formula', detail: 'Computed deterministically from the real signal data available for this query — not a probability, not AI-invented. Replaces the old ten_k/hundred_k/one_m probability fields.' }} />
      </div>
      <p className="text-headline-md font-medium">{band}</p>
    </div>
  )
}

interface MarginRow { id: string; label: string; value: string; unverified: boolean }

export default function UnitEconomicsTable({ m }: { m: MemoData }) {
  const fp = m.financial_projections
  const marketSizeIsUnverified = !m.market_size || m.market_size === 'N/A'
    || m.market_size.toLowerCase().includes('not independently') || m.market_size.toLowerCase().includes('vary widely')

  const marginRows: MarginRow[] = ([
    ['gross', 'Gross Margin', fp.gross_margin],
    ['net',   'Net Margin at Scale', fp.net_margin_at_scale],
  ] as [string, string, string][]).map(([id, label, v]) => ({
    id, label, value: v, unverified: !v || v.toLowerCase().includes('not independently verified'),
  }))

  const columns: LedgerColumn<MarginRow>[] = [
    { key: 'label', header: 'Component', render: r => r.label },
    { key: 'value', header: 'Value', align: 'right', render: r => r.unverified ? <span className="text-outline italic">Not verified</span> : <span className="font-mono font-bold">{r.value}</span> },
  ]

  return (
    <div className="space-y-5">
      <EconomicsLedger m={m} />
      {marketSizeIsUnverified && (
        <p className="text-[11px] text-outline italic leading-relaxed">Market size not independently verified. Figures shown are AI estimates — consult industry reports before citing.</p>
      )}

      <div className="pt-5 border-t border-black">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionIntro text="Probability estimates based on comparable DTC launches. Not independently verified — treat as directional, not forecasts." />
          <ProvenanceBadge p={STATIC_PROVENANCE.financialProjections} />
        </div>
        <TrajectoryTimeline fp={fp} />
        {fp.traction_band && <TractionBandCard band={fp.traction_band} />}
      </div>

      <div className="pt-5 border-t border-black">
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">Margins (AI Estimate)</p>
        <LedgerTable columns={columns} rows={marginRows} />
      </div>

      {/* COGS provenance — same topic as this whole section (unit
          economics), was previously its own top-level "Manufacturing
          Intelligence" section named after the backend field rather than
          grouped by subject matter. Fetch behavior (POST /api/manufacturing
          on mount) is unchanged. */}
      <div className="pt-5 border-t border-black">
        <p className="text-[10px] text-outline uppercase tracking-widest mb-3">Manufacturing &amp; COGS Provenance</p>
        <ManufacturingIntelligence m={m} />
      </div>
    </div>
  )
}
