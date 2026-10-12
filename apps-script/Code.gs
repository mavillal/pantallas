/**
 * PANTALLAS SAN ALFONSO DEL MAR — Backend (Google Apps Script vinculado a la Sheet "Pantallas-Contenido")
 * Versión 4.0 — todo en español, sin traducciones
 *
 * Web App:
 *   GET ?torre=T1          -> JSON con lo que debe mostrar esa torre
 *   GET ?torre=T1&ping=1   -> idem + registra la conexión en la hoja Estado
 *   GET (sin torre)        -> lista de torres (para el selector de pantallas)
 *
 * Hojas:
 *   Respuestas de formulario 1  piezas publicadas desde el Form
 *   Torres                      código (T1…) y nombre visible
 *   Cinta                       avisos breves: Texto · Torres · Hasta · Activo
 *   Destinos                    lugares que rotan en la franja, con km por ruta
 *   Control                     recargar pantallas, teléfono municipal, links de QR
 *   Estado                      última conexión de cada pantalla
 *
 * Instalación: pegar este código, guardar, elegir "setup" y Ejecutar. Luego Implementar → Nueva versión.
 */

const VERSION = 'v4.2';
const TZ = 'America/Santiago';
const DEFAULT_DUR = 10; // segundos por pieza
const ORIGEN = 'San Alfonso del Mar, Algarrobo, Valparaíso, Chile';

const SHEET_CONTENT  = 'Respuestas de formulario 1';
const SHEET_TORRES   = 'Torres';
const SHEET_CINTA    = 'Cinta';
const SHEET_DESTINOS = 'Destinos';
const SHEET_CONTROL  = 'Control';
const SHEET_STATUS   = 'Estado';

// Preguntas del Form (se buscan sin importar tildes ni mayúsculas)
const Q = {
  titulo:   'Título',
  categoria:'Categoría',
  archivo:  'Archivo',
  texto:    'Texto del aviso',
  link:     'Link para QR',
  cinta:    'Texto para la cinta',
  desde:    'Desde',
  hasta:    'Hasta',
  torres:   'Torres',
  dur:      'Duración (segundos)',
  prio:     'Prioridad'
};
// Columnas que agrega el script en la hoja de respuestas
const C = { url: 'URL', tipo: 'Tipo', activo: 'Activo' };

// Hoja Cinta: columnas buscadas por nombre (el orden da lo mismo)
const CINTA = { headers: ['Texto', 'Torres', 'Activo', 'Hasta (opcional)'] };
function cintaIdx_(sh) {
  const h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(norm_);
  const f = t => h.findIndex(t) + 1;
  return {
    texto:  f(x => x === 'texto' || x.indexOf('texto') === 0) || 1,
    torres: f(x => x.indexOf('torre') === 0),
    activo: f(x => x === 'activo'),
    hasta:  f(x => x.indexOf('hasta') === 0)
  };
}

// Hoja Destinos: columnas buscadas por nombre (el orden da lo mismo)
function destIdx_(sh) {
  const h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(norm_);
  const f = t => h.findIndex(t) + 1;
  return {
    nombre: f(x => x.indexOf('nombre') === 0) || 1,
    dir:    f(x => x.indexOf('direccion') === 0) || 2,
    icono:  f(x => x.indexOf('icono') === 0),
    activo: f(x => x === 'activo'),
    km:     f(x => x.indexOf('km') === 0)
  };
}
const DEST = {
  headers: ['Nombre en pantalla', 'Dirección (como en Google Maps)', 'Ícono (avión / auto)', 'Activo',
            'Km por ruta (se calcula solo)'],
};
const DESTINOS_INICIALES = [
  ['Aeropuerto SCL',      'Aeropuerto Internacional Arturo Merino Benítez, Pudahuel, Chile', 'avión', true],
  ['Isla Negra',          'Casa Museo Isla Negra, El Quisco, Chile',                         'auto',  true],
  ['Valparaíso',          'Plaza Sotomayor, Valparaíso, Chile',                              'auto',  true],
  ['Viña del Mar',        'Reloj de Flores, Viña del Mar, Chile',                            'auto',  true],
  ['Valle de Casablanca', 'Casablanca, Valparaíso, Chile',                                   'auto',  true],
  ['Santiago centro',     'Plaza de Armas, Santiago, Chile',                                 'auto',  true]
];

