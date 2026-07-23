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
//
// `variant="pi"` (added UIv2-M2 Phase 2, 2026-07-21) is an additive,
// opt-in restyle for the pi-* warm-cream report migration — default
// ('legacy') is byte-identical to before, so every existing consumer
// outside components/memo/* (app/research/history, app/watchlist) is
// unaffected. No column logic, sorting, or click behavior changes either
// way — visual only.
//
// `variant="pi-noir"` (Terminal Noir port, 2026-07-23): additive dark-stage
// restyle — app/watchlist passes this now. Same column/row logic as 'pi',
// only the surface tokens change (pi-stage/pi-elevated/pi-noir-hairline/
// pi-noir-sub). 'legacy'/'pi' consumers (app/research/history,
// components/memo/UnitEconomicsTable) fully unaffected.
export function LedgerTable<T extends { id: string }>({
  columns, rows, onRowClick, variant = 'legacy',
}: { columns: LedgerColumn<T>[]; rows: T[]; onRowClick?: (row: T) => void; variant?: 'legacy' | 'pi' | 'pi-noir' }) {
  if (variant === 'pi-noir') {
    return (
      <div className="rounded-xl border border-pi-noir-hairline overflow-x-auto bg-pi-stage">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-pi-elevated text-[10px] font-mono uppercase tracking-wider text-pi-noir-sub">
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
          <tbody className="divide-y divide-pi-noir-hairline">
            {rows.map(row => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'hover:bg-pi-elevated/60 transition-colors cursor-pointer' : ''}
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
          <p className="text-center text-sm text-pi-noir-sub py-10">No records yet.</p>
        )}
      </div>
    )
  }
  if (variant === 'pi') {
    return (
      <div className="rounded-xl border border-pi-hairline overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-pi-sand text-[10px] font-mono uppercase tracking-wider text-pi-faint">
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
          <tbody className="divide-y divide-pi-hairline">
            {rows.map(row => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'hover:bg-pi-sand/50 transition-colors cursor-pointer' : ''}
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
          <p className="text-center text-sm text-pi-faint py-10">No records yet.</p>
        )}
      </div>
    )
  }
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
