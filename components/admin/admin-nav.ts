/**
 * admin-nav — fuente única del mapa de navegación de dos niveles del panel.
 *
 * Nivel 1: ZONES (barra superior). Nivel 2: items de cada zona (rail contextual).
 * "Sistema" NO es zona → SISTEMA_ITEMS (detrás del engranaje).
 *
 * Sin hooks ni JSX: es data + funciones puras, consumible por client components.
 * Los doc_types del registry se inyectan en runtime (no aquí).
 */

export type ZoneKey =
  | 'inicio'
  | 'comercial'
  | 'obra'
  | 'inmuebles'
  | 'documentos'
  | 'equipo'
  | 'finanzas'

export interface NavLeaf {
  label: string
  href: string
  /** key del contador para getBadge() en el rail (opcional) */
  badgeKey?:
    | 'revision'        // /admin/revision (amber)
    | 'orphans'         // Revisión IA huérfanos (red)
    | 'errors'          // facturas con error
    | 'absences_pending'
    | 'tickets_pending'
    | 'expenses_pending'
    | 'partes_anomalia'
  /** item reservado / no navegable (pinta "Próximamente", no es <Link>) */
  disabled?: boolean
  /** encabezado de grupo dentro del rail (no navegable) */
  header?: boolean
}

export interface Zone {
  key: ZoneKey
  label: string
  /** destino por defecto al clicar la zona en la barra superior */
  href: string
  /** rutas (prefijo) que activan esta zona */
  matchPrefixes: string[]
  /** ¿se activa con /admin EXACTO? (solo Inicio) */
  matchExactRoot?: boolean
  items: NavLeaf[]
}

export const ZONES: Zone[] = [
  {
    key: 'inicio',
    label: 'Inicio',
    href: '/admin',
    matchExactRoot: true,
    matchPrefixes: ['/admin/calendario'],
    items: [
      { label: 'Resumen', href: '/admin' },
      { label: 'Calendario', href: '/admin/calendario' },
    ],
  },
  {
    key: 'comercial',
    label: 'Comercial',
    href: '/admin/leads',
    matchPrefixes: ['/admin/leads', '/admin/clientes'],
    items: [
      { label: 'Leads', href: '/admin/leads' },
      { label: 'Clientes', href: '/admin/clientes' },
    ],
  },
  {
    key: 'obra',
    label: 'Obra',
    href: '/admin/proyectos',
    matchPrefixes: ['/admin/proyectos', '/admin/proveedores'],
    items: [
      { label: 'Proyectos', href: '/admin/proyectos' },
      { label: 'Proveedores', href: '/admin/proveedores' },
    ],
  },
  {
    key: 'inmuebles',
    label: 'Inmuebles',
    href: '/admin/operaciones',
    matchPrefixes: ['/admin/operaciones'],
    items: [
      { label: 'Operaciones', href: '/admin/operaciones' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos',
    href: '/admin/documentos',
    matchPrefixes: [
      '/admin/documentos',
      '/admin/facturas',
      '/admin/presupuestos',
      '/admin/revision',
      '/admin/upload',
    ],
    // Los items "fijos" + los doc_types del registry se componen en AdminSidebar.
    items: [
      { label: 'Subir documento', href: '/admin/upload' },
      { label: 'Revisión IA', href: '/admin/revision', badgeKey: 'orphans' },
      { label: 'Todos · solo lectura', href: '/admin/documentos' },
    ],
  },
  {
    key: 'equipo',
    label: 'Equipo',
    href: '/admin/personal',
    matchPrefixes: ['/admin/personal'],
    items: [
      { label: 'Resumen', href: '/admin/personal' },
      { label: 'Trabajadores', href: '/admin/personal/trabajadores' },
      { label: 'Dietario (partes horas)', href: '/admin/personal/dietario', badgeKey: 'partes_anomalia' },
      { label: 'Cuadrante semanal', href: '/admin/personal/cuadrante' },
      { label: 'Banco de horas', href: '/admin/personal/banco-horas' },
      { label: 'Ausencias', href: '/admin/personal/ausencias', badgeKey: 'absences_pending' },
      { label: 'Tickets / albaranes', href: '/admin/personal/tickets-trabajador', badgeKey: 'tickets_pending' },
      { label: 'Gastos a reembolsar', href: '/admin/personal/gastos-trabajador', badgeKey: 'expenses_pending' },
      { label: 'Inspección de Trabajo', href: '/admin/personal/itss' },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    href: '/admin/informes',
    matchPrefixes: ['/admin/informes', '/admin/fiscal'],
    items: [
      { label: 'Informes', href: '/admin/informes' },
      { label: 'Fiscal AEAT', href: '/admin/fiscal' },
      // Reservado — NO navegable (pinta "Próximamente").
      { label: 'Conciliación bancaria', href: '#proximamente', disabled: true },
    ],
  },
]

/** Items del menú engranaje "Sistema" (no es zona). */
export const SISTEMA_ITEMS: NavLeaf[] = [
  { label: 'Estado', href: '/admin/sistema' },
  { label: 'Forensic', href: '/admin/forensic' },
  { label: 'Métricas / Eval', href: '/admin/eval' },
  { label: 'Agentes IA', href: '/admin/agentes/diagnoses' },
  { label: 'Registro (SSOT)', href: '/admin/sistema/registry' },
  { label: 'Archivo', href: '/admin/archivo' },
  { label: 'Papelera', href: '/admin/papelera' },
  { label: 'Configuración', href: '/admin/configuracion' },
]

/** Prefijos que pertenecen a "Sistema" (no a ninguna zona). */
const SISTEMA_PREFIXES = [
  '/admin/sistema',
  '/admin/forensic',
  '/admin/eval',
  '/admin/agentes',
  '/admin/archivo',
  '/admin/papelera',
  '/admin/configuracion',
]

/** ¿La zona dada está activa para este pathname? */
export function isZoneActive(key: ZoneKey, pathname: string): boolean {
  const zone = ZONES.find((z) => z.key === key)
  if (!zone) return false
  if (zone.matchExactRoot && pathname === '/admin') return true
  return zone.matchPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?') || pathname === p)
}

/**
 * Devuelve la zona activa (o null si estamos en Sistema / ruta sin zona).
 * Orden: Inicio-exacto primero, luego por prefijo más específico (más largo).
 */
export function getActiveZone(pathname: string): Zone | null {
  // /admin exacto → Inicio
  if (pathname === '/admin') return ZONES.find((z) => z.key === 'inicio') ?? null
  // Sistema gana sobre cualquier zona (no hay rail de zona en Sistema)
  if (SISTEMA_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  // Mejor match por prefijo más largo
  let best: Zone | null = null
  let bestLen = -1
  for (const zone of ZONES) {
    for (const p of zone.matchPrefixes) {
      if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) {
        best = zone
        bestLen = p.length
      }
    }
  }
  return best
}

export const isSistemaRoute = (pathname: string): boolean =>
  SISTEMA_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
