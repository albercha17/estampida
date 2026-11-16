// Corredores con modelo 3D y esqueleto (los .glb del Bumerán: huesos hips, spine, chest, head, thighL/R, shinL/R,
// footL/R, upperArmL/R, foreArmL/R, handL/R; mira a +z, pies en y=0, 1,5 de alto) animados por código:
// correr, respirar parado, caerse de bruces y celebrar con los brazos arriba.
import * as THREE from 'three';

let utiles = null;
async function cargarUtiles() {
  if (!utiles) {
    const [{ GLTFLoader }, { clone }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js'),
    ]);
    utiles = { cargador: new GLTFLoader(), texturas: new THREE.TextureLoader(), clonar: clone };
  }
  return utiles;
}

const ESCALA = 1.3;      // 1,5 de alto -> casi 2 unidades, como los dibujos
const GIRO = 0.85;       // ni de perfil ni de frente: tres cuartos, para verles la cara corriendo hacia la meta

/**
 * Huesos «virtuales» alineados con los ejes del modelo (x a su izquierda, y arriba, z al frente): se giran sus
 * rotation.x/y/z como si los huesos no estuvieran girados y apply() lo pasa al hueso de verdad.
 */
function huesosVirtuales(reales, modelo) {
  modelo.updateMatrixWorld(true);
  const inv = modelo.getWorldQuaternion(new THREE.Quaternion()).invert();
  const q = new THREE.Quaternion();
  const out = {};
  for (const [nombre, hueso] of Object.entries(reales)) {
    const reposoMundo = inv.clone().multiply(hueso.getWorldQuaternion(new THREE.Quaternion()));
    const reposoLocal = hueso.quaternion.clone();
    const reposoInv = reposoMundo.clone().invert();
    out[nombre] = {
      rotation: new THREE.Euler(),
      apply() {
        q.setFromEuler(this.rotation);
        hueso.quaternion.copy(reposoLocal).multiply(reposoInv).multiply(q).multiply(reposoMundo);
      },
    };
  }
  return out;
}

/** Carga el muñeco del personaje p (p.modelo y p.textura, rutas dentro de personajes/). */
export async function cargarMuneco(p) {
  const { cargador, texturas, clonar } = await cargarUtiles();
  const [gltf, tex] = await Promise.all([
    cargador.loadAsync('personajes/' + p.modelo),
    p.textura ? texturas.loadAsync('personajes/' + p.textura).catch(() => null) : null,
  ]);
  if (tex) { tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }
  const escena = clonar(gltf.scene);
  if (gltf.animations?.length) return munecoAnimado(p, escena, gltf.animations);
  const material = new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : p.color, roughness: 0.75, metalness: 0 });
  let piel = null;
  escena.traverse(o => {
    if (!o.isSkinnedMesh) return;
    piel = piel || o;
    o.material = material;
    o.castShadow = true;
    o.frustumCulled = false;
    // los pocos vértices sin peso irían al origen: van con la columna
    const col = Math.max(0, o.skeleton.bones.findIndex(b => b.name === 'spine'));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < sw.count; i++) {
      if (sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) > 1e-4) continue;
      si.setXYZW(i, col, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0);
    }
  });
  const modelo = new THREE.Group();
  modelo.add(escena);
  modelo.scale.setScalar(ESCALA);
  modelo.rotation.y = GIRO;
  const cuerpo = new THREE.Group();          // lo que mueve el tablero (bote, estirón, caída)
  cuerpo.add(modelo);
  const reales = piel ? Object.fromEntries(piel.skeleton.bones.map(b => [b.name, b])) : {};
  return {
    cuerpo, modelo, yaw: GIRO, materiales: [material],
    huesos: huesosVirtuales(reales, modelo),
    brazosQuietos: !!p.brazosQuietos,
    fase: Math.random() * 6,
    carrera: 0,              // 0 parado … 1 corriendo (suavizado)
  };
}

