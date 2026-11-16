// Efectos de sonido sintetizados (sin archivos) y narrador con la voz del navegador.
let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function desbloquearAudio() { ac(); }

function tono(f, dur, tipo = 'sine', vol = 0.15, f2 = null, retraso = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + retraso;
  const o = a.createOscillator(), g = a.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function ruido(dur, vol = 0.2, frec = 800, retraso = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + retraso;
  const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = frec; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

const SONIDOS = {
  paso: () => tono(520 + Math.random() * 120, 0.07, 'triangle', 0.08),
  carta: () => ruido(0.25, 0.25, 2500),
  cae: () => { tono(180, 0.35, 'sawtooth', 0.15, 50); ruido(0.3, 0.3, 300); },
  placaje: () => { ruido(0.4, 0.45, 200); tono(120, 0.3, 'square', 0.12, 40); },
  levanta: () => tono(400, 0.18, 'sine', 0.12, 900),
  amarilla: () => tono(880, 0.12, 'square', 0.06),
  silbato: () => { tono(2200, 0.25, 'sine', 0.12, 2350); tono(2200, 0.45, 'sine', 0.12, 2100, 0.3); },
  foto: () => ruido(0.15, 0.4, 5000),
  victoria: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.35, 'triangle', 0.15, null, i * 0.12)),
  cuenta: () => tono(660, 0.15, 'square', 0.08),
  salida: () => tono(990, 0.5, 'square', 0.1),
  pierde: () => [400, 300, 200].forEach((f, i) => tono(f, 0.3, 'sawtooth', 0.08, null, i * 0.18)),
  grada: () => ruido(1.2, 0.18, 1200),
  // redoble de tambor que va subiendo (foto finish) y platillo al final
  redoble: () => {
    for (let i = 0; i < 44; i++) ruido(0.05, 0.08 + i * 0.006, 1800, i * 0.055);
    ruido(1.1, 0.35, 6000, 44 * 0.055);
    tono(110, 0.5, 'triangle', 0.2, 60, 44 * 0.055);
  },
  ola: () => { ruido(1.6, 0.35, 500); ruido(1.2, 0.2, 2500, 0.3); },
  lava: () => { tono(90, 0.8, 'sawtooth', 0.12, 40); ruido(0.8, 0.3, 350); },
  empujon: () => { ruido(1.4, 0.3, 900); tono(300, 0.4, 'triangle', 0.12, 700); },
};
export function sfx(n) { try { SONIDOS[n]?.(); } catch {} }

// ---------- narrador ----------
let voz = null;
function elegirVoz() {
  const vs = speechSynthesis.getVoices();
  voz = vs.find(v => v.lang === 'es-ES') || vs.find(v => v.lang.startsWith('es')) || null;
}
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }

export function narrar(texto, activo = true) {
  return new Promise(ok => {
    if (!activo || !('speechSynthesis' in window)) return ok();
    const u = new SpeechSynthesisUtterance(texto);
    if (voz) u.voice = voz;
    u.lang = 'es-ES'; u.rate = 1.1; u.pitch = 1.05;
    const tope = setTimeout(ok, 1500 + texto.length * 90);   // por si el navegador no avisa del final
    u.onend = u.onerror = () => { clearTimeout(tope); ok(); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
