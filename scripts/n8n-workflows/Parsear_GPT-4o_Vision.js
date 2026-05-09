// === Parsear respuesta GPT-4o Vision (V2 — sesión 9/05/2026 noche tarde) ===
//
// Cambios respecto a V1:
// - Spread del `parsed` al item raíz (igual que hace Parsear Visión con Gemini),
//   para que Elegir Mejor Resultado y Preparar Supabase encuentren los campos
//   directamente en `item.X` cuando `usar_vision=false` (path GPT-4o ganador).
// - resultado_filesapi enriquecido con TODOS los campos del parsed (no solo los 12 básicos)
// - Cálculo de confianza por completitud (idéntico a Parsear Visión) si GPT no devuelve confianza
// - Manejo de calidad_imagen y campos_dudosos para alimentar razones de revisión

const openaiResponse = $input.item.json;
const originalItem = $('Preparar OpenAI Visión Fallback').first().json;
const { openai_body, ...originalRest } = originalItem;

const choices = openaiResponse.choices || [];
const rawContent = choices[0]?.message?.content || '{}';

let parsed = {};
try {
  let cleaned = rawContent.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
  }
  parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) {
    parsed = parsed.length === 0
      ? { confianza: 0.1, _parse_error: 'empty_array' }
      : parsed[0];
  }
} catch(e) {
  console.error('[Parsear GPT-4o Visión] Error parsing OpenAI response:', e.message, rawContent.substring(0, 300));
  parsed = { tipo: 'otro', direction: 'recibida', confianza: 0.1, razones: ['Error al parsear respuesta IA GPT-4o'], es_documento: true };
}

if (parsed.es_documento === false) {
  console.log('[Parsear GPT-4o Visión] Saltando: GPT identificó adjunto como no-documento');
  return [];
}

const VALID_TIPOS = ['factura','proforma','rectificativa','abono','otro','presupuesto','albaran','certificado','contrato','nota_simple','escritura','licencia','informe','nomina','modelo_fiscal','seguro','ticket','justificante_pago'];
const tipo = VALID_TIPOS.includes((parsed.tipo||'').toLowerCase()) ? parsed.tipo.toLowerCase() : 'otro';
const direction = ['emitida','recibida'].includes((parsed.direction||'').toLowerCase()) ? parsed.direction.toLowerCase() : 'recibida';

// Confianza GPT-4o: usar la que devuelve GPT, si no inferir por score (mismo patrón que Gemini)
let confianza_num;
const rawConf = parsed.confianza;
if (typeof rawConf === 'number') {
  confianza_num = Math.min(1, Math.max(0, rawConf));
} else if (typeof rawConf === 'string') {
  const m = { 'alta': 0.9, 'media': 0.65, 'baja': 0.3 };
  confianza_num = m[rawConf.toLowerCase()] ?? (parseFloat(rawConf) || 0.3);
} else {
  // Inferir por completitud (idéntico patrón a Parsear Visión)
  const hasEmpresa  = !!(parsed.empresa || parsed.supplier_name || parsed.proveedor);
  const hasNif      = !!(parsed.nif_emisor || parsed.supplier_nif);
  const hasNumero   = !!(parsed.numero_factura || parsed.numero || parsed.number);
  const hasImporte  = !!(parsed.importe_total || parsed.amount_total);
  const hasFecha    = !!(parsed.fecha || parsed.fecha_emision || parsed.issue_date);
  const score = [hasEmpresa, hasNif, hasNumero, hasImporte, hasFecha].filter(Boolean).length;
  confianza_num = score >= 5 ? 0.95 : score === 4 ? 0.85 : score === 3 ? 0.70 : score === 2 ? 0.50 : 0.20;
}

const razones = Array.isArray(parsed.razones) ? parsed.razones.filter(r => typeof r === 'string') : [];

