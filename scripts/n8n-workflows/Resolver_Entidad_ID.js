// === Resolver Entidad ID (V3 sesión 9/05/2026 noche tarde) ===
// Lee la respuesta del nodo "Upsert Entidad" (HTTP Request a Supabase) y pega
// el ID resultante en el item como `client_id_resolved` o `supplier_id_resolved`
// según direction.
//
// Si el upsert falló o no se ejecutó (skip), devuelve los IDs en null sin romper.

const upsertResponse = $input.item.json;
const item = $('Cascada Supplier').first().json;
const direction = item.direction || 'recibida';

let entityId = null;
let action = 'no_response';

// PostgREST con Prefer: return=representation devuelve un array con el row
if (Array.isArray(upsertResponse) && upsertResponse.length > 0 && upsertResponse[0]?.id) {
  entityId = upsertResponse[0].id;
  action = 'upserted';
} else if (upsertResponse?.id) {
  entityId = upsertResponse.id;
  action = 'upserted';
} else if (upsertResponse?.code || upsertResponse?.message) {
  // Error del HTTP (devolvió un error PostgREST)
  action = 'error: ' + (upsertResponse.message || upsertResponse.code || 'unknown').slice(0, 100);
}

const result = {
  ...item,
  supplier_id_resolved: direction === 'recibida' ? entityId : null,
  client_id_resolved:   direction === 'emitida'  ? entityId : null,
  _entity_action: action,
  _entity_resolved_id: entityId,
};

console.log(`[Resolver Entidad ID] direction=${direction} action=${action} id=${entityId}`);

return {
  json: result,
  binary: $('Cascada Supplier').first().binary,
};
