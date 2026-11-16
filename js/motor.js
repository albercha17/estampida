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
  // especiales (16 nov 2026)
  { tipo: 'mediavuelta', copias: 1 },  // se da la vuelta: sus 3 próximos avances son hacia atrás
  { tipo: 'meteorito', copias: 1 },    // le cae un meteorito: eliminado
  { tipo: 'ovni', copias: 1 },         // un ovni se lo lleva y lo suelta 3 cartas después, 6 casillas más adelante
  { tipo: 'cohete', copias: 1 },       // avanza 7 pero aterriza de cabeza (cae)
  { tipo: 'bomba', copias: 1 },        // lleva una bomba: a las 3 cartas explota (retrocede 4, cae, y tira a los de su casilla)
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
  { tipo: 'tornado', copias: 1 },      // un tornado mezcla las casillas de todos
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
  mediavuelta: { titulo: 'Media vuelta',      icono: '↩️', texto: '{P} se da la vuelta: sus 3 próximos avances son hacia atrás' },
  meteorito:   { titulo: '¡METEORITO!',       icono: '☄️', texto: 'Un meteorito cae sobre {P}: queda eliminado (si solo quedaran 2, solo le tira al suelo)' },
  ovni:        { titulo: 'Abducción',         icono: '🛸', texto: 'Un ovni se lleva a {P}. Lo devuelve 3 cartas después, 6 casillas más adelante' },
  cohete:      { titulo: 'Cohete',            icono: '🚀', texto: '{P} sale disparado 7 casillas… pero aterriza de cabeza' },
  bomba:       { titulo: 'Bomba',             icono: '💣', texto: '{P} lleva una bomba: a las 3 cartas explota. Retrocede 4 y tira a los de su casilla' },
  tornado:     { titulo: '¡TORNADO!',         icono: '🌪️', texto: 'Un tornado mezcla a todos: cada uno cae en la casilla de otro' },
  // cartas de escenario (una por escenario, entra siempre en su carrera)
  ola:         { titulo: '¡OLA GIGANTE!',     icono: '🌊', texto: 'La ola arrastra a todos 2 casillas atrás… menos al último, que la surfea y avanza 3' },
  avalancha:   { titulo: '¡AVALANCHA!',       icono: '🏔️', texto: 'Los que van primeros quedan enterrados en la nieve: retroceden 2 y caen al suelo' },
  erupcion:    { titulo: '¡ERUPCIÓN!',        icono: '🌋', texto: 'Llueve lava: cada corredor, a suertes, avanza 2 o retrocede 2' },
};

// ---------- escenarios ----------
export const ESCENARIOS = {
  estadio: { nombre: 'Estadio', icono: '🏉', carta: null },
  playa:   { nombre: 'Playa',   icono: '🏖️', carta: 'ola' },
  nieve:   { nombre: 'Nieve',   icono: '❄️', carta: 'avalancha' },
  volcan:  { nombre: 'Volcán',  icono: '🌋', carta: 'erupcion' },
};
export const cartaEscenario = esc => ESCENARIOS[esc]?.carta ? { id: 'e-' + esc, tipo: ESCENARIOS[esc].carta, escenario: esc } : null;
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
    corredores: Array.from({ length: CARRILES }, () => ({ pos: 0, caido: false, sancion: 0, marca: 0, reves: 0, fuera: false, abducido: 0, bomba: 0 })),
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
    return (A.fuera - B.fuera) || (B.pos - A.pos) || (A.marca - B.marca) || (a - b);
  });
}

