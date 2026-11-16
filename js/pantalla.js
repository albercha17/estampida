// Pantalla del PC: es el "árbitro". Guarda el estado de la partida y lo envía a los móviles.
import * as M from './motor.js?v=202611161756';
import { conectar, codigoSala, cargarPersonajes, modoLocal } from './red.js?v=202611161756';
import { Tablero, cartaHTML, caraHTML, esc, espera, confeti } from './tablero.js?v=202611161756';
import { sfx, desbloquearAudio } from './sonido.js?v=202611161756';
import { cargarNarrador, precargar, decir, callar, ambiente, rugido } from './narrador.js?v=202611161756';
import { SEGUNDOS_ENTRE_CARTAS, SEGUNDOS_VOTACION, SEGUNDOS_DIRECTO } from './config.js?v=202611161756';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RAPIDO = params.has('rapido');          // para pruebas: sin esperas
const GUARDADO = 'estampida-anfitrion';
const REACCIONES = ['👏', '🔥', '😱', '😂', '🐢', '💸', '🙏', '😡'];
const SEG_MEDIO = Number(params.get('medio')) || 0;     // para pruebas: segundos de la votación y del directo
const SEG_VOTO = SEG_MEDIO || (RAPIDO ? 1.5 : SEGUNDOS_VOTACION), SEG_DIRECTO = SEG_MEDIO || (RAPIDO ? 1.5 : SEGUNDOS_DIRECTO);

let todos = [];            // catálogo de personajes
let red = null;
let tablero = null;
let Tablero3D = null, usar3D = false;
let voz = !RAPIDO, sonido = !RAPIDO;
const P = {                // estado de la partida
  sala: '', fase: 'espera', ronda: 0, partida: 1,     // partida: sube al reiniciar (todo lo de la anterior se descarta)
  personajes: [], publicas: [], reserva: [], cuotas: null, escenario: 'estadio', cartaEsc: null,
  jugadores: {}, echados: [], ganadores: [],
  carrera: null, ultima: null, n: 0, resultados: null, pausa: false, cuenta: null,
  medio: null, medioHecho: false, favorito: null, sufrido: 0,
};

// ---------- guardar / recuperar (si se recarga la pantalla) ----------
function guardar() {
  try {
    const j = {};
    for (const [id, x] of Object.entries(P.jugadores)) j[id] = { nombre: x.nombre, puntos: x.puntos, racha: x.racha || 0 };
    localStorage.setItem(GUARDADO, JSON.stringify({ sala: P.sala, ronda: P.ronda, partida: P.partida, jugadores: j, echados: P.echados, ganadores: P.ganadores }));
  } catch {}
}
function recuperar() {
  try {
    const d = JSON.parse(localStorage.getItem(GUARDADO) || 'null');
    if (!d || params.has('nueva')) return;
    P.sala = d.sala; P.ronda = d.ronda || 0; P.partida = d.partida || 1; P.echados = d.echados || []; P.ganadores = d.ganadores || [];
    for (const [id, x] of Object.entries(d.jugadores || {})) {
      P.jugadores[id] = { id, nombre: x.nombre, puntos: x.puntos, racha: x.racha || 0, conectado: false, ultimo: 0, carta: null, apuesta: null, loca: null, directo: null, listo: false, espectador: false };
    }
  } catch {}
}

// ---------- estado público que reciben los móviles ----------
function estadoMedio() {
  const m = P.medio;
  if (!m) return null;
  const votos = [0, 0, 0, 0];
  Object.values(m.votos || {}).forEach(c => votos[c]++);
  return { fase: m.fase, quedan: Math.max(0, Math.ceil((m.hasta - Date.now()) / 1000)), votos, elegido: m.elegido ?? null, cuotas: m.cuotas || null };
}
function estadoPublico() {
  const verApuestas = P.fase !== 'espera' && P.fase !== 'cuenta';
  return {
    t: 'estado', fase: P.fase, ronda: P.ronda, partida: P.partida, sala: P.sala,
    personajes: P.personajes, publicas: P.publicas, cuotas: P.cuotas,
    escenario: P.escenario, cartaEsc: P.cartaEsc,
    jugadores: Object.values(P.jugadores).map(j => ({
      id: j.id, nombre: j.nombre, puntos: j.puntos, listo: j.listo, conectado: j.conectado, racha: j.racha || 0,
      espectador: j.espectador, apostado: !!j.apuesta,
      apuesta: verApuestas ? j.apuesta : null, loca: verApuestas ? j.loca : null, directo: j.directo,
    })),
    carrera: P.carrera ? {
      corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, n: P.n,
      ultima: P.ultima, prorroga: P.carrera.prorroga, clasificacion: P.carrera.clasificacion,
    } : null,
    medio: estadoMedio(),
    resultados: P.resultados, pausa: P.pausa, cuenta: P.cuenta, ganadores: P.ganadores.slice(-8),
  };
}
function difundir() { red?.enviar(estadoPublico()); pintar(); }
function enviarPrivado(j) { if (j.opciones) red?.enviar({ t: 'privado', para: j.id, opciones: j.opciones, elegida: j.elegida }); }
// Cada jugador recibe DOS cartas del caos y elige cuál entra en la carrera.
function repartir(j) {
  j.opciones = [P.reserva.pop(), P.reserva.pop()].filter(Boolean);
  j.elegida = null; j.carta = null;
}
function devolver(j) {
  (j.opciones || []).forEach(c => c && P.reserva.push(c));
  j.opciones = null; j.elegida = null; j.carta = null;
}
// Puntos que le quedan sin apostar.
const libres = j => j.puntos - (j.apuesta?.cantidad || 0) - (j.loca?.cantidad || 0) - (j.directo?.cantidad || 0);
const nombres = () => P.personajes.map(p => p.nombre);

