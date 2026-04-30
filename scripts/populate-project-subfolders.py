#!/usr/bin/env python3
"""Pobla la tabla `project_subfolders` escaneando las subcarpetas Drive de cada proyecto.

Lee `projects.drive_folder_id` para los 19 proyectos activos, lista los hijos de
cada carpeta en Google Drive, y hace UPSERT en `project_subfolders`. Esto cachea
~285 IDs Drive (19 proyectos × ~15 subcarpetas) para que el Router del workflow
general n8n pueda enrutar cada doc a la subcarpeta correcta sin hacer Drive API
calls en runtime.

Re-ejecutable e idempotente: si ya hay filas, las actualiza; las que ya no
existan en Drive se quedan (no se borran — manual cleanup si hace falta).

Uso
---
1. Reauth ADC con scope Drive:
       gcloud auth application-default login \\
         --client-id-file=~/.config/gcloud/cathedral-mcp-oauth.json \\
         --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform
2. Verificar:
       gcloud auth application-default print-access-token
3. Ejecutar:
       SUPABASE_KEY=sb_secret_... python3 scripts/populate-project-subfolders.py
       # o con --dry-run para solo reportar lo que haría sin escribir BD
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import urllib.error
from collections import defaultdict
from typing import Optional

SUPABASE_URL = os.environ.get(
    'SUPABASE_URL_REST',
    'https://cpqsnajuypgjjapvbqsr.supabase.co/rest/v1',
)
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')


def adc_token() -> str:
    out = subprocess.check_output(
        ['gcloud', 'auth', 'application-default', 'print-access-token'],
        stderr=subprocess.STDOUT,
    ).decode().strip()
    if 'ERROR' in out or not out.startswith('ya29.'):
        print(f'❌ ADC token inválido: {out[:120]}', file=sys.stderr)
        sys.exit(1)
    return out


def supabase_request(method: str, path: str, body: Optional[bytes] = None,
                     extra_headers: Optional[dict] = None) -> bytes:
    if not SUPABASE_KEY:
        print('❌ SUPABASE_KEY env var requerida', file=sys.stderr)
        sys.exit(1)
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        f'{SUPABASE_URL}{path}', data=body, headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def list_projects() -> list:
    body = supabase_request(
        'GET',
        '/projects?deleted_at=is.null&drive_folder_id=not.is.null'
        '&select=id,code,name,drive_folder_id&order=code',
    )
    return json.loads(body)


def list_drive_folder(folder_id: str, token: str) -> list:
    """Lista subcarpetas (no archivos) directamente bajo folder_id."""
    out = []
    page_token = None
    while True:
        params = {
            'q': f"'{folder_id}' in parents and "
                 "mimeType = 'application/vnd.google-apps.folder' and "
                 'trashed = false',
            'fields': 'files(id,name),nextPageToken',
            'pageSize': '200',
            'orderBy': 'name',
        }
        if page_token:
            params['pageToken'] = page_token
        url = 'https://www.googleapis.com/drive/v3/files?' + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        out.extend(data.get('files', []))
        page_token = data.get('nextPageToken')
        if not page_token:
            break
    return out


def upsert_subfolder(rows: list) -> None:
    """Inserta o actualiza N filas en project_subfolders. Body es lista de dicts."""
    if not rows:
        return
    body = json.dumps(rows).encode()
    supabase_request(
        'POST', '/project_subfolders',
        body=body,
        extra_headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true',
                        help='Solo lista lo que se haría, no escribe BD')
    args = parser.parse_args()

    print('🔑 Token ADC...')
    token = adc_token()
    print('   OK')

    print('\n📋 Cargando proyectos desde Supabase...')
    projects = list_projects()
    print(f'   {len(projects)} proyectos con drive_folder_id\n')

    summary = defaultdict(int)
    rows_to_upsert = []

    for p in projects:
        code = p['code']
        folder_id = p['drive_folder_id']
        try:
            subs = list_drive_folder(folder_id, token)
        except urllib.error.HTTPError as e:
            print(f'  ❌ {code}: HTTP {e.code} — saltado')
            summary['errors'] += 1
            continue
        except Exception as e:
            print(f'  ❌ {code}: {type(e).__name__} {e} — saltado')
            summary['errors'] += 1
            continue

        if not subs:
            print(f'  ⚠️  {code}: 0 subcarpetas (proyecto vacío)')
            summary['empty_projects'] += 1
            continue

        print(f'  ✓ {code}: {len(subs)} subcarpetas')
        for s in subs:
            rows_to_upsert.append({
                'project_id': p['id'],
                'subfolder_name': s['name'],
                'drive_folder_id': s['id'],
            })
        summary['subfolders_total'] += len(subs)

    print(f"\n📊 Total: {summary['subfolders_total']} subcarpetas en "
          f"{len(projects) - summary['empty_projects'] - summary['errors']} proyectos "
          f"({summary['errors']} errores, {summary['empty_projects']} vacíos)")

    if args.dry_run:
        print('\n🔵 DRY RUN — no se ha escrito en BD. Para aplicar, re-ejecutar sin --dry-run.')
        return 0

    print(f'\n📥 UPSERT {len(rows_to_upsert)} filas en project_subfolders...')
    # Lotes de 100 para no exceder límites Supabase REST
    BATCH = 100
    for i in range(0, len(rows_to_upsert), BATCH):
        chunk = rows_to_upsert[i:i + BATCH]
        try:
            upsert_subfolder(chunk)
            print(f'   batch {i // BATCH + 1}: {len(chunk)} filas OK')
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            print(f'   ❌ batch {i // BATCH + 1}: HTTP {e.code}: {err}')
            return 1

    print('\n✅ Población completa.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