// ---------- muñecos con animaciones hechas (Tripo, esqueleto Mixamo) ----------
// Cada grupo, con sus animaciones (por nombre). De los grupos con varias se elige una al azar cada vez.
const GRUPOS = {
  parado: [/^idle/i, /stand|breath/i],
  quieto: [/look_around/i, /scratch|stretch/i, /warm_up/i, /swagger/i, /standing_relax/i, /^wait/i, /fold_arms/i, /agree/i],
  corre: [/^run$/i, /run|sprint/i],
  anda: [/walk/i],
  cae: [/^fall/i, /knock|trip|death|die/i],
  fiesta: [/cheer/i, /dance/i, /victory|celebr/i],
  saluda: [/greet|wave/i],
  pierde: [/defeat/i, /frustrated/i, /cry|sob|sad/i],
  golpe: [/hit_to_body|hit_to/i],
  salto: [/^jump$/i],
  risa: [/laugh/i],
  susto: [/afraid/i, /frightened/i, /scared/i],
  enfado: [/angry/i, /complain/i, /frustrated/i],
  aplauso: [/clap/i],
};
const BUCLE = new Set(['parado', 'corre', 'anda', 'fiesta', 'pierde']);
const UNA_SOLA = new Set(['parado', 'corre', 'cae', 'salto']);

