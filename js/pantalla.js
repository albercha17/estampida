// Pantalla del PC: es el "árbitro". Guarda el estado de la partida y lo envía a los móviles.
import * as M from './motor.js';
import { conectar, codigoSala, cargarPersonajes, modoLocal } from './red.js';
import { Tablero, cartaHTML, caraHTML, esc, espera, confeti } from './tablero.js';
import { sfx, narrar, desbloquearAudio } from './sonido.js';
import { SEGUNDOS_ENTRE_CARTAS } from './config.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RAPIDO = params.has('rapido');          // para pruebas: sin esperas
const GUARDADO = 'estampida-anfitrion';

let todos = [];            // catálogo de personajes
let red = null;
let tablero = null;
let voz = !RAPIDO, sonido = !RAPIDO;
const P = {                // estado de la partida
  sala: '', fase: 'espera', ronda: 0,
  personajes: [], publicas: [], reserva: [], cuotas: null,
  jugadores: {}, echados: [],
  carrera: null, ultima: null, n: 0, resultados: null, pausa: false, cuenta: null,
};

// ---------- guardar / recuperar (si se recarga la pantalla) ----------
function guardar() {
  try {
    const j = {};
    for (const [id, x] of Object.entries(P.jugadores)) j[id] = { nombre: x.nombre, puntos: x.puntos };
    localStorage.setItem(GUARDADO, JSON.stringify({ sala: P.sala, ronda: P.ronda, jugadores: j, echados: P.echados }));
  } catch {}
}
function recuperar() {
  try {
    const d = JSON.parse(localStorage.getItem(GUARDADO) || 'null');
    if (!d || params.has('nueva')) return;
    P.sala = d.sala; P.ronda = d.ronda || 0; P.echados = d.echados || [];
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
    resultados: P.resultados, pausa: P.pausa, cuenta: P.cuenta,
  };
}
function difundir() { red?.enviar(estadoPublico()); pintar(); }
function enviarPrivado(j) { if (j.carta) red?.enviar({ t: 'privado', para: j.id, carta: j.carta }); }

// ---------- preparar carrera ----------
function nuevaCarrera() {
  P.ronda++;
  P.personajes = M.barajar(todos).slice(0, 4);
  const { publicas, reserva } = M.prepararMazo();
  P.publicas = publicas; P.reserva = reserva;
  P.cuotas = M.calcularCuotas(publicas, RAPIDO ? 400 : 3000);
  P.fase = 'espera'; P.carrera = null; P.ultima = null; P.n = 0; P.resultados = null; P.pausa = false; P.cuenta = null;
  for (const j of Object.values(P.jugadores)) {
    if (j.puntos < M.APUESTA_MIN) j.puntos = M.RESCATE;
    j.apuesta = null; j.listo = false; j.espectador = false;
    j.carta = P.reserva.pop();
  }
  tablero = new Tablero($('campo'), P.personajes, { sonido });
  tablero.velocidad = RAPIDO ? 20 : 1;
  $('historial').innerHTML = '';
  $('cartaActual').innerHTML = '<div class="dorso">ESTAMPIDA</div>';
  $('vResultado').classList.add('oculto');
  guardar();
  difundir();
  Object.values(P.jugadores).forEach(enviarPrivado);
}

