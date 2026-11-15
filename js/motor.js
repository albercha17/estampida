// Motor de Estampida: cartas, reglas de la carrera, ganador garantizado y cuotas.
// Es puro (sin DOM ni red): lo usan la pantalla del PC, los móviles y las pruebas en Node.
//
// Dos mazos:
//  - BASE: de aquí salen las 20 cartas públicas. Son previsibles y se eligen de modo que, jugadas
//    todas, al menos 2 corredores lleguen a la meta (en cualquier orden).
//  - CAOS: de aquí sale la carta secreta de cada móvil. Son las que pueden darle la vuelta a la carrera.

export const META = 12;          // casillas desde la salida (0) hasta la meta
export const CARRILES = 4;
export const CARTAS_PUBLICAS = 20;
export const MIN_LLEGAN = 2;     // con solo las públicas, como mínimo llegan 2
export const MAX_PRORROGA = 30;  // tope de cartas en prórroga: después gana el que vaya delante

// ---------- azar con semilla (para pruebas reproducibles) ----------
export function crearAzar(semilla = Date.now()) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function barajar(lista, azar = Math.random) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- catálogo de cartas ----------
// Cartas de carril (c = 0..3): afectan al corredor de ese carril, sea quien sea en esta partida.
const BASE_CARRIL = [
  { tipo: 'avanza', n: 1, copias: 1 },
  { tipo: 'avanza', n: 2, copias: 2 },
  { tipo: 'avanza', n: 3, copias: 2 },
  { tipo: 'avanza', n: 4, copias: 1 },
  { tipo: 'retrocede', n: 1, copias: 1 },
  { tipo: 'tropiezo', copias: 1 },
  { tipo: 'sprint', copias: 1 },
];
const BASE_GLOBAL = [
  { tipo: 'mele', copias: 3 },
  { tipo: 'estampida', copias: 1 },
  { tipo: 'viento', copias: 1 },
  { tipo: 'patada', copias: 1 },
  { tipo: 'grada', copias: 1 },
];
const CAOS_CARRIL = [
  { tipo: 'turbo', copias: 1 },        // avanza 5
  { tipo: 'atajo', copias: 1 },        // se pone en la casilla del primero
  { tipo: 'intercambio', copias: 1 },  // se cambia la casilla con el primero
  { tipo: 'placaje', copias: 1 },      // tira al primero
  { tipo: 'calambre', copias: 1 },     // retrocede 3
  { tipo: 'roja', copias: 1 },         // no avanza en sus 3 próximos avances
];
const CAOS_GLOBAL = [
  { tipo: 'cambiazo', copias: 2 },
  { tipo: 'reves', copias: 1 },
  { tipo: 'barro', copias: 1 },
  { tipo: 'junta', copias: 1 },
  { tipo: 'remontada', copias: 2 },
  { tipo: 'amarilla', copias: 2 },
  { tipo: 'adelantado', copias: 2 },
  { tipo: 'fisio', copias: 1 },
];

