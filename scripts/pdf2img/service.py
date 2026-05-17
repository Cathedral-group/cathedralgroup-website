#!/usr/bin/env python3
"""
PDF→JPEG + Image normalization microservice for n8n.
- /health     → ping
- /convert    → PDF (raw or JSON {pdf_b64}) → {images: [jpegB64], pages: int}
- /normalize-image → image (JSON {img_b64, mime}) → {image: jpegB64} (HEIC/BMP/TIFF/GIF/WEBP → JPEG)

Sesión 9/05/2026 noche tarde — refactor calidad OCR:
- DPI 200 → 300 (estándar profesional para OCR fino, mejor lectura de números/NIFs)
- Render via PIL con quality=95 (antes pix.tobytes('jpeg') usaba quality default ~75)
- Limit max_dim 2048px: OpenAI redimensiona >2048 igualmente, evitamos payload innecesario
- Validado test 9/05 noche: GPT-4o no extraía importes de imágenes a 200 DPI / quality 75
"""
from flask import Flask, request, jsonify
import fitz, base64, traceback, sys, io, os, re, time, threading
from PIL import Image
import pillow_heif
import requests as _requests
pillow_heif.register_heif_opener()

app = Flask(__name__)

PDF_PAGES_LIMIT = 8
PDF_DPI = 300                                # ↑ 200 → 300 (sesión 9/05/2026 noche)
PDF_MATRIX = fitz.Matrix(PDF_DPI/72, PDF_DPI/72)
JPEG_QUALITY = 95                            # ↑ default ~75 → 95
MAX_IMAGE_DIM = 2048                         # límite OpenAI Vision (más grande lo redimensiona)

@app.route('/health')
def health():
    return jsonify({'ok': True, 'pages_limit': PDF_PAGES_LIMIT, 'dpi': PDF_DPI, 'jpeg_quality': JPEG_QUALITY, 'max_dim': MAX_IMAGE_DIM, 'features': ['convert', 'normalize-image', 'forensic']})


@app.route('/forensic', methods=['POST'])
def forensic():
    """Análisis forense de PDF: metadata + EOF count + signatures + xref count.
    Body: {pdf_b64}
    Returns: {alerts: [...], metadata: {...}, eof_count, has_signature, num_objects, ...}
    """
    body = request.get_json(silent=True) or {}
    b64 = body.get('pdf_b64', '')
    if not b64:
        return jsonify({'error': 'missing pdf_b64'}), 400
    try:
        pdf_bytes = base64.b64decode(b64)
    except Exception as e:
        return jsonify({'error': 'invalid base64: ' + str(e)}), 400

    alerts = []
    result = {
        'alerts': alerts,
        'metadata': {},
        'eof_count': 0,
        'has_signature': False,
        'num_objects': 0,
        'num_pages': 0,
        'is_encrypted': False,
        'pdf_version': None,
    }

    # 1) EOF count (incremental updates) — bytes-level, no requiere lib
    eof_count = pdf_bytes.count(b'%%EOF')
    result['eof_count'] = eof_count
    if eof_count > 1:
        alerts.append(f'PDF_INCREMENTAL_UPDATES: {eof_count} marcadores %%EOF (esperado 1 para factura nueva)')

    # 2) Análisis con PyMuPDF
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        result['is_encrypted'] = doc.is_encrypted
        try:
            result['pdf_version'] = doc.metadata.get('format', '') if doc.metadata else None
        except Exception:
            result['pdf_version'] = None
        result['num_pages'] = doc.page_count
        try:
            result['num_objects'] = doc.xref_length()
        except Exception:
            result['num_objects'] = 0

        # Metadata standard
        meta = doc.metadata or {}
        result['metadata'] = {
            'producer': meta.get('producer'),
            'creator': meta.get('creator'),
            'author': meta.get('author'),
            'title': meta.get('title'),
            'creationDate': meta.get('creationDate'),
            'modDate': meta.get('modDate'),
            'subject': meta.get('subject'),
        }

        # Detectar dates manipuladas
        cd = meta.get('creationDate', '')
        md = meta.get('modDate', '')
        if cd and md:
            # Format PDF: D:YYYYMMDDHHmmSS+ZZ'00'
            try:
                cd_parsed = cd[2:16] if cd.startswith('D:') else cd[:14]
                md_parsed = md[2:16] if md.startswith('D:') else md[:14]
                if md_parsed < cd_parsed:
                    alerts.append('METADATA_DATE_INCONSISTENCY: ModDate anterior a CreationDate (manipulación)')
                # Si ModDate > CreationDate por más de 1 día, sospechoso
                if cd_parsed[:8] != md_parsed[:8] and len(cd_parsed) >= 8 and len(md_parsed) >= 8:
                    delta_days = abs(int(md_parsed[:8]) - int(cd_parsed[:8]))
                    if delta_days > 7:
                        alerts.append(f'METADATA_LATE_MODIFICATION: PDF modificado más tarde de su creación (diferencia días en fecha)')
            except Exception:
                pass

        # Producer sospechoso (herramientas de edición común)
        prod = (meta.get('producer') or '').lower()
        suspicious_producers = ['ilovepdf', 'smallpdf', 'pdf24', 'sejda', 'pdfescape', 'pdfsam']
        for s in suspicious_producers:
            if s in prod:
                alerts.append(f'METADATA_EDITING_TOOL: Producer "{prod}" sugiere edición con herramienta de retoque')
                break

        # 3) Detectar firmas digitales
        for page in doc:
            for widget in page.widgets() or []:
                if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                    result['has_signature'] = True
                    break
            if result['has_signature']:
                break

        doc.close()
    except Exception as e:
        alerts.append(f'PDF_PARSE_ERROR: {str(e)[:150]}')
        traceback.print_exc(file=sys.stderr)

    # Score interno simple (más alerts = peor)
    if not alerts:
        result['score'] = 100
    else:
        # Pondera por severidad
        severity_score = 100
        for a in alerts:
            if 'INCONSISTENCY' in a or 'INCREMENTAL_UPDATES' in a:
                severity_score -= 25
            elif 'EDITING_TOOL' in a or 'LATE_MODIFICATION' in a:
                severity_score -= 15
            else:
                severity_score -= 5
        result['score'] = max(0, severity_score)

    return jsonify(result)


