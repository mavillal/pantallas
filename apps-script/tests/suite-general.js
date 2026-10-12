const fs = require('fs');
// ---------- Mock de Google Sheets ----------
class Sheet {
  constructor(name, data){ this.name=name; this.d=(data||[]).map(r=>r.slice()); this.val={}; this.maxR=1000; this.maxC=26; }
  getName(){ return this.name; }
  getLastRow(){ for(let i=this.d.length-1;i>=0;i--) if(this.d[i].some(v=>v!==''&&v!==null&&v!==undefined)) return i+1; return 0; }
  getLastColumn(){ let m=0; this.d.forEach(r=>{for(let j=r.length-1;j>=0;j--) if(r[j]!==''&&r[j]!==undefined&&r[j]!==null){m=Math.max(m,j+1);break;}}); return m; }
  getMaxRows(){ return this.maxR; } getMaxColumns(){ return this.maxC; }
  getDataRange(){ return this.getRange(1,1,Math.max(this.getLastRow(),1),Math.max(this.getLastColumn(),1)); }
  getRange(r,c,nr,nc){
    if (typeof r==='string'){ const m=r.match(/^([A-Z])(\d+)(?::([A-Z])(\d+))?$/); const col=x=>x.charCodeAt(0)-64;
      const r1=+m[2], c1=col(m[1]), r2=m[4]?+m[4]:r1, c2=m[3]?col(m[3]):c1; return new Range(this,r1,c1,r2-r1+1,c2-c1+1); }
    return new Range(this,r,c,nr||1,nc||1);
  }
  get(r,c){ return (this.d[r-1]||[])[c-1] ?? ''; }
  set(r,c,v){ while(this.d.length<r) this.d.push([]); const row=this.d[r-1]; while(row.length<c) row.push(''); row[c-1]=v; }
  appendRow(a){ const r=this.getLastRow()+1; a.forEach((v,i)=>this.set(r,i+1,v)); }
  clear(){ this.d=[]; }
  deleteColumn(c){ this.d.forEach(r=>r.splice(c-1,1)); }
  setFrozenRows(){} setColumnWidth(){} deleteColumns(c,n){ this.maxC=c-1; this.d.forEach(r=>r.splice(c-1,n)); }
}
class Range {
  constructor(sh,r,c,nr,nc){ Object.assign(this,{sh,r,c,nr,nc}); }
  getRow(){return this.r;} getColumn(){return this.c;} getLastRow(){return this.r+this.nr-1;} getLastColumn(){return this.c+this.nc-1;}
  getSheet(){ return this.sh; }
  offset(dr,dc){ return new Range(this.sh,this.r+dr,this.c+dc,this.nr,this.nc); }
  getValues(){ const o=[]; for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++) row.push(this.sh.get(this.r+i,this.c+j)); o.push(row);} return o; }
  getValue(){ return this.sh.get(this.r,this.c); }
  getDisplayValues(){ return this.getValues().map(r=>r.map(v=>v===null||v===undefined?'':String(v))); }
  setValues(v){ v.forEach((row,i)=>row.forEach((x,j)=>this.sh.set(this.r+i,this.c+j,x))); return this; }
  setValue(x){ for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++) this.sh.set(this.r+i,this.c+j,x); return this; }
  clearContent(){ return this.setValue(''); }
  insertCheckboxes(){ for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++){ this.sh.val[(this.r+i)+','+(this.c+j)]='cb'; const v=this.sh.get(this.r+i,this.c+j); if(v!==true&&v!==false) this.sh.set(this.r+i,this.c+j,false);} return this; }
  clearDataValidations(){ for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++) delete this.sh.val[(this.r+i)+','+(this.c+j)]; return this; }
  getDataValidation(){ return this.sh.val[this.r+','+this.c] ? {} : null; }
  setFontWeight(){return this;} setBackground(){return this;} setFontColor(){return this;} setFontSize(){return this;} setNumberFormat(){return this;} setFormula(){return this;}
}
const sheets = {};
const ss = { getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=new Sheet(n)), deleteSheet:s=>delete sheets[s.name], toast:(m)=>console.log('  [toast]',m) };
const props = {};
global.SpreadsheetApp = { getActive:()=>ss, getUi:()=>({createMenu:()=>({addItem(){return this},addSeparator(){return this},addToUi(){}})}) };
global.PropertiesService = { getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v}) };
global.ScriptApp = { getProjectTriggers:()=>[], deleteTrigger(){}, newTrigger:()=>({forSpreadsheet(){return this},onFormSubmit(){return this},onEdit(){return this},create(){}}) };
global.Utilities = { formatDate:(d,tz,f)=>{ const x=new Date(d.getTime()-3*3600e3); const p=n=>String(n).padStart(2,'0'); return f==='HH:mm'?p(x.getUTCHours())+':'+p(x.getUTCMinutes()):'x'; } };
global.Maps = { DirectionFinder:{Mode:{DRIVING:'d'}}, newDirectionFinder:()=>{ let dest=''; const o={setOrigin(){return o},setDestination(d){dest=d;return o},setMode(){return o},getDirections(){ return {status:'OK',routes:[{legs:[{distance:{value: dest.length*2000}}]}]}; }}; return o; } };
// Caché: apagada por defecto (las pruebas editan la hoja directo); la sección de caché la enciende.
const cacheMem = {}; let cacheOn = false;
global.CacheService = { getScriptCache:()=>({ get:k=>cacheOn?(cacheMem[k]||null):null, put:(k,v)=>{ if(cacheOn) cacheMem[k]=v; }, removeAll:ks=>ks.forEach(k=>delete cacheMem[k]) }) };
const mails = [];
global.MailApp = { sendEmail:(to,subj,body)=>mails.push({to,subj,body}) };
global.LockService = { getScriptLock:()=>({tryLock:()=>true,releaseLock(){}}) };
global.DriveApp = { Access:{ANYONE_WITH_LINK:1}, Permission:{VIEW:1}, getFileById:id=>({setSharing(){}, getMimeType:()=> id.startsWith('vid')?'video/mp4':'image/png', getId:()=>id}) };
global.ContentService = { MimeType:{JSON:1}, createTextOutput:t=>({setMimeType(){return t}}) };
eval(fs.readFileSync(process.argv[2],'utf8') + '\nObject.assign(global,{recargarPantallas,doGet,setup,onFormSubmit,alEditar,prepararCinta_,lastTextRow_,hora_});');

