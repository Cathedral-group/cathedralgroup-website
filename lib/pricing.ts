// lib/pricing.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lógica de la calculadora de presupuestos (/presupuesto).
//
// Los NÚMEROS viven en la tabla `pricing_config` (BD), editable desde el panel.
// Estas constantes son el FALLBACK + la FORMA canónica: si la BD aún no está
// (migración sin aplicar) o falla, la calculadora usa exactamente estos valores.
// Los textos visibles (nombres, descriptores, copys) viven en lib/translations.ts.
//
// Valores aprobados por David 14/06/2026 (estudio Madrid 2025-26).
// Detalle y fuentes: memory/cathedral-calculadora-estudio.md
// ─────────────────────────────────────────────────────────────────────────────

/* ── Niveles de calidad (€/m², base = reforma integral en zona estándar) ── */
export type QualityLevel = {
  key: string
  minM2: number
  midM2: number
  maxM2: number
  isContact?: boolean // Excepcional: sin precio → vista de contacto a medida
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { key: 'economica', minM2: 600, midM2: 640, maxM2: 680 },
  { key: 'estandar', minM2: 680, midM2: 800, maxM2: 950 },
  { key: 'premium', minM2: 950, midM2: 1100, maxM2: 1250 },
  { key: 'altoStanding', minM2: 1250, midM2: 1575, maxM2: 1900 },
  { key: 'excepcional', minM2: 0, midM2: 0, maxM2: 0, isContact: true },
]

/* ── Tipos de proyecto (factor × sobre el €/m² del nivel) ── */
export type ProjectType = {
  key: string
  factor: number
  isCustom?: boolean // promoción: sin €/m² → vista de contacto a medida
}

export const PROJECT_TYPES: ProjectType[] = [
  { key: 'reformaIntegral', factor: 1.0 },
  { key: 'reformaParcial', factor: 1.25 },
  { key: 'interiorismo', factor: 0.4 },
  { key: 'cambioUso', factor: 1.3 },
  { key: 'obraNueva', factor: 1.75 },
  { key: 'promocion', factor: 0, isCustom: true },
]

/* ── Zonas (multiplicador por localización) ── */
export type Zone = { key: string; multiplier: number }

export const ZONES: Zone[] = [
  { key: 'zoneMoraleja', multiplier: 1.5 }, // La Moraleja / La Finca / Puerta de Hierro
  { key: 'zoneSalamanca', multiplier: 1.25 }, // Salamanca
  { key: 'zoneCentro', multiplier: 1.15 }, // Chamberí / Chamartín / Retiro
  { key: 'zonePozuelo', multiplier: 1.15 }, // Pozuelo / Aravaca
  { key: 'zoneLasRozas', multiplier: 1.05 }, // Las Rozas / Majadahonda / Boadilla
  { key: 'zoneStandard', multiplier: 1.0 }, // Madrid y alrededores (base)
]

/* ── Casilla opcional: edificio protegido/señorial (cascos Salamanca/Chamberí) ── */
export const PROTECTED_FACTOR = 1.3

/* ── Extras ──
   pricing: 'fixed' = € por proyecto | 'perM2' = €/m² × superficie.
   scope:   'all'   = siempre        | 'house' = solo en "vivienda unifamiliar".
   minLevel: gama mínima (key de QUALITY_LEVELS) desde la que aparece el extra.
   inInteriorismo: visible cuando el tipo de proyecto es interiorismo (solo deco). */
export type Extra = {
  key: string
  pricing: 'fixed' | 'perM2'
  min: number
  max: number
  scope: 'all' | 'house'
  minLevel: string
  inInteriorismo: boolean
}

