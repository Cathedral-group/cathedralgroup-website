'use client'

import { useState } from 'react'
import DataTable from './DataTable'
import { createClient } from '@/lib/supabase'

interface Field {
  name: string
  label: string
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'date'
  required?: boolean
  options?: string[]
}

interface Column {
  key: string
  label: string
}

interface AdminCrudPageProps {
  title: string
  table: string
  data: Record<string, unknown>[]
  columns: Column[]
  fields: Field[]
}

export default function AdminCrudPage({ title, table, data: initialData, columns, fields }: AdminCrudPageProps) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const openNew = () => {
    setFormData({})
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (row: Record<string, unknown>) => {
    const fd: Record<string, string> = {}
    fields.forEach((f) => {
      fd[f.name] = String(row[f.name] ?? '')
    })
    setFormData(fd)
    setEditingId(String(row.id))
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()

    const payload: Record<string, unknown> = {}
    fields.forEach((f) => {
      const val = formData[f.name]
      if (f.type === 'number' && val) {
        payload[f.name] = Number(val)
      } else {
        payload[f.name] = val || null
      }
    })

    if (editingId) {
      const { data: updated } = await supabase
        .from(table)
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()

      if (updated) {
        setData((prev) => prev.map((r) => (String(r.id) === editingId ? updated : r)))
      }
    } else {
      const { data: created } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single()

      if (created) {
        setData((prev) => [created, ...prev])
      }
    }

    setSaving(false)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">{title}</h1>
        <button
          onClick={openNew}
          className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
        >
          + Nuevo
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        onRowClick={openEdit}
      />

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md bg-white h-full overflow-y-auto p-8 pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-lg font-medium">
                {editingId ? 'Editar' : 'Nuevo'} {title.slice(0, -1)}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-900">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field.name}>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">
                    {field.label} {field.required && '*'}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.name] || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, [field.name]: e.target.value }))}
                      rows={3}
                      className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={formData[field.name] || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, [field.name]: e.target.value }))}
                      className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, [field.name]: e.target.value }))}
                      required={field.required}
                      className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50 mt-6"
              >
                {saving ? '...' : editingId ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
