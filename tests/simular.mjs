// Equilibrio del juego: node tests/simular.mjs
import * as M from '../js/motor.js';
const az = M.crearAzar(42);
console.time('preparar 200 mazos');
const mazos = Array.from({ length: 1000 }, () => M.prepararMazo(az));
console.timeEnd('preparar 200 mazos');
// Comprobación fuerte: cada mazo público, en 2000 órdenes, siempre deja llegar a 2+
let malos = 0;
for (const { publicas } of mazos.slice(0, 50)) for (let k = 0; k < 10000; k++) if (M.cuantosLlegan(M.barajar(publicas, az)) < 2) { malos++; break; }
console.log('mazos públicos con algún orden en que llegan <2:', malos, '/ 50');
for (const extra of [0, 1, 3, 6, 12, 20]) {
  const N = 20000; const g = [0, 0, 0, 0]; let cartas = 0, pro = 0, foto = 0, favorito = 0;
  for (let i = 0; i < N; i++) {
    const { publicas, reserva } = mazos[i % mazos.length];
    const sec = M.barajar(reserva, az).slice(0, extra);
    const r = M.jugarEntera(M.barajar(publicas.concat(sec), az), az);
    g[r.ganador]++; cartas += r.cartas; if (r.prorroga) pro++; if (r.foto) foto++;
  }
  console.log(`secretas=${String(extra).padStart(2)} gana%`, g.map(x => (100 * x / N).toFixed(1)).join(' '), '| cartas media', (cartas / N).toFixed(1), '| prórroga%', (100 * pro / N).toFixed(1), '| foto%', (100 * foto / N).toFixed(1));
}
// ¿Cuánto cambia el favorito una carta secreta? (prob. de que gane el favorito sin secretas vs con 3)
let cambia = 0; const T = 60;
for (let i = 0; i < T; i++) {
  const { publicas } = mazos[i];
  const a = M.calcularCuotas(publicas, 600, az, 0), b = M.calcularCuotas(publicas, 600, az, 3);
  const fa = a.probGana.indexOf(Math.max(...a.probGana));
  cambia += a.probGana[fa] - b.probGana[fa];
}
console.log('el favorito pierde de media', (100 * cambia / T).toFixed(1), 'puntos de probabilidad con 3 cartas secretas');
console.time('cuotas'); M.calcularCuotas(mazos[0].publicas, 3000, az, 4); console.timeEnd('cuotas');