function munecoAnimado(p, escena, clips) {
  const materiales = [];
  let piel = null;
  escena.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if (o.isSkinnedMesh && !piel) piel = o;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => materiales.push(x));
  });
  // tamaño y apoyo: casi 2 unidades de alto con los pies en el suelo
  escena.updateMatrixWorld(true);
  const caja = new THREE.Box3();
  escena.traverse(o => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) { o.computeBoundingBox(); caja.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else { o.geometry.computeBoundingBox(); caja.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  const alto = Math.max(0.01, caja.max.y - caja.min.y);
  const modelo = new THREE.Group();
  escena.position.y -= caja.min.y;
  modelo.add(escena);
  modelo.scale.setScalar((1.5 * ESCALA) / alto);
  modelo.rotation.y = GIRO;
  const cuerpo = new THREE.Group();
  cuerpo.add(modelo);
  cuerpo.updateMatrixWorld(true);

  // el juego ya mueve al corredor: la cadera no avanza (se queda solo el bote arriba y abajo)
  for (const clip of clips) {
    for (const pista of clip.tracks) {
      if (!/hips\.position$/i.test(pista.name)) continue;
      const v = pista.values;
      for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
    }
  }
  const mezclador = new THREE.AnimationMixer(escena);
  const grupos = {};
  for (const [clave, lista] of Object.entries(GRUPOS)) {
    const usados = new Set();
    const acciones = [];
    for (const re of lista) {
      for (const clip of clips) {
        if (usados.has(clip) || !re.test(clip.name)) continue;
        usados.add(clip);
        const a = mezclador.clipAction(clip);
        if (!BUCLE.has(clave)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        acciones.push(a);
      }
      if (UNA_SOLA.has(clave) && acciones.length) break;
    }
    if (acciones.length) grupos[clave] = acciones;
  }
  grupos.corre ||= grupos.anda;
  grupos.parado ||= grupos.anda || [mezclador.clipAction(clips[0])];
  grupos.fiesta ||= grupos.parado;
  grupos.saluda ||= grupos.fiesta;
  grupos.pierde ||= grupos.parado;

  const huesos = piel ? Object.fromEntries(piel.skeleton.bones.map(b => [b.name.replace(/^mixamorig:?/i, ''), b])) : {};
  const m = {
    cuerpo, modelo, materiales, mezclador, grupos, huesos, animado: true, tumbaSola: !!grupos.cae,
    actual: null, base: null, gestoHasta: 0, proximoQuieto: performance.now() + 2000 + Math.random() * 4000,
    yaw: GIRO, reaccionId: 0, gestoId: 0,
  };
  prepararCabeza(m, piel);
  return m;
}

// Cabeza: esfera para que las manos no la atraviesen, y párpados para parpadear
function prepararCabeza(m, piel) {
  const { Head: cabeza, HeadTop_End: tope } = m.huesos;
  if (!cabeza || !tope || !piel) return;
  const c = cabeza.getWorldPosition(new THREE.Vector3()), t = tope.getWorldPosition(new THREE.Vector3());
  const centro = c.clone().lerp(t, 0.5);
  // ancho real de la cabeza (con pelo) en reposo
  const pos = piel.geometry.attributes.position;
  const v = new THREE.Vector3();
  let ancho = 0;
  const puntos = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(piel.matrixWorld);
    if (v.y < c.y) continue;
    ancho = Math.max(ancho, Math.abs(v.x - centro.x));
    puntos.push(i);
  }
  const radio = Math.max(c.distanceTo(t) * 0.5, ancho * 0.85);
  m.cabeza = { hueso: cabeza, tope, radio: radio / cabeza.getWorldScale(new THREE.Vector3()).x };
  m.parpados = crearParpados(m, piel, puntos, centro, radio);
  m.proximoParpadeo = performance.now() + 1500 + Math.random() * 3000;
}

// Busca los ojos en la textura (lo blanco del ojo, en la cara) y pone delante un párpado del color de la piel.
function crearParpados(m, piel, indices, centro, radio) {
  try {
    const mapa = piel.material?.map?.image;
    if (!mapa || !piel.geometry.attributes.uv) return null;
    const W = 512, H = 512;
    const lienzo = document.createElement('canvas'); lienzo.width = W; lienzo.height = H;
    const g = lienzo.getContext('2d', { willReadFrequently: true });
    g.drawImage(mapa, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const pos = piel.geometry.attributes.position, uv = piel.geometry.attributes.uv;
    const v = new THREE.Vector3();
    const color = i => {
      const x = Math.min(W - 1, Math.max(0, Math.floor(uv.getX(i) * W)));
      const y = Math.min(H - 1, Math.max(0, Math.floor(uv.getY(i) * H)));   // glTF: sin dar la vuelta
      const k = (y * W + x) * 4;
      return [px[k], px[k + 1], px[k + 2]];
    };
    const ojos = [[], []], tonos = [];
    const qModelo = m.modelo.getWorldQuaternion(new THREE.Quaternion());
    const qInv = qModelo.clone().invert();
    for (const i of indices) {
      v.fromBufferAttribute(pos, i).applyMatrix4(piel.matrixWorld);
      const d = v.clone().sub(centro).applyQuaternion(qInv);          // en ejes del muñeco: z al frente
      if (d.z < radio * 0.35 || Math.abs(d.y) > radio * 0.6 || d.length() > radio * 1.3) continue;   // solo la cara
      const [r, gg, b] = color(i);
      const mn = Math.min(r, gg, b), mx = Math.max(r, gg, b);
      if (mn > 185 && mx - mn < 45) ojos[d.x < 0 ? 0 : 1].push(v.clone());
      else if (r > 120 && r > gg && gg > b && Math.abs(d.y) < radio * 0.5) tonos.push([r, gg, b]);
    }
    if (ojos.some(o => o.length < 3) || tonos.length < 5) return null;
    tonos.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
    const [r, gg, b] = tonos[Math.floor(tonos.length / 2)];
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(r / 255, gg / 255, b / 255).convertSRGBToLinear(), roughness: 0.8 });
    const cabeza = m.cabeza.hueso;
    const qCabeza = cabeza.getWorldQuaternion(new THREE.Quaternion());
    const escala = cabeza.getWorldScale(new THREE.Vector3()).x;
    const geo = new THREE.SphereGeometry(1, 20, 12);
    return ojos.map(lista => {
      const caja = new THREE.Box3().setFromPoints(lista.map(x => x.clone().sub(centro).applyQuaternion(qInv)));
      const centroOjo = caja.getCenter(new THREE.Vector3());
      const tam = caja.getSize(new THREE.Vector3());
      const sx = Math.max(tam.x, radio * 0.12) * 0.62, sy = Math.max(tam.y, radio * 0.12) * 0.7, sz = Math.max(tam.x, radio * 0.12) * 0.35;
      centroOjo.z += sz * 0.4;
      const mundo = centroOjo.applyQuaternion(qModelo).add(centro);
      const p = new THREE.Mesh(geo, material);
      cabeza.add(p);
      p.position.copy(cabeza.worldToLocal(mundo));
      p.quaternion.copy(qCabeza.clone().invert().multiply(qModelo));
      p.userData.base = new THREE.Vector3(sx, sy, sz).divideScalar(escala);
      p.scale.set(p.userData.base.x, 0.0001, p.userData.base.z);
      p.visible = false;
      return p;
    });
  } catch (e) { console.warn('párpados', e); return null; }
}

