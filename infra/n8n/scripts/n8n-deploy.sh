#!/bin/bash
# ============================================
# Cathedral n8n deploy wrapper
# 4 pasos canónicos draft/active n8n 2.20+ (regla SUPREMA feedback_n8n_draft_active.md)
# ============================================
# Uso:
#   ./n8n-deploy.sh <workflow_id> <patch_payload.json>
#
# Env vars required:
#   N8N_LOGIN_EMAIL          d.vieco@cathedralgroup.es
#   N8N_LOGIN_PASSWORD       (1Password vault)
#   N8N_API_KEY              JWT Bearer (lectura GET versionId)
#   N8N_BASE_URL             https://n8n.cathedralgroup.es (default)
#
# Pasos:
#   1. Login -> cookie n8n-auth
#   2. PATCH draft (cookie + push-ref header)
#   3. GET capture nuevo versionId (API key)
#   4. POST /activate {versionId}
#   5. Verify versionId == activeVersionId
#
# Fuentes validadas doc-validator (sesión 18/05/2026):
#   - github.com/n8n-io/n8n/blob/master/packages/cli/src/constants.ts (AUTH_COOKIE_NAME)
#   - github.com/n8n-io/n8n/blob/master/packages/@n8n/api-types/src/dto/workflows/activate-workflow.dto.ts
#   - github.com/n8n-io/n8n/blob/master/packages/cli/src/workflows/workflows.controller.ts (push-ref)
# ============================================

set -euo pipefail

WID="${1:?usage: n8n-deploy.sh <workflow_id> <patch_payload.json>}"
PATCH_FILE="${2:?usage: n8n-deploy.sh <workflow_id> <patch_payload.json>}"

[[ -f "$PATCH_FILE" ]] || { echo "ERROR: patch file not found: $PATCH_FILE" >&2; exit 1; }

: "${N8N_LOGIN_EMAIL:?N8N_LOGIN_EMAIL required}"
: "${N8N_LOGIN_PASSWORD:?N8N_LOGIN_PASSWORD required}"
: "${N8N_API_KEY:?N8N_API_KEY required}"
: "${N8N_BASE_URL:=https://n8n.cathedralgroup.es}"

for cmd in curl jq mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd" >&2; exit 1; }
done

COOKIE_JAR=$(mktemp)
trap "rm -f $COOKIE_JAR" EXIT

# ============================================
# Step 1: Login -> cookie n8n-auth
# ============================================
echo "[1/5] Login as $N8N_LOGIN_EMAIL..."
LOGIN_BODY=$(jq -n --arg e "$N8N_LOGIN_EMAIL" --arg p "$N8N_LOGIN_PASSWORD" \
  '{emailOrLdapLoginId: $e, password: $p}')
LOGIN_STATUS=$(curl -sS -c "$COOKIE_JAR" -X POST "$N8N_BASE_URL/rest/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY" \
  -o /tmp/n8n-deploy-login.json -w "%{http_code}")

if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "ERROR: Login failed HTTP $LOGIN_STATUS" >&2
  cat /tmp/n8n-deploy-login.json >&2 2>/dev/null || true
  rm -f /tmp/n8n-deploy-login.json
  exit 1
fi
rm -f /tmp/n8n-deploy-login.json

# Verify cookie present
grep -q "n8n-auth" "$COOKIE_JAR" || { echo "ERROR: cookie n8n-auth not set" >&2; exit 1; }

# ============================================
# Step 2: PATCH draft (cookie + push-ref header)
# ============================================
echo "[2/5] PATCH workflow $WID..."
PATCH_STATUS=$(curl -sS -b "$COOKIE_JAR" -X PATCH "$N8N_BASE_URL/rest/workflows/$WID" \
  -H "Content-Type: application/json" \
  -H "push-ref: cathedral-deploy" \
  --data @"$PATCH_FILE" \
  -o /tmp/n8n-deploy-patch.json -w "%{http_code}")

if [[ ! "$PATCH_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  echo "ERROR: PATCH failed HTTP $PATCH_STATUS" >&2
  cat /tmp/n8n-deploy-patch.json >&2 2>/dev/null || true
  rm -f /tmp/n8n-deploy-patch.json
  exit 1
fi
rm -f /tmp/n8n-deploy-patch.json

# ============================================
# Step 3: GET capture nuevo versionId (API key)
# ============================================
echo "[3/5] Capture new versionId..."
NEW_VID=$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "$N8N_BASE_URL/api/v1/workflows/$WID" | jq -r '.versionId // empty')

if [[ -z "$NEW_VID" || "$NEW_VID" == "null" ]]; then
  echo "ERROR: versionId empty/null after PATCH" >&2
  exit 1
fi
echo "    New versionId: $NEW_VID"

# ============================================
# Step 4: POST /activate {versionId}
# ============================================
echo "[4/5] Activate version $NEW_VID..."
ACTIVATE_BODY=$(jq -n --arg vid "$NEW_VID" '{versionId: $vid}')
ACTIVATE_STATUS=$(curl -sS -b "$COOKIE_JAR" -X POST \
  "$N8N_BASE_URL/rest/workflows/$WID/activate" \
  -H "Content-Type: application/json" \
  -H "push-ref: cathedral-deploy" \
  -d "$ACTIVATE_BODY" \
  -o /tmp/n8n-deploy-activate.json -w "%{http_code}")

if [[ ! "$ACTIVATE_STATUS" =~ ^2[0-9][0-9]$ ]]; then
  echo "ERROR: POST /activate failed HTTP $ACTIVATE_STATUS" >&2
  cat /tmp/n8n-deploy-activate.json >&2 2>/dev/null || true
  rm -f /tmp/n8n-deploy-activate.json
  exit 1
fi
rm -f /tmp/n8n-deploy-activate.json

# ============================================
# Step 5: Verify versionId == activeVersionId
# ============================================
echo "[5/5] Verify draft == active..."
VERIFY=$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "$N8N_BASE_URL/api/v1/workflows/$WID" \
  | jq '{vid: .versionId, avid: .activeVersionId, equal: (.versionId == .activeVersionId)}')
echo "    $VERIFY"

EQUAL=$(echo "$VERIFY" | jq -r '.equal')
if [[ "$EQUAL" != "true" ]]; then
  echo "ERROR: versionId != activeVersionId after /activate — draft not published" >&2
  exit 1
fi

echo "✓ Deploy OK — workflow $WID activeVersion = $NEW_VID"
