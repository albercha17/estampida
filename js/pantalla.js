// Pantalla del PC: es el "árbitro". Guarda el estado de la partida y lo envía a los móviles.
import * as M from './motor.js?v=202611161219';
import { conectar, codigoSala, cargarPersonajes, modoLocal } from './red.js?v=202611161219';
import { Tablero, cartaHTML, caraHTML, esc, espera, confeti } from './tablero.js?v=202611161219';
import { sfx, desbloquearAudio } from './sonido.js?v=202611161219';
import { cargarNarrador, precargar, decir, callar, ambiente, rugido } from './narrador.js?v=202611161219';
import { SEGUNDOS_ENTRE_CARTAS } from './config.js?v=202611161219';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RAPIDO = params.has('rapido');          // para pruebas: sin esperas
const GUARDADO = 'estampida-anfitrion';
const REACCIONES = ['👏', '🔥', '😱', '😂', '🐢', '💸', '🙏', '😡'];

let todos = [];            // catálogo de personajes
let red = null;
let tablero = null;
let Tablero3D = null, usar3D = false;
let voz = !RAPIDO, sonido = !RAPIDO;
const P = {                // estado de la partida
  sala: '', fase: 'espera', ronda: 0,
  personajes: [], publicas: [], reserva: [], cuotas: null,
  jugadores: {}, echados: [], ganadores: [],
  carrera: null, ultima: null, n: 0, resultados: null, pausa: false, cuenta: null,
};

// ---------- guardar / recuperar (si se recarga la pantalla) ----------
function guardar() {
  try {
    const j = {};
    for (const [id, x] of Object.entries(P.jugadores)) j[id] = { nombre: x.nombre, puntos: x.puntos };
    localStorage.setItem(GUARDADO, JSON.stringify({ sala: P.sala, ronda: P.ronda, jugadores: j, echados: P.echados, ganadores: P.ganadores }));
  } catch {}
}
function recuperar() {
  try {
    const d = JSON.parse(localStorage.getItem(GUARDADO) || 'null');
    if (!d || params.has('nueva')) return;
    P.sala = d.sala; P.ronda = d.ronda || 0; P.echados = d.echados || []; P.ganadores = d.ganadores || [];
    for (const [id, x] of Object.entries(d.jugadores || {})) {
      P.jugadores[id] = { id, nombre: x.nombre, puntos: x.puntos, conectado: false, ultimo: 0, carta: null, apuesta: null, listo: false, espectador: false };
    }
  } catch {}
}

// ---------- estado público que reciben los móviles ----------
function estadoPublico() {
  const verApuestas = P.fase !== 'espera' && P.fase !== 'cuenta';
  return {
    t: 'estado', fase: P.fase, ronda: P.ronda, sala: P.sala,
    personajes: P.personajes, publicas: P.publicas, cuotas: P.cuotas,
    jugadores: Object.values(P.jugadores).map(j => ({
      id: j.id, nombre: j.nombre, puntos: j.puntos, listo: j.listo, conectado: j.conectado,
      espectador: j.espectador, apostado: !!j.apuesta, apuesta: verApuestas ? j.apuesta : null,
    })),
    carrera: P.carrera ? {
      corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, n: P.n,
      ultima: P.ultima, prorroga: P.carrera.prorroga, clasificacion: P.carrera.clasificacion,
    } : null,
    resultados: P.resultados, pausa: P.pausa, cuenta: P.cuenta, ganadores: P.ganadores.slice(-8),
  };
}
function difundir() { red?.enviar(estadoPublico()); pintar(); }
function enviarPrivado(j) { if (j.carta) red?.enviar({ t: 'privado', para: j.id, carta: j.carta }); }

// ---------- tablero (3D si se puede) ----------
function crearTablero() {
  tablero?.destruir?.();
  const raiz = $('campo');
  raiz.className = '';
  if (usar3D) {
    try { tablero = new Tablero3D(raiz, P.personajes, { sonido }); }
    catch (e) { console.warn('Sin 3D:', e); usar3D = false; }
  }
  if (!usar3D) { raiz.innerHTML = ''; tablero = new Tablero(raiz, P.personajes, { sonido }); }
  tablero.velocidad = RAPIDO ? 20 : 1;
}

