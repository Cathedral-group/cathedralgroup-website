// lib/pricing.ts
// ─────────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA de la calculadora de presupuestos (/presupuesto).
// Aquí viven los NÚMEROS y la LÓGICA (pura, testeable). Los textos visibles
// (nombres de nivel, descriptores de materiales, nombres de extras, copys) viven
// en lib/translations.ts (namespace `calculator`) para que la web siga siendo i18n.
//
// Valores aprobados por David 14/06/2026 tras estudio de mercado (Madrid 2025-26).
// Detalle y fuentes: memory/cathedral-calculadora-estudio.md
//
// FASE 2 (pendiente): esta misma FORMA se servirá desde una tabla en BD editable
// desde el panel admin; computeEstimate() no cambia, solo el origen de los datos.
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
  { key: 'zoneStandard', multiplier: 1.0 }, // Las Rozas / Majadahonda / resto
]

/* ── Casilla opcional: edificio protegido/señorial (cascos Salamanca/Chamberí) ── */
export const PROTECTED_FACTOR = 1.3

/* ── Extras ──
   pricing: 'fixed' = € por proyecto | 'perM2' = €/m² × superficie.
   scope:   'all'   = siempre        | 'house' = solo en sección "vivienda unifamiliar". */
export type Extra = {
  key: string
  pricing: 'fixed' | 'perM2'
  min: number
  max: number
  scope: 'all' | 'house'
}

export const EXTRAS: Extra[] = [
  // Núcleo (siempre visible)
  { key: 'domotica', pricing: 'fixed', min: 3000, max: 30000, scope: 'all' },
  { key: 'cocina', pricing: 'fixed', min: 9000, max: 50000, scope: 'all' },
  { key: 'climatizacion', pricing: 'fixed', min: 4000, max: 20000, scope: 'all' },
  { key: 'iluminacion', pricing: 'fixed', min: 1500, max: 10000, scope: 'all' },
  { key: 'mobiliario', pricing: 'fixed', min: 8000, max: 40000, scope: 'all' },
  { key: 'ventanas', pricing: 'perM2', min: 300, max: 500, scope: 'all' },
  { key: 'sueloMadera', pricing: 'perM2', min: 80, max: 175, scope: 'all' },
  { key: 'spa', pricing: 'fixed', min: 2500, max: 12000, scope: 'all' },
  { key: 'wallbox', pricing: 'fixed', min: 950, max: 2200, scope: 'all' },
  // Condicionales (sección "vivienda unifamiliar / chalet", desplegable)
  { key: 'gimnasio', pricing: 'fixed', min: 20000, max: 60000, scope: 'house' },
  { key: 'cine', pricing: 'fixed', min: 30000, max: 50000, scope: 'house' },
  { key: 'piscina', pricing: 'fixed', min: 20000, max: 35000, scope: 'house' },
  { key: 'ascensor', pricing: 'fixed', min: 8000, max: 50000, scope: 'house' },
  { key: 'solar', pricing: 'fixed', min: 4000, max: 13000, scope: 'house' },
  { key: 'pergola', pricing: 'fixed', min: 3500, max: 20000, scope: 'house' },
  { key: 'fachada', pricing: 'perM2', min: 60, max: 150, scope: 'house' },
  { key: 'paisajismo', pricing: 'fixed', min: 3000, max: 10000, scope: 'house' },
]

/* ── Desglose por tipo de proyecto (etiquetas + % aproximados) ──
   Interiorismo y obra nueva no tienen "40% obra"; cada tipo lleva su reparto. */
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

export function computeEstimate(input: EstimateInput): EstimateResult {
  const { levelIdx, projectKey, zoneIdx, sqm, extraKeys, isProtected } = input

  const level = QUALITY_LEVELS[levelIdx] ?? QUALITY_LEVELS[1]
  const type = PROJECT_TYPES.find(p => p.key === projectKey) ?? PROJECT_TYPES[0]
  const zoneMult = (ZONES[zoneIdx] ?? ZONES[ZONES.length - 1]).multiplier
  const protectedMult = isProtected ? PROTECTED_FACTOR : 1

  // Base de obra: €/m² del nivel × superficie × factor del tipo × zona × protegido
  const baseMin = level.minM2 * sqm * type.factor * zoneMult * protectedMult
  const baseMax = level.maxM2 * sqm * type.factor * zoneMult * protectedMult

  // Extras: 'fixed' = € directo; 'perM2' = €/m² × superficie. Solo los seleccionados.
  let extrasMin = 0
  let extrasMax = 0
  for (const k of extraKeys) {
    const e = EXTRAS.find(x => x.key === k)
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
  const breakdown = breakdownFor(projectKey).map(b => ({
    key: b.key,
    pct: b.pct,
    min: Math.round(baseMin * (b.pct / 100)),
    max: Math.round(baseMax * (b.pct / 100)),
  }))

  return { totalMin, totalMax, breakdown }
}
