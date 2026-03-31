'use client'

import { useState, useMemo } from 'react'

interface AuditEntry {
  id: string
  user_email: string
  action: string
  table_name: string
  record_id: string | null
  ip: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  login:            { label: 'Login',           cls: 'bg-neutral-100 text-neutral-600' },
  create:           { label: 'Crear',           cls: 'bg-green-100 text-green-700' },
  update:           { label: 'Editar',          cls: 'bg-blue-100 text-blue-700' },
  delete:           { label: 'Eliminar',        cls: 'bg-amber-100 text-amber-700' },
  restore:          { label: 'Restaurar',       cls: 'bg-purple-100 text-purple-700' },
  permanent_delete: { label: 'Borrar def.',     cls: 'bg-red-100 text-red-700' },
}

const TABLE_LABELS: Record<string, string> = {
  leads:               'Leads',
  clients:             'Clientes',
  suppliers:           'Proveedores',
  projects:            'Proyectos',
  invoices:            'Facturas',
  quotes:              'Presupuestos',
  flipping_operations: 'Operaciones',
  mortgages:           'Hipotecas',
  operation_costs:     'Gastos operación',
  project_phases:      'Fases',
  quality_coefficients:'Coeficientes',
  catalog_items:       'Catálogo',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AuditLogView({ logs }: { logs: AuditEntry[] }) {
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterTable, setFilterTable] = useState('')

  const users = useMemo(() => [...new Set(logs.map(l => l.user_email))].sort(), [logs])
  const ips = useMemo(() => [...new Set(logs.map(l => l.ip).filter(Boolean))], [logs])

  const filtered = useMemo(() => logs.filter(l => {
    if (filterUser   && l.user_email !== filterUser)  return false
    if (filterAction && l.action     !== filterAction) return false
    if (filterTable  && l.table_name !== filterTable)  return false
    return true
  }), [logs, filterUser, filterAction, filterTable])

  // Detect IPs with activity from multiple users (suspicious)
  const ipUserMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    logs.forEach(l => {
      if (!l.ip) return
      if (!m[l.ip]) m[l.ip] = new Set()
      m[l.ip].add(l.user_email)
    })
    return m
  }, [logs])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-neutral-500">Total acciones</p>
          <p className="text-2xl font-bold mt-1">{logs.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-neutral-500">Usuarios activos</p>
          <p className="text-2xl font-bold mt-1">{users.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-neutral-500">IPs distintas</p>
          <p className="text-2xl font-bold mt-1">{ips.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${logs.filter(l => l.action === 'permanent_delete').length > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <p className="text-xs text-neutral-500">Borrados definitivos</p>
          <p className={`text-2xl font-bold mt-1 ${logs.filter(l => l.action === 'permanent_delete').length > 0 ? 'text-red-700' : ''}`}>
            {logs.filter(l => l.action === 'permanent_delete').length}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {Object.entries(ipUserMap).filter(([, users]) => users.size > 1).map(([ip, ipUsers]) => (
        <div key={ip} className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <strong className="text-amber-800">Aviso:</strong>{' '}
          <span className="text-amber-700">
            La IP <code className="bg-amber-100 px-1 rounded">{ip}</code> ha sido usada por {ipUsers.size} usuarios distintos: {[...ipUsers].join(', ')}
          </span>
        </div>
      ))}

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700"
        >
          <option value="">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={filterTable}
          onChange={e => setFilterTable(e.target.value)}
          className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700"
        >
          <option value="">Todas las tablas</option>
          {[...new Set(logs.map(l => l.table_name))].sort().map(t => (
            <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>
          ))}
        </select>
        {(filterUser || filterAction || filterTable) && (
          <button
            onClick={() => { setFilterUser(''); setFilterAction(''); setFilterTable('') }}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-xs text-neutral-400 ml-auto self-center">{filtered.length} entradas</span>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b">
                <th className="text-left p-3 font-medium text-neutral-600">Fecha y hora</th>
                <th className="text-left p-3 font-medium text-neutral-600">Usuario</th>
                <th className="text-left p-3 font-medium text-neutral-600">Acción</th>
                <th className="text-left p-3 font-medium text-neutral-600">Tabla</th>
                <th className="text-left p-3 font-medium text-neutral-600">ID registro</th>
                <th className="text-left p-3 font-medium text-neutral-600">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-400">
                    No hay actividad registrada todavía.
                  </td>
                </tr>
              )}
              {filtered.map(entry => {
                const act = ACTION_LABELS[entry.action]
                return (
                  <tr key={entry.id} className="border-b hover:bg-neutral-50">
                    <td className="p-3 font-mono text-neutral-500 whitespace-nowrap">{fmtDate(entry.created_at)}</td>
                    <td className="p-3 text-neutral-700">{entry.user_email}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${act?.cls ?? 'bg-neutral-100 text-neutral-600'}`}>
                        {act?.label ?? entry.action}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-600">{TABLE_LABELS[entry.table_name] ?? entry.table_name}</td>
                    <td className="p-3 font-mono text-neutral-400 text-[10px]">{entry.record_id ? entry.record_id.slice(0, 8) + '…' : '--'}</td>
                    <td className="p-3 font-mono text-neutral-400">{entry.ip ?? '--'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