// ---------- tablero (3D si se puede) ----------
function crearTablero() {
  tablero?.destruir?.();
  const raiz = $('campo');
  raiz.className = '';
  if (usar3D) {
    try { tablero = new Tablero3D(raiz, P.personajes, { sonido, escenario: P.escenario }); }
    catch (e) { console.warn('Sin 3D:', e); usar3D = false; }
  }
  if (!usar3D) { raiz.innerHTML = ''; tablero = new Tablero(raiz, P.personajes, { sonido, escenario: P.escenario }); }
  tablero.velocidad = RAPIDO ? 20 : 1;
}

// ---------- cuotas: se recalculan según cuántas cartas secretas habrá ----------
let tCuotas = null;
function recalcularCuotas(inmediato = false) {
  const hacer = () => {
    const n = Math.max(1, Object.values(P.jugadores).filter(j => j.conectado && !j.espectador).length);
    P.cuotas = M.calcularCuotas(P.publicas, RAPIDO ? 400 : 3000, Math.random, n, P.cartaEsc ? [P.cartaEsc] : []);
    P.cuotasCon = n;
    difundir();
  };
  clearTimeout(tCuotas);
  if (inmediato) hacer(); else tCuotas = setTimeout(hacer, 400);
}

// ---------- escenario de la carrera ----------
function elegirEscenario() {
  const pedido = params.get('escenario') || $('sEscenario').value;
  if (M.ESCENARIOS[pedido]) return pedido;
  const opciones = Object.keys(M.ESCENARIOS).filter(e => e !== P.escenario || P.ronda <= 1);   // aleatorio: no repite
  return opciones[Math.floor(Math.random() * opciones.length)];
}

// ---------- preparar carrera ----------
function nuevaCarrera() {
  P.ronda++;
  P.personajes = M.barajar(todos).slice(0, 4);
  P.escenario = elegirEscenario();
  P.cartaEsc = M.cartaEscenario(P.escenario);
  const { publicas, reserva } = M.prepararMazo();
  P.publicas = publicas; P.reserva = reserva;
  P.fase = 'espera'; P.carrera = null; P.ultima = null; P.n = 0; P.resultados = null; P.pausa = false; P.cuenta = null;
  P.medio = null; P.medioHecho = false; P.favorito = null; P.sufrido = 0;
  for (const j of Object.values(P.jugadores)) {
    if (j.puntos < M.APUESTA_MIN) j.puntos = M.RESCATE;
    j.apuesta = null; j.loca = null; j.directo = null; j.listo = false; j.espectador = false;
    repartir(j);
  }
  recalcularCuotas(true);
  crearTablero();
  precargar(P.personajes.map(p => p.id));
  $('historial').innerHTML = '';
  $('cartaActual').innerHTML = '<div class="dorso">ESTAMPIDA</div>';
  $('vResultado').classList.add('oculto');
  $('medio').classList.add('oculto');
  document.body.dataset.escenario = P.escenario;
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
      j = P.jugadores[m.id] = { id: m.id, nombre, puntos: M.PUNTOS_INICIALES, racha: 0, conectado: true, ultimo: Date.now(), carta: null, apuesta: null, loca: null, directo: null, listo: false, espectador: false };
      sfx('cuenta');
    }
    const estaba = j.conectado;
    j.nombre = nombre; j.conectado = true; j.ultimo = Date.now();
    if (P.fase === 'espera' || P.fase === 'cuenta') { if (!j.opciones) repartir(j); }
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
  if ((m.t === 'medio' || m.t === 'latido') && m.medio) aplicarMedio(j, m.medio);
}

