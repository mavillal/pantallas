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
  setFontWeight(){return this;} setBackground(){return this;} setFontColor(){return this;} setFontSize(){return this;} setNumberFormat(){return this;}
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
eval(fs.readFileSync(process.argv[2],'utf8') + '\nObject.assign(global,{recargarPantallas,doGet,setup,onFormSubmit,alEditar,prepararCinta_,lastTextRow_,menuKm});');


let ok = true; const check=(cond,msg)=>{ console.log((cond?'  OK   ':'  FALLA ')+msg); if(!cond) ok=false; };
// Tu hoja Cinta tal como en la captura (Texto · Torres · Activo · Hasta)
sheets['Cinta'] = new Sheet('Cinta', [
  ['Texto','Torres','Activo','Hasta (opcional)'],
  ['Bienvenidos a San Alfonso del Mar','Todas',false,''],
  ['Felices Fiestas Patrias','Todas',false,''],
  ['Respete los horarios de piscina','Todas',true,''],
  ['Disfrute de las instalaciones de SAM T1','T1',true,''],
  ['Cuidado con el piso mojado T2','T2',true,'']]);
// Destinos de la v2.3 (sin columna km)
sheets['Destinos'] = new Sheet('Destinos', [
  ['Nombre en pantalla','Dirección (como en Google Maps)','Ícono (avión / auto)','Activo'],
  ['Aeropuerto SCL','Aeropuerto Internacional Arturo Merino Benítez, Pudahuel, Chile','avión','Sí'],
  ['Isla Negra','Casa Museo Isla Negra, El Quisco, Chile','auto','Sí']]);
sheets['Control'] = new Sheet('Control', [['Recargar',false],['Tel',''],['QR','']]);
sheets['Torres'] = new Sheet('Torres', [['Código','Nombre en pantalla'],['T1','Torre 1'],['T2','Torre 2']]);
sheets['Respuestas de formulario 1'] = new Sheet('Respuestas de formulario 1', [['Marca temporal','Título','URL','Tipo','Activo']]);

console.log('\nA) SIN correr setup (tu hoja tal cual, solo pegando el código nuevo)');
let j1 = JSON.parse(doGet({parameter:{torre:'T1'}}));
check(j1.cinta.map(x=>x.es).join(' / ')==='Respete los horarios de piscina / Disfrute de las instalaciones de SAM T1', 'Torre 1 ve: '+j1.cinta.map(x=>x.es).join(' / '));
check(!j1.cinta.some(x=>/T2/.test(x.es)), 'Torre 1 ya NO ve "Cuidado con el piso mojado T2"');
let j2 = JSON.parse(doGet({parameter:{torre:'T2'}}));
check(j2.cinta.map(x=>x.es).join(' / ')==='Respete los horarios de piscina / Cuidado con el piso mojado T2', 'Torre 2 ve: '+j2.cinta.map(x=>x.es).join(' / '));
check(j1.destinos.length===0 && /no tiene la columna/.test(j1.avisoDestinos), 'sin setup, la URL-API explica por qué no hay km: "'+j1.avisoDestinos+'"');

console.log('\nB) Corriendo setup');
setup();
check(JSON.stringify(sheets['Cinta'].d[0])===JSON.stringify(['Texto','Torres','Activo','Hasta (opcional)']), 'tu orden de columnas se respeta');
check(sheets['Cinta'].d[1][2]===false && sheets['Cinta'].d[3][2]===true, 'tus casillas Activo se respetan');
j1 = JSON.parse(doGet({parameter:{torre:'T1'}}));
check(j1.destinos.length===2 && j1.destinos.every(d=>d.km>0), 'distancias calculadas: '+j1.destinos.map(d=>d.nombre+' '+d.km+' km').join(', '));
check(j1.avisoDestinos==='', 'sin aviso de error cuando hay km');

console.log('\nC) Si Google Maps falla');
sheets['Destinos'].set(2,5,''); sheets['Destinos'].set(3,5,'');
const realMaps = global.Maps.newDirectionFinder;
let llamadasMaps = 0;
global.Maps.newDirectionFinder = () => { llamadasMaps++; throw new Error('Servicio invocado demasiadas veces en un día: route'); };
for (let i = 0; i < 5; i++) doGet({parameter:{torre:'T1'}});
check(llamadasMaps === 0, 'las consultas de los TV ya no llaman a Google Maps (no gastan cuota)');
menuKm();
j1 = JSON.parse(doGet({parameter:{torre:'T1'}}));
check(j1.destinos.length===0 && /demasiadas veces/.test(j1.avisoDestinos), 'la URL-API muestra el error real de Maps: "'+j1.avisoDestinos+'"');
sheets['Destinos'].set(2,5,120);
j1 = JSON.parse(doGet({parameter:{torre:'T1'}}));
check(j1.destinos.length===1 && j1.destinos[0].km===120, 'km escrito a mano aparece en pantalla aunque Maps falle');
global.Maps.newDirectionFinder = realMaps;

console.log('\nD) Aviso nuevo y Form en tu orden de columnas');
const c = sheets['Cinta']; const nr = lastTextRow_(c,1)+1;
c.set(nr,1,'Piscina cerrada'); alEditar({range:c.getRange(nr,1)});
check(c.get(nr,2)==='Todas' && c.get(nr,3)===true && c.get(nr,4)==='', 'al escribir: Torres=Todas, Activo=✓ en la columna C, Hasta vacío');
console.log('\n' + (ok ? 'TODO OK' : 'HAY FALLAS'));
