import Link from 'next/link'
import type { BuildDecision } from '@/types/index'
import { ScoreDial } from '@/components/ScoreDial'
import { ProductGlyphMini, inferProductShape } from '@/components/ProductGlyph'

const DECISION_CFG: Record<BuildDecision, { label: string; cls: string; color: string }> = {
  BUILD_NOW:        { label: 'Build Now',      cls: 'text-emerald-400', color: '#34d399' },
  VALIDATE_FURTHER: { label: 'Validate First', cls: 'text-amber-400',   color: '#fbbf24' },
  SKIP:             { label: 'Pass',           cls: 'text-red-400',     color: '#f87171' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation', cls: 'text-sky-400', color: '#38bdf8' },
}

interface OpportunityCardProps {
  href?:        string  // omit for rows with no backing memo (e.g. seeded leaderboard categories)
  rank?:        number
  gridIndex?:   number  // drives the stagger-in delay across a grid of cards
  categoryName: string
  score:        number
  decision:     BuildDecision
  format?:      string | null
  competitor?:  string | null
  marketSize?:  string | null
  timeLabel:    string
}

// Visual opportunity tile — replaces the dense blotter row on Dashboard and
// Leaderboard. A scannable field of cards (score ring, decision color, product
// form glyph) instead of a table you have to read column by column. Top-rated
// BUILD_NOW opportunities get a soft glow so the best bets visually pop out
// of the grid, the way a screener highlights its top names. Tiles tilt in
// perspective on hover and stagger in on mount, rather than appearing as a
// flat, all-at-once table.
export default function OpportunityCard({
  href, rank, gridIndex, categoryName, score, decision, format, competitor, marketSize, timeLabel,
}: OpportunityCardProps) {
  const cfg = DECISION_CFG[decision]
  const facts = ([
    ['Competitor', competitor], ['Market', marketSize],
  ] as [string, string | null | undefined][]).filter(([, v]) => v && v !== 'N/A')

  const glow = decision === 'BUILD_NOW' && score >= 75 ? 'shadow-[0_0_36px_rgba(52,211,153,.10)]' : ''
  const className = `card-premium ${href ? 'opportunity-tile group' : ''} flex flex-col gap-4 p-5 ${glow}`
  const style = {
    borderTopColor: `${cfg.color}2E`,
    borderTopWidth: 2,
    animation: 'riseIn .5s var(--ease-premium, ease) both',
    animationDelay: `${Math.min(typeof gridIndex === 'number' ? gridIndex : 0, 11) * 0.045}s`,
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {typeof rank === 'number' && (
            <span className="text-xs font-mono text-zinc-600 shrink-0">{String(rank).padStart(2, '0')}</span>
          )}
          {format && (
            <span className="w-9 h-9 rounded-full bg-brass/[0.07] border border-brass/[0.15] grid place-items-center shrink-0" title={format}>
              <ProductGlyphMini shape={inferProductShape(format)} className="w-4 h-[18px] text-brass/80" />
            </span>
          )}
        </div>
        <ScoreDial score={score} decision={decision} size={48} />
      </div>

      <h3 className="font-serif text-base font-medium leading-snug text-zinc-100 group-hover:text-white transition-colors line-clamp-2 -mt-1">
        {categoryName}
      </h3>

      {facts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {facts.map(([l, v]) => (
            <div key={l} className="leading-tight">
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{l}</p>
              <p className="text-xs text-zinc-300 font-mono truncate max-w-[10rem]">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-white/[0.06]">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
          {cfg.label}
        </span>
        <span className="text-[11px] text-zinc-600 font-mono shrink-0">{timeLabel}</span>
      </div>
    </>
  )

  if (href) {
    return <Link href={href} className={className} style={style}>{content}</Link>
  }
  return <div className={className} style={style}>{content}</div>
}
