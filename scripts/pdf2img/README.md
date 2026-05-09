# `pdf2img/service.py`

Microservicio Flask que convierte PDFs a JPEG para que las IAs Vision (Gemini, GPT-4o)
puedan leer las facturas. Vive en el host Hetzner (`/opt/pdf2img/service.py`) corriendo
como systemd service `pdf2img.service`, escuchando en `172.17.0.1:5001` (gateway Docker).

## Endpoints

- `GET /health` — ping con config actual (DPI, quality, max_dim)
- `POST /convert` — body `{pdf_b64}` o PDF crudo → `{images: [jpegB64], pages, pages_returned}`
- `POST /normalize-image` — body `{img_b64}` (HEIC/BMP/TIFF/GIF/WEBP) → `{image: jpegB64}`

## Config (constantes top del archivo)

| Constante | Valor | Justificación |
|---|---|---|
| `PDF_PAGES_LIMIT` | 8 | máximo páginas/PDF a convertir (anti-abuse) |
| `PDF_DPI` | 300 | estándar OCR profesional para lectura de números/NIFs (sesión 9/05/2026) |
| `JPEG_QUALITY` | 95 | calidad alta — texto fino legible (antes ~75 default de pix.tobytes) |
| `MAX_IMAGE_DIM` | 2048 | límite OpenAI Vision; más grande lo redimensiona en su lado |

## Despliegue

El archivo aquí en repo es la versión canónica. El servidor lo tiene como copia.

```bash
# Subir cambios al servidor
scp scripts/pdf2img/service.py root@77.42.36.4:/tmp/service_new.py

# En el servidor, validar + reemplazar + reiniciar
ssh root@77.42.36.4 << 'EOF'
TS=$(date +%Y%m%d-%H%M%S)
cp /opt/pdf2img/service.py /opt/pdf2img/service.py.bak-$TS
python3 -m py_compile /tmp/service_new.py && \
  mv /tmp/service_new.py /opt/pdf2img/service.py && \
  systemctl restart pdf2img && \
  sleep 2 && \
  curl -sS http://172.17.0.1:5001/health
EOF
```

## Backups locales en server

Cada cambio guarda backup en `/opt/pdf2img/service.py.bak-YYYYMMDD-HHMMSS`.

## Histórico cambios

- **9/05/2026 noche**: DPI 200 → 300, JPEG quality default → 95, MAX_IMAGE_DIM 2048
  - Causa: GPT-4o Vision no leía importes/NIFs de las imágenes a 200 DPI / quality 75
  - Test validador: factura MARICHIVA 5 (CHI 007-25) — pasó de extraer 0 importes
    a extracción completa con `confianza: 0.95`
