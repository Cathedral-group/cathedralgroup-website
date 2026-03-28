'use client'

interface CashFlowBarProps {
  income: number
  expenses: number
}

function formatEur(val: number): string {
  return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export default function CashFlowBar({ income, expenses }: CashFlowBarProps) {
  const max = Math.max(income, expenses, 1)
  const net = income - expenses

  return (
    <div className="space-y-3">
      {/* Income bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Ingresos</span>
          <span className="text-sm font-medium text-green-600">{formatEur(income)}</span>
        </div>
        <div className="w-full bg-neutral-200 h-3">
          <div
            className="bg-green-500 h-3 transition-all duration-500 ease-out"
            style={{ width: `${(income / max) * 100}%` }}
          />
        </div>
      </div>

      {/* Expenses bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Gastos</span>
          <span className="text-sm font-medium text-red-600">{formatEur(expenses)}</span>
        </div>
        <div className="w-full bg-neutral-200 h-3">
          <div
            className="bg-red-500 h-3 transition-all duration-500 ease-out"
            style={{ width: `${(expenses / max) * 100}%` }}
          />
        </div>
      </div>

      {/* Net difference */}
      <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Neto</span>
        <span className={`text-sm font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {net >= 0 ? '+' : ''}{formatEur(net)}
        </span>
      </div>
    </div>
  )
}
