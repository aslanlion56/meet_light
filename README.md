# Meet Light — Semáforo de junta activa

Indica con un **LED RGB** tu disponibilidad en Google Meet y Microsoft Teams:

| Color LED | Significado |
|-----------|-------------|
| **Verde** | Libre (sin pestañas Meet/Teams abiertas) |
| **Azul** | Meet o Teams abierto, reunión aún no iniciada |
| **Rojo** | Reunión en curso |
| **Parpadeo azul** | Sin conexión serial con Chrome (extensión desconectada o pestaña serial cerrada) |

La extensión y el popup muestran el mismo color que el LED físico.

## Componentes

| Parte | Descripción |
|-------|-------------|
| [Meet_light.ino](Meet_light.ino) | Firmware Arduino: controla el LED por serial |
| [chrome-extension/](chrome-extension/) | Extensión Chrome que detecta el estado en Meet/Teams |

### Material necesario

- 1× Arduino Uno
- 1× LED RGB de 4 pines, cátodo común
- 3× resistencias de 220 Ω (rojo, verde y azul)
- 1× protoboard + cables jumper
- Cable USB

## Cableado (pines confirmados)

| Pin Arduino | Conexión |
|-------------|----------|
| **11** | Resistencia 220 Ω → patilla **R (rojo)** del LED |
| **10** | Resistencia 220 Ω → patilla **G (verde)** del LED |
| **9** | Resistencia 220 Ω → patilla **B (azul)** del LED |
| **GND** | Patilla **COMÚN** (cátodo) del LED |

## Estados del semáforo

| Estado | Condición | Color LED |
|--------|-----------|-----------|
| Libre | Sin pestañas Meet/Teams | Verde |
| Esperando | Pestaña Meet/Teams abierta, sin reunión activa | Azul |
| En junta | Reunión en curso | Rojo |
| Sin conexión | Chrome no envía datos al Arduino (>2,5 s) | Parpadeo azul |

Prioridad con varias pestañas: **rojo > azul > verde**.

## Protocolo serial (9600 baud)

### Extensión Chrome (1 byte)

| Byte | Estado | Color |
|------|--------|-------|
| `'0'` | Libre | Verde |
| `'1'` | Esperando | Azul |
| `'2'` | En junta | Rojo |

### Prueba manual con Monitor Serial

Puedes probar el hardware **sin la extensión**:

1. Sube [Meet_light.ino](Meet_light.ino) al Arduino.
2. Abre **Monitor Serial** a **9600 baud**.
3. Activa salto de línea: **Nueva línea**.
4. Escribe y envía:

| Comando | Color |
|---------|-------|
| `verde` | Verde |
| `azul` | Azul |
| `rojo` | Rojo |
| `apaga` | Apagado |

## Instalación del Arduino

1. Abre [Meet_light.ino](Meet_light.ino) en Arduino IDE.
2. Selecciona placa **Arduino Uno** y el puerto USB.
3. Sube el sketch.
4. Al encender, el LED queda en **verde** (o parpadea azul si aún no hay conexión serial).

> Cierra el Monitor Serial antes de conectar la extensión Chrome (comparten el puerto USB).

## Instalación de la extensión Chrome

Funciona en **Mac y Windows** con Google Chrome.

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar**.
4. Selecciona la carpeta `chrome-extension/`.
5. Clic en el icono → **Conectar Arduino** → en la pestaña serial pulsa **Elegir puerto USB**.

## Uso

1. Conecta el Arduino por USB.
2. Abre la pestaña **Meet Light — conexión serial** (se fija sola) y elige el puerto USB la primera vez.
3. Sin Meet/Teams abierto → **verde**.
4. Abre una sala sin unirte → **azul**.
5. Únete a la llamada → **rojo**.
6. Cuelga (pestaña sigue abierta) → **azul**.
7. Cierra la pestaña Meet/Teams → **verde**.

El popup y la pestaña serial muestran un **icono circular** con el mismo color que el LED.

## Conexión serial: qué esperar (sin sorpresas)

La extensión usa **Web Serial API** de Chrome. Esto implica limitaciones importantes:

### Mientras Chrome está abierto

- Con la pestaña serial conectada, el LED sigue el estado de Meet/Teams en tiempo real.
- Si cierras la pestaña serial, el LED pasa a **parpadeo azul** hasta que vuelvas a conectar.

### Tras cerrar Chrome por completo (Cmd+Q / Alt+F4)

**No hay reconexión automática garantizada.** Es normal que:

- El LED parpadee en azul al encender el Arduino.
- El popup muestre **Desconectado** y a veces **Puertos autorizados: 0**.

**Qué hacer:** abre el popup → **Conectar Arduino** o **Reconectar ahora** → en la pestaña serial pulsa **Elegir puerto USB** y selecciona el Arduino. Suele bastar **un clic**.

> Chrome no siempre conserva el permiso USB tras reiniciar el navegador. No es un fallo del Arduino ni del cableado si antes funcionó.

### ¿Por qué no hay reconexión “mágica”?

Web Serial solo puede abrir puertos que Chrome recuerda con `getPorts()`. Tras un cierre completo del navegador, esa lista puede quedar vacía y **requiere un gesto del usuario** (`requestPort()`). Una reconexión 100 % automática necesitaría **Native Messaging** (un programa local fuera del navegador), que este proyecto no usa.

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| No aparece el puerto serial | Cierra Arduino IDE y Monitor Serial, reconecta USB |
| LED no cambia con extensión | Abre la pestaña serial y pulsa **Elegir puerto USB** |
| Parpadeo azul permanente | Conecta desde la pestaña serial; revisa **Último error** |
| Azul no enciende en el LED | Pin 9 + resistencia 220 Ω a la patilla B del LED |
| Prueba manual no responde | Verifica 9600 baud y salto de línea activado |
| Tras reiniciar Chrome, desconectado | Normal: pulsa **Elegir puerto USB** una vez |
| Puertos autorizados = 0 | Pulsa **Conectar Arduino** y elige el puerto otra vez |
| Dos pestañas serial | Cierra las duplicadas; deja solo una fijada |

Ver también [chrome-extension/TESTING.md](chrome-extension/TESTING.md) para pruebas detalladas.
