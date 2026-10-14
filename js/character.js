// Third-person soldier: a skinned mesh (rigid weights) on a bone hierarchy, so each body
// is only three draw calls. Pose is driven procedurally by avatar.js (two-bone IK for legs
// and arms). Proportions match the hitboxes in physics.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeGun } from './models.js';

// body dimensions (metres)
export const BODY = {
  hipY: 0.95, hipX: 0.1,
  thigh: 0.44, shin: 0.43, ankle: 0.08,
  spine: 0.25, chest: 0.21, neck: 0.06,
  shoulderX: 0.19, shoulderY: 0.2,
  upperArm: 0.3, foreArm: 0.29,
};

// hand anchor points in gun space: [grip, support]
export const GRIPS = {
  ar: [[0, -0.06, 0.05], [0, -0.025, -0.33]],
  smg: [[0, -0.055, 0.05], [0, -0.06, -0.24]],
  sg: [[0, -0.05, 0.09], [0, -0.005, -0.36]],
  sr: [[0, -0.055, 0.11], [0, 0.0, -0.3]],
  lmg: [[0, -0.065, 0.07], [0, -0.01, -0.36]],
  pistol: [[0, -0.035, 0.025], [-0.018, -0.05, 0.035]],
  knife: [[0, 0, 0.02], null],
  grenade: [[0, -0.035, 0.025], null],
};

// where each weapon sits relative to the aim pivot (chest), and how much the torso turns
export const MOUNT = {
  ar: { p: [0.07, -0.05, -0.3], twist: -0.28 },
  smg: { p: [0.07, -0.05, -0.32], twist: -0.25 },
  sg: { p: [0.07, -0.05, -0.3], twist: -0.28 },
  sr: { p: [0.07, -0.04, -0.28], twist: -0.3 },
  lmg: { p: [0.08, -0.08, -0.3], twist: -0.3 },
  pistol: { p: [0.02, -0.03, -0.44], twist: -0.08 },
  knife: { p: [0.14, -0.2, -0.32], twist: -0.12 },
  grenade: { p: [0.02, -0.03, -0.44], twist: -0.08 },
};

// ---------- shared textures / materials ----------
let SHARED = null;
function camoTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d8478'; g.fillRect(0, 0, 256, 256);
  let s = 1234;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = ['#5d6658', '#4a5147', '#9a9c8c', '#3a3f39', '#6f735f'];
  for (let i = 0; i < 70; i++) {
    g.fillStyle = cols[i % cols.length];
    const x = rnd() * 256, y = rnd() * 256, r = 8 + rnd() * 26;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
      // tile: repeat near edges
    }
    g.closePath(); g.fill();
    for (const [dx, dy] of [[256, 0], [-256, 0], [0, 256], [0, -256]]) { g.save(); g.translate(dx, dy); g.fill(); g.restore(); }
  }
  // fabric weave
  g.globalAlpha = 0.08; g.fillStyle = '#000';
  for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 256, 1);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function gearTexture() {
  // left: cordura-like noise, right column (u > 0.9): flat (used by skin, lenses)
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 128);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2200; i++) { const v = 170 + Math.floor(rnd() * 85); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 115, rnd() * 128, 2, 1); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 115, 1);
  g.fillStyle = '#ffffff'; g.fillRect(116, 0, 12, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    cloth: new THREE.MeshStandardMaterial({ map: camoTexture(), vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.6 }),
    gear: new THREE.MeshStandardMaterial({ map: gearTexture(), vertexColors: true, roughness: 0.72, metalness: 0.08, envMapIntensity: 0.7 }),
  };
  return SHARED;
}

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const COL = {
  pants: C('#c9c9c2'), shirt: C('#e2e2da'), sleeve: C('#d9d9d0'), dark: C('#9a9a92'),
  vest: C('#6e6a52'), vestDark: C('#545141'), pouch: C('#625e48'), strap: C('#3d3c33'),
  boot: C('#2a2724'), sole: C('#151413'), glove: C('#2f312f'), helmet: C('#5b5f4d'), helmetDark: C('#43463a'),
  skin: C('#b88c6b'), lens: C('#101418'), metal: C('#34373a'), pad: C('#3a3b35'), radio: C('#2b2d2b'),
};

