// Móvil de cada apostador: unirse, ver su carta secreta, apostar, decir "listo" y seguir la carrera.
import * as M from './motor.js?v=202611161655';
import { conectar, idPropio } from './red.js?v=202611161655';
import { Tablero, cartaHTML, caraHTML, esc } from './tablero.js?v=202611161655';
import { desbloquearAudio, sfx } from './sonido.js?v=202611161655';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ID = params.get('id') || idPropio();
const leer = k => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let red = null, S = null, misOpciones = null, miElegida = null, nombre = '';
let tablero = null, firmaTablero = '', ultimoPaso = 0, animando = false, colaPasos = [];
let eleccion = { c: null, tipo: 'ganador', cantidad: 10 };
let loca = { tipo: '', c: null, c2: null, cantidad: 10 };            // apuesta loca (opcional)
let miMedio = null;                                                   // { ronda, voto, directo } a mitad de carrera
let directo = { c: null, tipo: 'ganador', cantidad: 10 }, pasoDirecto = false;
let relojMedio = null;                                                // { quedan, t } para la cuenta atrás local
let deseo = null;   // lo que este móvil quiere: { ronda, apuesta, listo }
let latido = null, recibido = false, rondaVista = 0, faseVista = '';

$('iSala').value = (params.get('sala') || leer('estampida-sala') || '').toUpperCase();
$('iNombre').value = params.get('nombre') || leer('estampida-nombre') || '';
$('iSala').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };

$('bEntrar').onclick = entrar;
if (params.has('auto')) entrar();

async function entrar() {
  desbloquearAudio();
  const sala = $('iSala').value.trim().toUpperCase();
  nombre = $('iNombre').value.trim();
  if (sala.length !== 4) return error('El código de sala tiene 4 letras.');
  if (!nombre) return error('Pon tu nombre.');
  escribir('estampida-sala', sala); escribir('estampida-nombre', nombre);
  $('bEntrar').disabled = true; $('bEntrar').textContent = 'Conectando…';
  try {
    red = await conectar(sala, recibir);
  } catch {
    $('bEntrar').disabled = false; $('bEntrar').textContent = 'Entrar';
    return error('No se ha podido conectar. Revisa internet.');
  }
  $('sUnirse').classList.add('oculto');
  $('sJuego').classList.remove('oculto');
  $('miNombre').textContent = nombre;
  $('miSala').textContent = 'Sala ' + sala;
  aviso('Buscando la pantalla de la sala…');
  saludar();
  latido = setInterval(() => {
    if (!recibido) saludar(); else red.enviar({ t: 'latido', id: ID, deseo, medio: miMedio });
  }, 3000);
  addEventListener('pagehide', () => red?.enviar({ t: 'adios', id: ID }));
}
function saludar() { red.enviar({ t: 'hola', id: ID, nombre }); }
function error(t) { $('error').textContent = t; }
function aviso(t) { $('aviso').textContent = t || ''; $('aviso').classList.toggle('oculto', !t); }

function recibir(m) {
  if (!m || !m.t) return;
  if (m.para && m.para !== ID) return;
  switch (m.t) {
    case 'estado': alEstado(m); break;
    case 'privado': misOpciones = m.opciones || (m.carta ? [m.carta] : null); if (m.elegida === 0 || m.elegida === 1) miElegida = m.elegida; pintarSecreta(); break;
    case 'paso': colaPasos.push(m); procesarPasos(); break;
    case 'echado': echado(); break;
    case 'quien': saludar(); break;
    case 'reaccion': flotar(m.emoji, m.nombre); break;
  }
}

function echado() {
  clearInterval(latido);
  red?.cerrar();
  $('sJuego').classList.add('oculto');
  $('sEchado').classList.remove('oculto');
}

function yo() { return S?.jugadores.find(j => j.id === ID); }