// Valida una apuesta que llega del móvil contra una tabla de cuotas. Devuelve la apuesta o null.
function validar(a, cuotas, maximo, tipos) {
  if (!a || !tipos.includes(a.tipo)) return null;
  const cant = Math.floor(Number(a.cantidad));
  if (!(cant > 0 && cant <= maximo && cant >= Math.min(M.APUESTA_MIN, maximo))) return null;
  const c = Number(a.c), c2 = Number(a.c2);
  const ap = { tipo: a.tipo, cantidad: cant };
  if (a.tipo !== 'paliza' && a.tipo !== 'prorroga') { if (!(c >= 0 && c < 4)) return null; ap.c = c; }
  if (a.tipo === 'exacta') { if (!(c2 >= 0 && c2 < 4) || c2 === c) return null; ap.c2 = c2; }
  const cuota = M.cuotaDe(cuotas, ap);
  if (!cuota) return null;
  ap.cuota = cuota;
  return ap;
}
const igual = (a, b) => !!a && !!b && a.tipo === b.tipo && a.c === b.c && a.c2 === b.c2 && a.cantidad === b.cantidad;

function aplicarDeseo(j, d) {
  if (P.fase !== 'espera' && P.fase !== 'cuenta') return;
  if (j.espectador || d.ronda !== P.ronda || (d.partida ?? P.partida) !== P.partida) return;
  const antes = JSON.stringify([j.apuesta, j.loca, j.listo, j.elegida]);
  const bloqueado = j.listo && d.listo;
  // cuál de sus dos cartas secretas entra en la carrera
  if ((d.elegida === 0 || d.elegida === 1) && j.opciones?.[d.elegida] && !bloqueado) {
    j.elegida = d.elegida; j.carta = j.opciones[d.elegida];
  }
  if (!bloqueado) {
    const ap = validar(d.apuesta, P.cuotas, j.puntos, ['ganador', 'podio']);
    if (ap && !igual(ap, j.apuesta)) j.apuesta = ap;
    // apuesta loca (opcional): con lo que le quede después de la principal
    if ('loca' in d) {
      const lo = d.loca ? validar(d.loca, P.cuotas, j.puntos - (j.apuesta?.cantidad || 0), M.TIPOS_LOCOS) : null;
      if (!igual(lo, j.loca)) j.loca = lo;
    }
  }
  j.listo = !!d.listo && !!j.apuesta && (!!j.carta || !j.opciones?.length);
  if (JSON.stringify([j.apuesta, j.loca, j.listo, j.elegida]) !== antes) { comprobarInicio(); difundir(); }
}

// Votación del empujón y apuestas en directo (a mitad de carrera).
function aplicarMedio(j, d) {
  const m = P.medio;
  if (!m || d.ronda !== P.ronda || (d.partida ?? P.partida) !== P.partida || Date.now() > m.hasta + 600) return;
  if (m.fase === 'voto' && d.voto != null) {
    const c = Number(d.voto);
    if (c >= 0 && c < 4 && enJuego(c) && m.votos[j.id] !== c) { m.votos[j.id] = c; difundir(); }
  }
  if (m.fase === 'directo' && d.directo && !j.directo) {
    const ap = validar(d.directo, m.cuotas, libres(j), ['ganador', 'podio']);
    if (ap) {
      j.directo = ap;
      sfx('cuenta');
      avisoPC(`⚡ <b>${esc(j.nombre)}</b> apuesta ${ap.cantidad} 🪙 en directo: ${esc(M.textoApuesta(ap, nombres()))} (x${ap.cuota})`, 3000);
      difundir();
    }
  }
}
const enJuego = c => P.carrera && !P.carrera.corredores[c].fuera && !P.carrera.corredores[c].abducido;

function mostrarReaccion(nombre, emoji) {
  const r = document.createElement('div');
  r.className = 'reaccion';
  r.style.left = (8 + Math.random() * 84) + '%';
  r.innerHTML = `<span>${emoji}</span><small>${esc(nombre)}</small>`;
  $('reacciones').appendChild(r);
  setTimeout(() => r.remove(), 3200);
}