// ---------- mensajes de los móviles ----------
function recibir(m) {
  if (!m || !m.id) return;
  if (m.t === 'estado' || m.t === 'paso' || m.t === 'privado') return;   // son nuestros (otra pestaña)
  if (P.echados.includes(m.id)) { red.enviar({ t: 'echado', para: m.id }); return; }
  let j = P.jugadores[m.id];
  if (m.t === 'hola') {
    const nombre = String(m.nombre || 'Anónimo').trim().slice(0, 16) || 'Anónimo';
    if (!j) {
      j = P.jugadores[m.id] = { id: m.id, nombre, puntos: M.PUNTOS_INICIALES, conectado: true, ultimo: Date.now(), carta: null, apuesta: null, listo: false, espectador: false };
      sfx('cuenta');
    }
    j.nombre = nombre; j.conectado = true; j.ultimo = Date.now();
    if (P.fase === 'espera' || P.fase === 'cuenta') { if (!j.carta) j.carta = P.reserva.pop(); }
    else if (!j.apuesta) j.espectador = true;
    if (P.fase === 'cuenta') cancelarCuenta();
    guardar();
    difundir();
    enviarPrivado(j);
    return;
  }
  if (!j) { red.enviar({ t: 'quien', para: m.id }); return; }   // el PC no le conoce: que vuelva a saludar
  j.ultimo = Date.now();
  if (!j.conectado) { j.conectado = true; difundir(); }
  if (m.t === 'adios') { j.conectado = false; comprobarInicio(); difundir(); return; }
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
      j.apuesta = { c, tipo, cantidad: cant, cuota: P.cuotas[tipo][c] };
    }
  }
  j.listo = !!d.listo && !!j.apuesta;
  if (JSON.stringify([j.apuesta, j.listo]) !== antes) { comprobarInicio(); difundir(); }
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
async function empezarCarrera() {
  $('cuenta').textContent = '¡YA!';
  sfx('salida');
  setTimeout(() => $('cuenta').classList.add('oculto'), 700);
  const jugadores = Object.values(P.jugadores);
  // Los que no estaban listos (desconectados) no participan: su carta vuelve a la caja.
  jugadores.forEach(j => { if (!j.listo) { j.apuesta = null; j.espectador = true; } });
  const secretas = jugadores.filter(j => j.listo && j.carta).map(j => j.carta);
  P.carrera = M.nuevaCarrera(M.barajar(P.publicas.concat(secretas)));
  P.fase = 'carrera'; P.cuenta = null;
  difundir();
  if (voz) await narrar('¡Empieza la carrera!', voz);
  await bucle();
}

async function esperarPausa() { while (P.pausa) await espera(150); }

async function bucle() {
  const nombres = P.personajes.map(p => p.nombre);
  while (P.carrera && P.carrera.ganador === null) {
    await esperarPausa();
    const r = M.siguienteCarta(P.carrera);
    P.n++;
    P.ultima = r.carta;
    red.enviar({ t: 'paso', n: P.n, carta: r.carta, eventos: r.eventos, corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, prorroga: P.carrera.prorroga });
    mostrarCarta(r.carta);
    const t = M.textoCarta(r.carta, nombres);
    await Promise.all([tablero.animar(r.eventos), narrar(`${t.titulo}. ${t.texto}`, voz)]);
    pintar();
    if (r.fin) break;
    const fin = Date.now() + (RAPIDO ? 0 : SEGUNDOS_ENTRE_CARTAS * 1000);
    while (Date.now() < fin || P.pausa) {
      if (P.pausa) { await esperarPausa(); break; }   // al quitar la pausa, sigue enseguida
      await espera(100);
    }
  }
  terminar();
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
  P.fase = 'resultado';
  guardar();
  difundir();
  narrar(`¡${g.nombre} gana la carrera!`, voz);
  await espera(RAPIDO ? 0 : 2500);
  pintarResultado();
}

