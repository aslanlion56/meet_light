# Pruebas — Meet Light Extension

## Tests automatizados (sin hardware)

Desde la carpeta `chrome-extension/`:

```bash
npm install
npm test
```

Cubre:

- Mapeo de estados → bytes serial
- Conexión simulada con puerto mock
- Prioridad de estados Meet/Teams
- Reset y deduplicación de pestañas serial-host

## Checklist E2E manual (con Arduino)

### 1. Conexión inicial

1. Recarga la extensión en `chrome://extensions`.
2. Cierra Arduino IDE y Monitor Serial.
3. Popup → **Conectar Arduino** → en la pestaña serial pulsa **Elegir puerto USB**.
4. Espera mensaje **¡Conectado!** en la pestaña de conexión.
5. Popup y pestaña serial deben mostrar el **círculo verde** y **Conectado**.
6. LED físico en **verde**.

### 2. Estados Meet/Teams

1. Abre Meet sin unirte → círculo y LED **azul**.
2. Únete a la llamada → círculo y LED **rojo**.
3. Cuelga (pestaña abierta) → **azul**.
4. Cierra la pestaña → **verde**.

### 3. Reinicio de Chrome (comportamiento esperado)

1. Con todo conectado, cierra Chrome con **Cmd+Q**.
2. Abre Chrome de nuevo.
3. El LED físico debe **parpadear en azul** (sin datos serial).
4. Popup: círculo con **parpadeo azul**, estado **Desconectado**.
5. Si **Puertos autorizados: 0** → pulsa **Conectar Arduino** y elige el puerto (un clic).
6. Si **Puertos autorizados: 1** → pulsa **Reconectar ahora** en el popup.

> No se espera reconexión automática tras Cmd+Q. Es el comportamiento normal de Web Serial.

### 4. Pestaña serial cerrada

1. Cierra la pestaña fijada **Meet Light — conexión serial**.
2. LED pasa a **parpadeo azul**.
3. Popup → **Conectar Arduino** para volver a conectar.

### 5. USB desconectado

1. Desconecta el cable USB → LED parpadea azul.
2. Reconecta USB → pulsa **Reconectar ahora** o **Elegir puerto USB** en la pestaña serial.

## Diagnóstico

| Popup / pestaña serial | Significado |
|------------------------|-------------|
| Círculo parpadeando azul | Sin conexión serial (como el LED físico) |
| Círculo verde / azul / rojo | Conectado; color = estado Meet/Teams |
| Puertos: 0 | Chrome no recuerda el permiso USB → elegir puerto manualmente |
| Puertos: 1, Desconectado | Permiso OK pero falló `port.open` → cierra Arduino IDE |
| Reconectando… | Intento manual en curso |
| Último error visible | Detalle del fallo más reciente |

La pestaña **Meet Light — conexión serial** muestra el mismo indicador circular que el popup.