// ---------- cuotas: se recalculan según cuántas cartas secretas habrá ----------
let tCuotas = null;
function recalcularCuotas(inmediato = false) {
  const hacer = () => {
    const n = Math.max(1, Object.values(P.jugadores).filter(j => j.conectado && !j.espectador).length);
    P.cuotas = M.calcularCuotas(P.publicas, RAPIDO ? 400 : 3000, Math.random, n);
    P.cuotasCon = n;
    difundir();
  };
  clearTimeout(tCuotas);
  if (inmediato) hacer(); else tCuotas = setTimeout(hacer, 400);
}

// ---------- preparar carrera ----------
function nuevaCarrera() {
  P.ronda++;
  P.personajes = M.barajar(todos).slice(0, 4);
  const { publicas, reserva } = M.prepararMazo();
  P.publicas = publicas; P.reserva = reserva;
  P.fase = 'espera'; P.carrera = null; P.ultima = null; P.n = 0; P.resultados = null; P.pausa = false; P.cuenta = null;
  for (const j of Object.values(P.jugadores)) {
    if (j.puntos < M.APUESTA_MIN) j.puntos = M.RESCATE;
    j.apuesta = null; j.listo = false; j.espectador = false;
    j.carta = P.reserva.pop();
  }
  recalcularCuotas(true);
  crearTablero();
  precargar(P.personajes.map(p => p.id));
  $('historial').innerHTML = '';
  $('cartaActual').innerHTML = '<div class="dorso">ESTAMPIDA</div>';
  $('vResultado').classList.add('oculto');
  guardar();
  difundir();
  Object.values(P.jugadores).forEach(enviarPrivado);
}

// ---------- mensajes de los móviles ----------
const ultimaReaccion = {};
function recibir(m) {
  if (!m || !m.id) return;
  if (m.t === 'estado' || m.t === 'paso' || m.t === 'privado') return;
  if (P.echados.includes(m.id)) { red.enviar({ t: 'echado', para: m.id }); return; }
  let j = P.jugadores[m.id];
  if (m.t === 'hola') {
    const nombre = String(m.nombre || 'Anónimo').trim().slice(0, 16) || 'Anónimo';
    const nuevo = !j;
    if (!j) {
      j = P.jugadores[m.id] = { id: m.id, nombre, puntos: M.PUNTOS_INICIALES, conectado: true, ultimo: Date.now(), carta: null, apuesta: null, listo: false, espectador: false };
      sfx('cuenta');
    }
    const estaba = j.conectado;
    j.nombre = nombre; j.conectado = true; j.ultimo = Date.now();
    if (P.fase === 'espera' || P.fase === 'cuenta') { if (!j.carta) j.carta = P.reserva.pop(); }
    else if (!j.apuesta) j.espectador = true;
    if (P.fase === 'cuenta') cancelarCuenta();
    if ((nuevo || !estaba) && P.fase === 'espera') recalcularCuotas();
    guardar();
    difundir();
    enviarPrivado(j);
    return;
  }
  if (!j) { red.enviar({ t: 'quien', para: m.id }); return; }
  j.ultimo = Date.now();
  if (!j.conectado) { j.conectado = true; if (P.fase === 'espera') recalcularCuotas(); difundir(); }
  if (m.t === 'adios') { j.conectado = false; comprobarInicio(); difundir(); return; }
  if (m.t === 'reaccion' && REACCIONES.includes(m.emoji)) {
    if (Date.now() - (ultimaReaccion[j.id] || 0) < 1200) return;
    ultimaReaccion[j.id] = Date.now();
    mostrarReaccion(j.nombre, m.emoji);
    red.enviar({ t: 'reaccion', nombre: j.nombre, emoji: m.emoji });
    return;
  }
  // El móvil manda lo que quiere (apuesta y si está listo) al cambiarlo y en cada latido,
  // así que si se pierde un mensaje se arregla solo en el siguiente latido.
  if ((m.t === 'deseo' || m.t === 'latido') && m.deseo) aplicarDeseo(j, m.deseo);
}

