const cfg = $('Config').first().json;

const item = $input.item.json;

const emailSubject = item.attachmentData?.emailSubject || item.emailSubject || '';
const emailFrom   = item.attachmentData?.emailFrom    || item.emailFrom    || '';
const emailDate   = item.attachmentData?.emailDate    || item.emailDate    || '';
const emailBody   = (item.attachmentData?.emailBody   || item.emailBody   || '').substring(0, 8000);

const emailContext = [
  emailSubject ? `Asunto: ${emailSubject}` : null,
  emailFrom    ? `Remitente: ${emailFrom}` : null,
  emailDate    ? `Fecha email: ${emailDate}` : null,
  emailBody    ? `Cuerpo del email:\n${emailBody}` : null,
].filter(Boolean).join('\n');

// === BUILD PROJECT CONTEXT ===
const proyectos_activos = item.proyectos_activos || [];
const clientes_activos  = item.clientes_activos  || [];

// Format project list with all available data
const proyectosContext = proyectos_activos.length > 0
  ? proyectos_activos.map(p => {
      const lines = [`• ${p.code} — ${p.name}`];
      if (p.address)        lines.push(`  Dirección: ${p.address}`);
      if (p.client?.name)   lines.push(`  Cliente: ${p.client.name}${p.client.nif_cif ? ' (NIF: '+p.client.nif_cif+')' : ''}`);
      if (p.start_date || p.end_date_planned)
                            lines.push(`  Período: ${p.start_date||'?'} → ${p.end_date_planned||'en curso'}`);
      if (p.type)           lines.push(`  Tipo: ${p.type.replace(/_/g,' ')}`);
      if (p.description)    lines.push(`  Descripción: ${p.description.substring(0,120)}`);
      if (p.presupuestos.length > 0)
                            lines.push(`  Presupuestos relacionados: ${p.presupuestos.join(', ')}`);
      lines.push(`  Estado: ${p.status}`);
      return lines.join('\n');
    }).join('\n\n')
  : 'Sin proyectos activos en este momento.';

// Format client list for name matching
const clientesContext = clientes_activos.length > 0
  ? clientes_activos.map(c =>
      `• ${c.name}${c.nif_cif ? ' (NIF: '+c.nif_cif+')' : ''}${c.company_name && c.company_name !== c.name ? ' / '+c.company_name : ''}`
    ).join('\n')
  : 'Sin datos de clientes.';