function alEstado(s) {
  const primeraVez = !recibido;
  recibido = true;
  S = s;
  if (!yo()) { saludar(); return; }   // el PC aún no nos tiene (por ejemplo, se recargó)
  aviso(s.pausa ? '⏸ Carrera en pausa' : '');
  const firma = s.ronda + ':' + s.personajes.map(p => p.id).join();
  if (firma !== firmaTablero) {
    firmaTablero = firma;
    tablero = new Tablero($('campoMovil'), s.personajes, { sonido: false });
    ultimoPaso = 0; colaPasos = [];
    $('cartaMovil').innerHTML = ''; $('cartaMovil2').innerHTML = '';
  }
  if (s.ronda !== rondaVista) {
    rondaVista = s.ronda;
    deseo = null; miElegida = null;
    eleccion = { c: null, tipo: 'ganador', cantidad: Math.min(10, yo().puntos) };
    loca = { tipo: '', c: null, c2: null, cantidad: 10 };
    miMedio = null; pasoDirecto = false;
    pintarSecreta();
  }
  if (s.carrera && !animando && s.carrera.n !== ultimoPaso) {
    tablero.colocar(s.carrera.corredores);
    ultimoPaso = s.carrera.n;
    if (s.carrera.ultima) pintarCartaActual(s.carrera.ultima);
  }
  if (s.fase !== faseVista) {
    if (s.fase === 'carrera' && faseVista) { irA('pCarrera'); sfx('salida'); navigator.vibrate?.(200); }
    if (s.fase === 'resultado') { irA('pApostar'); resultadoSonido(); }
    if (s.fase === 'espera' && faseVista === 'resultado') irA('pApostar');
    faseVista = s.fase;
  }
  if (primeraVez && s.fase === 'carrera') irA('pCarrera');
  pintar();
  pintarMedio();
}

function resultadoSonido() {
  const r = S.resultados?.find(x => x.id === ID);
  if (!r) return;
  sfx(r.delta >= 0 ? 'victoria' : 'pierde');
  navigator.vibrate?.(r.delta >= 0 ? [100, 50, 100, 50, 300] : [400]);
}

async function procesarPasos() {
  if (animando) return;
  animando = true;
  while (colaPasos.length) {
    const p = colaPasos.shift();
    if (!tablero) continue;
    if (p.n !== ultimoPaso + 1) tablero.colocar(p.corredores);           // nos perdimos algo: sincronizar
    else {
      if (p.carta) pintarCartaActual(p.carta);
      avisosPaso(p);
      tablero.velocidad = colaPasos.length ? 4 : 1;
      await tablero.animar(p.foto ? p.eventos.filter(e => e.e !== 'gana') : p.eventos);
      tablero.colocar(p.corredores);
    }
    ultimoPaso = p.n;
    pintarMiCorredor(p.corredores);
    $('infoCarrera').textContent = `${p.restantes} cartas por salir${p.prorroga ? ' · PRÓRROGA' : ''}`;
  }
  animando = false;
}

function pintarCartaActual(carta) {
  const h = cartaHTML(carta, S.personajes, 'entra');
  $('cartaMovil').innerHTML = h; $('cartaMovil2').innerHTML = h;
}

function pintarSecreta() {
  if (!S || !misOpciones) { $('misCartas').innerHTML = ''; return; }
  const vistas = [...document.querySelectorAll('#misCartas .voltear.volteada')].map(v => Number(v.dataset.i));
  $('misCartas').innerHTML = misOpciones.map((c, i) => `
    <div class="opcion-secreta ${miElegida === i ? 'elegida' : miElegida !== null ? 'descartada' : ''}">
      <div class="voltear ${vistas.includes(i) || miElegida !== null ? 'volteada' : ''}" data-i="${i}">
        <div class="cara-a"><div class="dorso">TOCA<br>PARA VER</div></div>
        <div class="cara-b">${cartaHTML(c, S.personajes)}</div>
      </div>
      <button class="${miElegida === i ? 'primario' : ''}" data-elige="${i}">${miElegida === i ? '✅ Elegida' : 'Elegir esta'}</button>
    </div>`).join('');
}
$('misCartas').onclick = e => {
  const v = e.target.closest('.voltear');
  if (v) { v.classList.toggle('volteada'); sfx('carta'); return; }
  const b = e.target.closest('[data-elige]');
  if (!b || yo()?.listo) return;
  miElegida = Number(b.dataset.elige);
  deseo = { ...(deseo || { ronda: S.ronda, listo: false }), elegida: miElegida };
  red.enviar({ t: 'deseo', id: ID, deseo });
  sfx('levanta'); navigator.vibrate?.(40);
  pintarSecreta();
};