export const INFO = {
  avanza:      { titulo: '¡Carrerón!',        icono: '💨', texto: '{P} avanza {n}' },
  retrocede:   { titulo: 'Resbalón',          icono: '🍌', texto: '{P} retrocede {n}' },
  tropiezo:    { titulo: '¡Tropiezo!',        icono: '🤕', texto: '{P} cae al suelo. Su próximo avance solo le sirve para levantarse' },
  sprint:      { titulo: 'Sprint',            icono: '⚡', texto: '{P} avanza 2. Si va último, avanza 4' },
  mele:        { titulo: 'Melé',              icono: '🤼', texto: 'Todos avanzan 1' },
  estampida:   { titulo: '¡ESTAMPIDA!',       icono: '🐃', texto: 'Todos avanzan 2' },
  viento:      { titulo: 'Viento en contra',  icono: '🌬️', texto: 'Todos retroceden 1' },
  patada:      { titulo: 'Patada a seguir',   icono: '🏉', texto: 'El que va último avanza 3' },
  grada:       { titulo: 'La grada empuja',   icono: '📣', texto: 'Todos menos el primero avanzan 1' },
  // caos
  turbo:       { titulo: '¡TURBO!',           icono: '🚀', texto: '{P} avanza 5' },
  atajo:       { titulo: 'Atajo secreto',     icono: '🕳️', texto: '{P} aparece en la casilla del que va primero' },
  intercambio: { titulo: 'Intercambio',       icono: '🔀', texto: '{P} se cambia la casilla con el que va primero' },
  placaje:     { titulo: '¡Placaje!',         icono: '💥', texto: '{P} placa al que va primero y lo tira al suelo. Si el primero es {P}, avanza 2' },
  calambre:    { titulo: 'Calambre',          icono: '🦵', texto: '{P} retrocede 3' },
  roja:        { titulo: 'Tarjeta roja',      icono: '🟥', texto: '{P} no se mueve en sus 3 próximos avances' },
  cambiazo:    { titulo: 'Cambiazo',          icono: '🔄', texto: 'El primero y el último se intercambian las casillas' },
  reves:       { titulo: '¡TODO AL REVÉS!',   icono: '🙃', texto: 'La clasificación se da la vuelta: el último pasa a la casilla del primero, y así con todos' },
  barro:       { titulo: 'Barro',             icono: '💩', texto: 'Los que van primeros resbalan y caen al suelo' },
  junta:       { titulo: 'Melé general',      icono: '🫂', texto: 'Todos se juntan en la casilla del que va segundo' },
  remontada:   { titulo: 'Remontada',         icono: '🔥', texto: 'El que va último avanza 5' },
  amarilla:    { titulo: 'Tarjeta amarilla',  icono: '🟨', texto: 'El que va primero no se mueve en sus 2 próximos avances' },
  adelantado:  { titulo: 'Pase adelantado',   icono: '🚩', texto: 'Falta: el que va primero retrocede 3' },
  fisio:       { titulo: 'Fisio al campo',    icono: '🩹', texto: 'Los caídos y sancionados se recuperan y avanzan 2' },
};
export const TIPOS_CAOS = new Set([...CAOS_CARRIL, ...CAOS_GLOBAL].map(d => d.tipo));

function construir(carril, global, prefijo, secreta) {
  const mazo = [];
  let k = 0;
  for (let c = 0; c < CARRILES; c++) {
    for (const d of carril) {
      for (let i = 0; i < d.copias; i++) mazo.push({ id: prefijo + (k++), tipo: d.tipo, c, n: d.n, ...(secreta ? { secreta: true } : {}) });
    }
  }
  for (const d of global) {
    for (let i = 0; i < d.copias; i++) mazo.push({ id: prefijo + (k++), tipo: d.tipo, ...(secreta ? { secreta: true } : {}) });
  }
  return mazo;
}
export const mazoBase = () => construir(BASE_CARRIL, BASE_GLOBAL, 'b', false);
export const mazoCaos = () => construir(CAOS_CARRIL, CAOS_GLOBAL, 'x', true);
export const mazoCompleto = () => mazoBase().concat(mazoCaos());

// Texto de una carta con los nombres de los corredores de esta partida.
export function textoCarta(carta, nombres = ['Carril 1', 'Carril 2', 'Carril 3', 'Carril 4']) {
  const inf = INFO[carta.tipo];
  const P = carta.c !== undefined ? nombres[carta.c] : '';
  return {
    titulo: inf.titulo,
    icono: inf.icono,
    texto: inf.texto.replaceAll('{P}', P).replaceAll('{n}', carta.n ?? ''),
    carril: carta.c,
  };
}

// ---------- estado de una carrera ----------
export function nuevaCarrera(mazoCarrera) {
  return {
    corredores: Array.from({ length: CARRILES }, () => ({ pos: 0, caido: false, sancion: 0, marca: 0 })),
    mazo: mazoCarrera.slice(),   // cartas por salir, en orden
    jugadas: [],
    tic: 0,
    prorroga: false,
    cartasProrroga: 0,
    ganador: null,
    clasificacion: null,
    fotoFinish: false,
  };
}

// Orden de los corredores: más avanzado primero; a igual casilla, el que llegó antes.
export function orden(est) {
  return [0, 1, 2, 3].sort((a, b) => {
    const A = est.corredores[a], B = est.corredores[b];
    return (B.pos - A.pos) || (A.marca - B.marca) || (a - b);
  });
}

