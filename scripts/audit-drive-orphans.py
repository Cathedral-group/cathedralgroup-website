#!/usr/bin/env python3
"""
Audit + cleanup Drive orphans (sesión 30, 30/04/2026).

Contexto del bug
----------------
Cuando un email se reenvía a múltiples buzones (info@, administracion@,
j.rivera@, etc.), cada Gmail Trigger lo procesa independientemente y el
nodo `Drive Upload` sube el PDF SIN comprobar si ya existe. El UNIQUE de
file_hash en BD impide rows duplicados, pero el Drive queda con N copias
del mismo archivo.

Caso descubierto: 1 PDF "20260423_desconocido_26058.pdf" tiene 14+ copias
físicas en Drive vs 1 row en BD.

Lo que hace este script
-----------------------
1. Lista TODOS los archivos en las carpetas destino del workflow:
   _PENDIENTE_CLASIFICAR, Facturas_sin_clasificar, Proformas, Albaranes,
   Certificados, Presupuestos, Documentos_varios, Seguros_PRL, Laboral, Legal
2. Cruza con `drive_file_id` activos en BD (invoices + quotes + documents).
3. Identifica archivos huérfanos: en Drive pero NO referenciados desde BD.
4. Modos:
   - --dry-run (default): solo reporta. Genera /tmp/drive-orphans-report.csv
   - --apply: tras confirmación interactiva, mueve a papelera

Cómo correr
-----------
1. Reauth ADC con scope Drive:
       gcloud auth application-default login \\
         --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform
2. Verificar:
       gcloud auth application-default print-access-token
3. Ejecutar:
       SUPABASE_KEY=sb_secret_... python3 scripts/audit-drive-orphans.py --dry-run
       # Revisa /tmp/drive-orphans-report.csv
       SUPABASE_KEY=sb_secret_... python3 scripts/audit-drive-orphans.py --apply

Mantiene siempre los drive_file_id referenciados desde BD activa
(deleted_at IS NULL). Los rows soft-deleted NO protegen sus archivos Drive
(filosofía: si el row está borrado, su archivo también puede irse).
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from collections import defaultdict
from typing import Optional

SUPABASE_URL = "https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# Carpetas destino del workflow (FOLDER_MAP del Config en n8n)
TARGET_FOLDERS = {
    "_PENDIENTE_CLASIFICAR": "1Jb5hCaivT6whN_Hdvkw1nl9j3YjDri_4",
    "Facturas_sin_clasificar": "1rwQ1wl_X9yqfmg4rGjVoXkkLEYgCnluF",
    "Proformas": "1rg6sejuw-W-2U5yTxd4tU6nqg1-F7kL_",
    "Albaranes": "1_gF_lHrnFIXOuMlPu0onnDSum756nXjO",
    "Certificados": "1AI0xrxAQ6K2isLK98dnY_wmvveaeLkjy",
    "Presupuestos": "1qmSxaGWEquh9ruoc8eMia2ASs4qFV6CK",
    "Documentos_varios": "1wSw90og01wwTiXmn5-X1Unefr0nbUD8M",
    "Seguros_PRL": "1zmHQ0dFdjPq9MN4HdOqNp0ZhdxBYWhr9",
    "Laboral": "113BL-yElcr7Icx67N3A0XWHzXsMQnfS7",
    "Legal": "1RCUC-q7PRmfAfiPCPFS-R5YsIud2Eudj",
}

REPORT_PATH = "/tmp/drive-orphans-report.csv"


def adc_token() -> str:
    out = subprocess.check_output(
        ["gcloud", "auth", "application-default", "print-access-token"],
        stderr=subprocess.STDOUT,
    ).decode().strip()
    if "ERROR" in out or not out.startswith("ya29."):
        print(f"❌ ADC token inválido: {out[:120]}", file=sys.stderr)
        print("Reauth: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform", file=sys.stderr)
        sys.exit(1)
    return out


def supabase_get(path: str) -> list:
    if not SUPABASE_KEY:
        print("❌ SUPABASE_KEY no definida (env)", file=sys.stderr)
        sys.exit(1)
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def drive_list_folder(folder_id: str, token: str) -> list:
    """Lista todos los archivos directamente dentro del folder_id (sin recursión)."""
    out = []
    page_token = None
    while True:
        q = f"'{folder_id}' in parents and trashed=false"
        params = {
            "q": q,
            "fields": "files(id,name,createdTime,size,mimeType),nextPageToken",
            "pageSize": "1000",
            "orderBy": "createdTime desc",
        }
        if page_token:
            params["pageToken"] = page_token
        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        out.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return out


def drive_trash(file_id: str, token: str) -> None:
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    req = urllib.request.Request(
        url,
        data=json.dumps({"trashed": True}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true", help="Mover huérfanos a papelera (requiere confirmación)")
    args = parser.parse_args()
    apply = args.apply

    print("🔑 ADC token...")
    token = adc_token()
    print("   OK")
    print()

    print("📋 Cargando drive_file_id activos desde BD (3 tablas)...")
    bd_ids = set()
    for table in ["invoices", "quotes", "documents"]:
        rows = supabase_get(
            f"/{table}?deleted_at=is.null&drive_file_id=not.is.null&select=drive_file_id"
        )
        ids = {r["drive_file_id"] for r in rows if r.get("drive_file_id")}
        bd_ids.update(ids)
        print(f"   {table}: {len(ids)} drive_file_id únicos")
    print(f"   Total IDs activos en BD: {len(bd_ids)}")
    print()

    print("📂 Listando archivos Drive en cada carpeta destino...")
    all_drive_files = []
    by_folder_count = {}
    for folder_name, folder_id in TARGET_FOLDERS.items():
        try:
            files = drive_list_folder(folder_id, token)
        except Exception as e:
            print(f"   ⚠️  {folder_name}: error {e}")
            continue
        for f in files:
            f["_folder_name"] = folder_name
        all_drive_files.extend(files)
        by_folder_count[folder_name] = len(files)
        print(f"   {folder_name}: {len(files)} archivos")
    print(f"   Total archivos Drive: {len(all_drive_files)}")
    print()

    print("🔍 Identificando huérfanos (en Drive pero no en BD)...")
    orphans = [f for f in all_drive_files if f["id"] not in bd_ids]
    referenced = [f for f in all_drive_files if f["id"] in bd_ids]
    print(f"   Referenciados desde BD: {len(referenced)}")
    print(f"   Huérfanos (sin referencia): {len(orphans)}")
    print()

    # Generar CSV report
    with open(REPORT_PATH, "w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["folder", "drive_file_id", "name", "created_at", "size_bytes", "mime_type", "action"])
        for f in orphans:
            writer.writerow([
                f["_folder_name"], f["id"], f["name"], f.get("createdTime", ""),
                f.get("size", ""), f.get("mimeType", ""), "DELETE"
            ])
        for f in referenced:
            writer.writerow([
                f["_folder_name"], f["id"], f["name"], f.get("createdTime", ""),
                f.get("size", ""), f.get("mimeType", ""), "KEEP"
            ])
    print(f"📊 Reporte CSV generado: {REPORT_PATH}")
    print()

    # Top duplicados por nombre + folder
    by_name = defaultdict(list)
    for f in all_drive_files:
        by_name[(f["_folder_name"], f["name"])].append(f)
    top_dups = sorted(
        [(k, v) for k, v in by_name.items() if len(v) > 1],
        key=lambda kv: -len(kv[1])
    )[:10]
    if top_dups:
        print("📊 Top 10 nombres con más copias:")
        for (folder, name), files in top_dups:
            n_orphan = sum(1 for f in files if f["id"] not in bd_ids)
            print(f"   [{folder}] '{name[:50]}' — {len(files)} copias ({n_orphan} huérfanos)")
        print()

    if not apply:
        print(f"📋 DRY RUN — solo reporte. Para borrar masivo: {sys.argv[0]} --apply")
        return 0

    if not orphans:
        print("✅ No hay huérfanos que borrar.")
        return 0

    # Confirmación interactiva
    total_size = sum(int(f.get("size", 0)) for f in orphans)
    print(f"⚠️  ¿Mover a papelera {len(orphans)} archivos huérfanos ({total_size / 1024 / 1024:.1f} MB)?")
    answer = input("   Escribe SI MAYUSCULAS para confirmar: ").strip()
    if answer != "SI":
        print("Cancelado.")
        return 1

    print()
    print(f"🗑️  Moviendo a papelera {len(orphans)} archivos...")
    for i, f in enumerate(orphans, 1):
        try:
            drive_trash(f["id"], token)
            if i % 20 == 0:
                print(f"   {i}/{len(orphans)} OK")
        except Exception as e:
            print(f"   ❌ {f['id']} {f['name']}: {e}", file=sys.stderr)
        time.sleep(0.05)
    print(f"   {len(orphans)} archivos movidos a papelera Drive.")
    print("   Pueden recuperarse desde Papelera durante 30 días si fue por error.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
