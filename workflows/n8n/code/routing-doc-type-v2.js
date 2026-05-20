// ============================================================================
// Cathedral · Routing Doc Type V2 — Code node n8n
// ============================================================================
// Insertar como nodo NUEVO entre `Preparar Supabase` y `Supabase INSERT`.
//
// Lee doc_type extraído por IA y rutea a tabla específica.
// - doc_types legacy (factura/rectificativa/abono/proforma/ticket/nomina,
//   presupuesto cuando target_table=quotes, documento cuando target_table=documents)
//   → NO toca (mantiene target_table + supabase_payload/quotes_payload/documents_payload)
// - doc_types nuevos (contrato, escritura, seguro, licencia, certificacion_obra,
//   certificado, informe, modelo_fiscal, justificante_pago, albaran, presupuesto,
//   nota_simple, otro) → setea target_table específico + target_payload
//
// Backward compatible. `Supabase INSERT` jsonBody con fallback:
// ={{ $json.target_payload || (target_table==='documents' ? documents_payload :
//     target_table==='quotes' ? quotes_payload : supabase_payload) }}
//
// Validado contra schema BD producción Cathedral 20/05/2026.
// ============================================================================

const item = $input.item.json;
const docType = String(item.doc_type || '').toLowerCase().trim();
const COMPANY_CATHEDRAL = '00000000-0000-0000-0000-cca7ed1a1000';

// Common fields (presentes en TODAS las tablas nuevas)
function commonFields(item) {
  return {
    company_id: item.company_id || COMPANY_CATHEDRAL,
    ai_provider: item.ai_provider || null,
    ai_confidence: typeof item.ai_confidence === 'number' ? item.ai_confidence : null,
    ai_data: item.ai_data || null,
    file_hash: item.file_hash || null,
    original_filename: item.original_filename || item.fileName || null,
    storage_path: item.storage_path || item.drive_url || null,
    review_status: item.review_status || 'pendiente',
  };
}

// ============================================================================
// BUILDERS — uno por tabla destino
// ============================================================================

function buildContrato(item) {
  return {
    ...commonFields(item),
    tipo_contrato: item.tipo_contrato || 'otro',
    numero_contrato: item.numero_contrato || item.number || null,
    objeto: item.objeto || item.concepto || null,
    fecha_firma: item.fecha_firma || item.issue_date || null,
    fecha_inicio: item.fecha_inicio || null,
    fecha_fin: item.fecha_fin || null,
    duracion_meses: item.duracion_meses ?? null,
    preaviso_dias: item.preaviso_dias ?? null,
    prorroga_automatica: item.prorroga_automatica ?? null,
    fecha_proxima_revision: item.fecha_proxima_revision || null,
    importe_total: item.importe_total ?? item.amount_total ?? null,
    importe_periodico: item.importe_periodico ?? null,
    periodicidad: item.periodicidad || null,
    moneda: item.moneda || 'EUR',
    fianza: item.fianza ?? null,
    iva_pct: item.iva_pct ?? null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    party_id: item.party_id || null,
    clausula_indexacion: item.clausula_indexacion ?? null,
    indice_referencia: item.indice_referencia || null,
    clausula_penalizacion: item.clausula_penalizacion ?? null,
    clausula_renuncia_iva: item.clausula_renuncia_iva ?? null,
    estado: item.estado || 'vigente',
  };
}

function buildEscritura(item) {
  return {
    ...commonFields(item),
    numero_protocolo: item.numero_protocolo || item.number || null,
    notario_nombre: item.notario_nombre || item.empresa || null,
    notario_nif: item.notario_nif || item.supplier_nif || null,
    notaria_municipio: item.notaria_municipio || null,
    fecha_otorgamiento: item.fecha_otorgamiento || item.issue_date || null,
    tipo_escritura: item.tipo_escritura || 'otro',
    importe_principal: item.importe_principal ?? item.amount_total ?? null,
    base_imponible: item.base_imponible ?? item.amount_base ?? null,
    itp_pct: item.itp_pct ?? null,
    itp_importe: item.itp_importe ?? null,
    ajd_pct: item.ajd_pct ?? null,
    ajd_importe: item.ajd_importe ?? null,
    iva_pct: item.iva_pct ?? item.vat_pct ?? null,
    iva_importe: item.iva_importe ?? item.amount_vat ?? null,
    honorarios_notario: item.honorarios_notario ?? null,
    honorarios_registro: item.honorarios_registro ?? null,
    total_gastos: item.total_gastos ?? null,
    hipoteca_acreedor: item.hipoteca_acreedor || null,
    hipoteca_capital: item.hipoteca_capital ?? null,
    hipoteca_tipo_interes: item.hipoteca_tipo_interes ?? null,
    hipoteca_plazo_meses: item.hipoteca_plazo_meses ?? null,
    hipoteca_cuota: item.hipoteca_cuota ?? null,
    property_id: item.property_id || null,
    referencia_catastral: item.referencia_catastral || null,
    finca_registral: item.finca_registral || null,
    registro_propiedad: item.registro_propiedad || null,
    fecha_inscripcion_registro: item.fecha_inscripcion_registro || null,
    inscripcion_asiento: item.inscripcion_asiento || null,
  };
}

