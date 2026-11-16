// Corredores con modelo 3D y esqueleto (los .glb del Bumerán: huesos hips, spine, chest, head, thighL/R, shinL/R,
// footL/R, upperArmL/R, foreArmL/R, handL/R; mira a +z, pies en y=0, 1,5 de alto) animados por código:
// correr, respirar parado, caerse de bruces y celebrar con los brazos arriba.
import * as THREE from 'three';

let utiles = null;
async function cargarUtiles() {
  if (!utiles) {
    const [{ GLTFLoader }, { clone }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/utils/SkeletonUtils.js'),
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
    cuerpo, material,
    huesos: huesosVirtuales(reales, modelo),
    brazosQuietos: !!p.brazosQuietos,
    fase: Math.random() * 6,
    carrera: 0,              // 0 parado … 1 corriendo (suavizado)
  };
}

const acercar = (a, b, k) => a + (b - a) * k;

/** Pone la postura de un frame. estado: { corriendo, fiesta, caido } */
export function animarMuneco(m, estado, dt, t) {
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
