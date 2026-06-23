# Meet Light — Semáforo de junta activa

Indica con un **LED RGB** tu disponibilidad en Google Meet y Microsoft Teams:

- **Verde** → libre (sin pestañas Meet/Teams abiertas)
- **Amarillo** → Meet o Teams abierto, reunión aún no iniciada
- **Rojo** → reunión en curso

## Componentes

| Parte | Descripción |
|-------|-------------|
| [Meet_light.ino](Meet_light.ino) | Firmware Arduino: controla el LED por serial |
| [chrome-extension/](chrome-extension/) | Extensión Chrome que detecta el estado en Meet/Teams |

### Material necesario

- 1× Arduino Uno
- 1× LED RGB de 4 pines, cátodo común
- 2× resistencias de 220 Ω (rojo y verde)
- 1× protoboard + cables jumper
- Cable USB

## Cableado (pines confirmados)

| Pin Arduino | Conexión |
|-------------|----------|
| **11** | Resistencia 220 Ω → patilla **R (rojo)** del LED |
| **10** | Resistencia 220 Ω → patilla **G (verde)** del LED |
| **9** | Patilla **B (azul)** — no conectar |
| **GND** | Patilla **COMÚN** (cátodo) del LED |

El **amarillo** se obtiene encendiendo rojo + verde a la vez (lo hace el firmware).

## Estados del semáforo

| Estado | Condición | Color LED |
|--------|-----------|-----------|
| Libre | Sin pestañas Meet/Teams | Verde |
| Esperando | Pestaña Meet/Teams abierta, sin reunión activa | Amarillo |
| En junta | Reunión en curso | Rojo |

Prioridad con varias pestañas: **rojo > amarillo > verde**.

## Protocolo serial (9600 baud)

### Extensión Chrome (1 byte)

| Byte | Estado | Color |
|------|--------|-------|
| `'0'` | Libre | Verde |
| `'1'` | Esperando | Amarillo |
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
| `amarillo` | Amarillo |
| `rojo` | Rojo |
| `apaga` | Apagado |

## Instalación del Arduino

1. Abre [Meet_light.ino](Meet_light.ino) en Arduino IDE.
2. Selecciona placa **Arduino Uno** y el puerto USB.
3. Sube el sketch.
4. Al encender, el LED queda en **verde**.

> Cierra el Monitor Serial antes de conectar la extensión Chrome (comparten el puerto USB).

## Instalación de la extensión Chrome

Funciona en **Mac y Windows** con Google Chrome.

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar**.
4. Selecciona la carpeta `chrome-extension/`.
5. Clic en el icono → **Conectar Arduino** → elige el puerto USB.

## Uso

1. Conecta el Arduino y la extensión.
2. Sin Meet/Teams abierto → **verde**.
3. Abre una sala sin unirte → **amarillo**.
4. Únete a la llamada → **rojo**.
5. Cuelga (pestaña sigue abierta) → **amarillo**.
6. Cierra la pestaña → **verde**.

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| No aparece el puerto serial | Cierra Arduino IDE y Monitor Serial, reconecta USB |
| LED no cambia con extensión | Pulsa **Conectar Arduino** en el popup |
| Prueba manual no responde | Verifica 9600 baud y salto de línea activado |
| Colores invertidos | Revisa cableado en pines 11 (rojo) y 10 (verde) |
| Tras reiniciar Chrome | Vuelve a pulsar **Conectar Arduino** |
