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
4. Popup → **Conectar Arduino**.

## Uso

1. Conecta Arduino por USB.
2. Pulsa **Conectar Arduino** en el popup (cambia a **Reconectar Arduino** cuando ya hay conexión).
3. Estados automáticos según Meet/Teams (`meet.google.com`, `teams.microsoft.com`, `teams.live.com`).

## Historial de juntas

Cada junta (LED rojo) se registra con inicio, fin, duración e integrantes. Popup → **Historial de juntas** abre la tabla, con **Exportar CSV** y **Borrar historial**.

- El historial local vive en este navegador (`chrome.storage.local`), máximo 1000 juntas.
- Los integrantes se leen de la pantalla de Meet/Teams: se capturan los que aparecen en mosaicos de video o en el panel **Personas**. En llamadas grandes, abre ese panel para capturar la lista completa.

### Reporte web (Firebase)

Para consultar las juntas desde cualquier computadora: <https://meet-light-juntas.web.app>

1. Popup → **Vincular cuenta de Google** → inicia sesión en la página que se abre.
2. Al terminar cada junta, la extensión la sube a Firestore en `users/{uid}/meetings/{id}`. Lo que no se pudo subir (sin red) se reintenta solo.
3. Abre la página en cualquier equipo con la misma cuenta: filtros por fecha/plataforma, totales, resumen por integrante y exportación CSV.

Las reglas ([firestore.rules](firestore.rules)) solo permiten a cada usuario leer y escribir sus propias juntas.

| Parte | Archivo |
|-------|---------|
| Página de reportes | [web/public/](web/public/) |
| Subida a Firestore (REST, sin SDK) | [chrome-extension/cloud-sync.js](chrome-extension/cloud-sync.js) |
| Proyecto y URL | [chrome-extension/firebase-config.js](chrome-extension/firebase-config.js), [.firebaserc](.firebaserc) |

Desplegar cambios de la página o las reglas:

```bash
firebase deploy --only hosting,firestore:rules
```

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| Host nativo no instalado | Ejecuta script de instalación y recarga extensión |
| Puertos detectados = 0 | Revisa cable USB / drivers (Windows) |
| LED parpadea azul, popup verde | Recarga extensión; heartbeat debe mantenerse cada 1 s |
| Puerto ocupado | Cierra Arduino IDE / Monitor Serial |
| ID distinto al esperado | `bash scripts/install-native-host-macos.sh TU_ID` |

Ver [chrome-extension/TESTING.md](chrome-extension/TESTING.md) para checklist completo macOS/Windows.
