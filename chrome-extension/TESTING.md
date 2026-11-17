# Pruebas — Meet Light

## Tests automatizados

### Extensión

```bash
cd chrome-extension
npm install
npm test
```

Cubre:

- Cliente Native Messaging (`native-serial-client`)
- Autorización de mensajes (`message-auth`)
- Prioridad de estados Meet/Teams
- Pestañas serial-host

### Host nativo

```bash
cd native-host
npm ci || npm install
npm test
```

Cubre validación de protocolo y lógica de selección de puerto.

## Checklist E2E — macOS

1. Instalar host: `bash scripts/install-native-host-macos.sh`
2. Recargar extensión en `chrome://extensions`
3. Cerrar Arduino IDE / Monitor Serial
4. Conectar USB → popup **Conectar Arduino**
5. Verificar popup y LED físico en **verde**
6. Probar botones manuales (Verde/Azul/Rojo) y **Restaurar estado**
7. Abrir Meet sin unirte → azul; unirte → rojo
8. Reiniciar Chrome (Cmd+Q) → reconectar sin selector manual
9. Desconectar USB → parpadeo azul en LED y popup

## Checklist E2E — Windows

1. Instalar Node.js LTS y verificar `node -v`
2. Si PowerShell bloquea scripts:
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
3. Instalar host:
   `.\scripts\install-native-host-windows.ps1`
4. Verificar manifest:
   `%LOCALAPPDATA%\MeetLight\NativeMessagingHosts\com.meetlight.serial_host.json`
5. Verificar registro:
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.meetlight.serial_host`
6. Instalar driver CH340/FTDI si no aparece `COMx`
7. Cerrar Arduino IDE / Monitor Serial
8. Cargar extensión y confirmar ID `hgcljcenaadbkdbmfnhbdnaednbbijhi`
9. Repetir pasos 4–9 del checklist macOS usando **Alt+F4** para reinicio

## Diagnóstico

| Señal | Significado |
|-------|-------------|
| Círculo parpadeando azul | Sin conexión serial |
| Puertos detectados: 0 | Sin USB/driver |
| Puertos: 1+, Desconectado | Puerto detectado pero no abierto |
| Badge `!` en icono | Sin puertos detectados |
| Badge `…` en icono | Puerto detectado, sin conexión activa |
| Último error | Detalle sanitizado del fallo |

## Notas

- El camino de producción es **Native Messaging** (`background.js` → `native-host/host.js`).
- `serial-manager.js` se conserva solo para pruebas legacy de Web Serial.