// Cartel grande encima del campo (sirve para nombres de jugadores, que el narrador no puede decir).
let tAviso = null;
function avisoPC(html, ms = 3500) {
  const b = $('avisoPC');
  b.innerHTML = html;
  b.classList.remove('oculto', 'entra'); void b.offsetWidth; b.classList.add('entra');
  clearTimeout(tAviso); tAviso = setTimeout(() => b.classList.add('oculto'), ms);
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
  const id = P.partida;
  $('cuenta').classList.add('oculto');
  const jugadores = Object.values(P.jugadores);
  // Los que no estaban listos (desconectados) no participan: su carta secreta no entra.
  jugadores.forEach(j => { if (!j.listo) { j.apuesta = null; j.loca = null; j.espectador = true; } });
  const secretas = jugadores.filter(j => j.listo && j.carta).map(j => ({ ...j.carta, de: j.nombre, deId: j.id }));
  P.carrera = M.nuevaCarrera(M.barajar(P.publicas.concat(P.cartaEsc ? [P.cartaEsc] : [], secretas)));
  P.fase = 'carrera'; P.cuenta = null;
  P.favorito = favorito();
  difundir();
  pintarApuestas();
  ambiente(sonido);
  if (!RAPIDO) {
    await decirSi('apuestas', null, 'Se cierran las apuestas');
    await decirSi('esc_' + P.escenario, null, '');
    if (tablero.presentar) await tablero.presentar((clave, c) => decirSi(clave, c, c !== undefined ? P.personajes[c].nombre : ''));
    await comentariosSalida();
  }
  if (id !== P.partida) return;
  $('cuenta').textContent = '¡YA!';
  $('cuenta').classList.remove('oculto', 'pulso'); void $('cuenta').offsetWidth; $('cuenta').classList.add('pulso');
  sfx('salida'); rugido(0.8);
  setTimeout(() => $('cuenta').classList.add('oculto'), 800);
  await decirSi('arrancan', null, '¡Y arrancan!');
  if (id !== P.partida) return;
  await bucle(id);
}

// ---------- narrador: apuestas y rachas ----------
// Dinero apostado a que gana (o queda en el podio) cada corredor.
function dineroPor() {
  const d = [0, 0, 0, 0];
  Object.values(P.jugadores).forEach(j => { if (j.apuesta) d[j.apuesta.c] += j.apuesta.cantidad; });
  return d;
}
function favorito() {
  const d = dineroPor();
  const apostadores = Object.values(P.jugadores).filter(j => j.apuesta).length;
  if (apostadores < 2) return null;
  const max = Math.max(...d);
  const top = [0, 1, 2, 3].filter(i => d[i] === max);
  return max > 0 && top.length === 1 ? top[0] : null;
}
// Nadie tiene una apuesta (de ningún tipo) que gane si este corredor va primero.
function nadieApostoPor(c) {
  const js = Object.values(P.jugadores).filter(j => j.apuesta);
  return js.length > 0 && !js.some(j => [j.apuesta, j.loca, j.directo].some(a => a && (a.c === c && a.tipo !== 'ultimo')));
}
async function comentariosSalida() {
  const js = Object.values(P.jugadores).filter(j => j.apuesta);
  const enRacha = js.filter(j => (j.racha || 0) >= 2).sort((a, b) => b.racha - a.racha)[0];
  if (enRacha) {
    avisoPC(`🔥 <b>${esc(enRacha.nombre)}</b> lleva ${enRacha.racha} carreras seguidas ganando apuestas`, 4500);
    await decirSi('racha', null, '¡Atención, que hay un apostador en racha!');
  }
  const todoAl = js.filter(j => j.apuesta.cantidad + (j.loca?.cantidad || 0) >= j.puntos && j.puntos >= 30).sort((a, b) => b.puntos - a.puntos)[0];
  if (todoAl) {
    avisoPC(`💸 <b>${esc(todoAl.nombre)}</b> se lo juega todo: ${todoAl.puntos} 🪙`, 4500);
    await decirSi('todo', null, '¡Alguien se lo ha jugado todo!');
  }
  if (P.favorito !== null) await decirSi('favorito', P.favorito, `${P.personajes[P.favorito].nombre} es el favorito del público`);
  const ultimo = P.ganadores[P.ganadores.length - 1];
  const repite = ultimo ? P.personajes.findIndex(p => p.id === ultimo.id) : -1;
  if (repite >= 0) await decirSi('vienedeganar', repite, `¡Ojo con ${P.personajes[repite].nombre}, que viene de ganar!`);
}

async function esperarPausa() { while (P.pausa) await espera(150); }

function claveCarta(carta) {
  if (carta.tipo === 'avanza') return 'avanza' + carta.n;
  return carta.tipo;
}