// ---------- pintar ----------
function pintar() {
  const j = yo(); if (!j) return;
  $('misPuntos').textContent = j.puntos;
  const f = S.fase;
  const enEspera = f === 'espera' || f === 'cuenta';
  $('apEspera').classList.toggle('oculto', !enEspera || j.espectador);
  $('apEspectador').classList.toggle('oculto', !(j.espectador && f !== 'resultado'));
  $('apCarrera').classList.toggle('oculto', f !== 'carrera' || j.espectador);
  $('apResultado').classList.toggle('oculto', f !== 'resultado');
  pintarSecreta();

  // elegir corredor
  if (enEspera && S.cuotas) {
    $('elegir').innerHTML = S.personajes.map((p, i) => `
      <button class="opcion ${eleccion.c === i ? 'activo' : ''}" data-c="${i}" style="--color:${p.color}">
        <div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div>
        <b>${esc(p.nombre)}</b>
        <span class="cuota">${eleccion.tipo === 'podio' ? '🥈 x' + S.cuotas.podio[i] : '🏆 x' + S.cuotas.ganador[i]}</span>
      </button>`).join('');
    const max = Math.max(j.puntos, 1);
    const min = Math.min(M.APUESTA_MIN, max);
    $('rango').min = min; $('rango').max = max;
    eleccion.cantidad = Math.max(min, Math.min(eleccion.cantidad, max));
    $('rango').value = eleccion.cantidad;
    $('cant').textContent = eleccion.cantidad;
    document.querySelectorAll('.tipo').forEach(b => b.classList.toggle('activo', b.dataset.tipo === eleccion.tipo));
    if (eleccion.c !== null) {
      const cuota = S.cuotas[eleccion.tipo][eleccion.c];
      $('posible').innerHTML = `Si aciertas ganas <b class="mas">+${Math.round(eleccion.cantidad * (cuota - 1))}</b> · si fallas pierdes <b class="menos">−${eleccion.cantidad}</b>`;
    } else $('posible').textContent = 'Elige un corredor';
    $('bListo').disabled = eleccion.c === null || j.puntos <= 0;
    $('formApuesta').classList.toggle('oculto', j.listo);
    $('yaListo').classList.toggle('oculto', !j.listo);
    const act = S.jugadores.filter(x => x.conectado && !x.espectador);
    const faltan = act.filter(x => !x.listo).map(x => x.nombre);
    $('esperandoA').textContent = f === 'cuenta' ? '¡Todos listos! Empieza en ' + S.cuenta + '…'
      : faltan.length ? 'Esperando a: ' + faltan.join(', ') : '';
    $('resumen').innerHTML = resumenApuesta(eleccion) + resumenExtra(j);
    pintarLoca(j);
  }
  if (f === 'carrera' || f === 'resultado') {
    const ap = j.apuesta;
    $('resumenCarrera').innerHTML = ap ? resumenApuesta(ap) + resumenExtra(j) : resumenExtra(j);
  }
  if (f === 'resultado') {
    const r = S.resultados?.find(x => x.id === ID);
    const g = S.personajes[S.carrera.clasificacion[0]];
    if (r) {
      $('resGrande').innerHTML = `<span class="${r.delta >= 0 ? 'mas' : 'menos'}">${r.delta >= 0 ? '+' : ''}${r.delta}</span>`;
      const det = (r.detalle || []).map(d => `<div class="linea-ap"><span>${esc(d.texto)}</span><b class="${d.delta >= 0 ? 'mas' : 'menos'}">${d.delta >= 0 ? '+' : ''}${d.delta}</b></div>`).join('');
      $('resTexto').innerHTML = `${r.delta >= 0 ? '¡Ganas!' : 'Pierdes…'} Ganó <b>${esc(g.nombre)}</b> ${g.emoji}. Ahora tienes <b>${j.puntos} 🪙</b>.${(j.racha || 0) >= 2 ? ` 🔥 ¡${j.racha} carreras seguidas ganando!` : ''}<div class="resumen-lista">${det}</div>`;
    } else {
      $('resGrande').textContent = g.emoji;
      $('resTexto').innerHTML = `Ganó <b>${esc(g.nombre)}</b>. No apostaste en esta carrera.`;
    }
  }
  // cartas
  const firma = S.ronda + ':' + S.publicas.map(c => c.id).join();
  if ($('mazoMovil').dataset.firma !== firma) {
    $('mazoMovil').dataset.firma = firma;
    $('mazoMovil').innerHTML = S.publicas.slice().sort((a, b) => (a.c ?? 9) - (b.c ?? 9)).map(c => cartaHTML(c, S.personajes, 'mini')).join('');
  }
  // ranking
  $('ranking').innerHTML = S.jugadores.slice().sort((a, b) => b.puntos - a.puntos)
    .map(x => `<li class="${x.id === ID ? 'yo' : ''}"><span>${esc(x.nombre)}${x.conectado ? '' : ' 📴'}</span><b>${x.puntos} 🪙</b></li>`).join('');
  if ((f === 'carrera' || f === 'resultado') && S.carrera && !animando) pintarMiCorredor(S.carrera.corredores);
  if (f === 'carrera' && S.carrera) $('infoCarrera').textContent = `${S.carrera.restantes} cartas por salir${S.carrera.prorroga ? ' · PRÓRROGA' : ''}`;
}