export const EXTRAS: Extra[] = [
  { key: 'domotica', pricing: 'fixed', min: 3000, max: 30000, scope: 'all', minLevel: 'economica', inInteriorismo: true },
  { key: 'cocina', pricing: 'fixed', min: 9000, max: 50000, scope: 'all', minLevel: 'economica', inInteriorismo: true },
  { key: 'climatizacion', pricing: 'fixed', min: 4000, max: 20000, scope: 'all', minLevel: 'economica', inInteriorismo: true },
  { key: 'iluminacion', pricing: 'fixed', min: 1500, max: 10000, scope: 'all', minLevel: 'economica', inInteriorismo: true },
  { key: 'mobiliario', pricing: 'fixed', min: 8000, max: 40000, scope: 'all', minLevel: 'economica', inInteriorismo: true },
  { key: 'ventanas', pricing: 'perM2', min: 90, max: 120, scope: 'all', minLevel: 'economica', inInteriorismo: false }, // Cortizo: 600-800 €/m² ventana × ~15% hueco = €/m² vivienda
  { key: 'sueloMadera', pricing: 'perM2', min: 80, max: 175, scope: 'all', minLevel: 'economica', inInteriorismo: false },
  { key: 'wallbox', pricing: 'fixed', min: 950, max: 2200, scope: 'all', minLevel: 'economica', inInteriorismo: false },
  { key: 'spa', pricing: 'fixed', min: 2500, max: 12000, scope: 'all', minLevel: 'premium', inInteriorismo: false },
  // Solo en "vivienda unifamiliar / chalet"
  { key: 'piscina', pricing: 'fixed', min: 20000, max: 35000, scope: 'house', minLevel: 'economica', inInteriorismo: false },
  { key: 'ascensor', pricing: 'fixed', min: 8000, max: 50000, scope: 'house', minLevel: 'economica', inInteriorismo: false },
  { key: 'solar', pricing: 'fixed', min: 4000, max: 13000, scope: 'house', minLevel: 'economica', inInteriorismo: false },
  { key: 'pergola', pricing: 'fixed', min: 3500, max: 20000, scope: 'house', minLevel: 'economica', inInteriorismo: false },
  { key: 'fachada', pricing: 'perM2', min: 60, max: 150, scope: 'house', minLevel: 'economica', inInteriorismo: false },
  { key: 'gimnasio', pricing: 'fixed', min: 20000, max: 60000, scope: 'house', minLevel: 'premium', inInteriorismo: false },
  { key: 'cine', pricing: 'fixed', min: 30000, max: 50000, scope: 'house', minLevel: 'premium', inInteriorismo: false },
  { key: 'paisajismo', pricing: 'fixed', min: 3000, max: 10000, scope: 'house', minLevel: 'premium', inInteriorismo: false },
]

/* ── Config agregada: lo que sirve la BD (o, en su defecto, estas constantes) ── */
export type PricingConfig = {
  levels: QualityLevel[]
  projectTypes: ProjectType[]
  zones: Zone[]
  extras: Extra[]
  protectedFactor: number
}

export const DEFAULT_CONFIG: PricingConfig = {
  levels: QUALITY_LEVELS,
  projectTypes: PROJECT_TYPES,
  zones: ZONES,
  extras: EXTRAS,
  protectedFactor: PROTECTED_FACTOR,
}

/* ── Fila tal como llega de la tabla pricing_config (solo campos de cálculo) ── */
export type PricingRow = {
  category: string
  item_key: string
  sort_order?: number | null
  val_min?: number | null
  val_mid?: number | null
  val_max?: number | null
  val_factor?: number | null
  pricing?: string | null
  scope?: string | null
  min_level?: string | null
  in_interiorismo?: boolean | null
  is_contact?: boolean | null
  is_custom?: boolean | null
}

/** Construye la PricingConfig desde las filas de BD. Si faltan filas (o toda la
 *  tabla), cae a las constantes del código por categoría → la web nunca se rompe. */
export function buildConfigFromRows(rows: PricingRow[] | null | undefined): PricingConfig {
  if (!rows || rows.length === 0) return DEFAULT_CONFIG
  const byCat = (c: string) =>
    rows.filter((r) => r.category === c).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const levels = byCat('level').map((r) => ({
    key: r.item_key,
    minM2: Number(r.val_min ?? 0),
    midM2: Number(r.val_mid ?? 0),
    maxM2: Number(r.val_max ?? 0),
    ...(r.is_contact ? { isContact: true } : {}),
  }))
  const projectTypes = byCat('project_type').map((r) => ({
    key: r.item_key,
    factor: Number(r.val_factor ?? 0),
    ...(r.is_custom ? { isCustom: true } : {}),
  }))
  const zones = byCat('zone').map((r) => ({ key: r.item_key, multiplier: Number(r.val_factor ?? 1) }))
  const extras = byCat('extra').map((r) => ({
    key: r.item_key,
    pricing: (r.pricing === 'perM2' ? 'perM2' : 'fixed') as 'fixed' | 'perM2',
    min: Number(r.val_min ?? 0),
    max: Number(r.val_max ?? 0),
    scope: (r.scope === 'house' ? 'house' : 'all') as 'all' | 'house',
    minLevel: r.min_level ?? 'economica',
    inInteriorismo: !!r.in_interiorismo,
  }))
  const protectedRow = rows.find((r) => r.category === 'global' && r.item_key === 'protected')

  return {
    levels: levels.length ? levels : QUALITY_LEVELS,
    projectTypes: projectTypes.length ? projectTypes : PROJECT_TYPES,
    zones: zones.length ? zones : ZONES,
    extras: extras.length ? extras : EXTRAS,
    protectedFactor: Number(protectedRow?.val_factor ?? PROTECTED_FACTOR),
  }
}

