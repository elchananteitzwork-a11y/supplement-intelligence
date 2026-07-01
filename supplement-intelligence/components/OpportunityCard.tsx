import Link from 'next/link'
import type { BuildDecision } from '@/types/index'
import { ScoreDial } from '@/components/ScoreDial'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

const DECISION_CFG: Record<BuildDecision, { label: string; color: string; glow: string; bg: string }> = {
  BUILD_NOW:        { label: 'Build Now',       color: '#34d9a0', glow: 'rgba(52,217,160,0.12)', bg: 'rgba(52,217,160,0.08)' },
  VALIDATE_FURTHER: { label: 'Validate First',  color: '#f5b947', glow: 'rgba(245,185,71,0.10)', bg: 'rgba(245,185,71,0.06)' },
  SKIP:             { label: 'Pass',            color: '#ff6259', glow: 'rgba(255,98,89,0.08)',  bg: 'rgba(255,98,89,0.05)'  },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation', color: '#8b7cff', glow: 'rgba(139,124,255,0.10)', bg: 'rgba(139,124,255,0.06)' },
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

export default function OpportunityCard({
  href, rank, gridIndex, categoryName, score, decision, format, competitor, marketSize, timeLabel,
}: OpportunityCardProps) {
  const cfg = DECISION_CFG[decision]
  const delay = Math.min(typeof gridIndex === 'number' ? gridIndex : 0, 11) * 0.05
  const isBuild = decision === 'BUILD_NOW' && score >= 70

  const style: React.CSSProperties = {
    borderTopColor: `${cfg.color}40`,
    borderTopWidth: 2,
    animation: 'lab-fade-up .45s var(--lab-ease-enter, ease) both',
    animationDelay: `${delay}s`,
    ...(isBuild ? { boxShadow: `0 0 32px ${cfg.glow}` } : {}),
  }

  const content = (
    <>
      {/* Top row: rank + glyph + score dial */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="lab-text-data text-[10px] text-lab-text-tertiary shrink-0 w-5 text-right">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span
              className="w-8 h-8 rounded-full grid place-items-center shrink-0"
              style={{ background: `${cfg.color}12`, border: `1px solid ${cfg.color}25` }}
              title={format}
            >
              <ProductGlyphMini shape={inferProductShape(format)} className="w-3.5 h-4 opacity-80" />
            </span>
          )}
        </div>
        <ScoreDial score={score} decision={decision} size={44} />
      </div>

      {/* Category name */}
      <h3 className="font-display text-[15px] font-semibold leading-snug text-lab-text-primary line-clamp-2 -mt-0.5">
        {categoryName}
      </h3>

      {/* Facts */}
      {(competitor || marketSize) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {competitor && competitor !== 'N/A' && (
            <div>
              <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-0.5">Competitor</p>
              <p className="lab-text-data text-xs text-lab-text-secondary truncate max-w-[9rem]">{competitor}</p>
            </div>
          )}
          {marketSize && marketSize !== 'N/A' && (
            <div>
              <p className="text-[9px] text-lab-text-tertiary uppercase tracking-wider mb-0.5">Market</p>
              <p className="lab-text-data text-xs text-lab-text-secondary truncate max-w-[9rem]">{marketSize}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom: verdict + time */}
      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-lab-border-faint">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: cfg.color }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
          {cfg.label}
        </span>
        <span className="lab-text-data text-[10px] text-lab-text-tertiary shrink-0">{timeLabel}</span>
      </div>
    </>
  )

  const cls = `bg-lab-void-2 border border-lab-border-soft rounded-lab-md flex flex-col gap-3.5 p-5 ${
    href ? 'hover:border-lab-border-strong hover:-translate-y-0.5 hover:shadow-lab-md transition-all duration-lab-base cursor-pointer' : ''
  }`

  if (href) return <Link href={href} className={cls} style={style}>{content}</Link>
  return <div className={cls} style={style}>{content}</div>
}