const prompt = `Analiza este documento y extrae información en formato JSON.
Devuelve SOLO el JSON, sin explicaciones ni markdown.

CONTEXTO DEL EMAIL:
${emailContext || 'No disponible'}

EMPRESA: Cathedral Group SL (CIF: B19761915), constructora e inmobiliaria en Madrid.
- EMITIDO POR Cathedral Group → direction="emitida"
- EMITIDO A Cathedral Group o sin indicación → direction="recibida"

🚨 REGLA CRÍTICA — NIF B19761915 (Cathedral House Investment SL):
Es el NIF de Cathedral. APARECE EN MUCHAS FACTURAS RECIBIDAS porque las facturas
proveedor → Cathedral incluyen "Facturado a: Cathedral House Investment SL CIF B19761915".
PROHIBIDO ABSOLUTAMENTE asignar B19761915 al campo nif_emisor en facturas recibidas.
Si ves B19761915 en una factura/documento:
  - direction="recibida" → B19761915 va a nif_receptor (NO a nif_emisor)
  - direction="emitida" → B19761915 va a nif_emisor, nif_receptor es del cliente
Si la ÚNICA empresa identificable es Cathedral (B19761915), revisar contexto:
casi siempre es factura emitida y el receptor está en otro lado del PDF.
NUNCA inventar nif_emisor=B19761915 para una factura recibida.

TIPOS DE DOCUMENTO (usa exactamente uno):
factura, proforma, rectificativa, abono, presupuesto, albaran, certificado, contrato,
nota_simple, escritura, licencia, informe, nomina, modelo_fiscal, seguro, ticket, justificante_pago, otro
- "albaran": lista materiales/productos SIN importe total o total=0
- "presupuesto": oferta sin número de factura ni IVA desglosado
- "factura": SOLO si tiene número de factura, base imponible e IVA explícitos
- "rectificativa"/"abono": anula o corrige otra factura

⚠️ REGLAS CRÍTICAS PARA IMPORTES E IVA:

1. LEE TODOS LOS NÚMEROS DEL DOCUMENTO antes de decidir cuál es base, IVA o total.
   Busca etiquetas exactas: "base imponible", "subtotal", "neto", "IVA", "cuota", "total", "a pagar".
2. NUNCA tomes un importe y le añadas IVA por encima.
   Si hay UN SOLO importe sin desglose → ese ES el total final.
3. VERIFICACIÓN OBLIGATORIA: importe_base + importe_iva ≈ importe_total (diff máx 0.10€).
4. importe_base SIEMPRE es MENOR que importe_total.
5. Si solo hay total visible: importe_base = total / (1 + iva%/100). importe_iva = total - base.
6. DOCUMENTOS ILEGIBLES: pon null en campos inciertos. Confianza ≤ 0.4.

════════════════════════════════════════════════════
CLASIFICACIÓN DE PROYECTO — LEE ESTO CON ATENCIÓN
════════════════════════════════════════════════════

PROYECTOS ACTIVOS DE CATHEDRAL GROUP:
${proyectosContext}

CLIENTES DE CATHEDRAL GROUP (para identificación):
${clientesContext}

INSTRUCCIONES PARA IDENTIFICAR EL PROYECTO:
Cruza TODOS los datos disponibles. Cada señal suma o resta confianza:

SEÑALES DE ALTA CONFIANZA (cada una sola ya puede dar 0.85+):
  1. Código de proyecto explícito en email/factura (ej: "OBR-2025-002")
  2. Número de presupuesto que coincide con algún proyecto (ej: "P-2025-001")
  3. Dirección de obra idéntica a la de un proyecto (calle + número)
  4. Nombre del cliente que coincide exactamente

SEÑALES DE MEDIA CONFIANZA (necesitas 2+ para 0.85):
  5. Dirección parcial (solo calle sin número, o ciudad)
  6. Nombre del proyecto mencionado (ej: "Buenavista 38")
  7. Nombre del cliente aproximado o razón social
  8. El concepto/líneas mencionan trabajos típicos de ese tipo de proyecto
  9. El remitente trabaja habitualmente en obras de ese tipo

SEÑALES DE BAJA CONFIANZA (solo contextualizan):
  10. Tipo de material compatible con tipo de proyecto
  11. Zona geográfica cercana a dirección del proyecto

BUSCA EN EL EMAIL:
- Asunto: ¿menciona calle, proyecto, cliente, presupuesto?
- Cuerpo: ¿hay referencias a "obra", "proyecto", número de presupuesto, dirección?
- Remitente: ¿el dominio/nombre sugiere un proveedor habitual de algún proyecto?

RESULTADO PROYECTO:
- Confianza ≥ ${cfg.PROJECT_LOYALTY_THRESHOLD} → "proyecto_code": "OBR-2025-002" (auto-asignar)
- Confianza ${cfg.LOW_CONFIDENCE_THRESHOLD}-${(cfg.PROJECT_LOYALTY_THRESHOLD - 0.01).toFixed(2)} → "proyecto_code": null, "proyecto_code_sugerido": "OBR-2025-002"
- Confianza < ${cfg.LOW_CONFIDENCE_THRESHOLD} → ambos null
- SIEMPRE incluye "proyecto_confianza" (0.0-1.0) y "proyecto_razon" (lista las señales usadas)
════════════════════════════════════════════════════

FORMATO JSON — extrae TODOS los campos:

⚠️ DETECCIÓN DE TIPO DOCUMENTO:
Antes de extraer, identifica el tipo:
  • "factura"        → factura/recibo/proforma/abono/rectificativa de un proveedor
  • "nomina"         → UNA nómina (1 trabajador, 1 mes)
  • "nomina_lote"    → MÚLTIPLES nóminas en el mismo PDF (1 página por trabajador)
  • "resumen_nominas" → listado contable mensual (1 fila por trabajador, totales)
  • "otro"           → cualquier otro

SI ES "nomina" o "nomina_lote": devuelve además un array "nominas" con un objeto
por trabajador con TODA la estructura de campos de nómina (ver al final).

SI ES "resumen_nominas": devuelve "resumen_nominas" con totales empresa.

SI ES "factura" sigue el formato estándar:

{
  "tipo": "factura",
  "direction": "recibida",
  "es_documento": true,
  "nif_emisor": "B12345678",
  "empresa": "Leroy Merlin S.A.",
  "numero_factura": "FAC-2024-001",
  "fecha": "YYYY-MM-DD",
  "fecha_vencimiento": "YYYY-MM-DD",
  "tipo_operacion_iva": "nacional",
  "iva_porcentaje": 21,
  "importe_base": 100.00,
  "importe_iva": 21.00,
  "irpf_porcentaje": 15,
  "importe_irpf": 15.00,
  "importe_total": 106.00,
  "concepto": "...",
  "lineas": [
    {"descripcion": "Pintura plástica blanca 15L", "cantidad": 3, "precio_unitario": 24.50, "importe": 73.50}
  ],
  "direccion_obra": "Calle Buenavista 38, Madrid",
  "forma_pago": "transferencia",
  "estado_pago": "pendiente",
  "es_rectificativa": false,
  "numero_factura_original": null,
  "categoria_gasto": "material",
  "proyecto_code": "FLP-2025-001",
  "proyecto_code_sugerido": null,
  "proyecto_confianza": 0.92,
  "proyecto_razon": "Dirección de obra coincide exactamente con Buenavista 38 + concepto menciona reforma",
  "confianza": 0.95,
  "razones": [],
  "iban_proveedor": "ES12 1234 5678 9012 3456 7890",
  "plazo_pago_dias": 30,
  "num_pedido": "PO-2025-001",
  "retencion_porcentaje": null,
  "retencion_importe": null,
  "periodo_facturacion": null,
  "moneda": "EUR",
  "nif_receptor": null,
  "nombre_receptor": null,
  // V3 (sesión 9/05/2026 noche tarde) — datos completos del CLIENTE para tabla 'clients'.
  // Aplica especialmente a facturas EMITIDAS (Cathedral → cliente). Si no aparecen, null.
  "cliente_direccion": null,        // Dirección postal del cliente (NO la dirección de obra)
  "cliente_ciudad": null,           // Ciudad del cliente
  "cliente_telefono": null,         // Si aparece en la factura
  "cliente_email": null,            // Si aparece en la factura
  "cliente_tipo": null,             // "particular" si NIF persona (X/Y/Z + 7-8 dígitos + letra), "empresa" si CIF
  "direccion_emisor": null,
  "inversion_sujeto_pasivo": false,
  "tipo_retencion": null,
  "detalles_iva": null,
  "codigo_verificacion": null,
  "num_albaran": null,
  "num_contrato": null,
  "validez_hasta": null,
  "notas_documento": null,
  "idioma": "es",
  "resumen_ia": "Párrafo corto (3-5 frases) con lo esencial del documento: quién emite, a quién, qué concepto, importe total y fecha.",
  "calidad_imagen": "alta",
  "tipo_documento_origen": "pdf_digital",
  "confianza_importe_total": 0.95,
  "confianza_fecha": 0.95,
  "confianza_nif": 0.95,
  "confianza_numero_factura": 0.95,
  "campos_dudosos": [],

  // ════════════════════════════════════════════════════
  // BLOQUES NUEVOS (sesión 29 — campos legales completos para Verifactu 2027,
  // libro IVA, granularidad IVA, construcción LOE, direcciones desglosadas)
  // Si NO aparecen en el documento, dejar null. NO inventar.
  // ════════════════════════════════════════════════════

  // [A] Verifactu 2027 (RD 1007/2023): solo si la factura ya tiene QR/CSV
  "tipo_factura_codigo": null,         // F1 completa | F2 simplificada | F3 sustitutiva | F4 recap.simpl. | F5 simpl.cualif. | R1-R5 rectificativa
  "clave_regimen_iva": null,           // 01 general | 02 export. | 03 bienes usados | 04 oro inv. | 05 ag.viajes | 06 grupo | 07 caja | 08 IPSI | 09 ag.viaj.serv | 10 cobros 3os | 11/12/13 alquileres | 14 obras AAPP | 15 cobro aplazado | 17 OSS-IOSS | 18 RE | 19 agric.
  "calificacion_operacion": null,      // S1 sujeta no exenta | S2 sujeta no exenta inv.suj.pasivo | N1 no sujeta art.7 LIVA | N2 no sujeta otros
  "qr_url_verifactu": null,            // URL servicio cotejo AEAT (post 1/1/2027)
  "csv_aeat": null,                    // Código Seguro Verificación devuelto por AEAT

  // [B] Libro IVA (RD 1624/1992)
  "fecha_registro_contable": null,     // ISO YYYY-MM-DD si aparece como sello de registro
  "computa_347": true,                 // FALSE solo si: SII, intracomunitaria 349, alquiler con retención 180
  "computa_349_clave": null,           // E entrega | A adquisición | T triangular | S serv prestado | I serv adquirido | M-H rectif. | R-D depósito

  // [C] Granularidad económica IVA (LIVA + Modelo 303 casillas 1-9)
  // Reglas: si una sola tarifa, poblar SOLO la suya. Si varias, todas las aplicables.
  "base_imponible_4": null,
  "cuota_iva_4": null,
  "base_imponible_10": null,
  "cuota_iva_10": null,
  "base_imponible_21": null,
  "cuota_iva_21": null,
  "base_imponible_0_exenta": null,     // Operaciones exentas art. 20 LIVA
  "recargo_eq_5_2": null,              // Recargo equivalencia productos 21%
  "recargo_eq_1_4": null,              // Recargo equivalencia productos 10%
  "recargo_eq_0_5": null,              // Recargo equivalencia productos 4%
  "recargo_eq_1_75": null,             // Recargo equivalencia tabaco

  // [D] Régimen y leyendas (LIVA art. 84, 20, 21 + RD 1619/2012 art. 6.1.l-p)
  "es_exenta": false,
  "motivo_exencion": null,             // E1 art.20 | E2 art.21 | E3 art.22 | E4 art.24 | E5 art.25 | E6 otros
  "base_legal_exencion": null,         // Texto: "art. 20.Uno.23 LIVA" si aparece
  "es_criterio_caja": false,           // TRUE si menciona "régimen criterio de caja"
  "es_intracomunitaria": false,        // TRUE si emisor/receptor de UE distinto España
  "es_exportacion": false,             // TRUE si receptor fuera UE
  "es_triangular": false,              // TRUE si "operación triangular"
  "leyenda_inversion": null,           // Texto literal de la leyenda ISP si aparece
  "leyenda_exencion": null,            // Texto literal exención

  // [E] Rectificativas estructuradas (RD 1619/2012 art. 15)
  "factura_origen_fecha": null,        // YYYY-MM-DD de la factura rectificada
  "tipo_rectificativa": null,          // S sustitución | I por diferencias
  "motivo_rectificacion_codigo": null, // R1 error derecho | R2 art.80 concurso | R3 art.80 incobr. | R4 otras | R5 rect.de simplif.
  "base_rectificada": null,
  "cuota_rectificada": null,

  // [F] Construcción / certificaciones de obra (LOE Ley 38/1999)
  // Solo poblar si el documento es certificación de obra
  "importe_certificado_a_origen": null,
  "importe_certificado_anterior": null,
  "importe_certificado_periodo": null,
  "retencion_garantia_porcentaje": null,  // Típicamente 5%
  "retencion_garantia_importe": null,
  "revision_precios": null,
  "director_obra_nif": null,            // NIF arquitecto director (LOE art. 12)
  "director_ejecucion_nif": null,       // NIF aparejador
  "poliza_decenal_numero": null,        // LOE art. 19 obra nueva residencial
  "poliza_decenal_aseguradora": null,
  "referencia_catastral": null,         // 20 caracteres (RD Legislativo 1/2004)

  // [G] Direcciones desglosadas emisor (RD 1619/2012 art. 6.1.e)
  // Reglas: extraer de la cabecera. Ej "Calle Mayor 12, 3º B, 28013 Madrid":
  // via_publica="Calle Mayor", numero="12", resto="3º B", cp="28013", municipio="Madrid".
  "emisor_via_publica": null,
  "emisor_numero": null,
  "emisor_resto_direccion": null,
  "emisor_codigo_postal": null,
  "emisor_municipio": null,
  "emisor_provincia": null,
  "emisor_codigo_pais": null,           // ISO 3166-1 alpha-2, default ES
  "emisor_nif_iva_intracom": null,      // ESBxxxx, DEYxxx, etc. (modelo 349)

  // [G] Direcciones desglosadas receptor
  "receptor_via_publica": null,
  "receptor_numero": null,
  "receptor_resto_direccion": null,
  "receptor_codigo_postal": null,
  "receptor_municipio": null,
  "receptor_provincia": null,
  "receptor_codigo_pais": null,
  "receptor_nif_iva_intracom": null,
  "receptor_codigo_dir3": null,         // Solo AAPP: FACe ej. "EA0009003"

  // [H] Pago granular
  "forma_pago_codigo": null,            // 01 contado | 02 SEPA | 03 transferencia | 04 letra | 05 confirming | 06 pagaré | 07 cheque | 08 tarjeta
  "referencia_remesa": null,            // Ref SEPA si pago domiciliado
  "num_plazos": null,

  // [J] Tipo cambio (si moneda != EUR)
  "tipo_cambio": null                   // Tipo BCE oficial a fecha devengo
}

REGLAS CAMPO A CAMPO:
- lineas: hasta 100 líneas de detalle (descripcion obligatoria, resto null si no aparece)
- empresa: nombre del emisor/proveedor (recibida) o receptor (emitida)
- tipo_operacion_iva: "nacional"/"intracomunitaria"/"importacion_exportacion"/"exenta"
- concepto: descripción específica. PROHIBIDO genéricos como "materiales", "servicios varios"
- direccion_obra: lugar físico de la obra/entrega (NO dirección fiscal)
- categoria_gasto: "material"/"mano_de_obra"/"subcontratas"/"alquiler"/"servicios"/null
- nif_emisor: CIF/NIF/VAT del emisor (con prefijo país si es europeo)
- fecha / fecha_vencimiento: ⚠️ CONFUSIÓN OCR FRECUENTE — los dígitos 3 y 5 se confunden habitualmente en documentos escaneados. REGLA: el año del documento NO puede ser posterior al email ni más de 2 años anterior. Si el email llega en ${new Date().getFullYear()} y extraes "${new Date().getFullYear() - 2}", RE-LEE el dígito dudoso: casi seguro es ${new Date().getFullYear()}. Valida siempre el año contra "Fecha email" del contexto.
- confianza: 0.85-1.0 todo OK | 0.60-0.84 dudas menores | 0.30-0.59 ambiguo | 0.10-0.29 ilegible
- razones: [] si confianza >= 0.85. Si hay errores/dudas en importes, descríbelos.
- proyecto_code: código exacto (ej "OBR-2025-002") si confianza proyecto >= ${cfg.PROJECT_LOYALTY_THRESHOLD}, sino null
- proyecto_code_sugerido: código si confianza ${cfg.LOW_CONFIDENCE_THRESHOLD}-${(cfg.PROJECT_LOYALTY_THRESHOLD - 0.01).toFixed(2)}, sino null
- proyecto_confianza: número entre 0 y 1 para la clasificación del proyecto
- proyecto_razon: texto explicando qué señales usaste para identificar (o descartar) el proyecto
- iban_proveedor: IBAN/cuenta bancaria del emisor para pago, si aparece (null si no)
- plazo_pago_dias: plazo de pago en días si se menciona explícitamente ("30 días", "pago a 60 días fecha factura"), null si no
- num_pedido: número de pedido, referencia, OR o similar del cliente, null si no aparece
- retencion_porcentaje: % de retención si es certificación de obra, null si no aplica
- retencion_importe: importe retenido si aparece explícitamente, null si no
- periodo_facturacion: período al que corresponde ("Marzo 2025", "Q1 2025"), útil para nóminas y alquileres, null si no aplica
- moneda: código ISO-4217. "EUR" por defecto. Indica si el doc está en otra moneda (USD, GBP, etc.)
- nif_receptor / nombre_receptor: datos del RECEPTOR. Para facturas emitidas por Cathedral Group: NIF y nombre del cliente. Para recibidas: null
- cliente_direccion / cliente_ciudad: SOLO en EMITIDAS. Dirección POSTAL/FISCAL del cliente (típicamente bajo "Facturado a:" o "Cliente:"). NO confundir con direccion_obra (lugar físico de la reforma) ni con direccion_emisor (Cathedral). Si la factura solo tiene "Facturado a: <nombre> <NIF>" sin dirección, dejar null.
- cliente_telefono / cliente_email: SOLO si aparecen en la factura emitida (raro). Null en recibidas siempre.
- cliente_tipo: "particular" si nif_receptor empieza por X/Y/Z o es 8 dígitos+letra (DNI/NIE persona física). "empresa" si nif_receptor empieza por letra A-W (CIF). Null si no hay nif_receptor o direction=recibida.
- direccion_emisor: dirección fiscal del emisor (proveedor en recibidas). NO confundir con direccion_obra
- inversion_sujeto_pasivo: true si el doc indica explícitamente "inversión del sujeto pasivo". Muy común en subcontratas de obra. IVA = 0% con esa mención
- tipo_retencion: "profesional" (art. 15 RIRPF), "arrendamiento" (art. 90 LIRPF), "obra" (ejecuciones de obra, art. 95), "otro", null si no hay retención IRPF
- detalles_iva: array SOLO si hay MÚLTIPLES tipos de IVA en el mismo doc. null si un solo tipo
- codigo_verificacion: código CSV/QR alfanumérico para verificar en sede electrónica (AEAT, colegios, notar���as, etc.)
- num_albaran: número de albarán o nota de entrega referenciada
- num_contrato: número de contrato referenciado en el documento
- validez_hasta: fecha de validez para presupuestos y pólizas (YYYY-MM-DD)
- notas_documento: condiciones especiales, alcance, observaciones relevantes del emisor (máx 400 chars)
- idioma: código ISO 639-1: "es" español, "en" inglés, "fr" francés, "de" alemán, etc.
- resumen_ia: párrafo corto (3-5 frases) con lo esencial: quién emite, a quién, qué concepto, importe total y fecha. Sé exhaustivo pero conciso — extrae la información importante sin repetir. NO hacer transcripción completa (para eso está el enlace a Drive). PRIORIDADES: 1) lineas[] completas y sin excepción, 2) todos los campos estructurados, 3) resumen_ia conciso.

  ════════════════════════════════════════════════════
  📋 FORMATO ESPECÍFICO PARA NÓMINAS (tipo="nomina" o "nomina_lote")
  ════════════════════════════════════════════════════

  Devuelve un array "nominas" con un objeto por trabajador. Si es 1 sola nómina, el array tiene 1 elemento.

  "nominas": [
    {
      // EMPRESA
      "empresa_nombre": "CATHEDRAL HOUSE INVESTMENT S.L.",
      "empresa_cif": "B19761915",
      "empresa_domicilio": "PS CASTELLANA, 40 8",
      "empresa_cp": "28046",
      "empresa_localidad": "MADRID",
      "empresa_cuenta_cotizacion_ss": "28-2745463-66",
      // TRABAJADOR
      "trabajador_nombre": "ARZUZA MEDINA, ERVIN RAFAEL",
      "trabajador_nif": "Z3747384E",
      "trabajador_num_afiliacion_ss": "32-10249132-85",
      "trabajador_categoria": "NIVEL VIII",
      "trabajador_grupo_cotizacion": 8,
      "trabajador_fecha_antiguedad": "2026-03-16",
      // PERIODO
      "periodo_desde": "2026-03-16",
      "periodo_hasta": "2026-03-31",
      "periodo_dias": 16,
      "periodo_mes": 3,
      "periodo_anio": 2026,
      "tipo_periodo": "ordinario",
      // DEVENGOS
      "salario_base": 544.32,
      "plus_actividad": 282.00,
      "plus_extrasalarial": 118.08,
      "incentivos": 15.60,
      "paga_extra_prorrata": 0,
      "horas_extra_normales": 0,
      "dietas": 0,
      "plus_transporte": 0,
      "total_devengado": 960.00,
      // DEDUCCIONES TRABAJADOR
      "ss_cont_comunes_base": 1151.76,
      "ss_cont_comunes_pct": 4.85,
      "ss_cont_comunes_importe": 55.86,
      "ss_desempleo_base": 1151.76,
      "ss_desempleo_pct": 1.55,
      "ss_desempleo_importe": 17.85,
      "ss_formacion_base": 1151.76,
      "ss_formacion_pct": 0.10,
      "ss_formacion_importe": 1.15,
      "ss_total_trabajador": 74.86,
      "irpf_base": 960.00,
      "irpf_porcentaje": 8.66,
      "irpf_importe": 83.14,
      "anticipos": 0,
      "total_deducciones": 158.00,
      "liquido_a_percibir": 802.00,
      // BASES COTIZACIÓN
      "base_cont_comunes": 1151.76,
      "base_cont_profesionales": 1151.76,
      "base_irpf": 960.00,
      "importe_remuneracion_mensual": 960.00,
      "importe_prorrata_pagas_extras": 191.76,
      // APORTACIÓN EMPRESA SS
      "emp_cont_comunes_pct": 24.35,
      "emp_cont_comunes_importe": 280.46,
      "emp_at_ep_pct": 6.70,
      "emp_at_ep_importe": 77.16,
      "emp_desempleo_pct": 5.50,
      "emp_desempleo_importe": 63.35,
      "emp_formacion_pct": 0.60,
      "emp_formacion_importe": 6.91,
      "emp_fogasa_pct": 0.20,
      "emp_fogasa_importe": 2.30,
      "ss_total_empresa": 430.18,
      "coste_total_empresa": 1390.18,
      // CONFIANZA POR CAMPO
      "confianza_importe_total": 0.95,
      "confianza_fecha": 0.95,
      "confianza_nif": 0.95
    }
    // ... más trabajadores si es lote
  ]

  ═�����══════════════════════════════════════════════════
  📊 FORMATO ESPECÍFICO PARA RESUMEN CONTABLE (tipo="resumen_nominas")
  ════════════════════════════════════════════════════

  "resumen_nominas": {
    "empresa_nombre": "CATHEDRAL HOUSE INVESTMENT S.L.",
    "empresa_cif": "B19761915",
    "empresa_codigo_gestoria": "34",
    "cuenta_cotizacion_ss": "28274546366",
    "centro_trabajo": "PS. CATELLANA 40",
    "periodo_mes": 3,
    "periodo_anio": 2026,
    "num_trabajadores": 2,
    "total_dias": 35,
    "total_base_cont_comunes": 1181.87,
    "total_base_cont_profesionales": 1181.87,
    "total_base_irpf": 985.02,
    "total_retribuciones": 985.02,
    "total_deduccion_trabajador": 76.83,
    "total_costes_empresa": 441.41,
    "total_retencion_irpf": 83.14,
    "total_otras_retenciones": 0,
    "total_liquido": 825.05,
    "trabajadores_detalle": [
      {"codigo": "1", "nombre": "ARZUZA MEDINA, ERVIN RAFAEL", "dias": 16, "base_cc": 1151.76, "retribucion": 960.00, "deduccion": 74.86, "irpf": 83.14, "liquido": 802.00, "coste_empresa": 430.18},
      {"codigo": "2", "nombre": "MALTE CHILES, HIPOLITO JOSELITO", "dias": 19, "base_cc": 30.11, "retribucion": 25.02, "deduccion": 1.97, "irpf": 0, "liquido": 23.05, "coste_empresa": 11.23}
    ]
  }

  ════════════════════════════════════════════════════
  ⚠️ EVALUACIÓN DE CALIDAD Y CONFIANZA POR CAMPO CRÍTICO
  ════════════════════════════════════════════════════

  - calidad_imagen: evalúa la calidad VISUAL del documento que estás procesando
      "alta": PDF nativo digital, texto seleccionable, números nítidos
      "media": escaneado decente pero con algo de ruido, fotos con iluminación correcta, ligera baja resolución
      "baja": escaneo borroso, fotos con poca luz/movidas, manchas/anotaciones encima del texto, líneas torcidas, manuscrito legible pero impreciso

  - tipo_documento_origen: identifica el ORIGEN del documento
      "pdf_digital": generado por software, texto vectorial perfecto
      "pdf_escaneado": PDF que en realidad es imagen escaneada
      "foto": foto del documento (móvil, cámara) — variable calidad
      "manuscrito": escrito a mano (boli, lápiz) — alto riesgo de error de lectura, especialmente en números (3↔5↔8, 0↔6, 1↔7)
      "mixto": documento parcialmente impreso parcialmente manuscrito (típico en albaranes y notas de entrega)

  - confianza_X (importe_total, fecha, nif, numero_factura): tu CERTEZA específica para CADA campo crítico (0.0-1.0)
      Si el documento es manuscrito y los dígitos del importe NO se ven claros → confianza_importe_total: 0.5
      Si el NIF es legible perfecto pero la fecha está borrosa → confianza_nif: 0.95, confianza_fecha: 0.6
      Si TODO está nítido en pantalla → todas a 0.9-1.0
      Sé HONESTO. Es MUY importante: una factura de 3.500€ puede leerse como 5.500€ y meter al usuario en problemas. Si tienes la mínima duda en un dígito clave, baja la confianza para que el usuario revise.

  - campos_dudosos: array con los nombres EXACTOS de los campos donde tu confianza es <= 0.75
      Ejemplos: ["importe_total", "fecha", "nif_emisor"]
      Si todo está claro: array vacío []
      Esto NO es un campo de cortesía: úsalo cuando realmente tengas dudas — el usuario revisa esos campos manualmente comparando con el documento.

  REGLA DE ORO: si el documento es "manuscrito" o calidad_imagen="baja", baja AUTOMÁTICAMENTE la confianza global a < 0.80 incluso si los datos parecen correctos. La calidad del original determina el techo de confianza.`;

