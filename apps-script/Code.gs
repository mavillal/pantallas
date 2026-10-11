/**
 * PANTALLAS CONDOMINIO — Backend (Google Apps Script, vinculado a la Sheet de respuestas del Form)
 * Versión 1.1 — horario fino + botón de pánico
 *
 * Endpoints (Web App):
 *   GET ?torre=T1            -> JSON con la playlist vigente AHORA para esa torre
 *   GET ?torre=T1&ping=1     -> idem + registra "última conexión" en la hoja Estado
 *
 * Jerarquía de prioridad (de mayor a menor):
 *   1. PÁNICO   — casilla en la hoja "Panico". Reemplaza TODO en las torres configuradas.
 *   2. URGENTE  — ítems del Form con Prioridad = URGENTE. Reemplazan lo normal en su torre.
 *   3. NORMAL   — todo lo demás vigente.
 *
 * Vigencia: Desde/Hasta con fecha y hora (hora de Santiago).
 *   - Si "Hasta" viene sin hora (00:00), se interpreta como fin de ese día (23:59:59).
 *
 * Instalación: ver README.md
 */

const SHEET_CONTENT = 'Respuestas de formulario 1'; // hoja que crea el Form (ajustar si difiere)
const SHEET_STATUS  = 'Estado';
const SHEET_PANIC   = 'Panico';
const SHEET_LOG     = 'Bitacora';
const SHEET_CONTROL = 'Control'; // B1: número de recarga remota (cambiarlo refresca todas las pantallas)
const TZ            = 'America/Santiago';
const DEFAULT_DUR   = 10;  // segundos por imagen
const PANIC_DEFAULT_HOURS = 6; // apagado automático del pánico si nadie lo desactiva

// Títulos EXACTOS de las preguntas del Form
const Q = {
  titulo:   'Título',
  categoria:'Categoría',
  archivo:  'Archivo',
  desde:    'Desde',
  hasta:    'Hasta',
  torres:   'Torres',
  dur:      'Duración (segundos)',
  prio:     'Prioridad'
};
// Columnas que agrega el script (a la derecha de las del Form)
const C = { url: 'URL', tipo: 'Tipo', activo: 'Activo' };

// Celdas de la hoja Panico
const P = {
  activo:    'B1',  // casilla de verificación
  desde:     'B2',  // se llena sola al activar
  horas:     'B3',  // apagado automático (horas)
  torres:    'B4',  // "Todas" o "T1, T2"
  firstRow:  7      // desde aquí: Pieza | Enlace Drive | Tipo | Duración
};

/* ======================================================================
 * WEB APP
 * ==================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const torre = String(p.torre || '').trim().toUpperCase();
  if (p.ping) logPing_(torre);

  const panic = getPanic_(torre);
  const out = panic || getPlaylist_(torre);
  out.recarga = getReload_();

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Recarga remota: al cambiar Control!B1, cada pantalla se recarga en su próxima consulta (≤ 1 min). */
function getReload_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTROL);
  return sh ? String(sh.getRange('B1').getValue()) : '';
}

/* ---------------- Nivel 2 y 3: contenido del Form ---------------- */

function getPlaylist_(torre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  const rows = sh.getDataRange().getValues();
  const h = rows.shift();
  const col = name => h.indexOf(name);
  const ix = {
    titulo: col(Q.titulo), cat: col(Q.categoria), desde: col(Q.desde), hasta: col(Q.hasta),
    torres: col(Q.torres), dur: col(Q.dur), prio: col(Q.prio),
    url: col(C.url), tipo: col(C.tipo), activo: col(C.activo)
  };
  const now = Date.now();
  const items = [];

  rows.forEach(r => {
    const url = ix.url > -1 ? r[ix.url] : '';
    if (!url) return;
    if (ix.activo > -1 && String(r[ix.activo]).trim().toLowerCase() === 'no') return;

    const ini = toDate_(r[ix.desde]);
    const fin = endOf_(toDate_(r[ix.hasta]));
    if (ini && now < ini.getTime()) return;
    if (fin && now > fin.getTime()) return;

    if (!matchTorre_(r[ix.torres], torre)) return;

    items.push({
      titulo:    String(r[ix.titulo] || ''),
      categoria: ix.cat > -1 ? String(r[ix.cat] || '') : '',
      url:       String(url),
      tipo:      String(r[ix.tipo] || 'imagen'),
      dur:       Number(r[ix.dur]) > 0 ? Number(r[ix.dur]) : DEFAULT_DUR,
      urgente:   /urgente/i.test(String(r[ix.prio] || ''))
    });
  });

  const urg = items.filter(i => i.urgente);
  return {
    generado: new Date().toISOString(),
    torre:    torre,
    panico:   false,
    urgente:  urg.length > 0,
    items:    urg.length ? urg : items
  };
}

