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
import fitz, base64, traceback, sys, io
from PIL import Image
import pillow_heif
pillow_heif.register_heif_opener()

app = Flask(__name__)

PDF_PAGES_LIMIT = 8
PDF_DPI = 300                                # ↑ 200 → 300 (sesión 9/05/2026 noche)
PDF_MATRIX = fitz.Matrix(PDF_DPI/72, PDF_DPI/72)
JPEG_QUALITY = 95                            # ↑ default ~75 → 95
MAX_IMAGE_DIM = 2048                         # límite OpenAI Vision (más grande lo redimensiona)

@app.route('/health')
def health():
    return jsonify({'ok': True, 'pages_limit': PDF_PAGES_LIMIT, 'dpi': PDF_DPI, 'jpeg_quality': JPEG_QUALITY, 'max_dim': MAX_IMAGE_DIM})

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

if __name__ == '__main__':
    app.run(host='172.17.0.1', port=5001, debug=False)
