#!/usr/bin/env bash
set -euo pipefail

OFFICIAL_EXTENSION_ID="hgcljcenaadbkdbmfnhbdnaednbbijhi"
EXTENSION_ID="${1:-$OFFICIAL_EXTENSION_ID}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_SCRIPT="$PROJECT_DIR/native-host/run-host.sh"
DEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
DEST_PATH="$DEST_DIR/com.meetlight.serial_host.json"

validate_extension_id() {
  if [[ ! "$1" =~ ^[a-p]{32}$ ]]; then
    echo "ID de extensión inválido: $1" >&2
    exit 1
  fi
}

validate_extension_id "$EXTENSION_ID"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado. Instálalo y vuelve a ejecutar." >&2
  exit 1
fi

if [[ ! -d "$PROJECT_DIR/native-host/node_modules" ]]; then
  echo "Instalando dependencias del host nativo..."
  npm ci --prefix "$PROJECT_DIR/native-host" 2>/dev/null || npm install --prefix "$PROJECT_DIR/native-host"
fi

mkdir -p "$DEST_DIR"
chmod +x "$HOST_SCRIPT"
chmod +x "$PROJECT_DIR/native-host/host.js"

NODE_BIN="$(command -v node)"
printf '%s\n' "$NODE_BIN" >"$PROJECT_DIR/native-host/.node-path"
chmod 600 "$PROJECT_DIR/native-host/.node-path"

node <<NODE
const fs = require('fs');
const manifest = {
  name: 'com.meetlight.serial_host',
  description: 'Meet Light Native Serial Host',
  path: ${JSON.stringify(HOST_SCRIPT)},
  type: 'stdio',
  allowed_origins: ['chrome-extension://${EXTENSION_ID}/']
};
fs.writeFileSync(${JSON.stringify(DEST_PATH)}, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
NODE

echo "Host nativo instalado en: $DEST_PATH"
echo "Node.js usado: $NODE_BIN"
echo "Extension ID registrado: $EXTENSION_ID"
