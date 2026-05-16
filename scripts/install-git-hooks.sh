#!/bin/bash
# Instala git hooks Cathedral en .git/hooks/.
#
# Hooks instalados:
#   - pre-commit (existente):  gitleaks scan secretos staged
#   - pre-push (nuevo):        ci-full-check ligero (--skip-golden) si push toca api/lib
#
# Uso:
#   bash scripts/install-git-hooks.sh
#
# Idempotente — re-correr sobreescribe versión actual.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${REPO_ROOT}/.git/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: ${HOOKS_DIR} no existe. ¿Estás en repo git?"
  exit 1
fi

# ─── pre-push: CI ligero si cambios api/lib ──────────────────────────────────
cat > "${HOOKS_DIR}/pre-push" <<'EOF'
#!/bin/bash
# Pre-push hook Cathedral: ejecuta CI ligero si cambios tocan api/ o lib/.
# Saltarse temporal: git push --no-verify (NO RECOMENDADO).

set -e

# Detectar archivos modificados respecto al upstream
RANGE=$(git rev-parse --verify HEAD)
if git rev-parse --verify "@{u}" >/dev/null 2>&1; then
  RANGE="@{u}..HEAD"
fi

CHANGED_FILES=$(git diff --name-only "$RANGE" 2>/dev/null || git diff --name-only HEAD~1..HEAD)

# Solo correr CI si hay cambios en api/ o lib/
if echo "$CHANGED_FILES" | grep -qE "^(app/api/|lib/)"; then
  echo "🧪 Cambios en api/ o lib/ — ejecutando ci-full-check ligero..."

  if [ -z "${CATHEDRAL_INTERNAL_TOKEN:-}" ]; then
    echo "⚠️  CATHEDRAL_INTERNAL_TOKEN no set — skip CI."
    echo "   Set var en .env.local o export antes del push."
    exit 0
  fi

  node scripts/ci-full-check.mjs --skip-golden

  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ PUSH BLOQUEADO: ci-full-check fail."
    echo "   Revisar arriba. Saltarse: git push --no-verify (NO RECOMENDADO)."
    exit 1
  fi

  echo "✅ CI ligero pass."
else
  echo "ℹ️  Sin cambios api/ o lib/ — skip CI."
fi

exit 0
EOF

chmod +x "${HOOKS_DIR}/pre-push"
echo "✅ pre-push hook instalado en ${HOOKS_DIR}/pre-push"

echo ""
echo "Hooks activos:"
ls -la "${HOOKS_DIR}/" | grep -v "\.sample$" | grep -v "^d" | grep -v "^total"