/* ======================================================================
 * WEB APP
 * ==================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const torre = String(p.torre || '').trim().toUpperCase();
  if (p.ping) logPing_(torre);

  const out = torre ? getPlaylist_(torre) : { items: [], urgente: false };
  const ctl = getControl_();
  out.version     = VERSION;
  out.torre       = torre;
  out.torreNombre = getTorreNombre_(torre);
  out.listaTorres = getListaTorres_();
  out.cinta       = torre ? getCinta_(torre) : [];
  out.destinos    = getDestinos_();
  out.avisoDestinos = diagDestinos_(out.destinos);
  out.recarga     = ctl.recarga;
  out.seguridad   = ctl.seguridad;
  out.qrTurismo   = ctl.qrTurismo;
  out.qrComercio  = ctl.qrComercio;

  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Piezas del Form ---------------- */

function getPlaylist_(torre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  if (!sh || sh.getLastRow() < 2) return { generado: new Date().toISOString(), urgente: false, items: [] };
  const data = sh.getDataRange().getValues();
  const h = data[0];
  const col = name => colOf_(h, name);
  const ix = {
    titulo: col(Q.titulo), cat: col(Q.categoria), texto: col(Q.texto), link: col(Q.link),
    desde: col(Q.desde), hasta: col(Q.hasta), torres: col(Q.torres), dur: col(Q.dur), prio: col(Q.prio),
    url: col(C.url), tipo: col(C.tipo), activo: col(C.activo)
  };
  const val = (r, i) => (i > -1 ? String(r[i] || '').trim() : '');
  const now = Date.now();
  const items = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const url = val(r, ix.url);
    if (!url) continue;                       // filas solo-cinta o sin procesar
    if (ix.activo > -1 && isNo_(r[ix.activo])) continue;
    const ini = toDate_(r[ix.desde]);
    const fin = endOf_(toDate_(r[ix.hasta]));
    if (ini && now < ini.getTime()) continue;
    if (fin && now > fin.getTime()) continue;
    if (!matchTorre_(ix.torres > -1 ? r[ix.torres] : 'Todas', torre)) continue;

    const tipo = val(r, ix.tipo) || 'imagen';
    items.push({
      titulo:    val(r, ix.titulo),
      categoria: val(r, ix.cat),
      url:       url,
      tipo:      tipo,
      texto:     tipo === 'texto' ? val(r, ix.texto) : '',
      dur:       Number(r[ix.dur]) > 0 ? Number(r[ix.dur]) : DEFAULT_DUR,
      urgente:   /urgente/i.test(val(r, ix.prio)),
      link:      val(r, ix.link),
      hasta:     fin ? fin.toISOString() : ''
    });
  }

  const urg = items.filter(x => x.urgente);
  return { generado: new Date().toISOString(), urgente: urg.length > 0, items: urg.length ? urg : items };
}

/* ---------------- Cinta ---------------- */

function getCinta_(torre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CINTA);
  if (!sh) return [];
  const ix = cintaIdx_(sh);
  const last = lastTextRow_(sh, ix.texto);
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const g = (r, c) => (c > 0 ? r[c - 1] : '');
  const now = Date.now();
  const out = [];
  rows.forEach(r => {
    const texto = String(g(r, ix.texto) || '').trim();
    if (!texto) return;
    if (ix.activo && isNo_(g(r, ix.activo))) return;
    const fin = endOf_(toDate_(g(r, ix.hasta)));
    if (fin && now > fin.getTime()) return;
    if (!matchTorre_(g(r, ix.torres) || 'Todas', torre)) return;
    out.push({ es: texto });
  });
  return out;
}