// Calidad y campos dudosos (idéntico a Parsear Visión)
const calidad_imagen = ['alta','media','baja'].includes(parsed.calidad_imagen) ? parsed.calidad_imagen : null;
const tipo_doc_origen = ['pdf_digital','pdf_escaneado','foto','manuscrito','mixto'].includes(parsed.tipo_documento_origen) ? parsed.tipo_documento_origen : null;
const camposDudosos = Array.isArray(parsed.campos_dudosos) ? parsed.campos_dudosos.filter(c => typeof c === 'string') : [];

const confs = {
  importe_total: typeof parsed.confianza_importe_total === 'number' ? parsed.confianza_importe_total : null,
  fecha:         typeof parsed.confianza_fecha === 'number' ? parsed.confianza_fecha : null,
  nif:           typeof parsed.confianza_nif === 'number' ? parsed.confianza_nif : null,
  numero_factura: typeof parsed.confianza_numero_factura === 'number' ? parsed.confianza_numero_factura : null,
};

const razonesCalidad = [];
if (calidad_imagen === 'baja') {
  razonesCalidad.push(`§CALIDAD_BAJA:Documento de baja calidad visual (origen: ${tipo_doc_origen || 'desconocido'}). Revisar números clave manualmente.`);
}
if (tipo_doc_origen === 'manuscrito') {
  razonesCalidad.push(`§MANUSCRITO:Documento escrito a mano. Alto riesgo de error en dígitos. Verificar importes, fechas, NIF.`);
}
const CONF_THRESHOLD = 0.75;
for (const [campo, conf] of Object.entries(confs)) {
  if (conf !== null && conf < CONF_THRESHOLD) {
    const valor = parsed[campo === 'nif' ? 'nif_emisor' : (campo === 'numero_factura' ? 'numero_factura' : (campo === 'importe_total' ? 'importe_total' : 'fecha'))];
    razonesCalidad.push(`§CAMPO_DUDOSO:${campo}:${conf.toFixed(2)}:Valor extraído: ${valor || 'null'}`);
  }
}

const parseImporte = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

// PROJECT FIELDS — usar contexto del item original
const proyectos_list = originalRest.proyectos_activos || [];
const validCodes = new Set(proyectos_list.map(p => p.code));
const validateCode = (code) => {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();
  if (validCodes.has(trimmed)) return trimmed;
  for (const c of validCodes) { if (c.toUpperCase() === trimmed) return c; }
  return null;
};

const proyecto_code = validateCode(parsed.proyecto_code);
const proyecto_code_sugerido = validateCode(parsed.proyecto_code_sugerido);
const proyecto_confianza = typeof parsed.proyecto_confianza === 'number'
  ? Math.min(1, Math.max(0, parsed.proyecto_confianza)) : 0;
const proyecto_razon = parsed.proyecto_razon || '';

// resultado_filesapi RICO (incluye todos los campos del parsed, igual que resultado_vision)
const resultado_filesapi = {
  ...parsed,
  confianza_files: confianza_num,
  tipo,
  direction,
  concept: parsed.concept || parsed.concepto || null,
  numero: parsed.number || parsed.numero || parsed.numero_factura || null,
  supplier_name: parsed.supplier_name || parsed.empresa || parsed.proveedor || null,
  supplier_nif: parsed.supplier_nif || parsed.nif_emisor || null,
  amount_base: parseImporte(parsed.amount_base ?? parsed.importe_base),
  vat_pct: parsed.vat_pct ?? parsed.iva_porcentaje ?? null,
  vat_amount: parseImporte(parsed.vat_amount ?? parsed.importe_iva ?? parsed.iva_importe),
  amount_total: parseImporte(parsed.amount_total ?? parsed.importe_total),
  issue_date: parsed.issue_date || parsed.fecha_emision || parsed.fecha || null,
  due_date: parsed.due_date || parsed.fecha_vencimiento || null,
};