function extremos(est) {
  const ps = est.corredores.map(c => c.pos);
  return { max: Math.max(...ps), min: Math.min(...ps) };
}
function primeros(est) {
  const { max, min } = extremos(est);
  if (max === min) return [];              // todos empatados: nadie destaca
  return [0, 1, 2, 3].filter(i => est.corredores[i].pos === max);
}
function ultimos(est) {
  const { max, min } = extremos(est);
  if (max === min) return [];
  return [0, 1, 2, 3].filter(i => est.corredores[i].pos === min);
}

// Mueve un corredor y anota los eventos para las animaciones.
function mover(est, c, n, ev) {
  const r = est.corredores[c];
  if (n > 0) {
    if (r.caido) { r.caido = false; ev.push({ e: 'levanta', c }); return; }
    if (r.sancion > 0) { r.sancion--; ev.push({ e: 'sancionado', c, quedan: r.sancion }); return; }
    const de = r.pos;
    r.pos += n;
    r.marca = ++est.tic;
    ev.push({ e: 'mueve', c, de, a: r.pos });
  } else if (n < 0) {
    const de = r.pos;
    r.pos = Math.max(0, r.pos + n);
    if (r.pos !== de) { r.marca = ++est.tic; ev.push({ e: 'mueve', c, de, a: r.pos }); }
    else ev.push({ e: 'nada', c });
  }
}
// Coloca a un corredor en una casilla (teletransporte, intercambios): no le afectan caídas ni sanciones.
function colocarEn(est, c, pos, ev) {
  const r = est.corredores[c];
  if (r.pos === pos) return;
  ev.push({ e: 'mueve', c, de: r.pos, a: pos, salto: true });
  r.pos = pos;
  r.marca = ++est.tic;
}

function tirar(est, c, ev) {
  const r = est.corredores[c];
  if (r.caido) {               // ya estaba en el suelo: lesión
    ev.push({ e: 'lesion', c });
    mover(est, c, -2, ev);
  } else {
    r.caido = true;
    ev.push({ e: 'cae', c });
  }
}

function aplicar(est, carta, ev) {
  const t = carta.tipo;
  switch (t) {
    case 'avanza': mover(est, carta.c, carta.n, ev); break;
    case 'retrocede': mover(est, carta.c, -carta.n, ev); break;
    case 'tropiezo': tirar(est, carta.c, ev); break;
    case 'sprint': mover(est, carta.c, ultimos(est).includes(carta.c) ? 4 : 2, ev); break;
    case 'mele': for (let i = 0; i < CARRILES; i++) mover(est, i, 1, ev); break;
    case 'estampida': for (let i = 0; i < CARRILES; i++) mover(est, i, 2, ev); break;
    case 'viento': for (let i = 0; i < CARRILES; i++) mover(est, i, -1, ev); break;
    case 'patada': {
      const ul = ultimos(est);
      if (!ul.length) { ev.push({ e: 'nada' }); break; }
      ul.forEach(i => mover(est, i, 3, ev));
      break;
    }
    case 'grada': {
      const pr = primeros(est);
      for (let i = 0; i < CARRILES; i++) if (!pr.includes(i)) mover(est, i, 1, ev);
      break;
    }
    // ----- caos -----
    case 'turbo': mover(est, carta.c, 5, ev); break;
    case 'calambre': mover(est, carta.c, -3, ev); break;
    case 'roja': est.corredores[carta.c].sancion = 3; ev.push({ e: 'roja', c: carta.c }); break;
    case 'atajo': {
      const { max } = extremos(est);
      if (est.corredores[carta.c].pos === max) { ev.push({ e: 'nada', c: carta.c }); break; }
      ev.push({ e: 'portal', c: carta.c });
      colocarEn(est, carta.c, max, ev);
      break;
    }
    case 'intercambio': {
      const lider = orden(est)[0];
      const yo = est.corredores[carta.c], el = est.corredores[lider];
      if (lider === carta.c || yo.pos === el.pos) { ev.push({ e: 'nada', c: carta.c }); break; }
      const a = yo.pos, b = el.pos;
      ev.push({ e: 'portal', c: carta.c }, { e: 'portal', c: lider });
      colocarEn(est, carta.c, b, ev); colocarEn(est, lider, a, ev);
      break;
    }
    case 'placaje': {
      const pr = primeros(est);
      if (pr.includes(carta.c)) { mover(est, carta.c, 2, ev); break; }
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'placa', c: carta.c, a: pr });
      pr.forEach(i => tirar(est, i, ev));
      break;
    }
    case 'amarilla': {
      const pr = primeros(est);
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => { est.corredores[i].sancion = 2; ev.push({ e: 'amarilla', c: i }); });
      break;
    }
    case 'adelantado': {
      const pr = primeros(est);
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => mover(est, i, -3, ev));
      break;
    }
    case 'remontada': {
      const ul = ultimos(est);
      if (!ul.length) { ev.push({ e: 'nada' }); break; }
      ul.forEach(i => mover(est, i, 5, ev));
      break;
    }
    case 'barro': {
      const pr = primeros(est);
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => tirar(est, i, ev));
      break;
    }
    case 'fisio': {
      let alguno = false;
      for (let i = 0; i < CARRILES; i++) {
        const r = est.corredores[i];
        if (r.caido || r.sancion > 0) {
          alguno = true;
          r.caido = false; r.sancion = 0;
          ev.push({ e: 'recupera', c: i });
          mover(est, i, 2, ev);
        }
      }
      if (!alguno) ev.push({ e: 'nada' });
      break;
    }
    case 'cambiazo': {
      const o = orden(est);
      const a = o[0], b = o[3];
      const pa = est.corredores[a].pos, pb = est.corredores[b].pos;
      if (pa === pb) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'portal', c: a }, { e: 'portal', c: b });
      colocarEn(est, a, pb, ev); colocarEn(est, b, pa, ev);
      break;
    }
    case 'reves': {
      const o = orden(est);
      const pos = o.map(i => est.corredores[i].pos);
      if (pos[0] === pos[3]) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'reves' });
      o.forEach((i, k) => colocarEn(est, i, pos[3 - k], ev));
      break;
    }
    case 'junta': {
      const o = orden(est);
      const destino = est.corredores[o[1]].pos;
      ev.push({ e: 'junta' });
      o.forEach(i => colocarEn(est, i, destino, ev));
      break;
    }
    default: throw new Error('Carta desconocida: ' + t);
  }
}