function aplicarDeseo(j, d) {
  if (P.fase !== 'espera' && P.fase !== 'cuenta') return;
  if (j.espectador || d.ronda !== P.ronda) return;
  const antes = JSON.stringify([j.apuesta, j.listo]);
  const a = d.apuesta;
  if (a && !(j.listo && d.listo)) {
    const c = Number(a.c), cant = Math.floor(Number(a.cantidad));
    const tipo = a.tipo === 'podio' ? 'podio' : 'ganador';
    if (c >= 0 && c < 4 && cant >= Math.min(M.APUESTA_MIN, j.puntos) && cant <= j.puntos && cant > 0) {
      const igual = j.apuesta && j.apuesta.c === c && j.apuesta.tipo === tipo && j.apuesta.cantidad === cant;
      if (!igual) j.apuesta = { c, tipo, cantidad: cant, cuota: P.cuotas[tipo][c] };
    }
  }
  j.listo = !!d.listo && !!j.apuesta;
  if (JSON.stringify([j.apuesta, j.listo]) !== antes) { comprobarInicio(); difundir(); }
}

function mostrarReaccion(nombre, emoji) {
  const r = document.createElement('div');
  r.className = 'reaccion';
  r.style.left = (8 + Math.random() * 84) + '%';
  r.innerHTML = `<span>${emoji}</span><small>${esc(nombre)}</small>`;
  $('reacciones').appendChild(r);
  setTimeout(() => r.remove(), 3200);
}

function activos() { return Object.values(P.jugadores).filter(j => j.conectado && !j.espectador); }

let temporizador = null;
function comprobarInicio() {
  if (P.fase === 'cuenta' && !(activos().length && activos().every(j => j.listo))) return cancelarCuenta();
  if (P.fase !== 'espera') return;
  const a = activos();
  if (a.length && a.every(j => j.listo)) iniciarCuenta();
}
function iniciarCuenta() {
  P.fase = 'cuenta'; P.cuenta = 3;
  difundir();
  const tic = () => {
    if (P.fase !== 'cuenta') return;
    sfx('cuenta');
    $('cuenta').textContent = P.cuenta;
    $('cuenta').classList.remove('oculto', 'pulso'); void $('cuenta').offsetWidth; $('cuenta').classList.add('pulso');
    if (P.cuenta === 0) { empezarCarrera(); return; }
    temporizador = setTimeout(() => { P.cuenta--; difundir(); tic(); }, RAPIDO ? 30 : 1000);
  };
  tic();
}
function cancelarCuenta() {
  clearTimeout(temporizador);
  P.fase = 'espera'; P.cuenta = null;
  $('cuenta').classList.add('oculto');
  difundir();
}

// ---------- la carrera ----------
const decirSi = (clave, c, texto) => decir(clave, c !== undefined && c !== null ? P.personajes[c].id : undefined, texto, voz);

async function empezarCarrera() {
  $('cuenta').classList.add('oculto');
  const jugadores = Object.values(P.jugadores);
  // Los que no estaban listos (desconectados) no participan: su carta secreta no entra.
  jugadores.forEach(j => { if (!j.listo) { j.apuesta = null; j.espectador = true; } });
  const secretas = jugadores.filter(j => j.listo && j.carta).map(j => ({ ...j.carta, de: j.nombre, deId: j.id }));
  P.carrera = M.nuevaCarrera(M.barajar(P.publicas.concat(secretas)));
  P.fase = 'carrera'; P.cuenta = null;
  difundir();
  pintarApuestas();
  ambiente(sonido);
  if (!RAPIDO) {
    await decirSi('apuestas', null, 'Se cierran las apuestas');
    if (tablero.presentar) await tablero.presentar((clave, c) => decirSi(clave, c, c !== undefined ? P.personajes[c].nombre : ''));
  }
  $('cuenta').textContent = '¡YA!';
  $('cuenta').classList.remove('oculto', 'pulso'); void $('cuenta').offsetWidth; $('cuenta').classList.add('pulso');
  sfx('salida'); rugido(0.8);
  setTimeout(() => $('cuenta').classList.add('oculto'), 800);
  await decirSi('arrancan', null, '¡Y arrancan!');
  await bucle();
}

