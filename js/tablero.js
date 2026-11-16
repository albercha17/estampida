// Tablero (campo de rugby), fichas, cartas y animaciones. Lo usan el PC y los móviles.
import { META, CARRILES, textoCarta } from './motor.js?v=202611161242';
import { sfx } from './sonido.js?v=202611161242';

const espera = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function caraHTML(p) {
  if (p.imagen) return `<img src="personajes/${esc(p.imagen)}" alt="${esc(p.nombre)}">`;
  return `<span class="emoji">${p.emoji}</span>`;
}

// Carta de carrera dibujada con los personajes de esta partida.
export function cartaHTML(carta, personajes, clase = '') {
  const t = textoCarta(carta, personajes.map(p => p.nombre));
  const p = carta.c !== undefined ? personajes[carta.c] : null;
  const color = p ? p.color : '#1f2937';
  const sello = carta.secreta ? `<div class="carta-sello">🤫 SECRETA${carta.de ? ' DE ' + esc(carta.de).toUpperCase() : ''}</div>` : '';
  return `<div class="carta ${p ? 'de-carril' : 'global'} ${carta.secreta ? 'caos' : ''} ${clase}" style="--cc:${color}" data-tipo="${carta.tipo}">${sello}
    <div class="carta-banda">${p ? `<span class="carta-cara">${caraHTML(p)}</span><span>${esc(p.nombre)}</span>` : '<span>TODOS</span>'}</div>
    <div class="carta-icono">${carta.tipo === 'avanza' ? `<span class="num-carta">+${carta.n}</span>` : carta.tipo === 'retrocede' ? `<span class="num-carta menos">−${carta.n}</span>` : t.icono}</div>
    <div class="carta-titulo">${esc(t.titulo)}</div>
    <div class="carta-texto">${esc(t.texto)}</div>
  </div>`;
}

export class Tablero {
  constructor(raiz, personajes, { sonido = true } = {}) {
    this.raiz = raiz;
    this.personajes = personajes;
    this.sonido = sonido;
    this.velocidad = 1;
    raiz.classList.add('campo');
    let lineas = '';
    for (let i = 1; i <= META; i++) lineas += `<div class="linea ${i === 1 ? 'salida' : ''}" style="--col:${i}"></div>`;
    for (let i = 1; i < META; i++) lineas += `<div class="num" style="--col:${i}">${i}</div>`;
    const carriles = personajes.map((p, i) =>
      `<div class="carril" style="--fila:${i};--color:${p.color}"><span class="carril-nombre">${esc(p.nombre)}</span></div>`).join('');
    const fichas = personajes.map((p, i) =>
      `<div class="ficha" data-c="${i}" style="--fila:${i};--col:0;--color:${p.color}">
        <div class="ficha-salto"><div class="ficha-cuerpo">${caraHTML(p)}</div><div class="ficha-marca"></div></div>
        <div class="ficha-sombra"></div>
      </div>`).join('');
    raiz.innerHTML = `
      <div class="zona-ensayo"><div class="palos"><i></i><i></i><b></b></div><span>META</span></div>
      <div class="pista">${lineas}${carriles}${fichas}<div class="fx"></div></div>`;
    this.fichas = [...raiz.querySelectorAll('.ficha')];
    this.fx = raiz.querySelector('.fx');
  }

  sonar(n) { if (this.sonido) sfx(n); }
  destruir() {}

  // Coloca las fichas sin animar (al conectarse a media carrera, por ejemplo).
  colocar(corredores) {
    corredores.forEach((r, i) => {
      const f = this.fichas[i];
      f.style.setProperty('--col', Math.min(r.pos, META));
      f.classList.toggle('caida', !!r.caido);
      f.classList.toggle('sancion', r.sancion > 0);
      f.classList.toggle('fuera', !!r.fuera);
      f.classList.toggle('abducida', r.abducido > 0);
      f.classList.toggle('espaldas', r.reves > 0);
      f.querySelector('.ficha-marca').textContent = r.fuera ? '☠️' : r.bomba > 0 ? '💣' : r.caido ? '💫' : r.sancion > 2 ? '🟥' : r.sancion > 0 ? '🟨' : r.reves > 0 ? '↩️' : '';
      f.classList.remove('ganadora', 'perdedora');
    });
  }

  burbuja(c, texto, clase = '') {
    const b = document.createElement('div');
    b.className = 'burbuja ' + clase;
    b.textContent = texto;
    const f = this.fichas[c];
    b.style.setProperty('--fila', f.style.getPropertyValue('--fila'));
    b.style.setProperty('--col', f.style.getPropertyValue('--col'));
    this.fx.appendChild(b);
    setTimeout(() => b.remove(), 1600 / this.velocidad);
  }

