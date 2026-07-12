import { WitnessDots } from './WitnessDots'

export interface ConcordanceRow {
  label: string
  value: string
  filled: number
  total: number
}

// A single signal row: name + value/trend + witness-dot confidence. Used
// standalone (ConcordanceRow) or stacked (ConcordanceStrip).
export function ConcordanceRowItem({ row }: { row: ConcordanceRow }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-black/10 last:border-b-0">
      <span className="text-sm text-ink font-medium">{row.label}</span>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs font-mono text-ink-variant">{row.value}</span>
        <WitnessDots filled={row.filled} total={row.total} size="sm" />
      </div>
    </div>
  )
}

export function ConcordanceStrip({ rows, className = '' }: { rows: ConcordanceRow[]; className?: string }) {
  return (
    <div className={`border border-black bg-white px-4 ${className}`}>
      {rows.map(r => <ConcordanceRowItem key={r.label} row={r} />)}
    </div>
  )
}