/** Agrega una fila a la Cinta (usado por el Form). */
function agregarACinta_(texto, torres, hasta) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CINTA) || prepararCinta_();
  const ix = cintaIdx_(sh);
  const row = lastTextRow_(sh, ix.texto) + 1;
  sh.getRange(row, ix.texto).setValue(texto);
  if (ix.torres) sh.getRange(row, ix.torres).setValue(torres || 'Todas');
  if (ix.hasta && hasta) sh.getRange(row, ix.hasta).setValue(hasta);
  if (ix.activo) sh.getRange(row, ix.activo).insertCheckboxes().setValue(true);
}

/* ---------------- Destinos ---------------- */

function getDestinos_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_DESTINOS);
  if (!sh || sh.getLastRow() < 2) return [];
  calcularKm_(sh, 3);   // calcula hasta 3 distancias faltantes por consulta
  const ix = destIdx_(sh);
  const g = (r, c) => (c > 0 ? r[c - 1] : '');
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return rows
    .filter(r => String(g(r, ix.nombre)).trim() && !(ix.activo && isNo_(g(r, ix.activo))) && Number(g(r, ix.km)) > 0)
    .map(r => ({
      nombre: String(g(r, ix.nombre)).trim(),
      icono:  /avi|aero|plane/.test(norm_(g(r, ix.icono))) ? 'avion' : 'auto',
      km:     Math.round(Number(g(r, ix.km)))
    }));
}

/** Calcula los km por ruta que falten (máximo "limite" por llamada). */
function calcularKm_(sh, limite) {
  sh = sh || SpreadsheetApp.getActive().getSheetByName(SHEET_DESTINOS);
  if (!sh || sh.getLastRow() < 2) return 0;
  const ix = destIdx_(sh);
  if (!ix.km) return 0;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  let hechas = 0;
  for (let i = 0; i < rows.length && hechas < (limite || 99); i++) {
    const dir = String(rows[i][ix.dir - 1] || '').trim();
    if (!dir || Number(rows[i][ix.km - 1]) > 0) continue;
    const km = kmPorRuta_(dir);
    if (km) { sh.getRange(i + 2, ix.km).setValue(km); hechas++; }
  }
  if (ULTIMO_ERROR_KM) PropertiesService.getScriptProperties().setProperty('errorKm', ULTIMO_ERROR_KM);
  return hechas;
}

/** Explica por qué no hay distancias en pantalla (se ve en la URL-API, campo "avisoDestinos"). */
function diagDestinos_(lista) {
  if (lista.length) return '';
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_DESTINOS);
  if (!sh) return 'Falta la hoja Destinos: corre setup.';
  const ix = destIdx_(sh);
  if (!ix.km) return 'La hoja Destinos no tiene la columna "Km por ruta": corre setup.';
  const err = PropertiesService.getScriptProperties().getProperty('errorKm');
  return 'Ningún destino activo tiene km.' + (err ? ' Último error de Google Maps: ' + err : '') +
         ' Usa el menú Pantallas → Calcular km, o escribe los km a mano.';
}

let ULTIMO_ERROR_KM = '';
function kmPorRuta_(destino) {
  try {
    const res = Maps.newDirectionFinder()
      .setOrigin(ORIGEN).setDestination(destino)
      .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
    const leg = res && res.routes && res.routes[0] && res.routes[0].legs && res.routes[0].legs[0];
    if (!leg) ULTIMO_ERROR_KM = 'Google no encontró la ruta a "' + destino + '" (estado: ' + (res && res.status) + ')';
    return leg ? Math.round(leg.distance.value / 1000) : 0;
  } catch (e) {
    ULTIMO_ERROR_KM = String(e && e.message || e);
    return 0;
  }
}

/* ---------------- Control y torres ---------------- */