// ---------- Datos que replican tu Sheet actual ----------
sheets['Cinta'] = new Sheet('Cinta', [
  ['Texto (español)','Portugués','Inglés','Torres','Hasta','Activo','Portugués (automático)','Inglés (automático)'],
  ['Bienvenidos a San Alfonso del Mar','Bem-vindo a Sar',true,'Todas','',false,'Bem-vindo a San Alfonso del Mar','Sí'],
  ['Felices Fiestas Patrias','Feliz Dia da Inde',true,'Todas','',false,'Feliz Dia da Independência!','Happy Independence Day'],
  ['Recuerde respetar los horarios de piscina','Por favor, lembre',true,'Todas','',true,'Por favor...','Please remember...'],
  ['Recuerde estamos cerca de la playa',true,true,'Todas','',true,'Lembre-se...','Remember...'],
  ['Cuidado con el piso mojado',true,true,'T1','',true,'Tenha cuidado...','Be careful...']]);
sheets['Destinos'] = new Sheet('Destinos', [
  ['Nombre en pantalla','Dirección (como en Google Maps)','Ícono (avión / auto)','Activo','Km por ruta (se calcula solo)'],
  ['Aeropuerto SCL','Aeropuerto Internacional Arturo Merino Benítez, Pudahuel, Chile','avión',true,''],
  ['Isla Negra','Casa Museo Isla Negra, El Quisco, Chile','auto',false,'']]);
sheets['Control'] = new Sheet('Control', [['Recargar',1],['Tel','+56 35 000 0000'],['QR tur','https://maps/tur']]);
sheets['Panico'] = new Sheet('Panico', [['x']]);
sheets['Torres'] = new Sheet('Torres', [['Código','Nombre en pantalla'],['T1','Fragata'],['T2','Bitácora']]);
const H = ['Marca temporal','Título','Categoría','Archivo','Texto del aviso','Link para QR','Texto para la cinta','Idiomas','Desde','Hasta','Torres','Duracion (segundos)','Prioridad','URL','Tipo','Activo','Título PT','Texto PT'];
sheets['Respuestas de formulario 1'] = new Sheet('Respuestas de formulario 1', [H,
  ['t','Expo traperas','Aviso','https://drive.google.com/open?id=img1234567890123456789012345','','','','','2026-10-01 00:00','2026-12-31 00:00','T1',200,'Normal','https://lh3/d/img','imagen','Sí','',''],
  ['t','Viejo vencido','Aviso','','x','','','','2026-01-01 00:00','2026-01-02 00:00','Todas',10,'Normal','texto','texto','Sí','','']]);

let ok = true; const check=(cond,msg)=>{ console.log((cond?'  OK   ':'  FALLA ')+msg); if(!cond) ok=false; };

