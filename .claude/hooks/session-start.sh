#!/bin/bash
set -euo pipefail

# Only run in Claude Code remote (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "==> Installing dependencies with Bun..."
cd "$CLAUDE_PROJECT_DIR"
bun install

echo "==> Generating Prisma client..."
bun run prisma:generate

echo "==> Environment ready."
