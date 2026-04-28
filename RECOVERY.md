# RECOVERY — Cómo recuperar el sistema Cathedral Group

Este documento cubre cómo recuperar el sistema cuando algo se cae. Está estructurado por escenarios, de menor a mayor gravedad.

> **Filosofía**: cada componente crítico tiene su backup automático y su procedimiento de recovery. Ver [memoria `feedback_backup_y_recovery.md`](../).

## Antes de nada — inventario de credenciales

Todas las credenciales activas viven en `~/.claude/projects/-Users-davidvieco/memory/cathedral-credentials.md` (chmod 600, solo en el Mac de David). Si pierdes ese archivo:
- Hay que reconstruirlo desde los servicios:
  - Supabase Dashboard → API Keys
  - n8n UI → Credentials
  - Vercel Dashboard → Environment Variables
  - GitHub → Settings → Secrets and variables → Actions

## Escenario A — BD Supabase corrupta o filas borradas (proyecto vivo)

**Síntoma**: el proyecto Supabase sigue activo pero hay datos corruptos, borrados accidentales, o un schema cambió mal.

**Procedimiento** (ver también `scripts/restore-db.sh`):

1. Localiza el último backup bueno en Drive: `ADMINISTRACION/Backups/Supabase/`
2. Descarga el `.dump.gz` del día anterior al problema
3. Decide el alcance:
   - **Tabla específica** (recovery quirúrgico):
     ```bash
     export DATABASE_URL=...  # ver cathedral-credentials.md
     ./scripts/restore-db.sh cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump.gz invoices
     ```
   - **BD entera** (overwrites todo):
     ```bash
     ./scripts/restore-db.sh cathedral_db_YYYY-MM-DD_HHMMSS_daily.dump.gz
     ```
4. Verifica integridad:
   - Login admin → todos los módulos cargan
   - `SELECT count(*)` en tablas clave coincide con valores esperados

**Backups disponibles**:
- Drive `ADMINISTRACION/Backups/Supabase/` — retention 30 daily + 52 weekly + ∞ monthly
- GitHub Actions artifacts (`Backup BD Supabase` workflow runs) — fallback 90 días

## Escenario B — Proyecto Supabase perdido completamente

**Síntoma**: el proyecto entero desapareció (cuenta hackeada, eliminado, Supabase down permanente).

**Procedimiento**:

1. **Crear nuevo proyecto Supabase**:
   - Login en supabase.com
   - New project → región `eu-west-1` (Irlanda) → password robusta nueva
   - Anotar nuevo `project_ref` (lo llamaremos `<NEW_REF>`)

2. **Aplicar todas las migraciones SQL en orden**:
   ```bash
   cd cathedralgroup-website/supabase/migrations
   for f in $(ls *.sql | sort); do
     echo "Aplicando $f"
     psql "<NEW_DATABASE_URL>" -f "$f"
   done
   ```
   (alternativa: copiar/pegar cada `.sql` en SQL Editor del Dashboard nuevo)

3. **Restaurar datos del último backup**:
   ```bash
   gunzip cathedral_db_LATEST.dump.gz
   pg_restore --dbname="<NEW_DATABASE_URL>" --data-only --no-owner --no-acl --verbose cathedral_db_LATEST.dump
   ```

4. **Re-configurar Auth**:
   - Dashboard → Authentication → Settings:
     - `disable_signup: true`
     - `password_min_length: 12`
     - `password_required_characters: lower_upper_letters_digits`
     - `mailer_autoconfirm: false`
   - Email templates por defecto (no se han customizado)
   - Crear los 3 usuarios manualmente desde Authentication → Users → Invite:
     - `d.vieco@cathedralgroup.es`
     - `jm.lozano@cathedralgroup.es`
     - `j.rivera@cathedralgroup.es`
   - Cada usuario configurará MFA al primer login (allow-list en `lib/auth-allowlist.ts` los obliga)

5. **Re-generar API keys**:
   - Dashboard → API Keys → toggle "Use new API keys" si no lo está
   - Copiar `sb_publishable_*` (anon equivalent) y `sb_secret_*` (service_role)
   - Crear nuevo PAT en Account → Access Tokens → para MCP

6. **Actualizar credenciales en TODOS los sistemas**:
   - **Vercel** (Dashboard → Project → Environment Variables):
     - `NEXT_PUBLIC_SUPABASE_URL` = nueva URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = nuevo `sb_publishable_*`
     - `SUPABASE_SERVICE_ROLE_KEY` = nuevo `sb_secret_*`
     - Redeploy
   - **n8n** (UI → Credentials):
     - "Supabase Service Role - Cathedral" (httpCustomAuth, ID `5xRFcnO4yGdhD4pN`):
       Header `apikey` → nuevo `sb_secret_*`
       Header `Authorization` → `Bearer <nuevo sb_secret_*>`
   - **`~/.mcp.json` local** del Mac:
     - `SUPABASE_ACCESS_TOKEN` = nuevo PAT
     - `--project-ref=<NEW_REF>`
   - **GitHub Secrets** (`.github/workflows/backup-db.yml` los necesita):
     - `SUPABASE_DATABASE_URL` = nueva connection string directa
   - **Memoria** (`cathedral-credentials.md`): actualizar TODOS los valores

