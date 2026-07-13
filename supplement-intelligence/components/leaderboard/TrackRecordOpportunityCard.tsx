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

import type { BuildDecision } from '@/types/index'
import type { LifecycleDisplay, V2VerdictDisplay } from '@/components/memo/field-derivations'
import type { HistoricalOutcomeStatus } from '@/components/leaderboard/derivations'
import { HardCardInteractive, VerdictBadge } from '@/components/ui'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

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

function scoreColor(score: number, decision: BuildDecision): string {
  if (decision === 'SKIP') return '#d32f2f'
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return '#000000'
  if (score >= 70) return '#008a00'
  if (score >= 50) return '#a67c00'
  return '#d32f2f'
}

export default function TrackRecordOpportunityCard({
  href, rank, categoryName, score, decision, format, competitor, marketSize, timeLabel,
  lifecycle, v2Verdict, confidencePct, historicalOutcome,
}: TrackRecordOpportunityCardProps) {
  const safeMarketSize = sanitizeMarketSize(marketSize)
  const color = scoreColor(score, decision)
  const hasPhase2Row = !!lifecycle || v2Verdict !== null || confidencePct !== null

  const content = (
    <div className="flex flex-col gap-3.5 p-gutter h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="font-mono text-[10px] text-outline shrink-0 w-5 text-right">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span className="w-8 h-8 border border-black grid place-items-center shrink-0 text-ink" title={format}>
              <ProductGlyphMini shape={inferProductShape(format)} className="w-3.5 h-4" />
            </span>
          )}
        </div>
        <span className="font-mono font-black text-2xl leading-none" style={{ color }}>{Math.round(score)}</span>
      </div>

      <h3 className="text-[15px] font-bold leading-snug text-ink line-clamp-2 -mt-0.5">
        {categoryName}
      </h3>

      {(competitor || safeMarketSize) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {competitor && competitor !== 'N/A' && (
            <div>
              <p className="text-[9px] font-mono text-outline uppercase tracking-wider mb-0.5">Competitor</p>
              <p className="text-xs text-ink-variant truncate max-w-[9rem]">{competitor}</p>
            </div>
          )}
          {safeMarketSize && (
            <div>
              <p className="text-[9px] font-mono text-outline uppercase tracking-wider mb-0.5">Market</p>
              <p className="text-xs text-ink-variant truncate max-w-[9rem]">{safeMarketSize}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-black/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-outline uppercase tracking-wider">Current:</span>
            {v2Verdict ? (
              <VerdictBadge scheme="v2-verdict" verdict={v2Verdict.verdict} size="sm" />
            ) : (
              <VerdictBadge scheme="build-decision" verdict={decision} size="sm" />
            )}
          </div>
          <span className="font-mono text-[10px] text-outline shrink-0">{timeLabel}</span>
        </div>

        {hasPhase2Row && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[9px] font-mono text-outline uppercase tracking-wider">
            {lifecycle && <span className="border border-black/20 px-1.5 py-0.5">{lifecycle.stage}</span>}
            {v2Verdict && <span>Q {v2Verdict.qualityScore}/100 ({v2Verdict.qualityTier})</span>}
            {confidencePct !== null && <span>Conf {confidencePct}%</span>}
          </div>
        )}

        {historicalOutcome && (
          <div className="mt-2 pt-2 border-t border-black/10 flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-outline uppercase tracking-wider">Historical Outcome:</span>
            <span className="text-[9px] font-mono text-outline-variant">
              {historicalOutcome.maturity === 'too_early'
                ? `Too early for a checkpoint (${historicalOutcome.daysSinceVerdict}d since verdict, first eligible at 90d)`
                : 'Not yet available in this UI (Roadmap M3.1)'}
            </span>
          </div>
        )}
      </div>
    </div>
  )

  if (href) return <HardCardInteractive href={href} className="h-full">{content}</HardCardInteractive>
  return <div className="bg-white border border-black h-full">{content}</div>
}
