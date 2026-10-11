# Pantallas San Alfonso del Mar — MVP 30 días

Red de 11 pantallas administrada desde un Google Form. El community manager (CM) sube el contenido, y el sistema lo publica en las torres elegidas según fechas y prioridad.

```
Canva ──► Google Form ──► Sheet + Drive ──► Apps Script (JSON) ──► Player web (GitHub Pages) ──► App "Pantallas" en TV Stick Xiaomi ──► TV
                                                  ▲                                                   │
                                                  └──────────────── ping cada 1 min ──────────────────┘  (hoja "Estado")
```

**Contenido del repo**

| Ruta | Qué es |
|---|---|
| `index.html` | Player web (lo publica GitHub Pages) |
| `apps-script/Code.gs` | Backend: se pega en el Apps Script de la Sheet |
| `android/` | App "Pantallas" para el TV Stick (WebView a pantalla completa) |
| `.github/workflows/apk.yml` | Compila el APK en GitHub y lo publica como Release |

## 1. Montaje (≈ 2 horas, una sola vez)

**Cuenta**: crea una cuenta Gmail del proyecto (ej. pantallas.sadm@gmail.com). No uses una cuenta personal.

**Google Form**: título "Publicar en pantallas", con estas preguntas y títulos **exactos**:

| Pregunta | Tipo | Opciones |
|---|---|---|
| Título | Respuesta corta | obligatoria |
| Categoría | Desplegable | Aviso · Corte de servicio · Emergencia · Turismo · Comercio local · Evento |
| Archivo | Subir archivo | 1 archivo, imágenes y video, máx. 100 MB |
| Desde | Fecha **con "Incluir hora"** | obligatoria |
| Hasta | Fecha **con "Incluir hora"** | obligatoria (si se deja en 00:00, dura todo ese día) |
| Torres | Casillas | Todas · T1 · T2 … T11 |
| Duración (segundos) | Respuesta corta (número) | opcional, por defecto 10 |
| Prioridad | Opción múltiple | Normal · URGENTE |

- En el Form: Respuestas → vincular a una **Hoja de cálculo nueva**.
- En la Sheet: Archivo → Configuración → zona horaria **(GMT-03:00) Santiago**.

**Apps Script**:
1. En la Sheet, ve a Extensiones → Apps Script y pega `Code.gs`. Ajusta `SHEET_CONTENT` si la hoja de respuestas tiene otro nombre.
2. En Configuración del proyecto (engranaje), pon la zona horaria **America/Santiago**.
3. Ejecuta `setup()` una vez y acepta los permisos. Se crean las hojas `Panico`, `Estado`, `Control` y `Bitacora`, y el menú **🚨 Pantallas**.
4. Implementar → Nueva implementación → **Aplicación web** → Ejecutar como: *Yo*; Acceso: *Cualquier persona*. Copia la URL `/exec`.
5. Si después cambias el código: Implementar → Administrar implementaciones → editar → **Nueva versión**. La URL se mantiene.

**Repo de GitHub (player + app)**:
1. Crea un repo **público** llamado `pantallas` y sube todo este contenido. Debe ser público para que GitHub Pages sea gratis y el stick pueda descargar el APK.
2. Pega la URL `/exec` en `API` dentro de `index.html`.
3. Settings → Pages → Deploy from branch → `main` / root. El player queda en `https://<usuario>.github.io/pantallas/`.
4. Settings → Secrets and variables → Actions:
   - **Variables** → `PLAYER_URL` = la URL de Pages del paso 3.
   - **Secrets** → `KEYSTORE_B64` y `KEYSTORE_PASS`, con los valores del archivo `secretos-github.txt` (va aparte, **no** se sube al repo).
5. Actions → "Compilar APK" → **Run workflow**. En unos 5 minutos queda un Release con el APK en esta URL fija:
   `https://github.com/<usuario>/pantallas/releases/latest/download/pantallas-player.apk`
6. La etiqueta de torre (T1…T11) debe ser **idéntica** a la opción del Form.

**Instalación en cada TV Stick Xiaomi (≈ 15 min por stick)**:
1. **Opciones de desarrollador**: Ajustes → Sistema → Acerca de → presiona 7 veces "Compilación del SO Android TV".
2. Instala la app **Downloader** (de AFTVnews) desde Google Play.
3. Ajustes → Apps → Seguridad y restricciones → **Fuentes desconocidas** → permite Downloader.
4. En Downloader, pega la URL fija del APK e instala **Pantallas**.
5. Abre Pantallas. La pantalla de configuración pide:
   - **URL del player**: ya viene cargada.
   - **Inicio automático**: botón "Permitir" → activar "Mostrar sobre otras apps". Si el TV no muestra ese ajuste, usa el comando `adb` que indica la pantalla, una sola vez desde un computador.
   - **Torre**: eliges T1…T11 y arranca el player.
6. Ajustes del stick:
   - Desactivar el **modo ambiente / protector de pantalla**.
   - Ajustes → Sistema → Energía: **"Apagar pantalla": Nunca**.
7. En el TV: HDMI-CEC activado y encendido automático en la entrada del stick. **Alimenta el stick desde un enchufe**, no desde el USB del TV.
8. **Prueba de fuego**: desenchufa el stick y vuelve a enchufarlo. El player debe aparecer solo en menos de 1 minuto.

Para volver a la configuración: botón **MENÚ** del control, o **ATRÁS 5 veces seguidas**. ATRÁS solo no cierra el player.

**Actualizar la app**: haz cualquier cambio en `android/` (o Run workflow) y luego, en cada stick, Downloader → misma URL → instalar. La firma se mantiene, así que no hay que desinstalar ni reconfigurar.

