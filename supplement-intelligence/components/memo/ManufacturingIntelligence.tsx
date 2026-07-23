'use client'

// ═══════════════════════════════════════════════════════════════════════
// Manufacturing Intelligence — supply-chain dashboard. Direct successor to
// ManufacturingIntelligenceContent + ManufacturingDisplay in the old
// components/MemoDisplay.tsx. Fetch logic is unchanged (POST /api/manufacturing)
// except it now fetches once on mount rather than gated on tab-visibility —
// the report is a single scrolling document now, not tabs, so "isActive"
// no longer applies.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import type { MemoData } from '@/types/index'
import { manufacturingTabProvenance } from '@/lib/provenance'
import { ProvenanceBadge, ConfidencePill, dimLevel, PiCard } from './shared'
import { IconX } from '@/components/icons'

interface MfgEstimate {
  product: string; category: string
  unit_cost?: { low: number; high: number; currency: string }
  moq?: { low: number; high: number; unit: string }
  supplier_count?: { estimate: number; confidence: 'High' | 'Medium' | 'Low' }
  top_supplier_rating: number | null
  lead_time_days?: { low: number; high: number }
  complexity: string
  confidence: number
  confidence_label: 'High' | 'Medium' | 'Low'
  data_source: string
  notes: string
  top_suppliers?: { name: string; rating?: number | null; trade_assurance?: boolean; gold_supplier_years?: string; country_code?: string; customizable?: boolean }[]
}

function inferManufacturingCategory(format: string): string {
  const f = format.toLowerCase()
  if (['capsule', 'powder', 'gummy', 'liquid', 'softgel', 'tincture'].some(t => f.includes(t))) return 'supplements'
  if (['serum', 'moisturizer', 'cream', 'cleanser', 'toner', 'mask', 'spf', 'oil', 'treatment'].some(t => f.includes(t))) return 'beauty'
  if (['chew', 'treat', 'kibble', 'topical', 'freeze-dried'].some(t => f.includes(t))) return 'pets'
  if (['bar', 'gel', 'ready-to-drink', 'protein', 'pre-workout'].some(t => f.includes(t))) return 'fitness'
  return 'consumer goods'
}

function PipelineStage({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[110px] px-3 py-3">
      <p className="text-[9px] text-pi-faint uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-sm font-semibold text-pi-ink font-mono leading-snug">{value}</p>
      {sub && <p className="text-[10px] text-pi-faint mt-0.5">{sub}</p>}
    </div>
  )
}

