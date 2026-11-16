// Pruebas del motor: node tests/motor.test.mjs
import * as M from '../js/motor.js';
let fallos = 0;
const ok = (c, m) => { if (!c) { fallos++; console.log('FALLO:', m); } };
const az = M.crearAzar(7);
// 1) siempre hay ganador, también con mazos raros
for (let i = 0; i < 5000; i++) {
  const { publicas, reserva } = M.prepararMazo(az, 100);
  const mazo = M.barajar(publicas.concat(reserva.slice(0, i % 21)), az);
  const r = M.jugarEntera(mazo, az);
  ok(r.ganador >= 0 && r.ganador < 4, 'ganador válido');
  ok(new Set(r.clasificacion).size === 4, 'clasificación completa');
}
// mazo solo de cartas que retroceden: debe acabar por prórroga/tope
const malo = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, tipo: 'viento' }));
const r = M.jugarEntera(malo, az);
ok(r.ganador !== null && r.prorroga, 'mazo imposible acaba en prórroga');
// 2) reglas concretas
let e = M.nuevaCarrera([{ tipo: 'avanza', c: 0, n: 3 }, { tipo: 'tropiezo', c: 0 }, { tipo: 'avanza', c: 0, n: 2 }, { tipo: 'avanza', c: 0, n: 2 }]);
M.siguienteCarta(e, az); ok(e.corredores[0].pos === 3, 'avanza 3');
M.siguienteCarta(e, az); ok(e.corredores[0].caido, 'tropiezo');
M.siguienteCarta(e, az); ok(e.corredores[0].pos === 3 && !e.corredores[0].caido, 'se levanta sin avanzar');
M.siguienteCarta(e, az); ok(e.corredores[0].pos === 5, 'vuelve a avanzar');
e = M.nuevaCarrera([{ tipo: 'avanza', c: 1, n: 4 }, { tipo: 'amarilla' }, { tipo: 'mele' }, { tipo: 'mele' }, { tipo: 'mele' }]);
for (let i = 0; i < 5; i++) M.siguienteCarta(e, az);
ok(e.corredores[1].pos === 5 && e.corredores[0].pos === 3, 'amarilla: 2 avances perdidos');
e = M.nuevaCarrera([{ tipo: 'avanza', c: 2, n: 4 }, { tipo: 'placaje', c: 0 }]);
M.siguienteCarta(e, az); M.siguienteCarta(e, az); ok(e.corredores[2].caido, 'placaje tira al primero');
e = M.nuevaCarrera([{ tipo: 'avanza', c: 2, n: 4 }, { tipo: 'cambiazo' }]);
M.siguienteCarta(e, az); M.siguienteCarta(e, az); ok(e.corredores[2].pos === 0, 'cambiazo');
e = M.nuevaCarrera([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'avanza', c: 0, n: 4 }]);
let fin; while (!(fin = M.siguienteCarta(e, az)).fin);
ok(e.ganador === 1, 'gana el primero en cruzar');
// empate al cruzar con la misma carta: gana el que llega más lejos
e = M.nuevaCarrera([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 0, n: 3 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'avanza', c: 1, n: 2 }, { tipo: 'estampida' }]);
while (!M.siguienteCarta(e, az).fin);
ok(e.ganador === 0, 'empate: gana el que llega más lejos');
// cartas del caos
const correr = (cartas) => { const e = M.nuevaCarrera(cartas); for (let i = 0; i < cartas.length && e.ganador === null; i++) M.siguienteCarta(e, az); return e; };
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'atajo', c: 3 }]);
ok(e.corredores[3].pos === 4, 'atajo: se pone con el primero');
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'intercambio', c: 2 }]);
ok(e.corredores[2].pos === 4 && e.corredores[0].pos === 0, 'intercambio con el primero');
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 1, n: 3 }, { tipo: 'avanza', c: 2, n: 1 }, { tipo: 'reves' }]);
ok(e.corredores.map(r => r.pos).join() === '0,1,3,4', 'todo al revés: ' + e.corredores.map(r => r.pos).join());
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 1, n: 2 }, { tipo: 'junta' }]);
ok(e.corredores.every(r => r.pos === 2), 'melé general: todos con el segundo');
e = correr([{ tipo: 'roja', c: 1 }, { tipo: 'mele' }, { tipo: 'mele' }, { tipo: 'mele' }, { tipo: 'mele' }]);
ok(e.corredores[1].pos === 1 && e.corredores[0].pos === 4, 'roja: 3 avances perdidos');
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'barro' }]);
ok(e.corredores[0].caido, 'barro tira al primero');
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'remontada' }]);
ok(e.corredores.slice(1).every(r => r.pos === 5), 'remontada: los últimos +5');
// --- cartas especiales ---
const m1 = n => Array.from({ length: n }, () => ({ tipo: 'mele' }));
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'mediavuelta', c: 0 }, { tipo: 'avanza', c: 0, n: 2 }]);
ok(e.corredores[0].pos === 2 && e.corredores[0].reves === 2, 'media vuelta: avanzar es ir hacia atrás');
e = correr([{ tipo: 'mediavuelta', c: 1 }, ...m1(4)]);
ok(e.corredores[1].pos === 1 && e.corredores[1].reves === 0, 'media vuelta: 3 avances hacia atrás y luego normal');
e = correr([{ tipo: 'avanza', c: 2, n: 3 }, { tipo: 'meteorito', c: 2 }, ...m1(3)]);
ok(e.corredores[2].fuera && e.corredores[2].pos === 3, 'meteorito: eliminado y ya no se mueve');
ok(M.orden(e)[3] === 2, 'el eliminado va el último');
e = correr([{ tipo: 'meteorito', c: 0 }, { tipo: 'meteorito', c: 1 }, { tipo: 'avanza', c: 2, n: 3 }, { tipo: 'meteorito', c: 2 }]);
ok(e.corredores[0].fuera && e.corredores[1].fuera && !e.corredores[2].fuera && e.corredores[2].caido, 'meteorito: con 2 en pie solo tira al suelo');
e = correr([{ tipo: 'avanza', c: 3, n: 2 }, { tipo: 'ovni', c: 3 }, { tipo: 'mele' }, { tipo: 'mele' }]);
ok(e.corredores[3].abducido > 0 && e.corredores[3].pos === 2, 'ovni: mientras está dentro no se mueve');
e = correr([{ tipo: 'avanza', c: 3, n: 2 }, { tipo: 'ovni', c: 3 }, { tipo: 'mele' }, { tipo: 'mele' }, { tipo: 'mele' }]);
ok(!e.corredores[3].abducido && e.corredores[3].pos === 8, 'ovni: vuelve tras 3 cartas, 6 más adelante');
e = correr([{ tipo: 'cohete', c: 1 }]);
ok(e.corredores[1].pos === 7 && e.corredores[1].caido, 'cohete: +7 y cae');
e = correr([{ tipo: 'avanza', c: 0, n: 4 }, { tipo: 'avanza', c: 1, n: 4 }, { tipo: 'bomba', c: 0 }, { tipo: 'mele' }, { tipo: 'mele' }, { tipo: 'mele' }]);
ok(e.corredores[0].pos === 3 && e.corredores[0].caido && e.corredores[1].caido, 'bomba: explota a las 3 cartas y tira a los de su casilla');
e = correr([{ tipo: 'avanza', c: 0, n: 1 }, { tipo: 'avanza', c: 1, n: 2 }, { tipo: 'avanza', c: 2, n: 3 }, { tipo: 'tornado' }]);
ok(e.corredores.map(r => r.pos).sort().join() === '0,1,2,3', 'tornado: mezcla las mismas casillas');
// nunca gana un eliminado, con muchos meteoritos
for (let i = 0; i < 300; i++) {
  const met = [0, 1, 2, 3].map(c => ({ tipo: 'meteorito', c, secreta: true }));
  const { publicas } = M.prepararMazo(az, 50);
  const est = M.nuevaCarrera(M.barajar(publicas.concat(met), az));
  while (est.ganador === null) M.siguienteCarta(est, az);
  ok(!est.corredores[est.ganador].fuera, 'no gana un eliminado');
  ok(est.corredores.filter(r => r.fuera).length <= 2, 'quedan al menos 2 en carrera');
}
// las 20 públicas: en cualquier orden llegan al menos 2
for (let i = 0; i < 30; i++) {
  const { publicas, reserva } = M.prepararMazo(az);
  ok(publicas.length === 20 && publicas.every(c => !c.secreta), 'públicas del mazo base');
  ok(reserva.every(c => c.secreta) && reserva.length >= 20, 'reserva del caos para 20 jugadores');
  for (let k = 0; k < 500; k++) if (M.cuantosLlegan(M.barajar(publicas, az)) < 2) { ok(false, 'llegan menos de 2'); break; }
}
// 3) apuestas
ok(M.resultadoApuesta({ c: 1, tipo: 'ganador', cantidad: 10, cuota: 3.5 }, [1, 0, 2, 3]) === 25, 'paga ganador');
ok(M.resultadoApuesta({ c: 1, tipo: 'ganador', cantidad: 10, cuota: 3.5 }, [0, 1, 2, 3]) === -10, 'pierde ganador');
ok(M.resultadoApuesta({ c: 1, tipo: 'podio', cantidad: 10, cuota: 1.6 }, [0, 1, 2, 3]) === 6, 'paga podio');
// 4) cuotas sensatas
const c = M.calcularCuotas(M.prepararMazo(az).publicas, 2000, az);
ok(c.ganador.every(x => x >= 1.2 && x <= 15) && c.podio.every(x => x >= 1.1 && x <= 8), 'cuotas en rango');
// 5) todas las cartas tienen texto
for (const k of M.mazoCompleto()) ok(!M.textoCarta(k, ['A', 'B', 'C', 'D']).texto.includes('{'), 'texto ' + k.tipo);
console.log('Mazo completo:', M.mazoCompleto().length, 'cartas');
console.log(fallos ? `${fallos} FALLOS` : 'Motor: todas las pruebas OK');
process.exit(fallos ? 1 : 0);
