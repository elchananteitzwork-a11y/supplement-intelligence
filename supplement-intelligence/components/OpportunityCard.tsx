import Link from 'next/link'
import type { BuildDecision } from '@/types/index'
import { ScoreDial } from '@/components/ScoreDial'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

const DECISION_CFG: Record<BuildDecision, { label: string; color: string; glow: string; bg: string }> = {
  BUILD_NOW:        { label: 'Entry Supported',     color: '#008a00', glow: 'transparent', bg: 'transparent' },
  VALIDATE_FURTHER: { label: 'Validation Required', color: '#fbc02d', glow: 'transparent', bg: 'transparent' },
  SKIP:             { label: 'Not Supported',       color: '#d32f2f', glow: 'transparent', bg: 'transparent' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation', color: '#000000', glow: 'transparent', bg: 'transparent' },
}

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

export default function OpportunityCard({
  href, rank, gridIndex, categoryName, score, decision, format, competitor, marketSize, timeLabel,
}: OpportunityCardProps) {
  const cfg = DECISION_CFG[decision]
  const safeMarketSize = sanitizeMarketSize(marketSize)

  const content = (
    <>
      {/* Top row: rank + glyph + score dial */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="font-mono text-[10px] text-[#7e7576] shrink-0 w-5 text-right">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span
              className="w-8 h-8 border border-black grid place-items-center shrink-0"
              title={format}
            >
              <ProductGlyphMini shape={inferProductShape(format)} className="w-3.5 h-4 opacity-80" />
            </span>
          )}
        </div>
        <ScoreDial score={score} decision={decision} size={44} />
      </div>

      {/* Category name */}
      <h3 className="text-[15px] font-bold leading-snug text-black line-clamp-2 -mt-0.5">
        {categoryName}
      </h3>

      {/* Facts */}
      {(competitor || safeMarketSize) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {competitor && competitor !== 'N/A' && (
            <div>
              <p className="text-[9px] font-mono text-[#7e7576] uppercase tracking-wider mb-0.5">Competitor</p>
              <p className="font-mono text-xs text-[#4c4546] truncate max-w-[9rem]">{competitor}</p>
            </div>
          )}
          {safeMarketSize && (
            <div>
              <p className="text-[9px] font-mono text-[#7e7576] uppercase tracking-wider mb-0.5">Market</p>
              <p className="font-mono text-xs text-[#4c4546] truncate max-w-[9rem]">{safeMarketSize}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom: verdict + time */}
      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-black/10">
        <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-black uppercase" style={{ background: cfg.color, color: decision === 'VALIDATE_FURTHER' ? '#000000' : '#ffffff' }}>
          {cfg.label}
        </span>
        <span className="font-mono text-[10px] text-[#7e7576] shrink-0">{timeLabel}</span>
      </div>
    </>
  )

  const cls = `bg-white border border-black flex flex-col gap-3.5 p-5 ${
    href ? 'hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[1px] hover:-translate-y-[1px] transition-all duration-150 cursor-pointer' : ''
  }`

  if (href) return <Link href={href} className={cls}>{content}</Link>
  return <div className={cls}>{content}</div>
}
