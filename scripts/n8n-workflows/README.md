# `n8n-workflows/` — JS code de nodos versionado

Los Code nodes del workflow general FwpGF7L2GbFB84kL viven en n8n DB
(no en repo). Esta carpeta contiene **copias de las últimas versiones**
de los Code nodes críticos para versionado y trazabilidad.

**Convención**: cada archivo es el `.parameters.jsCode` de un nodo del
workflow general, con el nombre del nodo (espacios → `_`).

## Inventario actual (sesión 9/05/2026 noche tarde — 4 fixes V2)

| Archivo | Nodo n8n | Cambios V2 |
|---|---|---|
| `Parsear_GPT-4o_Vision.js` | `Parsear GPT-4o Visión` | Spread `parsed` al item (estaba solo en `resultado_filesapi`) → Elegir Mejor encuentra empresa, lineas, direccion_obra, etc. |
| `Anadir_Proyectos_al_Item.js` | `Añadir Proyectos al Item` | `.first()` → `.all().map(i => i.json)` para que los 19 proyectos lleguen al prompt |
| `Cascada_Supplier.js` | `Cascada Supplier` | Branch por direction: emitida → busca/crea CLIENTE, recibida → busca/crea PROVEEDOR. Lee de `Preparar Verificador` (no del `Llamar Verificador` que solo devuelve validaciones) |
| `Preparar_Supabase.js` | `Preparar Supabase` | Branch direction: empresa = nombre_receptor (emitida) o proveedor (recibida); supplier_nif/supplier_id solo en recibidas; client_id solo en emitidas; categoria_gasto solo en recibidas |

## Cómo se aplican

Estos archivos son **referencia**, no se ejecutan automáticamente.
Para aplicar cambios al workflow live:

```bash
# Generar JSON modificado del workflow
KEY=$(jq -r '.mcpServers.n8n.env.N8N_API_KEY' ~/.mcp.json)
curl -sS -H "X-N8N-API-KEY: $KEY" \
  https://n8n.cathedralgroup.es/api/v1/workflows/FwpGF7L2GbFB84kL \
  > /tmp/general.json

jq --rawfile js scripts/n8n-workflows/Parsear_GPT-4o_Vision.js '
  .nodes |= map(if .name == "Parsear GPT-4o Visión" then .parameters.jsCode = $js else . end)
  | {name, nodes, connections, settings: ((.settings // {}) | {executionOrder: (.executionOrder // "v1"), saveManualExecutions: (.saveManualExecutions // true), timezone: (.timezone // "Europe/Madrid")})}
' /tmp/general.json > /tmp/general.fix.json

# Backup + PUT
cp /tmp/general.json backups/workflows-pruebas-handoff/FwpGF7L2GbFB84kL-pre-$(date +%Y%m%dT%H%M%SZ).json
curl -sS -X PUT -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
  -d @/tmp/general.fix.json \
  https://n8n.cathedralgroup.es/api/v1/workflows/FwpGF7L2GbFB84kL
```

## Bugs conocidos pendientes

- **Cascada Supplier no resuelve supplier_id ni client_id**: usa
  `this.helpers.httpRequestWithAuthentication` que no es válido en
  Code Nodes (error: "function not supported in Code Node"). Bug
  histórico desde V1 — la columna se rellena manualmente en
  /admin/facturas. Fix futuro: refactor de Code → 2 HTTP Request
  nodes (lookup + create) por entidad.
