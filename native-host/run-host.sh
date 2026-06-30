#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_PATH_FILE="$SCRIPT_DIR/.node-path"

resolve_node() {
  if [[ -f "$NODE_PATH_FILE" ]]; then
    local saved
    saved="$(tr -d '[:space:]' <"$NODE_PATH_FILE")"
    if [[ -n "$saved" && -x "$saved" ]]; then
      echo "$saved"
      return 0
    fi
  fi

  for candidate in /usr/local/bin/node /opt/homebrew/bin/node "C:/Program Files/nodejs/node.exe"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}

NODE_BIN="$(resolve_node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js no encontrado. Ejecuta scripts/install-native-host-macos.sh" >&2
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/host.js"
