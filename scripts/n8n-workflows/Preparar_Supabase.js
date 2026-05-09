// ─── Hook del verificador algorítmico (sesión 25) ───
// Si el nodo "Llamar Verificador" se ejecutó, leemos su resultado y lo aplicamos
// al payload final marcando needs_review + concatenando razones en ai_razones.
let __verifierResult = null;
try {
  __verifierResult = $('Llamar Verificador').first().json;
} catch (e) {
  // Verificador no ejecutado o falló — continuar sin él (defense-in-depth)
}
function __applyVerifier(payload) {
  if (!__verifierResult) return payload;
  if (__verifierResult.needs_review) {
    payload.needs_review = true;
    const razones = (__verifierResult.review_reasons || []).map(r => `§VERIFICADOR:${r}`);
    payload.ai_razones = (payload.ai_razones || []).concat(razones);
  }
  return payload;
}
// ─── Fin hook ───


// ─── Hook Mistral OCR (sesión 28, Fase D) ───
let __mistralDiscrepancies = [];
try {
  const r = $('Reconciliar Gemini vs Mistral OCR').first().json;
  __mistralDiscrepancies = r._mistral_discrepancies || [];
} catch (e) {
  // Mistral OCR no se ejecutó - continuar sin
}
function __applyMistral(payload) {
  if (!payload || __mistralDiscrepancies.length === 0) return payload;
  const critical = __mistralDiscrepancies.some(d => /nif_emisor|importe_total|empresa_cif/i.test(d));
  if (critical) payload.needs_review = true;
  payload.ai_razones = (payload.ai_razones || []).concat(__mistralDiscrepancies);
  return payload;
}
// ─── Fin hook Mistral ───


// ─── Validación checksum NIF/NIE/CIF (algoritmos oficiales españoles) ───
function _validateSpanishId(id) {
  if (!id || typeof id !== 'string') return { valid: false, type: 'unknown', reason: 'vacío o no string' };
  const clean = id.toUpperCase().trim().replace(/[\s-]/g, '');
  // NIF: 8 dígitos + letra
  // NIE: X|Y|Z + 7 dígitos + letra
  // CIF: letra + 7 dígitos + dígito o letra control
  const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(clean)) {
    // NIE
    const prefix = { X: '0', Y: '1', Z: '2' }[clean[0]];
    const num = parseInt(prefix + clean.substring(1, 8));
    const expected = LETRAS[num % 23];
    return { valid: clean[8] === expected, type: 'NIE', expected_letter: expected, given_letter: clean[8], reason: clean[8] === expected ? null : `letra control esperada '${expected}', recibida '${clean[8]}'` };
  }
  if (/^[0-9]{8}[A-Z]$/.test(clean)) {
    // NIF
    const num = parseInt(clean.substring(0, 8));
    const expected = LETRAS[num % 23];
    return { valid: clean[8] === expected, type: 'NIF', expected_letter: expected, given_letter: clean[8], reason: clean[8] === expected ? null : `letra control esperada '${expected}', recibida '${clean[8]}'` };
  }
  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(clean)) {
    // CIF (empresas)
    const digits = clean.substring(1, 8);
    let sumPar = 0, sumImpar = 0;
    for (let i = 0; i < 7; i++) {
      const d = parseInt(digits[i]);
      if (i % 2 === 0) {
        // Posición impar (1, 3, 5, 7) en numeración 1-indexed
        const doubled = d * 2;
        sumImpar += Math.floor(doubled / 10) + (doubled % 10);
      } else {
        sumPar += d;
      }
    }
    const total = sumPar + sumImpar;
    const controlNum = (10 - (total % 10)) % 10;
    const controlLetter = 'JABCDEFGHI'[controlNum];
    const provided = clean[8];
    const validNum = provided === String(controlNum);
    const validLetter = provided === controlLetter;
    // Las primeras letras (P, Q, R, S, W) requieren letra; (A, B, E, H) requieren número; otras admiten ambos
    const valid = validNum || validLetter;
    return { valid, type: 'CIF', expected_letter: controlLetter, expected_num: String(controlNum), given_letter: provided, reason: valid ? null : `control esperado '${controlLetter}' o '${controlNum}', recibido '${provided}'` };
  }
  return { valid: false, type: 'unknown', reason: 'formato no reconocido (esperado: NIF 12345678X, NIE X1234567Y, CIF B12345678)' };
}


// ═══════════════════════════════════════════════════════════════
// EARLY ROUTING: si es payrolls o payroll_summaries, manejar aquí
// y NO ejecutar el resto (que está pensado para invoices/documents)
// ═══════════════════════════════════════════════════════════════
const _earlyItem = $input.item.json;
const _earlyTarget = _earlyItem.target_table || 'invoices';
const _earlyR = _earlyItem.resultado_vision || _earlyItem.resultado_filesapi || {};