function resumenApuesta(a) {
  if (a.c === null || a.c === undefined) return '';
  const p = S.personajes[a.c];
  const cuota = a.cuota ?? S.cuotas[a.tipo][a.c];
  return `<div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div>
    <div><div class="suave pequeno">Tu apuesta</div><b>${a.cantidad} 🪙 a que ${esc(p.nombre)} ${a.tipo === 'podio' ? 'queda 1.º o 2.º' : 'gana'}</b><div class="suave pequeno">cuota x${cuota}</div></div>`;
}

// ---------- controles ----------
$('elegir').onclick = e => {
  const b = e.target.closest('.opcion'); if (!b) return;
  eleccion.c = Number(b.dataset.c); sfx('paso'); pintar();
};
document.querySelectorAll('.tipo').forEach(b => b.onclick = () => { eleccion.tipo = b.dataset.tipo; pintar(); });
$('rango').oninput = e => { eleccion.cantidad = Number(e.target.value); pintar(); };
$('menos').onclick = () => { eleccion.cantidad -= 5; pintar(); };
$('mas').onclick = () => { eleccion.cantidad += 5; pintar(); };
document.querySelector('.rapidas').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  eleccion.cantidad = b.dataset.v === 'todo' ? yo().puntos : Number(b.dataset.v); pintar();
};
$('bListo').onclick = () => {
  if (eleccion.c === null) return;
  if (misOpciones?.length && miElegida === null) { toast('🤫 Primero <b>elige una</b> de tus dos cartas secretas'); navigator.vibrate?.(150); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (loca.tipo && !locaLista()) { toast('🤪 Completa la <b>apuesta loca</b> o elige «Ninguna»'); navigator.vibrate?.(150); return; }
  deseo = { ronda: S.ronda, apuesta: { c: eleccion.c, tipo: eleccion.tipo, cantidad: eleccion.cantidad }, loca: locaLista() ? { tipo: loca.tipo, c: loca.c, c2: loca.c2, cantidad: loca.cantidad } : null, listo: true, elegida: miElegida };
  red.enviar({ t: 'deseo', id: ID, deseo });
  sfx('levanta'); navigator.vibrate?.(60);
};
$('bCambiar').onclick = () => { if (deseo) deseo.listo = false; red.enviar({ t: 'deseo', id: ID, deseo: deseo || { ronda: S.ronda, listo: false } }); };

function irA(p) {
  document.querySelectorAll('.pestana').forEach(x => x.classList.toggle('oculto', x.id !== p));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('activo', b.dataset.p === p));
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) irA(b.dataset.p); };

// ---------- mejoras de la carrera en el móvil ----------
const REACCIONES = ['👏', '🔥', '😱', '😂', '🐢', '💸', '🙏', '😡'];
document.querySelectorAll('[data-reacciones]').forEach(z => {
  z.innerHTML = REACCIONES.map(e => `<button data-e="${e}">${e}</button>`).join('');
  z.onclick = ev => {
    const b = ev.target.closest('button'); if (!b || !red) return;
    red.enviar({ t: 'reaccion', id: ID, emoji: b.dataset.e });
    flotar(b.dataset.e, 'Tú');
    b.disabled = true; setTimeout(() => (b.disabled = false), 1200);
  };
});

