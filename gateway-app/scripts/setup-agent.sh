#!/bin/bash

# Navigate to the agent directory
cd "$(dirname "$0")/../agent" || exit 0

if ! command -v uv &>/dev/null; then
  echo "uv not found — skipping Python agent setup (install uv to enable: https://docs.astral.sh/uv/)"
  exit 0
fi

uv sync
