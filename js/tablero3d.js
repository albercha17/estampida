// Estadio en 3D (Three.js) con "realizador" de cámara: plano de tele, primeros planos en las caídas,
// giros, recta final a ras de suelo y órbita alrededor del ganador. Misma interfaz que Tablero (2D).
import * as THREE from 'three';
import { META } from './motor.js?v=202611161756';
import { sfx } from './sonido.js?v=202611161756';
import { confeti } from './tablero.js?v=202611161756';
import * as FX from './efectos3d.js?v=202611161756';
import { cargarMuneco, animarMuneco } from './muneco3d.js?v=202611161756';

const W = 2;                                   // ancho de una casilla
const xDe = p => (Math.min(Math.max(p, 0), META) - META / 2) * W;
const zDe = i => (i - 1.5) * 2.6;
const espera = ms => new Promise(r => setTimeout(r, ms));
const suave = t => t * t * (3 - 2 * t);

function lienzo(w, h, dibujar) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  dibujar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function texturaEmoji(texto, tam = 256) {
  return lienzo(tam, tam, (g) => {
    g.font = `${tam * 0.78}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texto, tam / 2, tam * 0.55);
  });
}
function texturaImagen(src) {
  const t = new THREE.TextureLoader().load(src);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texturaNombre(nombre, color) {
  return lienzo(512, 128, (g, w, h) => {
    g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 8;
    const r = 50;
    g.beginPath(); g.roundRect(8, 14, w - 16, h - 28, r); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 56px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6;
    g.fillText(nombre.toUpperCase(), w / 2, h / 2 + 3, w - 50);
  });
}

function halo128(rgb) {
  return lienzo(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, `rgba(${rgb},.9)`); r.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
}

// Colores y decorado de cada escenario.
const TEMAS = {
  estadio: {
    cielo: [[0, '#060b1f'], [0.55, '#1b2a5a'], [1, '#f08a4b']], niebla: 0x16224a, hemi: [0xcfe3ff, 0x2a4a2a, 1.1], sol: [0xfff4e0, 2.2], fuera: 0x1f5f2a,
    campo: { base: '#2c8a3b', a: '#2f9440', b: '#2a8238', ruido: 0.06, linea: '#ffffff', meta: 'rgba(255,255,255,.22)', letras: 'rgba(255,255,255,.9)', carril: 'rgba(255,255,255,.45)' },
    palos: 'rugby', gradaFondo: '#1a1f33', gradaBase: 0x2b2f45,
  },
  playa: {
    cielo: [[0, '#3a8fd9'], [0.6, '#8fd3ff'], [1, '#fff1c9']], niebla: 0xbfe6ff, hemi: [0xffffff, 0xd9c08a, 1.3], sol: [0xfff2d6, 2.6], fuera: 0xe6cf98,
    campo: { base: '#ecd49b', a: '#e7cc8e', b: '#f0dba6', ruido: 0.08, linea: '#ffffff', meta: 'rgba(255,90,90,.25)', letras: 'rgba(120,70,20,.85)', carril: 'rgba(255,255,255,.7)' },
    palos: 'arco', arco: 0xff4f79, gradaFondo: '#3b2a17', gradaBase: 0x8b5a2b,
  },
  nieve: {
    cielo: [[0, '#5b7da8'], [0.6, '#b8cde4'], [1, '#f3f7fb']], niebla: 0xd8e4f0, hemi: [0xeaf2ff, 0xb0c4d8, 1.2], sol: [0xffffff, 1.9], fuera: 0xf1f5fa,
    campo: { base: '#eef4fa', a: '#e3ecf5', b: '#f7fafd', ruido: 0.05, linea: '#3a7bd5', meta: 'rgba(58,123,213,.2)', letras: 'rgba(30,70,140,.85)', carril: 'rgba(58,123,213,.5)' },
    palos: 'arco', arco: 0x3a7bd5, gradaFondo: '#2a3550', gradaBase: 0x55657d,
  },
  volcan: {
    cielo: [[0, '#0b0202'], [0.55, '#3a0a05'], [1, '#c2410c']], niebla: 0x2a0d06, hemi: [0xffb08a, 0x2a0a00, 0.75], sol: [0xffa36b, 1.5], fuera: 0x1e1412,
    campo: { base: '#3b2a26', a: '#43302b', b: '#36261f', ruido: 0.08, linea: '#ffb347', meta: 'rgba(255,120,30,.25)', letras: 'rgba(255,190,110,.95)', carril: 'rgba(255,170,80,.5)', grietas: '#ff6a00', brillo: 0xff5a00 },
    palos: 'arco', arco: 0x222222, gradaFondo: '#1a0e0b', gradaBase: 0x3a2a24,
  },
};

export class Tablero3D {
  constructor(raiz, personajes, { sonido = true, escenario = 'estadio' } = {}) {
    this.raiz = raiz;
    this.escenario = TEMAS[escenario] ? escenario : 'estadio';
    this.personajes = personajes;
    this.sonido = sonido;
    this.velocidad = 1;
    this.tweens = [];
    this.vivo = true;
    this.temblor = 0;
    this.restos = [];
    this.toma = null;
    this.modoBase = 'tv';
    this.reloj = new THREE.Clock();
    raiz.innerHTML = '';
    raiz.classList.add('campo3d');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    raiz.appendChild(this.renderer.domElement);
    this.capa = document.createElement('div');
    this.capa.className = 'capa3d';
    raiz.appendChild(this.capa);

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(42, 2, 0.1, 400);
    this.camara.position.set(-30, 25, 40);
    this.mira = new THREE.Vector3(0, 0, 0);
    this.construirEstadio();
    this.construirCorredores();
    this.redimensionar();
    this.ro = new ResizeObserver(() => this.redimensionar());
    this.ro.observe(raiz);
    this.bucle = this.bucle.bind(this);
    requestAnimationFrame(this.bucle);
  }

  destruir() {
    this.vivo = false;
    this.ro.disconnect();
    this.renderer.dispose();
    this.raiz.classList.remove('campo3d');
  }

  sonar(n) { if (this.sonido) sfx(n); }
  texturaEmoji(t) { return texturaEmoji(t); }

  redimensionar() {
    const w = this.raiz.clientWidth || 800, h = this.raiz.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  // ---------- escenario ----------
  construirEstadio() {
    const E = this.escena;
    const T = TEMAS[this.escenario] || TEMAS.estadio;
    E.background = lienzo(16, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      T.cielo.forEach(([k, c]) => gr.addColorStop(k, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    E.fog = new THREE.Fog(T.niebla, 60, 150);
    E.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
    const sol = new THREE.DirectionalLight(T.sol[0], T.sol[1]);
    sol.position.set(-12, 26, 14);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -22, right: 22, top: 14, bottom: -14, near: 1, far: 80 });
    E.add(sol);

    // suelo de alrededor
    const fuera = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: T.fuera, roughness: 1 }));
    fuera.rotation.x = -Math.PI / 2; fuera.position.y = -0.02; fuera.receiveShadow = true;
    E.add(fuera);

    // campo pintado
    const ANCHO = 32, FONDO = 16, S = 64;
    const C = T.campo;
    const campo = lienzo(ANCHO * S, FONDO * S, (g, w, h) => {
      const X = x => (x + ANCHO / 2) * S, Z = z => (z + FONDO / 2) * S;
      g.fillStyle = C.base; g.fillRect(0, 0, w, h);
      for (let k = -2; k <= 14; k++) {
        g.fillStyle = k % 2 ? C.a : C.b;
        g.fillRect(X((k - 6) * W - 1), 0, W * S, h);
      }
      for (let i = 0; i < 9000; i++) {         // textura (hierba, arena, nieve o roca)
        g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * C.ruido})`;
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      if (C.grietas) {                         // volcán: grietas de lava
        g.strokeStyle = C.grietas; g.lineWidth = 5; g.shadowColor = C.grietas; g.shadowBlur = 14;
        for (let i = 0; i < 26; i++) {
          let x = Math.random() * w, y = Math.random() * h;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 160; y += (Math.random() - 0.5) * 160; g.lineTo(x, y); }
          g.stroke();
        }
        g.shadowBlur = 0;
      }
      g.strokeStyle = C.linea; g.lineWidth = 7;
      g.strokeRect(X(-13), Z(-5.2), (27) * S, 10.4 * S);
      for (let k = 2; k <= 12; k++) { g.lineWidth = 5; g.beginPath(); g.moveTo(X((k - 6) * W - 1), Z(-5.2)); g.lineTo(X((k - 6) * W - 1), Z(5.2)); g.stroke(); }
      g.lineWidth = 16; [1, 12].forEach(k => { g.beginPath(); g.moveTo(X((k - 6) * W - 1), Z(-5.4)); g.lineTo(X((k - 6) * W - 1), Z(5.4)); g.stroke(); });
      // zona de meta
      g.save(); g.beginPath(); g.rect(X(11), Z(-5.2), 3 * S, 10.4 * S); g.clip();
      g.strokeStyle = C.meta; g.lineWidth = 18;
      for (let d = -20; d < 30; d++) { g.beginPath(); g.moveTo(X(11 + d * 0.6), Z(-5.2)); g.lineTo(X(11 + d * 0.6 + 10.4), Z(5.2)); g.stroke(); }
      g.restore();
      g.save(); g.translate(X(12.5), Z(0)); g.rotate(-Math.PI / 2);
      g.fillStyle = C.letras; g.font = `400 ${S * 1.5}px Bungee, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('META', 0, 0); g.restore();
      // carriles
      g.setLineDash([S * 0.5, S * 0.35]); g.strokeStyle = C.carril; g.lineWidth = 5;
      [-2.6, 0, 2.6].forEach(z => { g.beginPath(); g.moveTo(X(-11), Z(z)); g.lineTo(X(11), Z(z)); g.stroke(); });
      g.setLineDash([]);
      this.personajes.forEach((p, i) => {
        g.fillStyle = p.color; g.globalAlpha = 0.55;
        g.beginPath(); g.roundRect(X(-12.85), Z(zDe(i) - 1.15), 1.7 * S, 2.3 * S, 18); g.fill();
        g.globalAlpha = 0.16; g.fillRect(X(-11), Z(zDe(i) - 1.25), 22 * S, 2.5 * S);
        g.globalAlpha = 1;
      });
      // números
      g.fillStyle = C.letras; g.font = `900 ${S * 0.9}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let k = 1; k < META; k++) g.fillText(String(k), X((k - 6) * W), Z(6.2));
    });
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, FONDO), new THREE.MeshStandardMaterial({ map: campo, roughness: 0.95, emissive: C.brillo || 0x000000, emissiveMap: C.brillo ? campo : null, emissiveIntensity: 0.35 }));
    suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true;
    E.add(suelo);

    if (T.palos === 'rugby') this.palosRugby(); else this.arcoMeta(T.arco);

    // vallas publicitarias
    const valla = lienzo(2048, 64, (g, w, h) => {
      g.fillStyle = '#0d1b12'; g.fillRect(0, 0, w, h);
      g.font = '400 40px Bungee, Impact, sans-serif'; g.textBaseline = 'middle';
      const txt = ['ESTAMPIDA', '★', 'APUESTA YA', '★', 'CARRERAS LOCAS', '★'];
      let x = 10, k = 0;
      while (x < w) { g.fillStyle = k % 2 ? '#ffffff' : '#ffd166'; const t = txt[k % txt.length]; g.fillText(t, x, h / 2); x += g.measureText(t).width + 30; k++; }
    });
    valla.wrapS = THREE.RepeatWrapping;
    this.valla = valla;
    const v = new THREE.Mesh(new THREE.BoxGeometry(36, 0.9, 0.15), new THREE.MeshBasicMaterial({ map: valla }));
    v.position.set(0, 0.45, -7.2); E.add(v);

    // gradas con público
    const publico = lienzo(1024, 256, (g, w, h) => {
      g.fillStyle = T.gradaFondo; g.fillRect(0, 0, w, h);
      const cols = ['#d7263d', '#ffd166', '#06d6a0', '#118ab2', '#ffffff', '#ef7d1a', '#8e44ad', '#f4b400', '#e75480'];
      for (let y = 8; y < h; y += 14) for (let x = (y % 28 ? 0 : 6); x < w; x += 12) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.beginPath(); g.arc(x + Math.random() * 3, y + Math.random() * 3, 4.2, 0, Math.PI * 2); g.fill();
      }
    });
    publico.wrapS = publico.wrapT = THREE.RepeatWrapping;
    publico.repeat.set(4, 2);
    this.publico = publico;
    const matPub = new THREE.MeshStandardMaterial({ map: publico, roughness: 1, emissive: 0x222233, emissiveMap: publico, emissiveIntensity: 0.6 });
    const grada = (ancho, x, z, ry) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 14), matPub);
      p.rotation.x = -0.62; p.position.set(0, 5.5, 0);
      const base = new THREE.Mesh(new THREE.BoxGeometry(ancho, 1.2, 1), new THREE.MeshStandardMaterial({ color: T.gradaBase }));
      base.position.set(0, 0.6, 5.2);
      g.add(p, base);
      g.position.set(x, 0, z); g.rotation.y = ry;
      E.add(g);
    };
    if (T.gradaFondo && this.escenario === 'estadio') grada(64, 0, -15, 0);
    grada(40, -30, 0, Math.PI / 2);
    grada(40, 31, 0, -Math.PI / 2);

    this.particulas = null;
    ({ estadio: () => this.decoEstadio(), playa: () => this.decoPlaya(), nieve: () => this.decoNieve(), volcan: () => this.decoVolcan() })[this.escenario]?.();
  }

  palosRugby() {
    const blanco = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const palos = new THREE.Group();
    [-1.3, 1.3].forEach(z => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7.5, 12), blanco); m.position.set(0, 3.75, z); m.castShadow = true; palos.add(m); });
    const trav = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12), blanco); trav.rotation.x = Math.PI / 2; trav.position.y = 2.2; palos.add(trav);
    [-1.3, 1.3].forEach(z => { const pr = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0xd7263d })); pr.position.set(0, 0.8, z); palos.add(pr); });
    palos.position.x = 13.6;
    this.metaObj = palos;
    this.escena.add(palos);
  }

  // Arco hinchable de meta (playa, nieve, volcán).
  arcoMeta(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const arco = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.45, 14, 40, Math.PI), mat);
    arco.rotation.y = Math.PI / 2; arco.castShadow = true;
    const cartel = lienzo(512, 96, (c, w, h) => {
      c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = '400 64px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('META', w / 2, h / 2 + 4);
    });
    const banda = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.95), new THREE.MeshBasicMaterial({ map: cartel, side: THREE.DoubleSide }));
    banda.position.set(0, 5.6, 0); banda.rotation.y = -Math.PI / 2;
    g.add(arco, banda);
    g.position.x = 13.2;
    this.metaObj = g;
    this.escena.add(g);
  }

  decoEstadio() {
    const E = this.escena;
    const matTorre = new THREE.MeshStandardMaterial({ color: 0x5b6070, metalness: 0.4, roughness: 0.6 });
    const matFoco = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
    [[-26, -20], [26, -20], [-26, 18], [26, 18]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 22, 8), matTorre); t.position.set(x, 11, z); E.add(t);
      const f = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.6), matFoco); f.position.set(x, 22.5, z); f.lookAt(0, 0, 0); E.add(f);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo128('255,250,220'), depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.copy(f.position); halo.scale.set(12, 12, 1); E.add(halo);
    });
  }

  decoPlaya() {
    const E = this.escena;
    // mar al fondo con olas que se mueven
    const olas = lienzo(512, 512, (g, w, h) => {
      g.fillStyle = '#1b8fd1'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4;
      for (let y = 10; y < h; y += 26) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 30 + y) * 5); g.stroke(); }
    });
    olas.wrapS = olas.wrapT = THREE.RepeatWrapping; olas.repeat.set(8, 3);
    this.mar = olas;
    const mar = new THREE.Mesh(new THREE.PlaneGeometry(260, 90), new THREE.MeshStandardMaterial({ map: olas, roughness: 0.25, metalness: 0.2 }));
    mar.rotation.x = -Math.PI / 2; mar.position.set(0, 0.01, -58); E.add(mar);
    const orilla = new THREE.Mesh(new THREE.PlaneGeometry(260, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    orilla.rotation.x = -Math.PI / 2; orilla.position.set(0, 0.03, -13.2); E.add(orilla);
    // sol
    const sol = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo128('255,240,170'), depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sol.position.set(-30, 38, -110); sol.scale.set(40, 40, 1); E.add(sol);
    // palmeras, sombrillas y toallas
    const tronco = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 });
    const hoja = new THREE.MeshStandardMaterial({ color: 0x2e9e44, roughness: 0.8, side: THREE.DoubleSide });
    const palmera = (x, z, alto = 7) => {
      const g = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - k * 0.02, 0.32 - k * 0.02, alto / 7, 8), tronco);
        s.position.set(Math.sin(k * 0.35) * 0.5, alto / 14 + k * alto / 7, 0); s.castShadow = true; g.add(s);
      }
      for (let k = 0; k < 7; k++) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.6, 4, 1, true), hoja);
        h.position.set(Math.sin(2.1) * 0.5, alto, 0);
        h.rotation.set(Math.PI / 2.4, (k / 7) * Math.PI * 2, 0, 'YXZ'); h.translateY(1.6);
        h.castShadow = true; g.add(h);
      }
      g.position.set(x, 0, z); g.rotation.y = Math.random() * 6; E.add(g);
    };
    [[-20, -10], [-15, -11.5], [16, -10.5], [21, -9], [-22, 11], [22, 11.5], [0, -11.8], [-27, 14], [27, 13]].forEach(([x, z]) => palmera(x, z, 6 + Math.random() * 3));
    const colores = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xff9f1c];
    for (let k = 0; k < 8; k++) {
      const atras = k < 5, x = atras ? -24 + k * 11 + Math.random() * 2 : [-21, 19, 24][k - 5], z = atras ? -9.6 : 10;
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
      palo.position.set(x, 1.5, z);
      const tela = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 10), new THREE.MeshStandardMaterial({ color: colores[k % 5], roughness: 0.7 }));
      tela.position.set(x, 3.1, z); tela.castShadow = true;
      const toalla = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshStandardMaterial({ color: colores[(k + 2) % 5] }));
      toalla.rotation.x = -Math.PI / 2; toalla.position.set(x + 1.2, 0.02, z);
      E.add(palo, tela, toalla);
    }
  }

  decoNieve() {
    const E = this.escena;
    const verde = new THREE.MeshStandardMaterial({ color: 0x1f5c3a, roughness: 0.9, flatShading: true });
    const nieve = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
    const abeto = (x, z, s = 1) => {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.4, 2, 8), verde); c.position.y = 1.6 + k * 1.2; c.castShadow = true;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.22, 0.8, 8), nieve); cap.position.y = 2.3 + k * 1.2;
        g.add(c, cap);
      }
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1), new THREE.MeshStandardMaterial({ color: 0x5a3a22 })); tr.position.y = 0.5; g.add(tr);
      g.scale.setScalar(s); g.position.set(x, 0, z); E.add(g);
    };
    for (let k = 0; k < 18; k++) abeto(-28 + k * 3.3 + Math.random(), -10 - Math.random() * 4, 0.9 + Math.random() * 0.6);
    [-28, -22, 20, 26].forEach(x => abeto(x, 11 + Math.random() * 2, 0.8 + Math.random() * 0.4));
    // montañas nevadas al fondo
    const roca = new THREE.MeshStandardMaterial({ color: 0x6d7f95, roughness: 1, flatShading: true });
    [[-40, -70, 26], [-5, -80, 34], [32, -72, 28], [60, -85, 30]].forEach(([x, z, h]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 7), roca); m.position.set(x, h / 2 - 1, z); E.add(m);
      const cima = new THREE.Mesh(new THREE.ConeGeometry(h * 0.36, h * 0.4, 7), nieve); cima.position.set(x, h - 1 - h * 0.2, z); E.add(cima);
    });
    // muñeco de nieve
    const mu = new THREE.Group();
    [[0.9, 0.9], [0.65, 2.2], [0.45, 3.2]].forEach(([r, y]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), nieve); b.position.y = y; b.castShadow = true; mu.add(b); });
    const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xff7f11 })); nariz.rotation.x = Math.PI / 2; nariz.position.set(0, 3.2, 0.6); mu.add(nariz);
    mu.position.set(-17, 0, 9); mu.rotation.y = 0.5; E.add(mu);
    // copos que caen
    this.crearParticulas(1400, 0xffffff, 0.22, { x: 70, y: 30, z: 50 }, -2.2);
  }

  decoVolcan() {
    const E = this.escena;
    const roca = new THREE.MeshStandardMaterial({ color: 0x2b1d18, roughness: 1, flatShading: true });
    // volcán al fondo con cráter encendido
    const volcan = new THREE.Mesh(new THREE.CylinderGeometry(7, 34, 30, 12, 1, true), roca);
    volcan.position.set(4, 14, -70); E.add(volcan);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(7, 20), new THREE.MeshBasicMaterial({ color: 0xff5a00 }));
    crater.rotation.x = -Math.PI / 2; crater.position.set(4, 29, -70); E.add(crater);
    const resplandor = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo128('255,110,20'), depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    resplandor.position.set(4, 32, -70); resplandor.scale.set(50, 30, 1); E.add(resplandor);
    const luz = new THREE.PointLight(0xff5a1f, 120, 120); luz.position.set(4, 30, -60); E.add(luz);
    this.luzVolcan = luz;
    // ríos de lava a los lados del campo
    const lava = lienzo(256, 256, (g, w, h) => {
      g.fillStyle = '#ff4d00'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,220,80' : '120,20,0'},${Math.random() * 0.6})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, Math.PI * 2); g.fill(); }
    });
    lava.wrapS = lava.wrapT = THREE.RepeatWrapping; lava.repeat.set(10, 1);
    this.lava = lava;
    [-9.6, 9.6].forEach(z => {
      const rio = new THREE.Mesh(new THREE.PlaneGeometry(80, 2.2), new THREE.MeshBasicMaterial({ map: lava }));
      rio.rotation.x = -Math.PI / 2; rio.position.set(0, 0.02, z); E.add(rio);
    });
    // rocas sueltas
    for (let k = 0; k < 26; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.4), roca);
      const lado = k % 2 ? 1 : -1;
      r.position.set(-30 + Math.random() * 60, 0.3, lado * (11.5 + Math.random() * 6)); r.rotation.set(Math.random(), Math.random(), Math.random()); r.castShadow = true;
      E.add(r);
    }
    // ascuas que suben
    this.crearParticulas(700, 0xff8a2a, 0.18, { x: 70, y: 26, z: 40 }, 1.6);
  }

  crearParticulas(n, color, tam, caja, vel) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * caja.x; pos[i * 3 + 1] = Math.random() * caja.y; pos[i * 3 + 2] = (Math.random() - 0.5) * caja.z; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: tam, transparent: true, opacity: 0.9, depthWrite: false, blending: vel > 0 ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.escena.add(p);
    this.particulas = { p, caja, vel };
  }
  moverParticulas(dt, t) {
    const P = this.particulas; if (!P) return;
    const a = P.p.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + P.vel * dt;
      if (y < 0) y += P.caja.y; else if (y > P.caja.y) y -= P.caja.y;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.4);
    }
    a.needsUpdate = true;
  }

  construirCorredores() {
    this.fichas = this.personajes.map((p, i) => {
      const g = new THREE.Group();
      g.position.set(xDe(0), 0, zDe(i));
      const anillo = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9 }));
      anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.02;
      const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
      sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.015;
      const tex = p.imagen ? texturaImagen('personajes/' + p.imagen) : texturaEmoji(p.emoji);
      const cuerpo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      cuerpo.center.set(0.5, 0.05);
      cuerpo.scale.set(2.3, 2.3, 1);
      const nombre = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaNombre(p.nombre, p.color), depthTest: false }));
      nombre.scale.set(2.2, 0.55, 1); nombre.position.y = 2.75; nombre.renderOrder = 5;
      const marca = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaEmoji(' '), depthTest: false }));
      marca.scale.set(0.9, 0.9, 1); marca.position.set(0.9, 2.2, 0); marca.visible = false; marca.renderOrder = 6;
      g.add(sombra, anillo, cuerpo, nombre, marca);
      this.escena.add(g);
      const f = { g, cuerpo, sombra, anillo, nombre, marca, pos: 0, caido: false, salto: 0, fiesta: false, corriendo: 0, muneco: null };
      if (p.modelo) this.ponerMuneco(f, p);
      return f;
    });
  }

  // Si el personaje tiene modelo 3D, sustituye al dibujo en cuanto carga (si falla, se queda el dibujo).
  async ponerMuneco(f, p) {
    try {
      const m = await cargarMuneco(p);
      if (!this.vivo) return;
      m.cuerpo.position.copy(f.cuerpo.position);
      f.g.remove(f.cuerpo);
      f.g.add(m.cuerpo);
      f.cuerpo = m.cuerpo;
      f.muneco = m;
      this.tumbar(f, f.caido ? 1 : 0);
      if (this.apagados?.includes(f)) m.materiales.forEach(x => x.color?.multiplyScalar(0.55));
    } catch (e) { console.warn('Modelo 3D de ' + p.nombre, e); }
  }

  // Ayudas que valen para el dibujo (sprite) y para el muñeco 3D
  estirar(f, sx, sy) {
    if (f.muneco) f.cuerpo.scale.set(sx, sy, sx);
    else f.cuerpo.scale.set(2.3 * sx, 2.3 * sy, 1);
  }
  tumbar(f, k) {
    if (f.muneco?.tumbaSola) return;          // su animación de caída ya lo tumba
    if (f.muneco) { f.cuerpo.rotation.z = -k * Math.PI / 2 * 0.95; f.cuerpo.position.y = Math.max(f.cuerpo.position.y, k * 0.25); }
    else f.cuerpo.material.rotation = k * Math.PI / 2;
  }
  // Los demás miran al que le pasa algo y reaccionan: se ríen, se asustan, se enfadan o aplauden.
  reaccionesA(ev) {
    if (['meteorito', 'abduce', 'explota', 'tornado'].includes(ev.e)) {
      const quien = ev.c ?? 0;
      return this.reaccionar(ev.e === 'tornado' ? -1 : quien, ev.e === 'explota' ? [['risa', 4], ['susto', 4]] : [['susto', 6], ['risa', 2], ['aplauso', 1]]);
    }
    const mal = ['cae', 'lesion', 'roja'].includes(ev.e) ? ev.c : ev.e === 'placa' ? ev.a?.[0]
      : ev.e === 'mueve' && !ev.salto && ev.a < ev.de ? ev.c : undefined;
    const bien = ev.e === 'mueve' && (ev.a - ev.de >= 3 || (ev.salto && ev.a > ev.de)) ? ev.c : undefined;
    if (mal !== undefined) this.reaccionar(mal, [['risa', 5], ['susto', 3], ['aplauso', 1.5]]);
    else if (bien !== undefined) this.reaccionar(bien, [['susto', 4], ['enfado', 3], ['aplauso', 2]]);
    if (ev.e === 'levanta' && Math.random() < 0.6) setTimeout(() => this.gesto(ev.c, 'enfado'), 500);
  }
  reaccionar(c, pesos) {
    const total = pesos.reduce((s, [, w]) => s + w, 0);
    this.fichas.forEach((f, i) => {
      if (i === c || f.caido || f.fuera || f.abducido || f.corriendo > 0) return;
      let r = Math.random() * total, tipo = pesos[0][0];
      for (const [t, w] of pesos) { r -= w; if (r <= 0) { tipo = t; break; } }
      setTimeout(() => {
        f.reaccion = { tipo, id: (f.reaccion?.id || 0) + 1 };
        f.mirarA = c >= 0 ? c : null; f.mirarHasta = performance.now() + 2800;
      }, 150 + Math.random() * 500);
    });
  }
  gesto(c, nombre) { const f = this.fichas[c]; f.gesto = nombre; f.gestoId = (f.gestoId || 0) + 1; }
  apagar(f) {
    f.pierde = true;
    (this.apagados ||= []).push(f);
    if (f.muneco) f.muneco.materiales.forEach(x => x.color?.multiplyScalar(0.55));
    else f.cuerpo.material.color.set(0x8a8a8a);
  }

  ponerMarca(c, emoji) {
    const f = this.fichas[c];
    if (!emoji) { f.marca.visible = false; return; }
    f.marca.material.map = texturaEmoji(emoji);
    f.marca.material.needsUpdate = true;
    f.marca.visible = true;
  }
  ponerCaido(c, si) {
    const f = this.fichas[c];
    f.caido = si;
    this.animarValor(0.35, t => this.tumbar(f, si ? t : 1 - t));
  }

  // ---------- animaciones ----------
  animarValor(seg, fn) {
    return new Promise(ok => this.tweens.push({ t0: performance.now(), dur: (seg * 1000) / this.velocidad, fn, ok }));
  }

  colocar(corredores) {
    corredores.forEach((r, i) => {
      const f = this.fichas[i];
      f.pos = r.pos;
      f.g.position.x = xDe(r.pos);
      f.caido = !!r.caido || !!r.fuera;
      this.tumbar(f, f.caido ? 1 : 0);
      f.espaldas = r.reves > 0;
      if (r.fuera && !f.fuera) { f.fuera = true; this.apagar(f); }
      const dentro = r.abducido > 0;
      f.abducido = dentro;
      [f.cuerpo, f.anillo, f.sombra, f.nombre].forEach(o => { o.visible = !dentro; });
      this.ponerMarca(i, r.fuera ? '☠️' : r.bomba > 0 ? '💣' : r.caido ? '💫' : r.sancion > 2 ? '🟥' : r.sancion > 0 ? '🟨' : r.reves > 0 ? '↩️' : null);
    });
  }

  async mover(c, de, a, teletransporte = false, ev = {}) {
    const f = this.fichas[c];
    if (ev.ovni) return;                                   // ya lo coloca la animación del ovni
    if (ev.cohete) return FX.cohete(this, c, de, a, xDe);
    if (teletransporte) {
      this.gesto(c, 'salto');
      await this.animarValor(0.25, t => this.estirar(f, 1 - t, 1 + t));
      f.g.position.x = xDe(a); f.pos = a;
      this.efecto(c, '✨', 2.5);
      await this.animarValor(0.3, t => this.estirar(f, t, 2 - t));
      this.estirar(f, 1, 1);
      return;
    }
    const paso = a > de ? 1 : -1;
    f.corriendo++;
    for (let x = de; x !== a; x += paso) {
      const x0 = xDe(x), x1 = xDe(x + paso);
      this.sonar('paso');
      await this.animarValor(0.26, t => {
        f.g.position.x = x0 + (x1 - x0) * t;
        const alto = Math.sin(Math.PI * t);
        f.cuerpo.position.y = alto * 0.9;
        this.estirar(f, 1 - alto * 0.08, 1 + alto * 0.1);
        f.sombra.scale.setScalar(1 - alto * 0.4);
      });
      if (Math.abs(x1) <= 12) this.polvo(c);
    }
    f.corriendo--;
    f.cuerpo.position.y = 0; this.estirar(f, 1, 1); f.sombra.scale.setScalar(1);
    f.pos = a;
  }

  efecto(c, emoji, tam = 2, dur = 0.9) {
    const f = this.fichas[c];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaEmoji(emoji), transparent: true, depthTest: false }));
    s.position.set(f.g.position.x, 1.4, f.g.position.z);
    s.renderOrder = 8;
    this.escena.add(s);
    this.animarValor(dur, t => { const k = tam * (0.3 + t); s.scale.set(k, k, 1); s.material.opacity = 1 - t * t; }).then(() => this.escena.remove(s));
  }

  efectoEn(pos, emoji, tam = 2, dur = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaEmoji(emoji), transparent: true, depthTest: false }));
    s.position.copy(pos);
    s.renderOrder = 8;
    this.escena.add(s);
    this.animarValor(dur, t => { const k = tam * (0.3 + t); s.scale.set(k, k, 1); s.material.opacity = 1 - t * t; }).then(() => this.escena.remove(s));
  }

  polvo(c) {
    const f = this.fichas[c];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe8f3d0, transparent: true, opacity: 0.6, depthWrite: false }));
      s.position.set(f.g.position.x - 0.3 + Math.random() * 0.3, 0.15, f.g.position.z + (Math.random() - 0.5) * 0.8);
      this.escena.add(s);
      const dx = -0.4 - Math.random() * 0.6;
      this.animarValor(0.5, t => { s.scale.setScalar(0.2 + t * 0.6); s.position.x += dx * 0.02; s.position.y = 0.15 + t * 0.4; s.material.opacity = 0.6 * (1 - t); }).then(() => this.escena.remove(s));
    }
  }

  burbuja(c, texto, clase = '') {
    const b = document.createElement('div');
    b.className = 'burbuja3d ' + clase;
    b.textContent = texto;
    b.dataset.c = c;
    this.capa.appendChild(b);
    setTimeout(() => b.remove(), 1700 / this.velocidad);
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

  // ---------- realizador ----------
  centroCarrera() {
    const xs = this.fichas.map(f => f.g.position.x);
    return Math.min(Math.max((Math.max(...xs) + Math.min(...xs)) / 2 + 1, -7), 7);
  }
  plano(nombre, dur, c) {
    const t0 = performance.now();
    const hasta = t0 + dur / Math.max(this.velocidad, 1);
    this.toma = { nombre, c, t0, hasta, centro: this.centroCarrera() };
  }
  objetivoCamara(t) {
    const tm = this.toma && performance.now() < this.toma.hasta ? this.toma : null;
    if (!tm) this.toma = null;
    const ahora = performance.now();
    if (tm) {
      const f = tm.c !== undefined ? this.fichas[tm.c] : null;
      const p = f ? f.g.position : null;
      const k = (ahora - tm.t0) / (tm.hasta - tm.t0);
      switch (tm.nombre) {
        case 'cerca': return { pos: new THREE.Vector3(p.x - 2.6, 2.3, p.z + 5.6), mira: new THREE.Vector3(p.x, 1.1, p.z) };
        case 'presenta': return { pos: new THREE.Vector3(p.x + 3.4, 1.7, p.z + 3.6), mira: new THREE.Vector3(p.x, 1.2, p.z) };
        case 'giro': {
          const a = -0.9 + suave(k) * 1.8, R = 17;
          return { pos: new THREE.Vector3(tm.centro + Math.sin(a) * R, 7.5, Math.cos(a) * R), mira: new THREE.Vector3(tm.centro, 0.5, 0) };
        }
        case 'ganador': {
          const a = (ahora - tm.t0) / 2600, R = 7;
          return { pos: new THREE.Vector3(p.x + Math.sin(a) * R, 3.2, p.z + Math.cos(a) * R), mira: new THREE.Vector3(p.x, 1.2, p.z) };
        }
        case 'salida': return { pos: new THREE.Vector3(-17, 3, 8), mira: new THREE.Vector3(-8, 1, 0) };
        case 'foto': return { pos: new THREE.Vector3(xDe(META) + 0.15, 1.4, 7.8), mira: new THREE.Vector3(xDe(META) + 0.15, 1.0, -1.5) };
        case 'cenital': return { pos: new THREE.Vector3(tm.centro, 26, 4), mira: new THREE.Vector3(tm.centro, 0, 0) };
      }
    }
    const cx = this.centroCarrera();
    if (this.modoBase === 'recta') {
      const lider = Math.max(...this.fichas.map(f => f.g.position.x));
      return { pos: new THREE.Vector3(16.5, 2.2, 6.5 + Math.sin(t * 0.3)), mira: new THREE.Vector3(lider - 2, 1.2, 0) };
    }
    const ex = cx * 0.45;   // plano general: se ve el campo entero, con un leve vaivén
    return { pos: new THREE.Vector3(ex - 2 + Math.sin(t * 0.17) * 2.5, 12, 19), mira: new THREE.Vector3(ex + 0.5, 0, 1.4) };
  }

  bucle() {
    if (!this.vivo) return;
    requestAnimationFrame(this.bucle);
    const dt = Math.min(this.reloj.getDelta(), 0.1);
    const t = this.reloj.elapsedTime;
    const ahora = performance.now();
    this.tweens = this.tweens.filter(tw => {
      const k = Math.min(1, (ahora - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tw.ok(); return false; }
      return true;
    });
    // ganadores saltan de alegría
    this.fichas.forEach(f => {
      if (!f.muneco && f.cuerpo.material) f.cuerpo.material.map.repeat.x = f.espaldas ? -1 : 1, f.cuerpo.material.map.offset.x = f.espaldas ? 1 : 0;
      if (f.fiesta && !f.muneco?.animado) f.cuerpo.position.y = Math.abs(Math.sin(t * 6)) * 0.9;   // los animados ya celebran solos
      if (f.muneco) {
        const obj = f.mirarA != null && performance.now() < f.mirarHasta && !f.corriendo ? this.fichas[f.mirarA] : null;
        const mirar = obj ? { x: obj.g.position.x - f.g.position.x, z: obj.g.position.z - f.g.position.z } : null;
        animarMuneco(f.muneco, { corriendo: f.corriendo > 0, fiesta: f.fiesta, caido: f.caido, pierde: f.pierde, gesto: f.gesto, gestoId: f.gestoId, reaccion: f.reaccion, mirar, espaldas: f.espaldas }, dt, t);
      }
    });
    // público y vallas
    this.publico.offset.y = Math.sin(t * (this.euforia ? 14 : 2)) * (this.euforia ? 0.012 : 0.002);
    this.valla.offset.x = (t * 0.03) % 1;
    this.moverParticulas(dt, t);
    if (this.mar) { this.mar.offset.y = (t * 0.02) % 1; this.mar.offset.x = Math.sin(t * 0.3) * 0.02; }
    if (this.lava) this.lava.offset.x = (t * 0.015) % 1;
    if (this.luzVolcan) this.luzVolcan.intensity = 110 + Math.sin(t * 3) * 25 + Math.random() * 15;
    // cámara
    const obj = this.objetivoCamara(t);
    const k = 1 - Math.exp(-dt * (this.toma ? 3.2 : 1.8));
    this.camara.position.lerp(obj.pos, k);
    if (this.temblor > 0) {
      this.temblor = Math.max(0, this.temblor - dt * 1.5);
      this.camara.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.temblor * 0.6));
    }
    this.mira.lerp(obj.mira, k);
    this.camara.lookAt(this.mira);
    this.renderer.render(this.escena, this.camara);
    // burbujas pegadas a los corredores
    const w = this.raiz.clientWidth, h = this.raiz.clientHeight;
    this.capa.querySelectorAll('.burbuja3d').forEach(b => {
      const f = this.fichas[b.dataset.c];
      const v = f.g.position.clone(); v.y = 3.4;
      v.project(this.camara);
      b.style.left = ((v.x + 1) / 2 * w) + 'px';
      b.style.top = ((1 - v.y) / 2 * h) + 'px';
    });
  }

  // ---------- presentación de los corredores ----------
  async presentar(decir) {
    this.plano('salida', 4000);
    await decir('bienvenida');
    for (let c = 0; c < 4; c++) {
      this.plano('presenta', 6000, c);
      this.fichas[c].fiesta = 'saluda';
      this.sonar('levanta');
      await Promise.all([decir('presenta' + c, c), espera(1300)]);
      this.fichas[c].fiesta = false;
      this.fichas[c].cuerpo.position.y = 0;
    }
    this.toma = null;
  }

  // ---------- eventos de una carta ----------
  async animar(eventos, { giro = false } = {}) {
    const fuertes = eventos.find(e => ['empujon', 'meteorito', 'abduce', 'devuelve', 'explota', 'cohete', 'cae', 'placa', 'lesion', 'roja'].includes(e.e));
    if (fuertes && fuertes.c !== undefined) this.plano('cerca', 2600, fuertes.e === 'placa' ? fuertes.a[0] : fuertes.c);
    else if (eventos.some(e => ['reves', 'junta', 'portal', 'tornado', 'erupcion'].includes(e.e))) this.plano('cenital', 3200);
    else if (giro) this.plano('giro', 3800);
    let grupo = [];
    const soltar = async () => { if (grupo.length) { await Promise.all(grupo.map(g => g())); grupo = []; } };
    for (const ev of eventos) {
      this.reaccionesA(ev);
      if (ev.e === 'mueve' || ev.e === 'levanta' || ev.e === 'sancionado') {
        if (ev.e === 'mueve') grupo.push(() => this.mover(ev.c, ev.de, ev.a, ev.salto, ev));
        if (ev.e === 'levanta') grupo.push(async () => {
          this.ponerCaido(ev.c, false); this.ponerMarca(ev.c, null);
          this.burbuja(ev.c, '¡Arriba!'); this.sonar('levanta');
          await espera(450 / this.velocidad);
        });
        if (ev.e === 'sancionado') grupo.push(async () => {
          this.burbuja(ev.c, ev.quedan ? '🟨 Castigado' : '🟨 Último castigo', 'amarilla'); this.sonar('amarilla');
          if (!ev.quedan) this.ponerMarca(ev.c, null);
          await espera(450 / this.velocidad);
        });
        continue;
      }
      await soltar();
      switch (ev.e) {
        case 'cae':
          this.ponerCaido(ev.c, true); this.ponerMarca(ev.c, '💫');
          this.efecto(ev.c, '💫', 2.4); this.burbuja(ev.c, '¡PUMBA!', 'golpe'); this.sonar('cae');
          await espera(900 / this.velocidad);
          break;
        case 'lesion':
          this.burbuja(ev.c, '🚑 ¡Lesión!', 'golpe'); this.sonar('cae'); this.efecto(ev.c, '🚑', 2.2);
          await espera(600 / this.velocidad);
          break;
        case 'placa': {
          const f = this.fichas[ev.c];
          const z0 = f.g.position.z;
          this.burbuja(ev.c, '¡PLACAJE!', 'golpe');
          await this.animarValor(0.3, t => { f.g.position.z = z0 + Math.sin(Math.PI * t) * 0.8; f.cuerpo.position.y = Math.sin(Math.PI * t) * 1.2; });
          ev.a.forEach(i => { this.efecto(i, '💥', 3.2); this.gesto(i, 'golpe'); });
          this.sonar('placaje');
          await espera(350 / this.velocidad);
          break;
        }
        case 'amarilla':
        case 'roja':
          this.ponerMarca(ev.c, ev.e === 'roja' ? '🟥' : '🟨');
          this.efecto(ev.c, ev.e === 'roja' ? '🟥' : '🟨', 2.4);
          this.burbuja(ev.c, ev.e === 'roja' ? '¡ROJA!' : 'TARJETA', 'amarilla'); this.sonar('silbato');
          await espera(700 / this.velocidad);
          break;
        case 'recupera':
          this.ponerCaido(ev.c, false); this.ponerMarca(ev.c, null);
          this.burbuja(ev.c, '🩹 Como nuevo'); this.sonar('levanta');
          await espera(400 / this.velocidad);
          break;
        case 'portal':
          this.efecto(ev.c, '🌀', 2.8); this.sonar('levanta');
          await espera(250 / this.velocidad);
          break;
        case 'reves':
          this.cartel('🙃 ¡TODO AL REVÉS!', 'prorroga'); this.sonar('silbato');
          await espera(700 / this.velocidad);
          break;
        case 'junta':
          this.cartel('🫂 ¡TODOS JUNTOS!', 'prorroga');
          await espera(600 / this.velocidad);
          break;
        case 'mediavuelta':
          this.fichas[ev.c].espaldas = true; this.ponerMarca(ev.c, '↩️');
          this.burbuja(ev.c, '↩️ ¡Media vuelta!'); this.efecto(ev.c, '🔄', 2.4); this.sonar('silbato');
          await espera(700 / this.velocidad);
          break;
        case 'gira':
          this.fichas[ev.c].espaldas = false; this.ponerMarca(ev.c, null);
          this.burbuja(ev.c, '¡Otra vez de cara!');
          await espera(300 / this.velocidad);
          break;
        case 'meteorito':
          await FX.meteorito(this, ev.c, ev.elimina);
          break;
        case 'abduce':
          await FX.abducir(this, ev.c);
          break;
        case 'devuelve':
          await FX.devolver(this, ev.c, ev.a, xDe);
          break;
        case 'cohete':
          this.burbuja(ev.c, '🚀 ¡Despega!'); this.efecto(ev.c, '🚀', 3);
          await espera(400 / this.velocidad);
          break;
        case 'bomba':
          this.ponerMarca(ev.c, '💣'); this.burbuja(ev.c, '💣 ¡Lleva una bomba!', 'golpe'); this.sonar('silbato');
          await espera(700 / this.velocidad);
          break;
        case 'tictac':
          this.burbuja(ev.c, `💣 ${ev.quedan}…`, 'amarilla');
          break;
        case 'explota':
          await FX.explota(this, ev.c);
          break;
        case 'tornado':
          this.cartel('🌪️ ¡TORNADO!', 'prorroga');
          await FX.tornado(this);
          break;
        case 'nada':
          if (ev.ausente) this.cartel(ev.ausente === 'fuera' ? `☠️ ${this.personajes[ev.c].nombre} está eliminado` : `🛸 ${this.personajes[ev.c].nombre} está en el ovni`, 'suave');
          else if (ev.c !== undefined) this.burbuja(ev.c, '...'); else this.cartel('¡No pasa nada!', 'suave');
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
          this.plano('cerca', 1500, ev.entre[0]);
          this.flash(); this.sonar('foto');
          this.cartel('📸 ¡FOTO FINISH!', 'prorroga');
          await espera(1200 / this.velocidad);
          break;
        case 'gana':
          await this.ganar(ev.c);
          break;
        case 'empujon':
          await FX.empujon(this, ev.c);
          break;
        case 'ola':
          await FX.ola(this);
          break;
        case 'avalancha':
          await FX.avalancha(this, ev.a);
          break;
        case 'erupcion':
          await FX.erupcion(this, ev.suerte);
          break;
      }
    }
    await soltar();
    // al acercarse a la meta, la cámara baja a ras de suelo junto a la meta
    const lider = Math.max(...this.fichas.map(f => f.pos));
    this.modoBase = lider >= META - 3 ? 'recta' : 'tv';
  }

  // Foto finish: redoble, cámara en la línea de meta, foto en sepia y se revela quién ha ganado.
  async fotoFinish(g, s) {
    this.sonar('redoble');
    this.plano('foto', 7000);
    this.fichas.forEach(f => { f.gesto = null; });
    if (this.metaObj) this.metaObj.visible = false;          // que el arco no tape la foto
    await espera(2300 / this.velocidad);
    this.flash(); this.sonar('foto');
    // la foto: lo que se ve ahora mismo
    this.renderer.render(this.escena, this.camara);
    let url = '';
    try { url = this.renderer.domElement.toDataURL('image/jpeg', 0.85); } catch {}
    const capa = document.createElement('div');
    capa.className = 'foto-finish';
    const P = this.personajes;
    capa.innerHTML = `<div class="ff-marco">${url ? `<img src="${url}" alt="">` : '<div style="height:240px;background:#999"></div>'}<div class="ff-linea"></div>
      <div class="ff-lupa">🔍</div><div class="ff-sello">📸 FOTO FINISH</div><div class="ff-res"></div></div>`;
    this.raiz.appendChild(capa);
    await espera(2200 / this.velocidad);
    capa.querySelector('.ff-lupa').remove();
    const res = capa.querySelector('.ff-res');
    res.textContent = `1.º ${P[g].nombre} · 2.º ${P[s].nombre}`;
    res.classList.add('ve');
    this.sonar('victoria');
    await espera(1800 / this.velocidad);
    capa.classList.add('sale');
    setTimeout(() => capa.remove(), 600);
    if (this.metaObj) this.metaObj.visible = true;
    this.toma = null;
  }

  async ganar(c) {
    this.plano('ganador', 600000, c);
    this.euforia = true;
    this.fichas.forEach((f, i) => { if (i !== c) this.apagar(f); });
    this.fichas[c].fiesta = true;
    this.ponerMarca(c, '👑');
    this.efecto(c, '🏆', 4, 1.6);
    this.sonar('victoria');
    confeti(this.personajes[c].color);
    this.cartel(`🏆 ¡GANA ${this.personajes[c].nombre.toUpperCase()}!`, 'victoria');
    await espera(1500 / this.velocidad);
  }
}

export function hay3D() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