7. **Verificar**:
   - Login admin (`/admin/login`) funciona
   - Workflow n8n procesa una factura nueva y la inserta en Supabase
   - GitHub Action backup-db ejecuta manualmente sin errores

## Escenario C — n8n caído (container roto, server vivo)

**Síntoma**: el container n8n no responde, pero el servidor Hetzner sí. Workflows no procesan emails.

**Procedimiento**:

1. **SSH al servidor**: `ssh root@77.42.36.4`
2. **Inspeccionar estado**:
   ```bash
   docker ps -a | grep n8n
   docker logs --tail 100 n8n
   ```
3. **Restart simple primero**:
   ```bash
   docker restart n8n
   sleep 10
   curl -I https://n8n.cathedralgroup.es
   ```
4. **Si persiste — restaurar volume desde último backup**:
   - Descarga `n8n_volume_LATEST.tar.gz` de Drive `ADMINISTRACION/Backups/n8n-volume/`
   - Súbelo al server: `scp n8n_volume_LATEST.tar.gz root@77.42.36.4:/tmp/`
   - En el server:
     ```bash
     docker stop n8n
     # Backup actual del volume por si acaso (hard delete posterior si OK)
     mv /var/lib/docker/volumes/n8n_data /var/lib/docker/volumes/n8n_data.broken-$(date +%s)
     # Restore desde backup
     mkdir -p /var/lib/docker/volumes
     tar -xzf /tmp/n8n_volume_LATEST.tar.gz -C /var/lib/docker/volumes
     docker start n8n
     sleep 15
     curl -I https://n8n.cathedralgroup.es
     ```
5. **Verificar que workflows estén active**:
   - n8n UI → Workflows → todos los `Cathedral · *` deben aparecer
   - Si están inactive tras restore: ejecutar
     ```bash
     KEY=<n8n api key>
     for ID in LWZWxjo9O5ku7tF7 QQqYq5cJE1c1zm7F rVP7OfuMpZrHVPxa KAlXyzaDmSNWfUQW; do
       curl -X POST "https://n8n.cathedralgroup.es/api/v1/workflows/$ID/activate" -H "X-N8N-API-KEY: $KEY"
     done
     ```

## Escenario D — Servidor Hetzner perdido completamente (n8n y todo)

**Síntoma**: el servidor está irrecuperable.

**Procedimiento**:

1. **Provisionar nuevo servidor** (Hetzner Cloud, Ubuntu 24.04, mínimo 2 vCPU + 4GB RAM)
2. **Instalar Docker** (`curl -fsSL https://get.docker.com | sh`)
3. **Restaurar el volume** desde Drive `ADMINISTRACION/Backups/n8n-volume/`:
   ```bash
   scp n8n_volume_LATEST.tar.gz root@<NEW_IP>:/tmp/
   ssh root@<NEW_IP>
   mkdir -p /var/lib/docker/volumes
   tar -xzf /tmp/n8n_volume_LATEST.tar.gz -C /var/lib/docker/volumes
   ```
4. **Levantar el container con la misma config**:
   ```bash
   docker run -d --name n8n --restart unless-stopped \
     -p 5678:5678 \
     -v n8n_data:/home/node/.n8n \
     -e WEBHOOK_URL=https://n8n.cathedralgroup.es \
     -e N8N_HOST=n8n.cathedralgroup.es \
     -e N8N_PROTOCOL=https \
     -e N8N_USER_MANAGEMENT_JWT_DURATION_HOURS=168 \
     -e EXECUTIONS_DATA_SAVE_ON_SUCCESS=all \
     -e EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true \
     -e N8N_SECURE_COOKIE=false \
     -e N8N_EDITOR_BASE_URL=https://n8n.cathedralgroup.es \
     n8nio/n8n
   ```