def _render_page_to_jpeg_b64(page):
    """Render a PDF page to JPEG with high quality and bounded dimensions."""
    pix = page.get_pixmap(matrix=PDF_MATRIX, alpha=False)
    img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
    # Limitar dimensión máxima a 2048px (manteniendo aspect ratio)
    if max(img.size) > MAX_IMAGE_DIM:
        ratio = MAX_IMAGE_DIM / max(img.size)
        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    return base64.b64encode(out.getvalue()).decode()

def _convert_pdf_bytes(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    if doc.is_encrypted:
        doc.close()
        raise ValueError('PDF_ENCRYPTED')
    images = []
    n_pages = len(doc)
    for i in range(min(n_pages, PDF_PAGES_LIMIT)):
        b64 = _render_page_to_jpeg_b64(doc[i])
        images.append(b64)
    doc.close()
    return images, n_pages

@app.route('/convert', methods=['POST'])
def convert():
    pdf_bytes = None
    ct = (request.headers.get('Content-Type') or '').lower()
    if 'application/json' in ct:
        body = request.get_json(silent=True) or {}
        b64 = body.get('pdf_b64', '')
        try:
            pdf_bytes = base64.b64decode(b64)
        except Exception as e:
            return jsonify({'error': 'invalid base64: ' + str(e)}), 400
    else:
        pdf_bytes = request.data

    print(f'[convert] received {len(pdf_bytes) if pdf_bytes else 0} bytes (ct={ct})', flush=True)
    if not pdf_bytes:
        return jsonify({'error': 'No PDF data received'}), 400
    try:
        images, n_pages = _convert_pdf_bytes(pdf_bytes)
        avg_kb = (sum(len(i) for i in images) / len(images) / 1024) if images else 0
        print(f'[convert] OK: {len(images)}/{n_pages} pages converted (limit={PDF_PAGES_LIMIT}, dpi={PDF_DPI}, q={JPEG_QUALITY}, avg {avg_kb:.0f}KB/page b64)', flush=True)
        return jsonify({'images': images, 'pages': n_pages, 'pages_returned': len(images)})
    except ValueError as e:
        # Errores controlados (PDF_ENCRYPTED, etc.)
        code = str(e)
        print(f'[convert] CONTROLLED ERROR: {code}', flush=True)
        return jsonify({'error': code, 'controlled': True}), 422
    except Exception as e:
        tb = traceback.format_exc()
        print(f'[convert] ERROR: {e}\n{tb}', flush=True, file=sys.stderr)
        return jsonify({'error': str(e), 'traceback': tb}), 500

@app.route('/normalize-image', methods=['POST'])
def normalize_image():
    """Convierte cualquier imagen (HEIC/BMP/TIFF/GIF/WEBP/PNG/JPEG) a JPEG base64.
    GPT-4o solo soporta PNG/JPEG/GIF/WEBP, así que normalizamos a JPEG el resto.
    """
    body = request.get_json(silent=True) or {}
    img_b64 = body.get('img_b64', '')
    if not img_b64:
        return jsonify({'error': 'missing img_b64'}), 400
    try:
        raw = base64.b64decode(img_b64)
        print(f'[normalize-image] received {len(raw)} bytes', flush=True)
        img = Image.open(io.BytesIO(raw))
        # Convertir a RGB (HEIC puede ser RGBA, TIFF puede ser CMYK)
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        # Limitar dimensión máxima a 2048px para no sobrepasar límites GPT-4o
        if max(img.size) > MAX_IMAGE_DIM:
            ratio = MAX_IMAGE_DIM / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=JPEG_QUALITY, optimize=True)
        result_b64 = base64.b64encode(out.getvalue()).decode()
        print(f'[normalize-image] OK: {img.size} JPEG {len(result_b64)} chars b64', flush=True)
        return jsonify({'image': result_b64, 'width': img.size[0], 'height': img.size[1]})
    except Exception as e:
        tb = traceback.format_exc()
        print(f'[normalize-image] ERROR: {e}\n{tb}', flush=True, file=sys.stderr)
        return jsonify({'error': str(e), 'traceback': tb}), 500