async function esperarPausa() { while (P.pausa) await espera(150); }

function claveCarta(carta) {
  if (carta.tipo === 'avanza') return 'avanza' + carta.n;
  return carta.tipo;
}

async function bucle() {
  const nombres = P.personajes.map(p => p.nombre);
  while (P.carrera && P.carrera.ganador === null) {
    await esperarPausa();
    const r = M.siguienteCarta(P.carrera);
    P.n++;
    P.ultima = r.carta;
    red.enviar({ t: 'paso', n: P.n, carta: r.carta, eventos: r.eventos, corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, prorroga: P.carrera.prorroga });
    if (r.carta.secreta) {
      mostrarSecreta(r.carta);
      sfx('silbato'); rugido(0.6);
      await decirSi('secreta', null, 'Carta secreta');
    }
    mostrarCarta(r.carta);
    const t = M.textoCarta(r.carta, nombres);
    const fuerte = r.eventos.some(e => ['cae', 'placa', 'reves', 'junta', 'portal', 'lesion', 'meteorito', 'abduce', 'devuelve', 'explota', 'cohete', 'tornado'].includes(e.e));
    if (fuerte) rugido(1);
    const giro = !RAPIDO && P.n % 5 === 0;
    const animacion = tablero.animar(r.eventos.filter(e => e.e !== 'gana'), { giro });
    // lo que pasa además de la carta (el ovni devuelve a alguien, explota una bomba, un eliminado)
    const extra = async () => {
      for (const e of r.eventos) {
        if (e.e === 'devuelve') await decirSi('devuelve', e.c, `¡El ovni devuelve a ${nombres[e.c]}!`);
        if (e.e === 'explota') await decirSi('explota', e.c, `¡Explota la bomba de ${nombres[e.c]}!`);
        if (e.e === 'meteorito' && e.elimina) await decirSi('eliminado', e.c, `¡${nombres[e.c]} queda eliminado!`);
      }
    };
    await Promise.all([animacion, decirSi(claveCarta(r.carta), r.carta.c, `${t.titulo}. ${t.texto}`).then(extra)]);
    pintar();
    if (r.fin) {
      const foto = r.eventos.find(e => e.e === 'fotofinish');
      if (foto) await decirSi('foto', null, '¡Foto finish!');
      rugido(1.5);
      await Promise.all([tablero.animar([{ e: 'gana', c: P.carrera.ganador }]), decirSi('gana', P.carrera.ganador, `¡${nombres[P.carrera.ganador]} gana la carrera!`)]);
      break;
    }
    // comentario de la situación
    if (r.info.rectaFinal) { rugido(0.7); await decirSi('recta', r.info.lider, `¡Recta final con ${nombres[r.info.lider]} delante!`); }
    else if (r.info.cambioLider) await decirSi('lider', r.info.lider, `¡${nombres[r.info.lider]} se pone en cabeza!`);
    else if (r.info.igualada && Math.random() < 0.5) await decirSi('igualada', null, '¡Qué igualdad!');
    const fin = Date.now() + (RAPIDO ? 0 : SEGUNDOS_ENTRE_CARTAS * 1000);
    while (Date.now() < fin || P.pausa) {
      if (P.pausa) { await esperarPausa(); break; }   // al quitar la pausa, sigue enseguida
      await espera(100);
    }
  }
  terminar();
}

function mostrarSecreta(carta) {
  const b = $('secretaAviso');
  b.innerHTML = `🤫 ¡Carta secreta de <b>${esc(carta.de || '¿?')}</b>!`;
  b.classList.remove('oculto', 'entra'); void b.offsetWidth; b.classList.add('entra');
  setTimeout(() => b.classList.add('oculto'), 3500);
}

function mostrarCarta(carta) {
  sfx('carta');
  $('cartaActual').innerHTML = cartaHTML(carta, P.personajes, 'grande entra');
  $('restantes').textContent = P.carrera.mazo.length;
  $('historial').insertAdjacentHTML('afterbegin', cartaHTML(carta, P.personajes, 'mini'));
}