**Recarga remota**: en la hoja `Control`, cambia el número de `B1`. Las 11 pantallas se recargan en ≤ 1 minuto. Sirve tras cambiar `index.html` o si una pantalla se ve rara.

## 2. Reglas de contenido (para el CM)

- **Formato**: 1920×1080 horizontal. PNG/JPG para carteles; MP4 de **menos de 20 MB y menos de 30 s** para animaciones de Canva.
- **Bilingüe ES/PT** en todo lo turístico. Título en ambos idiomas y poco texto: se lee a 3 metros y en 10 segundos.
- **QR obligatorio en turismo**: enlaza a una lista de Google Maps o a una ficha del punto de interés. El turista se lleva la información en su celular; esa es la verdadera conversión.
- **Mezcla sugerida por playlist**:
  - 40% avisos de la comunidad
  - 30% turismo y servicios de Algarrobo
  - 20% comercio local (monetizable)
  - 10% eventos
- **Horario fino**: con fecha y hora puedes programar, por ejemplo, un aviso de corte de agua de 08:00 a 14:00, o turismo solo de 10:00 a 20:00 en temporada.
- **URGENTE**: reemplaza lo normal en las torres elegidas en ≤ 1 minuto. Para retirarlo, cambia `Activo` a "No" o ajusta "Hasta".

## 3. Botón de pánico

**Jerarquía**: PÁNICO > URGENTE > NORMAL. El pánico reemplaza todo, incluso los urgentes.

**Preparación (una vez, en computador):**
1. Diseña en Canva las piezas de emergencia en ES/PT: tsunami (evacuar a zona segura) y ruta de evacuación del condominio.
2. Súbelas a Drive y pega sus enlaces en la hoja `Panico`, desde la fila 7.
3. Menú **🚨 Pantallas → Preparar piezas de pánico**. Las deja públicas y valida que carguen.
4. En `B4`, define las torres afectadas ("Todas" por defecto). En `B3`, el apagado automático (6 h por defecto).

**Activación:**
- **Desde el celular** (app Google Sheets): marcar la casilla `B1` de la hoja `Panico`.
- **Desde el computador**: menú **🚨 Pantallas → ACTIVAR pánico**.
- Las pantallas cambian en ≤ 1 minuto, con la franja roja "EMERGENCIA · EMERGÊNCIA".
- Para desactivar: desmarcar la casilla o usar el menú. Si nadie lo apaga, se desactiva solo pasadas las horas de `B3`.
- Cada activación y desactivación queda registrada en la hoja `Bitacora`, con fecha, hora y usuario cuando está disponible.

**Ojo**: la pantalla **complementa, no reemplaza** las alertas oficiales de tsunami (SAE al celular, sirenas, SENAPRED). El protocolo es: alerta oficial → evacuar → el CM o la conserjería activan el pánico como refuerzo visual. **Nunca** debe ser el canal único ni el gatillo de una evacuación.

## 4. Plan de 30 días

| Semana | Objetivo | Entregable / criterio de salida |
|---|---|---|
| 1 | Montaje técnico + **1 torre piloto** | Imagen y video (desde Drive) visibles. Corte de Wi-Fi simulado: el player sigue con la caché |
| 2 | Escalar a las 11 torres + capacitar al CM | Las 11 aparecen en la hoja "Estado". El CM publica solo, sin ayuda |
| 3 | Operación real: avisos + turismo ES/PT | ≥ 15 piezas publicadas, 1 prueba de URGENTE y **1 simulacro de pánico** activado desde el celular (medir el tiempo hasta que las 11 torres cambian) |
| 4 | Medición y propuesta al comité | Informe de KPIs + propuesta de continuidad y tarifa a comercios |

**KPIs del piloto**
- Disponibilidad ≥ 95%: minutos sin señal en la hoja Estado.
- Tiempo de publicación: menos de 5 min desde que el CM sube la pieza.
- Contenido vigente: 0 piezas vencidas en pantalla.
- Encuesta rápida por QR a residentes y turistas: ¿te fue útil?
- Al menos 1 comercio interesado en pagar.

**Monitoreo**: en la hoja `Estado`, aplica formato condicional en rojo si "Minutos sin señal" > 15.

## 5. Riesgos conocidos y plan B

| Riesgo | Mitigación |
|---|---|
| Videos grandes desde Drive fallan (aviso de antivirus de Google) | Videos < 20 MB. Si persiste: alojar los MP4 en Firebase Storage o Cloudflare R2 y poner la URL directa en la columna `URL` |
| Cuenta Workspace bloquea "cualquier persona con el enlace" | Usar una cuenta Gmail del proyecto (no corporativa) |
| El TV se apaga o cambia de entrada | HDMI-CEC + programador horario en el TV; la app arranca sola al encender el stick |
| Alguien presiona INICIO en el control | La app sale de pantalla hasta el próximo reinicio. Guardar el control del stick en conserjería, o reiniciar el stick desde el enchufe |
| Corte de luz | La app arranca sola (requiere el permiso de inicio automático). Validarlo con la prueba de fuego |
| Se filtra el archivo de firma | Solo permite firmar actualizaciones de la app; igual hay que instalarlas a mano en cada stick. Guardar `secretos-github.txt` fuera del repo |
| Contenido inapropiado | Solo la cuenta del CM accede al Form (requiere inicio de sesión) |
| El CM se va | El Form y la cuenta son del condominio, no de la persona |
| Pánico olvidado activado | Apagado automático (`B3`) + registro en `Bitacora` |
| Nadie puede activar el pánico de noche | Compartir la Sheet como editor con el conserje de turno o el administrador; marcar una casilla es suficiente |
| El menú no aparece en el celular | Normal: los menús solo funcionan en computador. En el celular se usa la casilla `B1` |