// === FIX SESIÓN 31 (1/05/2026): recuperar binary cross-node si los HTTP intermedios lo perdieron ===
// Los nodos HTTP (Llamar GPT-mini, Supabase GET Duplicado, Obtener Proyectos/Clientes/Presupuestos)
// reemplazan el item con su response y pierden binary. Recuperamos del primer nodo Code/IF que lo
// tenía garantizado en cada path (Adaptador Webhook→Pipeline para reprocess, o Filtrar Extensión / Code in JavaScript5 / Preparar Pre-Clasificador para Gmail Trigger).
function recuperarBinary() {
  if ($input.item.binary && Object.keys($input.item.binary).length > 0) {
    return $input.item.binary;
  }
  const fuentes = [
    'Adaptador Webhook→Pipeline',  // path webhook (reprocesador)
    'Preparar Pre-Clasificador',   // path Gmail (común a todos)
    'Filtrar Extensión',           // IF preserva binary del input
    'Code in JavaScript5',         // path Gmail histórico
  ];
  for (const nodeName of fuentes) {
    try {
      const ref = $(nodeName).first();
      if (ref && ref.binary && Object.keys(ref.binary).length > 0) {
        return ref.binary;
      }
    } catch (e) { /* nodo no en path actual, probar siguiente */ }
  }
  console.error('[Construir Prompt] WARN: binary no recuperable de ninguna fuente');
  return $input.item.binary || {};
}

return {
  json: { ...item, analysisPrompt: prompt },
  binary: recuperarBinary()
};