// ---------- geometry helpers (all return non-indexed-compatible BufferGeometry) ----------
function paint(geo, rgb, uvMode) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvMode === 'flat' && geo.attributes.uv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.97, 0.5); }
  return geo;
}
function place(geo, pos, rot, scale) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
  m.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...(scale || [1, 1, 1])));
  geo.applyMatrix4(m);
  return geo;
}
const rbox = (w, h, d, r, pos, rot, rgb, flat) => paint(place(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), pos, rot), rgb, flat);
const cap = (r, len, pos, rot, rgb, scale) => paint(place(new THREE.CapsuleGeometry(r, len, 3, 10), pos, rot, scale), rgb);
const cyl = (r0, r1, h, pos, rot, rgb, seg = 12, flat) => paint(place(new THREE.CylinderGeometry(r1, r0, h, seg), pos, rot), rgb, flat);
const sph = (r, pos, scale, rgb, flat, phiLen = Math.PI * 2, thetaLen = Math.PI) => paint(place(new THREE.SphereGeometry(r, 14, 10, 0, phiLen, 0, thetaLen), pos, null, scale), rgb, flat);

function clean(g) {
  // unify attribute sets so geometries can be merged
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

export function makeSoldier(color) {
  const S = shared();
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45, emissive: new THREE.Color(color), emissiveIntensity: 0.35, vertexColors: false });
  const B = BODY;

  // ---------- bones (rest pose: limbs hang straight down, facing -Z) ----------
  const bone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const hips = bone('hips', null, 0, B.hipY, 0);
  const spine = bone('spine', hips, 0, 0.06, 0);
  const chest = bone('chest', spine, 0, B.spine, 0);
  const neck = bone('neck', chest, 0, B.chest, 0.0);
  const head = bone('head', neck, 0, B.neck, 0);
  const thighL = bone('thighL', hips, -B.hipX, -0.02, 0), thighR = bone('thighR', hips, B.hipX, -0.02, 0);
  const shinL = bone('shinL', thighL, 0, -B.thigh, 0), shinR = bone('shinR', thighR, 0, -B.thigh, 0);
  const footL = bone('footL', shinL, 0, -B.shin, 0), footR = bone('footR', shinR, 0, -B.shin, 0);
  const upL = bone('upperArmL', chest, -B.shoulderX, B.shoulderY, 0), upR = bone('upperArmR', chest, B.shoulderX, B.shoulderY, 0);
  const foL = bone('foreArmL', upL, 0, -B.upperArm, 0), foR = bone('foreArmR', upR, 0, -B.upperArm, 0);
  const haL = bone('handL', foL, 0, -B.foreArm, 0), haR = bone('handR', foR, 0, -B.foreArm, 0);
  const bones = [hips, spine, chest, neck, head, thighL, shinL, footL, thighR, shinR, footR, upL, foL, haL, upR, foR, haR];
  const bi = (b) => bones.indexOf(b);

  const root = new THREE.Group();
  root.add(hips);
  root.updateMatrixWorld(true);

  // parts: [boneIndex, materialKey, geometry in bone-local space]
  const parts = [];
  const add = (b, mat, ...geos) => { for (const g of geos) parts.push([bi(b), mat, g]); };

  // ---- hips / belt ----
  add(hips, 'cloth', rbox(0.34, 0.2, 0.22, 0.06, [0, -0.04, 0], null, COL.pants));
  add(hips, 'gear', rbox(0.36, 0.055, 0.245, 0.02, [0, 0.05, 0], null, COL.strap),
    rbox(0.05, 0.04, 0.02, 0.008, [0, 0.05, -0.125], null, COL.metal),                 // buckle
    rbox(0.11, 0.09, 0.06, 0.02, [0.12, -0.0, 0.13], null, COL.pouch),                // dump pouch
    rbox(0.08, 0.07, 0.05, 0.015, [-0.15, 0.0, 0.08], null, COL.pouch));
  // ---- spine (abdomen) ----
  add(spine, 'cloth', rbox(0.31, 0.26, 0.2, 0.07, [0, 0.12, 0], null, COL.shirt));
  // ---- chest: shirt, plate carrier, pouches, pack ----
  add(chest, 'cloth', rbox(0.37, 0.3, 0.22, 0.08, [0, 0.12, 0], null, COL.shirt),
    rbox(0.13, 0.08, 0.14, 0.04, [-0.17, 0.21, 0], [0, 0, 0.3], COL.sleeve), rbox(0.13, 0.08, 0.14, 0.04, [0.17, 0.21, 0], [0, 0, -0.3], COL.sleeve)); // shoulders
  add(chest, 'gear',
    rbox(0.33, 0.29, 0.05, 0.02, [0, 0.11, -0.115], null, COL.vest),                   // front plate
    rbox(0.33, 0.3, 0.05, 0.02, [0, 0.11, 0.115], null, COL.vest),                     // back plate
    rbox(0.39, 0.13, 0.235, 0.03, [0, 0.02, 0], null, COL.vestDark),                   // cummerbund
    rbox(0.055, 0.12, 0.27, 0.015, [-0.115, 0.29, 0], null, COL.vestDark), rbox(0.055, 0.12, 0.27, 0.015, [0.115, 0.29, 0], null, COL.vestDark), // shoulder straps
    rbox(0.07, 0.1, 0.045, 0.012, [-0.085, 0.04, -0.155], null, COL.pouch), rbox(0.07, 0.1, 0.045, 0.012, [0, 0.04, -0.155], null, COL.pouch), rbox(0.07, 0.1, 0.045, 0.012, [0.085, 0.04, -0.155], null, COL.pouch),
    rbox(0.075, 0.03, 0.05, 0.01, [-0.085, 0.1, -0.157], null, COL.strap), rbox(0.075, 0.03, 0.05, 0.01, [0, 0.1, -0.157], null, COL.strap), rbox(0.075, 0.03, 0.05, 0.01, [0.085, 0.1, -0.157], null, COL.strap),
    rbox(0.07, 0.09, 0.04, 0.012, [-0.1, 0.19, -0.153], null, COL.radio),               // radio
    cyl(0.006, 0.004, 0.16, [-0.12, 0.31, -0.13], [0.15, 0, 0], COL.metal, 5),         // antenna
    rbox(0.24, 0.27, 0.1, 0.045, [0, 0.11, 0.185], null, COL.pouch),                     // assault pack
    rbox(0.2, 0.1, 0.045, 0.018, [0, 0.03, 0.245], null, COL.vestDark),
    rbox(0.18, 0.045, 0.09, 0.02, [0, 0.255, 0.18], null, COL.strap));
  add(chest, 'accent', rbox(0.11, 0.065, 0.012, 0.004, [0, 0.19, 0.236], null, [1, 1, 1]), rbox(0.08, 0.035, 0.008, 0.003, [0.075, 0.2, -0.143], null, [1, 1, 1]));
  // ---- neck / head ----
  add(neck, 'gear', cyl(0.05, 0.055, 0.1, [0, 0.03, 0.005], null, COL.skin, 10, 'flat'));
  add(neck, 'cloth', cyl(0.07, 0.075, 0.05, [0, -0.005, 0.0], null, COL.dark, 12));    // collar
  add(head, 'gear',
    sph(0.105, [0, 0.11, 0.0], [0.88, 1.06, 0.98], COL.skin, 'flat'),                   // head
    rbox(0.13, 0.06, 0.09, 0.025, [0, 0.045, -0.035], null, COL.skin, 'flat'),          // jaw
    sph(0.128, [0, 0.13, 0.005], [1, 0.82, 1.08], COL.helmet, false, Math.PI * 2, Math.PI * 0.55), // helmet shell
    cyl(0.122, 0.13, 0.03, [0, 0.135, 0.005], null, COL.helmetDark, 18),                 // rim
    rbox(0.05, 0.035, 0.03, 0.01, [0, 0.205, -0.115], [0.4, 0, 0], COL.metal),           // NVG mount
    rbox(0.075, 0.035, 0.05, 0.012, [0, 0.168, -0.145], null, COL.metal),                // NVG folded
    cyl(0.038, 0.038, 0.03, [-0.118, 0.1, 0.005], [0, 0, Math.PI / 2], COL.radio, 12), cyl(0.038, 0.038, 0.03, [0.118, 0.1, 0.005], [0, 0, Math.PI / 2], COL.radio, 12), // ear cups
    rbox(0.2, 0.035, 0.02, 0.008, [0, 0.105, -0.098], null, COL.lens, 'flat'),           // goggles band (eyes)
    rbox(0.16, 0.04, 0.03, 0.012, [0, 0.112, -0.1], null, COL.lens, 'flat'),
    rbox(0.14, 0.05, 0.05, 0.02, [0, 0.03, -0.075], null, COL.strap));                   // face wrap
  add(head, 'accent', cyl(0.131, 0.133, 0.02, [0, 0.165, 0.005], null, [1, 1, 1], 18));  // helmet band
  // ---- arms ----
  for (const [up, fo, ha, s] of [[upL, foL, haL, -1], [upR, foR, haR, 1]]) {
    add(up, 'cloth', cap(0.055, B.upperArm - 0.06, [0, -B.upperArm / 2, 0], null, COL.sleeve));
    add(up, 'accent', cyl(0.06, 0.06, 0.035, [0, -0.07, 0], null, [1, 1, 1], 12));      // armband
    add(fo, 'cloth', cap(0.046, B.foreArm - 0.08, [0, -B.foreArm / 2 + 0.01, 0], null, COL.sleeve, [1, 1, 0.95]));
    add(fo, 'gear', rbox(0.075, 0.07, 0.085, 0.025, [0, -0.01, 0.01], null, COL.pad));   // elbow pad
    add(ha, 'gear', rbox(0.06, 0.09, 0.085, 0.022, [0, -0.04, -0.01], null, COL.glove),
      rbox(0.022, 0.05, 0.03, 0.01, [-0.035 * s, -0.035, -0.04], [0, 0, 0.3 * s], COL.glove)); // thumb
  }
  // ---- legs ----
  for (const [th, sh, ft, s] of [[thighL, shinL, footL, -1], [thighR, shinR, footR, 1]]) {
    add(th, 'cloth', cap(0.078, B.thigh - 0.1, [0, -B.thigh / 2, 0], null, COL.pants, [1, 1, 1.05]),
      rbox(0.05, 0.13, 0.1, 0.02, [0.07 * s, -0.24, 0], null, COL.dark));                // cargo pocket
    if (s > 0) add(th, 'gear', rbox(0.05, 0.16, 0.1, 0.02, [0.09, -0.12, 0.01], null, COL.radio), rbox(0.08, 0.025, 0.11, 0.008, [0.06, -0.06, 0.0], null, COL.strap)); // holster
    add(sh, 'cloth', cap(0.062, B.shin - 0.1, [0, -B.shin / 2 + 0.02, 0], null, COL.pants));
    add(sh, 'gear', rbox(0.1, 0.11, 0.05, 0.025, [0, -0.04, -0.06], null, COL.pad));     // knee pad
    add(ft, 'gear', rbox(0.105, 0.1, 0.26, 0.035, [0, -0.03, -0.055], null, COL.boot),
      rbox(0.11, 0.025, 0.27, 0.01, [0, -0.07, -0.055], null, COL.sole),
      cyl(0.06, 0.066, 0.08, [0, 0.03, 0], null, COL.boot, 10));
  }

  // ---------- bake parts into skinned meshes (one per material) ----------
  const byMat = { cloth: [], gear: [], accent: [] };
  const tmp = new THREE.Matrix4();
  for (const [b, mat, g0] of parts) {
    let g = clean(g0);
    tmp.copy(bones[b].matrixWorld);
    g.applyMatrix4(tmp);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (mat === 'accent') g.deleteAttribute('color');
    byMat[mat].push(g);
  }
  const skeleton = new THREE.Skeleton(bones);
  const meshes = [];
  for (const [k, list] of Object.entries(byMat)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list, false);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, -0.2, -0.9), new THREE.Vector3(0.8, 2.0, 0.9));
    const m = new THREE.SkinnedMesh(geo, k === 'accent' ? accent : S[k]);
    m.castShadow = true; m.receiveShadow = true;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
    root.add(m);
    m.bind(skeleton);
    meshes.push(m);
    for (const g of list) g.dispose();
  }

  // ---------- gun rig: aim pivot on the chest, gun mount offset to the right shoulder ----------
  const aim = new THREE.Object3D(); aim.position.set(0, 0.17, 0); chest.add(aim);
  const gunMount = new THREE.Object3D(); gunMount.position.set(0.09, -0.04, -0.2); aim.add(gunMount);
  const kick = new THREE.Object3D(); gunMount.add(kick);
  let gun = null, gunId = '';
  const setWeapon = (id) => {
    if (id === gunId) return;
    gunId = id;
    if (gun) kick.remove(gun.group);
    gun = makeGun(id === 'grenade' ? 'pistol' : id);
    kick.add(gun.group);
    const mt = MOUNT[id] || MOUNT.ar;
    gunMount.position.set(...mt.p);
  };
  const setColor = (c) => { accent.color.set(c); accent.emissive.set(c); };

  return {
    root, bones, skeleton, meshes, accent,
    hips, spine, chest, neck, head, thighL, shinL, footL, thighR, shinR, footR, upL, foL, haL, upR, foR, haR,
    aim, gunMount, kick, setWeapon, setColor,
    get gun() { return gun; }, get gunId() { return gunId; },
    dispose() { accent.dispose(); for (const m of meshes) m.geometry.dispose(); },
  };
}
