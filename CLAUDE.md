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
- Imágenes para pantalla: 1920×875 px (la franja inferior ocupa el resto). El player pide a Drive la versión reducida
  (`=w1920-h875`) y rellena los afiches verticales con la misma imagen en miniatura (`=w40`) como fondo desenfocado.
- **El APK se mantiene casi fijo.** Todo lo visual y funcional va en `index.html` (los TV lo toman solos) o en la Sheet.
  Tocar `android/` solo si cambia el arranque, el menú del control o la URL del player: cada cambio exige ir a los 11 stick.
- Contacto que se muestra (web, menú del APK, pantalla de error): mavillal@gmail.com. Alertas por correo: Control →
  "Correo para alertas" (por defecto el mismo).

## Hojas de la Sheet (columnas por nombre, el orden da igual)

- `Respuestas de formulario 1`: preguntas del Form (Título, Categoría, Archivo, Texto del aviso, Link para QR,
  Texto para la cinta, Desde, Hasta, Torres, Duración (segundos), Prioridad) + columnas del script URL, Tipo, Activo.
- `Torres`: Código (T1…T11) · Nombre en pantalla.
- `Cinta`: Texto · Torres · Activo · Hasta (opcional).
- `Destinos`: Nombre en pantalla · Dirección · Ícono · Activo · Km por ruta (se calcula solo con Maps; se puede escribir a mano).
- `Control`: etiquetas en col A con valor a la derecha: "Recargar todas las pantallas" (casilla), "Teléfono Seguridad
  Municipal", "Link QR turismo", "Link QR comercio local", "Correo para alertas", "Pantalla negra desde (hh:mm…)" y
  "Pantalla negra hasta (hh:mm)" (se leen con getDisplayValues; vacío = sin pantalla negra).
- `Estado`: última conexión de cada torre (lo escribe el backend cada 2 min, solo torres de la hoja Torres).
  `Fix`: notas de Mario, no tocar.

## Backend: caché y cuotas

- `respuesta_(torre)` guarda el JSON 60 s en CacheService; `limpiarCache_()` se llama en alEditar, onFormSubmit,
  recargarPantallas, menuKm y setup. Ediciones por API (no por la UI) tardan ≤ 60 s en verse.
- `doGet` NUNCA llama a Google Maps: los km se calculan al editar la dirección, en el menú o en setup (solo activos).
- onFormSubmit: si el archivo no es imagen/video o Drive no deja compartirlo, la columna Tipo queda `ERROR: …`
  y se manda correo (`alertar_`). Usa MailApp: tras agregar permisos nuevos hay que correr setup desde el menú
  para autorizarlos.

## APK: versiones

- versionCode = `git rev-list --count HEAD` (workflow con fetch-depth 0); tag `v1.0.<n>`. Nunca baja aunque se
  recree el workflow. Sin el secreto `KEYSTORE_B64` el workflow falla a propósito (otra firma obliga a desinstalar).
- La pantalla Configurar lee la lista de torres del backend (`BuildConfig.API_URL`); sin internet usa T1…T11.

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

Ya configurado en este Mac (12-oct-2026): `clasp login` hecho, `apps-script/.clasp.json` (no va al repo) con
scriptId `1E6nE0XdRAWOJI_8csVg5MNddWJ4PDlb8eDjQAjr7QznmCKLWsmC3xeGn`; `.claspignore` excluye `tests/`.
deploymentId de los TV = el de la URL `/exec` de arriba (`AKfycbxbUWcw…lu-`). Publicar = desde `apps-script/`:
`clasp push --force && clasp deploy -i AKfycbxbUWcwKkebleaZLdKZlF-WZJl-lDQyQAGBToPl9vIWZ8BXRY4I9jN9dNuypl0V_lu- -d "vX.Y"`.
El primer curl tras el deploy puede venir de caché: repetir a los 30 s.

Después de cada deploy: `curl -sL "<URL>?torre=T1"` y confirmar el campo `"version"`. Si se agregan hojas o columnas,
correr `setup` (menú 📺 Pantallas → ⚙ Instalar / reparar, o `clasp run setup` si está habilitado).

## Flujo de trabajo esperado

1. Cambiar código → correr las 2 suites de `apps-script/tests` (deben decir TODO OK) → para el player, abrir
   `index.html` con datos simulados si el cambio es visual.
2. `git commit` + `git push` (player y APK) y `clasp push` + `clasp deploy -i` (backend).
3. Verificar en la URL real y pedirle a Mario una foto del TV solo si el cambio es visual.

## Estado al 12-oct-2026

- Backend **v4.3**: caché 60 s, km fuera de doGet, alertas por correo, pantalla negra, Estado filtrado.
- `index.html`: contador del afiche, íconos de destino, fondo desenfocado, imágenes reducidas, pantalla negra.
- APK: Bienvenida + contacto si el player no carga; torres desde la Sheet; versión = n.º de commits.
- Pendiente de Mario: borrar la pregunta "Idiomas" del Form y luego correr ⚙ Instalar / reparar (borra las columnas
  Idiomas/Título PT/Texto PT, agrega filas nuevas de Control y autoriza el envío de correos). Instalar el APK nuevo.
- `secretos-github.txt` (firma del APK) NO va al repo; Mario lo tiene aparte.
