// === Cascada Entidad (V2 sesión 9/05/2026 noche tarde) ===
// (mantiene el nombre "Cascada Supplier" por compatibilidad con conexiones)
//
// Cambios respecto a V1:
// - Branch por direction: emitidas resuelven CLIENTE, recibidas resuelven PROVEEDOR
// - Output:
//     - direction='recibida' → supplier_id_resolved (FK a suppliers.id), client_id_resolved=null
//     - direction='emitida'  → client_id_resolved   (FK a clients.id),   supplier_id_resolved=null
//
// Defensivo: cualquier error queda contenido — _resolved=null no rompe el INSERT principal.
//
// FIX V2.1: $input.item.json apunta a la salida de "Llamar Verificador" (que solo
// devuelve sus validaciones, no el item completo). Hay que leer del último nodo
// que SÍ tenía el item con todos los campos: "Preparar Verificador".

const item = $('Preparar Verificador').first().json;
const cfg = $('Config').first().json;
const direction = item.direction || 'recibida';

// Cathedral NIF (recibido en muchas facturas — NO crear como cliente ni proveedor)
const CATHEDRAL_NIF = (cfg.CATHEDRAL_NIF || 'B19761915').toUpperCase();

// Helper: validar NIF a través del verificador algorítmico
function isNifValid(nif) {
  if (!nif || nif.length < 9) return false;
  if (nif === CATHEDRAL_NIF) return false; // Nunca crear Cathedral como entidad externa
  try {
    const verifier = $('Llamar Verificador').first().json;
    const reasons = (verifier?.review_reasons || []);
    const hasNifIssue = reasons.some(r => /NIF|CIF|NIE/i.test(String(r)));
    return !hasNifIssue;
  } catch (e) {
    // Si el verificador no se ejecutó, aceptar si tiene >=9 chars
    return true;
  }
}

let supplierId = null;
let clientId = null;
let action = 'skipped';

const supabaseUrl = cfg.SUPABASE_URL || 'https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1';

if (direction === 'emitida') {
  // === FACTURA EMITIDA → resolver CLIENTE ===
  // Cathedral nos emite a un cliente final (persona física o empresa)
  const clientNif = (item.nif_receptor || '').toString().trim().toUpperCase().replace(/[\s-]/g, '');
  const clientName = (item.nombre_receptor || '').toString().trim();

  if (isNifValid(clientNif) && clientName) {
    try {
      // 1. GET por NIF
      const found = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
        method: 'GET',
        url: supabaseUrl + '/clients',
        qs: { nif_cif: 'eq.' + clientNif, select: 'id,name', limit: 1, deleted_at: 'is.null' },
        json: true,
      });
      if (Array.isArray(found) && found.length > 0) {
        clientId = found[0].id;
        action = 'client_found_by_nif';
      } else {
        // 2. Si no hay match por NIF, intentar por nombre exacto
        const foundByName = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
          method: 'GET',
          url: supabaseUrl + '/clients',
          qs: { name: 'eq.' + clientName, select: 'id,name', limit: 1, deleted_at: 'is.null' },
          json: true,
        });
        if (Array.isArray(foundByName) && foundByName.length > 0) {
          clientId = foundByName[0].id;
          action = 'client_found_by_name';
          // Update el NIF si el cliente lo tenía vacío
          try {
            await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
              method: 'PATCH',
              url: supabaseUrl + '/clients?id=eq.' + clientId + '&nif_cif=is.null',
              body: { nif_cif: clientNif },
              json: true,
            });
          } catch (_) { /* defensive: no critical */ }
        } else {
          // 3. Crear cliente nuevo
          const created = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
            method: 'POST',
            url: supabaseUrl + '/clients',
            headers: { 'Prefer': 'return=representation' },
            body: { nif_cif: clientNif, name: clientName, type: 'particular' },
            json: true,
          });
          if (Array.isArray(created) && created[0]?.id) {
            clientId = created[0].id;
            action = 'client_created';
          } else if (created?.id) {
            clientId = created.id;
            action = 'client_created';
          }
        }
      }
    } catch (e) {
      console.error('[Cascada Entidad] error resolviendo cliente:', e.message);
      action = 'error_client: ' + (e.message || 'unknown').slice(0, 100);
    }
  } else if (clientName) {
    // Sin NIF válido pero con nombre → intentar lookup por nombre solamente
    try {
      const foundByName = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
        method: 'GET',
        url: supabaseUrl + '/clients',
        qs: { name: 'eq.' + clientName, select: 'id', limit: 1, deleted_at: 'is.null' },
        json: true,
      });
      if (Array.isArray(foundByName) && foundByName.length > 0) {
        clientId = foundByName[0].id;
        action = 'client_found_by_name_no_nif';
      } else {
        action = 'client_no_match_no_create_without_nif';
      }
    } catch (e) {
      action = 'error_client_lookup: ' + (e.message || 'unknown').slice(0, 100);
    }
  }
} else {
  // === FACTURA RECIBIDA → resolver PROVEEDOR === (lógica original V1)
  const supplierNif = (item.nif_emisor || item.nif_proveedor || item.supplier_nif || '').toString().trim().toUpperCase().replace(/[\s-]/g, '');
  const empresaName = (item.empresa || item.proveedor || '').toString().trim();

  if (isNifValid(supplierNif) && empresaName) {
    try {
      const found = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
        method: 'GET',
        url: supabaseUrl + '/suppliers?on_conflict=nif',
        qs: { nif: 'eq.' + supplierNif, select: 'id,name', limit: 1 },
        json: true,
      });
      if (Array.isArray(found) && found.length > 0) {
        supplierId = found[0].id;
        action = 'supplier_found';
      } else {
        const created = await this.helpers.httpRequestWithAuthentication.call(this, 'httpCustomAuth', {
          method: 'POST',
          url: supabaseUrl + '/suppliers',
          headers: { 'Prefer': 'return=representation' },
          body: { nif: supplierNif, name: empresaName },
          json: true,
        });
        if (Array.isArray(created) && created[0]?.id) {
          supplierId = created[0].id;
          action = 'supplier_created';
        } else if (created?.id) {
          supplierId = created.id;
          action = 'supplier_created';
        }
      }
    } catch (e) {
      console.error('[Cascada Entidad] error resolviendo supplier:', e.message);
      action = 'error_supplier: ' + (e.message || 'unknown').slice(0, 100);
    }
  }
}

return {
  json: {
    ...item,
    supplier_id_resolved: supplierId,
    client_id_resolved: clientId,
    _entity_action: action,
    // Compatibilidad con código que aún lee _supplier_action
    _supplier_action: action,
  },
  // V2.1: el binary también viene del Preparar Verificador (no del Verificador HTTP)
  binary: $('Preparar Verificador').first().binary,
};