return {
  json: {
    // Spread original (proyectos_activos, clientes_activos, etc.)
    ...originalRest,
    // Spread del parsed RAW para que Elegir Mejor / Preparar Supabase encuentre los campos directos
    ...parsed,
    // Resultado estructurado para el path files_api
    resultado_filesapi,
    confianza_num_filesapi: confianza_num,
    _fallback_provider: 'gpt-4o',
    // Campos normalizados (igual que Parsear Visión)
    tipo,
    direction,
    nif_emisor: parsed.nif_emisor || parsed.supplier_nif || null,
    proveedor: parsed.empresa || parsed.proveedor || parsed.supplier_name || '',
    empresa: parsed.empresa || parsed.proveedor || parsed.supplier_name || null,
    numero_factura: parsed.numero_factura || parsed.numero || parsed.number || '',
    fecha_emision: parsed.fecha || parsed.fecha_emision || parsed.issue_date || '',
    fecha_vencimiento: parsed.fecha_vencimiento || parsed.due_date || '',
    iva_porcentaje: parsed.iva_porcentaje != null ? parseFloat(parsed.iva_porcentaje) : (parsed.vat_pct != null ? parseFloat(parsed.vat_pct) : null),
    importe_base: parseImporte(parsed.importe_base ?? parsed.amount_base),
    importe_iva: parseImporte(parsed.iva_importe ?? parsed.importe_iva ?? parsed.vat_amount),
    importe_total: parseImporte(parsed.importe_total ?? parsed.amount_total),
    concepto: parsed.concepto || parsed.concept || '',
    confianza: confianza_num,
    razones,
    ai_confidence: confianza_num,
    es_documento: true,
    proyecto_code,
    proyecto_code_sugerido,
    proyecto_confianza,
    proyecto_razon,
    iban_proveedor: parsed.iban_proveedor || null,
    plazo_pago_dias: parsed.plazo_pago_dias != null ? parseInt(parsed.plazo_pago_dias) || null : null,
    num_pedido: parsed.num_pedido || null,
    retencion_porcentaje: parsed.retencion_porcentaje != null ? parseFloat(parsed.retencion_porcentaje) : null,
    retencion_importe: parsed.retencion_importe != null ? parseFloat(parsed.retencion_importe) : null,
    periodo_facturacion: parsed.periodo_facturacion || null,
    moneda: parsed.moneda || 'EUR',
    nif_receptor: parsed.nif_receptor || null,
    nombre_receptor: parsed.nombre_receptor || null,
    direccion_emisor: parsed.direccion_emisor || null,
    direccion_obra: parsed.direccion_obra || null,
    forma_pago: parsed.forma_pago || null,
    estado_pago: parsed.estado_pago || null,
    es_rectificativa: parsed.es_rectificativa || false,
    numero_factura_original: parsed.numero_factura_original || null,
    categoria_gasto: parsed.categoria_gasto || null,
    tipo_operacion_iva: parsed.tipo_operacion_iva || null,
    lineas: Array.isArray(parsed.lineas) ? parsed.lineas : [],
    inversion_sujeto_pasivo: parsed.inversion_sujeto_pasivo || false,
    tipo_retencion: parsed.tipo_retencion || null,
    detalles_iva: Array.isArray(parsed.detalles_iva) ? parsed.detalles_iva : null,
    codigo_verificacion: parsed.codigo_verificacion || null,
    num_albaran: parsed.num_albaran || null,
    num_contrato: parsed.num_contrato || null,
    validez_hasta: parsed.validez_hasta || null,
    notas_documento: parsed.notas_documento || null,
    idioma: parsed.idioma || 'es',
    resumen_ia: parsed.resumen_ia || null,
    // Calidad y campos dudosos
    calidad_imagen,
    tipo_documento_origen: tipo_doc_origen,
    confianzas_campos: confs,
    campos_dudosos_lista: camposDudosos,
    _razones_calidad: razonesCalidad,
    // Mantener contexto original
    proyectos_activos: originalRest.proyectos_activos || [],
    clientes_activos: originalRest.clientes_activos || [],
    quote_to_project: originalRest.quote_to_project || {}
  },
  binary: $('Preparar OpenAI Visión Fallback').first().binary
};