function flotar(emoji, quien) {
  const r = document.createElement('div');
  r.className = 'flota';
  r.style.left = (10 + Math.random() * 80) + '%';
  r.innerHTML = `<span>${emoji}</span><small>${esc(quien || '')}</small>`;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 2600);
}

let tToast = null;
function toast(html) {
  $('toast').innerHTML = html;
  $('toast').classList.remove('oculto', 'entra'); void $('toast').offsetWidth; $('toast').classList.add('entra');
  clearTimeout(tToast); tToast = setTimeout(() => $('toast').classList.add('oculto'), 3200);
}

function avisosPaso(p) {
  const j = yo(); if (!j || !S) return;
  if (p.empujon != null) { toast(`📣 ¡El público empuja a <b>${esc(S.personajes[p.empujon].nombre)}</b>!`); navigator.vibrate?.(150); }
  if (p.foto) { toast('📸 ¡FOTO FINISH! Mirad la pantalla…'); navigator.vibrate?.([60, 60, 60, 60, 60, 60, 300]); return; }
  if (p.carta?.deId === ID) { toast('🤫 ¡Ha salido <b>tu carta secreta</b>!'); navigator.vibrate?.([80, 60, 80, 60, 200]); }
  const mio = j.apuesta ? j.apuesta.c : null;
  if (mio === null) return;
  const nombre = S.personajes[mio].nombre;
  for (const e of p.eventos) {
    if ((e.e === 'cae' || e.e === 'lesion') && e.c === mio) { toast(`😱 ¡${esc(nombre)} se ha caído!`); navigator.vibrate?.([300, 100, 300]); break; }
    if (e.e === 'gana') { const gana = e.c === mio; toast(gana ? `🏆 ¡GANA ${esc(nombre)}!` : '😭 No ha ganado tu corredor'); navigator.vibrate?.(gana ? [100, 50, 100, 50, 100, 50, 400] : [500]); break; }
    if (e.e === 'portal' && e.c === mio) { toast(`🌀 ¡${esc(nombre)} se teletransporta!`); navigator.vibrate?.(120); break; }
    if (e.e === 'meteorito' && e.c === mio) { toast(e.elimina ? `☄️ ¡Un meteorito ha eliminado a ${esc(nombre)}!` : `☄️ ¡El meteorito ha rozado a ${esc(nombre)}!`); navigator.vibrate?.([600, 100, 600]); break; }
    if (e.e === 'abduce' && e.c === mio) { toast(`🛸 ¡Un ovni se ha llevado a ${esc(nombre)}! Vuelve en 3 cartas`); navigator.vibrate?.([100, 100, 100, 100, 400]); break; }
    if (e.e === 'devuelve' && e.c === mio) { toast(`🛸 ¡El ovni suelta a ${esc(nombre)} 6 casillas más adelante!`); navigator.vibrate?.(200); break; }
    if (e.e === 'bomba' && e.c === mio) { toast(`💣 ¡${esc(nombre)} lleva una bomba!`); navigator.vibrate?.([100, 300, 100]); break; }
    if (e.e === 'explota' && (e.c === mio || e.a.includes(mio))) { toast(`💥 ¡La bomba le ha pillado a ${esc(nombre)}!`); navigator.vibrate?.([500]); break; }
    if (e.e === 'mediavuelta' && e.c === mio) { toast(`↩️ ¡${esc(nombre)} se ha dado la vuelta! Corre hacia atrás`); navigator.vibrate?.(200); break; }
  }
}

