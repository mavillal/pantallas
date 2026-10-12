# Pantallas San Alfonso del Mar — contexto para Claude Code

Señalética digital para los TV del hall de las torres del condominio San Alfonso del Mar (Algarrobo, Chile).
Dueño: Mario Villalobos (le dice "Jefecit@"). Responde en español de Chile, directo, sin relleno.
Mario no es programador: tú haces los pasos técnicos (git, clasp, deploy) y le pides solo lo que requiere su mano
(logins, permisos, mirar el TV).

## Arquitectura

```
Community manager → Google Form → Sheet "Pantallas-Contenido" (+ Apps Script = backend JSON)
                                            ↓  GET ?torre=T1 cada 1 min
GitHub Pages (index.html = player) ← App Android "Pantallas" (WebView) en TV Stick Xiaomi → TV
```

| Ruta | Qué es | Cómo se publica |
|---|---|---|
| `index.html` | Player web (diseño escandinavo, franja inferior, cinta, clima, destinos, QR, selector de torres) | `git push` → GitHub Pages: https://mavillal.github.io/pantallas/ |
| `apps-script/Code.gs` | Backend: lee la Sheet y entrega JSON por torre | `clasp push` + `clasp deploy -i <ID>` (ver abajo) |
| `apps-script/tests/` | Pruebas del backend con una Sheet simulada en Node | `node apps-script/tests/suite-general.js apps-script/Code.gs` (y `suite-columnas.js`) |
| `android/` | App kiosco para el stick (WebView, arranca sola, menú con ATRÁS/OK) | push a `android/**` → GitHub Actions compila APK → Release |
| `.github/workflows/apk.yml` | Compila y firma el APK | Secretos `KEYSTORE_B64`, `KEYSTORE_PASS`; variable `PLAYER_URL` |

- URL del web app (backend), ya pegada en `index.html` (`var API = ...`):
  `https://script.google.com/macros/s/AKfycbxbUWcwKkebleaZLdKZlF-WZJl-lDQyQAGBToPl9vIWZ8BXRY4I9jN9dNuypl0V_lu-/exec`
- Instalar APK en el stick: app Downloader → código AFTVnews `1056065` (apunta a releases/latest).
- Stick: Mi TV Stick MiTV-AESP0, Android TV 9 (no necesita permiso de superposición para arrancar solo).

## Reglas del producto (decididas por Mario)

- **Todo en español.** Sin traducciones automáticas ni casillas de idioma (se eliminaron en v4.0).
- **Columnas y filas NO fijas:** Mario mueve columnas. Todo se lee por nombre de encabezado (sin tildes ni
  mayúsculas: `norm_`), y la hoja Control por etiqueta. Nunca vuelvas a leer por posición.
- Sin botón de pánico (eliminado). Lo urgente se hace con Prioridad = URGENTE en el Form.
- Destinos muestran **km por ruta**, no tiempos.
- Clima: solo español, con máx/mín (Open-Meteo, sin clave).
- QR en piezas de Turismo (Control: "Link QR turismo") y Comercio local ("Link QR comercio"), o "Link para QR" por pieza.
- Imágenes para pantalla: 1920×875 px (la franja inferior ocupa el resto).

## Hojas de la Sheet (columnas por nombre, el orden da igual)

- `Respuestas de formulario 1`: preguntas del Form (Título, Categoría, Archivo, Texto del aviso, Link para QR,
  Texto para la cinta, Desde, Hasta, Torres, Duración (segundos), Prioridad) + columnas del script URL, Tipo, Activo.
- `Torres`: Código (T1…T11) · Nombre en pantalla.
- `Cinta`: Texto · Torres · Activo · Hasta (opcional).
- `Destinos`: Nombre en pantalla · Dirección · Ícono · Activo · Km por ruta (se calcula solo con Maps; se puede escribir a mano).
- `Control`: etiquetas en col A con valor a la derecha: "Recargar todas las pantallas" (casilla), "Teléfono Seguridad
  Municipal", "Link QR turismo", "Link QR comercio local".
- `Estado`: última conexión de cada torre (lo escribe el backend). `Fix`: notas de Mario, no tocar.

## Cómo publicar el backend (lo que más falló a mano)

Pegar el código en el editor NO cambia lo que ven los TV: hay que publicar una **nueva versión** de la
implementación existente para mantener la URL.

```bash
npm i -g @google/clasp            # una vez
clasp login                        # Mario aprueba en el navegador (cuenta del proyecto)
# Mario activa la API: https://script.google.com/home/usersettings  → "API de Google Apps Script: Activada"
# scriptId: en el editor de Apps Script de la Sheet → ⚙ Configuración del proyecto → "ID de la secuencia de comandos"
cd apps-script && clasp clone <scriptId> --rootDir .   # primera vez (crea .clasp.json; no pisar Code.gs local)
clasp push                                             # sube Code.gs
clasp deployments                                      # anota el deploymentId de la URL /exec de arriba
clasp deploy -i <deploymentId> -d "vX.Y"               # nueva versión, MISMA URL
```

Después de cada deploy: `curl -sL "<URL>?torre=T1"` y confirmar el campo `"version"`. Si se agregan hojas o columnas,
correr `setup` (menú 📺 Pantallas → ⚙ Instalar / reparar, o `clasp run setup` si está habilitado).

## Flujo de trabajo esperado

1. Cambiar código → correr las 2 suites de `apps-script/tests` (deben decir TODO OK) → para el player, abrir
   `index.html` con datos simulados si el cambio es visual.
2. `git commit` + `git push` (player y APK) y `clasp push` + `clasp deploy -i` (backend).
3. Verificar en la URL real y pedirle a Mario una foto del TV solo si el cambio es visual.

## Estado al 12-oct-2026

- Backend **v4.2** listo en este repo; probado contra una copia real de la Sheet (28 pruebas OK).
  **Pendiente: publicarlo** (la URL seguía sirviendo una versión antigua: la cinta mostraba avisos de otra torre).
- `index.html` v4.2 listo (solo español, sin código muerto). Pendiente: push.
- `android/.../MainActivity.java`: el menú ahora muestra "Contacto: mavillal@gmail.com" en vez de la URL.
  Pendiente: compilar (push a `android/`) e instalar en el stick.
- Form: Mario debe borrar la pregunta "Idiomas" (ya no se usa).
- `secretos-github.txt` (firma del APK) NO va al repo; Mario lo tiene aparte.
