// ═══════════════════════════════════════════════════════════════════════
// Launch Strategy — product concept render, format/dosing/COGS/retail
// strip, ingredient formula table, avoid list, and path to $10M ARR.
// Direct successor to LaunchStrategyContent in the old
// components/MemoDisplay.tsx.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import { STATIC_PROVENANCE } from '@/lib/provenance'
import { ProvenanceBadge, SectionIntro, ProvenanceCaption } from './shared'
import { ProductRenderHero, inferProductShape } from '@/components/ProductGlyph'
import { LifestyleScene } from '@/components/LifestyleScene'
import { IconX } from '@/components/icons'
import AdCopyIdeation from './AdCopyIdeation'

function ProductConceptVisual({ format, categoryName }: { format: string; categoryName: string }) {
  const shape = inferProductShape(format)
  return (
    <div className="relative bg-white border border-black p-6 sm:p-8 overflow-hidden">
      <div className="flex items-center justify-between mb-1 relative z-10">
        <p className="text-[10px] text-outline uppercase tracking-wider">Product Concept</p>
        <p className="text-[10px] text-outline italic">Generated concept render — not a product photo</p>
      </div>
      <div className="flex items-center justify-center py-4 relative z-10">
        <ProductRenderHero shape={shape} />
      </div>
      <p className="text-center text-sm font-medium text-ink-variant relative z-10">{categoryName}</p>
      <p className="text-center text-xs text-outline mt-0.5 relative z-10">{format}</p>
    </div>
  )
}

export default function LaunchStrategy({ m }: { m: MemoData }) {
  const rec = m.product_recommendation
  const fp = m.financial_projections
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionIntro text="Recommended product configuration and entry sequence based on gap analysis, manufacturing constraints, and margin targets." />
        <ProvenanceBadge p={STATIC_PROVENANCE.productEconomics} />
      </div>

      <ProductConceptVisual format={rec.format} categoryName={m.category_name} />
      <LifestyleScene format={rec.format} dosing={rec.dosing} />

      <div className="flex flex-wrap sm:flex-nowrap divide-x divide-black/10 bg-white border border-black overflow-hidden">
        {([['Format', rec.format], ['Usage', rec.dosing], ['COGS', rec.cogs_estimate], ['Retail', rec.retail_price]] as [string, string][]).map(([l, v]) => (
          <div key={l} className="flex-1 min-w-[100px] px-3 py-3" title={(l === 'COGS' || l === 'Retail') ? STATIC_PROVENANCE.productEconomics.detail : undefined}>
            <p className="text-[10px] text-outline uppercase tracking-wider mb-1">{l}</p>
            <p className="text-xs text-ink-variant leading-snug font-mono">{v ?? '—'}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-outline uppercase tracking-widest">Key Ingredients / Components</p>
          <ProvenanceBadge p={STATIC_PROVENANCE.productFormula} />
        </div>
        <div className="overflow-x-auto bg-white border border-black">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-surface-container text-[10px] text-outline uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 w-[30%]">Ingredient</th>
                <th className="text-left py-2.5 px-3 w-[14%]">Dose</th>
                <th className="text-left py-2.5 px-3">Role</th>
                <th className="text-center py-2.5 px-3 w-[14%]">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rec.formula.map((row, i) => (
                <tr key={i} className="border-t border-black hover:bg-surface-container-low">
                  <td className="py-3 px-3 font-medium text-sm">{row.ingredient}</td>
                  <td className="py-3 px-3 font-mono text-verdict-caution-text text-xs">{row.dose}</td>
                  <td className="py-3 px-3 text-ink-variant text-xs leading-relaxed">{row.role}</td>
                  <td className="py-3 px-3 text-center text-sm">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rec.avoid?.length > 0 && (
        <div>
          <p className="text-xs text-outline uppercase tracking-widest mb-2.5">Avoid</p>
          <ul className="space-y-1.5">
            {rec.avoid.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-variant"><IconX className="w-3 h-3 text-verdict-negative shrink-0 mt-1" />{a}</li>
            ))}
          </ul>
        </div>
      )}

      {fp.path_to_10m && (
        <div className="bg-surface-container p-4">
          <p className="text-xs text-outline uppercase tracking-widest mb-2">Path to $10M ARR</p>
          <p className="text-sm text-ink-variant leading-relaxed">{fp.path_to_10m}</p>
        </div>
      )}

      {/* Relocated from the old "Differentiation Brief" section (naming
          collision with the real one, see components/memo/DifferentiationBrief.tsx
          header) — AI-invented ad copy/persona material belongs with
          go-to-market ideation, not next to real customer evidence. */}
      <div className="pt-6 border-t border-black">
        <p className="text-xs text-outline uppercase tracking-widest mb-3">AI Creative &amp; Ad-Copy Ideation</p>
        <ProvenanceCaption p={{ level: 'synthesized', source: 'Claude (AI synthesis)', detail: 'Everything below is invented by the model to read like real customer quotes. It is not pulled from real reviews — treat it as a creative starting point for messaging, not as research.' }} />
        <div className="mt-4"><AdCopyIdeation m={m} /></div>
      </div>
    </div>
  )
}
