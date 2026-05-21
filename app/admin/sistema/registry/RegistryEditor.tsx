'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { invalidateRegistryCache } from '@/lib/use-registry'
import type { DocType, PromptTemplate, AiProvider } from '@/lib/registry'

type Tab = 'doc_types' | 'prompts' | 'providers'

export default function RegistryEditor({
  initialDocTypes,
  initialPrompts,
  initialProviders,
}: {
  initialDocTypes: DocType[]
  initialPrompts: PromptTemplate[]
  initialProviders: AiProvider[]
}) {
  const [tab, setTab] = useState<Tab>('doc_types')
  const [docTypes, setDocTypes] = useState(initialDocTypes)
  const [prompts, setPrompts] = useState(initialPrompts)
  const [providers, setProviders] = useState(initialProviders)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const router = useRouter()

  async function save(table: string, code: string, body: Record<string, unknown>) {
    const res = await fetch('/api/admin/registry/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, code, body }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown' }))
      alert(`Error: ${err.error || 'guardando'}`)
      return false
    }
    invalidateRegistryCache()
    startTransition(() => router.refresh())
    return true
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Sistema · Registry (SSOT)</h1>
      <p className="text-sm text-gray-600 mb-6">
        Catálogo central tipos documento + prompts IA + proveedores IA. Cambios aquí afectan
        workflow n8n + UI + libs server-side (caché 5min en clientes).
      </p>

      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 ${tab === 'doc_types' ? 'border-b-2 border-emerald-600 font-semibold' : 'text-gray-500'}`}
          onClick={() => { setTab('doc_types'); setSelected(null) }}
        >
          Doc Types ({docTypes.length})
        </button>
        <button
          className={`px-4 py-2 ${tab === 'prompts' ? 'border-b-2 border-emerald-600 font-semibold' : 'text-gray-500'}`}
          onClick={() => { setTab('prompts'); setSelected(null) }}
        >
          Prompts ({prompts.length})
        </button>
        <button
          className={`px-4 py-2 ${tab === 'providers' ? 'border-b-2 border-emerald-600 font-semibold' : 'text-gray-500'}`}
          onClick={() => { setTab('providers'); setSelected(null) }}
        >
          Providers ({providers.length})
        </button>
      </div>

      {tab === 'doc_types' && (
        <DocTypesTab
          items={docTypes}
          selected={selected}
          setSelected={setSelected}
          onChange={setDocTypes}
          save={save}
          busy={busy}
        />
      )}
      {tab === 'prompts' && (
        <PromptsTab
          items={prompts}
          selected={selected}
          setSelected={setSelected}
          onChange={setPrompts}
          save={save}
          busy={busy}
        />
      )}
      {tab === 'providers' && (
        <ProvidersTab
          items={providers}
          selected={selected}
          setSelected={setSelected}
          onChange={setProviders}
          save={save}
          busy={busy}
        />
      )}
    </div>
  )
}

type TabProps<T> = {
  items: T[]
  selected: string | null
  setSelected: (s: string | null) => void
  onChange: (items: T[]) => void
  save: (table: string, code: string, body: Record<string, unknown>) => Promise<boolean>
  busy: boolean
}

function DocTypesTab({ items, selected, setSelected, save, busy }: TabProps<DocType>) {
  const current = items.find((i) => i.code === selected) || null
  return (
    <div className="grid grid-cols-3 gap-6">
      <ul className="col-span-1 border rounded divide-y max-h-[70vh] overflow-y-auto">
        {items.map((it) => (
          <li key={it.code}>
            <button
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selected === it.code ? 'bg-emerald-50' : ''}`}
              onClick={() => setSelected(it.code)}
            >
              <div className="font-mono text-xs text-gray-500">{it.code}</div>
              <div className="text-sm">{it.display_name}</div>
              <div className="text-xs text-gray-400">→ {it.table_name} · {it.category || 'sin categoría'}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="col-span-2">
        {current ? <DocTypeEditor item={current} save={save} busy={busy} /> : <Hint text="Selecciona un tipo de documento para editar." />}
      </div>
    </div>
  )
}

