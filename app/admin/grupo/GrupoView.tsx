'use client'

import { useState, useEffect, useCallback } from 'react'

type Company = {
  id: string
  cif: string
  razon_social: string
  nombre_comercial: string | null
  parent_company_id: string | null
  participation_pct: number | null
  consolidation_method: string | null
  sii_obligado: boolean
  verifactu_obligado: boolean
  audit_obligada: boolean
  status: string
  fecha_constitucion: string | null
  capital_social: number | null
  codigo_cnae: string | null
  ccc_principal: string | null
  user_role: string | null
}

type Member = {
  id: string
  user_id: string
  email: string | null
  role: string
  granted_at: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  contable: 'Contable / gestoría',
  rh: 'Recursos Humanos',
  dpo: 'DPO (Protección Datos)',
  lectura: 'Solo lectura',
  operario: 'Operario',
}

const ROLE_BADGES: Record<string, string> = {
  owner: 'bg-primary/10 text-primary',
  admin: 'bg-blue-100 text-blue-800',
  contable: 'bg-green-100 text-green-800',
  rh: 'bg-purple-100 text-purple-800',
  dpo: 'bg-amber-100 text-amber-800',
  lectura: 'bg-neutral-100 text-neutral-700',
  operario: 'bg-neutral-100 text-neutral-700',
}

