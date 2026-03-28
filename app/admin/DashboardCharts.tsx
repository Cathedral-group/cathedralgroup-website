'use client'

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
  Legend
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

interface Props {
  monthlyData: MonthlyData[]
  invoiceStatus: StatusData[]
  leadSources: SourceData[]
}

const COLORS = ['#B4A898', '#5A5550', '#9A8D7C', '#D9D0C7', '#7A6F64', '#E8E6E3']

function formatEUR(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k€`
  return `${value.toFixed(0)}€`
}

export default function DashboardCharts({ monthlyData, invoiceStatus, leadSources }: Props) {
  const totalInvoices = invoiceStatus.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Revenue vs Expenses */}
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
              formatter={(value: any) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value))}
              contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }}
            />
            <Bar dataKey="ingresos" name="Ingresos" fill="#B4A898" radius={[2, 2, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill="#5A5550" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Margin Trend */}
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

      {/* Invoice Status Donut */}
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

      {/* Lead Sources */}
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
  )
}
