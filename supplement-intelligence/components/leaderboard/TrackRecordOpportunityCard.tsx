// ═══════════════════════════════════════════════════════════════════════
// Track Record Opportunity Card — Phase 3 integration, Track Record only.
//
// Deliberately a NEW component, not a modification of the shared
// components/OpportunityCard.tsx — that component is also used by
// app/analyze/page.tsx, which this milestone does not touch. Mirrors
// OpportunityCard's exact visual structure/classes (same optional-href
// shell, same header/title/competitor rows) so the grid's look is
// unchanged; the only difference is the footer, which adds a "Current
// Verdict" row (real Roadmap M2.4 verdict when available, legacy
// BuildDecision badge otherwise) and a separate, explicitly labeled
// "Historical Outcome" row — kept visually distinct per instruction to
// "clearly separate current verdict from historical outcome."
// ═══════════════════════════════════════════════════════════════════════

import Link from 'next/link'
import type { BuildDecision } from '@/types/index'
import type { LifecycleDisplay, V2VerdictDisplay } from '@/components/memo/field-derivations'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

// pi-* verdict pill — same mapping as components/memo/CurrentSignal.tsx's
// local V2VerdictBadge (components/ui/VerdictBadge.tsx has no pi variant
// and is still used by other out-of-scope legacy pages, so it is inlined
// here rather than modified — same resolution used there).
type V2Verdict = V2VerdictDisplay['verdict']
const V2_VERDICT_CFG: Record<V2Verdict, { label: string; cls: string }> = {
  BUILD_NOW:                { label: 'Build Now',                cls: 'text-pi-build border-pi-build/40 bg-pi-build/10' },
  BUILD_IF_DIFFERENTIATED:  { label: 'Build If Differentiated',   cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH_CLOSELY:            { label: 'Watch Closely',             cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH:                    { label: 'Watch',                     cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  INVESTIGATE:              { label: 'Investigate',               cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  AVOID:                    { label: 'Avoid',                     cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
  PASS:                     { label: 'Pass',                      cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
}
const BUILD_DECISION_CFG: Record<BuildDecision, { label: string; cls: string }> = {
  BUILD_NOW:                   { label: 'Entry Supported',     cls: 'text-pi-build border-pi-build/40 bg-pi-build/10' },
  VALIDATE_FURTHER:            { label: 'Validation Required', cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  SKIP:                        { label: 'Not Supported',       cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation',   cls: 'text-pi-gold-deep border-pi-gold/40 bg-pi-gold/10' },
}
function VerdictPill({ v2Verdict, decision }: { v2Verdict: V2VerdictDisplay | null; decision: BuildDecision }) {
  const cfg = v2Verdict ? V2_VERDICT_CFG[v2Verdict.verdict] : BUILD_DECISION_CFG[decision]
  return (
    <span className={`inline-flex items-center font-bold uppercase tracking-wide rounded-full border text-[10px] px-2.5 py-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

interface TrackRecordOpportunityCardProps {
  href?:        string
  rank?:        number
  categoryName: string
  score:        number
  decision:     BuildDecision   // legacy fallback only — see verdict slot below
  format?:      string | null
  competitor?:  string | null
  marketSize?:  string | null
  timeLabel:    string
  // Roadmap M2.2/M2.4/M1.4 — all real, all null when the row's
  // best_analysis_id predates the relevant milestone; never fabricated.
  lifecycle:        LifecycleDisplay | null
  v2Verdict:        V2VerdictDisplay | null
  confidencePct:    number | null
}

function sanitizeMarketSize(s: string | null | undefined): string | null {
  if (!s || s === 'N/A') return null
  if (/\$[A-Z]+B?\s*\(year\)/i.test(s)) return null
  return s
}

function scoreColor(score: number, decision: BuildDecision): string {
  if (decision === 'SKIP') return '#A13F2E'
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return '#16171A'
  if (score >= 70) return '#2E6B48'
  if (score >= 50) return '#8D6A16'
  return '#A13F2E'
}

export default function TrackRecordOpportunityCard({
  href, rank, categoryName, score, decision, format, competitor, marketSize, timeLabel,
  lifecycle, v2Verdict, confidencePct,
}: TrackRecordOpportunityCardProps) {
  const safeMarketSize = sanitizeMarketSize(marketSize)
  const color = scoreColor(score, decision)
  const hasPhase2Row = !!lifecycle || v2Verdict !== null || confidencePct !== null

  const content = (
    <div className="flex flex-col gap-3.5 p-5 h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="font-mono text-[10px] text-pi-faint shrink-0 w-5 text-right">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span className="w-8 h-8 rounded-lg border border-pi-hairline grid place-items-center shrink-0 text-pi-ink" title={format}>
              <ProductGlyphMini shape={inferProductShape(format)} className="w-3.5 h-4" />
            </span>
          )}
        </div>
        <span className="font-mono font-semibold text-2xl leading-none" style={{ color }}>{Math.round(score)}</span>
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-pi-ink line-clamp-2 -mt-0.5">
        {categoryName}
      </h3>

      {(competitor || safeMarketSize) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {competitor && competitor !== 'N/A' && (
            <div>
              <p className="text-[9px] font-mono text-pi-faint uppercase tracking-wider mb-0.5">Competitor</p>
              <p className="text-xs text-pi-sub truncate max-w-[9rem]">{competitor}</p>
            </div>
          )}
          {safeMarketSize && (
            <div>
              <p className="text-[9px] font-mono text-pi-faint uppercase tracking-wider mb-0.5">Market</p>
              <p className="text-xs text-pi-sub truncate max-w-[9rem]">{safeMarketSize}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-pi-hairline">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-pi-faint uppercase tracking-wider">Current:</span>
            <VerdictPill v2Verdict={v2Verdict} decision={decision} />
          </div>
          <span className="font-mono text-[10px] text-pi-faint shrink-0">{timeLabel}</span>
        </div>

        {hasPhase2Row && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[9px] font-mono text-pi-faint uppercase tracking-wider">
            {lifecycle && <span className="rounded border border-pi-hairline px-1.5 py-0.5">{lifecycle.stage}</span>}
            {v2Verdict && <span>Q {v2Verdict.qualityScore}/100 ({v2Verdict.qualityTier})</span>}
            {confidencePct !== null && <span>Conf {confidencePct}%</span>}
          </div>
        )}

        {/* The "Historical Outcome" strip that used to render here was cut
            in the 2026-07-24 data-density pass (owner-approved): it never
            showed a real outcome — only "too early for a checkpoint" or a
            "Roadmap M3.1" placeholder, internal jargon on every card.
            Bring outcome display back only when M3.1 ships a real
            user-readable outcome source (verdict_ledger_outcomes has no
            user read path today by design — migration 024). */}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-xl border border-pi-hairline bg-pi-card shadow-[0_1px_3px_rgba(22,23,26,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(22,23,26,0.05),0_10px_20px_rgba(22,23,26,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-bright h-full"
      >
        {content}
      </Link>
    )
  }
  return <div className="rounded-xl border border-pi-hairline bg-pi-card h-full">{content}</div>
}
