// Motor de Estampida: cartas, reglas de la carrera, ganador garantizado y cuotas.
// Es puro (sin DOM ni red): lo usan la pantalla del PC, los móviles y las pruebas en Node.

export const META = 12;          // casillas desde la salida (0) hasta la meta
export const CARRILES = 4;
export const CARTAS_PUBLICAS = 20;
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
// Cartas globales: afectan a varios a la vez.
const DE_CARRIL = [
  { tipo: 'avanza', n: 2, copias: 2 },
  { tipo: 'avanza', n: 3, copias: 3 },
  { tipo: 'avanza', n: 4, copias: 2 },
  { tipo: 'retrocede', n: 1, copias: 1 },
  { tipo: 'tropiezo', copias: 1 },
  { tipo: 'sprint', copias: 1 },
  { tipo: 'placaje', copias: 1 },
];
const GLOBALES = [
  { tipo: 'mele', copias: 4 },
  { tipo: 'estampida', copias: 2 },
  { tipo: 'viento', copias: 1 },
  { tipo: 'amarilla', copias: 2 },
  { tipo: 'patada', copias: 2 },
  { tipo: 'adelantado', copias: 2 },
  { tipo: 'fisio', copias: 2 },
  { tipo: 'cambiazo', copias: 1 },
  { tipo: 'grada', copias: 2 },
];

export const INFO = {
  avanza:     { titulo: '¡Carrerón!',       icono: '💨', texto: '{P} avanza {n}' },
  retrocede:  { titulo: 'Resbalón',         icono: '🍌', texto: '{P} retrocede {n}' },
  tropiezo:   { titulo: '¡Tropiezo!',       icono: '🤕', texto: '{P} cae al suelo. Su próximo avance solo le sirve para levantarse' },
  sprint:     { titulo: 'Sprint',           icono: '⚡', texto: '{P} avanza 2. Si va último, avanza 4' },
  placaje:    { titulo: '¡Placaje!',        icono: '💥', texto: '{P} placa al que va primero y lo tira al suelo. Si el primero es {P}, avanza 1' },
  mele:       { titulo: 'Melé',             icono: '🤼', texto: 'Todos avanzan 1' },
  estampida:  { titulo: '¡ESTAMPIDA!',      icono: '🐃', texto: 'Todos avanzan 2' },
  viento:     { titulo: 'Viento en contra', icono: '🌬️', texto: 'Todos retroceden 1' },
  amarilla:   { titulo: 'Tarjeta amarilla', icono: '🟨', texto: 'El que va primero no se mueve en sus 2 próximos avances' },
  patada:     { titulo: 'Patada a seguir',  icono: '🏉', texto: 'El que va último avanza 3' },
  adelantado: { titulo: 'Pase adelantado',  icono: '🚩', texto: 'Falta: el que va primero retrocede 2' },
  fisio:      { titulo: 'Fisio al campo',   icono: '🩹', texto: 'Los caídos y sancionados se recuperan y avanzan 1' },
  cambiazo:   { titulo: 'Cambiazo',         icono: '🔄', texto: 'El primero y el último se intercambian las casillas' },
  grada:      { titulo: 'La grada empuja',  icono: '📣', texto: 'Todos menos el primero avanzan 1' },
};

export function mazoCompleto() {
  const mazo = [];
  let k = 0;
  for (let c = 0; c < CARRILES; c++) {
    for (const d of DE_CARRIL) {
      for (let i = 0; i < d.copias; i++) mazo.push({ id: 'k' + (k++), tipo: d.tipo, c, n: d.n });
    }
  }
  for (const d of GLOBALES) {
    for (let i = 0; i < d.copias; i++) mazo.push({ id: 'k' + (k++), tipo: d.tipo });
  }
  return mazo;
}

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

function primeros(est) {
  const max = Math.max(...est.corredores.map(c => c.pos));
  const min = Math.min(...est.corredores.map(c => c.pos));
  if (max === min) return [];              // todos empatados: nadie destaca
  return [0, 1, 2, 3].filter(i => est.corredores[i].pos === max);
}
function ultimos(est) {
  const max = Math.max(...est.corredores.map(c => c.pos));
  const min = Math.min(...est.corredores.map(c => c.pos));
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
    case 'sprint': {
      const ult = ultimos(est);
      mover(est, carta.c, ult.includes(carta.c) ? 4 : 2, ev);
      break;
    }
    case 'placaje': {
      const pr = primeros(est);
      if (pr.includes(carta.c)) { mover(est, carta.c, 1, ev); break; }
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'placa', c: carta.c, a: pr });
      pr.forEach(i => tirar(est, i, ev));
      break;
    }
    case 'mele': for (let i = 0; i < CARRILES; i++) mover(est, i, 1, ev); break;
    case 'estampida': for (let i = 0; i < CARRILES; i++) mover(est, i, 2, ev); break;
    case 'viento': for (let i = 0; i < CARRILES; i++) mover(est, i, -1, ev); break;
    case 'amarilla': {
      const pr = primeros(est);
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => { est.corredores[i].sancion = 2; ev.push({ e: 'amarilla', c: i }); });
      break;
    }
    case 'patada': {
      const ul = ultimos(est);
      if (!ul.length) { ev.push({ e: 'nada' }); break; }
      ul.forEach(i => mover(est, i, 3, ev));
      break;
    }
    case 'adelantado': {
      const pr = primeros(est);
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => mover(est, i, -2, ev));
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
          mover(est, i, 1, ev);
        }
      }
      if (!alguno) ev.push({ e: 'nada' });
      break;
    }
    case 'cambiazo': {
      const o = orden(est);
      const a = o[0], b = o[3];
      const A = est.corredores[a], B = est.corredores[b];
      if (A.pos === B.pos) { ev.push({ e: 'nada' }); break; }
      const pa = A.pos, pb = B.pos;
      A.pos = pb; B.pos = pa;
      A.marca = ++est.tic; B.marca = ++est.tic;
      ev.push({ e: 'mueve', c: a, de: pa, a: pb }, { e: 'mueve', c: b, de: pb, a: pa });
      break;
    }
    case 'grada': {
      const pr = primeros(est);
      for (let i = 0; i < CARRILES; i++) if (!pr.includes(i)) mover(est, i, 1, ev);
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
  aplicar(est, carta, ev);
  if (est.prorroga) {
    est.cartasProrroga++;
    ev.push({ e: 'empuje' });
    for (let i = 0; i < CARRILES; i++) mover(est, i, 1, ev);
  }
  comprobarFin(est, antes, azar, ev);
  return { carta, eventos: ev, fin: est.ganador !== null };
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

// ---------- preparación de una partida ----------
// Devuelve las 20 cartas públicas y el resto del mazo (de donde salen las cartas secretas de los móviles).
export function prepararMazo(azar = Math.random) {
  const todo = barajar(mazoCompleto(), azar);
  return { publicas: todo.slice(0, CARTAS_PUBLICAS), reserva: todo.slice(CARTAS_PUBLICAS) };
}

// ---------- cuotas ----------
// Simula muchas carreras con las cartas públicas (las secretas no se conocen) y saca cuotas.
export const MARGEN = 0.9;
export function calcularCuotas(publicas, sims = 3000, azar = Math.random) {
  const gana = [0, 0, 0, 0], podio = [0, 0, 0, 0];
  for (let s = 0; s < sims; s++) {
    const r = jugarEntera(barajar(publicas, azar), azar);
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