// Saca la siguiente carta y la aplica. Devuelve { carta, eventos, fin }.
// Garantiza que siempre acaba con un ganador.
export function siguienteCarta(est, azar = Math.random) {
  if (est.ganador !== null) return null;
  const ev = [];
  if (!est.mazo.length) {
    // Prórroga: se barajan las cartas ya jugadas y, además, cada carta empuja a todos 1 casilla.
    est.mazo = barajar(est.jugadas, azar);
    est.jugadas = [];
    if (!est.prorroga) ev.push({ e: 'prorroga' });
    est.prorroga = true;
  }
  const carta = est.mazo.shift();
  est.jugadas.push(carta);
  const antes = est.corredores.map(r => r.pos);
  const liderAntes = orden(est)[0];
  aplicar(est, carta, ev);
  if (est.prorroga) {
    est.cartasProrroga++;
    ev.push({ e: 'empuje' });
    for (let i = 0; i < CARRILES; i++) mover(est, i, 1, ev);
  }
  comprobarFin(est, antes, azar, ev);
  // información para el narrador
  const o = orden(est);
  const info = {
    lider: o[0],
    cambioLider: o[0] !== liderAntes && est.corredores[o[0]].pos > est.corredores[o[1]].pos,
    rectaFinal: est.corredores[o[0]].pos >= META - 3 && Math.max(...antes) < META - 3,
    igualada: est.corredores[o[0]].pos - est.corredores[o[3]].pos <= 1 && est.corredores[o[0]].pos >= 4,
  };
  return { carta, eventos: ev, fin: est.ganador !== null, info };
}

function comprobarFin(est, antes, azar, ev) {
  let llegan = [0, 1, 2, 3].filter(i => est.corredores[i].pos >= META);
  if (!llegan.length && est.prorroga && est.cartasProrroga >= MAX_PRORROGA) {
    llegan = [orden(est)[0]];          // tope de seguridad: gana el que va delante
    ev.push({ e: 'pitido' });
  }
  if (!llegan.length) return;
  let g;
  if (llegan.length === 1) g = llegan[0];
  else {
    // Varios cruzan con la misma carta: gana el que llega más lejos; si no, el que iba delante;
    // si siguen empatados, foto finish (azar).
    const max = Math.max(...llegan.map(i => est.corredores[i].pos));
    let c = llegan.filter(i => est.corredores[i].pos === max);
    if (c.length > 1) {
      const mb = Math.max(...c.map(i => antes[i]));
      c = c.filter(i => antes[i] === mb);
    }
    if (c.length > 1) { est.fotoFinish = true; ev.push({ e: 'fotofinish', entre: c.slice() }); }
    g = c[Math.floor(azar() * c.length)];
  }
  est.ganador = g;
  const resto = orden(est).filter(i => i !== g);
  est.clasificacion = [g, ...resto];
  ev.push({ e: 'gana', c: g });
}

