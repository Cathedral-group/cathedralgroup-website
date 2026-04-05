'use client'

interface Column {
  key: string
  label: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface DataTableProps {
  columns: Column[]
  data: Record<string, unknown>[]
  onRowClick?: (row: Record<string, unknown>) => void
  onHeaderClick?: (key: string) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}

export default function DataTable({ columns, data, onRowClick, onHeaderClick, sortKey, sortDir }: DataTableProps) {
  return (
    <div className="bg-white border border-neutral-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={onHeaderClick ? () => onHeaderClick(col.key) : undefined}
                  className={`text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    onHeaderClick
                      ? `cursor-pointer select-none ${sortKey === col.key ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'}`
                      : 'text-neutral-400'
                  }`}
                >
                  {col.label}
                  {onHeaderClick && (
                    <span className="ml-1">
                      {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-sm text-neutral-400">
                  Sin datos
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={String(row.id || i)}
                  onClick={() => onRowClick?.(row)}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''} transition-colors`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-6 py-4 text-sm">
                      {col.render
                        ? col.render(row[col.key], row)
                        : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