export default function GrupoView() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form crear SL
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    cif: '',
    razon_social: '',
    nombre_comercial: '',
    parent_company_id: '',
    participation_pct: '',
    fecha_constitucion: '',
    capital_social: '',
    codigo_cnae: '',
    ccc_principal: '',
    sii_obligado: false,
    verifactu_obligado: true,
    audit_obligada: false,
  })

  // Detalle de empresa seleccionada
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberForm, setAddMemberForm] = useState({ email: '', role: 'lectura' })
  const [addingMember, setAddingMember] = useState(false)

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/companies', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setCompanies(json.companies ?? [])
      setActiveCompanyId(json.active_company_id ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMembers = useCallback(async (companyId: string) => {
    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/members`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setMembers(json.members ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    if (selectedCompany) loadMembers(selectedCompany.id)
  }, [selectedCompany, loadMembers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        cif: createForm.cif.toUpperCase().trim(),
        razon_social: createForm.razon_social.trim(),
      }
      if (createForm.nombre_comercial) payload.nombre_comercial = createForm.nombre_comercial.trim()
      if (createForm.parent_company_id) payload.parent_company_id = createForm.parent_company_id
      if (createForm.participation_pct) payload.participation_pct = parseFloat(createForm.participation_pct)
      if (createForm.fecha_constitucion) payload.fecha_constitucion = createForm.fecha_constitucion
      if (createForm.capital_social) payload.capital_social = parseFloat(createForm.capital_social)
      if (createForm.codigo_cnae) payload.codigo_cnae = createForm.codigo_cnae.trim()
      if (createForm.ccc_principal) payload.ccc_principal = createForm.ccc_principal.trim()
      payload.sii_obligado = createForm.sii_obligado
      payload.verifactu_obligado = createForm.verifactu_obligado
      payload.audit_obligada = createForm.audit_obligada

      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setShowCreate(false)
      setCreateForm({
        cif: '', razon_social: '', nombre_comercial: '', parent_company_id: '',
        participation_pct: '', fecha_constitucion: '', capital_social: '',
        codigo_cnae: '', ccc_principal: '', sii_obligado: false,
        verifactu_obligado: true, audit_obligada: false,
      })
      await loadCompanies()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompany) return
    setAddingMember(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/companies/${selectedCompany.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addMemberForm.email.trim().toLowerCase(),
          role: addMemberForm.role,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setAddMemberOpen(false)
      setAddMemberForm({ email: '', role: 'lectura' })
      await loadMembers(selectedCompany.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAddingMember(false)
    }
  }

  const handleRevokeMember = async (memberId: string) => {
    if (!selectedCompany) return
    if (!confirm('¿Revocar este miembro? Tendrá que ser readded para volver a tener acceso.')) return
    try {
      const res = await fetch(
        `/api/admin/companies/${selectedCompany.id}/members?member_id=${memberId}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      await loadMembers(selectedCompany.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-neutral-500">Cargando empresas del grupo…</div>
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">🏛️ Grupo Cathedral</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Empresas del grupo a las que tienes acceso. Cada SL es contribuyente AEAT independiente
            con sus propios libros, modelos fiscales y certificado FNMT.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-[#5A5550] transition-colors"
        >
          + Nueva SL del grupo
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Lista de empresas */}
      <div className="bg-white border border-neutral-100 rounded">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-100">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Razón social</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">CIF</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tu rol</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Obligaciones</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const isActive = c.id === activeCompanyId
              return (
                <tr
                  key={c.id}
                  className={`border-b border-neutral-50 hover:bg-neutral-50 ${isActive ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-4 py-3 text-sm">
                    <div className="font-semibold text-neutral-800">{c.razon_social}</div>
                    {c.nombre_comercial && (
                      <div className="text-xs text-neutral-500">{c.nombre_comercial}</div>
                    )}
                    {isActive && (
                      <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest text-primary">
                        ● Activa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{c.cif}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.user_role && (
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${ROLE_BADGES[c.user_role] ?? 'bg-neutral-100 text-neutral-700'}`}>
                        {ROLE_LABELS[c.user_role] ?? c.user_role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    <div className="flex gap-1.5 flex-wrap">
                      {c.sii_obligado && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">SII</span>}
                      {c.verifactu_obligado && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Verifactu</span>}
                      {c.audit_obligada && <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">Auditoría</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-0.5 rounded ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => setSelectedCompany(c)}
                      className="text-primary text-xs font-semibold hover:underline"
                    >
                      Ver detalles →
                    </button>
                  </td>
                </tr>
              )
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-400">
                  No tienes acceso a ninguna empresa del grupo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mt-4">
        💡 La <strong>empresa activa</strong> determina qué datos ves en el panel. En esta fase Bloque 0
        F3 minimal, todas las queries siguen yendo contra Cathedral House Investment SL por DEFAULT.
        El selector de empresa activa se conecta en F3 completo.
      </p>

      {/* Form crear SL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-xl bg-white shadow-xl overflow-y-auto">
            <form onSubmit={handleCreate} className="p-6">
              <h2 className="text-lg font-bold mb-4">+ Nueva SL del grupo</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">CIF *</label>
                  <input
                    type="text"
                    required
                    value={createForm.cif}
                    onChange={(e) => setCreateForm({ ...createForm, cif: e.target.value })}
                    placeholder="B12345678"
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Capital social</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.capital_social}
                    onChange={(e) => setCreateForm({ ...createForm, capital_social: e.target.value })}
                    placeholder="3000.00"
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Razón social *</label>
                <input
                  type="text"
                  required
                  value={createForm.razon_social}
                  onChange={(e) => setCreateForm({ ...createForm, razon_social: e.target.value })}
                  placeholder="Cathedral Reformas SL"
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                />
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Nombre comercial</label>
                <input
                  type="text"
                  value={createForm.nombre_comercial}
                  onChange={(e) => setCreateForm({ ...createForm, nombre_comercial: e.target.value })}
                  placeholder="Cathedral Reformas"
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Parent company</label>
                  <select
                    value={createForm.parent_company_id}
                    onChange={(e) => setCreateForm({ ...createForm, parent_company_id: e.target.value })}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  >
                    <option value="">— Sin parent (independiente)</option>
                    {companies.filter((c) => ['owner', 'admin'].includes(c.user_role ?? '')).map((c) => (
                      <option key={c.id} value={c.id}>{c.razon_social}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">% participación</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={createForm.participation_pct}
                    onChange={(e) => setCreateForm({ ...createForm, participation_pct: e.target.value })}
                    placeholder="100.00"
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Fecha constitución</label>
                  <input
                    type="date"
                    value={createForm.fecha_constitucion}
                    onChange={(e) => setCreateForm({ ...createForm, fecha_constitucion: e.target.value })}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Código CNAE</label>
                  <input
                    type="text"
                    value={createForm.codigo_cnae}
                    onChange={(e) => setCreateForm({ ...createForm, codigo_cnae: e.target.value })}
                    placeholder="4120"
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">CCC principal SS</label>
                <input
                  type="text"
                  value={createForm.ccc_principal}
                  onChange={(e) => setCreateForm({ ...createForm, ccc_principal: e.target.value })}
                  placeholder="28/1234567-89"
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm font-mono"
                />
              </div>

              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.verifactu_obligado}
                    onChange={(e) => setCreateForm({ ...createForm, verifactu_obligado: e.target.checked })}
                    className="rounded"
                  />
                  Verifactu obligado (RD 1007/2023, sociedades 1/1/2027)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.sii_obligado}
                    onChange={(e) => setCreateForm({ ...createForm, sii_obligado: e.target.checked })}
                    className="rounded"
                  />
                  SII obligado (vol.op. &gt;6.010.121,04 €)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.audit_obligada}
                    onChange={(e) => setCreateForm({ ...createForm, audit_obligada: e.target.checked })}
                    className="rounded"
                  />
                  Auditoría obligada (art. 263 LSC)
                </label>
              </div>

              <div className="mt-6 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-[#5A5550] transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creando…' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detalle empresa + miembros */}
      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedCompany(null)} />
          <div className="relative w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">{selectedCompany.razon_social}</h2>
                  <p className="text-xs text-neutral-500 font-mono">{selectedCompany.cif}</p>
                </div>
                <button
                  onClick={() => setSelectedCompany(null)}
                  className="text-neutral-400 hover:text-neutral-700 text-xl"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Status</p>
                  <p>{selectedCompany.status}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tu rol</p>
                  <p>{ROLE_LABELS[selectedCompany.user_role ?? ''] ?? '—'}</p>
                </div>
                {selectedCompany.fecha_constitucion && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fundación</p>
                    <p>{new Date(selectedCompany.fecha_constitucion).toLocaleDateString('es-ES')}</p>
                  </div>
                )}
                {selectedCompany.capital_social && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Capital social</p>
                    <p>{selectedCompany.capital_social.toLocaleString('es-ES')} €</p>
                  </div>
                )}
                {selectedCompany.codigo_cnae && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">CNAE</p>
                    <p>{selectedCompany.codigo_cnae}</p>
                  </div>
                )}
                {selectedCompany.ccc_principal && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">CCC SS</p>
                    <p className="font-mono text-xs">{selectedCompany.ccc_principal}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-neutral-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">Miembros</h3>
                  {['owner', 'admin'].includes(selectedCompany.user_role ?? '') && (
                    <button
                      onClick={() => setAddMemberOpen(!addMemberOpen)}
                      className="text-primary text-xs font-semibold hover:underline"
                    >
                      {addMemberOpen ? '× Cancelar' : '+ Añadir miembro'}
                    </button>
                  )}
                </div>

                {addMemberOpen && (
                  <form onSubmit={handleAddMember} className="bg-neutral-50 p-4 rounded mb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Email</label>
                        <input
                          type="email"
                          required
                          value={addMemberForm.email}
                          onChange={(e) => setAddMemberForm({ ...addMemberForm, email: e.target.value })}
                          className="w-full bg-white border border-neutral-200 p-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Rol</label>
                        <select
                          value={addMemberForm.role}
                          onChange={(e) => setAddMemberForm({ ...addMemberForm, role: e.target.value })}
                          className="w-full bg-white border border-neutral-200 p-2 text-sm"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={addingMember}
                      className="mt-3 bg-primary text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50"
                    >
                      {addingMember ? 'Añadiendo…' : 'Añadir'}
                    </button>
                  </form>
                )}

                {loadingMembers ? (
                  <p className="text-xs text-neutral-500">Cargando…</p>
                ) : (
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-2 border-b border-neutral-50 text-sm">
                        <div>
                          <p className="font-semibold">{m.email ?? m.user_id.slice(0, 8) + '…'}</p>
                          <p className="text-[10px] text-neutral-400">desde {new Date(m.granted_at).toLocaleDateString('es-ES')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${ROLE_BADGES[m.role] ?? ''}`}>
                            {ROLE_LABELS[m.role] ?? m.role}
                          </span>
                          {['owner', 'admin'].includes(selectedCompany.user_role ?? '') && (
                            <button
                              onClick={() => handleRevokeMember(m.id)}
                              className="text-red-500 text-xs hover:underline"
                            >
                              Revocar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && (
                      <p className="text-xs text-neutral-400">Sin miembros activos.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