function ManufacturingDisplay({ est, mfgLevel }: { est: MfgEstimate; mfgLevel: 'High' | 'Medium' | 'Low' }) {
  const formatCurrency = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n % 1 === 0 ? n : n.toFixed(1)}`
  const isVerified = est.data_source !== 'ai_synthesis'
  const sourceProvenance = manufacturingTabProvenance(est.data_source)

  const NO_DATA = 'Insufficient Verified Data'
  const unitCostRange = est.unit_cost ? `${formatCurrency(est.unit_cost.low)}–${formatCurrency(est.unit_cost.high)}` : null
  const moq       = est.moq            ? `${est.moq.low.toLocaleString()}–${est.moq.high.toLocaleString()} ${est.moq.unit}` : NO_DATA
  const leadTime  = est.lead_time_days ? `${est.lead_time_days.low}–${est.lead_time_days.high} days` : NO_DATA
  const suppliers = est.supplier_count ? `~${est.supplier_count.estimate.toLocaleString()}` : NO_DATA
  const rating    = est.top_supplier_rating != null ? `${est.top_supplier_rating}/5` : '—'

  const complexityColor =
    est.complexity === 'Low' ? 'text-pi-build' :
    est.complexity === 'Medium' ? 'text-pi-gold-bright' :
    est.complexity === 'High' ? 'text-pi-risk' : 'text-pi-risk'

  const introText = isVerified
    ? `Live supplier data from ${est.data_source.replace(/_/g, ' ')}. Prices reflect per-unit cost at high-volume tier (USD).`
    : 'No live supplier data was available for this query — only a qualitative complexity judgment is shown below. Activate live supplier credentials for verified quotes.'

  return (
    <div className="space-y-5">
      <p className="text-xs text-pi-faint italic leading-relaxed">{introText}</p>

      {unitCostRange ? (
        <div className="flex items-end gap-2">
          <span className="font-serif text-[22px] sm:text-[26px] font-semibold text-pi-ink tracking-tight">{unitCostRange}</span>
          <span className="text-xs text-pi-faint mb-1">per unit, landed</span>
        </div>
      ) : (
        <p className="text-sm text-pi-faint italic">{NO_DATA} — no live supplier quote for this query.</p>
      )}

      <div className="flex divide-x divide-pi-hairline rounded-xl border border-pi-hairline bg-pi-card overflow-x-auto">
        <PipelineStage label="Sourcing" value={suppliers} sub={est.supplier_count ? `${est.supplier_count.confidence} confidence` : undefined} />
        <PipelineStage label="Production" value={moq} sub="MOQ" />
        <PipelineStage label="QA" value={rating} sub="avg. supplier rating" />
        <PipelineStage label="Shipping" value={leadTime} sub="lead time" />
      </div>

      <div className="flex divide-x divide-pi-hairline rounded-xl border border-pi-hairline bg-pi-card overflow-hidden">
        <div className="flex-1 px-3 py-3">
          <p className="text-[10px] text-pi-faint uppercase tracking-wider mb-1">Manufacturing Difficulty</p>
          <p className={`text-sm font-semibold leading-snug ${complexityColor}`}>{est.complexity}</p>
          <p className="text-[11px] text-pi-faint mt-0.5">AI ease judgment: {mfgLevel}</p>
        </div>
        <div className="flex-1 px-3 py-3 flex items-center justify-between">
          <ConfidencePill level={est.confidence_label} note={`${est.confidence_label} confidence`} />
        </div>
      </div>

      {est.top_suppliers && est.top_suppliers.length > 0 && (
        <PiCard>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-pi-ink">Real Named Suppliers</p>
            {(() => {
              const withCountry = est.top_suppliers!.filter(s => s.country_code)
              if (!withCountry.length) return null
              const counts = new Map<string, number>()
              for (const s of withCountry) counts.set(s.country_code!, (counts.get(s.country_code!) ?? 0) + 1)
              const [topCountry, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
              return <span className="text-[10px] text-pi-faint font-mono">{topCount}/{withCountry.length} based in {topCountry}</span>
            })()}
          </div>
          <ul className="space-y-2">
            {est.top_suppliers.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-pi-sub font-medium truncate">{s.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-pi-faint shrink-0">
                  {s.country_code && <span className="font-mono text-pi-faint">{s.country_code}</span>}
                  {s.rating != null && <span className="font-mono text-pi-sub">{s.rating.toFixed(1)}/5</span>}
                  {s.customizable && <span className="text-pi-ink">OEM/Customizable</span>}
                  {s.trade_assurance && <span className="text-pi-build">Trade Assurance</span>}
                  {s.gold_supplier_years && <span>{s.gold_supplier_years} gold supplier</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-pi-faint mt-3">Real Alibaba.com supplier names for this exact search — verify independently before committing capital; this is not an endorsement.</p>
        </PiCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-pi-hairline">
        <div className="flex items-center gap-1.5 text-[11px] text-pi-faint"><span>Source:</span><ProvenanceBadge p={sourceProvenance} /></div>
      </div>

      {est.notes && isVerified && <p className="text-xs text-pi-faint leading-relaxed">{est.notes}</p>}
    </div>
  )
}

export default function ManufacturingIntelligence({ m }: { m: MemoData }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [estimate, setEstimate] = useState<MfgEstimate | null>(null)

  const mfgLevel = dimLevel(m, 'manufacturing') ?? 'Medium'
  const complexityHint = mfgLevel === 'High' ? 'Low' : mfgLevel === 'Low' ? 'High' : 'Medium'

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/manufacturing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: m.category_name,
          category: inferManufacturingCategory(m.product_recommendation?.format ?? ''),
          complexity: complexityHint,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setEstimate(await res.json())
      setStatus('done')
    } catch {
      setStatus('error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {status === 'loading' && (
        <div className="flex items-center gap-2.5 text-sm text-pi-faint py-6 justify-center">
          <div className="w-4 h-4 border-2 border-pi-hairline border-t-pi-ink rounded-full animate-spin shrink-0" />
          Estimating manufacturing parameters…
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 text-xs text-pi-risk rounded-lg border border-pi-risk/30 bg-pi-risk/10 px-3 py-2.5">
          <IconX className="w-3.5 h-3.5 shrink-0 mt-px" />
          Manufacturing estimate unavailable — please try again later.
        </div>
      )}
      {status === 'done' && estimate && <ManufacturingDisplay est={estimate} mfgLevel={mfgLevel} />}
    </div>
  )
}
