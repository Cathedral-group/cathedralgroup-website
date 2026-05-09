// Build maximum context: projects + clients + quotes → merged into invoice item
//
// FIX V2 (sesión 9/05/2026 noche tarde): cambiar .first().json (que devuelve
// solo el primer item del array) por .all().map(i => i.json) (devuelve TODOS
// los items como array). Sin este fix, los HTTP que devuelven N items solo
// pasaban 1 al prompt → "Sin proyectos activos" aunque hubiera 19 en BD.
//
// Histórico:
// - V0: $node["X"].item.json — error "Multiple matches" cuando >1 item
// - V1 (sesión 25): $().first().json — pasa 1 solo item, pierde el array completo
// - V2 (sesión 9/05): $().all().map(i => i.json) — array completo correcto

const proyectosRaw    = $('Obtener Proyectos Activos').all().map(i => i.json);
const clientesRaw     = $('Obtener Clientes para Contexto').all().map(i => i.json);
const presupuestosRaw = $('Obtener Presupuestos para Contexto').all().map(i => i.json);
const originalItem    = $('Es Duplicado?').first().json;
const attachBinary    = $('Es Duplicado?').first().binary;

// Build client map: id → {name, nif_cif, company_name, type}
const clientesList = Array.isArray(clientesRaw) ? clientesRaw : [];
const clienteMap = {};
clientesList.forEach(c => { if (c && c.id) clienteMap[c.id] = c; });

// Build quotes by project: project_id → [quote numbers]
const presupuestosList = Array.isArray(presupuestosRaw) ? presupuestosRaw : [];
const quotesByProject = {};
const quoteToProject = {};
presupuestosList.forEach(q => {
  if (q && q.project_id) {
    if (!quotesByProject[q.project_id]) quotesByProject[q.project_id] = [];
    quotesByProject[q.project_id].push(q.number);
    quoteToProject[q.number] = q.project_id;
  }
});

// Build enriched projects
const proyectosList = Array.isArray(proyectosRaw) ? proyectosRaw : [];
const proyectos_activos = proyectosList.map(p => ({
  id: p.id,
  code: p.code,
  name: p.name,
  address: p.address || null,
  status: p.status,
  type: p.type || null,
  start_date: p.start_date || null,
  end_date_planned: p.end_date_planned || null,
  description: p.description || null,
  client: p.client_id ? (clienteMap[p.client_id] || null) : null,
  presupuestos: quotesByProject[p.id] || [],
}));

console.log(`[Añadir Proyectos al Item] Contexto cargado: ${proyectos_activos.length} proyectos, ${clientesList.length} clientes, ${presupuestosList.length} presupuestos`);

return {
  json: {
    ...originalItem,
    proyectos_activos,
    clientes_activos: clientesList,
    presupuestos_all: presupuestosList,
    quote_to_project: quoteToProject,
  },
  binary: attachBinary
};
