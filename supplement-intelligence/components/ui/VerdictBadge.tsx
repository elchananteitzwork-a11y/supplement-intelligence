import type { BuildDecision } from '@/types/index'
import type { MarketVerdictCode, FounderVerdictCode } from '@/lib/stage4/verdict'

// The backend has THREE distinct verdict vocabularies — this badge must
// never hardcode one. `scheme` selects which enum `verdict` is read as.
type Scheme = 'build-decision' | 'market-verdict' | 'founder-fit'

const BUILD_DECISION_CFG: Record<BuildDecision, { label: string; cls: string }> = {
  BUILD_NOW:                   { label: 'Entry Supported',     cls: 'bg-verdict-positive text-white border-verdict-positive' },
  VALIDATE_FURTHER:            { label: 'Validation Required', cls: 'bg-verdict-caution text-black border-verdict-caution' },
  SKIP:                        { label: 'Not Supported',       cls: 'bg-verdict-negative text-white border-verdict-negative' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation',   cls: 'bg-verdict-neutral text-white border-verdict-neutral' },
}

const MARKET_VERDICT_CFG: Record<MarketVerdictCode, { label: string; cls: string }> = {
  PURSUE:               { label: 'Pursue',               cls: 'bg-verdict-positive text-white border-verdict-positive' },
  PURSUE_WITH_CAUTION:  { label: 'Pursue with Caution',  cls: 'bg-verdict-caution text-black border-verdict-caution' },
  INVESTIGATE_FURTHER:  { label: 'Investigate Further',  cls: 'bg-verdict-caution text-black border-verdict-caution' },
  DO_NOT_PURSUE:        { label: 'Do Not Pursue',        cls: 'bg-verdict-negative text-white border-verdict-negative' },
}

const FOUNDER_FIT_CFG: Record<FounderVerdictCode, { label: string; cls: string }> = {
  STRONG_FIT:      { label: 'Strong Fit',      cls: 'bg-verdict-positive text-white border-verdict-positive' },
  CONDITIONAL_FIT: { label: 'Conditional Fit', cls: 'bg-verdict-caution text-black border-verdict-caution' },
  MISALIGNED:      { label: 'Misaligned',      cls: 'bg-verdict-negative text-white border-verdict-negative' },
  NOT_READY:       { label: 'Not Ready',       cls: 'bg-verdict-negative text-white border-verdict-negative' },
}

type Props =
  | { scheme: 'build-decision'; verdict: BuildDecision; insufficientEvidence?: boolean; size?: 'sm' | 'md' }
  | { scheme: 'market-verdict'; verdict: MarketVerdictCode; insufficientEvidence?: boolean; size?: 'sm' | 'md' }
  | { scheme: 'founder-fit'; verdict: FounderVerdictCode; insufficientEvidence?: boolean; size?: 'sm' | 'md' }

export function VerdictBadge(props: Props) {
  const { scheme, verdict, insufficientEvidence, size = 'md' } = props
  const cfg = insufficientEvidence
    ? { label: 'Insufficient Data', cls: 'bg-white text-ink-variant border-black' }
    : scheme === 'build-decision'
      ? BUILD_DECISION_CFG[verdict as BuildDecision]
      : scheme === 'market-verdict'
        ? MARKET_VERDICT_CFG[verdict as MarketVerdictCode]
        : FOUNDER_FIT_CFG[verdict as FounderVerdictCode]

  const sizeCls = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-3 py-1.5'

  return (
    <span className={`inline-flex items-center font-black uppercase tracking-wide border font-sans ${sizeCls} ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
