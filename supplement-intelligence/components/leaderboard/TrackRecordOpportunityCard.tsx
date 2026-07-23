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
import type { HistoricalOutcomeStatus } from '@/components/leaderboard/derivations'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

// Terminal Noir port (2026-07-23) — this component renders exclusively on
// /leaderboard (sole consumer, see file header), which is now on the dark
// register; re-tuned directly rather than adding a variant prop since
// there is no other, still-cream consumer to preserve. Colors use the
// noir TEXT tokens (pi-*-noir / pi-gold-deep) — same identities as before,
// tuned for legibility on pi-stage instead of white-card-on-cream.
type V2Verdict = V2VerdictDisplay['verdict']
const V2_VERDICT_CFG: Record<V2Verdict, { label: string; cls: string }> = {
  BUILD_NOW:                { label: 'Build Now',                cls: 'text-pi-build-noir border-pi-build-noir/40 bg-pi-build-noir/10' },
  BUILD_IF_DIFFERENTIATED:  { label: 'Build If Differentiated',   cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH_CLOSELY:            { label: 'Watch Closely',             cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  WATCH:                    { label: 'Watch',                     cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  INVESTIGATE:              { label: 'Investigate',               cls: 'text-pi-noir-sub border-pi-noir-hairline bg-pi-elevated' },
  AVOID:                    { label: 'Avoid',                     cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
  PASS:                     { label: 'Pass',                      cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
}
const BUILD_DECISION_CFG: Record<BuildDecision, { label: string; cls: string }> = {
  BUILD_NOW:                   { label: 'Entry Supported',     cls: 'text-pi-build-noir border-pi-build-noir/40 bg-pi-build-noir/10' },
  VALIDATE_FURTHER:            { label: 'Validation Required', cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
  SKIP:                        { label: 'Not Supported',       cls: 'text-pi-risk-noir border-pi-risk-noir/40 bg-pi-risk-noir/10' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation',   cls: 'text-pi-gold-deep border-pi-gold-deep/40 bg-pi-gold-deep/10' },
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
  // Real, elapsed-time-derived checkpoint maturity — see
  // components/leaderboard/derivations.ts. Null only when this row has no
  // best_analysis_id to date from (should not happen for a real row, but
  // never assumed).
  historicalOutcome: HistoricalOutcomeStatus | null
}

function sanitizeMarketSize(s: string | null | undefined): string | null {
  if (!s || s === 'N/A') return null
  if (/\$[A-Z]+B?\s*\(year\)/i.test(s)) return null
  return s
}

// Noir-safe hex (tailwind.config.ts pi-*-noir token values) — same
// thresholds/logic as the cream register, re-tuned for legibility on
// pi-stage/pi-elevated (see TrackRecordOpportunityCard's Terminal Noir
// port note above).
function scoreColor(score: number, decision: BuildDecision): string {
  if (decision === 'SKIP') return '#E8785E'
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return '#F5EFDF'
  if (score >= 70) return '#6FC492'
  if (score >= 50) return '#D4A94A'
  return '#E8785E'
}

export default function TrackRecordOpportunityCard({
  href, rank, categoryName, score, decision, format, competitor, marketSize, timeLabel,
  lifecycle, v2Verdict, confidencePct, historicalOutcome,
}: TrackRecordOpportunityCardProps) {
  const safeMarketSize = sanitizeMarketSize(marketSize)
  const color = scoreColor(score, decision)
  const hasPhase2Row = !!lifecycle || v2Verdict !== null || confidencePct !== null

  const content = (
    <div className="flex flex-col gap-3.5 p-5 h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="font-mono text-[10px] text-pi-noir-sub shrink-0 w-5 text-right">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span className="w-8 h-8 rounded-lg border border-pi-noir-hairline grid place-items-center shrink-0 text-pi-noir-text" title={format}>
              <ProductGlyphMini shape={inferProductShape(format)} className="w-3.5 h-4" />
            </span>
          )}
        </div>
        <span className="font-mono font-semibold text-2xl leading-none" style={{ color }}>{Math.round(score)}</span>
      </div>

      <h3 className="text-[15px] font-semibold leading-snug text-pi-noir-text line-clamp-2 -mt-0.5">
        {categoryName}
      </h3>

      {(competitor || safeMarketSize) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {competitor && competitor !== 'N/A' && (
            <div>
              <p className="text-[9px] font-mono text-pi-noir-sub uppercase tracking-wider mb-0.5">Competitor</p>
              <p className="text-xs text-pi-noir-sub truncate max-w-[9rem]">{competitor}</p>
            </div>
          )}
          {safeMarketSize && (
            <div>
              <p className="text-[9px] font-mono text-pi-noir-sub uppercase tracking-wider mb-0.5">Market</p>
              <p className="text-xs text-pi-noir-sub truncate max-w-[9rem]">{safeMarketSize}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-pi-noir-hairline">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-pi-noir-sub uppercase tracking-wider">Current:</span>
            <VerdictPill v2Verdict={v2Verdict} decision={decision} />
          </div>
          <span className="font-mono text-[10px] text-pi-noir-sub shrink-0">{timeLabel}</span>
        </div>

        {hasPhase2Row && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[9px] font-mono text-pi-noir-sub uppercase tracking-wider">
            {lifecycle && <span className="rounded border border-pi-noir-hairline px-1.5 py-0.5">{lifecycle.stage}</span>}
            {v2Verdict && <span>Q {v2Verdict.qualityScore}/100 ({v2Verdict.qualityTier})</span>}
            {confidencePct !== null && <span>Conf {confidencePct}%</span>}
          </div>
        )}

        {historicalOutcome && (
          <div className="mt-2 pt-2 border-t border-pi-noir-hairline flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-pi-noir-sub uppercase tracking-wider">Historical Outcome:</span>
            <span className="text-[9px] font-mono text-pi-noir-sub">
              {historicalOutcome.maturity === 'too_early'
                ? `Too early for a checkpoint (${historicalOutcome.daysSinceVerdict}d since verdict, first eligible at 90d)`
                : 'Not yet available in this UI (Roadmap M3.1)'}
            </span>
          </div>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col rounded-xl border border-pi-noir-hairline bg-pi-stage shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:border-pi-gold-deep/40 hover:shadow-[0_4px_10px_rgba(0,0,0,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-gold-deep h-full"
      >
        {content}
      </Link>
    )
  }
  return <div className="rounded-xl border border-pi-noir-hairline bg-pi-stage h-full">{content}</div>
}