@app.route('/probe-pdf', methods=['POST'])
def probe_pdf():
    """
    Smart Routing Capa A — PDF text-layer probe.
    Determina si PDF es born-digital (texto extraíble) vs scanned (solo imagenes).
    
    Body: {pdf_b64}
    
    Response:
      {
        classification: "born_digital" | "scanned" | "hybrid" | "unknown",
        pages: int,
        total_text_chars: int,
        pages_with_text: int,
        total_images: int,
        avg_chars_per_page: float,
        has_text_layer: bool,
        has_facturae_embed: bool,
        confidence: float (0-1)
      }
    
    Industry heuristic (openpreservation.org + pdfplumber.com):
      - text_chars > 50 per page avg AND pages_with_text >= total_pages * 0.7 → born_digital
      - 0 text AND images >= pages → scanned
      - else → hybrid (mixed text+scanned pages)
    """
    body = request.get_json(silent=True) or {}
    pdf_b64 = body.get('pdf_b64', '')
    if not pdf_b64:
        return jsonify({'error': 'missing pdf_b64'}), 400
    try:
        raw = base64.b64decode(pdf_b64)
        doc = fitz.open(stream=raw, filetype='pdf')
        total_pages = len(doc)
        
        # Probe primeras 5 pages para velocidad (mass batch)
        pages_to_probe = min(total_pages, 5)
        total_text_chars = 0
        pages_with_text = 0
        total_images = 0
        text_chars_per_page = []
        
        for i in range(pages_to_probe):
            page = doc[i]
            # PyMuPDF text extraction (text-layer detection)
            text = page.get_text().strip()
            chars = len(text)
            text_chars_per_page.append(chars)
            total_text_chars += chars
            if chars > 50:  # threshold canónico
                pages_with_text += 1
            # Count images on page (scanned PDFs tienen 1 imagen full-page por page)
            total_images += len(page.get_images())
        
        avg_chars = total_text_chars / pages_to_probe if pages_to_probe > 0 else 0
        has_text_layer = total_text_chars > 50
        
        # Check Facturae embed via attachments (PyMuPDF embedded files)
        has_facturae_embed = False
        try:
            for j in range(doc.embfile_count()):
                info = doc.embfile_info(j)
                filename = info.get('filename', '').lower()
                if filename.endswith('.xml') or 'facturae' in filename:
                    has_facturae_embed = True
                    break
        except Exception:
            pass  # embfile_count puede no estar disponible en algunos PDFs
        
        doc.close()
        
        # Classification
        if has_facturae_embed:
            classification = 'pdf_facturae_embed'
            confidence = 0.95
        elif has_text_layer and pages_with_text >= pages_to_probe * 0.7:
            classification = 'born_digital'
            confidence = min(0.95, 0.6 + (avg_chars / 1000))
        elif total_text_chars == 0 and total_images >= pages_to_probe:
            classification = 'scanned'
            confidence = 0.90
        elif total_text_chars > 0 and total_text_chars < 50 * pages_to_probe:
            classification = 'hybrid'
            confidence = 0.70
        else:
            classification = 'unknown'
            confidence = 0.30
        
        result = {
            'classification': classification,
            'pages': total_pages,
            'pages_probed': pages_to_probe,
            'total_text_chars': total_text_chars,
            'pages_with_text': pages_with_text,
            'total_images': total_images,
            'avg_chars_per_page': round(avg_chars, 1),
            'has_text_layer': has_text_layer,
            'has_facturae_embed': has_facturae_embed,
            'confidence': round(confidence, 2),
            'text_chars_per_page': text_chars_per_page,
        }
        print(f'[probe-pdf] OK: {classification} pages={total_pages} text_chars={total_text_chars} images={total_images} conf={confidence}', flush=True)
        return jsonify(result)
    except Exception as e:
        tb = traceback.format_exc()
        print(f'[probe-pdf] ERROR: {e}\n{tb}', flush=True, file=sys.stderr)
        return jsonify({'error': str(e), 'traceback': tb}), 500