function buildSeguro(item) {
  return {
    ...commonFields(item),
    numero_poliza: item.numero_poliza || item.number || `SIN-NUMERO-${Date.now()}`,
    aseguradora: item.aseguradora || item.empresa || null,
    aseguradora_nif: item.aseguradora_nif || item.supplier_nif || null,
    mediador_corredor: item.mediador_corredor || null,
    mediador_nif: item.mediador_nif || null,
    tipo_seguro: item.tipo_seguro || 'otro',
    fecha_emision: item.fecha_emision || item.issue_date || null,
    fecha_efecto: item.fecha_efecto || null,
    fecha_vencimiento: item.fecha_vencimiento || null,
    prorroga_automatica: item.prorroga_automatica ?? null,
    prima_neta: item.prima_neta ?? null,
    recargos: item.recargos ?? null,
    impuestos: item.impuestos ?? null,
    prima_total: item.prima_total ?? item.amount_total ?? null,
    forma_pago: item.forma_pago || null,
    capital_asegurado: item.capital_asegurado ?? null,
    franquicia: item.franquicia ?? null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    party_tomador_id: item.party_tomador_id || null,
    party_asegurado_id: item.party_asegurado_id || null,
    party_beneficiario_id: item.party_beneficiario_id || null,
    coberturas: item.coberturas || null,
    estado: item.estado || 'vigente',
  };
}

function buildLicencia(item) {
  return {
    ...commonFields(item),
    organismo_emisor: item.organismo_emisor || item.empresa || null,
    numero_expediente: item.numero_expediente || null,
    numero_licencia: item.numero_licencia || item.number || null,
    fecha_solicitud: item.fecha_solicitud || null,
    fecha_concesion: item.fecha_concesion || item.issue_date || null,
    fecha_inicio_validez: item.fecha_inicio_validez || null,
    fecha_caducidad: item.fecha_caducidad || null,
    tipo_licencia: item.tipo_licencia || 'otra',
    importe_tasa: item.importe_tasa ?? null,
    importe_icio: item.importe_icio ?? null,
    total_pagado: item.total_pagado ?? item.amount_total ?? null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    objeto: item.objeto || item.concepto || null,
    superficie_intervencion_m2: item.superficie_intervencion_m2 ?? null,
    estado: item.estado || 'concedida',
  };
}

function buildCertificacionObra(item) {
  return {
    ...commonFields(item),
    project_id: item.project_id || null,
    numero_certificacion: item.numero_certificacion || item.number || null,
    fecha_certificacion: item.fecha_certificacion || item.issue_date || new Date().toISOString().slice(0,10),
    periodo_desde: item.periodo_desde || null,
    periodo_hasta: item.periodo_hasta || null,
    importe_origen: item.importe_origen ?? null,
    importe_anterior: item.importe_anterior ?? null,
    importe_actual: item.importe_actual ?? item.amount_base ?? null,
    base_imponible: item.base_imponible ?? item.amount_base ?? null,
    iva_pct: item.iva_pct ?? item.vat_pct ?? null,
    iva_importe: item.iva_importe ?? item.amount_vat ?? null,
    retencion_pct: item.retencion_pct ?? 5,
    retencion_importe: item.retencion_importe ?? null,
    retencion_acumulada: item.retencion_acumulada ?? null,
    retencion_liberada: item.retencion_liberada ?? null,
    fecha_liberacion_retencion: item.fecha_liberacion_retencion || null,
    total_a_pagar: item.total_a_pagar ?? item.amount_total ?? null,
    pct_ejecucion: item.pct_ejecucion ?? null,
    contrato_id: item.contrato_id || null,
    party_contratista_id: item.party_contratista_id || null,
    party_promotor_id: item.party_promotor_id || null,
    director_obra: item.director_obra || null,
    director_ejecucion: item.director_ejecucion || null,
    invoice_id: item.invoice_id || null,
    estado: item.estado || 'borrador',
  };
}