console.log('\n1) setup sobre tu hoja actual');
setup();
const c = sheets['Cinta'];
check(JSON.stringify(c.d[0])===JSON.stringify(['Texto','Torres','Activo','Hasta (opcional)']), 'Cinta queda con 4 columnas: '+c.d[0].join(' | '));
check(lastTextRow_(c,1)===6 && c.d.slice(1).every(r=>r.length<=4), 'se conservan los 5 avisos, sin columnas de traducción');
check(c.d[1][2]===false && c.d[3][2]===true, 'se respeta Activo de cada fila (fila 2 apagada, fila 4 encendida)');
check(c.d[5][1]==='T1', 'se respeta la torre T1 de "Cuidado con el piso mojado"');
check(!sheets['Panico'], 'hoja Panico eliminada');
check(sheets['Control'].get(1,2)===false && sheets['Control'].get(2,2)==='+56 35 000 0000', 'Control: B1 casilla y teléfono conservado');
check(sheets['Destinos'].get(2,5)>0, 'Destinos: km calculado para el aeropuerto = '+sheets['Destinos'].get(2,5));

console.log('\n2) Lo que recibe la pantalla de T1 y T2');
const j1 = JSON.parse(doGet({parameter:{torre:'T1'}}));
const j2 = JSON.parse(doGet({parameter:{torre:'T2'}}));
check(j1.version==='v4.3', 'versión '+j1.version);
check(j1.cinta.map(x=>x.es).join(' / ')==='Recuerde respetar los horarios de piscina / Recuerde estamos cerca de la playa / Cuidado con el piso mojado', 'cinta T1 (3 activos): '+j1.cinta.map(x=>x.es).join(' / '));
check(j2.cinta.length===2, 'cinta T2 no incluye el aviso solo de T1');
check(j1.cinta.every(x=>Object.keys(x).join()==='es'), 'cinta solo en español (sin pt/en)');
check(j1.items.length===1 && j1.items[0].dur===200, 'pieza "Expo traperas" con 200 s (columna "Duracion" sin tilde)');
check(j2.items.length===0, 'T2 no ve la pieza de T1 y el aviso vencido no aparece');
check(j1.destinos.length===1 && j1.destinos[0].nombre==='Aeropuerto SCL', 'destinos: solo los activos con km');
check(j1.torreNombre==='Fragata', 'nombre de torre desde la hoja Torres: '+j1.torreNombre);
check(!/"pt"|"en"|tituloPt|textoPt/.test(JSON.stringify(j1)), 'el JSON no trae traducciones');

console.log('\n3) Publicar desde el Form');
const R = sheets['Respuestas de formulario 1'];
const submit = (vals) => { const hh=R.d[0].slice(); const row=R.getLastRow()+1; hh.forEach((h,i)=>R.set(row,i+1, vals[h]||'')); const nv={}; hh.forEach(h=>nv[h]=[vals[h]||'']); onFormSubmit({range:R.getRange(row,1,1,hh.length), namedValues:nv}); return row; };
const now = '2020-01-01 00:00';
const later = '2099-12-31 00:00';
submit({'Título':'Corte de agua','Categoría':'Corte de servicio','Texto del aviso':'Mañana de 9 a 14 h','Desde':now,'Hasta':later,'Torres':'Todas','Prioridad':'Normal'});
submit({'Texto para la cinta':'Asamblea el sábado 11:00','Desde':now,'Hasta':later,'Torres':'T2','Prioridad':'Normal'});
const j2b = JSON.parse(doGet({parameter:{torre:'T2'}}));
check(j2b.items.some(x=>x.tipo==='texto' && x.titulo==='Corte de agua' && x.texto==='Mañana de 9 a 14 h'), 'tarjeta de texto "Corte de agua" visible en T2');
check(c.d.findIndex(r=>r[0]==='Asamblea el sábado 11:00')===6 && c.d.some(r=>r[0]==='Asamblea el sábado 11:00' && r[1]==='T2' && r[2]===true), 'el texto para la cinta entra justo debajo del último aviso (fila 7, T2, activo)');
check(j2b.cinta.some(x=>x.es==='Asamblea el sábado 11:00'), 'y aparece en la cinta de T2');
check(j2b.items.length===1, 'la publicación solo-cinta no crea pieza en pantalla');

console.log('\n4) Edición manual');
const nr = lastTextRow_(c,1)+1; c.set(nr,1,'Piscina cerrada por mantención');
alEditar({range:c.getRange(nr,1)});
check(c.get(nr,2)==='Todas' && c.get(nr,3)===true, 'al escribir un aviso nuevo se completan Torres=Todas y Activo=✓');
sheets['Control'].set(1,2,true); alEditar({range:sheets['Control'].getRange('B1')});
sheets['Destinos'].set(4,1,'Playa Grande'); alEditar({range:sheets['Destinos'].getRange(4,1)});
check(sheets['Destinos'].get(4,4)===true, 'destino nuevo queda Activo=✓');
check(sheets['Control'].get(1,2)===false && props.recarga, 'casilla Recargar: envía recarga y se desmarca sola');

