// Efectos 3D de las cartas especiales: meteorito, ovni, cohete, bomba, tornado.
// Cada función recibe el tablero 3D (T) y devuelve una promesa que acaba con el efecto.
import * as THREE from 'three';

const espera = ms => new Promise(r => setTimeout(r, ms));

// ---------- meteorito ----------
export async function meteorito(T, c, elimina) {
  const f = T.fichas[c];
  const destino = f.g.position.clone();
  const roca = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, emissive: 0xff5500, emissiveIntensity: 1.4, roughness: 1, flatShading: true }),
  );
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  roca.add(halo);
  const luz = new THREE.PointLight(0xff7722, 40, 18);
  roca.add(luz);
  T.escena.add(roca);
  const desde = destino.clone().add(new THREE.Vector3(10, 26, -8));
  T.sonar('silbato');
  let rastro = 0;
  await T.animarValor(1.1, t => {
    const k = t * t;
    roca.position.lerpVectors(desde, destino, k);
    roca.rotation.x += 0.2; roca.rotation.y += 0.13;
    halo.scale.setScalar(1 + Math.sin(t * 40) * 0.1);
    if (t > rastro) { rastro += 0.08; T.efectoEn(roca.position.clone(), '🔥', 1.6, 0.5); }
  });
  T.escena.remove(roca);
  // impacto
  T.flash(); T.temblor = 0.9; T.sonar('placaje'); T.sonar('cae');
  T.efecto(c, '💥', 6, 1.2);
  T.efectoEn(destino.clone().add(new THREE.Vector3(0.8, 0.5, 0)), '🔥', 3, 1.4);
  T.efectoEn(destino.clone().add(new THREE.Vector3(-0.8, 0.5, 0.3)), '🔥', 3, 1.4);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.85, depthWrite: false }));
  crater.rotation.x = -Math.PI / 2; crater.position.set(destino.x, 0.03, destino.z);
  T.escena.add(crater); T.restos.push(crater);
  if (elimina) {
    f.caido = true; f.fuera = true;
    T.tumbar(f, 1);
    T.apagar(f);
    T.ponerMarca(c, '☠️');
    T.burbuja(c, '☠️ ¡ELIMINADO!', 'golpe');
  }
  await espera(900 / T.velocidad);
}

// ---------- ovni ----------
function crearOvni() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.8, roughness: 0.25 });
  const disco = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.2, 0.45, 32), metal);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.12, 8, 32), new THREE.MeshStandardMaterial({ color: 0x6b7a85, metalness: 0.9, roughness: 0.3 }));
  borde.rotation.x = Math.PI / 2;
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.6, emissive: 0x22aa88, emissiveIntensity: 0.6 }));
  cupula.position.y = 0.2;
  g.add(disco, borde, cupula);
  for (let i = 0; i < 10; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffee55 : 0xff4466 }));
    const a = (i / 10) * Math.PI * 2;
    l.position.set(Math.cos(a) * 2.05, -0.05, Math.sin(a) * 2.05);
    g.add(l);
  }
  const rayo = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x99ffdd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(rayo);
  g.userData.rayo = rayo;
  g.add(new THREE.PointLight(0x88ffdd, 20, 14));
  return g;
}
function ponerRayo(ovni, alto, opacidad) {
  const r = ovni.userData.rayo;
  r.scale.y = alto; r.position.y = -alto / 2 - 0.2;
  r.material.opacity = opacidad;
}

export async function abducir(T, c) {
  const f = T.fichas[c];
  const p = f.g.position;
  const ovni = crearOvni();
  const arriba = new THREE.Vector3(p.x, 6, p.z);
  T.escena.add(ovni);
  T.sonar('silbato');
  await T.animarValor(1.0, t => { ovni.position.lerpVectors(new THREE.Vector3(p.x - 25, 18, p.z - 10), arriba, 1 - (1 - t) ** 3); ovni.rotation.y += 0.15; });
  await T.animarValor(0.35, t => { ponerRayo(ovni, 6, 0.55 * t); ovni.rotation.y += 0.15; });
  T.burbuja(c, '🛸 ¡Se lo llevan!', 'golpe');
  const y0 = f.cuerpo.position.y;
  await T.animarValor(1.3, t => {
    f.cuerpo.position.y = y0 + t * 4.6;
    f.cuerpo.rotation.y = t * 8;
    const s = 1 - t * 0.75; f.cuerpo.scale.setScalar(f.muneco ? s : 1); if (!f.muneco) T.estirar(f, s, s);
    ovni.rotation.y += 0.15;
  });
  f.cuerpo.visible = false; f.abducido = true;
  f.anillo.visible = false; f.sombra.visible = false; f.nombre.visible = false;
  await T.animarValor(0.3, t => { ponerRayo(ovni, 6, 0.55 * (1 - t)); ovni.rotation.y += 0.15; });
  await T.animarValor(0.9, t => { ovni.position.lerpVectors(arriba, new THREE.Vector3(p.x + 30, 22, p.z - 15), t * t); ovni.rotation.y += 0.2; });
  T.escena.remove(ovni);
}

