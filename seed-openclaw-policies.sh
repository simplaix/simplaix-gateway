#!/usr/bin/env bash
# seed-openclaw-policies.sh
#
# Seeds per-tool policy rules for OpenClaw in the providerAccessRules table.
# Each rule maps a toolPattern to an action/risk for the registered agent.
#
# Prerequisites:
#   1. Gateway is running (default http://localhost:3001)
#   2. An admin JWT is available
#   3. An OpenClaw agent has been registered (POST /api/v1/admin/agents)
#
# Usage:
#   ADMIN_JWT=xxx AGENT_ID=xxx bash seed-openclaw-policies.sh
#
# Optional env vars:
#   GATEWAY_URL   — Gateway base URL (default: http://localhost:3001)
#   PROVIDER_ID   — Existing tool provider ID to use for all rules. When omitted
#                   the script creates a virtual "OpenClaw" tool provider automatically.
#
# The created provider ID must be passed as `providerId` in tool-gate/evaluate
# and tool-gate/audit requests so the policy engine can match these rules.

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
GW_BASE="${GATEWAY_URL:-http://localhost:3001}"
GW_PROVIDERS="$GW_BASE/api/v1/admin/tool-providers"
GW_RULES="$GW_BASE/api/v1/admin/provider-access"

if [[ -z "${ADMIN_JWT:-}" ]]; then
  echo "ERROR: ADMIN_JWT is required" >&2
  exit 1
fi
if [[ -z "${AGENT_ID:-}" ]]; then
  echo "ERROR: AGENT_ID is required" >&2
  exit 1
fi

AUTH="Authorization: Bearer $ADMIN_JWT"
CT="Content-Type: application/json"

# ── Step 0: Ensure tool provider exists ──────────────────────────────────────
if [[ -n "${PROVIDER_ID:-}" ]]; then
  echo "Using existing provider ID: $PROVIDER_ID"
else
  echo "Creating virtual OpenClaw tool provider..."
  PROVIDER_RESPONSE=$(curl -sf -X POST "$GW_PROVIDERS" \
    -H "$AUTH" -H "$CT" \
    -d '{
      "name": "openclaw",
      "pattern": "*",
      "endpoint": "virtual://openclaw",
      "authType": "none",
      "description": "Virtual provider for OpenClaw tool policy rules"
    }')

  PROVIDER_ID=$(echo "$PROVIDER_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['provider']['id'])" 2>/dev/null)

  if [[ -z "$PROVIDER_ID" ]]; then
    echo "ERROR: Failed to create tool provider. Response:" >&2
    echo "$PROVIDER_RESPONSE" >&2
    exit 1
  fi

  echo "Created tool provider: $PROVIDER_ID"
fi

echo ""
echo "=== Seeding OpenClaw per-tool policies ==="
echo "  Provider ID : $PROVIDER_ID"
echo "  Agent ID    : $AGENT_ID"
echo ""

# ── Helper ───────────────────────────────────────────────────────────────────
COUNT=0

add_rule() {
  local tool=$1 action=$2 risk=$3 desc=$4

  local RESPONSE
  RESPONSE=$(curl -sf -X POST "$GW_RULES" \
    -H "$AUTH" -H "$CT" \
    -d "{
      \"subjectType\": \"agent\",
      \"subjectId\": \"$AGENT_ID\",
      \"providerId\": \"$PROVIDER_ID\",
      \"toolPattern\": \"$tool\",
      \"action\": \"$action\",
      \"riskLevel\": \"$risk\",
      \"description\": \"$desc\"
    }" 2>&1) || true

  local RULE_ID
  RULE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rule',{}).get('id',''))" 2>/dev/null || echo "")

  if [[ -n "$RULE_ID" ]]; then
    COUNT=$((COUNT + 1))
    printf "  [%2d] %-20s → %-22s risk=%-8s %s\n" "$COUNT" "$tool" "$action" "$risk" "$RULE_ID"
  else
    echo "  WARN: Failed to create rule for '$tool': $RESPONSE" >&2
  fi
}

# ── pi-agent-core tools (4) ─────────────────────────────────────────────────
echo "--- pi-agent-core tools ---"
add_rule "exec"  "require_confirmation" "high"   "Shell command execution requires approval"
add_rule "read"  "allow"                "low"    "File read is allowed"
add_rule "write" "require_confirmation" "medium" "File write requires approval"
add_rule "edit"  "require_confirmation" "medium" "File edit requires approval"

# ── OpenClaw extension tools: require_confirmation (8) ───────────────────────
echo ""
echo "--- OpenClaw extensions: require_confirmation ---"
add_rule "browser"        "require_confirmation" "medium"   "Browser control requires approval"
add_rule "message"        "require_confirmation" "high"     "External messaging requires approval"
add_rule "nodes"          "require_confirmation" "high"     "Device control requires approval"
add_rule "cron"           "require_confirmation" "high"     "Cron job management requires approval"
add_rule "gateway"        "require_confirmation" "critical" "Gateway config changes require approval"
add_rule "canvas"         "require_confirmation" "medium"   "Canvas UI control requires approval"
add_rule "sessions_spawn" "require_confirmation" "medium"   "Sub-session creation requires approval"
add_rule "sessions_send"  "require_confirmation" "medium"   "Cross-session messaging requires approval"

# ── OpenClaw extension tools: allow (11) ─────────────────────────────────────
echo ""
echo "--- OpenClaw extensions: allow ---"
add_rule "web_fetch"         "allow" "low" "HTTP fetch is allowed"
add_rule "web_search"        "allow" "low" "Web search is allowed"
add_rule "image"             "allow" "low" "Image analysis is allowed"
add_rule "tts"               "allow" "low" "Text-to-speech is allowed"
add_rule "memory_get"        "allow" "low" "Memory read is allowed"
add_rule "memory_search"     "allow" "low" "Memory search is allowed"
add_rule "session_status"    "allow" "low" "Session status is allowed"
add_rule "sessions_list"     "allow" "low" "Session listing is allowed"
add_rule "sessions_history"  "allow" "low" "Session history is allowed"
add_rule "agents_list"       "allow" "low" "Agent listing is allowed"
add_rule "subagents"         "allow" "low" "Sub-agent management is allowed"

# ── Catch-all (required for whitelist mode) ──────────────────────────────────
echo ""
echo "--- Catch-all ---"
add_rule "*" "allow" "low" "Default allow for unmatched tools"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Done: $COUNT / 24 rules seeded ==="
echo ""
echo "Provider ID (pass as 'providerId' in tool-gate requests):"
echo "  $PROVIDER_ID"
echo ""
if [[ "$COUNT" -ne 24 ]]; then
  echo "WARNING: Expected 24 rules but created $COUNT. Check errors above." >&2
  exit 1
fi
