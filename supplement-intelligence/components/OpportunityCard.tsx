import type { BuildDecision } from '@/types/index'
import { HardCardInteractive, VerdictBadge } from '@/components/ui'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

interface OpportunityCardProps {
  href?:        string
  rank?:        number
  gridIndex?:   number
  categoryName: string
  score:        number
  decision:     BuildDecision
  format?:      string | null
  competitor?:  string | null
  marketSize?:  string | null
  timeLabel:    string
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

export default function OpportunityCard({
  href, rank, categoryName, score, decision, format, competitor, marketSize, timeLabel,
}: OpportunityCardProps) {
  const safeMarketSize = sanitizeMarketSize(marketSize)
  const color = scoreColor(score, decision)

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

      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-black/10">
        <VerdictBadge scheme="build-decision" verdict={decision} size="sm" />
        <span className="font-mono text-[10px] text-outline shrink-0">{timeLabel}</span>
      </div>
    </div>
  )

  if (href) return <HardCardInteractive href={href} className="h-full">{content}</HardCardInteractive>
  return <div className="bg-white border border-black h-full">{content}</div>
}