  async mover(c, de, a, teletransporte = false) {
    const f = this.fichas[c];
    if (teletransporte) {
      f.classList.add('teleport');
      await espera(220 / this.velocidad);
      f.style.setProperty('--col', Math.min(Math.max(a, 0), META));
      this.sonar('levanta');
      await espera(260 / this.velocidad);
      f.classList.remove('teleport');
      return;
    }
    const paso = a > de ? 1 : -1;
    f.classList.add('corriendo');
    if (paso < 0) f.classList.add('atras');
    for (let x = de; x !== a; x += paso) {
      const col = Math.min(Math.max(x + paso, 0), META);
      f.style.setProperty('--col', col);
      f.classList.remove('salta'); void f.offsetWidth; f.classList.add('salta');
      this.sonar('paso');
      await espera(260 / this.velocidad);
    }
    f.classList.remove('corriendo', 'atras', 'salta');
  }

  async animar(eventos) {
    // Los movimientos seguidos de corredores distintos van a la vez (melé, estampida...).
    let grupo = [];
    const soltar = async () => { if (grupo.length) { await Promise.all(grupo.map(g => g())); grupo = []; } };
    for (const ev of eventos) {
      const f = ev.c !== undefined ? this.fichas[ev.c] : null;
      if (ev.e === 'mueve' || ev.e === 'levanta' || ev.e === 'sancionado') {
        if (ev.e === 'mueve') grupo.push(() => this.mover(ev.c, ev.de, ev.a, ev.salto));
        if (ev.e === 'levanta') grupo.push(async () => {
          f.classList.remove('caida'); f.querySelector('.ficha-marca').textContent = '';
          f.classList.add('levantando'); this.burbuja(ev.c, '¡Arriba!'); this.sonar('levanta');
          await espera(500 / this.velocidad); f.classList.remove('levantando');
        });
        if (ev.e === 'sancionado') grupo.push(async () => {
          this.burbuja(ev.c, ev.quedan ? '🟨 Sancionado' : '🟨 Último castigo', 'amarilla'); this.sonar('amarilla');
          if (!ev.quedan) { f.classList.remove('sancion'); f.querySelector('.ficha-marca').textContent = ''; }
          f.classList.add('tiembla'); await espera(500 / this.velocidad); f.classList.remove('tiembla');
        });
        continue;
      }
      await soltar();
      switch (ev.e) {
        case 'cae':
          f.classList.add('caida', 'golpe'); f.querySelector('.ficha-marca').textContent = '💫';
          this.burbuja(ev.c, '¡PUMBA!', 'golpe'); this.sonar('cae');
          await espera(700 / this.velocidad); f.classList.remove('golpe');
          break;
        case 'lesion':
          this.burbuja(ev.c, '🚑 ¡Lesión!', 'golpe'); this.sonar('cae');
          await espera(500 / this.velocidad);
          break;
        case 'placa':
          this.fichas[ev.c].classList.add('embiste');
          this.burbuja(ev.c, '¡PLACAJE!', 'golpe');
          ev.a.forEach(i => this.explosion(i));
          this.sonar('placaje');
          await espera(500 / this.velocidad); this.fichas[ev.c].classList.remove('embiste');
          break;
        case 'amarilla':
          f.classList.add('sancion'); f.querySelector('.ficha-marca').textContent = '🟨';
          this.burbuja(ev.c, 'TARJETA', 'amarilla'); this.sonar('silbato');
          await espera(600 / this.velocidad);
          break;
        case 'roja':
          f.classList.add('sancion'); f.querySelector('.ficha-marca').textContent = '🟥';
          this.burbuja(ev.c, '¡ROJA!', 'golpe'); this.sonar('silbato');
          await espera(600 / this.velocidad);
          break;
        case 'portal':
          this.burbuja(ev.c, '🌀');
          break;
        case 'reves':
          this.cartel('🙃 ¡TODO AL REVÉS!', 'prorroga'); this.sonar('silbato');
          await espera(700 / this.velocidad);
          break;
        case 'junta':
          this.cartel('🫂 ¡TODOS JUNTOS!', 'prorroga');
          await espera(600 / this.velocidad);
          break;
        case 'recupera':
          f.classList.remove('caida', 'sancion'); f.querySelector('.ficha-marca').textContent = '';
          this.burbuja(ev.c, '🩹 Como nuevo'); this.sonar('levanta');
          await espera(400 / this.velocidad);
          break;
        case 'mediavuelta':
          f.classList.add('espaldas'); f.querySelector('.ficha-marca').textContent = '↩️';
          this.burbuja(ev.c, '↩️ ¡Media vuelta!'); this.sonar('silbato');
          await espera(500 / this.velocidad);
          break;
        case 'gira':
          f.classList.remove('espaldas'); f.querySelector('.ficha-marca').textContent = '';
          break;
        case 'meteorito':
          this.cartel('☄️ ¡METEORITO!', 'prorroga'); this.sonar('placaje');
          this.explosion(ev.c);
          if (ev.elimina) { f.classList.add('fuera'); f.querySelector('.ficha-marca').textContent = '☠️'; this.burbuja(ev.c, '☠️ Eliminado', 'golpe'); }
          await espera(900 / this.velocidad);
          break;
        case 'abduce':
          this.burbuja(ev.c, '🛸 ¡Se lo llevan!', 'golpe'); this.sonar('silbato');
          f.classList.add('abducida');
          await espera(900 / this.velocidad);
          break;
        case 'devuelve':
          f.classList.remove('abducida'); this.burbuja(ev.c, '🛸 ¡Lo sueltan!'); this.sonar('levanta');
          await espera(500 / this.velocidad);
          break;
        case 'cohete':
          this.burbuja(ev.c, '🚀 ¡Despega!'); this.sonar('salida');
          break;
        case 'bomba':
          f.querySelector('.ficha-marca').textContent = '💣'; this.burbuja(ev.c, '💣 ¡Bomba!', 'golpe');
          await espera(500 / this.velocidad);
          break;
        case 'tictac':
          this.burbuja(ev.c, `💣 ${ev.quedan}…`, 'amarilla');
          break;
        case 'explota':
          f.querySelector('.ficha-marca').textContent = ''; this.explosion(ev.c); this.sonar('placaje');
          this.burbuja(ev.c, '💥 ¡BOOM!', 'golpe');
          await espera(700 / this.velocidad);
          break;
        case 'tornado':
          this.cartel('🌪️ ¡TORNADO!', 'prorroga'); this.sonar('silbato');
          await espera(800 / this.velocidad);
          break;
        case 'nada':
          if (ev.ausente) this.burbuja(ev.c, ev.ausente === 'fuera' ? '☠️' : '🛸');
          else if (f) this.burbuja(ev.c, '...');
          else this.cartel('¡No pasa nada!', 'suave');
          await espera(500 / this.velocidad);
          break;
        case 'prorroga':
          this.cartel('¡PRÓRROGA! Se barajan las cartas y la grada empuja', 'prorroga'); this.sonar('silbato');
          await espera(1600 / this.velocidad);
          break;
        case 'empuje':
          this.cartel('📣 La grada empuja: todos +1', 'suave');
          break;
        case 'pitido':
          this.cartel('¡Final del tiempo!', 'prorroga'); this.sonar('silbato');
          await espera(1000 / this.velocidad);
          break;
        case 'fotofinish':
          this.flash(); this.sonar('foto');
          this.cartel('📸 ¡FOTO FINISH!', 'prorroga');
          await espera(1200 / this.velocidad);
          break;
        case 'gana':
          await this.ganar(ev.c);
          break;
      }
    }
    await soltar();
  }

