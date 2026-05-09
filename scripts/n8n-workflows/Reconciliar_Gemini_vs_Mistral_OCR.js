// Reconciliación textual Gemini vs Mistral OCR (sesión 28, plan ajustado)
// Compara campos extraídos por Gemini contra el markdown de Mistral OCR usando
// normalizadores por tipo (tolera variantes de formato).

const mistralResponse = $input.item.json;
const pages = mistralResponse?.pages || [];
const markdownTotal = pages.map(p => p.markdown || '').join('\n').trim();

// Datos extraídos (upstream Cascada Supplier)
const gemini = $('Resolver Entidad ID').first().json;

const discrepancies = [];

// === NORMALIZADORES ===

function normalizeNIF(s) {
  if (!s) return '';
  return String(s).replace(/[\s\-\.]/g, '').toUpperCase();
}

function normalizeAmount(s) {
  // Detecta números en formato ES (1.234,56) o EN (1,234.56)
  if (s == null || s === '') return null;
  let str = String(s).replace(/[€$\s]/g, '');
  // Si hay tanto coma como punto, asumir formato ES (punto=miles, coma=decimal)
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function findAmountInMarkdown(markdown, target, tolerance) {
  // Busca el target (número) en el markdown con tolerancia ±0.01
  if (target == null) return true;
  // Extraer todos los números del markdown
  const matches = markdown.match(/[0-9]+(?:[.,][0-9]+)*(?:[.,][0-9]{1,2})?/g) || [];
  for (const m of matches) {
    const n = normalizeAmount(m);
    if (n != null && Math.abs(n - target) < (tolerance || 0.02)) return true;
  }
  return false;
}

function normalizeDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // ISO YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY o DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function findDateInMarkdown(markdown, isoDate) {
  if (!isoDate) return true;
  const [y, mo, d] = isoDate.split('-');
  // Buscar en variantes: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY, etc.
  const variants = [
    `${d}/${mo}/${y}`,
    `${d}-${mo}-${y}`,
    `${y}-${mo}-${d}`,
    `${parseInt(d)}/${parseInt(mo)}/${y}`,
    `${d}/${mo}/${y.slice(2)}`,
    `${d}.${mo}.${y}`,
  ];
  return variants.some(v => markdown.includes(v));
}

// === VERIFICACIÓN ===

if (!markdownTotal) {
  discrepancies.push('§MISTRAL_OCR:Mistral no extrajo texto del documento (PDF corrupto o imagen ilegible)');
} else {
  // NIF emisor
  const nif = normalizeNIF(gemini.nif_emisor || gemini.nif_proveedor || gemini.supplier_nif);
  if (nif && nif.length >= 8) {
    const markdownNorm = normalizeNIF(markdownTotal);
    if (!markdownNorm.includes(nif)) {
      discrepancies.push('§DISCREPANCIA_OCR:nif_emisor:' + nif + ' no aparece en markdown');
    }
  }

  // CIF empresa (para nóminas)
  const empresaCif = normalizeNIF(gemini.empresa_cif);
  if (empresaCif && empresaCif.length >= 8) {
    const markdownNorm = normalizeNIF(markdownTotal);
    if (!markdownNorm.includes(empresaCif)) {
      discrepancies.push('§DISCREPANCIA_OCR:empresa_cif:' + empresaCif + ' no aparece en markdown');
    }
  }

  // Importe total con tolerancia ±0.02€
  const total = normalizeAmount(gemini.importe_total ?? gemini.amount_total);
  if (total != null) {
    if (!findAmountInMarkdown(markdownTotal, total, 0.02)) {
      discrepancies.push('§DISCREPANCIA_OCR:importe_total:' + total + ' no aparece en markdown');
    }
  }

  // Fecha emisión normalizada
  const fechaIso = normalizeDate(gemini.fecha_emision || gemini.issue_date);
  if (fechaIso) {
    if (!findDateInMarkdown(markdownTotal, fechaIso)) {
      discrepancies.push('§DISCREPANCIA_OCR:fecha_emision:' + fechaIso + ' no aparece en markdown');
    }
  }

  // Número factura (string match case insensitive, sin espacios)
  const num = String(gemini.numero_factura || '').replace(/\s/g, '');
  if (num && num.length >= 3) {
    const markdownNoSpace = markdownTotal.replace(/\s/g, '').toLowerCase();
    if (!markdownNoSpace.includes(num.toLowerCase())) {
      discrepancies.push('§DISCREPANCIA_OCR:numero_factura:' + num + ' no aparece en markdown');
    }
  }
}

return {
  json: {
    ...gemini,
    _mistral_discrepancies: discrepancies,
    _mistral_markdown_chars: markdownTotal.length
  },
  binary: $('Resolver Entidad ID').first().binary
};