// Juega una carrera entera (para simular).
export function jugarEntera(mazoCarrera, azar = Math.random) {
  const est = nuevaCarrera(mazoCarrera);
  let n = 0;
  while (est.ganador === null) { siguienteCarta(est, azar); n++; }
  return { ganador: est.ganador, clasificacion: est.clasificacion, cartas: n, prorroga: est.prorroga, foto: est.fotoFinish };
}

// Juega TODAS las cartas sin parar en la meta y cuenta cuántos corredores la alcanzarían.
export function cuantosLlegan(cartas) {
  const est = nuevaCarrera(cartas);
  const llego = [false, false, false, false];
  const ev = [];
  for (const c of cartas) {
    aplicar(est, c, ev);
    est.corredores.forEach((r, i) => { if (r.pos >= META) llego[i] = true; });
    ev.length = 0;
  }
  return llego.filter(Boolean).length;
}

// ---------- preparación de una partida ----------
// Elige las 20 cartas públicas de forma que, jugadas en cualquier orden, lleguen al menos 2 corredores.
// Devuelve también la reserva del mazo del caos (de ahí salen las cartas secretas de los móviles).
export function prepararMazo(azar = Math.random, ordenesPrueba = 400) {
  const base = mazoBase();
  let publicas = null;
  for (let intento = 0; intento < 5000 && !publicas; intento++) {
    const cand = barajar(base, azar).slice(0, CARTAS_PUBLICAS);
    let valida = true;
    for (let k = 0; k < ordenesPrueba && valida; k++) {
      if (cuantosLlegan(barajar(cand, azar)) < MIN_LLEGAN) valida = false;
    }
    if (valida) publicas = cand;
  }
  return { publicas, reserva: barajar(mazoCaos(), azar) };
}

// ---------- cuotas ----------
// Simula muchas carreras con las cartas públicas más tantas cartas del caos al azar como jugadores haya
// (las secretas no se conocen) y saca las cuotas.
export const MARGEN = 0.9;
export function calcularCuotas(publicas, sims = 3000, azar = Math.random, secretas = 2) {
  const gana = [0, 0, 0, 0], podio = [0, 0, 0, 0];
  const caos = mazoCaos();
  for (let s = 0; s < sims; s++) {
    const extra = secretas > 0 ? barajar(caos, azar).slice(0, secretas) : [];
    const r = jugarEntera(barajar(publicas.concat(extra), azar), azar);
    gana[r.ganador]++;
    podio[r.clasificacion[0]]++; podio[r.clasificacion[1]]++;
  }
  const cuota = (p, min, max) => Math.round(Math.min(max, Math.max(min, MARGEN / Math.max(p, 0.001))) * 10) / 10;
  return {
    probGana: gana.map(x => x / sims),
    probPodio: podio.map(x => x / sims),
    ganador: gana.map(x => cuota(x / sims, 1.2, 15)),
    podio: podio.map(x => cuota(x / sims, 1.1, 8)),
  };
}

// ---------- apuestas ----------
export const PUNTOS_INICIALES = 100;
export const RESCATE = 20;            // si alguien se queda a 0, empieza la siguiente carrera con esto
export const APUESTA_MIN = 5;

// apuesta = { c, tipo: 'ganador'|'podio', cantidad, cuota }
export function resultadoApuesta(apuesta, clasificacion) {
  if (!apuesta) return 0;
  const acierta = apuesta.tipo === 'ganador'
    ? clasificacion[0] === apuesta.c
    : clasificacion.slice(0, 2).includes(apuesta.c);
  return acierta ? Math.round(apuesta.cantidad * (apuesta.cuota - 1)) : -apuesta.cantidad;
}
