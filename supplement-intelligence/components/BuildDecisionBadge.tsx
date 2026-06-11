import type { Analysis } from '@/types/memo'

type Decision = Analysis['build_decision']

const CONFIG: Record<Decision, { label: string; className: string; dot: string }> = {
  BUILD_NOW: {
    label: '🟢 BUILD NOW',
    className: 'badge-build',
    dot: 'bg-emerald-400',
  },
  VALIDATE_FURTHER: {
    label: '🟡 VALIDATE FURTHER',
    className: 'badge-validate',
    dot: 'bg-amber-400',
  },
  SKIP: {
    label: '🔴 SKIP',
    className: 'badge-skip',
    dot: 'bg-red-400',
  },
}

export default function BuildDecisionBadge({
  decision,
  size = 'md',
}: {
  decision: Decision
  size?: 'sm' | 'md' | 'lg'
}) {
  const cfg = CONFIG[decision]
  const sizeClass =
    size === 'sm'
      ? 'text-xs px-2 py-0.5'
      : size === 'lg'
      ? 'text-base px-4 py-2'
      : 'text-sm px-3 py-1'

  return (
    <span
      className={`${cfg.className} ${sizeClass} inline-flex items-center gap-1.5 rounded-full font-semibold border`}
    >
      {cfg.label}
    </span>
  )
}

export function DecisionDot({ decision }: { decision: Decision }) {
  const cfg = CONFIG[decision]
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
}