/* ---------------- Nivel 1: botón de pánico ---------------- */

function getPanic_(torre) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_PANIC);
  if (!sh) return null;
  if (sh.getRange(P.activo).getValue() !== true) return null;

  // Apagado automático si se olvidó activado
  const desde = toDate_(sh.getRange(P.desde).getValue());
  const horas = Number(sh.getRange(P.horas).getValue()) || PANIC_DEFAULT_HOURS;
  if (desde && Date.now() > desde.getTime() + horas * 3600 * 1000) {
    setPanic_(false, 'APAGADO AUTOMÁTICO (' + horas + ' h)');
    return null;
  }

  if (!matchTorre_(sh.getRange(P.torres).getValue(), torre)) return null;

  const last = sh.getLastRow();
  if (last < P.firstRow) return null;
  const rows = sh.getRange(P.firstRow, 1, last - P.firstRow + 1, 4).getValues();
  const items = rows
    .filter(r => r[1])
    .map(r => {
      const id = driveId_(r[1]);
      const tipo = /video/i.test(String(r[2])) ? 'video' : 'imagen';
      return {
        titulo: String(r[0] || 'Emergencia'),
        categoria: 'Emergencia',
        url: id ? directUrl_(id, tipo) : String(r[1]),
        tipo: tipo,
        dur: Number(r[3]) > 0 ? Number(r[3]) : 8,
        urgente: true
      };
    });
  if (!items.length) return null;

  return {
    generado: new Date().toISOString(),
    torre:    torre,
    panico:   true,
    urgente:  true,
    items:    items
  };
}

/** Funciones del menú (computador) */
function activarPanico()    { setPanic_(true,  'ACTIVADO (menú)');    SpreadsheetApp.getActive().toast('Pánico ACTIVO. Las pantallas cambian en ≤ 1 min.'); }
function desactivarPanico() { setPanic_(false, 'DESACTIVADO (menú)'); SpreadsheetApp.getActive().toast('Pánico desactivado.'); }

function setPanic_(on, motivo) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PANIC);
  if (!sh) return;
  sh.getRange(P.activo).setValue(on);
  if (on) sh.getRange(P.desde).setValue(new Date()); else sh.getRange(P.desde).clearContent();
  log_(motivo);
}

/** Disparador simple: registra la hora y bitácora cuando se marca/desmarca la casilla (también desde el celular). */
function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET_PANIC || e.range.getA1Notation() !== P.activo) return;
  const on = e.range.getValue() === true;
  if (on) sh.getRange(P.desde).setValue(new Date()); else sh.getRange(P.desde).clearContent();
  let quien = '';
  try { quien = e.user ? e.user.getEmail() : ''; } catch (err) {}
  log_((on ? 'ACTIVADO' : 'DESACTIVADO') + ' (casilla)', quien);
}

/** Deja públicas las piezas de pánico y valida que estén bien cargadas. Ejecutar al preparar o cambiar las piezas. */
function prepararPanico() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PANIC);
  const last = sh.getLastRow();
  if (last < P.firstRow) { SpreadsheetApp.getActive().toast('No hay piezas cargadas.'); return; }
  const rows = sh.getRange(P.firstRow, 1, last - P.firstRow + 1, 3).getValues();
  let ok = 0, err = [];
  rows.forEach((r, i) => {
    if (!r[1]) return;
    const id = driveId_(r[1]);
    try {
      const f = DriveApp.getFileById(id);
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sh.getRange(P.firstRow + i, 3).setValue(f.getMimeType().indexOf('video') === 0 ? 'video' : 'imagen');
      ok++;
    } catch (x) { err.push('fila ' + (P.firstRow + i)); }
  });
  SpreadsheetApp.getActive().toast(ok + ' pieza(s) listas' + (err.length ? '. Revisar: ' + err.join(', ') : '.'));
}

/* ======================================================================
 * PROCESAMIENTO AL ENVIAR EL FORM
 * ==================================================================== */

function onFormSubmit(e) {
  const sh = e.range.getSheet();
  const row = e.range.getRow();
  const link = ((e.namedValues[Q.archivo] || [''])[0] || '').split(',')[0].trim();
  const id = driveId_(link);
  if (!id) return;

  const file = DriveApp.getFileById(id);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const tipo = file.getMimeType().indexOf('video') === 0 ? 'video' : 'imagen';

  sh.getRange(row, ensureCol_(sh, C.url)).setValue(directUrl_(id, tipo));
  sh.getRange(row, ensureCol_(sh, C.tipo)).setValue(tipo);
  const ca = ensureCol_(sh, C.activo);
  if (!sh.getRange(row, ca).getValue()) sh.getRange(row, ca).setValue('Sí');
}

/* ======================================================================
 * MONITOREO
 * ==================================================================== */

