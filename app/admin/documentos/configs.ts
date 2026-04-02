import type { DocumentsViewConfig } from './DocumentsView'

export const ESCRITURAS_CONFIG: DocumentsViewConfig = {
  category: 'legal',
  title: 'Escrituras y Registral',
  docTypes: [
    { value: 'escritura', label: 'Escritura' },
    { value: 'nota_simple', label: 'Nota simple' },
    { value: 'acta_notarial', label: 'Acta notarial' },
    { value: 'poder_notarial', label: 'Poder notarial' },
  ],
  tableColumns: [
    { key: 'notaria', label: 'Notaría', render: d => d.datos_extraidos?.notaria as string ?? '—' },
    { key: 'fecha_documento', label: 'Fecha', render: d => d.fecha_documento ? new Date(d.fecha_documento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
    { key: 'importe', label: 'Valor', render: d => d.importe != null ? d.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—' },
  ],
  fields: [
    { key: 'inmueble', label: 'Inmueble / Dirección', type: 'text' },
    { key: 'referencia_catastral', label: 'Referencia catastral', type: 'text' },
    { key: 'notaria', label: 'Notaría', type: 'text' },
    { key: 'numero_protocolo', label: 'Nº protocolo', type: 'text' },
    { key: 'registro_propiedad', label: 'Registro de la propiedad', type: 'text' },
    { key: 'superficie_m2', label: 'Superficie (m²)', type: 'number' },
    { key: 'cargas', label: 'Cargas / Gravámenes', type: 'textarea' },
    { key: 'condiciones_clave', label: 'Condiciones clave', type: 'textarea' },
  ],
}

export const CONTRATOS_CONFIG: DocumentsViewConfig = {
  category: 'legal',
  title: 'Contratos',
  docTypes: [
    { value: 'contrato_obra', label: 'Contrato de obra' },
    { value: 'contrato_servicios', label: 'Contrato de servicios' },
    { value: 'contrato_arrendamiento', label: 'Arrendamiento' },
    { value: 'contrato_suministro', label: 'Suministro' },
    { value: 'contrato_compraventa', label: 'Compraventa' },
    { value: 'otro_contrato', label: 'Otro' },
  ],
  tableColumns: [
    { key: 'partes', label: 'Partes', render: d => d.partes ?? '—' },
    { key: 'fecha_documento', label: 'Firma', render: d => d.fecha_documento ? new Date(d.fecha_documento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
    { key: 'importe', label: 'Importe', render: d => d.importe != null ? d.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—' },
  ],
  fields: [
    { key: 'objeto', label: 'Objeto del contrato', type: 'textarea' },
    { key: 'duracion', label: 'Duración', type: 'text' },
    { key: 'forma_pago', label: 'Forma de pago', type: 'text' },
    { key: 'penalizaciones', label: 'Penalizaciones / Garantías', type: 'textarea' },
    { key: 'condiciones_clave', label: 'Condiciones clave', type: 'textarea' },
  ],
}

export const LICENCIAS_CONFIG: DocumentsViewConfig = {
  category: 'legal',
  title: 'Licencias y Permisos',
  docTypes: [
    { value: 'licencia_obra_mayor', label: 'Obra mayor' },
    { value: 'licencia_obra_menor', label: 'Obra menor' },
    { value: 'licencia_cambio_uso', label: 'Cambio de uso' },
    { value: 'primera_ocupacion', label: 'Primera ocupación' },
    { value: 'declaracion_responsable', label: 'Declaración responsable' },
    { value: 'licencia_actividad', label: 'Licencia de actividad' },
    { value: 'cedula_habitabilidad', label: 'Cédula de habitabilidad' },
    { value: 'otro_permiso', label: 'Otro permiso' },
  ],
  tableColumns: [
    { key: 'ayuntamiento', label: 'Ayuntamiento', render: d => d.datos_extraidos?.ayuntamiento as string ?? '—' },
    { key: 'numero_expediente', label: 'Expediente', render: d => d.datos_extraidos?.numero_expediente as string ?? '—' },
    { key: 'fecha_documento', label: 'Concesión', render: d => d.fecha_documento ? new Date(d.fecha_documento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
  ],
  fields: [
    { key: 'numero_expediente', label: 'Nº expediente', type: 'text' },
    { key: 'ayuntamiento', label: 'Ayuntamiento', type: 'text' },
    { key: 'inmueble', label: 'Inmueble / Dirección obra', type: 'text' },
    { key: 'fecha_solicitud', label: 'Fecha solicitud', type: 'date' },
    { key: 'tasas_pagadas', label: 'Tasas pagadas (€)', type: 'number' },
    { key: 'condicionado', label: 'Condicionado / Observaciones', type: 'textarea' },
  ],
}

export const SEGUROS_CONFIG: DocumentsViewConfig = {
  category: 'seguros',
  title: 'Seguros',
  docTypes: [
    { value: 'seguro_rc', label: 'Responsabilidad Civil' },
    { value: 'seguro_decenal', label: 'Decenal' },
    { value: 'seguro_todo_riesgo', label: 'Todo Riesgo Construcción' },
    { value: 'seguro_vehiculo', label: 'Vehículo' },
    { value: 'seguro_vida', label: 'Vida socios' },
    { value: 'seguro_multirriesgo', label: 'Multirriesgo oficina' },
    { value: 'seguro_accidentes', label: 'Accidentes empleados' },
    { value: 'otro_seguro', label: 'Otro' },
  ],
  tableColumns: [
    { key: 'aseguradora', label: 'Aseguradora', render: d => d.datos_extraidos?.aseguradora as string ?? '—' },
    { key: 'numero_poliza', label: 'Nº Póliza', render: d => d.datos_extraidos?.numero_poliza as string ?? '—' },
    { key: 'prima_anual', label: 'Prima anual', render: d => {
      const v = d.datos_extraidos?.prima_anual
      return v != null ? Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'
    }},
  ],
  fields: [
    { key: 'numero_poliza', label: 'Nº póliza', type: 'text' },
    { key: 'aseguradora', label: 'Aseguradora', type: 'text' },
    { key: 'tomador', label: 'Tomador / Asegurado', type: 'text' },
    { key: 'prima_anual', label: 'Prima anual (€)', type: 'number' },
    { key: 'franquicia', label: 'Franquicia (€)', type: 'number' },
    { key: 'capital_asegurado', label: 'Capital asegurado (€)', type: 'number' },
    { key: 'coberturas', label: 'Coberturas principales', type: 'textarea' },
    { key: 'exclusiones', label: 'Exclusiones relevantes', type: 'textarea' },
  ],
}

export const FISCAL_CONFIG: DocumentsViewConfig = {
  category: 'fiscal',
  title: 'Fiscal y Tributario',
  docTypes: [
    { value: 'modelo_303', label: 'Modelo 303 (IVA)' },
    { value: 'modelo_390', label: 'Modelo 390 (IVA anual)' },
    { value: 'modelo_111', label: 'Modelo 111 (IRPF ret.)' },
    { value: 'modelo_190', label: 'Modelo 190 (IRPF anual)' },
    { value: 'modelo_202', label: 'Modelo 202 (IS pago fracc.)' },
    { value: 'modelo_200', label: 'Modelo 200 (IS anual)' },
    { value: 'modelo_115', label: 'Modelo 115 (ret. arrendamiento)' },
    { value: 'modelo_180', label: 'Modelo 180 (arrendamiento anual)' },
    { value: 'modelo_600', label: 'Modelo 600 (ITP/AJD)' },
    { value: 'itp', label: 'ITP' },
    { value: 'ajd', label: 'AJD' },
    { value: 'plusvalia', label: 'Plusvalía municipal' },
    { value: 'ibi', label: 'IBI' },
    { value: 'otro_fiscal', label: 'Otro' },
  ],
  tableColumns: [
    { key: 'periodo', label: 'Período', render: d => d.datos_extraidos?.periodo as string ?? '—' },
    { key: 'importe', label: 'Importe', render: d => d.importe != null ? d.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—' },
    { key: 'fecha_presentacion', label: 'Presentado', render: d => {
      const v = d.datos_extraidos?.fecha_presentacion as string
      return v ? new Date(v + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    }},
  ],
  fields: [
    { key: 'periodo', label: 'Período (ej: 2T 2025, Ene 2025)', type: 'text' },
    { key: 'fecha_presentacion', label: 'Fecha presentación', type: 'date' },
    { key: 'resultado', label: 'Resultado', type: 'select', options: ['a_ingresar', 'a_devolver', 'cero', 'negativo_compensar'] },
    { key: 'referencia_pago', label: 'Referencia de pago', type: 'text' },
    { key: 'base_imponible', label: 'Base imponible (€)', type: 'number' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
}

export const LABORAL_CONFIG: DocumentsViewConfig = {
  category: 'laboral',
  title: 'Laboral',
  docTypes: [
    { value: 'contrato_trabajo', label: 'Contrato laboral' },
    { value: 'nomina', label: 'Nómina' },
    { value: 'finiquito', label: 'Finiquito' },
    { value: 'tc1_tc2', label: 'TC1/TC2 (Seg. Social)' },
    { value: 'certificado_prl', label: 'Certificado PRL' },
    { value: 'reconocimiento_medico', label: 'Reconocimiento médico' },
    { value: 'alta_baja_ss', label: 'Alta/Baja SS' },
    { value: 'otro_laboral', label: 'Otro' },
  ],
  tableColumns: [
    { key: 'empleado', label: 'Empleado', render: d => d.datos_extraidos?.empleado as string ?? d.partes ?? '—' },
    { key: 'periodo', label: 'Período', render: d => d.datos_extraidos?.periodo as string ?? '—' },
    { key: 'salario_neto', label: 'Neto', render: d => {
      const v = d.datos_extraidos?.salario_neto
      return v != null ? Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'
    }},
  ],
  fields: [
    { key: 'empleado', label: 'Empleado', type: 'text' },
    { key: 'periodo', label: 'Período (ej: Mar 2025)', type: 'text' },
    { key: 'salario_bruto', label: 'Salario bruto (€)', type: 'number' },
    { key: 'salario_neto', label: 'Salario neto (€)', type: 'number' },
    { key: 'irpf_retenido', label: 'IRPF retenido (€)', type: 'number' },
    { key: 'ss_empleado', label: 'SS empleado (€)', type: 'number' },
    { key: 'ss_empresa', label: 'SS empresa (€)', type: 'number' },
    { key: 'tipo_contrato', label: 'Tipo de contrato', type: 'text' },
  ],
}

export const FLOTA_CONFIG: DocumentsViewConfig = {
  category: 'flota',
  title: 'Flota y Gastos Empresa',
  docTypes: [
    { value: 'contrato_renting', label: 'Contrato renting' },
    { value: 'itv', label: 'ITV' },
    { value: 'permiso_circulacion', label: 'Permiso circulación' },
    { value: 'seguro_vehiculo', label: 'Seguro vehículo' },
    { value: 'factura_gasolina', label: 'Gasolina / Combustible' },
    { value: 'factura_herramientas', label: 'Herramientas / Maquinaria' },
    { value: 'factura_material_oficina', label: 'Material oficina' },
    { value: 'factura_software', label: 'Software / Suscripciones' },
    { value: 'otro_gasto', label: 'Otro gasto empresa' },
  ],
  tableColumns: [
    { key: 'proveedor', label: 'Proveedor', render: d => d.datos_extraidos?.proveedor as string ?? d.partes ?? '—' },
    { key: 'vehiculo', label: 'Vehículo / Referencia', render: d => d.datos_extraidos?.vehiculo as string ?? '—' },
    { key: 'importe', label: 'Importe', render: d => d.importe != null ? d.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—' },
  ],
  fields: [
    { key: 'proveedor', label: 'Proveedor', type: 'text' },
    { key: 'vehiculo', label: 'Vehículo / Referencia', type: 'text' },
    { key: 'matricula', label: 'Matrícula', type: 'text' },
    { key: 'cuota_mensual', label: 'Cuota mensual (€)', type: 'number' },
    { key: 'km_incluidos', label: 'Km incluidos', type: 'text' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
}

export const CORPORATIVO_CONFIG: DocumentsViewConfig = {
  category: 'corporativo',
  title: 'Documentación Corporativa',
  docTypes: [
    { value: 'escritura_constitucion', label: 'Escritura constitución' },
    { value: 'estatutos', label: 'Estatutos sociales' },
    { value: 'acta_junta', label: 'Acta de junta' },
    { value: 'poder_notarial', label: 'Poder notarial' },
    { value: 'certificado_cif', label: 'CIF / Tarjeta fiscal' },
    { value: 'certificado_reta', label: 'Certificado RETA' },
    { value: 'certificado_hacienda', label: 'Certificado Hacienda' },
    { value: 'certificado_ss', label: 'Certificado SS' },
    { value: 'otro_corporativo', label: 'Otro' },
  ],
  tableColumns: [
    { key: 'notaria', label: 'Notaría / Organismo', render: d => d.datos_extraidos?.notaria as string ?? '—' },
    { key: 'fecha_documento', label: 'Fecha', render: d => d.fecha_documento ? new Date(d.fecha_documento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
    { key: 'acuerdos', label: 'Acuerdos / Objeto', render: d => {
      const v = d.datos_extraidos?.acuerdos as string
      return v ? (v.length > 60 ? v.substring(0, 60) + '...' : v) : '—'
    }},
  ],
  fields: [
    { key: 'notaria', label: 'Notaría / Organismo emisor', type: 'text' },
    { key: 'numero_protocolo', label: 'Nº protocolo / referencia', type: 'text' },
    { key: 'acuerdos', label: 'Acuerdos / Objeto', type: 'textarea' },
    { key: 'socios_presentes', label: 'Socios presentes', type: 'text' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
}