async function terminar() {
  const cl = P.carrera.clasificacion;
  const g = P.personajes[cl[0]];
  P.resultados = [];
  for (const j of Object.values(P.jugadores)) {
    if (!j.apuesta) continue;
    const delta = M.resultadoApuesta(j.apuesta, cl);
    j.puntos = Math.max(0, j.puntos + delta);
    P.resultados.push({ id: j.id, delta });
  }
  P.ganadores.push({ id: g.id, emoji: g.emoji, nombre: g.nombre, color: g.color });
  P.fase = 'resultado';
  guardar();
  difundir();
  await espera(RAPIDO ? 0 : 3500);
  ambiente(false);
  pintarResultado();
}

// ---------- pintar ----------
function pintar() {
  $('ronda').innerHTML = (P.ronda ? `Carrera ${P.ronda}` : '') +
    (P.ganadores.length ? ` <span class="ganadores" title="Últimos ganadores">${P.ganadores.slice(-8).map(g => `<i style="--color:${g.color}" title="${esc(g.nombre)}">${g.emoji}</i>`).join('')}</span>` : '');
  $('codigo').textContent = P.sala;
  const lista = Object.values(P.jugadores).sort((a, b) => b.puntos - a.puntos);
  document.body.dataset.fase = P.fase;
  $('jugadores').classList.toggle('muchos', lista.length > 8);
  $('sinJugadores').classList.toggle('oculto', lista.length > 0);
  const act = activos();
  $('nListos').textContent = act.length ? `${act.filter(j => j.listo).length}/${act.length} listos` : '';
  const verAp = P.fase === 'carrera' || P.fase === 'resultado';
  $('jugadores').innerHTML = lista.map((j, k) => {
    let est = '⏳ eligiendo';
    if (!j.conectado) est = '📴 desconectado';
    else if (j.espectador) est = '👀 mira';
    else if (j.listo) est = '✅ listo';
    else if (j.apuesta) est = '🎟️ apostado';
    const ap = verAp && j.apuesta ? `<span class="ap" style="--color:${P.personajes[j.apuesta.c].color}">${P.personajes[j.apuesta.c].emoji} ${j.apuesta.cantidad} · ${j.apuesta.tipo === 'podio' ? 'podio' : 'gana'}</span>` : '';
    const medalla = lista.length > 1 && k === 0 && j.puntos > M.PUNTOS_INICIALES ? '👑 ' : '';
    return `<li class="${j.conectado ? '' : 'apagado'} ${j.listo ? 'listo' : ''}">
      <span class="nom">${medalla}${esc(j.nombre)}</span><span class="pts">${j.puntos} 🪙</span>
      <span class="est">${est}</span>${ap}
      <button class="echar" data-id="${j.id}" title="Echar de la partida">✕</button></li>`;
  }).join('');

  const enEspera = P.fase === 'espera' || P.fase === 'cuenta';
  $('vEspera').classList.toggle('oculto', !enEspera);
  $('vCarrera').classList.toggle('oculto', enEspera);
  $('bPausa').classList.toggle('oculto', P.fase !== 'carrera');
  $('bPausa').textContent = P.pausa ? '▶ Seguir' : '⏸ Pausa';
  $('pausado').classList.toggle('oculto', !P.pausa);
  if (P.carrera) $('restantes').textContent = P.carrera.mazo.length;
  if (enEspera && P.cuotas) {
    const apuestas = [0, 0, 0, 0];
    Object.values(P.jugadores).forEach(j => j.apuesta && apuestas[j.apuesta.c]++);
    $('corredores').innerHTML = P.personajes.map((p, i) => `
      <div class="corredor" style="--color:${p.color}">
        <div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div>
        <div class="corredor-txt"><b>${esc(p.nombre)}</b><small>Carril ${i + 1} · ${esc(p.lema || '')}</small></div>
        <div class="cuotas"><span title="Paga si gana">🏆 x${P.cuotas.ganador[i]}</span><span title="Paga si queda 1.º o 2.º">🥈 x${P.cuotas.podio[i]}</span></div>
        <div class="prob"><i style="width:${Math.round(P.cuotas.probGana[i] * 100)}%"></i></div>
        ${apuestas[i] ? `<div class="n-ap">🎟️ ${apuestas[i]}</div>` : ''}
      </div>`).join('');
    const firma = P.ronda + ':' + P.publicas.map(c => c.id).join();
    if ($('mazo').dataset.firma !== firma) {
      $('mazo').dataset.firma = firma;
      const orden = P.publicas.slice().sort((a, b) => (a.c ?? 9) - (b.c ?? 9));
      $('mazo').innerHTML = orden.map(c => cartaHTML(c, P.personajes, 'mini')).join('') +
        `<div class="secretas" id="secretas"></div>`;
    }
    const n = Object.values(P.jugadores).filter(j => !j.espectador && j.carta && j.conectado).length;
    $('secretas').innerHTML = n ? `<div class="dorso caos-dorso mini-dorso">+${n}</div><small>secretas</small>` : '';
  }
}