function pintarMiCorredor(corredores) {
  const j = yo(); if (!j || !S || !j.apuesta || !corredores) { $('miCorredor').innerHTML = $('miCorredor2').innerHTML = ''; return; }
  const c = j.apuesta.c;
  const orden = [0, 1, 2, 3].sort((a, b) => ((corredores[a].fuera ? 1 : 0) - (corredores[b].fuera ? 1 : 0)) || (corredores[b].pos - corredores[a].pos) || (corredores[a].marca - corredores[b].marca));
  const puesto = orden.indexOf(c) + 1;
  const r = corredores[c], p = S.personajes[c];
  const estado = r.fuera ? ' · ☠️ eliminado' : r.abducido ? ' · 🛸 en el ovni' : r.bomba ? ' · 💣 con bomba' : r.reves ? ' · ↩️ de espaldas'
    : r.caido ? ' · 💫 en el suelo' : r.sancion > 0 ? ' · 🟨 castigado' : '';
  const bien = j.apuesta.tipo === 'podio' ? puesto <= 2 : puesto === 1;
  const html = `<span class="puesto ${bien ? 'bien' : 'mal'}">${puesto}.º</span><span>${esc(p.emoji)} <b>${esc(p.nombre)}</b> · casilla ${Math.min(r.pos, 12)} de 12${estado}</span>`;
  $('miCorredor').innerHTML = html; $('miCorredor2').innerHTML = html;
}

// ---------- apuesta loca ----------
const maxLoca = () => Math.max(0, (yo()?.puntos || 0) - eleccion.cantidad);
const locaLista = () => !!loca.tipo && maxLoca() > 0 && (loca.tipo === 'paliza' || loca.tipo === 'prorroga' || (loca.c !== null && (loca.tipo !== 'exacta' || (loca.c2 !== null && loca.c2 !== loca.c))));

function filaPj(etq, attr, elegido, cuotaDe, deshabilitado = () => false) {
  return `<div class="fila-pj"><div class="etq">${etq}</div>${S.personajes.map((p, i) => `
    <button class="pj-mini ${elegido === i ? 'activo' : ''}" data-${attr}="${i}" style="--color:${p.color}" ${deshabilitado(i) ? 'disabled' : ''}>
      <span class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</span><span>${esc(p.nombre)}</span>${cuotaDe ? `<span class="cuota">x${cuotaDe(i)}</span>` : ''}
    </button>`).join('')}</div>`;
}

function pintarLoca(j) {
  document.querySelectorAll('.loca').forEach(b => b.classList.toggle('activo', b.dataset.loca === loca.tipo));
  const caja = $('locaDetalle');
  if (!loca.tipo || !S.cuotas) { caja.innerHTML = ''; return; }
  const max = maxLoca();
  if (max <= 0) { caja.innerHTML = '<div class="loca-detalle"><p class="suave">No te quedan monedas para otra apuesta: baja la principal.</p></div>'; return; }
  loca.cantidad = Math.max(Math.min(M.APUESTA_MIN, max), Math.min(loca.cantidad, max));
  let h = '';
  if (loca.tipo === 'ultimo') h += filaPj('¿Quién llega el último?', 'lc', loca.c, i => S.cuotas.ultimo[i]);
  if (loca.tipo === 'exacta') {
    h += filaPj('1.º puesto', 'lc', loca.c, null);
    h += filaPj('2.º puesto', 'lc2', loca.c2, null, i => i === loca.c);
  }
  if (loca.tipo === 'paliza') h += `<p class="suave">El ganador llega con <b>${M.PALIZA} o más casillas</b> de ventaja sobre el segundo.</p>`;
  if (loca.tipo === 'prorroga') h += '<p class="suave">Se acaban las cartas sin que nadie llegue y hay <b>prórroga</b>.</p>';
  const cuota = locaLista() ? M.cuotaDe(S.cuotas, loca) : null;
  h += `<div class="cant-mini"><button data-lm="-5">−</button><b>${loca.cantidad} 🪙</b><button data-lm="5">+</button></div>`;
  h += `<div class="posible">${cuota ? `Cuota <b>x${cuota}</b> · si aciertas <b class="mas">+${Math.round(loca.cantidad * (cuota - 1))}</b> · si fallas <b class="menos">−${loca.cantidad}</b>` : 'Elige para ver la cuota'}</div>`;
  caja.innerHTML = `<div class="loca-detalle">${h}</div>`;
}
$('locaTipos').onclick = e => {
  const b = e.target.closest('.loca'); if (!b) return;
  loca.tipo = b.dataset.loca; loca.c = null; loca.c2 = null;
  sfx('paso'); pintar();
};
$('locaDetalle').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.lc !== undefined) { loca.c = Number(b.dataset.lc); if (loca.c2 === loca.c) loca.c2 = null; }
  if (b.dataset.lc2 !== undefined) loca.c2 = Number(b.dataset.lc2);
  if (b.dataset.lm !== undefined) loca.cantidad += Number(b.dataset.lm);
  sfx('paso'); pintar();
};