function buildCertificado(item) {
  return {
    ...commonFields(item),
    tipo_certificado: item.tipo_certificado || 'otro',
    numero_certificado: item.numero_certificado || item.number || null,
    organismo_o_tecnico: item.organismo_o_tecnico || item.empresa || null,
    tecnico_nif: item.tecnico_nif || item.supplier_nif || null,
    colegiado_numero: item.colegiado_numero || null,
    colegio_profesional: item.colegio_profesional || null,
    fecha_emision: item.fecha_emision || item.issue_date || null,
    fecha_caducidad: item.fecha_caducidad || null,
    resultado: item.resultado || null,
    calificacion_energetica: item.calificacion_energetica || null,
    consumo_kwh_m2_anio: item.consumo_kwh_m2_anio ?? null,
    emisiones_kg_co2_m2_anio: item.emisiones_kg_co2_m2_anio ?? null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    importe: item.importe ?? item.amount_total ?? null,
    observaciones: item.observaciones || null,
  };
}

function buildInforme(item) {
  return {
    ...commonFields(item),
    tipo_informe: item.tipo_informe || 'otro',
    numero_informe: item.numero_informe || item.number || null,
    emisor: item.emisor || item.empresa || null,
    emisor_nif: item.emisor_nif || item.supplier_nif || null,
    tecnico_nombre: item.tecnico_nombre || null,
    tecnico_colegiado: item.tecnico_colegiado || null,
    fecha_emision: item.fecha_emision || item.issue_date || null,
    fecha_visita: item.fecha_visita || null,
    fecha_vigencia: item.fecha_vigencia || null,
    valor_mercado: item.valor_mercado ?? null,
    valor_hipotecario: item.valor_hipotecario ?? null,
    valor_construccion: item.valor_construccion ?? null,
    valor_suelo: item.valor_suelo ?? null,
    valor_reposicion: item.valor_reposicion ?? null,
    metodo_valoracion: item.metodo_valoracion || null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    party_solicitante_id: item.party_solicitante_id || null,
    conclusiones: item.conclusiones || null,
    honorarios: item.honorarios ?? null,
    iva_pct: item.iva_pct ?? item.vat_pct ?? null,
    total_informe: item.total_informe ?? item.amount_total ?? null,
  };
}

function buildModeloFiscal(item) {
  return {
    ...commonFields(item),
    modelo: item.modelo || item.modelo_fiscal || 'otro',
    ejercicio: item.ejercicio ?? new Date().getFullYear(),
    periodo: item.periodo || null,
    fecha_presentacion: item.fecha_presentacion || item.issue_date || null,
    fecha_devengo: item.fecha_devengo || null,
    numero_justificante: item.numero_justificante || item.number || null,
    numero_referencia: item.numero_referencia || null,
    csv_aeat: item.csv_aeat || item.codigo_verificacion || null,
    estado: item.estado || 'presentado',
    resultado_signo: item.resultado_signo || null,
    importe_resultado: item.importe_resultado ?? item.amount_total ?? null,
    importe_pagado: item.importe_pagado ?? null,
    cuenta_cargo_iban: item.cuenta_cargo_iban || item.iban || null,
    rectifica_modelo_id: item.rectifica_modelo_id || null,
    motivo_rectificacion: item.motivo_rectificacion || null,
    detalle: item.detalle_modelo || item.detalle || null,
  };
}

