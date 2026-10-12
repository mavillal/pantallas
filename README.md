# Pantallas San Alfonso del Mar

Señalética digital para los TV del hall de las 11 torres. El community manager (CM) publica desde un Google Form
y el sistema lo muestra en las torres elegidas, según fechas y prioridad. Todo en español.

```
Canva ──► Google Form ──► Sheet "Pantallas-Contenido" + Drive ──► Apps Script (JSON, caché 60 s)
                                                                       │  cada 1 min
App "Pantallas" en TV Stick Xiaomi ──► Player web (GitHub Pages) ◄─────┘
         (WebView fijo)                 (todo lo visual vive aquí)
```

| Ruta | Qué es | Cómo se publica |
|---|---|---|
| `index.html` | Player web | `git push` → GitHub Pages (los TV lo toman solos) |
| `apps-script/Code.gs` | Backend: lee la Sheet y entrega JSON por torre | `clasp push` + `clasp deploy -i <id>` (ver `CLAUDE.md`) |
| `apps-script/tests/` | Pruebas del backend con una Sheet simulada | `node apps-script/tests/suite-general.js apps-script/Code.gs` |
| `android/` | App kiosco del stick: abre el player a pantalla completa | push a `android/**` → GitHub Actions → Release |

## Cómo se actualiza cada parte

- **Contenido** (avisos, cinta, destinos, horarios): se edita en la Sheet o el Form. Los TV lo muestran en ≤ 1 minuto.
- **Diseño y funciones de pantalla** (`index.html`): se publica en GitHub Pages y cada TV lo toma solo
  (≤ 10 min, o al instante con la casilla "Recargar todas las pantallas" de Control). **No hay que tocar los stick.**
- **App del stick** (`android/`): solo se cambia si cambia el arranque, el menú del control o la dirección del player.
  Es lo único que exige ir a cada stick (Downloader → código `1056065`). Por eso se mantiene casi fija.

## Hojas de la Sheet (columnas por nombre: el orden da igual)

| Hoja | Para qué |
|---|---|
| `Respuestas de formulario 1` | Avisos del Form. Columnas del script: `URL`, `Tipo` (o `ERROR: …` si el archivo no sirvió), `Activo` |
| `Torres` | Código (T1…) y nombre en pantalla. La app del stick también lee esta lista al configurar |
| `Cinta` | Avisos breves de la franja: Texto · Torres · Activo · Hasta (opcional) |
| `Destinos` | Rotan en la franja con km por ruta. Ícono: avión, auto, libro, barco, vino, casino o edificio |
| `Control` | Recargar pantallas · Teléfono Seguridad Municipal · Links QR turismo y comercio · Correo para alertas · Pantalla negra desde / hasta |
| `Estado` | Última conexión de cada torre (se anota cada 2 min; solo torres de la hoja Torres) |

## Reglas de contenido (para el CM)

- **Formato**: 1920×875 px horizontal (en Canva: tamaño personalizado). Si llega vertical, se centra con un fondo
  desenfocado de la misma imagen. Imágenes JPG/PNG; videos MP4 de **menos de 20 MB y menos de 30 s**. PDF no sirve:
  el aviso queda con `ERROR` y llega un correo de alerta.
- **Duración**: pregunta "Duración (segundos)" del Form; vacío = 10 s. Las tarjetas de solo texto duran mínimo 12 s.
- **Hasta**: ponlo siempre. Sin "Hasta" el aviso queda indefinidamente. URGENTE tapa todo lo normal hasta que vence.
- **QR**: "Link para QR" por aviso, o los links de Control para Turismo y Comercio local.
- **Pantalla negra**: Control → "Pantalla negra desde / hasta" (por defecto 00:00 a 07:00; vacío = nunca).

## Instalación de un TV Stick Xiaomi (≈ 15 min por stick)

1. Opciones de desarrollador: Ajustes → Sistema → Acerca de → 7 veces "Compilación del SO Android TV".
2. Instala **Downloader** (AFTVnews) desde Google Play y permite "Fuentes desconocidas" para Downloader.
3. En Downloader escribe el código `1056065` (apunta al último Release) e instala **Pantallas**.
4. Abre Pantallas: permite el inicio automático (si el equipo lo pide) y elige la torre.
5. Stick: protector de pantalla desactivado y "Apagar pantalla: Nunca". TV: HDMI-CEC activado.
   Alimenta el stick desde un enchufe, no desde el USB del TV.
6. Prueba de fuego: desenchufa y vuelve a enchufar el stick. El player debe aparecer solo en menos de 1 minuto.

En el player, **ATRÁS** u **OK** abren el menú (Seguir · Recargar · Configurar), con versión y contacto.
Si el player no carga, el TV muestra "Bienvenidos" y reintenta cada 30 s; el motivo se ve en el menú.

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Videos grandes desde Drive fallan (aviso de antivirus de Google) | MP4 < 20 MB |
| La cuenta de trabajo bloquea "cualquier persona con el enlace" | El aviso queda con `ERROR` y llega un correo; usar una cuenta Gmail del proyecto |
| Contenido inapropiado | El Form debe exigir inicio de sesión y solo la cuenta del CM debe tener acceso |
| Alguien presiona INICIO en el control | Guardar el control en conserjería o reiniciar el stick desde el enchufe |
| Se pierde la firma del APK (`secretos-github.txt`) | Sin ella no se publican actualizaciones (el workflow falla a propósito). Guardarla fuera del repo |