// Durante la carrera: quién ha apostado por cada corredor.
function pintarApuestas() {
  $('apuestasCarrera').innerHTML = P.personajes.map((p, i) => {
    const js = Object.values(P.jugadores).filter(j => j.apuesta && j.apuesta.c === i);
    return `<div class="ap-corredor" style="--color:${p.color}">
      <div class="ap-cab"><span class="cara-redonda mini" style="--color:${p.color}">${caraHTML(p)}</span><b>${esc(p.nombre)}</b></div>
      <div class="ap-lista">${js.map(j => `<span class="chip">${esc(j.nombre)} · ${j.apuesta.cantidad}${j.apuesta.tipo === 'podio' ? ' 🥈' : ' 🏆'}</span>`).join('') || '<span class="suave">nadie</span>'}</div>
    </div>`;
  }).join('');
}

function pintarResultado() {
  const cl = P.carrera.clasificacion;
  const g = P.personajes[cl[0]];
  $('resTitulo').innerHTML = `🏆 ¡Gana ${esc(g.nombre)}!`;
  $('podio').innerHTML = [cl[1], cl[0], cl[2], cl[3]].map((c, k) => {
    const p = P.personajes[c];
    const puesto = [2, 1, 3, 4][k];
    return `<div class="escalon e${puesto}" style="--color:${p.color}"><div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div><b>${esc(p.nombre)}</b><div class="pie">${puesto}.º</div></div>`;
  }).join('');
  const filas = P.resultados.map(r => ({ r, j: P.jugadores[r.id] })).filter(x => x.j).sort((a, b) => b.r.delta - a.r.delta);
  const mejor = filas.length && filas[0].r.delta > 0 ? filas[0].j.id : null;
  $('resTabla').innerHTML = filas.map(({ r, j }) => {
    const p = P.personajes[j.apuesta.c];
    return `<tr class="${j.id === mejor ? 'mejor' : ''}"><td>${j.id === mejor ? '🏅 ' : ''}${esc(j.nombre)}</td><td>${p.emoji} ${esc(p.nombre)} · ${j.apuesta.tipo === 'podio' ? 'podio' : 'ganador'} · ${j.apuesta.cantidad} (x${j.apuesta.cuota})</td>
      <td class="${r.delta >= 0 ? 'mas' : 'menos'}">${r.delta >= 0 ? '+' : ''}${r.delta}</td><td>${j.puntos} 🪙</td></tr>`;
  }).join('') || '<tr><td colspan="4">Nadie apostó</td></tr>';
  $('vResultado').classList.remove('oculto');
  confeti(g.color, 220);
}