  explosion(c) {
    const f = this.fichas[c];
    const b = document.createElement('div');
    b.className = 'explosion';
    b.style.setProperty('--fila', f.style.getPropertyValue('--fila'));
    b.style.setProperty('--col', f.style.getPropertyValue('--col'));
    b.textContent = '💥';
    this.fx.appendChild(b);
    setTimeout(() => b.remove(), 900);
  }

  cartel(texto, clase = '') {
    const c = document.createElement('div');
    c.className = 'cartel ' + clase;
    c.textContent = texto;
    this.raiz.appendChild(c);
    setTimeout(() => c.remove(), 1800 / this.velocidad);
  }

  flash() {
    const d = document.createElement('div');
    d.className = 'flash';
    this.raiz.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }

  async ganar(c) {
    this.fichas.forEach((f, i) => f.classList.toggle(i === c ? 'ganadora' : 'perdedora', true));
    this.fichas[c].querySelector('.ficha-marca').textContent = '👑';
    this.sonar('victoria');
    confeti(this.personajes[c].color);
    this.cartel(`🏆 ¡GANA ${this.personajes[c].nombre.toUpperCase()}!`, 'victoria');
    await espera(1500 / this.velocidad);
  }
}

// ---------- confeti ----------
export function confeti(color = '#ffd166', n = 160) {
  const cv = document.createElement('canvas');
  cv.className = 'confeti';
  document.body.appendChild(cv);
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const ctx = cv.getContext('2d');
  const colores = [color, '#ffd166', '#ffffff', '#06d6a0', '#ef476f', '#118ab2'];
  const ps = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.55,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 6,
    r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4,
    c: colores[Math.floor(Math.random() * colores.length)],
  }));
  const t0 = performance.now();
  (function cuadro(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => {
      p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    if (t - t0 < 3500) requestAnimationFrame(cuadro); else cv.remove();
  })(t0);
}

export { esc, espera, CARRILES };