function buildJustificantePago(item) {
  return {
    ...commonFields(item),
    tipo_justificante: item.tipo_justificante || 'transferencia',
    banco_emisor: item.banco_emisor || null,
    iban_ordenante: item.iban_ordenante || null,
    iban_beneficiario: item.iban_beneficiario || item.iban || null,
    beneficiario_nombre: item.beneficiario_nombre || item.empresa || null,
    beneficiario_nif: item.beneficiario_nif || item.supplier_nif || null,
    ordenante_nombre: item.ordenante_nombre || null,
    ordenante_nif: item.ordenante_nif || null,
    referencia_operacion: item.referencia_operacion || item.number || null,
    concepto: item.concepto || null,
    fecha_operacion: item.fecha_operacion || item.issue_date || new Date().toISOString().slice(0,10),
    fecha_valor: item.fecha_valor || null,
    importe: item.importe ?? item.amount_total ?? 0,
    moneda: item.moneda || 'EUR',
    comision: item.comision ?? null,
    invoice_id: item.invoice_id || null,
    modelo_fiscal_id: item.modelo_fiscal_id || null,
    contrato_id: item.contrato_id || null,
    payroll_id: item.payroll_id || null,
    seguro_id: item.seguro_id || null,
    documento_referenciado_texto: item.documento_referenciado_texto || null,
    conciliado: item.conciliado ?? false,
  };
}

function buildAlbaran(item) {
  return {
    ...commonFields(item),
    numero_albaran: item.numero_albaran || item.number || `SIN-NUMERO-${Date.now()}`,
    fecha_albaran: item.fecha_albaran || item.issue_date || new Date().toISOString().slice(0,10),
    fecha_entrega: item.fecha_entrega || null,
    proveedor_nif: item.proveedor_nif || item.supplier_nif || null,
    proveedor_nombre: item.proveedor_nombre || item.empresa || null,
    party_proveedor_id: item.party_proveedor_id || null,
    cliente_nif: item.cliente_nif || item.nif_receptor || null,
    cliente_nombre: item.cliente_nombre || item.nombre_receptor || null,
    project_id: item.project_id || null,
    property_id: item.property_id || null,
    direccion_entrega: item.direccion_entrega || null,
    invoice_id: item.invoice_id || null,
    facturado: item.facturado ?? false,
    fecha_facturacion: item.fecha_facturacion || null,
    subtotal_sin_iva: item.subtotal_sin_iva ?? item.amount_base ?? null,
    num_lineas: item.num_lineas ?? null,
    observaciones: item.observaciones || item.notas_documento || null,
  };
}

function buildPresupuesto(item) {
  return {
    ...commonFields(item),
    numero_presupuesto: item.numero_presupuesto || item.number || `SIN-NUMERO-${Date.now()}`,
    fecha_emision: item.fecha_emision || item.issue_date || new Date().toISOString().slice(0,10),
    fecha_validez: item.fecha_validez || item.validez_hasta || null,
    emisor_nif: item.emisor_nif || item.supplier_nif || null,
    emisor_nombre: item.emisor_nombre || item.empresa || null,
    party_emisor_id: item.party_emisor_id || null,
    destinatario_nif: item.destinatario_nif || item.nif_receptor || null,
    destinatario_nombre: item.destinatario_nombre || item.nombre_receptor || null,
    party_destinatario_id: item.party_destinatario_id || null,
    project_id: item.project_id || null,
    property_id: item.property_id || null,
    contrato_id: item.contrato_id || null,
    subtotal: item.subtotal ?? item.amount_base ?? null,
    descuento_pct: item.descuento_pct ?? null,
    descuento_importe: item.descuento_importe ?? null,
    base_imponible: item.base_imponible ?? item.amount_base ?? null,
    iva_pct: item.iva_pct ?? item.vat_pct ?? null,
    iva_importe: item.iva_importe ?? item.amount_vat ?? null,
    total: item.total ?? item.amount_total ?? null,
    moneda: item.moneda || 'EUR',
    forma_pago: item.forma_pago || null,
    plazo_ejecucion_dias: item.plazo_ejecucion_dias ?? null,
    condiciones: item.condiciones || null,
    estado: item.estado || 'borrador',
    fecha_aceptacion: item.fecha_aceptacion || null,
    invoice_id: item.invoice_id || null,
  };
}