async function bucle(id) {
  const nom = nombres();
  const sigue = () => id === P.partida && P.carrera;
  while (sigue() && P.carrera.ganador === null) {
    await esperarPausa();
    const r = M.siguienteCarta(P.carrera);
    P.n++;
    P.ultima = r.carta;
    const cl = P.carrera.clasificacion;
    const foto = r.fin && (r.eventos.some(e => e.e === 'fotofinish') ||
      (!r.eventos.some(e => e.e === 'pitido') && M.margen(P.carrera) <= 1 && P.carrera.corredores[cl[1]].pos >= M.META - 1));
    red.enviar({ t: 'paso', n: P.n, carta: r.carta, eventos: r.eventos, corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, prorroga: P.carrera.prorroga, foto });
    if (r.carta.secreta) {
      mostrarSecreta(r.carta);
      sfx('silbato'); rugido(0.6);
      await decirSi('secreta', null, 'Carta secreta');
    }
    if (r.carta.escenario) { sfx('silbato'); rugido(0.9); }
    mostrarCarta(r.carta);
    const t = M.textoCarta(r.carta, nom);
    const fuerte = r.eventos.some(e => ['cae', 'placa', 'reves', 'junta', 'portal', 'lesion', 'meteorito', 'abduce', 'devuelve', 'explota', 'cohete', 'tornado', 'ola', 'avalancha', 'erupcion'].includes(e.e));
    if (fuerte) rugido(1);
    const giro = !RAPIDO && P.n % 5 === 0;
    const animacion = tablero.animar(r.eventos.filter(e => e.e !== 'gana' && e.e !== 'fotofinish'), { giro });
    // lo que pasa además de la carta (el ovni devuelve a alguien, explota una bomba, un eliminado)
    const extra = async () => {
      for (const e of r.eventos) {
        if (e.e === 'devuelve') await decirSi('devuelve', e.c, `¡El ovni devuelve a ${nom[e.c]}!`);
        if (e.e === 'explota') await decirSi('explota', e.c, `¡Explota la bomba de ${nom[e.c]}!`);
        if (e.e === 'meteorito' && e.elimina) await decirSi('eliminado', e.c, `¡${nom[e.c]} queda eliminado!`);
      }
    };
    await Promise.all([animacion, decirSi(claveCarta(r.carta), r.carta.c, `${t.titulo}. ${t.texto}`).then(extra)]);
    if (!sigue()) return;
    pintar();
    if (r.fin) {
      const g = P.carrera.ganador;
      if (foto) {
        rugido(1.2);
        await Promise.all([
          tablero.fotoFinish ? tablero.fotoFinish(cl[0], cl[1]) : espera(2500),
          decirSi('foto', null, '¡Foto finish!').then(() => decirSi('fotoespera', null, 'Un momento, que estamos mirando la foto...')),
        ]);
      }
      if (!sigue()) return;
      rugido(1.5);
      await Promise.all([tablero.animar([{ e: 'gana', c: g }]), decirSi('gana', g, `¡${nom[g]} gana la carrera!`)]);
      if (nadieApostoPor(g)) await decirSi('sorpresa', null, '¡Nadie lo vio venir!');
      else if (g === P.favorito) await decirSi('pronostico', null, '¡Se cumplen los pronósticos!');
      break;
    }
    // comentario de la situación
    const fav = P.favorito;
    const sufre = fav !== null && P.sufrido < 2 && r.eventos.some(e => (['cae', 'lesion', 'meteorito', 'abduce', 'explota'].includes(e.e) && e.c === fav) || (e.e === 'placa' && e.a.includes(fav)));
    if (r.info.rectaFinal) {
      rugido(0.7);
      await decirSi('recta', r.info.lider, `¡Recta final con ${nom[r.info.lider]} delante!`);
      if (nadieApostoPor(r.info.lider)) await decirSi('nadie', r.info.lider, `¡Y nadie ha apostado por ${nom[r.info.lider]}!`);
    } else if (sufre) { P.sufrido++; await decirSi('sufren', fav, `¡Sufren los que apostaron por ${nom[fav]}!`); }
    else if (r.info.cambioLider) await decirSi('lider', r.info.lider, `¡${nom[r.info.lider]} se pone en cabeza!`);
    else if (r.info.igualada && Math.random() < 0.5) await decirSi('igualada', null, '¡Qué igualdad!');
    // a mitad de carrera: votación del empujón y apuestas en directo
    const cabeza = Math.max(...P.carrera.corredores.filter(c => !c.fuera).map(c => c.pos));
    if (!P.medioHecho && cabeza >= M.META / 2 && P.carrera.mazo.length > 2 && Object.values(P.jugadores).some(j => j.conectado)) {
      await mitad(id);
      continue;
    }
    const fin = Date.now() + (RAPIDO ? 0 : SEGUNDOS_ENTRE_CARTAS * 1000);
    while ((Date.now() < fin || P.pausa) && sigue()) {
      if (P.pausa) { await esperarPausa(); break; }   // al quitar la pausa, sigue enseguida
      await espera(100);
    }
  }
  if (sigue()) terminar(id);
}