// En juego = ni eliminado ni dentro del ovni.
const enJuego = (est, i) => !est.corredores[i].fuera && !est.corredores[i].abducido;
function activos(est) { return [0, 1, 2, 3].filter(i => enJuego(est, i)); }
function extremos(est) {
  const ps = activos(est).map(i => est.corredores[i].pos);
  if (!ps.length) return { max: 0, min: 0 };
  return { max: Math.max(...ps), min: Math.min(...ps) };
}
function primeros(est) {
  const { max, min } = extremos(est);
  if (max === min) return [];              // todos empatados: nadie destaca
  return activos(est).filter(i => est.corredores[i].pos === max);
}
function ultimos(est) {
  const { max, min } = extremos(est);
  if (max === min) return [];
  return activos(est).filter(i => est.corredores[i].pos === min);
}

// Mueve un corredor y anota los eventos para las animaciones.
function mover(est, c, n, ev) {
  const r = est.corredores[c];
  if (!enJuego(est, c)) return;            // eliminado o en el ovni: no le afecta
  if (n > 0) {
    if (r.caido) { r.caido = false; ev.push({ e: 'levanta', c }); return; }
    if (r.sancion > 0) { r.sancion--; ev.push({ e: 'sancionado', c, quedan: r.sancion }); return; }
    if (r.reves > 0) {                      // va de espaldas: avanza hacia atrás
      r.reves--;
      const de = r.pos;
      r.pos = Math.max(0, r.pos - n);
      if (r.pos !== de) { r.marca = ++est.tic; ev.push({ e: 'mueve', c, de, a: r.pos, atras: true }); }
      else ev.push({ e: 'nada', c });
      if (!r.reves) ev.push({ e: 'gira', c });
      return;
    }
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
  if (r.pos === pos || !enJuego(est, c)) return;
  ev.push({ e: 'mueve', c, de: r.pos, a: pos, salto: true });
  r.pos = pos;
  r.marca = ++est.tic;
}

function tirar(est, c, ev) {
  const r = est.corredores[c];
  if (!enJuego(est, c)) return;
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
  if (carta.c !== undefined && !enJuego(est, carta.c)) {
    ev.push({ e: 'nada', c: carta.c, ausente: est.corredores[carta.c].fuera ? 'fuera' : 'ovni' });
    return;
  }
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
      const lider = orden(est).filter(i => enJuego(est, i))[0];
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
      const o = orden(est).filter(i => enJuego(est, i));
      if (o.length < 2) { ev.push({ e: 'nada' }); break; }
      const a = o[0], b = o[o.length - 1];
      const pa = est.corredores[a].pos, pb = est.corredores[b].pos;
      if (pa === pb) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'portal', c: a }, { e: 'portal', c: b });
      colocarEn(est, a, pb, ev); colocarEn(est, b, pa, ev);
      break;
    }
    case 'reves': {
      const o = orden(est).filter(i => enJuego(est, i));
      const pos = o.map(i => est.corredores[i].pos);
      if (o.length < 2 || pos[0] === pos[pos.length - 1]) { ev.push({ e: 'nada' }); break; }
      ev.push({ e: 'reves' });
      o.forEach((i, k) => colocarEn(est, i, pos[pos.length - 1 - k], ev));
      break;
    }
    case 'junta': {
      const o = orden(est).filter(i => enJuego(est, i));
      if (o.length < 2) { ev.push({ e: 'nada' }); break; }
      const destino = est.corredores[o[1]].pos;
      ev.push({ e: 'junta' });
      o.forEach(i => colocarEn(est, i, destino, ev));
      break;
    }
    // ----- especiales -----
    case 'mediavuelta': {
      est.corredores[carta.c].reves = 3;
      ev.push({ e: 'mediavuelta', c: carta.c });
      break;
    }
    case 'meteorito': {
      const quedan = [0, 1, 2, 3].filter(i => !est.corredores[i].fuera).length;
      if (quedan <= 2) {                    // siempre tiene que haber carrera: solo le roza
        ev.push({ e: 'meteorito', c: carta.c, elimina: false });
        tirar(est, carta.c, ev);
        mover(est, carta.c, -2, ev);
        break;
      }
      const r = est.corredores[carta.c];
      r.fuera = true; r.caido = false; r.sancion = 0; r.reves = 0; r.bomba = 0;
      ev.push({ e: 'meteorito', c: carta.c, elimina: true });
      break;
    }
    case 'ovni': {
      const r = est.corredores[carta.c];
      r.abducido = 4;                      // cuenta también esta carta: vuelve tras 3 más
      r.caido = false;
      ev.push({ e: 'abduce', c: carta.c });
      break;
    }
    case 'cohete': {
      const r = est.corredores[carta.c];
      ev.push({ e: 'cohete', c: carta.c });
      r.caido = false; r.sancion = 0;
      const de = r.pos;
      r.pos += 7; r.marca = ++est.tic;
      ev.push({ e: 'mueve', c: carta.c, de, a: r.pos, salto: true, cohete: true });
      if (r.pos < META) tirar(est, carta.c, ev);       // si cruza la meta, ya da igual cómo aterrice
      break;
    }
    case 'bomba': {
      est.corredores[carta.c].bomba = 4;
      ev.push({ e: 'bomba', c: carta.c });
      break;
    }
    case 'tornado': {
      const o = activos(est);
      const pos = o.map(i => est.corredores[i].pos);
      if (o.length < 2 || pos.every(x => x === pos[0])) { ev.push({ e: 'nada' }); break; }
      let mezcla = barajar(pos, est.azar || Math.random);
      for (let k = 0; k < 5 && mezcla.every((x, j) => x === pos[j]); k++) mezcla = barajar(pos, est.azar || Math.random);
      ev.push({ e: 'tornado' });
      o.forEach((i, k) => colocarEn(est, i, mezcla[k], ev));
      break;
    }
    // ----- escenarios -----
    case 'ola': {
      const ul = ultimos(est);
      ev.push({ e: 'ola' });
      for (let i = 0; i < CARRILES; i++) mover(est, i, ul.includes(i) ? 3 : -2, ev);
      break;
    }
    case 'avalancha': {
      const pr = primeros(est);
      ev.push({ e: 'avalancha', a: pr.slice() });
      if (!pr.length) { ev.push({ e: 'nada' }); break; }
      pr.forEach(i => { mover(est, i, -2, ev); tirar(est, i, ev); });
      break;
    }
    case 'erupcion': {
      const az = est.azar || Math.random;
      const suerte = activos(est).map(i => [i, az() < 0.5 ? 2 : -2]);
      ev.push({ e: 'erupcion', suerte });
      suerte.forEach(([i, n]) => {
        if (n > 0) { const r = est.corredores[i]; r.caido = false; r.sancion = 0; }   // la lava le hace saltar
        mover(est, i, n, ev);
      });
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
  est.azar = azar;
  aplicar(est, carta, ev);
  relojes(est, ev);
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

// Empujón del público (votación a mitad de carrera): se levanta si estaba en el suelo y avanza 2,
// sin llegar a la meta (la carrera la tienen que ganar las cartas).
export const EMPUJON = 2;
export function empujar(est, c) {
  const ev = [];
  const r = est.corredores[c];
  if (!enJuego(est, c)) { ev.push({ e: 'nada', c }); return ev; }
  ev.push({ e: 'empujon', c });
  if (r.caido) { r.caido = false; ev.push({ e: 'levanta', c }); }
  r.sancion = 0;
  const de = r.pos, a = Math.min(META - 1, r.pos + EMPUJON);
  if (a !== de) { r.pos = a; r.marca = ++est.tic; ev.push({ e: 'mueve', c, de, a }); }
  return ev;
}

// Copia del estado para simular sin tocar la carrera de verdad.
export function clonar(est) {
  const { azar, ...resto } = est;
  return JSON.parse(JSON.stringify(resto));
}

// Lo que pasa solo con el paso de las cartas: el ovni devuelve al abducido; la bomba explota.
function relojes(est, ev) {
  for (let c = 0; c < CARRILES; c++) {
    const r = est.corredores[c];
    if (r.abducido > 0 && --r.abducido === 0) {
      const de = r.pos;
      r.pos += 6; r.marca = ++est.tic;
      ev.push({ e: 'devuelve', c, de, a: r.pos });
      ev.push({ e: 'mueve', c, de, a: r.pos, salto: true, ovni: true });
    }
    if (r.bomba > 0 && enJuego(est, c)) {
      if (--r.bomba === 0) {
        const otros = activos(est).filter(i => i !== c && est.corredores[i].pos === r.pos);
        ev.push({ e: 'explota', c, a: otros });
        const de = r.pos;
        r.pos = Math.max(0, r.pos - 4);
        if (r.pos !== de) { r.marca = ++est.tic; ev.push({ e: 'mueve', c, de, a: r.pos, salto: true }); }
        tirar(est, c, ev);
        otros.forEach(i => tirar(est, i, ev));
      } else ev.push({ e: 'tictac', c, quedan: r.bomba });
    }
  }
}

function comprobarFin(est, antes, azar, ev) {
  let llegan = [0, 1, 2, 3].filter(i => est.corredores[i].pos >= META && enJuego(est, i));
  if (!llegan.length && est.prorroga && est.cartasProrroga >= MAX_PRORROGA) {
    llegan = [orden(est).filter(i => !est.corredores[i].fuera)[0]];   // tope de seguridad: gana el que va delante
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

// Ventaja del ganador sobre el segundo al cruzar la meta (en casillas).
export function margen(est) {
  if (!est.clasificacion) return 0;
  const [g, s] = est.clasificacion;
  return Math.min(est.corredores[g].pos, META) - Math.min(est.corredores[s].pos, META);
}
// Lo que hace falta para cobrar las apuestas.
export function resumenFinal(est) {
  return { clasificacion: est.clasificacion, prorroga: est.prorroga, margen: margen(est) };
}

// Juega una carrera entera (para simular).
export function jugarEntera(mazoCarrera, azar = Math.random) {
  return terminarDesde(nuevaCarrera(mazoCarrera), azar);
}
function terminarDesde(est, azar) {
  let n = 0;
  while (est.ganador === null) { siguienteCarta(est, azar); n++; }
  return { ganador: est.ganador, clasificacion: est.clasificacion, cartas: n, prorroga: est.prorroga, foto: est.fotoFinish, margen: margen(est) };
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
// (La carta del escenario no cuenta aquí: igual que las secretas del caos, puede cambiar la carrera; la prórroga garantiza ganador.)
export function prepararMazo(azar = Math.random, ordenesPrueba = 2000) {
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
export const MARGEN = 0.9;
export const PALIZA = 5;              // apuesta loca: el ganador llega con 5 o más casillas de ventaja
const cuota = (p, min, max) => Math.round(Math.min(max, Math.max(min, MARGEN / Math.max(p, 0.001))) * 10) / 10;

function contar(resultados) {
  const n = resultados.length;
  const gana = [0, 0, 0, 0], podio = [0, 0, 0, 0], ultimo = [0, 0, 0, 0];
  const exacta = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  let prorroga = 0, paliza = 0;
  for (const r of resultados) {
    const [a, b] = r.clasificacion;
    gana[a]++; podio[a]++; podio[b]++; ultimo[r.clasificacion[3]]++; exacta[a][b]++;
    if (r.prorroga) prorroga++;
    if (r.margen >= PALIZA) paliza++;
  }
  return {
    probGana: gana.map(x => x / n),
    probPodio: podio.map(x => x / n),
    ganador: gana.map(x => cuota(x / n, 1.2, 15)),
    podio: podio.map(x => cuota(x / n, 1.1, 8)),
    // apuestas locas
    ultimo: ultimo.map(x => cuota(x / n, 1.2, 15)),
    exacta: exacta.map(fila => fila.map(x => cuota(x / n, 2, 40))),
    paliza: cuota(paliza / n, 1.2, 15),
    prorroga: cuota(prorroga / n, 1.2, 15),
  };
}

// Simula muchas carreras con las cartas públicas (+ la del escenario) más tantas cartas del caos al azar
// como jugadores haya (las secretas no se conocen) y saca las cuotas.
export function calcularCuotas(publicas, sims = 3000, azar = Math.random, secretas = 2, extra = []) {
  const caos = mazoCaos();
  const res = [];
  for (let s = 0; s < sims; s++) {
    const sec = secretas > 0 ? barajar(caos, azar).slice(0, secretas) : [];
    res.push(jugarEntera(barajar(publicas.concat(extra, sec), azar), azar));
  }
  return contar(res);
}

// Cuotas en directo: desde cómo va la carrera ahora, con las cartas que quedan (en orden desconocido).
// Quien ya no puede quedar 1.º o 2.º (eliminado) sale con cuota null.
export function cuotasDesde(est, sims = 1500, azar = Math.random) {
  const res = [];
  for (let s = 0; s < sims; s++) {
    const e = clonar(est);
    e.mazo = barajar(e.mazo, azar);
    res.push(terminarDesde(e, azar));
  }
  const c = contar(res);
  est.corredores.forEach((r, i) => {
    if (r.fuera || c.probGana[i] === 0) c.ganador[i] = null;
    if (r.fuera || c.probPodio[i] === 0) c.podio[i] = null;
  });
  return c;
}

// ---------- apuestas ----------
export const PUNTOS_INICIALES = 100;
export const RESCATE = 20;            // si alguien se queda a 0, empieza la siguiente carrera con esto
export const APUESTA_MIN = 5;
export const TIPOS_LOCOS = ['ultimo', 'exacta', 'paliza', 'prorroga'];

// apuesta = { c, c2?, tipo, cantidad, cuota }
// fin = resumenFinal(est) (o, por compatibilidad, solo la clasificación)
export function acierta(apuesta, fin) {
  const f = Array.isArray(fin) ? { clasificacion: fin } : fin;
  const cl = f.clasificacion;
  switch (apuesta.tipo) {
    case 'ganador': return cl[0] === apuesta.c;
    case 'podio': return cl.slice(0, 2).includes(apuesta.c);
    case 'ultimo': return cl[3] === apuesta.c;
    case 'exacta': return cl[0] === apuesta.c && cl[1] === apuesta.c2;
    case 'paliza': return f.margen >= PALIZA;
    case 'prorroga': return !!f.prorroga;
  }
  return false;
}
export function resultadoApuesta(apuesta, fin) {
  if (!apuesta) return 0;
  return acierta(apuesta, fin) ? Math.round(apuesta.cantidad * (apuesta.cuota - 1)) : -apuesta.cantidad;
}
// Cuota de una apuesta según la tabla de cuotas (null si no se puede apostar a eso).
export function cuotaDe(cuotas, a) {
  if (!cuotas || !a) return null;
  if (a.tipo === 'exacta') return a.c === a.c2 ? null : cuotas.exacta?.[a.c]?.[a.c2] ?? null;
  if (a.tipo === 'paliza' || a.tipo === 'prorroga') return cuotas[a.tipo] ?? null;
  return cuotas[a.tipo]?.[a.c] ?? null;
}
// Texto corto de una apuesta ("Manki gana", "Sara queda último"...).
export function textoApuesta(a, nombres) {
  const n = i => nombres[i] ?? '?';
  switch (a.tipo) {
    case 'ganador': return `${n(a.c)} gana`;
    case 'podio': return `${n(a.c)} 1.º o 2.º`;
    case 'ultimo': return `${n(a.c)} queda último`;
    case 'exacta': return `${n(a.c)} 1.º y ${n(a.c2)} 2.º`;
    case 'paliza': return `gana con paliza (${PALIZA}+ casillas)`;
    case 'prorroga': return 'habrá prórroga';
  }
  return '';
}