/** Valor a la derecha de la celda cuya etiqueta contiene "clave" (las filas de Control pueden moverse). */
function valorControl_(sh, clave) {
  const d = sh.getDataRange().getValues();
  for (const r of d) for (let c = 0; c < r.length; c++) {
    if (norm_(r[c]).indexOf(clave) > -1) return String(r[c + 1] === undefined || r[c + 1] === null ? '' : r[c + 1]).trim();
  }
  return '';
}
function celdaControl_(sh, clave) {
  const d = sh.getDataRange().getValues();
  for (let i = 0; i < d.length; i++) for (let c = 0; c < d[i].length; c++) {
    if (norm_(d[i][c]).indexOf(clave) > -1) return sh.getRange(i + 1, c + 2);
  }
  return null;
}

function getControl_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTROL);
  const recarga = PropertiesService.getScriptProperties().getProperty('recarga') || '1';
  if (!sh) return { recarga: recarga, seguridad: '', qrTurismo: '', qrComercio: '' };
  return {
    recarga:    recarga,
    seguridad:  valorControl_(sh, 'telefono'),
    qrTurismo:  valorControl_(sh, 'qr turismo'),
    qrComercio: valorControl_(sh, 'qr comercio')
  };
}

/** Recarga todas las pantallas en menos de 1 minuto. */
function recargarPantallas() {
  PropertiesService.getScriptProperties().setProperty('recarga', String(Date.now()));
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_CONTROL);
  const cb = sh ? celdaControl_(sh, 'recargar') : null;
  if (cb) cb.offset(0, 1).setValue('Última recarga: ' + Utilities.formatDate(new Date(), TZ, 'dd-MM HH:mm'));
  ss.toast('Recarga enviada: las pantallas se actualizan en menos de 1 minuto.', 'Pantallas', 6);
}

function getTorreNombre_(torre) {
  if (!torre) return '';
  for (const t of getListaTorres_()) if (t.codigo === torre) return t.nombre;
  return torre.replace(/^T/i, 'Torre ');
}

function getListaTorres_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TORRES);
  if (!sh || sh.getLastRow() < 2) return [];
  const d = sh.getDataRange().getValues();
  const h = d[0].map(norm_);
  const cCod = Math.max(h.findIndex(x => x.indexOf('codigo') === 0), 0);
  let cNom = h.findIndex(x => x.indexOf('nombre') === 0);
  if (cNom < 0) cNom = cCod === 0 ? 1 : 0;
  return d.slice(1)
    .filter(r => String(r[cCod]).trim())
    .map(r => ({ codigo: String(r[cCod]).trim().toUpperCase(), nombre: String(r[cNom] || r[cCod]).trim() }));
}

/* ======================================================================
 * FORM
 * ==================================================================== */

function onFormSubmit(e) {
  const sh = e.range.getSheet();
  const row = e.range.getRow();
  const nv = e.namedValues || {};
  const titulo = answer_(nv, Q.titulo);
  const texto  = answer_(nv, Q.texto);
  const cinta  = answer_(nv, Q.cinta);
  const id     = driveId_(answer_(nv, Q.archivo).split(',')[0].trim());

  const setCol = (name, v) => sh.getRange(row, ensureCol_(sh, name)).setValue(v);
  sh.getRange(row, ensureCol_(sh, C.activo)).insertCheckboxes().setValue(true);

  // 1) Texto para la cinta → hoja Cinta
  if (cinta) agregarACinta_(cinta, answer_(nv, Q.torres) || 'Todas', answer_(nv, Q.hasta));

  // 2) Pieza con archivo
  if (id) {
    const file = DriveApp.getFileById(id);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const tipo = file.getMimeType().indexOf('video') === 0 ? 'video' : 'imagen';
    setCol(C.url, directUrl_(id, tipo));
    setCol(C.tipo, tipo);
    return;
  }

  // 3) Tarjeta de texto (si hay texto del aviso, o solo título y nada para la cinta)
  if (texto || (titulo && !cinta)) {
    setCol(C.url, 'texto');
    setCol(C.tipo, 'texto');
    return;
  }

  // 4) Solo cinta: no genera pieza en pantalla
  setCol(C.tipo, 'solo cinta');
}

/* ======================================================================
 * EDICIONES EN LA SHEET (disparador instalable)
 * ==================================================================== */