export async function devolver(T, c, a, xDe) {
  const f = T.fichas[c];
  const z = f.g.position.z;
  const x = xDe(a);
  const ovni = crearOvni();
  const arriba = new THREE.Vector3(x, 6, z);
  T.escena.add(ovni);
  await T.animarValor(1.0, t => { ovni.position.lerpVectors(new THREE.Vector3(x - 30, 20, z - 12), arriba, 1 - (1 - t) ** 3); ovni.rotation.y += 0.15; });
  f.g.position.x = x; f.pos = a;
  await T.animarValor(0.3, t => { ponerRayo(ovni, 6, 0.55 * t); ovni.rotation.y += 0.15; });
  f.cuerpo.visible = true; f.abducido = false;
  f.anillo.visible = true; f.sombra.visible = true; f.nombre.visible = true;
  await T.animarValor(1.1, t => {
    f.cuerpo.position.y = (1 - t) * 4.6;
    f.cuerpo.rotation.y = (1 - t) * 8;
    const s = 0.25 + t * 0.75; if (f.muneco) f.cuerpo.scale.setScalar(s); else T.estirar(f, s, s);
    ovni.rotation.y += 0.15;
  });
  f.cuerpo.position.y = 0; f.cuerpo.rotation.y = 0;
  if (f.muneco) f.cuerpo.scale.setScalar(1); else T.estirar(f, 1, 1);
  T.efecto(c, '✨', 2.6); T.sonar('levanta');
  await T.animarValor(0.3, t => { ponerRayo(ovni, 6, 0.55 * (1 - t)); ovni.rotation.y += 0.15; });
  await T.animarValor(0.8, t => { ovni.position.lerpVectors(arriba, new THREE.Vector3(x + 30, 22, z - 15), t * t); ovni.rotation.y += 0.2; });
  T.escena.remove(ovni);
}

// ---------- cohete: vuela en parábola ----------
export async function cohete(T, c, de, a, xDe) {
  const f = T.fichas[c];
  const x0 = xDe(de), x1 = xDe(a);
  T.sonar('salida');
  let humo = 0;
  await T.animarValor(1.4, t => {
    f.g.position.x = x0 + (x1 - x0) * t;
    f.cuerpo.position.y = Math.sin(Math.PI * t) * 7;
    f.cuerpo.rotation.z = -Math.sin(Math.PI * t) * 1.1;
    if (t > humo) { humo += 0.06; T.efectoEn(f.g.position.clone().add(new THREE.Vector3(-0.5, f.cuerpo.position.y + 0.4, 0)), t < 0.5 ? '🔥' : '💨', 1.4, 0.7); }
  });
  f.cuerpo.position.y = 0; f.cuerpo.rotation.z = 0; f.pos = a;
  T.efecto(c, '💥', 3); T.temblor = 0.4;
}

// ---------- bomba ----------
export async function explota(T, c) {
  T.ponerMarca(c, null);
  T.flash(); T.temblor = 0.7; T.sonar('placaje');
  T.efecto(c, '💥', 5.5, 1.2);
  const p = T.fichas[c].g.position;
  for (let i = 0; i < 5; i++) T.efectoEn(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 2)), i % 2 ? '💨' : '🔥', 2.2, 1);
  T.burbuja(c, '💣 ¡BOOM!', 'golpe');
  await espera(800 / T.velocidad);
}

// ---------- tornado ----------
export async function tornado(T) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.55, 0.12 + i * 0.03, 6, 24), mat);
    anillo.rotation.x = Math.PI / 2; anillo.position.y = 0.4 + i * 1.3;
    g.add(anillo);
  }
  T.escena.add(g);
  T.sonar('silbato');
  await T.animarValor(1.6, t => {
    g.position.set(-14 + t * 28, 0, Math.sin(t * 9) * 3);
    g.rotation.y += 0.5;
    g.children.forEach((a, i) => { a.position.x = Math.sin(t * 20 + i) * 0.3; });
    T.fichas.forEach(f => { if (Math.abs(f.g.position.x - g.position.x) < 3) f.cuerpo.rotation.y += 0.6; });
  });
  T.escena.remove(g);
  T.fichas.forEach(f => { f.cuerpo.rotation.y = 0; });
}