function resumenExtra(j) {
  const nombres = S.personajes.map(p => p.nombre);
  const lineas = [];
  const lo = j.loca || (S.fase === 'espera' || S.fase === 'cuenta' ? (locaLista() ? loca : null) : null);
  if (lo) lineas.push(`🤪 ${lo.cantidad} 🪙 a que ${esc(M.textoApuesta(lo, nombres))}${lo.cuota ? ` (x${lo.cuota})` : ''}`);
  if (j.directo) lineas.push(`⚡ En directo: ${j.directo.cantidad} 🪙 a que ${esc(M.textoApuesta(j.directo, nombres))} (x${j.directo.cuota})`);
  return lineas.map(l => `<div class="resumen"><div>${l}</div></div>`).join('');
}

// ---------- mitad de carrera: votación del empujón y apuestas en directo ----------
const libres = j => j.puntos - (j.apuesta?.cantidad || 0) - (j.loca?.cantidad || 0) - (j.directo?.cantidad || 0);
function enviarMedio() {
  red.enviar({ t: 'medio', id: ID, medio: miMedio });
}
function pintarMedio() {
  const caja = $('medioM');
  const m = S?.medio, j = yo();
  if (!m) { pasoDirecto = false; relojMedio = null; }
  // tras apostar en directo (o decir «paso») la ventana se cierra y se sigue viendo la carrera
  if (!m || S.fase !== 'carrera' || !j || (m.fase === 'directo' && pasoDirecto)) { caja.classList.add('oculto'); return; }
  if (!miMedio || miMedio.ronda !== S.ronda) miMedio = { ronda: S.ronda, voto: null, directo: null };
  const nuevaFase = caja.dataset.fase !== m.fase || caja.classList.contains('oculto');
  if (nuevaFase && (m.fase === 'voto' || m.fase === 'directo')) { navigator.vibrate?.([120, 60, 120]); sfx('silbato'); }
  caja.classList.remove('oculto');
  caja.dataset.fase = m.fase;
  relojMedio = { quedan: m.quedan, t: Date.now() };
  // Solo se redibuja si cambia algo (no por la cuenta atrás ni por los votos de otros): así no se pierden toques.
  const firma = JSON.stringify([S.ronda, m.fase, m.elegido, miMedio.voto, directo, j.directo, libres(j), pasoDirecto]);
  if (caja._firma === firma) {
    caja.querySelectorAll('[data-voto]').forEach(b => { const s = b.querySelector('small'); if (s) s.textContent = `${m.votos[b.dataset.voto]} 🗳️`; });
    return;
  }
  caja._firma = firma;
  const P = S.personajes;
  const vivo = i => S.carrera && !S.carrera.corredores[i].fuera && !S.carrera.corredores[i].abducido;
  let h = '';
  if (m.fase === 'voto') {
    h = `<h2>📣 ¿A quién empuja el público?</h2><div class="m-reloj" id="mReloj">${m.quedan}</div>
      <p class="suave">El más votado avanza <b>2 casillas</b> (y se levanta si estaba en el suelo).</p>
      <div class="votar">${P.map((p, i) => `<button data-voto="${i}" class="${miMedio.voto === i ? 'activo' : ''}" style="--color:${p.color}" ${vivo(i) ? '' : 'disabled'}>
        <span class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</span><b>${esc(p.nombre)}</b><small>${m.votos[i]} 🗳️</small></button>`).join('')}</div>
      <p>${miMedio.voto !== null ? `Has votado a <b>${esc(P[miMedio.voto].nombre)}</b>. Puedes cambiar hasta que acabe.` : 'Toca a quien quieras empujar.'}</p>`;
  } else if (m.fase === 'nadie') {
    h = '<h2>🤷 Nadie ha votado</h2><p>¡Seguimos!</p>';
  } else if (m.fase === 'empujon') {
    const p = P[m.elegido];
    h = `<h2>📣 ¡Empujón para ${esc(p.nombre)}!</h2><div class="votar"><button class="activo" style="--color:${p.color};grid-column:1/-1"><span class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</span><b>${esc(p.nombre)}</b><small>${m.votos[m.elegido]} votos</small></button></div>`;
  } else if (m.fase === 'directo') {
    const max = libres(j);
    if (j.directo) {
      h = `<h2>⚡ Apuestas en directo</h2><div class="m-reloj" id="mReloj">${m.quedan}</div><p>✅ Has apostado <b>${j.directo.cantidad} 🪙</b> a que ${esc(M.textoApuesta(j.directo, P.map(x => x.nombre)))} (x${j.directo.cuota}).</p>`;
      setTimeout(() => { if (S?.medio?.fase === 'directo') { pasoDirecto = true; pintarMedio(); } }, 1800);
    } else if (max < 1) {
      h = `<h2>⚡ Apuestas en directo</h2><p class="suave">No te quedan monedas libres para apostar ahora.</p>`;
      setTimeout(() => { pasoDirecto = true; pintarMedio(); }, 1800);
    } else {
      directo.cantidad = Math.max(Math.min(M.APUESTA_MIN, max), Math.min(directo.cantidad, max));
      const cu = m.cuotas[directo.tipo];
      if (directo.c !== null && !cu[directo.c]) directo.c = null;
      h = `<h2>⚡ ¡Apuestas en directo!</h2><div class="m-reloj" id="mReloj">${m.quedan}</div>
        <p class="suave">Cuotas de cómo va la carrera ahora mismo. Tienes <b>${max} 🪙</b> libres.</p>
        <div class="tipos"><button class="tipo ${directo.tipo === 'ganador' ? 'activo' : ''}" data-dt="ganador">🏆 Gana</button><button class="tipo ${directo.tipo === 'podio' ? 'activo' : ''}" data-dt="podio">🥈 Podio</button></div>
        <div class="votar">${P.map((p, i) => `<button data-dc="${i}" class="${directo.c === i ? 'activo' : ''}" style="--color:${p.color}" ${cu[i] ? '' : 'disabled'}>
          <span class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</span><b>${esc(p.nombre)}</b><span class="cuota">${cu[i] ? 'x' + cu[i] : '—'}</span></button>`).join('')}</div>
        <div class="cant-mini" style="margin-top:12px"><button data-dm="-5">−</button><b>${directo.cantidad} 🪙</b><button data-dm="5">+</button></div>
        <button class="primario grande" data-dapostar ${directo.c === null ? 'disabled' : ''}>${directo.c === null ? 'Elige un corredor' : `Apostar ${directo.cantidad} 🪙 · ganas +${Math.round(directo.cantidad * (cu[directo.c] - 1))}`}</button>
        <button class="paso" data-dpaso>Paso, no apuesto</button>`;
    }
  }
  caja.innerHTML = h;
}
$('medioM').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.disabled || !S?.medio) return;
  if (b.dataset.voto !== undefined) {
    miMedio.voto = Number(b.dataset.voto); enviarMedio();
    sfx('levanta'); navigator.vibrate?.(50);
  }
  if (b.dataset.dt) directo.tipo = b.dataset.dt;
  if (b.dataset.dc !== undefined) directo.c = Number(b.dataset.dc);
  if (b.dataset.dm !== undefined) directo.cantidad += Number(b.dataset.dm);
  if (b.dataset.dapostar !== undefined && directo.c !== null) {
    miMedio.directo = { c: directo.c, tipo: directo.tipo, cantidad: directo.cantidad }; enviarMedio();
    sfx('levanta'); navigator.vibrate?.(80);
    toast('⚡ Apuesta en directo enviada');
  }
  if (b.dataset.dpaso !== undefined) pasoDirecto = true;
  sfx('paso');
  pintarMedio();
};
// cuenta atrás suave entre mensajes del PC
setInterval(() => {
  const r = $('mReloj'); if (!r || !relojMedio) return;
  const s = Math.max(0, relojMedio.quedan - Math.floor((Date.now() - relojMedio.t) / 1000));
  r.textContent = s; r.classList.toggle('poco', s <= 3);
}, 250);
