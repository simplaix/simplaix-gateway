#!/bin/bash

# Navigate to the agent directory
cd "$(dirname "$0")/../agent" || exit 1

# Use AGENT_PORT env var or default to 8000
export AGENT_PORT="${AGENT_PORT:-8000}"

# Run the agent using uv
uv run python main.py
