'use client'

import { useState } from 'react'

interface FlippingOp {
  id: string
  drive_folder_url?: string | null
  [key: string]: unknown
}

interface Mortgage {
  id: string
  drive_contract_url?: string | null
  lender?: string | null
}

interface Invoice {
  id: string
  doc_type: string
  original_filename?: string | null
  drive_url?: string | null
  number?: string | null
  issue_date?: string | null
}

interface Props {
  op: FlippingOp
  mortgages: Mortgage[]
  invoices: Invoice[]
  onOpUpdate: (updated: Partial<FlippingOp>) => void
}

const DOC_TYPE_LABELS: Record<string, string> = {
  escritura: 'Escritura',
  contrato: 'Contrato',
  nota_simple: 'Nota simple',
  factura: 'Factura',
  otro: 'Otro',
}

export default function TabDocumentos({ op, mortgages, invoices, onOpUpdate }: Props) {
  const [editingFolder, setEditingFolder] = useState(false)
  const [folderUrl, setFolderUrl] = useState(op.drive_folder_url ?? '')
  const [saving, setSaving] = useState(false)

  const saveFolder = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/db/flipping-operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: op.id, drive_folder_url: folderUrl || null }),
      })
      if (res.ok) {
        onOpUpdate({ drive_folder_url: folderUrl || null })
        setEditingFolder(false)
      } else {
        alert('Error al guardar la carpeta. Inténtalo de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  const docInvoices = invoices.filter(i =>
    ['escritura','contrato','nota_simple','seguro'].includes(i.doc_type)
  )
  const otherInvoices = invoices.filter(i => !docInvoices.includes(i))

  return (
    <div className="space-y-6">
      {/* Drive folder */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Carpeta Google Drive</h3>
          <button onClick={() => setEditingFolder(!editingFolder)} className="text-xs text-primary hover:underline">
            {editingFolder ? 'Cancelar' : 'Editar'}
          </button>
        </div>
        {editingFolder ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={folderUrl}
              onChange={e => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={saveFolder}
              disabled={saving}
              className="bg-primary text-white px-4 py-2 rounded text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
        ) : op.drive_folder_url ? (
          <a
            href={op.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
          >
            <span>📁</span>
            Ver carpeta en Google Drive →
          </a>
        ) : (
          <p className="text-sm text-neutral-400">No hay carpeta Drive asignada. Pulsa &quot;Editar&quot; para añadir el enlace.</p>
        )}
      </div>

      {/* Mortgage contract */}
      {mortgages.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-bold mb-3">Contrato hipoteca</h3>
          {mortgages.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Hipoteca {m.lender ?? ''}</p>
                <p className="text-xs text-neutral-500">Contrato préstamo hipotecario</p>
              </div>
              {m.drive_contract_url ? (
                <a
                  href={m.drive_contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver PDF →
                </a>
              ) : (
                <span className="text-xs text-neutral-400">Sin documento</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document-type invoices (escrituras, contratos, etc.) */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold mb-3">Escrituras y contratos</h3>
        {docInvoices.length > 0 ? (
          <div className="divide-y">
            {docInvoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    {DOC_TYPE_LABELS[inv.doc_type] ?? inv.doc_type} {inv.number ? `· ${inv.number}` : ''}
                  </p>
                  <p className="text-xs text-neutral-500">{inv.original_filename ?? '--'} · {inv.issue_date ?? '--'}</p>
                </div>
                {inv.drive_url ? (
                  <a
                    href={inv.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Ver en Drive →
                  </a>
                ) : (
                  <span className="text-xs text-neutral-400">Sin archivo</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">
            Las escrituras y contratos vinculados a esta operación aparecerán aquí automáticamente cuando el workflow los clasifique y asigne la operación.
          </p>
        )}
      </div>

      {/* All other linked invoices */}
      {otherInvoices.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-bold mb-3">Facturas vinculadas ({otherInvoices.length})</h3>
          <div className="divide-y">
            {otherInvoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm">{inv.original_filename ?? inv.number ?? '--'}</p>
                  <p className="text-xs text-neutral-500">{inv.doc_type} · {inv.issue_date ?? '--'}</p>
                </div>
                {inv.drive_url && (
                  <a href={inv.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                    Ver →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