// ---------- pintar ----------
function pintar() {
  $('ronda').textContent = P.ronda ? `Carrera ${P.ronda}` : '';
  $('codigo').textContent = P.sala;
  const lista = Object.values(P.jugadores).sort((a, b) => b.puntos - a.puntos);
  $('sinJugadores').classList.toggle('oculto', lista.length > 0);
  const act = activos();
  $('nListos').textContent = act.length ? `${act.filter(j => j.listo).length}/${act.length} listos` : '';
  const verAp = P.fase === 'carrera' || P.fase === 'resultado';
  $('jugadores').innerHTML = lista.map(j => {
    let est = '⏳ eligiendo';
    if (!j.conectado) est = '📴 desconectado';
    else if (j.espectador) est = '👀 mira';
    else if (j.listo) est = '✅ listo';
    else if (j.apuesta) est = '🎟️ apostado';
    const ap = verAp && j.apuesta ? `<span class="ap" style="--color:${P.personajes[j.apuesta.c].color}">${P.personajes[j.apuesta.c].emoji} ${j.apuesta.cantidad} · ${j.apuesta.tipo === 'podio' ? 'podio' : 'gana'}</span>` : '';
    return `<li class="${j.conectado ? '' : 'apagado'} ${j.listo ? 'listo' : ''}">
      <span class="nom">${esc(j.nombre)}</span><span class="pts">${j.puntos} 🪙</span>
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
      </div>`).join('');
    const firma = P.ronda + ':' + P.publicas.map(c => c.id).join();
    if ($('mazo').dataset.firma !== firma) {
      $('mazo').dataset.firma = firma;
      const orden = P.publicas.slice().sort((a, b) => (a.c ?? 9) - (b.c ?? 9));
      $('mazo').innerHTML = orden.map(c => cartaHTML(c, P.personajes, 'mini')).join('') +
        `<div class="secretas" id="secretas"></div>`;
    }
    const n = Object.values(P.jugadores).filter(j => !j.espectador && j.carta).length;
    $('secretas').innerHTML = n ? `<div class="dorso mini-dorso">+${n}</div><small>secretas</small>` : '';
  }
}

function pintarResultado() {
  const cl = P.carrera.clasificacion;
  const g = P.personajes[cl[0]];
  $('resTitulo').innerHTML = `🏆 ¡Gana ${esc(g.nombre)}!`;
  const alturas = [1, 0, 2, 3];
  $('podio').innerHTML = [cl[1], cl[0], cl[2], cl[3]].map((c, k) => {
    const p = P.personajes[c];
    const puesto = [2, 1, 3, 4][k];
    return `<div class="escalon e${puesto}" style="--color:${p.color}"><div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div><b>${esc(p.nombre)}</b><div class="pie">${puesto}.º</div></div>`;
  }).join('');
  void alturas;
  const filas = P.resultados.map(r => ({ r, j: P.jugadores[r.id] })).filter(x => x.j).sort((a, b) => b.r.delta - a.r.delta);
  $('resTabla').innerHTML = filas.map(({ r, j }) => {
    const p = P.personajes[j.apuesta.c];
    return `<tr><td>${esc(j.nombre)}</td><td>${p.emoji} ${esc(p.nombre)} · ${j.apuesta.tipo === 'podio' ? 'podio' : 'ganador'} · ${j.apuesta.cantidad} (x${j.apuesta.cuota})</td>
      <td class="${r.delta >= 0 ? 'mas' : 'menos'}">${r.delta >= 0 ? '+' : ''}${r.delta}</td><td>${j.puntos} 🪙</td></tr>`;
  }).join('') || '<tr><td colspan="4">Nadie apostó</td></tr>';
  $('vResultado').classList.remove('oculto');
  confeti(g.color, 220);
}

// ---------- controles ----------
function enlaces() {
  $('bPausa').onclick = () => { P.pausa = !P.pausa; if (P.pausa) speechSynthesis?.cancel(); difundir(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && P.fase === 'carrera') { e.preventDefault(); $('bPausa').click(); } });
  $('bVoz').onclick = () => { voz = !voz; $('bVoz').textContent = `🎙️ Narrador: ${voz ? 'sí' : 'no'}`; if (!voz) speechSynthesis?.cancel(); };
  $('bSonido').onclick = () => { sonido = !sonido; if (tablero) tablero.sonido = sonido; $('bSonido').textContent = sonido ? '🔊' : '🔇'; };
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
  todos = await cargarPersonajes();
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
    if (cambio) { comprobarInicio(); difundir(); }
    else red.enviar(estadoPublico());          // refresco periódico por si algún móvil perdió un mensaje
  }, 3000);
  window.__estampida = { P, echar, M };       // para pruebas
}

$('bEmpezar').onclick = arrancar;
if (params.has('auto')) arrancar();
