#!/usr/bin/env python3
"""
Backfill SHA-256 file_hash en invoices / quotes / documents.

Contexto: hasta sesión 30 (30/04/2026), n8n bloqueaba `require('crypto')` en Code
nodes por defecto, así que los rows insertados durante el periodo del bug tienen
`file_hash=NULL` aunque el adjunto sí está en Drive. Tras añadir
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` al container, los nuevos rows lo calculan
bien — pero los ~89 legacy quedan vacíos.

Lo que hace
-----------
1. Query Supabase: rows con `deleted_at IS NULL AND file_hash IS NULL AND drive_file_id IS NOT NULL`
2. Para cada row:
   - Descarga el archivo desde Drive via API (necesita ADC con scope drive.readonly)
   - Calcula SHA-256
   - PATCH Supabase con `file_hash`
3. Idempotente: si en el medio un row se rellena por otra vía, se salta.
4. Detecta duplicados pre-existentes: si el SHA calculado coincide con OTRO row,
   lo reporta sin marcar (decisión humana sobre cuál es canónico).

Cómo correr
-----------
1. Reauth ADC con scope Drive:
       gcloud auth application-default login --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/cloud-platform
2. Verificar:
       gcloud auth application-default print-access-token
   (debe devolver un token largo)
3. Ejecutar:
       python3 scripts/backfill-sha256.py --dry-run    # primero solo lectura
       python3 scripts/backfill-sha256.py              # aplicar UPDATEs
4. Logs en stdout + resumen final.

Dependencias: requests, google-auth (vienen con gcloud); no requiere instalar nada extra.

Configuración
-------------
Edita las constantes SUPABASE_URL y SUPABASE_KEY abajo (la KEY es sb_secret_*,
ver cathedral-credentials.md). NO commitees los valores; mejor pásalos por env:
    SUPABASE_KEY=sb_secret_... python3 scripts/backfill-sha256.py
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from collections import defaultdict
from typing import Optional

import urllib.request
import urllib.error

# Config
SUPABASE_URL = "https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
TABLES = ["invoices", "quotes", "documents"]
BATCH_SIZE = 100
DRIVE_DOWNLOAD = "https://www.googleapis.com/drive/v3/files/{}?alt=media"


def adc_token() -> str:
    """Obtiene access token vía gcloud ADC."""
    out = subprocess.check_output(
        ["gcloud", "auth", "application-default", "print-access-token"],
        stderr=subprocess.STDOUT,
    ).decode().strip()
    if "ERROR" in out or not out.startswith("ya29."):
        print(f"❌ ADC token no válido: {out[:120]}", file=sys.stderr)
        print("Reauth: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/cloud-platform", file=sys.stderr)
        sys.exit(1)
    return out


def supabase_req(method: str, path: str, body: Optional[dict] = None, prefer: str = "") -> bytes:
    if not SUPABASE_KEY:
        print("❌ SUPABASE_KEY no definida (env var)", file=sys.stderr)
        sys.exit(1)
    url = f"{SUPABASE_URL}{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {body_err}")


def list_pending(table: str) -> list[dict]:
    qs = "?deleted_at=is.null&file_hash=is.null&drive_file_id=not.is.null&select=id,drive_file_id,original_filename"
    raw = supabase_req("GET", f"/{table}{qs}")
    return json.loads(raw)


def drive_download(file_id: str, token: str) -> bytes:
    url = DRIVE_DOWNLOAD.format(file_id)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def patch_hash(table: str, row_id: str, file_hash: str) -> None:
    supabase_req(
        "PATCH",
        f"/{table}?id=eq.{row_id}",
        {"file_hash": file_hash},
        prefer="return=minimal",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="0 = sin límite")
    args = parser.parse_args()

    print(f"🔑 Obteniendo ADC token...")
    token = adc_token()
    print(f"   OK ({len(token)} chars)")
    print()

    total_done = 0
    total_failed = 0
    by_hash: dict[str, list[tuple[str, str]]] = defaultdict(list)  # detect duplicates

    for tbl in TABLES:
        rows = list_pending(tbl)
        print(f"📋 {tbl}: {len(rows)} rows sin file_hash con drive_file_id")
        if args.limit and len(rows) > args.limit:
            rows = rows[: args.limit]
            print(f"   Limitado a {args.limit}")

        for i, row in enumerate(rows, 1):
            rid = row["id"]
            fid = row["drive_file_id"]
            fname = row.get("original_filename", "?")
            try:
                buf = drive_download(fid, token)
                h = hashlib.sha256(buf).hexdigest()
                by_hash[h].append((tbl, rid))
                if args.dry_run:
                    print(f"   [{i}/{len(rows)}] {tbl} {rid[:8]} → SHA={h[:16]}... ({len(buf)} B) [DRY]")
                else:
                    patch_hash(tbl, rid, h)
                    print(f"   [{i}/{len(rows)}] {tbl} {rid[:8]} → SHA={h[:16]}... ✓")
                total_done += 1
            except Exception as e:
                print(f"   ❌ {tbl} {rid[:8]} {fname[:40]}: {e}", file=sys.stderr)
                total_failed += 1
            time.sleep(0.05)  # rate limit suave Drive API

        print()

    print("=" * 60)
    print(f"Total OK:     {total_done}")
    print(f"Total failed: {total_failed}")

    duplicates = {h: rows for h, rows in by_hash.items() if len(rows) > 1}
    if duplicates:
        print(f"\n⚠️  Duplicados detectados (mismo SHA en >1 row):")
        for h, rows in duplicates.items():
            print(f"   SHA {h[:16]}...:")
            for tbl, rid in rows:
                print(f"      - {tbl} {rid}")
        print("\nDecidir manualmente cuál es canónico (probablemente el más antiguo).")

    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