function _parseAmt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[€\s]/g,'').replace(/\./g,'').replace(',','.'));
  return isNaN(n) ? null : n;
}
function _parseDate(v) {
  if (!v) return null;
  const m1 = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = String(v).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m2) {
    const yr = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return `${yr}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  return null;
}

if (_earlyTarget === 'payrolls') {
  const nominas = Array.isArray(_earlyR.nominas) ? _earlyR.nominas : [];
  if (nominas.length === 0) {
    // No hay nóminas extraídas → marcar error
    return [{
      json: {
        ..._earlyItem,
        target_table: 'payrolls',
        supabase_payload: null,
        _payroll_error: 'GPT no devolvió array nominas',
        needs_review: true
      },
      binary: $input.item.binary
    }];
  }

  // Mapear cada nómina a un item separado (split → N filas en INSERT)
  const items = nominas.map((nom, idx) => {
    const periodoDesde = _parseDate(nom.periodo_desde);
    const periodoHasta = _parseDate(nom.periodo_hasta);
    let mes = nom.periodo_mes;
    let anio = nom.periodo_anio;
    if (!mes && periodoHasta) mes = parseInt(periodoHasta.split('-')[1]);
    if (!anio && periodoHasta) anio = parseInt(periodoHasta.split('-')[0]);

    const payload = {
      // Empresa
      empresa_nombre: nom.empresa_nombre || null,
      empresa_cif: nom.empresa_cif || null,
      empresa_domicilio: nom.empresa_domicilio || null,
      empresa_cp: nom.empresa_cp || null,
      empresa_localidad: nom.empresa_localidad || null,
      empresa_cuenta_cotizacion_ss: nom.empresa_cuenta_cotizacion_ss || null,
      // Trabajador
      trabajador_nombre: nom.trabajador_nombre || null,
      trabajador_nif: nom.trabajador_nif || null,
      trabajador_num_afiliacion_ss: nom.trabajador_num_afiliacion_ss || null,
      trabajador_categoria: nom.trabajador_categoria || null,
      trabajador_grupo_cotizacion: nom.trabajador_grupo_cotizacion ? parseInt(nom.trabajador_grupo_cotizacion) : null,
      trabajador_fecha_antiguedad: _parseDate(nom.trabajador_fecha_antiguedad),
      trabajador_centro: nom.trabajador_centro || null,
      trabajador_departamento: nom.trabajador_departamento || null,
      trabajador_codigo: nom.trabajador_codigo || null,
      // Período
      periodo_desde: periodoDesde,
      periodo_hasta: periodoHasta,
      periodo_dias: nom.periodo_dias ? parseInt(nom.periodo_dias) : null,
      periodo_horas: _parseAmt(nom.periodo_horas),
      periodo_mes: mes,
      periodo_anio: anio,
      tipo_periodo: nom.tipo_periodo || 'ordinario',
      // Devengos
      salario_base: _parseAmt(nom.salario_base) || 0,
      plus_actividad: _parseAmt(nom.plus_actividad) || 0,
      plus_extrasalarial: _parseAmt(nom.plus_extrasalarial) || 0,
      plus_convenio: _parseAmt(nom.plus_convenio) || 0,
      plus_antiguedad: _parseAmt(nom.plus_antiguedad) || 0,
      plus_nocturnidad: _parseAmt(nom.plus_nocturnidad) || 0,
      plus_peligrosidad: _parseAmt(nom.plus_peligrosidad) || 0,
      plus_responsabilidad: _parseAmt(nom.plus_responsabilidad) || 0,
      incentivos: _parseAmt(nom.incentivos) || 0,
      comisiones: _parseAmt(nom.comisiones) || 0,
      horas_extra_normales: _parseAmt(nom.horas_extra_normales) || 0,
      horas_extra_estructurales: _parseAmt(nom.horas_extra_estructurales) || 0,
      paga_extra_prorrata: _parseAmt(nom.paga_extra_prorrata) || 0,
      paga_extra_completa: _parseAmt(nom.paga_extra_completa) || 0,
      vacaciones_no_disfrutadas: _parseAmt(nom.vacaciones_no_disfrutadas) || 0,
      otras_percepciones_salariales: _parseAmt(nom.otras_percepciones_salariales) || 0,
      dietas: _parseAmt(nom.dietas) || 0,
      plus_transporte: _parseAmt(nom.plus_transporte) || 0,
      kilometraje: _parseAmt(nom.kilometraje) || 0,
      indemnizaciones: _parseAmt(nom.indemnizaciones) || 0,
      otras_percepciones_no_salariales: _parseAmt(nom.otras_percepciones_no_salariales) || 0,
      total_devengado: _parseAmt(nom.total_devengado) || 0,
      // Deducciones SS trabajador
      ss_cont_comunes_base: _parseAmt(nom.ss_cont_comunes_base),
      ss_cont_comunes_pct: _parseAmt(nom.ss_cont_comunes_pct),
      ss_cont_comunes_importe: _parseAmt(nom.ss_cont_comunes_importe) || 0,
      ss_desempleo_base: _parseAmt(nom.ss_desempleo_base),
      ss_desempleo_pct: _parseAmt(nom.ss_desempleo_pct),
      ss_desempleo_importe: _parseAmt(nom.ss_desempleo_importe) || 0,
      ss_formacion_base: _parseAmt(nom.ss_formacion_base),
      ss_formacion_pct: _parseAmt(nom.ss_formacion_pct),
      ss_formacion_importe: _parseAmt(nom.ss_formacion_importe) || 0,
      ss_horas_extra_fuerza_mayor_pct: _parseAmt(nom.ss_horas_extra_fuerza_mayor_pct),
      ss_horas_extra_fuerza_mayor_importe: _parseAmt(nom.ss_horas_extra_fuerza_mayor_importe) || 0,
      ss_horas_extra_no_estructurales_pct: _parseAmt(nom.ss_horas_extra_no_estructurales_pct),
      ss_horas_extra_no_estructurales_importe: _parseAmt(nom.ss_horas_extra_no_estructurales_importe) || 0,
      ss_solidaridad_pct: _parseAmt(nom.ss_solidaridad_pct),
      ss_solidaridad_importe: _parseAmt(nom.ss_solidaridad_importe) || 0,
      ss_total_trabajador: _parseAmt(nom.ss_total_trabajador) || 0,
      // IRPF
      irpf_base: _parseAmt(nom.irpf_base),
      irpf_porcentaje: _parseAmt(nom.irpf_porcentaje),
      irpf_importe: _parseAmt(nom.irpf_importe) || 0,
      // Otras deducciones
      anticipos: _parseAmt(nom.anticipos) || 0,
      productos_especie: _parseAmt(nom.productos_especie) || 0,
      embargo_judicial: _parseAmt(nom.embargo_judicial) || 0,
      cuota_sindical: _parseAmt(nom.cuota_sindical) || 0,
      prestamos_empresa: _parseAmt(nom.prestamos_empresa) || 0,
      otras_deducciones: _parseAmt(nom.otras_deducciones) || 0,
      total_deducciones: _parseAmt(nom.total_deducciones) || 0,
      liquido_a_percibir: _parseAmt(nom.liquido_a_percibir) || 0,
      // Bases
      base_cont_comunes: _parseAmt(nom.base_cont_comunes),
      base_cont_profesionales: _parseAmt(nom.base_cont_profesionales),
      base_irpf: _parseAmt(nom.base_irpf),
      importe_remuneracion_mensual: _parseAmt(nom.importe_remuneracion_mensual),
      importe_prorrata_pagas_extras: _parseAmt(nom.importe_prorrata_pagas_extras),
      // Aportación EMPRESA
      emp_cont_comunes_pct: _parseAmt(nom.emp_cont_comunes_pct),
      emp_cont_comunes_importe: _parseAmt(nom.emp_cont_comunes_importe) || 0,
      emp_at_ep_pct: _parseAmt(nom.emp_at_ep_pct),
      emp_at_ep_importe: _parseAmt(nom.emp_at_ep_importe) || 0,
      emp_desempleo_pct: _parseAmt(nom.emp_desempleo_pct),
      emp_desempleo_importe: _parseAmt(nom.emp_desempleo_importe) || 0,
      emp_formacion_pct: _parseAmt(nom.emp_formacion_pct),
      emp_formacion_importe: _parseAmt(nom.emp_formacion_importe) || 0,
      emp_fogasa_pct: _parseAmt(nom.emp_fogasa_pct),
      emp_fogasa_importe: _parseAmt(nom.emp_fogasa_importe) || 0,
      emp_horas_extra_importe: _parseAmt(nom.emp_horas_extra_importe) || 0,
      emp_solidaridad_importe: _parseAmt(nom.emp_solidaridad_importe) || 0,
      ss_total_empresa: _parseAmt(nom.ss_total_empresa) || 0,
      coste_total_empresa: _parseAmt(nom.coste_total_empresa) || 0,
      // Pago
      payment_status: 'pendiente',
      // Drive (se rellena en PATCH posterior)
      drive_url: null,
      drive_file_id: null,
      drive_page_in_pdf: idx + 1,  // si lote, página = idx+1
      original_filename: _earlyItem.fileName || _earlyItem.originalFileName || null,
      file_hash: _earlyItem.fileHash || `${_earlyItem.emailMessageId || ''}_${_earlyItem.fileName || ''}_${nom.trabajador_nif || idx}`,
      // Origen
      source: 'email_automatico',
      email_message_id: _earlyItem.emailMessageId || null,
      email_account: _earlyItem.emailAccount || _earlyItem.emailFrom || null,
      email_from: _earlyItem.emailFrom || null,
      email_subject: _earlyItem.emailSubject || null,
      email_date: _earlyItem.emailDate || null,
      // IA
      ai_confidence: _parseAmt(_earlyItem.conf_vision) || 0.5,
      needs_review: false,
      review_status: 'pendiente',
      // Crudos
      raw_extracted_jsonb: nom
    };

    // Validación NIF/NIE del trabajador
    const _payroll_nif_check = _validateSpanishId(payload.trabajador_nif);
    let _payroll_razones = [];
    if (!_payroll_nif_check.valid && payload.trabajador_nif) {
      payload.needs_review = true;
      _payroll_razones.push(`§NIF_INVALIDO:${payload.trabajador_nif}: ${_payroll_nif_check.reason} (sugerencia: ${_payroll_nif_check.expected_letter || _payroll_nif_check.expected_num || '?'})`);
      console.log(`[Validación NIF] Inválido: ${(payload.trabajador_nif || '').slice(0,3)}**** — ${_payroll_nif_check.reason}`);
    }
    // Validación NIF/CIF empresa
    const _payroll_emp_nif_check = _validateSpanishId(payload.empresa_cif);
    if (!_payroll_emp_nif_check.valid && payload.empresa_cif) {
      payload.needs_review = true;
      _payroll_razones.push(`§NIF_EMPRESA_INVALIDO:${payload.empresa_cif}: ${_payroll_emp_nif_check.reason}`);
    }
    // Validación importes nómina (líquido = devengado - deducciones, tolerancia 1€)
    if (payload.total_devengado && payload.total_deducciones != null && payload.liquido_a_percibir != null) {
      const expected = payload.total_devengado - payload.total_deducciones;
      const diff = Math.abs(payload.liquido_a_percibir - expected);
      if (diff > 1.0) {
        payload.needs_review = true;
        _payroll_razones.push(`§IMPORTE_REVISION:Líquido incoherente: devengado(${payload.total_devengado})-deducciones(${payload.total_deducciones})=${expected.toFixed(2)} pero líquido=${payload.liquido_a_percibir} (diff ${diff.toFixed(2)}€)`);
      }
    }
    // Validación fecha del período (mismo año fiscal)
    if (payload.periodo_anio && (payload.periodo_anio < new Date().getFullYear() - 1 || payload.periodo_anio > new Date().getFullYear() + 1)) {
      payload.needs_review = true;
      _payroll_razones.push(`§FECHA_REVISION:Año período ${payload.periodo_anio} fuera de rango razonable`);
    }
    // Inyectar razones al payload
    if (_payroll_razones.length > 0) {
      payload.ai_razones = _payroll_razones;
    }
    // Modelo 111 trimestre + Modelo 190 año (autocompletar para futuras agregaciones fiscales)
    if (payload.periodo_mes && payload.periodo_anio) {
      payload.modelo_111_trimestre = `Q${Math.ceil(payload.periodo_mes / 3)}`;
      payload.modelo_190_anio = payload.periodo_anio;
    }

    return {
      json: {
        ..._earlyItem,
        target_table: 'payrolls',
        supabase_payload: __applyMistral(__applyVerifier(payload)),
        // Para Router Carpeta Destino y siguiente nodo de drive
        empresa: payload.empresa_nombre,
        nombre_para_drive: `${anio}${String(mes).padStart(2,'0')}_nomina_${(payload.trabajador_nombre || 'trab').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30)}`,
        // Para Confianza Baja?
        needs_review: false
      },
      binary: $input.item.binary
    };
  });

  return items;  // N items, 1 por nómina
}

if (_earlyTarget === 'payroll_summaries') {
  const r = _earlyR.resumen_nominas || {};
  const periodoMes = r.periodo_mes ? parseInt(r.periodo_mes) : null;
  const periodoAnio = r.periodo_anio ? parseInt(r.periodo_anio) : null;

  const payload = {
    empresa_nombre: r.empresa_nombre || null,
    empresa_cif: r.empresa_cif || null,
    empresa_codigo_gestoria: r.empresa_codigo_gestoria || null,
    cuenta_cotizacion_ss: r.cuenta_cotizacion_ss || null,
    centro_trabajo: r.centro_trabajo || null,
    periodo_mes: periodoMes,
    periodo_anio: periodoAnio,
    num_trabajadores: r.num_trabajadores ? parseInt(r.num_trabajadores) : null,
    total_dias: r.total_dias ? parseInt(r.total_dias) : null,
    total_base_cont_comunes: _parseAmt(r.total_base_cont_comunes) || 0,
    total_base_cont_profesionales: _parseAmt(r.total_base_cont_profesionales) || 0,
    total_base_irpf: _parseAmt(r.total_base_irpf) || 0,
    total_retribuciones: _parseAmt(r.total_retribuciones) || 0,
    total_deduccion_trabajador: _parseAmt(r.total_deduccion_trabajador) || 0,
    total_costes_especie: _parseAmt(r.total_costes_especie) || 0,
    total_valor_especie: _parseAmt(r.total_valor_especie) || 0,
    total_costes_empresa: _parseAmt(r.total_costes_empresa) || 0,
    total_retencion_irpf: _parseAmt(r.total_retencion_irpf) || 0,
    total_otras_retenciones: _parseAmt(r.total_otras_retenciones) || 0,
    total_liquido: _parseAmt(r.total_liquido) || 0,
    deduccion_formacion_continua: _parseAmt(r.deduccion_formacion_continua) || 0,
    coste_flc_periodo: _parseAmt(r.coste_flc_periodo) || 0,
    recargo_liquidacion: _parseAmt(r.recargo_liquidacion) || 0,
    trabajadores_detalle_jsonb: Array.isArray(r.trabajadores_detalle) ? r.trabajadores_detalle : null,
    drive_url: null,
    drive_file_id: null,
    original_filename: _earlyItem.fileName || null,
    file_hash: _earlyItem.fileHash || null,
    source: 'email_automatico',
    email_message_id: _earlyItem.emailMessageId || null,
    email_account: _earlyItem.emailAccount || _earlyItem.emailFrom || null,
    email_from: _earlyItem.emailFrom || null,
    email_subject: _earlyItem.emailSubject || null,
    email_date: _earlyItem.emailDate || null,
    ai_confidence: _parseAmt(_earlyItem.conf_vision) || 0.5,
    needs_review: false,
    review_status: 'pendiente',
    raw_extracted_jsonb: r
  };

  return [{
    json: {
      ..._earlyItem,
      target_table: 'payroll_summaries',
      supabase_payload: __applyMistral(__applyVerifier(payload)),
      empresa: payload.empresa_nombre,
      nombre_para_drive: `${periodoAnio}${String(periodoMes).padStart(2,'0')}_resumen_nominas`,
      needs_review: false
    },
    binary: $input.item.binary
  }];
}

// Si llegamos aquí, es invoices/documents → continúa con código original

const cfg = $('Config').first().json;

// Recuperar campos perdidos por HTTP nodes (Llamar Verificador) desde upstream
let _itemRaw = $input.item.json;
try {
  const _upstream = $('Decidir Tabla Destino').first().json;
  if (_upstream && typeof _upstream === 'object') {
    // Solo restaurar campos que el HTTP eliminó (no presentes o null en _itemRaw)
    const _restored = {};
    for (const k of Object.keys(_upstream)) {
      if (!(k in _itemRaw) || _itemRaw[k] === null || _itemRaw[k] === undefined) {
        _restored[k] = _upstream[k];
      }
    }
    _itemRaw = { ..._upstream, ..._itemRaw, ..._restored };
  }
} catch (e) {
  // Decidir Tabla Destino puede no existir en flujos legacy — seguir sin restore
}
const item = _itemRaw;

const TYPE_MAP = {
  'factura': 'factura', 'invoice': 'factura',
  'proforma': 'proforma',
  'rectificativa': 'rectificativa', 'rectificativo': 'rectificativa',
  'abono': 'abono', 'nota de credito': 'abono', 'nota_credito': 'abono',
  'presupuesto': 'presupuesto', 'albaran': 'albaran', 'certificado': 'certificado',
  'contrato': 'contrato', 'nota_simple': 'nota_simple', 'escritura': 'escritura',
  'licencia': 'licencia', 'informe': 'informe', 'nomina': 'nomina',
  'modelo_fiscal': 'modelo_fiscal', 'seguro': 'seguro', 'ticket': 'ticket',
  'justificante_pago': 'justificante_pago'
};

const VALID_IVA_OP = ['nacional','intracomunitaria','importacion_exportacion','exenta'];

const doc_type = TYPE_MAP[(item.tipo || '').toLowerCase()] || 'otro';
const direction = ['emitida', 'recibida'].includes((item.direction || '').toLowerCase())
  ? item.direction.toLowerCase() : 'recibida';

const parseAmount = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

const parseDate = (v) => {
  if (!v) return null;
  const d = String(v).match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (d) return `${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`;
  const d2 = String(v).match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
  if (d2) return `${d2[3]}-${d2[2].padStart(2,'0')}-${d2[1].padStart(2,'0')}`;
  return null;
};

const addDays = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// Importes
const amount_base_direct = parseAmount(item.importe_base);
const amount_total = parseAmount(item.importe_total);
const vat_amount = parseAmount(item.importe_iva);
const irpf_amount = parseAmount(item.importe_irpf);
const amount_base = amount_base_direct !== null
  ? amount_base_direct
  : (amount_total !== null && vat_amount !== null)
    ? Math.round((amount_total - vat_amount + (irpf_amount || 0)) * 100) / 100
    : null;

// Tipo operación IVA
const tipo_op_raw = (item.tipo_operacion_iva || 'nacional').toLowerCase();
const tipo_operacion_iva = VALID_IVA_OP.includes(tipo_op_raw) ? tipo_op_raw : 'nacional';

// Confianza
let ai_confidence = typeof item.confianza === 'number'
  ? Math.min(1, Math.max(0, item.confianza))
  : (typeof item.ai_confidence === 'number' ? item.ai_confidence : 0.3);

let razones = Array.isArray(item.razones) ? [...item.razones] : [];

// Validación cruzada importes (solo para operaciones nacionales con IVA)
if (tipo_operacion_iva === 'nacional' && amount_base !== null && vat_amount !== null && amount_total !== null) {
  const computed = Math.round((amount_base + vat_amount - (irpf_amount || 0)) * 100) / 100;
  const diff = Math.abs(computed - amount_total);
  if (diff > 0.10) {
    razones.push(`Discrepancia: base(${amount_base})+IVA(${vat_amount})-IRPF(${irpf_amount||0})=${computed} ≠ total(${amount_total})`);
    ai_confidence = Math.min(ai_confidence, 0.55);
  }
}

const sanitizeRazones = (r) => {
  if (!r || r.length === 0) return null;
  const clean = r.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  return clean.length > 0 ? clean : null;
};

let needs_review = ai_confidence < cfg.LOW_CONFIDENCE_THRESHOLD;
let review_status_override = null; // 'error' si fecha imposible (probable OCR mal leído)

// Encode project suggestion in ai_razones for panel display
const proyecto_sugerido = item.proyecto_code_sugerido || null;
const proyecto_razon_final = item.proyecto_razon || '';
if (proyecto_sugerido) {
  const conf_str = item.proyecto_confianza ? Math.round(item.proyecto_confianza * 100) + '%' : '?';
  razones.push(`§PROYECTO_SUGERIDO:${proyecto_sugerido}:${conf_str}:${proyecto_razon_final.substring(0,120)}`);
}


const VALID_PAYMENT_STATUS = ['pendiente', 'pagada', 'vencida', 'parcial', 'cancelada'];
const VALID_PAYMENT_METHOD = ['transferencia', 'domiciliacion', 'tarjeta', 'efectivo', 'cheque', 'compensacion', 'otros'];
const VALID_CATEGORIA = ['material', 'mano_de_obra', 'subcontratas', 'alquiler', 'servicios', 'otros'];

const payment_status_raw = (item.estado_pago || '').toLowerCase();
const payment_status = VALID_PAYMENT_STATUS.includes(payment_status_raw) ? payment_status_raw : 'pendiente';

const payment_method_raw = (item.forma_pago || '').toLowerCase();
const payment_method = VALID_PAYMENT_METHOD.includes(payment_method_raw) ? payment_method_raw : null;

const categoria_raw = (item.categoria_gasto || '').toLowerCase();
// V2 (sesión 9/05/2026 noche tarde): categoria_gasto solo aplica en RECIBIDAS
// (es un campo de gasto). En emitidas NO aplica → null forzado.
const categoria_gasto = (direction === 'recibida' && VALID_CATEGORIA.includes(categoria_raw))
  ? categoria_raw
  : null;

const es_rectificativa = item.es_rectificativa === true
  || doc_type === 'rectificativa'
  || doc_type === 'abono';

// V2 (sesión 9/05/2026 noche tarde): la columna `empresa` representa "la otra parte"
// de la transacción (cliente en emitidas, proveedor en recibidas).
const empresa = direction === 'emitida'
  ? (item.nombre_receptor || item.empresa || null)
  : (item.empresa || item.proveedor || null);

// Líneas de partida: hasta 100 (cubre cualquier factura real)
const lineas = Array.isArray(item.lineas) && item.lineas.length > 0
  ? item.lineas.slice(0, 100).map(l => ({
      descripcion: String(l.descripcion || '').trim(),
      cantidad: l.cantidad != null ? parseAmount(l.cantidad) : null,
      precio_unitario: l.precio_unitario != null ? parseAmount(l.precio_unitario) : null,
      importe: l.importe != null ? parseAmount(l.importe) : null,
    })).filter(l => l.descripcion)
  : null;

// Fecha de vencimiento
const issue_date = parseDate(item.fecha_emision);
const due_date_from_doc = parseDate(item.fecha_vencimiento);
let due_date, due_date_estimated;
if (due_date_from_doc) {
  due_date = due_date_from_doc;
  due_date_estimated = false;
} else if (issue_date) {
  due_date = addDays(issue_date, 21);
  due_date_estimated = true;
} else {
  due_date = null;
  due_date_estimated = false;
}

// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN DE FECHA — la contabilidad es trimestral, fechas fuera del año fiscal
// son sospechosas. GPT-4o vision puede confundir 3↔5↔8 en escaneados.
// ═══════════════════════════════════════════════════════════════
if (issue_date) {
  const today = new Date();
  const issueDate = new Date(issue_date + 'T12:00:00');
  const monthsDiff = (today.getFullYear() - issueDate.getFullYear()) * 12 + (today.getMonth() - issueDate.getMonth());
  // monthsDiff < 0 → fecha futura | > 0 → fecha pasada

  if (monthsDiff < -1) {
    // Más de 1 mes en el futuro → ERROR claro (imposible)
    review_status_override = 'error';
    needs_review = true;
    razones.push(`§FECHA_ERROR:Fecha futura imposible: ${issue_date} (probable OCR mal leído año/mes)`);
    console.log(`[Validación fecha] ERROR fecha futura: ${issue_date}`);
  } else if (monthsDiff > 12) {
    // Más de 12 meses atrás → ERROR (muy raro, casi seguro confusión OCR)
    review_status_override = 'error';
    needs_review = true;
    razones.push(`§FECHA_ERROR:Fecha demasiado antigua (hace ${monthsDiff} meses): ${issue_date}. Probable confusión OCR año (3↔5↔8).`);
    console.log(`[Validación fecha] ERROR fecha demasiado antigua: ${issue_date} (${monthsDiff} meses)`);
  } else if (monthsDiff > 6) {
    // 6-12 meses atrás → REVISIÓN (sospechoso, contabilidad trimestral)
    needs_review = true;
    razones.push(`§FECHA_REVISION:Fecha fuera del trimestre/año en curso (hace ${monthsDiff} meses): ${issue_date}`);
    console.log(`[Validación fecha] REVISIÓN fecha sospechosa: ${issue_date} (${monthsDiff} meses)`);
  }
} else {
  // Sin fecha extraída → marcar revisión
  needs_review = true;
  razones.push('§FECHA_REVISION:Sin fecha de emisión extraída');
}

// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN DE IMPORTES — coherencia base/iva/total + límites razonables
// ═══════════════════════════════════════════════════════════════
const total = parseAmount(item.importe_total);
const base = parseAmount(item.importe_base);
const iva = parseAmount(item.importe_iva);

if (total !== null) {
  // Importes negativos → ERROR (solo válidos en abonos/rectificativas)
  if (total < 0 && doc_type !== 'abono' && doc_type !== 'rectificativa') {
    review_status_override = 'error';
    needs_review = true;
    razones.push(`§IMPORTE_ERROR:Importe negativo (${total}€) en doc_type=${doc_type}. Solo abonos/rectificativas permiten negativos.`);
    console.log(`[Validación importe] ERROR negativo: ${total}€`);
  }
  // Importes absurdamente altos (>500k€) → ERROR (probable confusión OCR coma/punto o dígito de más)
  else if (Math.abs(total) > 500000) {
    review_status_override = 'error';
    needs_review = true;
    razones.push(`§IMPORTE_ERROR:Importe absurdamente alto (${total.toLocaleString('es-ES')}€). Probable confusión OCR (separador miles, dígito extra).`);
    console.log(`[Validación importe] ERROR muy alto: ${total}€`);
  }
  // Importes altos pero plausibles (50k-500k) → REVISIÓN
  else if (Math.abs(total) > 50000) {
    needs_review = true;
    razones.push(`§IMPORTE_REVISION:Importe alto (${total.toLocaleString('es-ES')}€). Verificar visualmente.`);
    console.log(`[Validación importe] REVISIÓN alto: ${total}€`);
  }
  // Coherencia base + iva ≈ total (tolerancia 1€ por redondeos)
  if (base !== null && iva !== null) {
    const expected = base + iva;
    const diff = Math.abs(total - expected);
    if (diff > 1.0) {
      needs_review = true;
      razones.push(`§IMPORTE_REVISION:Incoherencia base+iva≠total: ${base}+${iva}=${expected.toFixed(2)} pero total=${total} (diff ${diff.toFixed(2)}€)`);
      console.log(`[Validación importe] REVISIÓN incoherencia: base${base}+iva${iva}≠total${total}`);
    }
  }
} else {
  // Sin importe extraído (puede ser válido para presupuestos sin fijar)
  if (doc_type === 'factura' || doc_type === 'rectificativa' || doc_type === 'abono') {
    needs_review = true;
    razones.push('§IMPORTE_REVISION:Sin importe total extraído en factura. Verificar.');
  }
}


// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN B5 — IMPORTE vs HISTÓRICO DEL PROVEEDOR (sesión 28, 28/04/2026)
// Detecta outliers significativos comparando el importe nuevo con el promedio
// histórico del mismo proveedor. Solo aplica a facturas/rectificativas/abonos
// con baseline mínimo (>=3 facturas históricas con importe).
// ═══════════════════════════════════════════════════════════════
if (total !== null && total > 0 && (doc_type === 'factura' || doc_type === 'rectificativa' || doc_type === 'abono')) {
  let _historialImportes = [];
  try {
    const _hraw = $('Buscar Historial Proveedor').first().json;
    if (Array.isArray(_hraw)) _historialImportes = _hraw;
  } catch (e) {
    // Sin historial accesible — no aplicar B5
  }

  // Solo facturas/rectificativas/abonos con importe positivo (mismo perfil)
  const _baseline = _historialImportes
    .filter(r => r && typeof r === 'object')
    .filter(r => ['factura', 'rectificativa', 'abono'].includes(r.doc_type))
    .map(r => parseAmount(r.amount_total))
    .filter(a => typeof a === 'number' && a > 0);

  if (_baseline.length >= 3) {
    // Promedio recortado (descartar mínimo y máximo si hay >=5 muestras)
    const _sorted = [..._baseline].sort((a, b) => a - b);
    const _trimmed = _sorted.length >= 5 ? _sorted.slice(1, -1) : _sorted;
    const _avg = _trimmed.reduce((s, x) => s + x, 0) / _trimmed.length;

    if (_avg > 0) {
      const _ratio = total / _avg;
      if (_ratio > 1.5 || _ratio < 0.5) {
        needs_review = true;
        const _direction = _ratio > 1.5 ? 'superior' : 'inferior';
        const _pct = Math.round(Math.abs(_ratio - 1) * 100);
        razones.push(
          `§IMPORTE_OUTLIER:Importe ${total.toLocaleString('es-ES')}€ ${_pct}% ${_direction} al promedio histórico ` +
          `(${_avg.toFixed(2)}€, ${_baseline.length} facturas previas del proveedor)`
        );
        console.log(`[Validación B5] Outlier: ${total}€ vs avg ${_avg.toFixed(2)}€ (${_baseline.length} históricas)`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CALIDAD + CONFIANZAS POR CAMPO (añadido por Parsear Visión, 26/04/2026)
// ═══════════════════════════════════════════════════════════════
const razonesCalidad = Array.isArray(item._razones_calidad) ? item._razones_calidad : [];
if (razonesCalidad.length > 0) {
  // Si hay alguna razón calidad/manuscrito/dudoso → marcar revisión
  needs_review = true;
  razones.push(...razonesCalidad);
  console.log(`[Validación calidad] needs_review=true por: ${razonesCalidad.length} razones (calidad/manuscrito/dudoso)`);
}

const supabase_payload = {
  ai_provider: item.ai_provider || null,
  doc_type,
  direction,
  number:                   item.numero_factura || null,
  empresa,
  concept:                  item.concepto || item.descripcion || null,
  amount_base,
  vat_pct:                  item.iva_porcentaje != null ? parseAmount(item.iva_porcentaje) : null,
  vat_amount,
  irpf_rate:                item.irpf_porcentaje != null ? parseAmount(item.irpf_porcentaje) : null,
  irpf_amount,
  amount_total,
  issue_date,
  due_date,
  due_date_estimated,
  payment_status,
  payment_method,
  // V2 (sesión 9/05): supplier_nif solo en recibidas. En emitidas, B19761915
  // (Cathedral) sería el emisor real → no es supplier, va a NULL.
  supplier_nif:             direction === 'recibida'
                              ? (item.nif_emisor || item.nif_proveedor || item.supplier_nif || null)
                              : null,
  es_rectificativa,
  numero_factura_original:  item.numero_factura_original || null,
  categoria_gasto,
  direccion_obra:           item.direccion_obra || null,
  tipo_operacion_iva,
  lineas,
  drive_url:                null,
  drive_file_id:            null,
  original_filename:        item.originalFileName || item.fileName || null,
  file_hash:                item.fileHash || null,
  email_message_id:         item.emailMessageId || item.attachmentData?.emailMessageId || null,
  email_account:            item.emailAccount || item.emailFrom || item.from || null,
  proyecto_code:            item.proyecto_code || null,
  project_id:               item.project_id || null,
  // V2 (sesión 9/05): branch direction. Emitida → client_id (cliente), Recibida → supplier_id (proveedor).
  supplier_id:              direction === 'recibida' ? (item.supplier_id_resolved || null) : null,
  client_id:                direction === 'emitida'  ? (item.client_id_resolved   || null) : null,
  proyecto_confianza:       item.proyecto_confianza || null,
  source:                   'email_automatico',
  ai_confidence,
  needs_review,
  review_status: review_status_override || undefined,
  ai_razones:               sanitizeRazones(razones) || [],
  // Campos nuevos 04/04/2026
  iban_proveedor:           item.iban_proveedor || null,
  plazo_pago_dias:          item.plazo_pago_dias != null ? parseInt(item.plazo_pago_dias) || null : null,
  num_pedido:               item.num_pedido || null,
  retencion_porcentaje:     item.retencion_porcentaje != null ? parseAmount(item.retencion_porcentaje) : null,
  retencion_importe:        item.retencion_importe != null ? parseAmount(item.retencion_importe) : null,
  periodo_facturacion:      item.periodo_facturacion || null,
  // B1 (sesión 27, 28/04/2026): 14 mappings de campos GPT que la BD descartaba
  nif_receptor:             item.nif_receptor || null,
  nombre_receptor:          item.nombre_receptor || null,
  direccion_emisor:         item.direccion_emisor || null,
  inversion_sujeto_pasivo:  item.inversion_sujeto_pasivo === true || item.inversion_sujeto_pasivo === 'true' || false,
  tipo_retencion:           item.tipo_retencion || null,
  detalles_iva:             item.detalles_iva || null,
  codigo_verificacion:      item.codigo_verificacion || null,
  num_albaran:              item.num_albaran || null,
  num_contrato:             item.num_contrato || null,
  validez_hasta:            (typeof item.validez_hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.validez_hasta)) ? item.validez_hasta : null,
  idioma:                   item.idioma || 'es',
  resumen_ia:               item.resumen_ia || null,
  proyecto_sugerido_code:   item.proyecto_code_sugerido || null,
  proyecto_sugerido_razon:  item.proyecto_razon || null,
  // === Bloque 1 sesión 29: Verifactu + Libro IVA + Granular IVA + Construcción + Direcciones ===
  // [A] Verifactu 2027
  tipo_factura_codigo:        item.tipo_factura_codigo || null,
  // SESIÓN 30 fix: clave_regimen_iva no existe en quotes (Verifactu invoices-only)
  // SESIÓN 30 fix: calificacion_operacion no existe en quotes (Verifactu invoices-only)
  qr_url_verifactu:           item.qr_url_verifactu || null,
  csv_aeat:                   item.csv_aeat || null,
  // [B] Libro IVA
  fecha_registro_contable:    (typeof item.fecha_registro_contable === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.fecha_registro_contable)) ? item.fecha_registro_contable : null,
  computa_347:                item.computa_347 !== false,
  computa_349_clave:          item.computa_349_clave || null,
  // [C] Granularidad económica IVA
  base_imponible_4:           item.base_imponible_4 != null ? parseAmount(item.base_imponible_4) : null,
  cuota_iva_4:                item.cuota_iva_4 != null ? parseAmount(item.cuota_iva_4) : null,
  base_imponible_10:          item.base_imponible_10 != null ? parseAmount(item.base_imponible_10) : null,
  cuota_iva_10:               item.cuota_iva_10 != null ? parseAmount(item.cuota_iva_10) : null,
  base_imponible_21:          item.base_imponible_21 != null ? parseAmount(item.base_imponible_21) : null,
  cuota_iva_21:               item.cuota_iva_21 != null ? parseAmount(item.cuota_iva_21) : null,
  base_imponible_0_exenta:    item.base_imponible_0_exenta != null ? parseAmount(item.base_imponible_0_exenta) : null,
  recargo_eq_5_2:             item.recargo_eq_5_2 != null ? parseAmount(item.recargo_eq_5_2) : null,
  recargo_eq_1_4:             item.recargo_eq_1_4 != null ? parseAmount(item.recargo_eq_1_4) : null,
  recargo_eq_0_5:             item.recargo_eq_0_5 != null ? parseAmount(item.recargo_eq_0_5) : null,
  recargo_eq_1_75:            item.recargo_eq_1_75 != null ? parseAmount(item.recargo_eq_1_75) : null,
  // [D] Régimen y leyendas
  es_exenta:                  item.es_exenta === true || item.es_exenta === 'true' || false,
  motivo_exencion:            item.motivo_exencion || null,
  base_legal_exencion:        item.base_legal_exencion || null,
  es_criterio_caja:           item.es_criterio_caja === true || false,
  es_intracomunitaria:        item.es_intracomunitaria === true || false,
  es_exportacion:             item.es_exportacion === true || false,
  es_triangular:              item.es_triangular === true || false,
  leyenda_inversion:          item.leyenda_inversion || null,
  leyenda_exencion:           item.leyenda_exencion || null,
  // [E] Rectificativas estructuradas
  factura_origen_fecha:       (typeof item.factura_origen_fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.factura_origen_fecha)) ? item.factura_origen_fecha : null,
  tipo_rectificativa:         item.tipo_rectificativa || null,
  motivo_rectificacion_codigo: item.motivo_rectificacion_codigo || null,
  base_rectificada:           item.base_rectificada != null ? parseAmount(item.base_rectificada) : null,
  cuota_rectificada:          item.cuota_rectificada != null ? parseAmount(item.cuota_rectificada) : null,
  // [F] Construcción / certificaciones LOE
  importe_certificado_a_origen:   item.importe_certificado_a_origen != null ? parseAmount(item.importe_certificado_a_origen) : null,
  importe_certificado_anterior:   item.importe_certificado_anterior != null ? parseAmount(item.importe_certificado_anterior) : null,
  importe_certificado_periodo:    item.importe_certificado_periodo != null ? parseAmount(item.importe_certificado_periodo) : null,
  retencion_garantia_porcentaje:  item.retencion_garantia_porcentaje != null ? parseAmount(item.retencion_garantia_porcentaje) : null,
  retencion_garantia_importe:     item.retencion_garantia_importe != null ? parseAmount(item.retencion_garantia_importe) : null,
  revision_precios:           item.revision_precios != null ? parseAmount(item.revision_precios) : null,
  director_obra_nif:          item.director_obra_nif || null,
  director_ejecucion_nif:     item.director_ejecucion_nif || null,
  poliza_decenal_numero:      item.poliza_decenal_numero || null,
  poliza_decenal_aseguradora: item.poliza_decenal_aseguradora || null,
  referencia_catastral:       (typeof item.referencia_catastral === 'string' && item.referencia_catastral.length === 20) ? item.referencia_catastral : null,
  // [G] Direcciones desglosadas emisor
  emisor_via_publica:         item.emisor_via_publica || null,
  emisor_numero:              item.emisor_numero || null,
  emisor_resto_direccion:     item.emisor_resto_direccion || null,
  emisor_codigo_postal:       item.emisor_codigo_postal || null,
  emisor_municipio:           item.emisor_municipio || null,
  emisor_provincia:           item.emisor_provincia || null,
  emisor_codigo_pais:         item.emisor_codigo_pais || (item.es_intracomunitaria || item.es_exportacion ? null : 'ES'),
  emisor_nif_iva_intracom:    item.emisor_nif_iva_intracom || null,
  // [G] Direcciones desglosadas receptor
  receptor_via_publica:       item.receptor_via_publica || null,
  receptor_numero:            item.receptor_numero || null,
  receptor_resto_direccion:   item.receptor_resto_direccion || null,
  receptor_codigo_postal:     item.receptor_codigo_postal || null,
  receptor_municipio:         item.receptor_municipio || null,
  receptor_provincia:         item.receptor_provincia || null,
  receptor_codigo_pais:       item.receptor_codigo_pais || (item.es_intracomunitaria || item.es_exportacion ? null : 'ES'),
  receptor_nif_iva_intracom:  item.receptor_nif_iva_intracom || null,
  receptor_codigo_dir3:       item.receptor_codigo_dir3 || null,
  // [H] Pago granular
  forma_pago_codigo:          item.forma_pago_codigo || null,
  referencia_remesa:          item.referencia_remesa || null,
  num_plazos:                 item.num_plazos != null ? parseInt(item.num_plazos) || null : null,
  // [J] Tipo cambio
  tipo_cambio:                item.tipo_cambio != null ? parseAmount(item.tipo_cambio) : null,
  // [K] Capa "extraer todo": texto OCR Mistral + datos brutos JSON Gemini
  texto_completo: (() => {
    try {
      const m = $('Llamar Mistral OCR').first().json;
      if (m && Array.isArray(m.pages)) {
        return m.pages.map(p => p && p.markdown ? p.markdown : '').filter(Boolean).join('\n\n').slice(0, 65000);
      }
    } catch(e) {}
    return null;
  })(),
  datos_brutos: (() => {
    try {
      const brutos = {};
      for (const k in item) {
        if (k.startsWith('_')) continue;
        if (['binaryPropertyName','attachmentData','fileName','originalFileName','mimeType','fileExtension','fileSize'].includes(k)) continue;
        brutos[k] = item[k];
      }
      return brutos;
    } catch(e) { return null; }
  })(),
  // Raw GPT extraction
  ai_data: {
    tipo: item.tipo, direction: item.direction, nif_emisor: item.nif_emisor,
    empresa: item.empresa, numero_factura: item.numero_factura,
    fecha: item.fecha_emision || item.fecha, fecha_vencimiento: item.fecha_vencimiento,
    tipo_operacion_iva: item.tipo_operacion_iva, iva_porcentaje: item.iva_porcentaje,
    importe_base: item.importe_base, importe_iva: item.importe_iva,
    irpf_porcentaje: item.irpf_porcentaje, importe_irpf: item.importe_irpf,
    importe_total: item.importe_total, concepto: item.concepto,
    lineas: item.lineas, direccion_obra: item.direccion_obra,
    forma_pago: item.forma_pago, estado_pago: item.estado_pago,
    es_rectificativa: item.es_rectificativa, numero_factura_original: item.numero_factura_original,
    categoria_gasto: item.categoria_gasto, proyecto_code: item.proyecto_code,
    proyecto_code_sugerido: item.proyecto_code_sugerido,
    proyecto_confianza: item.proyecto_confianza, proyecto_razon: item.proyecto_razon,
    confianza: item.confianza, razones: item.razones,
    iban_proveedor: item.iban_proveedor, plazo_pago_dias: item.plazo_pago_dias,
    num_pedido: item.num_pedido, retencion_porcentaje: item.retencion_porcentaje,
    retencion_importe: item.retencion_importe, periodo_facturacion: item.periodo_facturacion,
    moneda: item.moneda, nif_receptor: item.nif_receptor, nombre_receptor: item.nombre_receptor,
    direccion_emisor: item.direccion_emisor, inversion_sujeto_pasivo: item.inversion_sujeto_pasivo,
    tipo_retencion: item.tipo_retencion, detalles_iva: item.detalles_iva,
    codigo_verificacion: item.codigo_verificacion, num_albaran: item.num_albaran,
    num_contrato: item.num_contrato, validez_hasta: item.validez_hasta,
    notas_documento: item.notas_documento, idioma: item.idioma,
    texto_extraido: item.texto_extraido
  }
};

const doc_category = cfg.DOC_CATEGORY_MAP[doc_type] || 'corporativo';

const razones_text = sanitizeRazones(razones) ? sanitizeRazones(razones).join(' | ') : '';
const ai_summary_parts = [
  `Tipo: ${doc_type}`,
  item.proveedor ? `Entidad: ${item.proveedor}` : null,
  `Confianza: ${Math.round(ai_confidence * 100)}%`,
  razones_text || null
].filter(Boolean);

const documents_payload = {
  ai_provider: item.ai_provider || null,
  doc_type,
  filename: item.originalFileName || item.fileName || null,
  original_filename: item.originalFileName || item.fileName || null,
  file_hash: item.fileHash || null,
  drive_url: null,
  drive_file_id: null,
  email_account: item.emailAccount || item.emailFrom || item.from || null,
  source: 'email_automatico',
  project_id: item.project_id || null,
  ai_summary: ai_summary_parts.join(' | ') || null,
  notes: razones_text || null,
  texto_completo: item.texto_extraido || null
};

// B6 (sesión 27, 28/04/2026): payload específico para tabla quotes.
// Reusa columnas existentes de quotes: items, total, subtotal, vat_total, valid_until.
// Los items son las lineas extraídas de GPT mapeadas a la estructura de items de quotes.
const _quotesItems = (item.lineas || []).map(l => ({
  description: l.descripcion || l.concepto || '',
  quantity: parseAmount(l.cantidad) || 1,
  unit_price: parseAmount(l.precio_unitario) || parseAmount(l.precio) || 0,
  total: parseAmount(l.importe) || parseAmount(l.total) || 0,
  vat_pct: parseAmount(l.iva_pct) || 21,
}));
const _quotesNumber = item.numero_factura || item.numero_presupuesto || ('AUTO-' + Date.now());
const quotes_payload = {
  ai_provider: item.ai_provider || null,
  number: _quotesNumber,
  status: 'borrador',
  direction: direction || 'recibida',
  source: 'email_automatico',
  // Items + totales (mapeo a columnas existentes de quotes)
  items: _quotesItems,
  subtotal: amount_base,
  vat_total: vat_amount,
  total: amount_total,
  valid_until: (typeof item.validez_hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.validez_hasta)) ? item.validez_hasta : null,
  // Metadata empresa/proveedor
  supplier_nif: item.nif_emisor || item.nif_proveedor || item.supplier_nif || null,
  empresa: empresa,
  concept: item.concepto || item.descripcion || null,
  direccion_obra: item.direccion_obra || null,
  issue_date: issue_date,
  // IA
  ai_confidence,
  ai_data: supabase_payload.ai_data,
  ai_razones: sanitizeRazones(razones) || [],
  ai_summary: ai_summary_parts.join(' | ') || null,
  resumen_ia: item.resumen_ia || null,
  needs_review,
  review_status: review_status_override || 'pendiente',
  // Trazabilidad email + Drive
  email_message_id: item.emailMessageId || item.attachmentData?.emailMessageId || null,
  email_account: item.emailAccount || item.emailFrom || item.from || null,
  file_hash: item.fileHash || null,
  drive_url: null,
  drive_file_id: null,
  original_filename: item.originalFileName || item.fileName || null,
  // Proyecto sugerido
  project_id: item.project_id || null,
  supplier_id: item.supplier_id_resolved || null,
  proyecto_code: item.proyecto_code || null,
  proyecto_sugerido_code: item.proyecto_code_sugerido || null,
  proyecto_sugerido_razon: item.proyecto_razon || null,
  proyecto_confianza: item.proyecto_confianza || null,
  // Comerciales / fiscales
  num_pedido: item.num_pedido || null,
  num_albaran: item.num_albaran || null,
  num_contrato: item.num_contrato || null,
  codigo_verificacion: item.codigo_verificacion || null,
  iban_proveedor: item.iban_proveedor || null,
  plazo_pago_dias: item.plazo_pago_dias != null ? parseInt(item.plazo_pago_dias) || null : null,
  idioma: item.idioma || 'es',
  moneda_original: item.moneda || 'EUR',
  notes: razones_text || null,

  // === Bloque 1 sesión 29: Verifactu/Libro IVA/granular IVA/construcción/direcciones para QUOTES ===
  tipo_factura_codigo:        item.tipo_factura_codigo || null,
  // SESIÓN 30 fix: clave_regimen_iva no existe en quotes (Verifactu invoices-only)
  // SESIÓN 30 fix: calificacion_operacion no existe en quotes (Verifactu invoices-only)
  base_imponible_4:           item.base_imponible_4 != null ? parseAmount(item.base_imponible_4) : null,
  cuota_iva_4:                item.cuota_iva_4 != null ? parseAmount(item.cuota_iva_4) : null,
  base_imponible_10:          item.base_imponible_10 != null ? parseAmount(item.base_imponible_10) : null,
  cuota_iva_10:               item.cuota_iva_10 != null ? parseAmount(item.cuota_iva_10) : null,
  base_imponible_21:          item.base_imponible_21 != null ? parseAmount(item.base_imponible_21) : null,
  cuota_iva_21:               item.cuota_iva_21 != null ? parseAmount(item.cuota_iva_21) : null,
  base_imponible_0_exenta:    item.base_imponible_0_exenta != null ? parseAmount(item.base_imponible_0_exenta) : null,
  importe_certificado_a_origen:   item.importe_certificado_a_origen != null ? parseAmount(item.importe_certificado_a_origen) : null,
  importe_certificado_anterior:   item.importe_certificado_anterior != null ? parseAmount(item.importe_certificado_anterior) : null,
  importe_certificado_periodo:    item.importe_certificado_periodo != null ? parseAmount(item.importe_certificado_periodo) : null,
  retencion_garantia_porcentaje:  item.retencion_garantia_porcentaje != null ? parseAmount(item.retencion_garantia_porcentaje) : null,
  retencion_garantia_importe:     item.retencion_garantia_importe != null ? parseAmount(item.retencion_garantia_importe) : null,
  referencia_catastral:       (typeof item.referencia_catastral === 'string' && item.referencia_catastral.length === 20) ? item.referencia_catastral : null,
  emisor_via_publica:         item.emisor_via_publica || null,
  emisor_numero:              item.emisor_numero || null,
  emisor_codigo_postal:       item.emisor_codigo_postal || null,
  emisor_municipio:           item.emisor_municipio || null,
  emisor_provincia:           item.emisor_provincia || null,
  emisor_codigo_pais:         item.emisor_codigo_pais || 'ES',
  emisor_nif_iva_intracom:    item.emisor_nif_iva_intracom || null,
  forma_pago_codigo:          item.forma_pago_codigo || null,
  texto_completo: (() => {
    try {
      const m = $('Llamar Mistral OCR').first().json;
      if (m && Array.isArray(m.pages)) {
        return m.pages.map(p => p && p.markdown ? p.markdown : '').filter(Boolean).join('\n\n').slice(0, 65000);
      }
    } catch(e) {}
    return null;
  })(),
  datos_brutos: (() => {
      try {
        const brutos = {};
        for (const k in item) {
          if (k.startsWith('_')) continue;
          if (['binaryPropertyName','attachmentData','fileName','originalFileName','mimeType','fileExtension','fileSize'].includes(k)) continue;
          brutos[k] = item[k];
        }
        return brutos;
      } catch(e) { return null; }
    })(),
};

const target_table = item.target_table || 'invoices';

// Aplicar wrappers (Verificador algorítmico + Mistral OCR cross-check) a los 3 payloads
const _final_supabase = __applyMistral(__applyVerifier(supabase_payload));
const _final_documents = __applyMistral(__applyVerifier(documents_payload));
const _final_quotes = __applyMistral(__applyVerifier(quotes_payload));
return {
  json: { ...item, supabase_payload: _final_supabase, documents_payload: _final_documents, quotes_payload: _final_quotes, needs_review, target_table },
  binary: $input.item.binary
};


