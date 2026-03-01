#!/usr/bin/env bash
# Start a Cloudflare quick tunnel and write the public URL to .env
# Usage: ./scripts/dev-tunnel.sh [port]
set -euo pipefail

PORT="${1:-3001}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

CLOUDFLARED="pnpm exec cloudflared"

# Clean up on exit
CLOUDFLARED_PID=""
cleanup() {
  if [[ -n "$CLOUDFLARED_PID" ]]; then
    kill "$CLOUDFLARED_PID" 2>/dev/null || true
    wait "$CLOUDFLARED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

LOG=$(mktemp)

echo "Starting cloudflared tunnel on port $PORT..."
$CLOUDFLARED tunnel --url "http://localhost:$PORT" 2>"$LOG" &
CLOUDFLARED_PID=$!

# Wait for the public URL to appear in cloudflared output
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

rm -f "$LOG"

if [[ -z "$TUNNEL_URL" ]]; then
  echo "Failed to get tunnel URL after 30s"
  exit 1
fi

echo ""
echo "Tunnel URL: $TUNNEL_URL"
echo ""

# Write to .env (create if missing, update if exists)
if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^GATEWAY_PUBLIC_URL=' "$ENV_FILE"; then
    sed -i '' "s|^GATEWAY_PUBLIC_URL=.*|GATEWAY_PUBLIC_URL=$TUNNEL_URL|" "$ENV_FILE"
  else
    echo "GATEWAY_PUBLIC_URL=$TUNNEL_URL" >> "$ENV_FILE"
  fi
else
  echo "GATEWAY_PUBLIC_URL=$TUNNEL_URL" > "$ENV_FILE"
fi

echo "Written to .env: GATEWAY_PUBLIC_URL=$TUNNEL_URL"
echo ""
echo "Press Ctrl+C to stop the tunnel."

# Keep running until interrupted
wait "$CLOUDFLARED_PID"