console.log("\n5) setup por segunda vez"); const antes=JSON.stringify(c.d.slice(0,lastTextRow_(c,1))); setup(); check(JSON.stringify(c.d.slice(0,lastTextRow_(c,1)))===antes, "la Cinta queda idéntica (" + (lastTextRow_(c,1)-1) + " avisos)"); check(JSON.parse(doGet({parameter:{torre:"T2"}})).cinta.length===4, "T2 sigue viendo sus 4 avisos");

console.log('\n6) Caché de 60 s');
cacheOn = true;
const t1a = doGet({parameter:{torre:'T1'}});
R.set(2,2,'Expo cambiada a mano');                       // edición directa: sin alEditar no se ve aún
check(doGet({parameter:{torre:'T1'}}) === t1a, 'la segunda consulta usa la respuesta guardada');
alEditar({range:R.getRange(2,2)});
check(JSON.parse(doGet({parameter:{torre:'T1'}})).items[0].titulo === 'Expo cambiada a mano', 'al editar la Sheet se borra la caché y se ve el cambio');
submit({'Título':'Aviso nuevo','Texto del aviso':'x','Desde':now,'Hasta':later,'Torres':'T1','Prioridad':'Normal'});
check(JSON.parse(doGet({parameter:{torre:'T1'}})).items.some(x=>x.titulo==='Aviso nuevo'), 'al llegar un Form se borra la caché y aparece el aviso');
cacheOn = false;

console.log('\n7) Estado: solo torres reales y cada 2 min');
const est = () => sheets['Estado'].d.map(r=>r[0]);
cacheOn = true;
doGet({parameter:{torre:'XXX',ping:'1'}}); doGet({parameter:{torre:'1',ping:'1'}});
check(!est().includes('XXX') && !est().includes('1'), 'torres inventadas ("XXX", "1") no se anotan');
doGet({parameter:{torre:'T2',ping:'1'}});
const filasT2 = est().filter(x=>x==='T2').length;
const marca = sheets['Estado'].d.find(r=>r[0]==='T2')[1];
doGet({parameter:{torre:'T2',ping:'1'}});
check(filasT2===1 && sheets['Estado'].d.find(r=>r[0]==='T2')[1]===marca, 'T2 se anota una vez y no se reescribe en cada consulta');
cacheOn = false;

console.log('\n8) Errores del Form avisan por correo');
mails.length = 0;
global.DriveApp.getFileById = id => ({ setSharing(){ throw new Error('Tu organización no permite compartir con cualquiera'); }, getMimeType:()=> id.startsWith('pdf') ? 'application/pdf' : 'image/png' });
const rPdf = submit({'Título':'Menú PDF','Archivo':'https://drive.google.com/open?id=pdf1234567890123456789012345','Torres':'T1'});
check(/^ERROR: .*application\/pdf/.test(R.get(rPdf, R.d[0].indexOf('Tipo')+1)) && !R.get(rPdf, R.d[0].indexOf('URL')+1), 'un PDF queda marcado "ERROR" en la fila y no sale en pantalla');
const rImg = submit({'Título':'Foto','Archivo':'https://drive.google.com/open?id=img9234567890123456789012345','Torres':'T1'});
check(/^ERROR: .*compartir/.test(R.get(rImg, R.d[0].indexOf('Tipo')+1)), 'si Drive no deja compartir, queda el error en la fila');
check(mails.length===2 && mails[0].to==='mavillal@gmail.com' && /Menú PDF/.test(mails[0].subj), 'llegan 2 correos de alerta a mavillal@gmail.com: "'+(mails[0]||{}).subj+'"');

console.log('\n9) Horario nocturno y limpieza');
check(hora_('7:00')==='07:00' && hora_('00:00:00')==='00:00' && hora_('abc')==='', 'horas: "7:00"→07:00, "00:00:00"→00:00, texto→vacío');
const jn = JSON.parse(doGet({parameter:{torre:'T1'}}));
check(jn.noche && jn.noche.desde==='00:00' && jn.noche.hasta==='07:00', 'Control trae pantalla negra 00:00–07:00 por defecto');
check(sheets['Control'].d.some(r=>/correo/i.test(r[0]) && r[1]==='mavillal@gmail.com'), 'Control tiene "Correo para alertas"');
check(!R.d[0].includes('Idiomas') && !R.d[0].includes('Título PT') && !R.d[0].includes('Texto PT'), 'setup borra Idiomas, Título PT y Texto PT de las respuestas');
const cRow = sheets['Control'].d.findIndex(r=>/negra desde/i.test(r[0]))+1;
sheets['Control'].set(cRow,2,'');
check(JSON.parse(doGet({parameter:{torre:'T1'}})).noche===null, 'si se borra la hora, no hay pantalla negra');
console.log('\n' + (ok ? 'TODO OK' : 'HAY FALLAS'));