function buildNotaSimple(item) {
  return {
    ...commonFields(item),
    registro_propiedad: item.registro_propiedad || null,
    numero_finca: item.numero_finca || item.number || null,
    tomo: item.tomo || null,
    libro: item.libro || null,
    folio: item.folio || null,
    idufir: item.idufir || null,
    referencia_catastral: item.referencia_catastral || null,
    descripcion_finca: item.descripcion_finca || null,
    tipo_finca: item.tipo_finca || null,
    superficie_construida_m2: item.superficie_construida_m2 ?? null,
    superficie_util_m2: item.superficie_util_m2 ?? null,
    superficie_parcela_m2: item.superficie_parcela_m2 ?? null,
    cuota_participacion: item.cuota_participacion ?? null,
    direccion_completa: item.direccion_completa || item.direccion_emisor || null,
    codigo_postal: item.codigo_postal || item.emisor_codigo_postal || null,
    municipio: item.municipio || item.emisor_municipio || null,
    provincia: item.provincia || item.emisor_provincia || null,
    pais: item.pais || 'España',
    fecha_expedicion: item.fecha_expedicion || item.issue_date || null,
    fecha_vigencia: item.fecha_vigencia || null,
    registrador: item.registrador || null,
    cuotas_pendientes_registro: item.cuotas_pendientes_registro ?? null,
    property_id: item.property_id || null,
    party_principal_id: item.party_principal_id || null,
  };
}

function buildDocumentoOtro(item) {
  return {
    ...commonFields(item),
    doc_type_detectado: item.doc_type || null,
    asunto: item.asunto || item.concepto || item.notas_documento || null,
    resumen: item.resumen || item.texto_extraido?.slice(0, 500) || null,
    partes_mencionadas: Array.isArray(item.partes_mencionadas) ? item.partes_mencionadas : null,
    importes_mencionados: Array.isArray(item.importes_mencionados) ? item.importes_mencionados : null,
    fecha_relevante: item.fecha_relevante || item.issue_date || null,
    fecha_emision: item.fecha_emision || item.issue_date || null,
    property_id: item.property_id || null,
    project_id: item.project_id || null,
    invoice_id: item.invoice_id || null,
  };
}

// ============================================================================
// ROUTING — doc_type → tabla + builder
// ============================================================================
const ROUTING = {
  // Legacy (NO TOCAR, passthrough)
  'factura':           { target: null, build: null },
  'rectificativa':     { target: null, build: null },
  'abono':             { target: null, build: null },
  'proforma':          { target: null, build: null },
  'ticket':            { target: null, build: null },
  'nomina':            { target: null, build: null },

  // Nuevos doc_types → tablas tipadas
  'contrato':          { target: 'contratos',           build: buildContrato },
  'escritura':         { target: 'escrituras',          build: buildEscritura },
  'seguro':            { target: 'seguros',             build: buildSeguro },
  'licencia':          { target: 'licencias',           build: buildLicencia },
  'certificacion_obra':{ target: 'certificaciones_obra',build: buildCertificacionObra },
  'certificacion':     { target: 'certificaciones_obra',build: buildCertificacionObra },
  'certificado':       { target: 'certificados',        build: buildCertificado },
  'informe':           { target: 'informes',            build: buildInforme },
  'modelo_fiscal':     { target: 'modelos_fiscales',    build: buildModeloFiscal },
  'justificante_pago': { target: 'justificantes_pago',  build: buildJustificantePago },
  'albaran':           { target: 'albaranes',           build: buildAlbaran },
  'presupuesto':       { target: 'presupuestos',        build: buildPresupuesto },
  'nota_simple':       { target: 'notas_simples',       build: buildNotaSimple },
  'otro':              { target: 'documentos_otros',    build: buildDocumentoOtro },
};

const rule = ROUTING[docType];

if (!rule || !rule.target) {
  // Legacy doc_type: passthrough. Supabase INSERT usa fallback chain
  // (target_payload undefined → cae a documents/quotes/supabase_payload)
  return {
    json: { ...item, _routing_applied: 'legacy_passthrough', _routing_doc_type: docType },
    binary: $input.item.binary,
  };
}

// Nuevo doc_type: setear target_table + target_payload
let target_payload;
try {
  target_payload = rule.build(item);
} catch (err) {
  // Build failure → fallback documentos_otros + flag review
  return {
    json: {
      ...item,
      target_table: 'documentos_otros',
      target_payload: buildDocumentoOtro({ ...item, asunto: `BUILD_ERROR: ${err.message}` }),
      needs_review: true,
      _routing_applied: 'build_error_fallback',
      _routing_doc_type: docType,
      _routing_error: err.message,
    },
    binary: $input.item.binary,
  };
}

return {
  json: {
    ...item,
    target_table: rule.target,
    target_payload,
    _routing_applied: 'new_table',
    _routing_doc_type: docType,
  },
  binary: $input.item.binary,
};