/* ── Desglose por tipo de proyecto (etiquetas + % aproximados) ── */
export type BreakdownItem = { key: string; pct: number }

const BREAKDOWNS: Record<string, BreakdownItem[]> = {
  reformaIntegral: [
    { key: 'obraLabel', pct: 40 },
    { key: 'materialesLabel', pct: 30 },
    { key: 'disenoLabel', pct: 18 },
    { key: 'gestionLabel', pct: 12 },
  ],
  reformaParcial: [
    { key: 'obraLabel', pct: 42 },
    { key: 'materialesLabel', pct: 30 },
    { key: 'disenoLabel', pct: 16 },
    { key: 'gestionLabel', pct: 12 },
  ],
  interiorismo: [
    { key: 'disenoLabel', pct: 45 },
    { key: 'acabadosLabel', pct: 35 },
    { key: 'gestionLabel', pct: 20 },
  ],
  cambioUso: [
    { key: 'obraLabel', pct: 38 },
    { key: 'materialesLabel', pct: 27 },
    { key: 'licenciasLabel', pct: 20 },
    { key: 'gestionLabel', pct: 15 },
  ],
  obraNueva: [
    { key: 'estructuraLabel', pct: 50 },
    { key: 'materialesLabel', pct: 28 },
    { key: 'disenoLabel', pct: 12 },
    { key: 'gestionLabel', pct: 10 },
  ],
}

export function breakdownFor(projectKey: string): BreakdownItem[] {
  return BREAKDOWNS[projectKey] ?? BREAKDOWNS.reformaIntegral
}

/* ── Cálculo de la estimación (función pura) ── */
export type EstimateInput = {
  levelIdx: number
  projectKey: string
  zoneIdx: number
  sqm: number
  extraKeys: string[]
  isProtected?: boolean
}

export type EstimateResult = {
  totalMin: number
  totalMax: number
  breakdown: { key: string; min: number; max: number; pct: number }[]
}

export function computeEstimate(input: EstimateInput, config: PricingConfig = DEFAULT_CONFIG): EstimateResult {
  const { levelIdx, projectKey, zoneIdx, sqm, extraKeys, isProtected } = input

  const level = config.levels[levelIdx] ?? config.levels[1] ?? QUALITY_LEVELS[1]
  const type = config.projectTypes.find((p) => p.key === projectKey) ?? config.projectTypes[0] ?? PROJECT_TYPES[0]
  const zoneMult = (config.zones[zoneIdx] ?? config.zones[config.zones.length - 1])?.multiplier ?? 1
  const protectedMult = isProtected ? config.protectedFactor : 1

  // Base de obra: €/m² del nivel × superficie × factor del tipo × zona × protegido
  const baseMin = level.minM2 * sqm * type.factor * zoneMult * protectedMult
  const baseMax = level.maxM2 * sqm * type.factor * zoneMult * protectedMult

  // Extras: 'fixed' = € directo; 'perM2' = €/m² × superficie. Solo los seleccionados.
  let extrasMin = 0
  let extrasMax = 0
  for (const k of extraKeys) {
    const e = config.extras.find((x) => x.key === k)
    if (!e) continue
    if (e.pricing === 'perM2') {
      extrasMin += e.min * sqm
      extrasMax += e.max * sqm
    } else {
      extrasMin += e.min
      extrasMax += e.max
    }
  }

  const totalMin = Math.round(baseMin + extrasMin)
  const totalMax = Math.round(baseMax + extrasMax)

  // Desglose aplicado SOLO sobre la base de obra (los extras se muestran aparte).
  const breakdown = breakdownFor(projectKey).map((b) => ({
    key: b.key,
    pct: b.pct,
    min: Math.round(baseMin * (b.pct / 100)),
    max: Math.round(baseMax * (b.pct / 100)),
  }))

  return { totalMin, totalMax, breakdown }
}

/** Extras visibles según gama (nivel), ámbito (piso/casa) y tipo (interiorismo).
 *  rank() devuelve -1 si la gama mínima no existe → el extra queda OCULTO (seguro
 *  ante datos editados a mano con un minLevel inválido). */
export function visibleExtras(
  config: PricingConfig,
  opts: { levelIdx: number; projectKey: string; showHouse: boolean }
): Extra[] {
  const { levelIdx, projectKey, showHouse } = opts
  const rank = (levelKey: string) => config.levels.findIndex((l) => l.key === levelKey)
  return config.extras.filter((e) => {
    if (levelIdx < rank(e.minLevel)) return false
    if (e.scope === 'house' && !showHouse) return false
    if (projectKey === 'interiorismo' && !e.inInteriorismo) return false
    return true
  })
}
