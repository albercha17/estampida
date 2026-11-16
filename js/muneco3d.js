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
    cuerpo, materiales: [material],
    huesos: huesosVirtuales(reales, modelo),
    brazosQuietos: !!p.brazosQuietos,
    fase: Math.random() * 6,
    carrera: 0,              // 0 parado … 1 corriendo (suavizado)
  };
}

// ---------- muñecos con animaciones hechas (Tripo: correr, parado, caerse, celebrar…) ----------
// Busca cada animación por su nombre; si falta alguna, usa la más parecida.
// (cada una, en orden de preferencia)
const ANIMS = {
  parado: [/^idle/i, /idle|stand|breath|relax/i],
  corre: [/^run$/i, /run|sprint/i],
  anda: [/walk/i],
  cae: [/^fall/i, /fall|knock|trip|death|die/i],
  fiesta: [/cheer/i, /victory|celebr/i, /dance/i, /jump/i],
  baile: [/dance/i],
  saluda: [/greet|wave/i],
  pierde: [/defeat|sad|cry/i],
  golpe: [/hit_to_body|hit|hurt/i],
  salto: [/^jump$/i, /jump/i],
};
const UNA_VEZ = new Set(['cae', 'golpe', 'salto']);
function munecoAnimado(p, escena, clips) {
  const materiales = [];
  escena.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materiales.push(m));
  });
  // tamaño y apoyo: casi 2 unidades de alto con los pies en el suelo
  escena.updateMatrixWorld(true);
  const caja = new THREE.Box3();
  escena.traverse(o => {                      // con la pose de reposo de los huesos (las mallas con piel)
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
  // el juego ya mueve al corredor: la cadera no avanza (se queda solo el bote arriba y abajo)
  for (const clip of clips) {
    for (const pista of clip.tracks) {
      if (!/hips\.position$/i.test(pista.name)) continue;
      const v = pista.values;
      for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
    }
  }
  const mezclador = new THREE.AnimationMixer(escena);
  const acciones = {};
  for (const [clave, lista] of Object.entries(ANIMS)) {
    let clip = null;
    for (const re of lista) { clip = clips.find(c => re.test(c.name)); if (clip) break; }
    if (!clip) continue;
    const a = mezclador.clipAction(clip);
    if (UNA_VEZ.has(clave)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    acciones[clave] = a;
  }
  acciones.corre ||= acciones.anda;
  acciones.parado ||= acciones.anda || Object.values(acciones)[0] || mezclador.clipAction(clips[0]);
  acciones.fiesta ||= acciones.parado;
  acciones.saluda ||= acciones.fiesta;
  acciones.pierde ||= acciones.parado;
  return { cuerpo, materiales, mezclador, acciones, actual: null, animado: true, tumbaSola: !!acciones.cae };
}
function poner(m, a, fundido) {
  if (!a || m.actual === a) return;
  a.reset().play();
  if (m.actual) a.crossFadeFrom(m.actual, fundido, false);
  m.actual = a;
}
function animarHecho(m, estado, dt) {
  // un gesto suelto (golpe, salto) manda hasta que acaba
  if (estado.gesto && m.acciones[estado.gesto] && m.gesto !== estado.gestoId) {
    m.gesto = estado.gestoId;
    poner(m, m.acciones[estado.gesto], 0.12);
    m.finGesto = performance.now() + m.acciones[estado.gesto].getClip().duration * 1000 * 0.9;
  }
  if (!(m.finGesto > performance.now())) {
    const quiero = estado.caido && m.acciones.cae ? 'cae'
      : estado.fiesta === 'saluda' ? 'saluda' : estado.fiesta ? 'fiesta'
      : estado.pierde ? 'pierde' : estado.corriendo ? 'corre' : 'parado';
    poner(m, m.acciones[quiero] || m.acciones.parado, 0.25);
  }
  m.mezclador.update(dt);
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
}
