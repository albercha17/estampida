// Pruebas del motor: node tests/motor.test.mjs
import * as M from '../js/motor.js';
let fallos = 0;
const ok = (c, m) => { if (!c) { fallos++; console.log('FALLO:', m); } };
const az = M.crearAzar(7);
// 1) siempre hay ganador, también con mazos raros
for (let i = 0; i < 5000; i++) {
  const { publicas, reserva } = M.prepararMazo(az);
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