function alEditar(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const name = sh.getName();
  const r0 = e.range.getRow(), c0 = e.range.getColumn();
  const r1 = e.range.getLastRow(), c1 = e.range.getLastColumn();

  // Control: casilla de recarga (donde esté)
  if (name === SHEET_CONTROL) {
    const cb = celdaControl_(sh, 'recargar');
    if (cb && cb.getValue() === true) {
      recargarPantallas();
      cb.setValue(false);
    }
    return;
  }

  // Cinta: al escribir un texto nuevo, completa Torres y la casilla Activo
  if (name === SHEET_CINTA && r1 >= 2) {
    const ix = cintaIdx_(sh);
    if (c0 > ix.texto || c1 < ix.texto) return;
    for (let row = Math.max(r0, 2); row <= r1; row++) {
      if (!String(sh.getRange(row, ix.texto).getValue()).trim()) continue;
      if (ix.torres && String(sh.getRange(row, ix.torres).getValue()).trim()) continue;   // fila ya existente
      if (ix.torres) sh.getRange(row, ix.torres).setValue('Todas');
      if (ix.activo) sh.getRange(row, ix.activo).insertCheckboxes().setValue(true);
    }
    return;
  }

  if (name === SHEET_DESTINOS && r1 >= 2) {
    const ix = destIdx_(sh);
    // fila nueva => Activo marcado
    if (c0 <= ix.nombre && c1 >= ix.nombre && ix.activo) {
      for (let row = Math.max(r0, 2); row <= r1; row++) {
        if (!String(sh.getRange(row, ix.nombre).getValue()).trim()) continue;
        const act = sh.getRange(row, ix.activo);
        if (act.getDataValidation() === null) act.insertCheckboxes().setValue(true);
      }
    }
    // dirección cambiada => recalcular km
    if (c0 <= ix.dir && c1 >= ix.dir && ix.km) {
      const desde = Math.max(r0, 2);
      sh.getRange(desde, ix.km, r1 - desde + 1, 1).clearContent();
      calcularKm_(sh, 10);
    }
  }
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

/* ======================================================================
 * UTILIDADES
 * ==================================================================== */

/** Compara textos sin importar tildes, mayúsculas ni espacios extra. */
function norm_(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function colOf_(headers, name) { return headers.map(norm_).indexOf(norm_(name)); }
function answer_(namedValues, name) {
  const n = norm_(name);
  for (const k in namedValues) if (norm_(k) === n) return String((namedValues[k] || [''])[0] || '').trim();
  return '';
}

/** Apagado = No / falso / casilla desmarcada. Vacío = encendido. */
function isNo_(v) { return v === false || /^(no|false|falso|0)$/i.test(String(v === undefined ? '' : v).trim()); }
function isYes_(v) { return !isNo_(v); }

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

/** Si "Hasta" viene sin hora (00:00), dura hasta el final de ese día. */
function endOf_(d) {
  if (!d) return null;
  if (Utilities.formatDate(d, TZ, 'HH:mm') === '00:00') return new Date(d.getTime() + 86400000 - 1);
  return d;
}

function driveId_(link) { const m = String(link || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function directUrl_(id, tipo) {
  return tipo === 'video'
    ? 'https://drive.google.com/uc?export=download&id=' + id
    : 'https://lh3.googleusercontent.com/d/' + id;
}

/** Última fila con texto en la columna "col" (ignora casillas vacías, que Sheets cuenta como datos). */
function lastTextRow_(sh, col) {
  const n = sh.getLastRow();
  if (n < 1) return 0;
  const v = sh.getRange(1, col, n, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    const x = v[i][0];
    if (x !== '' && x !== null && x !== true && x !== false) return i + 1;
  }
  return 0;
}

function ensureCol_(sh, name) {
  const last = Math.max(sh.getLastColumn(), 1);
  const h = sh.getRange(1, 1, 1, last).getValues()[0];
  const i = colOf_(h, name);
  if (i > -1) return i + 1;
  const c = sh.getLastColumn() + 1;
  sh.getRange(1, c).setValue(name);
  return c;
}

/* ======================================================================
 * MENÚ E INSTALACIÓN
 * ==================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📺 Pantallas')
    .addItem('🔄 Recargar todas las pantallas', 'recargarPantallas')
    .addItem('Calcular km de destinos ahora', 'menuKm')
    .addSeparator()
    .addItem('⚙ Instalar / reparar', 'setup')
    .addToUi();
}

function menuKm() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_DESTINOS);
  const n = calcularKm_(sh, 99);
  SpreadsheetApp.getActive().toast(n + ' distancia(s) calculadas.' +
    (ULTIMO_ERROR_KM ? ' Problema: ' + ULTIMO_ERROR_KM + '. Puedes escribir los km a mano en la columna E.' : ''),
    'Pantallas', 15);
}

/** Ejecutar desde el editor (o el menú): crea/migra hojas e instala los disparadores. */
function setup() {
  const ss = SpreadsheetApp.getActive();

  // Disparadores: se rehacen todos
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create();

  // Lo que dejaron versiones anteriores y ya no se usa
  ['Panico', 'Bitacora'].forEach(n => { const s = ss.getSheetByName(n); if (s) ss.deleteSheet(s); });
  const resp = ss.getSheetByName(SHEET_CONTENT);
  if (resp) {
    ['Título PT', 'Texto PT', 'Título EN', 'Texto EN'].forEach(nombre => {
      const h = resp.getRange(1, 1, 1, resp.getLastColumn()).getValues()[0];
      const i = colOf_(h, nombre);
      if (i > -1) resp.deleteColumn(i + 1);
    });
  }

  if (!ss.getSheetByName(SHEET_STATUS)) ss.insertSheet(SHEET_STATUS);

  if (!ss.getSheetByName(SHEET_TORRES)) {
    const t = ss.insertSheet(SHEET_TORRES);
    const filas = [['Código', 'Nombre en pantalla']];
    for (let i = 1; i <= 11; i++) filas.push(['T' + i, 'Torre ' + i]);
    t.getRange(1, 1, filas.length, 2).setValues(filas);
    t.getRange('A1:B1').setFontWeight('bold');
    t.setColumnWidth(2, 260);
  }

  prepararCinta_();
  prepararDestinos_();
  prepararControl_();
  prepararRespuestas_();
  calcularKm_(null, 20);

  const ok = !!ss.getSheetByName(SHEET_CONTENT);
  ss.toast(ok
    ? 'Instalación ' + VERSION + ' lista. Ahora: Implementar → Administrar implementaciones → Nueva versión.'
    : 'Instalado, pero no encuentro la hoja "' + SHEET_CONTENT + '".', 'Pantallas', 12);
}

/** Deja la hoja Cinta con 4 columnas (Texto · Torres · Hasta · Activo) conservando los textos. */
function prepararCinta_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_CINTA);
  const H = CINTA.headers;

  if (!sh) {
    sh = ss.insertSheet(SHEET_CINTA);
    sh.getRange(1, 1, 2, 4).setValues([H, ['Bienvenidos a San Alfonso del Mar', 'Todas', true, '']]);
  } else {
    const W = Math.max(sh.getLastColumn(), 1);
    const hdr = sh.getRange(1, 1, 1, W).getValues()[0].map(norm_);
    const nombres = hdr.filter(x => x);
    const ya = nombres.length === H.length && H.every(x => nombres.indexOf(norm_(x)) > -1);
    if (!ya) {
      // Migración desde versiones con traducciones: se conserva el español, torres, hasta y activo
      const data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, W).getValues() : [];
      const find = test => hdr.findIndex(test);
      const m = {
        texto:  find(x => x.indexOf('espanol') > -1 || x === 'texto'),
        torres: find(x => x.indexOf('torre') > -1),
        hasta:  find(x => x.indexOf('hasta') > -1),
        activo: find(x => x === 'activo')
      };
      if (m.texto < 0) m.texto = 0;
      const filas = data
        .filter(r => String(r[m.texto]).trim())
        .map(r => [
          r[m.texto],
          (m.torres > -1 && String(r[m.torres]).trim()) ? r[m.torres] : 'Todas',
          m.activo > -1 ? isYes_(r[m.activo]) : true,
          m.hasta > -1 ? r[m.hasta] : ''
        ]);
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
      sh.clear();
      sh.getRange(1, 1, 1, 4).setValues([H]);
      if (filas.length) sh.getRange(2, 1, filas.length, 4).setValues(filas);
    }
  }

  // Formato: casilla solo en Activo y solo en filas con texto (las filas nuevas la reciben al escribir)
  const ix = cintaIdx_(sh);
  sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clearDataValidations();
  const last = lastTextRow_(sh, ix.texto);
  if (sh.getLastRow() > last) sh.getRange(last + 1, ix.activo, sh.getLastRow() - last, 1).clearContent();
  if (last >= 2) {
    const act = sh.getRange(2, ix.activo, last - 1, 1);
    const vals = act.getValues().map(v => [isYes_(v[0])]);
    act.insertCheckboxes();
    act.setValues(vals);
  }
  sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#ECE7DE');
  sh.setFrozenRows(1);
  sh.setColumnWidth(ix.texto, 520);
  if (sh.getMaxColumns() > 4) sh.deleteColumns(5, sh.getMaxColumns() - 4);
  return sh;
}

function prepararDestinos_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_DESTINOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DESTINOS);
    sh.getRange(1, 1, 1, DEST.headers.length).setValues([DEST.headers]);
    sh.getRange(2, 1, DESTINOS_INICIALES.length, 4).setValues(DESTINOS_INICIALES);
  }
  if (!destIdx_(sh).km) sh.getRange(1, sh.getLastColumn() + 1).setValue(DEST.headers[4]);
  if (!destIdx_(sh).activo) sh.getRange(1, sh.getLastColumn() + 1).setValue('Activo');
  const ix = destIdx_(sh);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#ECE7DE');
  sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clearDataValidations();
  const last = lastTextRow_(sh, ix.nombre);
  if (sh.getLastRow() > last) sh.getRange(last + 1, ix.activo, sh.getLastRow() - last, 1).clearContent();
  if (last >= 2) {
    const act = sh.getRange(2, ix.activo, last - 1, 1);
    const vals = act.getValues().map(v => [isYes_(v[0])]);
    act.insertCheckboxes();
    act.setValues(vals);
  }
  sh.setFrozenRows(1);
}