// ---------- controles ----------
function enlaces() {
  $('bPausa').onclick = () => { P.pausa = !P.pausa; if (P.pausa) callar(); difundir(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && P.fase === 'carrera') { e.preventDefault(); $('bPausa').click(); } });
  $('bVoz').onclick = () => { voz = !voz; $('bVoz').textContent = `🎙️ Narrador: ${voz ? 'sí' : 'no'}`; if (!voz) callar(); };
  $('bSonido').onclick = () => {
    sonido = !sonido; if (tablero) tablero.sonido = sonido; $('bSonido').textContent = sonido ? '🔊' : '🔇';
    ambiente(sonido && P.fase === 'carrera');
  };
  $('bPantalla').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  $('bNueva').onclick = () => nuevaCarrera();
  $('jugadores').onclick = e => {
    const b = e.target.closest('.echar'); if (!b) return;
    const j = P.jugadores[b.dataset.id]; if (!j) return;
    if (!RAPIDO && !confirm(`¿Echar a ${j.nombre} de la partida?`)) return;
    echar(j.id);
  };
}

export function echar(id) {
  const j = P.jugadores[id]; if (!j) return;
  if ((P.fase === 'espera' || P.fase === 'cuenta') && j.carta) P.reserva.push(j.carta);   // su carta secreta sale del mazo
  delete P.jugadores[id];
  P.echados.push(id);
  red.enviar({ t: 'echado', para: id });
  guardar();
  if (P.fase === 'espera') recalcularCuotas();
  comprobarInicio();
  difundir();
}

function urlMovil() {
  const base = location.href.replace(/pantalla\.html.*$/, '');
  return `${base}movil.html?sala=${P.sala}${modoLocal ? '&local=1' : ''}`;
}

async function arrancar() {
  $('inicio').classList.add('oculto');
  desbloquearAudio();
  const catalogo = { '3d': 'personajes/3d-bumeran/personajes.json', reales: 'personajes/reales/personajes.json' }[params.get('pj')] || $('sCatalogo').value;
  try { localStorage.setItem('estampida-catalogo', catalogo); } catch {}
  todos = await cargarPersonajes(catalogo).catch(() => []);
  // hacen falta 4: si el catálogo tiene menos (p. ej. aún pocos reales), se completa con los muñecos 3D de prueba
  if (todos.length < 4) {
    const extra = await cargarPersonajes('personajes/3d-bumeran/personajes.json').catch(() => []);
    const ya = new Set(todos.map(p => p.nombre));            // sin repetir persona (p. ej. Alber real y el de prueba)
    todos = todos.concat(M.barajar(extra.filter(p => !ya.has(p.nombre))).slice(0, 4 - todos.length));
  }
  await cargarNarrador();
  if (!params.has('2d')) {
    try { ({ Tablero3D } = await import('./tablero3d.js?v=202611161219')); usar3D = (await import('./tablero3d.js?v=202611161219')).hay3D(); }
    catch (e) { console.warn('No se pudo cargar el 3D', e); usar3D = false; }
  }
  recuperar();
  if (!P.sala) P.sala = params.get('sala')?.toUpperCase() || codigoSala();
  $('codigo').textContent = P.sala;
  const url = urlMovil();
  $('url').textContent = url.replace(/^https?:\/\//, '');
  try { new QRCode($('qr'), { text: url, width: 140, height: 140, colorDark: '#0d1b12', colorLight: '#ffffff' }); } catch {}
  try {
    red = await conectar(P.sala, recibir);
  } catch (e) {
    alert('No se ha podido conectar con el servidor de tiempo real. Revisa internet y recarga.');
    return;
  }
  enlaces();
  nuevaCarrera();
  // latidos: si un móvil deja de dar señales 9 s, se marca como desconectado
  setInterval(() => {
    let cambio = false;
    for (const j of Object.values(P.jugadores)) {
      if (j.conectado && Date.now() - j.ultimo > 9000) { j.conectado = false; cambio = true; }
    }
    if (cambio) { if (P.fase === 'espera') recalcularCuotas(); comprobarInicio(); difundir(); }
    else red.enviar(estadoPublico());          // refresco periódico por si algún móvil perdió un mensaje
  }, 3000);
  window.__estampida = { P, echar, M, tablero: () => tablero };       // para pruebas
}

try { const c = localStorage.getItem('estampida-catalogo'); if (c) $('sCatalogo').value = c; } catch {}
$('bEmpezar').onclick = arrancar;
if (params.has('auto')) arrancar();