// ---------- mitad de carrera ----------
async function cuentaAtras() {
  let ultimoSeg = null;
  while (P.medio && Date.now() < P.medio.hasta) {
    if (P.pausa) { const resto = P.medio.hasta - Date.now(); await esperarPausa(); if (!P.medio) return; P.medio.hasta = Date.now() + resto; }
    const s = Math.ceil((P.medio.hasta - Date.now()) / 1000);
    if (s !== ultimoSeg) { ultimoSeg = s; if (s <= 3 && s > 0) sfx('cuenta'); difundir(); }
    await espera(100);
  }
}

async function mitad(id) {
  P.medioHecho = true;
  const nom = nombres();
  // 1) votación: ¿a quién empuja el público?
  P.medio = { fase: 'voto', hasta: Date.now() + SEG_VOTO * 1000, votos: {} };
  sfx('silbato'); rugido(0.6);
  difundir();
  await Promise.all([cuentaAtras(), decirSi('votacion', null, '¡Votación! ¿A quién empuja el público?')]);
  if (id !== P.partida || !P.medio) return;
  const votos = estadoMedio().votos.map((v, c) => (enJuego(c) ? v : 0));
  const max = Math.max(...votos);
  if (max === 0) {
    P.medio.fase = 'nadie'; difundir();
    await Promise.all([decirSi('novoto', null, 'Nadie ha votado. ¡Seguimos!'), espera(RAPIDO ? 0 : 1500)]);
  } else {
    const empatados = [0, 1, 2, 3].filter(c => votos[c] === max);
    const elegido = empatados[Math.floor(Math.random() * empatados.length)];
    P.medio.fase = 'empujon'; P.medio.elegido = elegido; P.medio.empate = empatados.length > 1;
    difundir();
    if (empatados.length > 1) await decirSi('empatevoto', null, '¡Empate en la votación! Lo decide la suerte...');
    const ev = M.empujar(P.carrera, elegido);
    P.n++;
    red.enviar({ t: 'paso', n: P.n, carta: null, empujon: elegido, eventos: ev, corredores: P.carrera.corredores, restantes: P.carrera.mazo.length, prorroga: P.carrera.prorroga });
    rugido(1.2);
    await Promise.all([tablero.animar(ev), decirSi('empujon', elegido, `¡El público empuja a ${nom[elegido]}!`)]);
  }
  if (id !== P.partida) return;
  // 2) apuestas en directo con las cuotas de ahora
  P.medio = { fase: 'directo', hasta: Date.now() + SEG_DIRECTO * 1000, cuotas: M.cuotasDesde(P.carrera, RAPIDO ? 300 : 1500) };
  sfx('salida');
  difundir();
  await Promise.all([cuentaAtras(), decirSi('directo', null, '¡Apuestas en directo! ¡Tenéis diez segundos!')]);
  if (id !== P.partida) return;
  P.medio = null;
  difundir();
  pintarApuestas();
  await decirSi('nova', null, '¡No va más!');
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

async function terminar(id) {
  const fin = M.resumenFinal(P.carrera);
  const g = P.personajes[fin.clasificacion[0]];
  const nom = nombres();
  P.resultados = [];
  for (const j of Object.values(P.jugadores)) {
    const apuestas = [['', j.apuesta], ['🤪 ', j.loca], ['⚡ ', j.directo]].filter(([, a]) => a);
    if (!apuestas.length) continue;
    const detalle = apuestas.map(([pre, a]) => ({ texto: `${pre}${M.textoApuesta(a, nom)} · ${a.cantidad} (x${a.cuota})`, delta: M.resultadoApuesta(a, fin) }));
    const delta = detalle.reduce((s, x) => s + x.delta, 0);
    j.puntos = Math.max(0, j.puntos + delta);
    j.racha = delta > 0 ? (j.racha || 0) + 1 : 0;
    P.resultados.push({ id: j.id, delta, detalle });
  }
  P.ganadores.push({ id: g.id, emoji: g.emoji, nombre: g.nombre, color: g.color });
  P.fase = 'resultado';
  guardar();
  difundir();
  await espera(RAPIDO ? 0 : 3500);
  if (id !== P.partida) return;
  ambiente(false);
  pintarResultado();
}

// ---------- pintar ----------
function pintar() {
  $('ronda').innerHTML = (P.ronda ? `Carrera ${P.ronda} <span class="escenario-chip">${M.ESCENARIOS[P.escenario].icono} ${M.ESCENARIOS[P.escenario].nombre}</span>` : '') +
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
    const ap = verAp && j.apuesta ? `<span class="ap" style="--color:${P.personajes[j.apuesta.c].color}">${P.personajes[j.apuesta.c].emoji} ${j.apuesta.cantidad} · ${j.apuesta.tipo === 'podio' ? 'podio' : 'gana'}${j.loca ? ' · 🤪' : ''}${j.directo ? ' · ⚡' : ''}</span>` : '';
    const medalla = lista.length > 1 && k === 0 && j.puntos > M.PUNTOS_INICIALES ? '👑 ' : '';
    const racha = (j.racha || 0) >= 2 ? ` <span class="racha" title="Carreras seguidas ganando">🔥${j.racha}</span>` : '';
    return `<li class="${j.conectado ? '' : 'apagado'} ${j.listo ? 'listo' : ''}">
      <span class="nom">${medalla}${esc(j.nombre)}${racha}</span><span class="pts">${j.puntos} 🪙</span>
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
      $('mazo').innerHTML = (P.cartaEsc ? cartaHTML(P.cartaEsc, P.personajes, 'mini') : '') + orden.map(c => cartaHTML(c, P.personajes, 'mini')).join('') +
        `<div class="secretas" id="secretas"></div>`;
    }
    const n = Object.values(P.jugadores).filter(j => !j.espectador && j.opciones && j.conectado).length;
    $('secretas').innerHTML = n ? `<div class="dorso caos-dorso mini-dorso">+${n}</div><small>secretas</small>` : '';
    $('tituloMazo').innerHTML = `Las ${P.publicas.length}${P.cartaEsc ? ' + 1' : ''} cartas de esta carrera <span class="suave">· el orden es secreto · llegan al menos 2 · cada móvil añade una secreta del caos${P.cartaEsc ? ` · ${M.ESCENARIOS[P.escenario].icono} carta del escenario` : ''}</span>`;
  }
  pintarMedio();
}

// Durante la carrera: quién ha apostado por cada corredor.
function pintarApuestas() {
  const nom = nombres();
  $('apuestasCarrera').innerHTML = P.personajes.map((p, i) => {
    const js = Object.values(P.jugadores).filter(j => j.apuesta && j.apuesta.c === i);
    return `<div class="ap-corredor" style="--color:${p.color}">
      <div class="ap-cab"><span class="cara-redonda mini" style="--color:${p.color}">${caraHTML(p)}</span><b>${esc(p.nombre)}</b></div>
      <div class="ap-lista">${js.map(j => `<span class="chip">${esc(j.nombre)} · ${j.apuesta.cantidad}${j.apuesta.tipo === 'podio' ? ' 🥈' : ' 🏆'}</span>`).join('') || '<span class="suave">nadie</span>'}</div>
    </div>`;
  }).join('');
  const otras = Object.values(P.jugadores).flatMap(j => [['🤪', j.loca], ['⚡', j.directo]].filter(([, a]) => a).map(([ic, a]) => `<span class="chip">${ic} ${esc(j.nombre)}: ${esc(M.textoApuesta(a, nom))} · ${a.cantidad}</span>`));
  $('apuestasLocas').innerHTML = otras.join('');
}

// Ventana de la votación / apuestas en directo encima del campo.
function pintarMedio() {
  const caja = $('medio');
  const m = estadoMedio();
  if (!m || P.fase !== 'carrera') { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  caja.dataset.fase = m.fase;
  const total = m.votos.reduce((a, b) => a + b, 0);
  let titulo = '', cuerpo = '';
  if (m.fase === 'voto' || m.fase === 'nadie' || m.fase === 'empujon') {
    titulo = m.fase === 'nadie' ? '🤷 Nadie ha votado' : m.fase === 'empujon' ? `📣 ¡Empujón para ${esc(P.personajes[m.elegido].nombre)}!` : '📣 ¿A quién empuja el público? <small>Votad en el móvil</small>';
    cuerpo = P.personajes.map((p, i) => `
      <div class="voto ${m.elegido === i ? 'elegido' : ''} ${enJuego(i) ? '' : 'fuera'}" style="--color:${p.color}">
        <div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div>
        <b>${esc(p.nombre)}</b>
        <div class="barra-voto"><i style="width:${total ? Math.round(m.votos[i] / total * 100) : 0}%"></i></div>
        <span class="n-votos">${m.votos[i]} 🗳️</span>
      </div>`).join('');
  } else if (m.fase === 'directo') {
    titulo = '⚡ ¡Apuestas en directo! <small>Las cuotas de ahora mismo · apuesta desde el móvil</small>';
    const directos = Object.values(P.jugadores).filter(j => j.directo);
    cuerpo = P.personajes.map((p, i) => `
      <div class="voto ${m.cuotas.ganador[i] ? '' : 'fuera'}" style="--color:${p.color}">
        <div class="cara-redonda" style="--color:${p.color}">${caraHTML(p)}</div>
        <b>${esc(p.nombre)}</b>
        <div class="cuotas"><span>🏆 ${m.cuotas.ganador[i] ? 'x' + m.cuotas.ganador[i] : '—'}</span><span>🥈 ${m.cuotas.podio[i] ? 'x' + m.cuotas.podio[i] : '—'}</span></div>
        <div class="ap-lista">${directos.filter(j => j.directo.c === i).map(j => `<span class="chip">${esc(j.nombre)} ${j.directo.cantidad}</span>`).join('')}</div>
      </div>`).join('');
  }
  const seg = m.fase === 'voto' || m.fase === 'directo' ? `<div class="medio-reloj">${m.quedan}</div>` : '';
  caja.innerHTML = `<div class="medio-cab"><h2>${titulo}</h2>${seg}</div><div class="medio-cuerpo">${cuerpo}</div>`;
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
  $('resTabla').innerHTML = filas.map(({ r, j }) => `<tr class="${j.id === mejor ? 'mejor' : ''}"><td>${j.id === mejor ? '🏅 ' : ''}${esc(j.nombre)}${(j.racha || 0) >= 2 ? ` 🔥${j.racha}` : ''}</td>
      <td>${r.detalle.map(d => `<div class="linea-ap"><span>${esc(d.texto)}</span> <b class="${d.delta >= 0 ? 'mas' : 'menos'}">${d.delta >= 0 ? '+' : ''}${d.delta}</b></div>`).join('')}</td>
      <td class="${r.delta >= 0 ? 'mas' : 'menos'}">${r.delta >= 0 ? '+' : ''}${r.delta}</td><td>${j.puntos} 🪙</td></tr>`).join('') || '<tr><td colspan="4">Nadie apostó</td></tr>';
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
  $('bReiniciar').onclick = () => {
    if (!RAPIDO && !confirm(`¿Empezar la partida de cero?\nTodos vuelven a tener ${M.PUNTOS_INICIALES} monedas, se borran las rachas y los ganadores, y se vuelve a la carrera 1.${P.fase === 'carrera' ? '\nLa carrera que está en marcha se cancela.' : ''}`)) return;
    reiniciarPartida();
  };
  $('jugadores').onclick = e => {
    const b = e.target.closest('.echar'); if (!b) return;
    const j = P.jugadores[b.dataset.id]; if (!j) return;
    if (!RAPIDO && !confirm(`¿Echar a ${j.nombre} de la partida?`)) return;
    echar(j.id);
  };
}

// Empieza la partida de cero: todos con las monedas iniciales, sin rachas ni ganadores, carrera 1.
// Los que están desconectados salen de la lista (si vuelven, entran como nuevos con las monedas iniciales).
export function reiniciarPartida() {
  P.partida++;
  clearTimeout(temporizador);
  callar(); ambiente(false);
  $('cuenta').classList.add('oculto');
  P.pausa = false; P.medio = null; P.ronda = 0; P.ganadores = [];
  for (const [id, j] of Object.entries(P.jugadores)) {
    if (!j.conectado) { delete P.jugadores[id]; continue; }
    j.puntos = M.PUNTOS_INICIALES; j.racha = 0;
  }
  nuevaCarrera();
  sfx('silbato');
  avisoPC(`🔄 ¡Partida nueva! Todos empiezan con ${M.PUNTOS_INICIALES} 🪙`, 4000);
}

export function echar(id) {
  const j = P.jugadores[id]; if (!j) return;
  if (P.fase === 'espera' || P.fase === 'cuenta') devolver(j);   // sus cartas secretas vuelven a la reserva
  delete P.jugadores[id];
  if (P.medio?.votos) delete P.medio.votos[id];
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
  try { localStorage.setItem('estampida-catalogo', catalogo); localStorage.setItem('estampida-escenario', $('sEscenario').value); } catch {}
  todos = await cargarPersonajes(catalogo).catch(() => []);
  // hacen falta 4: si el catálogo tiene menos (p. ej. aún pocos reales), se completa con los muñecos 3D de prueba
  if (todos.length < 4) {
    const extra = await cargarPersonajes('personajes/3d-bumeran/personajes.json').catch(() => []);
    const ya = new Set(todos.map(p => p.nombre));            // sin repetir persona (p. ej. Alber real y el de prueba)
    todos = todos.concat(M.barajar(extra.filter(p => !ya.has(p.nombre))).slice(0, 4 - todos.length));
  }
  await cargarNarrador();
  if (!params.has('2d')) {
    try { ({ Tablero3D } = await import('./tablero3d.js?v=202611161756')); usar3D = (await import('./tablero3d.js?v=202611161756')).hay3D(); }
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
  window.__estampida = { P, echar, reiniciarPartida, M, tablero: () => tablero };       // para pruebas
}

try {
  const c = localStorage.getItem('estampida-catalogo'); if (c) $('sCatalogo').value = c;
  const e = localStorage.getItem('estampida-escenario'); if (e) $('sEscenario').value = e;
} catch {}
$('bEmpezar').onclick = arrancar;
if (params.has('auto')) arrancar();