function prepararControl_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_CONTROL) || ss.insertSheet(SHEET_CONTROL);
  const filas = [
    ['recargar',    '🔄 Recargar todas las pantallas (marca la casilla)'],
    ['telefono',    'Teléfono Seguridad Municipal (opcional)'],
    ['qr turismo',  'Link QR turismo (lista de Google Maps)'],
    ['qr comercio', 'Link QR comercio local']
  ];
  filas.forEach(([clave, etiqueta]) => {
    if (!celdaControl_(sh, clave)) {
      const r = sh.getLastRow() + 1;
      sh.getRange(r, 1).setValue(etiqueta).setFontWeight('bold');
    }
  });
  const cb = celdaControl_(sh, 'recargar');
  if (cb && cb.getDataValidation() === null) { cb.clearContent(); cb.insertCheckboxes().setValue(false); }
  if (!PropertiesService.getScriptProperties().getProperty('recarga')) {
    PropertiesService.getScriptProperties().setProperty('recarga', String(Date.now()));
  }
}

/** La columna Activo de las respuestas pasa a ser casilla. */
function prepararRespuestas_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  if (!sh || sh.getLastRow() < 2) return;
  const c = ensureCol_(sh, C.activo);
  const rng = sh.getRange(2, c, sh.getLastRow() - 1, 1);
  const vals = rng.getValues().map(v => [isYes_(v[0])]);
  rng.insertCheckboxes();
  rng.setValues(vals);
}
