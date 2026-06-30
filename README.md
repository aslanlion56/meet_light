# Meet Light — Semáforo de junta activa

Indica con un **LED RGB** tu disponibilidad en Google Meet y Microsoft Teams:

| Color LED | Significado |
|-----------|-------------|
| **Verde** | Libre (sin pestañas Meet/Teams abiertas) |
| **Azul** | Meet o Teams abierto, reunión aún no iniciada |
| **Rojo** | Reunión en curso |
| **Parpadeo azul** | Sin conexión serial (>2,5 s sin datos) |

La extensión y el popup muestran el mismo color que el LED físico.

## Componentes

| Parte | Descripción |
|-------|-------------|
| [Meet_light.ino](Meet_light.ino) | Firmware Arduino |
| [chrome-extension/](chrome-extension/) | Extensión Chrome (Meet/Teams + popup) |
| [native-host/](native-host/) | Host nativo Node.js (Native Messaging + serial) |
| [scripts/](scripts/) | Instaladores del host nativo (macOS/Windows) |
| [native-manifests/](native-manifests/) | Plantilla del manifest Native Messaging |

### Requisitos

- Google Chrome
- Node.js LTS
- Arduino Uno con sketch cargado
- Drivers USB del Arduino (CH340/FTDI en Windows si aplica)

## Protocolo serial (9600 baud)

La extensión envía **byte de estado + salto de línea** (`\n`):

| Byte | Estado | Color |
|------|--------|-------|
| `'0'` | Libre | Verde |
| `'1'` | Esperando | Azul |
| `'2'` | En junta | Rojo |

El firmware considera desconectado si pasan **2,5 s** sin datos serial.

## Instalación rápida

### 1. Arduino

1. Sube [Meet_light.ino](Meet_light.ino) desde Arduino IDE.
2. Cierra Arduino IDE y Monitor Serial antes de usar la extensión.

### 2. Extensión + host nativo

```bash
cd native-host
npm ci || npm install
cd ..
```

**macOS**

```bash
bash scripts/install-native-host-macos.sh
```

**Windows (PowerShell)**

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\scripts\install-native-host-windows.ps1
```

### 3. Chrome

1. Abre `chrome://extensions` → **Modo de desarrollador**.
2. **Cargar extensión sin empaquetar** → carpeta `chrome-extension/`.
3. Verifica ID: `hgcljcenaadbkdbmfnhbdnaednbbijhi`.
4. Popup → **Conectar Arduino** o **Reconectar ahora**.

## Uso

1. Conecta Arduino por USB.
2. Pulsa **Reconectar ahora** en el popup.
3. Estados automáticos según Meet/Teams (`meet.google.com`, `teams.microsoft.com`, `teams.live.com`).

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| Host nativo no instalado | Ejecuta script de instalación y recarga extensión |
| Puertos detectados = 0 | Revisa cable USB / drivers (Windows) |
| LED parpadea azul, popup verde | Recarga extensión; heartbeat debe mantenerse cada 1 s |
| Puerto ocupado | Cierra Arduino IDE / Monitor Serial |
| ID distinto al esperado | `bash scripts/install-native-host-macos.sh TU_ID` |

Ver [chrome-extension/TESTING.md](chrome-extension/TESTING.md) para checklist completo macOS/Windows.