function logPing_(torre) {
  if (!torre) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SHEET_STATUS) || ss.insertSheet(SHEET_STATUS);
    if (sh.getLastRow() === 0) sh.appendRow(['Torre', 'Última conexión', 'Minutos sin señal']);
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]));
    const r = ids.indexOf(torre) + 1;
    if (r > 0) {
      sh.getRange(r, 2).setValue(new Date());
    } else {
      sh.appendRow([torre, new Date()]);
      const nr = sh.getLastRow();
      sh.getRange(nr, 3).setFormula('=ROUND((NOW()-B' + nr + ')*1440)');
    }
  } finally {
    lock.releaseLock();
  }
}

function log_(evento, quien) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  if (sh.getLastRow() === 0) sh.appendRow(['Fecha y hora', 'Evento', 'Usuario']);
  sh.appendRow([new Date(), 'PÁNICO ' + evento, quien || '']);
}

/* ======================================================================
 * UTILIDADES
 * ==================================================================== */

function matchTorre_(valor, torre) {
  const t = String(valor || 'Todas');
  if (/todas/i.test(t)) return true;
  if (!torre) return false;
  return t.split(',').map(s => s.trim().toUpperCase()).indexOf(torre) > -1;
}

function toDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** Si "Hasta" viene sin hora (00:00 en Santiago), se extiende al final de ese día. */
function endOf_(d) {
  if (!d) return null;
  if (Utilities.formatDate(d, TZ, 'HH:mm') === '00:00') return new Date(d.getTime() + 86400000 - 1);
  return d;
}

function driveId_(link) {
  const m = String(link || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function directUrl_(id, tipo) {
  return tipo === 'video'
    ? 'https://drive.google.com/uc?export=download&id=' + id
    : 'https://lh3.googleusercontent.com/d/' + id;
}

function ensureCol_(sh, name) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const i = h.indexOf(name);
  if (i > -1) return i + 1;
  const c = sh.getLastColumn() + 1;
  sh.getRange(1, c).setValue(name);
  return c;
}

/* ======================================================================
 * INSTALACIÓN Y MENÚ
 * ==================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚨 Pantallas')
    .addItem('ACTIVAR pánico', 'activarPanico')
    .addItem('Desactivar pánico', 'desactivarPanico')
    .addSeparator()
    .addItem('Preparar piezas de pánico', 'prepararPanico')
    .addSeparator()
    .addItem('⚙ Instalar / reparar', 'setup')
    .addToUi();
}

/** Ejecutar UNA vez a mano: instala el disparador del Form y crea las hojas Estado, Panico y Bitacora. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();

  if (!ss.getSheetByName(SHEET_STATUS)) ss.insertSheet(SHEET_STATUS);
  if (!ss.getSheetByName(SHEET_CONTROL)) {
    const c = ss.insertSheet(SHEET_CONTROL);
    c.getRange('A1:B1').setValues([['Recargar pantallas (cambia este número)', 1]]);
    c.getRange('A1').setFontWeight('bold');
    c.setColumnWidth(1, 320);
  }
  if (!ss.getSheetByName(SHEET_LOG)) {
    ss.insertSheet(SHEET_LOG).appendRow(['Fecha y hora', 'Evento', 'Usuario']);
  }

  if (!ss.getSheetByName(SHEET_PANIC)) {
    const sh = ss.insertSheet(SHEET_PANIC, 0);
    sh.getRange('A1:A4').setValues([['🚨 PÁNICO ACTIVO'], ['Activado el'], ['Apagado automático (horas)'], ['Torres']]);
    sh.getRange(P.activo).insertCheckboxes().setValue(false);
    sh.getRange(P.horas).setValue(PANIC_DEFAULT_HOURS);
    sh.getRange(P.torres).setValue('Todas');
    sh.getRange('A6:D6').setValues([['Pieza', 'Enlace Drive', 'Tipo', 'Duración (s)']]).setFontWeight('bold');
    sh.getRange('A7:D8').setValues([
      ['Tsunami — evacuar (ES/PT)', '', 'imagen', 8],
      ['Ruta de evacuación (ES/PT)', '', 'imagen', 8]
    ]);
    sh.getRange('A1:B1').setFontWeight('bold').setFontSize(14).setBackground('#FCEBEB');
    sh.getRange('B2').setNumberFormat('dd-mm-yyyy HH:mm');
    sh.setColumnWidth(1, 240); sh.setColumnWidth(2, 360);
  }

  if (!ss.getSheetByName(SHEET_CONTENT)) {
    ss.toast('Instalado, pero no encuentro la hoja "' + SHEET_CONTENT + '". Ajusta SHEET_CONTENT en el código al nombre real de la hoja de respuestas.', 'Pantallas', 15);
  } else {
    ss.toast('Instalación lista: hojas Panico, Estado, Control y Bitacora creadas.', 'Pantallas', 8);
  }
}