5. **Apuntar DNS** del subdominio `n8n.cathedralgroup.es` (gestionado por IONOS) al nuevo IP
6. **Verificar que n8n responda HTTPS** — puede tardar minutos en propagarse el DNS y en obtener cert SSL (n8n auto-genera con Let's Encrypt si está configurado, o nginx reverse proxy)
7. **Ejecutar Healthcheck workflow** manualmente para confirmar que todo procesa

## Escenario E — Workflow n8n específico borrado o corrompido

**Procedimiento**:

1. Descargar último backup `n8n_workflows_LATEST.json.gz` de Drive `ADMINISTRACION/Backups/n8n-workflows/`
2. Descomprimir + extraer el workflow:
   ```bash
   gunzip n8n_workflows_LATEST.json.gz
   jq '.workflows_detailed[] | select(.id == "LWZWxjo9O5ku7tF7")' n8n_workflows_LATEST.json > workflow.json
   ```
3. Importar via API:
   ```bash
   curl -X POST "https://n8n.cathedralgroup.es/api/v1/workflows" \
     -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" \
     -d @workflow.json
   ```
   **NOTA**: el ID original puede chocar si el workflow original existe. Quitar `.id` del JSON antes del POST si es para reemplazar.

## Escenario F — Vercel deploy caído

**Procedimiento**:
1. Vercel Dashboard → Deployments → identificar último deploy bueno → "Promote to Production"
2. Si el repo GitHub está vivo: `git revert` del commit problemático + push, Vercel auto-redeploya
3. Si Vercel down completo: `vercel --prod` desde CLI con otra cuenta como fallback

## Escenario G — MCP config (`~/.mcp.json`) perdido

**Síntoma**: pierdes el Mac o el archivo se corrompe. Claude no puede acceder a n8n / Supabase / Vercel / etc.

**Procedimiento**:

El `~/.mcp.json` es **derivable** — todas las credenciales que contiene viven en `cathedral-credentials.md` (memoria del Mac, chmod 600).

1. Si tienes el `cathedral-credentials.md` aún:
   - Crear `~/.mcp.json` desde scratch con la estructura conocida
   - Plantilla:
     ```json
     {
       "mcpServers": {
         "n8n": {
           "command": "npx",
           "args": ["n8n-mcp"],
           "env": {
             "N8N_API_URL": "https://n8n.cathedralgroup.es",
             "N8N_API_KEY": "<valor de cathedral-credentials.md sección n8n>",
             "MCP_MODE": "stdio",
             "LOG_LEVEL": "error"
           }
         },
         "supabase": { ... },
         "vercel": { ... },
         ...
       }
     }
     ```
2. Si también perdiste `cathedral-credentials.md`:
   - Regenerar cada credencial desde su servicio (Supabase Dashboard → API Keys nuevas, n8n UI → API key nueva, etc.)
   - Reconstruir `cathedral-credentials.md` con los nuevos valores

## Escenario H — Apocalipsis (todo perdido)

**Procedimiento secuencial** (estimado: 4-8h de trabajo):

1. **Recover GitHub repo**: `git clone https://github.com/Cathedral-group/cathedralgroup-website` (asumiendo cuenta GitHub viva)
2. **Recover Drive**: las cuentas Google Workspace siguen vivas con los backups en `ADMINISTRACION/Backups/`
3. **Aplicar Escenario B** (Supabase nuevo + restore datos)
4. **Aplicar Escenario D** (n8n nuevo + restore volume)
5. **Reconfigurar Vercel**:
   - Conectar repo GitHub → Vercel
   - Re-añadir env vars desde `cathedral-credentials.md`
   - Promote first deploy a producción
6. **Re-apuntar DNS** (IONOS Dashboard) si hubo cambios de IP
7. **Reconfigurar GitHub Secrets** desde `cathedral-credentials.md`
8. **Verificar end-to-end**:
   - Web pública responde
   - Login admin funciona con MFA
   - n8n procesa una factura test
   - GitHub Actions corren sin errores
   - Cron auditor (mañana 03:00) detecta correctamente

## Tabla de tiempos esperados

| Escenario | Tiempo estimado | Pérdida de datos esperada |
|---|---|---|
| A — BD corrupta (proyecto vivo) | 15-30 min | Hasta 24h (último backup diario) |
| B — Supabase perdido | 1-2 h | Hasta 24h |
| C — n8n caído (container) | 15 min (restart) o 1h (volume restore) | 0 (cron auditor recupera huérfanos) |
| D — Servidor Hetzner perdido | 2-3 h | 0 (cron auditor recupera) |
| E — Workflow n8n corrupto | 5-15 min | 0 |
| F — Vercel caído | 5-30 min | 0 |
| G — MCP config | 10 min (con credentials) o 1h (sin) | 0 |
| H — Apocalipsis | 4-8 h | Hasta 24h (BD) |

## Pruebas periódicas recomendadas

- **Cada trimestre**: simulacro de Escenario A en un proyecto Supabase sandbox (descargar backup, restaurar, verificar)
- **Anualmente**: simulacro de Escenario B completo (proyecto Supabase nuevo desde cero)
- **Tras cada cambio importante de schema**: verificar que el siguiente backup nocturno funciona OK