# ====== /fetch-and-convert — Drive download + PDF convert (bypass n8n binary handling) ======
# Cathedral n8n 2.12.3 task runner sandbox cannot resolve filesystem-v2 binary descriptors.
# This endpoint downloads Drive PDF server-side using stored OAuth refresh_token, converts to images,
# returns base64 array in JSON. n8n never touches binary.

_token_cache = {"access_token": None, "expires_at": 0}
_token_lock = threading.Lock()

def _get_drive_access_token():
    """Refresh OAuth2 access token, cached 50 min. Source: developers.google.com/identity/protocols/oauth2/web-server"""
    with _token_lock:
        if time.time() < _token_cache["expires_at"]:
            return _token_cache["access_token"]
        client_id = os.environ["DRIVE_OAUTH_CLIENT_ID"]
        client_secret = os.environ["DRIVE_OAUTH_CLIENT_SECRET"]
        refresh_token = os.environ["DRIVE_OAUTH_REFRESH_TOKEN"]
        r = _requests.post(
            "https://oauth2.googleapis.com/token",
            data={"client_id": client_id, "client_secret": client_secret,
                  "refresh_token": refresh_token, "grant_type": "refresh_token"},
            timeout=10,
        )
        if r.status_code != 200:
            print(f"[fetch-and-convert] OAuth refresh failed: {r.status_code} {r.text[:200]}", file=sys.stderr, flush=True)
            raise RuntimeError(f"OAuth refresh failed: {r.status_code}")
        data = r.json()
        _token_cache["access_token"] = data["access_token"]
        _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600) - 600
        return _token_cache["access_token"]

_DRIVE_FILE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,200}$")
_INTERNAL_TOKEN = os.environ.get("CATHEDRAL_INTERNAL_TOKEN", "")

@app.route("/fetch-and-convert", methods=["POST"])
def fetch_and_convert():
    # 1. Auth Bearer (CATHEDRAL_INTERNAL_TOKEN)
    if _INTERNAL_TOKEN:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != _INTERNAL_TOKEN:
            return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    drive_file_id = body.get("drive_file_id", "")
    max_pages = body.get("max_pages")

    if not drive_file_id or not _DRIVE_FILE_ID_RE.match(drive_file_id):
        return jsonify({"error": "Invalid or missing drive_file_id"}), 400

    try:
        access_token = _get_drive_access_token()
    except (RuntimeError, KeyError) as e:
        return jsonify({"error": "OAuth refresh failure", "detail": str(e)}), 502

    drive_url = f"https://www.googleapis.com/drive/v3/files/{drive_file_id}?alt=media"
    try:
        dr = _requests.get(drive_url,
                           headers={"Authorization": f"Bearer {access_token}"},
                           timeout=60)
    except _requests.Timeout:
        return jsonify({"error": "Drive download timed out"}), 504

    if dr.status_code == 404:
        return jsonify({"error": "drive_file_id not found or not accessible"}), 404
    if dr.status_code == 403:
        return jsonify({"error": "Drive access denied - check OAuth scope"}), 403
    if dr.status_code != 200:
        print(f"[fetch-and-convert] Drive download failed: {dr.status_code} {dr.text[:200]}", file=sys.stderr, flush=True)
        return jsonify({"error": "Drive download failed", "status": dr.status_code}), 502

    content_type = dr.headers.get("Content-Type", "")
    if "pdf" not in content_type.lower():
        return jsonify({"error": "File is not a PDF", "content_type": content_type,
                        "drive_file_id": drive_file_id}), 422

    pdf_bytes = dr.content
    file_name = None
    cd = dr.headers.get("Content-Disposition", "")
    if "filename=" in cd:
        file_name = cd.split("filename=")[-1].strip().strip('"').strip("'")

    print(f"[fetch-and-convert] Downloaded {len(pdf_bytes)} bytes for drive_file_id={drive_file_id[:20]} name={file_name}", flush=True)

    try:
        images, n_pages = _convert_pdf_bytes(pdf_bytes)
    except ValueError as e:
        return jsonify({"error": str(e), "controlled": True}), 422
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[fetch-and-convert] PDF conversion error: {e}\n{tb}", file=sys.stderr, flush=True)
        return jsonify({"error": "PDF conversion failed", "detail": str(e)}), 422

    if max_pages and isinstance(max_pages, int) and max_pages > 0:
        images = images[:max_pages]

    # Include original PDF base64 for downstream nodes (e.g. Mistral OCR document mode)
    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    return jsonify({
        "images": images,
        "pages": n_pages,
        "pages_returned": len(images),
        "drive_file_id": drive_file_id,
        "file_name": file_name,
        "pdf_b64": pdf_b64,
        "mime": "application/pdf",
    }), 200



if __name__ == '__main__':
    app.run(host='172.17.0.1', port=5001, debug=False)
