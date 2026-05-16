# ADR-0006: Detector XML-first para facturas recibidas (Facturae + Factur-X)

## Estado

Aceptada — 2026-05-16

## Contexto

El workflow general `FwpGF7L2GbFB84kL` procesa cada attachment de email con cascade LLM (Gemini → GPT → Mistral) para extraer datos de factura. Las facturas con datos ya estructurados en XML embebido o estándalone pierden:

- Coste innecesario de tokens LLM (estimado $0.01-0.05 por factura)
- Latencia 4-12 segundos vs <50 ms parse XML directo
- Posibilidad de alucinación del LLM en campos críticos (NIF, importe total, IVA)

Validación con `doc-validator` + `general-purpose research` (sesión 16/05/2026) reveló hechos críticos contradictorios a la asunción inicial:

1. **España usa Facturae XML standalone** firmado XAdES (`.xsig`), NO PDF/A-3 con XML embebido. Es el formato regulado por la AGE para B2G y empresas grandes (Iberdrola, Endesa, Telefónica, Red Eléctrica). El attachment del email ya ES el XML, no se extrae de un PDF.
2. **Alemania/Francia/Bélgica usan Factur-X/ZUGFeRD/XRechnung**: PDF/A-3 con XML CII embebido en `EmbeddedFiles` del Names tree. Cathedral lo verá solo si trabaja con proveedores DACH/franceses.
3. **No existe librería npm madura para Facturae español**. Solución: parsear XML directo con `fast-xml-parser` contra el schema oficial XSD 3.2.2 de [factura-e.gob.es](https://www.factura-e.gob.es/formato/Paginas/formato.aspx).
4. **`@stackforge-eu/factur-x` (JSR, EUPL-1.2, v1.0.1 marzo 2026)** sí está maduro para Factur-X/ZUGFeRD/XRechnung con función `extractXml(pdfBuffer)`.
5. **`stafyniaksacha/facturx` (Node.js)** ofrece CLI + librería para Factur-X con calidad de producción.
6. **`n8n-nodes-einvoice` (community node geckse) NO sirve**: soporta Factur-X pero NO Facturae español (foco DACH). Además v0.1.2 publicado mayo 2025 sin updates en 12 meses, 9 stars, compatibilidad declarada solo hasta n8n 1.72.x (Cathedral está en 2.20.6). Lifecycle frágil.
7. **`xadesjs` (PeculiarVentures) repositorio archivado el 12/08/2025**, read-only. No usable para producción nueva. Cathedral no necesita validar la firma XAdES de las Facturae que recibe (solo consume datos), así que parsea el XML ignorando el bloque `<ds:Signature>`.
8. **`node-zugferd` NO sirve para parsing**: README explícito declara que el parsing está en roadmap, no implementado. Solo soporta generación.

Volumen real España mayo 2026 según informes: ~5-15% facturas Cathedral llegarán con XML estructurado en 2026, escalando a 60%+ en 2027-2028 cuando entren los plazos de Crea y Crece (RD 238/2026) y Verifactu (RD 254/2025).

Ahorro económico marginal (~$0.40-2/mes en tokens a 500 facturas/mes). El driver real es **eliminar alucinaciones LLM en facturas recurrentes grandes** (Endesa, Iberdrola, Movistar, Telefónica) donde los datos están normativizados y el LLM puede confundir NIF, importes o fechas.

Verifactu (RD 1007/2023 + 254/2025) NO entrega facturas al comprador. Es sistema de emisión proveedor → AEAT. Cathedral seguirá recibiendo por email cuando los proveedores adopten Verifactu en 2027.

## Decisión

Implementamos en el workflow general `FwpGF7L2GbFB84kL` un **detector XML-first con dos rutas**, insertado ANTES de la cascade LLM (después de `Normalizar Adjunto` y `Check Duplicado`):

**Ruta A — XML standalone (Facturae español + UBL Peppol)**

- Trigger: filename matches `/\.(xml|xsig|ubl)$/i`
- Detección XAdES envelope: si root es `<ds:Signature>` o `<asic:XAdESSignatures>`, descender a `<ds:Object>/<fe:Facturae>` antes de leer datos
- Encoding: detectar `<?xml encoding="ISO-8859-1"?>` y convertir con `iconv-lite` a UTF-8 antes de parsear
- Parser: `fast-xml-parser` (npm, MIT, ~200 KB, zero native deps)
- Mapeo Facturae 3.2.2 → schema interno Cathedral: `<Invoices><Invoice><InvoiceHeader><InvoiceNumber>`, `<InvoiceIssueData><IssueDate>`, `<Sellers><Seller><TaxIdentification>`, `<InvoiceTotals><TotalGrossAmount>`, `<TaxesOutputs><Tax><TaxRate>`, etc.

**Ruta B — PDF/A-3 con XML embedded (Factur-X / ZUGFeRD / XRechnung)**

- Trigger: filename matches `/\.pdf$/i` AND `extractXml(pdfBuffer)` devuelve `{xml, profile}` sin error
- Librería: `@stackforge-eu/factur-x` (JSR, EUPL-1.2, v1.0.1)
- Mapeo CII UN/CEFACT → schema interno Cathedral

**Fallback robusto**

- Si parse XML falla por cualquier razón (encoding raro, schema mismatch, namespace inesperado, XML malformado): emitir warning al banner admin + redirigir al cascade LLM normal como si no hubiera XML. NUNCA bloquear el flujo por XML inválido.

**Lugar de implementación**

- Un único Code node n8n en `runOnceForEachItem` antes de `Convertir a Visión` en el workflow general
- Dependencies instaladas en imagen Docker n8n: `fast-xml-parser`, `iconv-lite`, `@stackforge-eu/factur-x`, `pdf-lib`
- Env var `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser,iconv-lite,@stackforge-eu/factur-x,pdf-lib` en container n8n Hetzner

**Observability**

- Cada attachment procesado escribe a tabla nueva `invoice_parse_path` con campos `attachment_id, path (xml_standalone | xml_embedded | ocr_cascade), profile, parse_duration_ms, success, error_message`
- Counter mensual del % XML path vs OCR path mostrado en banner admin
- Primeros 50 casos XML detectados se loguean también con resultado paralelo del cascade LLM (shadow mode), para validar accuracy ganada empíricamente

## Alternativas consideradas

- **`n8n-nodes-einvoice` community node** — Descartada porque NO soporta Facturae español, lifecycle frágil (v0.1.2 sin updates desde mayo 2025), compatibilidad solo declarada hasta n8n 1.72.x. Cathedral está en 2.20.6, riesgo no documentado.
- **`xadesjs` para validar firmas** — Descartada porque repo archivado agosto 2025. Cathedral no necesita validar firmas igualmente (solo lee datos).
- **`node-zugferd` para parsing** — Descartada porque parsing está en roadmap, no implementado. Solo generación funcional.
- **Validar firma XAdES de Facturae** — Descartada. Cathedral consume datos internamente, no es validador oficial AGE. La integridad legal del documento es responsabilidad del emisor y del transporte (email firmado/cifrado en su caso), no del consumidor.
- **Construir Java microservice externo con Apache Santuario** — Descartada. Sobre-ingeniería para PYME 500 facturas/mes. fast-xml-parser cubre el caso.
- **Esperar a 2027-2028 cuando aumente el % de facturas XML** — Descartada. Implementarlo ahora (1-2 días dev) deja el detector rodado antes de que entre el volumen masivo en 2027.

## Consecuencias

### Positivas

- Accuracy 100% en facturas con XML estructurado (sin alucinación LLM)
- Latencia <50 ms vs 4-12 s cascade en esas facturas
- Ahorro ~$0.40-2/mes en tokens LLM (marginal pero limpio)
- Detector funcional antes del crecimiento de adopción Facturae España 2027+
- Cathedral aprende a manejar Facturae internamente — útil cuando emisión Verifactu se active (ADR-0003)

### Negativas

- Dependencias nuevas en imagen Docker n8n: superficie de seguridad ampliada (mitigado con paquetes auditados npm + pinned versions)
- Code node de ~80-120 líneas más en el workflow (aumenta superficie de mantenimiento — mitigado escribiendo lógica clara con tests Vitest del parser en endpoint Next.js gemelo)
- Riesgo regresión: si el detector tiene un bug, podría meter datos malos en BD. Mitigado con fallback robusto (si parse falla → cascade LLM normal) y shadow mode primeras 50 facturas

## Criterio para revertir

Revertimos el detector XML-first si:

- Tras 60 días en producción, el detector procesa <2% del volumen total Y la accuracy comparada con shadow LLM no muestra ganancia significativa
- Aparece bug crítico en `@stackforge-eu/factur-x` o `fast-xml-parser` sin workaround conocido
- Falsos positivos (XML "detectado" pero parse mal mapea datos a BD) superan 5% de los casos XML procesados
- Cargas pesadas (PDFs grandes >50 MB) provocan OOM en container n8n Hetzner

## Plan de implementación (estimación 1-2 días)

1. **Día 1 mañana**: actualizar imagen Docker n8n Hetzner con `npm install -g fast-xml-parser iconv-lite @stackforge-eu/factur-x pdf-lib`. Setear `NODE_FUNCTION_ALLOW_EXTERNAL` env var. Restart container preservando volumen. Backup pre-cambio del workflow.
2. **Día 1 tarde**: escribir Code node `Detector XML Facturae/Factur-X` en JS con las dos rutas + fallback. Insertar en workflow tras `Normalizar Adjunto` antes de cascade. Conectar las dos ramas a `Preparar Supabase` con flag `source='xml_structured'`.
3. **Día 2 mañana**: crear tabla `invoice_parse_path` en Supabase + RPC `log_parse_path`. Wire del Code node para que loguee a esa tabla. Test con factura Facturae real (David facilita uno desde Iberdrola/Endesa).
4. **Día 2 tarde**: shadow mode 50 facturas. Comparar accuracy XML path vs cascade LLM. Si verde, publicar draft → activeVersion. Si no, revertir y analizar discrepancias.

## Referencias

- [Factura-e.gob.es — formato oficial Facturae 3.2.2](https://www.facturae.gob.es/formato/Paginas/formato.aspx)
- [BOE Real Decreto 1007/2023 — Verifactu](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840)
- [BOE Real Decreto 238/2026 — Crea y Crece](https://www.boe.es/buscar/doc.php?id=BOE-A-2026-7295)
- [vatcalc — Verifactu delay to Jan 2027](https://www.vatcalc.com/spain/spain-verifactu-delay-till-jan-2027-for-certified-e-invoicing/)
- [@stackforge-eu/factur-x JSR](https://jsr.io/@stackforge-eu/factur-x)
- [stafyniaksacha/facturx (Node)](https://github.com/stafyniaksacha/facturx)
- [akretion/factur-x (Python referencia)](https://github.com/akretion/factur-x)
- [fast-xml-parser npm](https://www.npmjs.com/package/fast-xml-parser)
- [iconv-lite npm](https://www.npmjs.com/package/iconv-lite)
- [PeculiarVentures/xadesjs (archivado)](https://github.com/PeculiarVentures/xadesjs)
- [n8n-nodes-einvoice geckse (descartado)](https://github.com/geckse/n8n-nodes-einvoice)
- [n8n docs — modules in Code node](https://docs.n8n.io/hosting/configuration/configuration-examples/modules-in-code-node/)
- Sesión 16/05/2026 — doc-validator + general-purpose research agents (transcripto Claude Code)
