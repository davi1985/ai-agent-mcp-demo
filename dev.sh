#!/usr/bin/env bash
# Sobe o MCP server (porta 3000) e o frontend (porta 3001) juntos.
# Ctrl+C encerra os dois.
set -e

BASEDIR="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "==> MCP server  -> http://localhost:3000/mcp"
(cd "$BASEDIR/server" && npm run dev) &

echo "==> Frontend    -> http://localhost:3001"
(cd "$BASEDIR/web" && npm run dev) &

wait