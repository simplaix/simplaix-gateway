#!/usr/bin/env bash
# Test script for the Gateway MCP Server
# Usage: ./scripts/test-mcp.sh [BASE_URL]

BASE_URL="${1:-http://localhost:3001}"
MCP_ENDPOINT="$BASE_URL/api/v1/mcp-server/mcp"
HEALTH_ENDPOINT="$BASE_URL/api/v1/mcp-server/health"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

pass=0
fail=0

run_test() {
  local name="$1"
  local payload="$2"
  
  echo -e "\n${CYAN}=== $name ===${NC}"
  echo "Request: $payload" | python3 -m json.tool 2>/dev/null || echo "Request: $payload"
  
  response=$(curl -s -w "\n%{http_code}" -X POST "$MCP_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$payload")
  
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  
  echo "Status: $http_code"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}PASS${NC}"
    ((pass++))
  else
    echo -e "${RED}FAIL${NC}"
    ((fail++))
  fi
}

# ---- Health Check ----
echo -e "${CYAN}=== Health Check ===${NC}"
health=$(curl -s "$HEALTH_ENDPOINT")
echo "$health" | python3 -m json.tool 2>/dev/null || echo "$health"
echo ""

# ---- MCP Initialize (required first call) ----
run_test "Initialize" '{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": { "name": "test-client", "version": "1.0.0" }
  },
  "id": 1
}'

# ---- List Tools ----
run_test "List Tools" '{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}'

# ---- Call: list_agents ----
run_test "Call: list_agents" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_agents",
    "arguments": {}
  },
  "id": 3
}'

# ---- Call: list_tool_providers ----
run_test "Call: list_tool_providers" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_tool_providers",
    "arguments": {}
  },
  "id": 4
}'

# ---- Call: list_pending_approvals ----
run_test "Call: list_pending_approvals" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_pending_approvals",
    "arguments": {}
  },
  "id": 5
}'

# ---- Call: get_audit_logs ----
run_test "Call: get_audit_logs" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_audit_logs",
    "arguments": { "limit": 5 }
  },
  "id": 6
}'

# ---- Call: get_audit_stats ----
run_test "Call: get_audit_stats" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_audit_stats",
    "arguments": {}
  },
  "id": 7
}'

# ---- Summary ----
echo -e "\n${CYAN}========== Summary ==========${NC}"
echo -e "${GREEN}Passed: $pass${NC}"
echo -e "${RED}Failed: $fail${NC}"
total=$((pass + fail))
echo "Total:  $total"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
