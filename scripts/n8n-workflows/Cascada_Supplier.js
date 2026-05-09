// === Cascada Entidad — Preparar Upsert (V3 sesión 9/05/2026 noche tarde) ===
// (mantiene el nombre "Cascada Supplier" por compatibilidad con conexiones)
//
// V3: separación de responsabilidades. Este Code SOLO prepara el payload del
// upsert. La llamada HTTP la hace el siguiente nodo "Upsert Entidad" usando
// la credencial httpCustomAuth (la función helpers.httpRequestWithAuthentication
// no funciona en Code Nodes — bug de n8n descubierto en sesión 9/05).
//
// Output:
// - direction='emitida'  → _entity_table='clients',  _entity_unique='nif_cif'
// - direction='recibida' → _entity_table='suppliers', _entity_unique='nif'
// - _entity_should_skip=true cuando NIF inválido o NIF Cathedral

const item = $('Preparar Verificador').first().json;
const cfg = $('Config').first().json;
const direction = item.direction || 'recibida';
const CATHEDRAL_NIF = (cfg.CATHEDRAL_NIF || 'B19761915').toUpperCase();
const SUPABASE_URL = cfg.SUPABASE_URL || 'https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1';

// Validar NIF a través del verificador algorítmico si está disponible
function isNifValid(nif) {
  if (!nif || nif.length < 9) return false;
  if (nif === CATHEDRAL_NIF) return false; // Nunca crear Cathedral como entidad externa
  try {
    const verifier = $('Llamar Verificador').first().json;
    const reasons = (verifier?.review_reasons || []);
    return !reasons.some(r => /NIF|CIF|NIE/i.test(String(r)));
  } catch (e) {
    return true;
  }
}

// Inferir tipo cliente por estructura del NIF (DNI/NIE → particular, CIF → empresa)
function inferClientType(nif) {
  if (!nif) return null;
  const n = nif.toUpperCase();
  // CIF: empieza por A-H, J-N, P-S, U, V, W (8 dígitos + letra/dígito control)
  if (/^[ABCDEFGHJNPQRSUVW]/.test(n)) return 'empresa';
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) return 'particular';
  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(n)) return 'particular';
  return null;
}

let entity_table = null;
let entity_unique = null;
let entity_body = null;
let should_skip = false;
let skip_reason = '';

if (direction === 'emitida') {
  // === FACTURA EMITIDA → upsert CLIENTE ===
  const nif = (item.nif_receptor || '').toString().trim().toUpperCase().replace(/[\s-]/g, '');
  const name = (item.nombre_receptor || '').toString().trim();

  if (!isNifValid(nif)) {
    should_skip = true;
    skip_reason = nif === CATHEDRAL_NIF ? 'cathedral_nif_skip' : 'nif_inválido_o_corto';
  } else if (!name) {
    should_skip = true;
    skip_reason = 'sin_nombre_receptor';
  } else {
    entity_table = 'clients';
    entity_unique = 'nif_cif';
    const inferredType = item.cliente_tipo || inferClientType(nif);
    entity_body = {
      nif_cif: nif,
      name: name,
      ...(inferredType ? { type: inferredType } : {}),
      ...(item.cliente_direccion ? { address: item.cliente_direccion } : {}),
      ...(item.cliente_ciudad ? { city: item.cliente_ciudad } : {}),
      ...(item.cliente_telefono ? { phone: item.cliente_telefono } : {}),
      ...(item.cliente_email ? { email: item.cliente_email } : {}),
      source: 'auto_factura_emitida',
    };
  }
} else {
  // === FACTURA RECIBIDA → upsert PROVEEDOR ===
  const nif = (item.nif_emisor || item.nif_proveedor || item.supplier_nif || '').toString().trim().toUpperCase().replace(/[\s-]/g, '');
  const name = (item.empresa || item.proveedor || '').toString().trim();

  if (!isNifValid(nif)) {
    should_skip = true;
    skip_reason = nif === CATHEDRAL_NIF ? 'cathedral_nif_skip' : 'nif_inválido_o_corto';
  } else if (!name) {
    should_skip = true;
    skip_reason = 'sin_empresa';
  } else {
    entity_table = 'suppliers';
    entity_unique = 'nif';
    entity_body = {
      nif: nif,
      name: name,
      ...(item.direccion_emisor ? { address: item.direccion_emisor } : {}),
    };
  }
}

const upsert_url = entity_table
  ? `${SUPABASE_URL}/${entity_table}?on_conflict=${entity_unique}`
  : null;

console.log(`[Cascada Supplier V3] direction=${direction} table=${entity_table || 'skip'} reason=${skip_reason || 'ok'}`);

return {
  json: {
    ...item,
    _entity_table: entity_table,
    _entity_unique_field: entity_unique,
    _entity_body: entity_body,
    _entity_upsert_url: upsert_url,
    _entity_should_skip: should_skip,
    _entity_skip_reason: skip_reason,
    // Compatibilidad con código que aún lee supplier_id_resolved (lo poblará Resolver Entidad ID)
    supplier_id_resolved: null,
    client_id_resolved: null,
    _entity_action: 'pending_upsert',
  },
  binary: $('Preparar Verificador').first().binary,
};