function DocTypeEditor({ item, save, busy }: { item: DocType; save: TabProps<DocType>['save']; busy: boolean }) {
  const [draft, setDraft] = useState(item)
  const [aliasesText, setAliasesText] = useState((item.prompt_aliases || []).join(', '))
  const [subfolderText, setSubfolderText] = useState(JSON.stringify(item.drive_subfolder_map || {}, null, 2))
  const [schemaText, setSchemaText] = useState(JSON.stringify(item.schema_fields || {}, null, 2))

  async function handleSave() {
    let aliases: string[] = []
    try {
      aliases = aliasesText.split(',').map((s) => s.trim()).filter(Boolean)
    } catch { /* ignore */ }
    let subfolderMap: Record<string, string | null> = {}
    try { subfolderMap = JSON.parse(subfolderText) } catch { alert('drive_subfolder_map: JSON inválido'); return }
    let schemaFields: Record<string, unknown> = {}
    try { schemaFields = JSON.parse(schemaText) } catch { alert('schema_fields: JSON inválido'); return }

    const body = {
      display_name: draft.display_name,
      display_name_plural: draft.display_name_plural,
      table_name: draft.table_name,
      category: draft.category,
      prompt_aliases: aliases,
      vision_hints: draft.vision_hints,
      extraction_hints: draft.extraction_hints,
      schema_fields: schemaFields,
      drive_subfolder_map: subfolderMap,
      drive_admin_folder: draft.drive_admin_folder,
      drive_uploadable: draft.drive_uploadable,
      ui_icon: draft.ui_icon,
      ui_color: draft.ui_color,
      display_order: draft.display_order,
      enabled: draft.enabled,
    }
    await save('doc_types_registry', item.code, body)
  }

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{item.code}</h2>
        <button
          onClick={handleSave}
          disabled={busy}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <Field label="Display name" value={draft.display_name} onChange={(v) => setDraft({ ...draft, display_name: v })} />
      <Field label="Display name (plural)" value={draft.display_name_plural || ''} onChange={(v) => setDraft({ ...draft, display_name_plural: v })} />
      <Field label="Tabla BD destino" value={draft.table_name} onChange={(v) => setDraft({ ...draft, table_name: v })} />
      <Field label="Categoría" value={draft.category || ''} onChange={(v) => setDraft({ ...draft, category: v })} />
      <FieldTextarea label="Vision hints (OCR/Vision)" value={draft.vision_hints || ''} onChange={(v) => setDraft({ ...draft, vision_hints: v })} rows={3} />
      <FieldTextarea label="Extraction hints (LLM)" value={draft.extraction_hints || ''} onChange={(v) => setDraft({ ...draft, extraction_hints: v })} rows={3} />
      <FieldTextarea label="Aliases prompt (coma separados)" value={aliasesText} onChange={setAliasesText} rows={2} />
      <FieldTextarea label="schema_fields (JSON map columna → {source,type,required})" value={schemaText} onChange={setSchemaText} rows={6} mono />
      <FieldTextarea label="drive_subfolder_map (JSON OBR/CDU/OBN/PRO/FLP → subfolder)" value={subfolderText} onChange={setSubfolderText} rows={6} mono />
      <Field label="Drive admin folder (override)" value={draft.drive_admin_folder || ''} onChange={(v) => setDraft({ ...draft, drive_admin_folder: v })} placeholder="ADMINISTRACION/Laboral" />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.drive_uploadable} onChange={(e) => setDraft({ ...draft, drive_uploadable: e.target.checked })} />
          Subir a Drive
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          Habilitado
        </label>
      </div>
    </div>
  )
}

