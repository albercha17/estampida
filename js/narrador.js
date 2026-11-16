// Narrador con voz grabada (audio/*.mp3, generada con herramientas/generar_voz.py) y ambiente de estadio.
// Si falta un audio (por ejemplo, un personaje nuevo sin generar), usa la voz del navegador.
import { narrar as vozNavegador } from './sonido.js?v=202611161022';

let indice = null;
const cache = new Map();

export async function cargarNarrador() {
  try { indice = await (await fetch('audio/indice.json', { cache: 'no-cache' })).json(); }
  catch { indice = {}; }
}

function archivo(clave, pid) {
  const k = indice?.[clave];
  if (!k) return null;
  const lista = k[pid ?? '_'];
  if (!lista || !lista.length) return null;
  return 'audio/' + lista[Math.floor(Math.random() * lista.length)];
}

// Precarga los audios de los 4 corredores de la carrera.
export function precargar(ids) {
  if (!indice) return;
  for (const [, porP] of Object.entries(indice)) {
    for (const [pid, lista] of Object.entries(porP)) {
      if (pid !== '_' && !ids.includes(pid)) continue;
      lista.forEach(n => {
        const url = 'audio/' + n;
        if (!cache.has(url)) { const a = new Audio(url); a.preload = 'auto'; cache.set(url, a); }
      });
    }
  }
}

let actual = null;
export function callar() { if (actual) { actual.pause(); actual = null; } try { speechSynthesis.cancel(); } catch {} }

// Dice una frase. clave = 'avanza3', 'lider'... ; pid = id del personaje (o nada); texto = respaldo.
export function decir(clave, pid, texto, activo = true) {
  if (!activo) return Promise.resolve();
  const url = archivo(clave, pid);
  if (!url) return texto ? vozNavegador(texto, true) : Promise.resolve();
  return new Promise(ok => {
    const a = cache.get(url) || new Audio(url);
    cache.set(url, a);
    try { a.currentTime = 0; } catch {}
    a.volume = 1;
    actual = a;
    const tope = setTimeout(ok, 7000);
    a.onended = a.onerror = () => { clearTimeout(tope); ok(); };
    a.play().catch(() => { clearTimeout(tope); ok(); });
  });
}

// ---------- ambiente de estadio ----------
let ctx = null, ganancia = null, filtro = null;
export function ambiente(encender = true) {
  try {
    if (!encender) { if (ganancia) ganancia.gain.setTargetAtTime(0, ctx.currentTime, 0.4); return; }
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dur = 4, b = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        let ult = 0;
        for (let i = 0; i < d.length; i++) {        // ruido marrón con "oleadas" de voces
          const blanco = Math.random() * 2 - 1;
          ult = (ult + 0.02 * blanco) / 1.02;
          d[i] = ult * 3.2 * (0.75 + 0.25 * Math.sin(i / ctx.sampleRate * Math.PI * 0.5 + ch));
        }
      }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      filtro = ctx.createBiquadFilter(); filtro.type = 'bandpass'; filtro.frequency.value = 700; filtro.Q.value = 0.6;
      ganancia = ctx.createGain(); ganancia.gain.value = 0;
      s.connect(filtro).connect(ganancia).connect(ctx.destination); s.start();
    }
    if (ctx.state === 'suspended') ctx.resume();
    ganancia.gain.setTargetAtTime(0.18, ctx.currentTime, 0.8);
  } catch {}
}
// El público ruge un momento (0..1 de intensidad).
export function rugido(fuerza = 1) {
  if (!ctx || !ganancia) return;
  const t = ctx.currentTime;
  ganancia.gain.cancelScheduledValues(t);
  ganancia.gain.setTargetAtTime(0.18 + 0.5 * fuerza, t, 0.08);
  ganancia.gain.setTargetAtTime(0.18, t + 0.9 + fuerza, 0.7);
  filtro.frequency.setTargetAtTime(700 + 600 * fuerza, t, 0.1);
  filtro.frequency.setTargetAtTime(700, t + 1 + fuerza, 0.6);
}