function parpadear(m, ahora, cerrados) {
  if (!m.parpados) return;
  if (ahora > m.proximoParpadeo) {
    m.parpadeoInicio = ahora;
    m.proximoParpadeo = ahora + 2200 + Math.random() * 3500 - (Math.random() < 0.2 ? 1900 : 0);   // a veces dos seguidos
  }
  const t = (ahora - (m.parpadeoInicio ?? -1e9)) / 160;
  let k = t >= 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  if (cerrados) k = 1;
  for (const p of m.parpados) {
    p.visible = k > 0.05;
    p.scale.y = p.userData.base.y * Math.max(0.0001, k);
  }
}

// Las manos no atraviesan la cabeza: si una mano entra en la esfera de la cabeza, se dobla el brazo hacia fuera.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function manosFuera(m) {
  const cab = m.cabeza;
  if (!cab) return;
  const h = m.huesos;
  const centro = cab.hueso.getWorldPosition(new THREE.Vector3()).lerp(cab.tope.getWorldPosition(_c), 0.5);
  const radio = cab.radio * cab.hueso.getWorldScale(_c).x * 1.05;
  for (const lado of ['Left', 'Right']) {
    const mano = h[lado + 'Hand'], codo = h[lado + 'ForeArm'], hombro = h[lado + 'Arm'];
    if (!mano || !codo || !hombro) continue;
    for (let it = 0; it < 3; it++) {
      const pm = mano.getWorldPosition(new THREE.Vector3());
      const d = pm.clone().sub(centro);
      const dist = d.length();
      if (dist >= radio) break;
      if (dist < 1e-4) d.set(lado === 'Left' ? 1 : -1, 0, 0);
      const objetivo = centro.clone().add(d.normalize().multiplyScalar(radio * 1.03));
      for (const hueso of [codo, hombro]) {
        const pb = hueso.getWorldPosition(new THREE.Vector3());
        _a.copy(mano.getWorldPosition(_c)).sub(pb).normalize();
        _b.copy(objetivo).sub(pb).normalize();
        _q.setFromUnitVectors(_a, _b);
        const qMundo = hueso.getWorldQuaternion(new THREE.Quaternion());
        const qPadre = hueso.parent.getWorldQuaternion(_q2).invert();
        hueso.quaternion.copy(qPadre.multiply(_q.multiply(qMundo)));
        hueso.updateMatrixWorld(true);
      }
    }
  }
}

function poner(m, a, fundido = 0.25) {
  if (!a || m.actual === a) return;
  a.reset().play();
  if (m.actual) a.crossFadeFrom(m.actual, fundido, false);
  m.actual = a;
}
const alAzar = lista => lista[Math.floor(Math.random() * lista.length)];

function animarHecho(m, estado, dt) {
  const ahora = performance.now();
  const g = m.grupos;
  // 1) gesto suelto (golpe, salto) o reacción a lo que le pasa a otro: manda hasta que acaba
  let suelto = null;
  if (estado.gesto && estado.gestoId !== m.gestoId) { m.gestoId = estado.gestoId; suelto = estado.gesto; }
  if (estado.reaccion && estado.reaccion.id !== m.reaccionId) { m.reaccionId = estado.reaccion.id; suelto = estado.reaccion.tipo; }
  if (suelto && g[suelto]) {
    const a = alAzar(g[suelto]);
    poner(m, a, 0.15);
    m.gestoHasta = ahora + a.getClip().duration * 1000 * 0.92;
    m.base = null;
  }
  // 2) estado de fondo
  if (!(m.gestoHasta > ahora)) {
    const base = estado.caido && g.cae ? 'cae' : estado.fiesta === 'saluda' ? 'saluda' : estado.fiesta ? 'fiesta'
      : estado.pierde ? 'pierde' : estado.corriendo ? 'corre' : 'parado';
    if (base !== m.base) { m.base = base; m.accionBase = alAzar(g[base] || g.parado); }
    // parado un rato: hace algo (mira alrededor, se estira, calienta, se cruza de brazos…)
    if (base === 'parado' && g.quieto && ahora > m.proximoQuieto) {
      const a = alAzar(g.quieto);
      poner(m, a, 0.35);
      m.gestoHasta = ahora + a.getClip().duration * 1000 * 0.92;
      m.proximoQuieto = m.gestoHasta + 2500 + Math.random() * 5000;
      m.base = null;
    } else poner(m, m.accionBase, 0.3);
  }
  // 3) hacia dónde mira: al que le ha pasado algo, o hacia la meta
  const yaw = estado.mirar ? Math.atan2(estado.mirar.x, estado.mirar.z) : GIRO;
  let dif = yaw - m.yaw; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
  m.yaw += dif * (1 - Math.exp(-dt * 6));
  m.modelo.rotation.y = m.yaw;

  m.mezclador.update(dt);
  m.cuerpo.updateMatrixWorld(true);
  manosFuera(m);
  parpadear(m, ahora, estado.caido && m.base === 'cae');
}