function PromptsTab({ items, selected, setSelected, save, busy }: TabProps<PromptTemplate>) {
  const current = items.find((i) => i.code === selected) || null
  return (
    <div className="grid grid-cols-3 gap-6">
      <ul className="col-span-1 border rounded divide-y max-h-[70vh] overflow-y-auto">
        {items.map((it) => (
          <li key={it.code}>
            <button className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selected === it.code ? 'bg-emerald-50' : ''}`} onClick={() => setSelected(it.code)}>
              <div className="font-mono text-xs text-gray-500">{it.code} · v{it.version}</div>
              <div className="text-sm">{it.display_name}</div>
              <div className="text-xs text-gray-400">{it.category}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="col-span-2">
        {current ? <PromptEditor item={current} save={save} busy={busy} /> : <Hint text="Selecciona un prompt para editar." />}
      </div>
    </div>
  )
}

function PromptEditor({ item, save, busy }: { item: PromptTemplate; save: TabProps<PromptTemplate>['save']; busy: boolean }) {
  const [draft, setDraft] = useState(item)
  const [varsText, setVarsText] = useState((item.variables || []).join(', '))

  async function handleSave() {
    const variables = varsText.split(',').map((s) => s.trim()).filter(Boolean)
    await save('prompt_templates', item.code, {
      display_name: draft.display_name,
      category: draft.category,
      content: draft.content,
      description: draft.description,
      variables,
      enabled: draft.enabled,
    })
  }

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{item.code} <span className="text-xs text-gray-500">v{item.version}</span></h2>
        <button onClick={handleSave} disabled={busy} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar (v' + (item.version + 1) + ')'}
        </button>
      </div>
      <Field label="Display name" value={draft.display_name} onChange={(v) => setDraft({ ...draft, display_name: v })} />
      <Field label="Categoría" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} placeholder="vision | extraction | classify" />
      <FieldTextarea label="Descripción" value={draft.description || ''} onChange={(v) => setDraft({ ...draft, description: v })} rows={2} />
      <FieldTextarea label="Content (placeholders: {{doc_types_list}}, {{today}}, {{empresa}}, ...)" value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} rows={20} mono />
      <FieldTextarea label="Variables soportadas (coma separadas)" value={varsText} onChange={setVarsText} rows={2} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
        Habilitado
      </label>
    </div>
  )
}

function ProvidersTab({ items, selected, setSelected, save, busy }: TabProps<AiProvider>) {
  const current = items.find((i) => i.code === selected) || null
  return (
    <div className="grid grid-cols-3 gap-6">
      <ul className="col-span-1 border rounded divide-y max-h-[70vh] overflow-y-auto">
        {items.map((it) => (
          <li key={it.code}>
            <button className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selected === it.code ? 'bg-emerald-50' : ''}`} onClick={() => setSelected(it.code)}>
              <div className="font-mono text-xs text-gray-500">{it.code}</div>
              <div className="text-sm">{it.display_name}</div>
              <div className="text-xs text-gray-400">{it.use_case} · prio {it.priority}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="col-span-2">
        {current ? <ProviderEditor item={current} save={save} busy={busy} /> : <Hint text="Selecciona un proveedor para editar." />}
      </div>
    </div>
  )
}

function ProviderEditor({ item, save, busy }: { item: AiProvider; save: TabProps<AiProvider>['save']; busy: boolean }) {
  const [draft, setDraft] = useState(item)
  async function handleSave() {
    await save('ai_providers_registry', item.code, {
      display_name: draft.display_name,
      family: draft.family,
      endpoint: draft.endpoint,
      model_id: draft.model_id,
      use_case: draft.use_case,
      priority: draft.priority,
      cost_per_1k_input: draft.cost_per_1k_input,
      cost_per_1k_output: draft.cost_per_1k_output,
      max_budget_per_call_usd: draft.max_budget_per_call_usd,
      rate_limit_rpm: draft.rate_limit_rpm,
      enabled: draft.enabled,
    })
  }
  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{item.code}</h2>
        <button onClick={handleSave} disabled={busy} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <Field label="Display name" value={draft.display_name} onChange={(v) => setDraft({ ...draft, display_name: v })} />
      <Field label="Family" value={draft.family} onChange={(v) => setDraft({ ...draft, family: v })} placeholder="gemini | gpt | mistral | claude" />
      <Field label="Endpoint" value={draft.endpoint || ''} onChange={(v) => setDraft({ ...draft, endpoint: v })} />
      <Field label="Model ID" value={draft.model_id || ''} onChange={(v) => setDraft({ ...draft, model_id: v })} />
      <Field label="Use case" value={draft.use_case} onChange={(v) => setDraft({ ...draft, use_case: v })} placeholder="extraction | vision | classify" />
      <FieldNum label="Priority (1=primary)" value={draft.priority} onChange={(v) => setDraft({ ...draft, priority: v })} />
      <FieldNum label="Cost per 1k input (USD)" value={draft.cost_per_1k_input || 0} onChange={(v) => setDraft({ ...draft, cost_per_1k_input: v })} step="0.000001" />
      <FieldNum label="Cost per 1k output (USD)" value={draft.cost_per_1k_output || 0} onChange={(v) => setDraft({ ...draft, cost_per_1k_output: v })} step="0.000001" />
      <FieldNum label="Max budget por call (USD)" value={draft.max_budget_per_call_usd} onChange={(v) => setDraft({ ...draft, max_budget_per_call_usd: v })} step="0.001" />
      <FieldNum label="Rate limit RPM" value={draft.rate_limit_rpm || 0} onChange={(v) => setDraft({ ...draft, rate_limit_rpm: v })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
        Habilitado
      </label>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function FieldTextarea({ label, value, onChange, rows = 3, mono = false }: { label: string; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <textarea className={`mt-1 w-full border rounded px-2 py-1 text-sm ${mono ? 'font-mono' : ''}`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function FieldNum({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <input type="number" step={step} className="mt-1 w-full border rounded px-2 py-1 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Hint({ text }: { text: string }) {
  return <div className="border rounded p-6 text-sm text-gray-500 text-center">{text}</div>
}
