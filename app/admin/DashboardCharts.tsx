'use client'

import {
  ComposedChart, Bar, Area, Cell,
  BarChart, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart,
  ReferenceLine, Legend
} from 'recharts'

interface MonthlyData {
  month: string
  ingresos: number
  gastos: number
  margen: number
}

interface StatusData {
  name: string
  value: number
  color: string
}

interface SourceData {
  name: string
  value: number
}

interface ProjectProfData {
  name: string
  ingresos: number
  gastos: number
  margen: number
}

interface EstructuraData {
  name: string
  value: number
}

interface Props {
  monthlyData: MonthlyData[]
  invoiceStatus: StatusData[]
  leadSources: SourceData[]
  projectProfitability: ProjectProfData[]
  estructuraData: EstructuraData[]
  estructuraYear: number
}

const COLORS = ['#B4A898', '#5A5550', '#9A8D7C', '#D9D0C7', '#7A6F64', '#E8E6E3']

function formatEUR(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k€`
  return `${value.toFixed(0)}€`
}

function formatEURFull(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

interface CashFlowTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
}

function CashFlowTooltip({ active, payload, label }: CashFlowTooltipProps) {
  if (!active || !payload?.length) return null
  const neto = payload.find((p) => p.dataKey === 'neto')
  const acum = payload.find((p) => p.dataKey === 'acumulado')
  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-bold text-neutral-700 mb-2">{label}</p>
      {neto && (
        <div className="flex justify-between gap-4">
          <span className="text-neutral-500">Neto mes</span>
          <span className={`font-mono font-bold ${Number(neto.value) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatEURFull(Number(neto.value))}
          </span>
        </div>
      )}
      {acum && (
        <div className="flex justify-between gap-4 mt-1">
          <span className="text-neutral-500">Acumulado</span>
          <span className={`font-mono font-bold ${Number(acum.value) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatEURFull(Number(acum.value))}
          </span>
        </div>
      )}
    </div>
  )
}

export default function DashboardCharts({ monthlyData, invoiceStatus, leadSources, projectProfitability, estructuraData, estructuraYear }: Props) {
  const totalInvoices = invoiceStatus.reduce((sum, s) => sum + s.value, 0)

  // Compute cumulative cash flow from monthly invoice data
  let acumulado = 0
  const cashFlowData = monthlyData.map(m => {
    const neto = m.ingresos - m.gastos
    acumulado += neto
    return { month: m.month, ingresos: m.ingresos, gastos: m.gastos, neto, acumulado }
  })

  const currentAcum = cashFlowData[cashFlowData.length - 1]?.acumulado ?? 0
  const mejorMes = cashFlowData.length > 0 ? Math.max(...cashFlowData.map(r => r.neto)) : 0
  const peorMes = cashFlowData.length > 0 ? Math.min(...cashFlowData.map(r => r.neto)) : 0
  const mesesPositivos = cashFlowData.filter(r => r.neto > 0).length

  return (
    <div className="space-y-6 mb-8">

      {/* ── CASH FLOW GENERAL — full width, primera gráfica ── */}
      <div className="bg-white border border-neutral-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Cash Flow General — últimos 12 meses
          </h3>
          <span className={`text-xs font-bold px-2 py-1 rounded ${currentAcum >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {currentAcum >= 0 ? '▲' : '▼'} {formatEURFull(currentAcum)} acumulado
          </span>
        </div>

        {/* KPI mini-cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-neutral-50 rounded p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Caja acumulada</p>
            <p className={`text-lg font-bold mt-0.5 ${currentAcum >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatEURFull(currentAcum)}
            </p>
          </div>
          <div className="bg-neutral-50 rounded p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Mejor mes</p>
            <p className="text-lg font-bold mt-0.5 text-green-700">{formatEURFull(mejorMes)}</p>
          </div>
          <div className="bg-neutral-50 rounded p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Peor mes</p>
            <p className={`text-lg font-bold mt-0.5 ${peorMes >= 0 ? 'text-neutral-700' : 'text-red-600'}`}>
              {formatEURFull(peorMes)}
            </p>
          </div>
          <div className="bg-neutral-50 rounded p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Meses positivos</p>
            <p className="text-lg font-bold mt-0.5 text-neutral-800">
              {mesesPositivos} <span className="text-sm font-normal text-neutral-400">/ {cashFlowData.length}</span>
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={cashFlowData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="gradCashFlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={formatEUR}
              tick={{ fontSize: 10, fill: '#999' }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CashFlowTooltip />} />
            <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} />
            {/* Neto mensual — barras verdes/rojas */}
            <Bar dataKey="neto" name="Neto mes" maxBarSize={28} radius={[2, 2, 0, 0]}>
              {cashFlowData.map((row, i) => (
                <Cell key={i} fill={row.neto >= 0 ? '#10B981' : '#EF4444'} fillOpacity={0.7} />
              ))}
            </Bar>
            {/* Acumulado — área + línea */}
            <Area
              type="monotone"
              dataKey="acumulado"
              name="Acumulado"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fill="url(#gradCashFlow)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#3B82F6' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── 2-column grid: charts existentes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingresos vs Gastos */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Ingresos vs Gastos (12 meses)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} />
              <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={formatEUR} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => formatEURFull(Number(value))}
                contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }}
              />
              <Bar dataKey="ingresos" name="Ingresos" fill="#B4A898" radius={[2, 2, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#5A5550" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tendencia Margen */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Tendencia Margen (%)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} />
              <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }}
              />
              <Area
                type="monotone"
                dataKey="margen"
                name="Margen"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Estado Facturas */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Estado Facturas
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={invoiceStatus}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label
              >
                {invoiceStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }} />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-lg font-medium fill-neutral-700">
                {totalInvoices}
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Origen Leads */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Origen Leads
          </h3>
          {leadSources.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-neutral-300 text-sm">
              Sin datos de leads aún
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={leadSources}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label
                >
                  {leadSources.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 2-column: Rentabilidad por Proyecto + Gastos de Estructura ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Rentabilidad por proyecto */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Rentabilidad por Proyecto
          </h3>
          {projectProfitability.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-neutral-300 text-sm">
              Sin facturas vinculadas a proyectos en este periodo
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, projectProfitability.length * 56)}>
              <BarChart
                data={projectProfitability}
                layout="vertical"
                margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#999' }} tickFormatter={formatEUR} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#555' }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                  tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null
                    const ingresos = payload.find((p: {dataKey:string}) => p.dataKey === 'ingresos')?.value ?? 0
                    const gastos = payload.find((p: {dataKey:string}) => p.dataKey === 'gastos')?.value ?? 0
                    const margen = ingresos - gastos
                    const pct = ingresos > 0 ? ((margen / ingresos) * 100).toFixed(1) : '—'
                    return (
                      <div className="bg-white border border-neutral-200 rounded shadow-lg p-3 text-xs min-w-[180px]">
                        <p className="font-bold text-neutral-700 mb-2 truncate">{label}</p>
                        <div className="flex justify-between gap-4"><span className="text-neutral-500">Ingresos</span><span className="font-mono font-bold text-neutral-800">{formatEURFull(ingresos)}</span></div>
                        <div className="flex justify-between gap-4 mt-1"><span className="text-neutral-500">Gastos</span><span className="font-mono font-bold text-neutral-800">{formatEURFull(gastos)}</span></div>
                        <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-neutral-100"><span className="text-neutral-500">Margen</span><span className={`font-mono font-bold ${margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatEURFull(margen)} ({pct}%)</span></div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="#B4A898" radius={[0, 2, 2, 0]} maxBarSize={18}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {projectProfitability.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.margen >= 0 ? '#B4A898' : '#D9A5A5'} />
                  ))}
                </Bar>
                <Bar dataKey="gastos" name="Gastos" fill="#5A5550" radius={[0, 2, 2, 0]} maxBarSize={18} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gastos de estructura por línea */}
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            Costes Fijos de Estructura — {estructuraYear}
          </h3>
          {estructuraData.length === 0 ? (
            <div className="h-[260px] flex flex-col items-center justify-center text-neutral-300 text-sm gap-2">
              <span>Sin datos de estructura en {estructuraYear}</span>
              <span className="text-xs text-neutral-200">Marca facturas como &ldquo;Gasto general de estructura&rdquo; para verlas aquí</span>
            </div>
          ) : (
            (() => {
              const totalEstructura = estructuraData.reduce((s, d) => s + d.value, 0)
              return (
                <>
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-xs text-neutral-400">Total anual</span>
                    <span className="text-base font-bold text-neutral-800">{formatEURFull(totalEstructura)}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(220, estructuraData.length * 38)}>
                    <BarChart
                      data={estructuraData}
                      layout="vertical"
                      margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#999' }} tickFormatter={formatEUR} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#555' }}
                        axisLine={false}
                        tickLine={false}
                        width={120}
                      />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => {
                          const pct = totalEstructura > 0 ? ((Number(value) / totalEstructura) * 100).toFixed(1) : '0'
                          return [`${formatEURFull(Number(value))} (${pct}%)`, 'Gasto anual']
                        }}
                        contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }}
                      />
                      <Bar dataKey="value" name="Gasto anual" fill="#9A8D7C" radius={[0, 2, 2, 0]} maxBarSize={20}>
                        {estructuraData.map((_: EstructuraData, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )
            })()
          )}
        </div>

      </div>
    </div>
  )
}