const acercar = (a, b, k) => a + (b - a) * k;

/** Pone la postura de un frame. estado: { corriendo, fiesta, caido } */
export function animarMuneco(m, estado, dt, t) {
  if (m.animado) return animarHecho(m, estado, dt);
  const b = m.huesos;
  const k = 1 - Math.exp(-dt * 12);
  m.carrera = acercar(m.carrera, estado.corriendo ? 1 : 0, 1 - Math.exp(-dt * 10));
  if (estado.corriendo) m.fase += dt * 15;
  const run = m.carrera, s = Math.sin(m.fase), c = Math.cos(m.fase);
  const fiesta = estado.fiesta && !estado.caido;
  const piernas = m.brazosQuietos ? 0.55 : 0.8;

  // piernas
  const muslo = s * 0.75 * run * piernas;
  if (b.thighL) b.thighL.rotation.x = acercar(b.thighL.rotation.x, muslo, k);
  if (b.thighR) b.thighR.rotation.x = acercar(b.thighR.rotation.x, -muslo, k);
  if (b.shinL) b.shinL.rotation.x = acercar(b.shinL.rotation.x, Math.max(0, -c) * 0.9 * run * piernas, k);
  if (b.shinR) b.shinR.rotation.x = acercar(b.shinR.rotation.x, Math.max(0, c) * 0.9 * run * piernas, k);

  // brazos
  if (!m.brazosQuietos) {
    let lx = -s * 0.8 * run, rx = s * 0.8 * run, lz = -0.12, rz = 0.12, codo = 0.5 * run;
    if (fiesta) { const ola = Math.sin(t * 9) * 0.25; lx = 0; rx = 0; lz = -2.5 + ola; rz = 2.5 - ola; codo = 0.2; }
    else if (estado.caido) { lx = -2.6; rx = -2.6; lz = -0.4; rz = 0.4; codo = 0; }
    if (b.upperArmL) { b.upperArmL.rotation.x = acercar(b.upperArmL.rotation.x, lx, k); b.upperArmL.rotation.z = acercar(b.upperArmL.rotation.z, lz, k); }
    if (b.upperArmR) { b.upperArmR.rotation.x = acercar(b.upperArmR.rotation.x, rx, k); b.upperArmR.rotation.z = acercar(b.upperArmR.rotation.z, rz, k); }
    if (b.foreArmL) b.foreArmL.rotation.x = acercar(b.foreArmL.rotation.x, -codo, k);
    if (b.foreArmR) b.foreArmR.rotation.x = acercar(b.foreArmR.rotation.x, -codo, k);
  }

  // tronco y cabeza: se inclina al correr, respira parado, mira arriba al celebrar
  const respira = Math.sin(t * 2.2 + m.fase) * 0.03;
  if (b.spine) {
    b.spine.rotation.x = acercar(b.spine.rotation.x, 0.22 * run + (run < 0.1 ? respira : 0) - (fiesta ? 0.15 : 0), k);
    b.spine.rotation.y = acercar(b.spine.rotation.y, s * 0.15 * run, k);
  }
  if (b.hips) b.hips.rotation.y = acercar(b.hips.rotation.y, -s * 0.12 * run, k);
  if (b.head) {
    b.head.rotation.x = acercar(b.head.rotation.x, -0.15 * run - (fiesta ? 0.3 : 0) + Math.sin(t * 1.3) * 0.03, k);
    b.head.rotation.z = acercar(b.head.rotation.z, Math.sin(t * 0.8 + m.fase) * 0.06, k);
  }
  for (const h of Object.values(b)) h.apply();
  // se gira para mirar al que le ha pasado algo
  const yaw = estado.mirar ? Math.atan2(estado.mirar.x, estado.mirar.z) : GIRO;
  let dif = yaw - m.yaw; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
  m.yaw += dif * (1 - Math.exp(-dt * 6));
  m.modelo.rotation.y = m.yaw;
}
