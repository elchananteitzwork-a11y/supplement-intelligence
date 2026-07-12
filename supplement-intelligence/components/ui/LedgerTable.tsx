import type { ReactNode } from 'react'

export interface LedgerColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  hideOnMobile?: boolean
}

// Mono header row, no vertical rules, hover highlight — matches
// design-system.md's Data Table spec exactly. Column set is fully
// caller-provided; this component never assumes a fixed schema (so it
// can't be used to imply columns that don't exist in real data, e.g. an
// integrity hash that isn't actually stored).
export function LedgerTable<T extends { id: string }>({
  columns, rows, onRowClick,
}: { columns: LedgerColumn<T>[]; rows: T[]; onRowClick?: (row: T) => void }) {
  return (
    <div className="border border-black overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-container-low text-[10px] font-mono uppercase tracking-wider text-outline">
            {columns.map(c => (
              <th
                key={c.key}
                className={`px-4 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10">
          {rows.map(row => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'hover:bg-surface-container-low transition-colors cursor-pointer' : ''}
            >
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-sm text-outline py-10">No records yet.</p>
      )}
    </div>
  )
}
