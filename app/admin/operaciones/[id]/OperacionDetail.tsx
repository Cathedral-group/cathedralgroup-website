'use client'

import { useState } from 'react'
import TabResumen from './tabs/TabResumen'
import TabCompraVenta from './tabs/TabCompraVenta'
import TabHipoteca from './tabs/TabHipoteca'
import TabGastos from './tabs/TabGastos'
import TabCashFlow from './tabs/TabCashFlow'
import TabDocumentos from './tabs/TabDocumentos'

// Shared types
interface FlippingOp {
  id: string
  code: string
  name: string
  status: string
  address: string | null
  property_type: string | null
  surface_m2: number | null
  catastral_ref: string | null
  purchase_price: number | null
  purchase_date: string | null
  purchase_notary_cost: number | null
  purchase_registry_cost: number | null
  purchase_gestoria_cost: number | null
  itp_rate: number | null
  itp_amount: number | null
  reform_budget_estimated: number | null
  reform_start_date: string | null
  reform_end_date: string | null
  project_id: string | null
  sale_price: number | null
  sale_date: string | null
  sale_notary_cost: number | null
  sale_registry_cost: number | null
  sale_gestoria_cost: number | null
  agent_commission_pct: number | null
  agent_commission_amount: number | null
  plusvalia_amount: number | null
  is_tax_amount: number | null
  notes: string | null
  drive_folder_url: string | null
  [key: string]: unknown
}

interface Mortgage {
  id: string
  operation_id: string
  lender: string | null
  capital: number
  interest_rate: number
  tae: number | null
  term_months: number
  monthly_payment: number | null
  start_date: string | null
  tasacion_cost: number | null
  apertura_commission_pct: number | null
  apertura_commission_amount: number | null
  other_costs: number | null
  drive_contract_url: string | null
  [key: string]: unknown
}

interface OpCost {
  id: string
  operation_id: string
  type: string
  concept: string | null
  amount: number
  date: string | null
  notes: string | null
  [key: string]: unknown
}

interface Invoice {
  id: string
  number: string | null
  concept: string | null
  amount_total: number | null
  vat_amount: number | null
  issue_date: string | null
  supplier_nif: string | null
  doc_type: string
  original_filename: string | null
  drive_url: string | null
  [key: string]: unknown
}

interface Props {
  op: FlippingOp
  mortgages: Mortgage[]
  costs: OpCost[]
  invoices: Invoice[]
  projects: { id: string; code: string; name: string }[]
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  prospecto:  { label: 'Prospecto',   cls: 'bg-neutral-100 text-neutral-600' },
  comprada:   { label: 'Comprada',    cls: 'bg-blue-100 text-blue-700' },
  en_reforma: { label: 'En reforma',  cls: 'bg-amber-100 text-amber-700' },
  en_venta:   { label: 'En venta',    cls: 'bg-purple-100 text-purple-700' },
  vendida:    { label: 'Vendida',     cls: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',   cls: 'bg-red-100 text-red-700' },
}

const ALL_STATUSES = ['prospecto','comprada','en_reforma','en_venta','vendida','cancelada']

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'compraventa', label: 'Compra & Venta' },
  { key: 'hipoteca', label: 'Hipoteca' },
  { key: 'gastos', label: 'Reforma & Gastos' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'documentos', label: 'Documentos' },
]

export default function OperacionDetail({ op: initialOp, mortgages: initialMortgages, costs: initialCosts, invoices, projects }: Props) {
  const [op, setOp] = useState<FlippingOp>(initialOp)
  const [mortgages, setMortgages] = useState<Mortgage[]>(initialMortgages)
  const [costs, setCosts] = useState<OpCost[]>(initialCosts)
  const [tab, setTab] = useState<string>('resumen')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const st = STATUS_MAP[op.status] ?? STATUS_MAP.prospecto

  const changeStatus = async (newStatus: string) => {
    setSavingStatus(true)
    try {
      const res = await fetch('/api/db/flipping-operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: op.id, status: newStatus }),
      })
      if (res.ok) {
        setOp(prev => ({ ...prev, status: newStatus }))
        setEditingStatus(false)
      }
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <a href="/admin/operaciones" className="text-xs text-neutral-400 hover:text-neutral-600 mb-2 inline-block">
          ← Operaciones
        </a>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">{op.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm font-mono text-neutral-400">{op.code}</span>
              {op.address && <span className="text-sm text-neutral-500">{op.address}</span>}
              {op.surface_m2 && <span className="text-sm text-neutral-500">{op.surface_m2} m²</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select
                  defaultValue={op.status}
                  onChange={e => changeStatus(e.target.value)}
                  disabled={savingStatus}
                  className="border rounded px-2 py-1 text-sm"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_MAP[s].label}</option>
                  ))}
                </select>
                <button onClick={() => setEditingStatus(false)} className="text-xs text-neutral-400 hover:text-neutral-600">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase cursor-pointer ${st.cls}`}
              >
                {st.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'resumen' && (
        <TabResumen op={op} mortgages={mortgages} costs={costs} invoices={invoices} />
      )}
      {tab === 'compraventa' && (
        <TabCompraVenta
          op={op}
          onUpdate={(updated) => setOp(prev => ({ ...prev, ...updated }))}
        />
      )}
      {tab === 'hipoteca' && (
        <TabHipoteca
          operationId={op.id}
          mortgages={mortgages}
          onUpdate={setMortgages}
        />
      )}
      {tab === 'gastos' && (
        <TabGastos
          operationId={op.id}
          reformBudget={op.reform_budget_estimated}
          costs={costs}
          invoices={invoices}
          onCostsUpdate={setCosts}
        />
      )}
      {tab === 'cashflow' && (
        <TabCashFlow op={op} mortgages={mortgages} costs={costs} invoices={invoices} />
      )}
      {tab === 'documentos' && (
        <TabDocumentos
          op={op}
          mortgages={mortgages}
          invoices={invoices}
          onOpUpdate={(updated) => setOp(prev => ({ ...prev, ...updated }))}
        />
      )}
    </div>
  )
}
