// 凍結研究所 (Frost Lab) — an arctic research station in falling snow. A two-storey lab with
// roof access in the middle, a vehicle hangar with catwalks, raised accommodation modules
// joined by a bridge, a drilling rig, a helipad and a comms tower. Fog limits long sight lines.
import * as THREE from 'three';
import { createContext, finishMap, linColor } from './builder.js';

export const def = {
  id: 'frostlab',
  name: '凍結研究所',
  sub: '雪原の研究基地・吹雪',
  desc: '降りしきる雪と霧。研究棟の屋上、格納庫の足場、居住モジュールの連絡橋。',
  size: '大',
  bounds: { minX: -46, maxX: 46, minZ: -38, maxZ: 38 },
  theme: {
    sky: { top: '#55657a', mid: '#a9b6c4', horizon: '#d9e0e6', sun: '#f2f6ff', ground: '#c9d2da', clouds: 0.25, sunDisc: 0.15 },
    sunDir: [0.35, 0.55, -0.5],
    sunColor: 0xe6eeff,
    sunIntensity: 1.7,
    hemi: [0xd6e2f0, 0x8c98a6, 1.45],
    fog: [0xc4ced8, 40, 290],
    particles: 'snow',
    ambience: { wind: 1.0, windFreq: 650, water: 0 },
    exposure: 1.05,
    preview: ['#a9b6c4', '#e9eff4'],
  },
};

export function build(renderer, quality) {
  const B = def.bounds;
  const ctx = createContext({ renderer, quality, theme: def.theme, bounds: B, seed: 99 });
  const { world, geo, deco, far, solid, decor, stairs, railing, crate, barrel, barrier, M, T, rng, root } = ctx;
  const WHITE = linColor('#e3e7ea'), ORANGE = linColor('#d0652a'), RED = linColor('#b03a2e'), BLUE = linColor('#3d6488'), GREY = linColor('#8a939b'), GREEN = linColor('#4f6355');

  ctx.ground('snow', 5);
  // packed tracks in the snow
  const track = (x0, z0, x1, z1) => deco.box(x0, 0, z0, x1, 0.012, z1, 'snow', { scale: [5, 5], color: [0.78, 0.82, 0.88], skip: 0b111011 });
  track(-24, -3, 46, 1); track(-2, -38, 2, 38); track(-46, 13, -16, 16);

  // ---------------- perimeter: snow berm + fence ----------------
  {
    const { minX, maxX, minZ, maxZ } = B;
    const t = 3, h = 4.2;
    solid(minX - t, 0, minZ - t, maxX + t, h, minZ, 'snow', { scale: [6, 6] });
    solid(minX - t, 0, maxZ, maxX + t, h, maxZ + t, 'snow', { scale: [6, 6] });
    solid(minX - t, 0, minZ, minX, h, maxZ, 'snow', { scale: [6, 6] });
    solid(maxX, 0, minZ, maxX + t, h, maxZ, 'snow', { scale: [6, 6] });
    // softer top: a second, wider step of snow
    decor(minX - 6, 0, minZ - 6, maxX + 6, 2.2, minZ - t, 'snow', { scale: [6, 6] });
    decor(minX - 6, 0, maxZ + t, maxX + 6, 2.2, maxZ + 6, 'snow', { scale: [6, 6] });
    decor(minX - 6, 0, minZ - t, minX - t, 2.2, maxZ + t, 'snow', { scale: [6, 6] });
    decor(maxX + t, 0, minZ - t, maxX + 6, 2.2, maxZ + t, 'snow', { scale: [6, 6] });
    // fence just inside the berm (visual)
    for (const [x0, z0, x1, z1] of [[minX + 0.3, minZ + 0.3, maxX - 0.3, minZ + 0.3], [minX + 0.3, maxZ - 0.3, maxX - 0.3, maxZ - 0.3]]) fenceVis(x0, z0, x1, z1);
    for (const [x0, z0, x1, z1] of [[minX + 0.3, minZ + 0.3, minX + 0.3, maxZ - 0.3], [maxX - 0.3, minZ + 0.3, maxX - 0.3, maxZ - 0.3]]) fenceVis(x0, z0, x1, z1);
  }
  function fenceVis(x0, z0, x1, z1) {
    const h = 2.4;
    if (z0 === z1) decor(Math.min(x0, x1), 0, z0 - 0.005, Math.max(x0, x1), h, z0 + 0.005, 'fence', { scale: [0.5, 0.5], noShadow: true });
    else decor(x0 - 0.005, 0, Math.min(z0, z1), x0 + 0.005, h, Math.max(z0, z1), 'fence', { scale: [0.5, 0.5], noShadow: true });
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 4) + 1;
    for (let i = 0; i < n; i++) { const f = i / (n - 1); const px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f; decor(px - 0.05, 0, pz - 0.05, px + 0.05, h + 0.1, pz + 0.05, 'steel'); }
  }

  // far mountains
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.95, flatShading: true });
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6f7a84, roughness: 1, flatShading: true });
    ctx.disposables.push(mat, rockM);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2, r = 230 + rng() * 120;
      const h = 60 + rng() * 110, w = 70 + rng() * 80;
      const m = ctx.mesh(new THREE.ConeGeometry(w, h, 6 + Math.floor(rng() * 3), 1), rng() < 0.3 ? rockM : mat, [Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r], { rot: [0, rng() * 3, 0], shadow: false });
      m.receiveShadow = false;
    }
  }

  // ---------------- main lab (centre): two floors + roof ----------------
  ctx.building({
    x0: -12, x1: 12, z0: -10, z1: 6, floors: 2, fh: 3.6, t: 0.35, mat: 'labpanel', color: WHITE, scale: [2.4, 2.4],
    doors: [{ side: 'w', a: -2.5, w: 1.6 }, { side: 'e', a: -2.5, w: 1.6 }, { side: 's', a: -6.5 }, { side: 's', a: 6.5 }, { side: 'n', a: 0.5, w: 2.0 }],
    autoWindows: { sides: ['n', 's', 'w', 'e'], every: 3.2, from: 1, w: 1.4 },
    windows: [{ side: 'n', a: -6.5, floor: 0, w: 1.6 }, { side: 'n', a: 6.5, floor: 0, w: 1.6 }, { side: 's', a: -1.5, floor: 0, w: 2.0 }, { side: 'w', a: 2.5, floor: 0 }, { side: 'e', a: 2.5, floor: 0 }],
    stairs: [
      { x0: -10, x1: -3.7, z0: -9.65, z1: -7.85, dir: '+x', floor: 0 },
      { x0: 3.7, x1: 10, z0: 3.85, z1: 5.65, dir: '-x', floor: 1 },
    ],
    floorMat: 'floortile', slabMat: 'concrete', roofTop: 'concrete', capMat: 'steel', trim: 'steel', parapet: 1.0,
  });
  // ground-floor partitions: north lab | server room (SW) | labs (SE)
  ctx.wall('x', -11.65, 11.65, -5.1, -4.9, 0, 3.4, [[-7.2, -5.8, 0, 2.4], [-0.2, 1.2, 0, 2.4], [5.8, 7.2, 0, 2.4]], 'labpanel', { color: WHITE, scale: [2.4, 2.4] });
  ctx.wall('z', -4.9, 5.65, -0.1, 0.1, 0, 3.4, [[1.8, 3.2, 0, 2.4]], 'labpanel', { color: WHITE, scale: [2.4, 2.4] });
  // server racks (SW room)
  for (const x of [-10, -7.5, -5]) {
    solid(x, 0, -3.4, x + 0.8, 2.2, 1.6, 'dark');
    for (let z = -3.2; z < 1.5; z += 0.6) decor(x - 0.01, 0.4 + (Math.abs(z * 7) % 1.2), z, x + 0.81, 0.45 + (Math.abs(z * 7) % 1.2), z + 0.08, rng() < 0.5 ? 'glowGreen' : 'glowRed', { noShadow: true });
  }
  ctx.pointLight([-6, 3.0, 1.5], 0x9fe0ff, 18, 12);
  // lab benches (SE room) and north lab
  for (const [x0, z0, x1, z1] of [[2, -3, 5, -2.2], [7, -3, 10, -2.2], [2, 1.5, 5, 2.3], [7.5, 1.5, 10.5, 2.3], [-2, -7.4, 2, -6.6], [4, -7.4, 8, -6.6]]) {
    solid(x0, 0, z0, x1, 0.95, z1, 'steel');
    decor(x0 + 0.2, 0.95, z0 + 0.1, x0 + 0.8, 1.3, z0 + 0.5, 'glass');
  }
  // upper floor: desks, a dividing wall for cover
  ctx.wall('z', -9.65, -3.5, -0.15, 0.15, 3.6, 6.6, [], 'labpanel', { color: WHITE, scale: [2.4, 2.4] });
  for (const [x0, z0, x1, z1] of [[-9, -2, -6.5, -1.2], [-4.5, 1.5, -2, 2.3], [3, -6, 5.5, -5.2], [7, -1, 9.5, -0.2]]) solid(x0, 3.6, z0, x1, 4.45, z1, 'paint', { color: GREY });
  crate(-9.8, 3.5, 3.6, 1.0); crate(9.8, -8.6, 3.6, 1.1);
  // roof: radar dome, vents
  {
    const domeM = new THREE.MeshStandardMaterial({ color: 0xf1f3f4, roughness: 0.5 });
    ctx.disposables.push(domeM);
    solid(-8, 7.2, -1, -4, 7.7, 3, 'concrete', { scale: [2, 2] });
    ctx.mesh(new THREE.SphereGeometry(2.0, 24, 14), domeM, [-6, 9.3, 1]);
    solid(-7.4, 7.7, -0.4, -4.6, 10.6, 2.4, null);
    solid(4, 7.2, -8, 6.5, 8.6, -6, 'steel');
    solid(8, 7.2, -3, 10, 8.0, -1, 'steel');
    decor(9.6, 7.2, -9.4, 9.8, 13, -9.2, 'steel');
    ctx.glow([9.7, 13.1, -9.3], 1.5, 0xff3020, 1);
  }
  ctx.sign(0.5, 3.0, 6.02, 4.0, 0.6, ['RESEARCH  STATION  K-7'], 'z', '#20384f', '#e8f1f8');
  // entrance canopy
  decor(-8, 2.7, 6, -5, 2.85, 7.6, 'steel'); decor(5, 2.7, 6, 8, 2.85, 7.6, 'steel');

  // ---------------- vehicle hangar (west) ----------------
  ctx.building({
    x0: -42, x1: -24, z0: -16, z1: 12, floors: 1, fh: 7.5, t: 0.35, mat: 'siding', color: GREEN, scale: [4, 4],
    doors: [{ side: 'e', a: -2, w: 6, h: 5.5 }, { side: 'e', a: 8.5 }, { side: 'n', a: -33, w: 4, h: 3.3 }, { side: 's', a: -30.5 }, { side: 'w', a: 4.5 }],
    windows: [
      { side: 'n', a: -40.5, floor: 0, sill: 4.4 }, { side: 'n', a: -27.5, floor: 0, sill: 4.4 },
      { side: 'w', a: -12.5, floor: 0, sill: 4.4 }, { side: 'w', a: -6.5, floor: 0, sill: 4.4 }, { side: 'w', a: 0.5, floor: 0, sill: 4.4 }, { side: 'w', a: 8.5, floor: 0, sill: 4.4 },
      { side: 'e', a: -12.5, floor: 0, sill: 4.4, w: 2.0 }, { side: 'e', a: 4.5, floor: 0, sill: 4.6 },
    ],
    floorMat: 'concrete', parapet: 0.4, capMat: 'steel', roofMat: 'roof',
  });
  // L-shaped catwalk (top 3.6) along the west and north walls, stairs at the south end
  solid(-41.65, 3.4, -15.65, -39.6, 3.6, 11.65, 'tread', { scale: [1, 1] });
  solid(-39.6, 3.4, -15.65, -24.35, 3.6, -13.6, 'tread', { scale: [1, 1] });
  railing(-39.6, -13.6, -39.6, 9.6, 3.6, 1.0);
  railing(-39.6, -13.6, -24.35, -13.6, 3.6, 1.0);
  stairs(-39.6, -33.2, 9.7, 11.55, '-x', 0, 3.6);
  railing(-39.6, 9.65, -33.2, 9.65, 0.4, 3.6);
  for (const z of [-8, 0, 8]) solid(-39.75, 0, z - 0.1, -39.55, 3.4, z + 0.1, 'steel');
  for (const x of [-34, -28]) solid(x - 0.1, 0, -13.75, x + 0.1, 3.4, -13.55, 'steel');
  // snowcat
  snowcat(-31, -4, true, ORANGE);
  snowcat(-31, 5.5, true, RED);
  crate(-27, -10, 0, 1.4); crate(-25.7, -10.5, 0, 1.2); crate(-26.5, -10.2, 1.4, 1.0);
  crate(-37, -9, 0, 1.2); crate(-37.2, 8, 0, 1.4); barrel(-27, 10); barrel(-27.7, 10.6, 0, '#a33a2a'); barrel(-26.3, 10.7);
  for (const z of [-8, 4]) ctx.pointLight([-33, 6.6, z], 0xdbeeff, 34, 20);
  for (const z of [-8, 4]) decor(-34, 7.0, z - 0.3, -32, 7.12, z + 0.3, 'lampCold');
  ctx.sign(-23.97, 6.3, -2, 5.0, 0.8, ['HANGAR  02'], 'x', '#2a3a2e', '#e9f0e6');

  // ---------------- power plant (north-west) ----------------
  ctx.building({
    x0: -40, x1: -26, z0: -36, z1: -24, floors: 1, fh: 4.6, t: 0.35, mat: 'blocks', color: linColor('#b9bfc4'), scale: [3, 3],
    doors: [{ side: 's', a: -36.5, w: 1.6 }, { side: 'e', a: -29.5, w: 2.4, h: 3.0 }, { side: 'n', a: -30.5 }],
    windows: [{ side: 's', a: -30.5, floor: 0, sill: 1.4 }, { side: 'w', a: -30.5, floor: 0, sill: 1.4 }, { side: 'e', a: -34.5, floor: 0, sill: 1.4 }],
    floorMat: 'concrete', parapet: 0.5, capMat: 'steel',
  });
  for (const [x0, z0] of [[-38.5, -34.5], [-34, -34.5]]) {
    solid(x0, 0, z0, x0 + 3, 2.2, z0 + 4.5, 'paint', { color: linColor('#c9a227') });
    decor(x0 + 0.3, 2.2, z0 + 0.5, x0 + 2.7, 2.6, z0 + 4, 'dark');
  }
  solid(-30, 0, -34.5, -27, 1.2, -32.8, 'dark');
  ctx.pointLight([-33, 4.0, -28], 0xffd9a0, 22, 14);
  // exhaust stacks + external generators
  {
    const stackM = new THREE.MeshStandardMaterial({ color: 0x777f86, roughness: 0.5, metalness: 0.6 });
    ctx.disposables.push(stackM);
    for (const x of [-37, -33]) { ctx.mesh(new THREE.CylinderGeometry(0.45, 0.5, 7, 14), stackM, [x, 8.1, -34]); }
  }
  solid(-24, 0, -36, -19, 2.4, -33, 'paint', { color: linColor('#c9a227') });
  decor(-23.6, 2.4, -35.6, -19.4, 2.8, -33.4, 'dark');
  solid(-24, 0, -30, -20, 1.8, -27.5, 'steel');
  barrier(-22, -24, 4, true);
  // cable trays to the lab
  decor(-26, 3.2, -30.2, -12, 3.35, -29.8, 'steel');
  for (const x of [-22, -17]) decor(x - 0.08, 0, -30.1, x + 0.08, 3.2, -29.9, 'steel');

  // ---------------- drilling rig (north-middle) ----------------
  {
    // platform (top 1.6) with stairs on two sides
    solid(-4, 0, -30, 4, 1.6, -22, 'tread', { scale: [1, 1] });
    decor(-4.05, 1.3, -30.05, 4.05, 1.6, -21.95, 'hazard', { scale: [0.8, 0.8] });
    stairs(-4, -1.6, -22, -19.0, '-z', 0, 1.6);
    stairs(1.6, 4, -33.0, -30, '+z', 0, 1.6);
    railing(-4, -30, -4, -22, 1.6); railing(4, -30, 4, -22, 1.6);
    railing(-4, -30, 1.5, -30, 1.6); railing(-1.5, -22, 4, -22, 1.6);
    // drill housing (cover on the platform) and derrick
    solid(-1.2, 1.6, -27.2, 1.2, 3.4, -24.8, 'paint', { color: ORANGE });
    solid(-3.4, 1.6, -29.4, -2.0, 2.6, -28, 'crate', { uv: 'face' });
    solid(2.0, 1.6, -24.2, 3.4, 2.4, -22.8, 'crate', { uv: 'face' });
    const dm = new THREE.MeshStandardMaterial({ color: 0xc9541e, roughness: 0.6, metalness: 0.4 });
    ctx.disposables.push(dm);
    const top = [0, 16, -26];
    for (const [x, z] of [[-3.2, -29.2], [3.2, -29.2], [-3.2, -22.8], [3.2, -22.8]]) {
      ctx.beam([x, 1.6, z], top, 0.24, null, { mat: dm });
      solid(x - 0.2, 1.6, z - 0.2, x + 0.2, 3.6, z + 0.2, null);
    }
    for (const y of [5, 9, 12.5]) {
      const f = (y - 1.6) / (16 - 1.6), s = 3.2 * (1 - f);
      for (const [a, b] of [[[-s, -26 - s], [s, -26 - s]], [[s, -26 - s], [s, -26 + s]], [[s, -26 + s], [-s, -26 + s]], [[-s, -26 + s], [-s, -26 - s]]]) ctx.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.14, null, { mat: dm });
    }
    ctx.glow([0, 16.3, -26], 1.6, 0xff3020, 1);
  }
  crate(-9, -21, 0, 1.4); crate(-10.3, -21.4, 0, 1.2); crate(9, -32, 0, 1.4); crate(10.3, -31.6, 0, 1.0);
  snowMound(-12, -33, 3.2, 1.2); snowMound(12, -24, 3.0, 1.3); snowMound(-15, -16, 2.6, 1.1);

  // ---------------- comms (north-east): tower, dish, fuel tanks, shelter ----------------
  {
    const tm = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.5, metalness: 0.7 });
    ctx.disposables.push(tm);
    solid(31.5, 0, -28.5, 36.5, 0.4, -23.5, 'concrete', { scale: [2, 2] });
    const legs = [[32.5, -27.5], [35.5, -27.5], [32.5, -24.5], [35.5, -24.5]];
    for (const [x, z] of legs) { solid(x - 0.15, 0.4, z - 0.15, x + 0.15, 22, z + 0.15, 'steel'); }
    for (let y = 0.4; y < 21; y += 3.4) {
      for (let k = 0; k < 4; k++) {
        const a = legs[k], b = legs[(k + 1) % 4];
        ctx.beam([a[0], y, a[1]], [b[0], y + 3.4, b[1]], 0.08, null, { mat: tm });
        ctx.beam([a[0], y + 3.4, a[1]], [b[0], y + 3.4, b[1]], 0.08, null, { mat: tm });
      }
    }
    ctx.glow([34, 22.4, -26], 1.6, 0xff3020, 1);
    // satellite dish
    const dishM = new THREE.MeshStandardMaterial({ color: 0xeef1f3, roughness: 0.45, side: THREE.DoubleSide });
    ctx.disposables.push(dishM);
    solid(19.5, 0, -32.5, 24.5, 0.4, -27.5, 'concrete', { scale: [2, 2] });
    solid(21.4, 0.4, -30.6, 22.6, 2.8, -29.4, 'steel');
    const dg = new THREE.SphereGeometry(3.4, 28, 12, 0, Math.PI * 2, 0, 0.75);
    dg.translate(0, -3.4, 0);
    const dish = ctx.mesh(dg, dishM, [22, 3.0, -30], { rot: [Math.PI - 0.7, 0.4, 0] });
    dish.castShadow = true;
    solid(19.7, 2.8, -31.9, 24.3, 5.4, -28.1, null);
    // fuel tanks
    const tankM = new THREE.MeshStandardMaterial({ color: 0xd3d6d8, roughness: 0.45, metalness: 0.5 });
    ctx.disposables.push(tankM);
    const tg = new THREE.CylinderGeometry(1.4, 1.4, 9, 22); tg.rotateZ(Math.PI / 2);
    for (const z of [-18.5, -15.2]) {
      ctx.mesh(tg, tankM, [26, 1.75, z]);
      solid(21.5, 0, z - 1.4, 30.5, 3.15, z + 1.4, null);
      for (const x of [23, 29]) decor(x - 0.3, 0, z - 1.2, x + 0.3, 0.6, z + 1.2, 'concrete', { scale: [1, 1] });
    }
    decor(21.5, 3.15, -18.6, 30.5, 3.25, -15.1, 'steel');
  }
  ctx.building({
    x0: 38, x1: 45, z0: -36, z1: -29, floors: 1, fh: 3.2, mat: 'labpanel', color: BLUE, scale: [2.4, 2.4],
    doors: [{ side: 'w', a: -31.5 }, { side: 's', a: 42.5 }],
    windows: [{ side: 'w', a: -34.5, floor: 0 }],
    floorMat: 'floortile', parapet: 0.3, capMat: 'steel',
  });
  solid(39, 0, -35.3, 44.3, 1.0, -34.5, 'steel'); crate(43.5, -31.5, 0, 1.0);
  crate(40, -22, 0, 1.4); crate(41.4, -21.6, 0, 1.2); crate(40.6, -21.8, 1.4, 1.0);
  snowMound(28, -36, 3.0, 1.1); snowMound(43, -14, 2.6, 1.2);
  barrier(17, -22, 3.2, false); barrier(16, -12.5, 4, true);

  // ---------------- accommodation modules (south-east) ----------------
  module(18, 30, 16, 22, ORANGE, [{ side: 's', a: 24.5 }, { side: 'w', a: 19.5 }]);
  stairs(20, 25.6, 14.2, 16, '+x', 0, 3.0);
  railing(20, 14.15, 25.6, 14.15, 0.4, 3.0);
  module(32, 44, 16, 22, BLUE, [{ side: 's', a: 38.5 }, { side: 'w', a: 20.5 }, { side: 'e', a: 17.5 }]);
  stairs(34, 39.6, 14.2, 16, '+x', 0, 3.0);
  railing(34, 14.15, 39.6, 14.15, 0.4, 3.0);
  module(22, 34, 28, 34, WHITE, [{ side: 'n', a: 31.5 }, { side: 's', a: 27.5 }, { side: 'e', a: 30.5 }]);
  stairs(24, 29.6, 26.2, 28, '+x', 0, 3.0);
  railing(24, 26.15, 29.6, 26.15, 0.4, 3.0);
  // bridge between the two front modules (top 3.0)
  solid(30, 2.8, 18, 32, 3.0, 20, 'tread', { scale: [1, 1] });
  railing(30, 18, 32, 18, 3.0); railing(30, 20, 32, 20, 3.0);
  // roof cover on modules
  solid(27.5, 3.0, 20.2, 29.5, 4.0, 21.6, 'steel'); solid(40, 3.0, 16.4, 42, 4.1, 17.8, 'steel'); solid(30.5, 3.0, 31.5, 32.5, 4.2, 33.6, 'steel');
  // interiors: bunks
  for (const [x0, z0] of [[18.6, 19.6], [26.4, 19.6], [32.6, 16.6], [40.4, 19.6], [22.6, 28.6], [28, 31.6]]) solid(x0, 0, z0, x0 + 2.0, 0.9, z0 + 1.6, 'paint', { color: GREY });
  crate(36, 25, 0, 1.4); crate(37.4, 25.4, 0, 1.0); crate(44, 26, 0, 1.2); crate(44, 36, 0, 1.2); crate(19, 36, 0, 1.2);
  barrel(40, 29); barrel(40.7, 29.6, 0, '#a33a2a'); barrel(39.3, 29.7);
  snowMound(38.5, 33, 3.0, 1.2); snowMound(16, 27, 2.6, 1.1);

  // ---------------- helipad (south-middle) ----------------
  {
    solid(-9, 0, 16, 9, 0.3, 32, 'concrete', { scale: [3, 3] });
    const padM = new THREE.MeshBasicMaterial({ color: 0xd8b13a, toneMapped: true });
    ctx.disposables.push(padM);
    ctx.mesh(new THREE.RingGeometry(5.6, 6.0, 48), padM, [0, 0.31, 24], { rot: [-Math.PI / 2, 0, 0], shadow: false });
    decor(-2.4, 0.3, 21.4, -1.6, 0.32, 26.6, 'paint', { color: [0.9, 0.9, 0.88] });
    decor(1.6, 0.3, 21.4, 2.4, 0.32, 26.6, 'paint', { color: [0.9, 0.9, 0.88] });
    decor(-1.6, 0.3, 23.6, 1.6, 0.32, 24.4, 'paint', { color: [0.9, 0.9, 0.88] });
    for (const [x, z] of [[-9, 16], [9, 16], [-9, 32], [9, 32]]) { decor(x - 0.15, 0.3, z - 0.15, x + 0.15, 0.55, z + 0.15, 'glowGreen'); }
    helicopter(1, 24.5);
  }
  crate(-12, 20, 0, 1.4); crate(-13.4, 19.6, 0, 1.2); crate(-12.6, 19.8, 1.4, 1.0);
  crate(12, 30, 0, 1.4); crate(13.2, 30.6, 0, 1.0);
  barrier(-6, 35, 4, true); barrier(6, 35, 4, true); barrier(0, 12, 4, true);

  // ---------------- garage + water tower (south-west) ----------------
  ctx.building({
    x0: -40, x1: -28, z0: 24, z1: 35, floors: 1, fh: 4.2, mat: 'siding', color: GREY, scale: [4, 4],
    doors: [{ side: 'n', a: -34, w: 5, h: 3.6 }, { side: 'e', a: 30.5 }],
    windows: [{ side: 'w', a: 29.5, floor: 0, sill: 1.4 }, { side: 's', a: -34.5, floor: 0, sill: 1.4 }],
    floorMat: 'concrete', parapet: 0.3, capMat: 'steel',
  });
  snowcat(-34, 30, false, linColor('#c9a227'));
  crate(-38.6, 33.5, 0, 1.0); crate(-29.5, 25.8, 0, 1.0);
  {
    const wt = new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.5, metalness: 0.5 });
    ctx.disposables.push(wt);
    for (const [x, z] of [[-22, 27], [-18, 27], [-22, 31], [-18, 31]]) solid(x - 0.15, 0, z - 0.15, x + 0.15, 8, z + 0.15, 'steel');
    ctx.mesh(new THREE.CylinderGeometry(2.8, 2.8, 4, 20), wt, [-20, 10, 29]);
    ctx.mesh(new THREE.ConeGeometry(3.0, 1.2, 20), wt, [-20, 12.6, 29]);
    ctx.beam([-22, 0.5, 27], [-18, 7.5, 31], 0.1, null, { mat: wt }); ctx.beam([-18, 0.5, 27], [-22, 7.5, 31], 0.1, null, { mat: wt });
  }
  crate(-24, 21, 0, 1.4); crate(-25.3, 21.4, 0, 1.0); barrel(-16, 35); barrel(-16.7, 35.6);
  snowMound(-44, 20, 2.6, 1.2); snowMound(-20, 36, 3, 1.1); snowMound(-14, 8, 2.6, 1.2);
  // west lane between hangar and boundary
  crate(-44, -6, 0, 1.2); crate(-44, 16, 0, 1.0);
  // central open ground cover
  barrier(-17, -3, 3.2, false); barrier(17, 9, 3.2, false); snowMound(18, -5, 2.6, 1.2);
  crate(-18, 10, 0, 1.4); crate(15, 1, 0, 1.2); crate(15.6, 2.3, 0, 1.0);

  // ---------------- cold lamps ----------------
  for (const [x, z, dx, dz, light] of [[-14, -12, 1, 0, true], [14, 9, -1, 0, true], [-20, 14, 0, -1, false], [15, -27, -1, 0, false], [-14, 30, 1, 0, false], [30, 12, 0, 1, false], [-44, -28, 1, 0, false], [44, 3, -1, 0, false]]) {
    ctx.lamp(x, z, { h: 6.5, dx, dz, cold: true, light, intensity: 40, distance: 22 });
  }

  // ---------------- local helpers ----------------
  function module(x0, x1, z0, z1, color, doors) {
    ctx.building({
      x0, x1, z0, z1, floors: 1, fh: 3.0, t: 0.3, mat: 'labpanel', color, scale: [2.4, 2.4], doors,
      autoWindows: { sides: ['n', 's', 'w', 'e'], every: 3.0, from: 0, w: 1.0 },
      floorMat: 'floortile', parapet: 0, trim: 'steel',
    });
    // skids and roof edge
    decor(x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, 0.15, z1 + 0.1, 'steel');
  }
  function snowMound(x, z, r, h) {
    solid(x - r, 0, z - r * 0.6, x + r, h * 0.55, z + r * 0.6, 'snow', { scale: [4, 4] });
    solid(x - r * 0.7, h * 0.55, z - r * 0.4, x + r * 0.7, h, z + r * 0.4, 'snow', { scale: [4, 4] });
  }
  function snowcat(x, z, alongX, color) {
    const hx = alongX ? 2.4 : 1.25, hz = alongX ? 1.25 : 2.4;
    // tracks
    for (const s of [-1, 1]) {
      if (alongX) solid(x - hx, 0, z + s * (hz - 0.35) - 0.35, x + hx, 0.9, z + s * (hz - 0.35) + 0.35, 'rubber');
      else solid(x + s * (hx - 0.35) - 0.35, 0, z - hz, x + s * (hx - 0.35) + 0.35, 0.9, z + hz, 'rubber');
    }
    solid(x - hx + 0.2, 0.9, z - hz + 0.1, x + hx - 0.2, 1.7, z + hz - 0.1, 'paint', { color });
    const c0x = alongX ? x - hx + 0.3 : x - hx + 0.15, c1x = alongX ? x + 0.6 : x + hx - 0.15;
    const c0z = alongX ? z - hz + 0.15 : z - hz + 0.3, c1z = alongX ? z + hz - 0.15 : z + 0.6;
    solid(c0x, 1.7, c0z, c1x, 2.8, c1z, 'paint', { color: color.map((v) => v * 0.95) });
    decor(c0x - 0.01, 2.0, c0z - 0.01, c1x + 0.01, 2.6, c1z + 0.01, 'glass');
    decor(c0x + 0.2, 2.8, c0z + 0.2, c1x - 0.2, 2.95, c1z - 0.2, 'dark');
  }
  function helicopter(x, z) {
    const body = linColor('#b03a2e');
    solid(x - 1.3, 0.55, z - 2.6, x + 1.3, 2.7, z + 2.0, 'paint', { color: body });
    decor(x - 1.25, 1.4, z - 2.95, x + 1.25, 2.55, z - 2.55, 'glass');
    decor(x - 1.05, 2.7, z - 1.2, x + 1.05, 3.1, z + 1.0, 'paint', { color: body.map((v) => v * 0.9) });
    solid(x - 0.35, 1.5, z + 2.0, x + 0.35, 2.2, z + 8.6, 'paint', { color: body });
    decor(x - 0.08, 2.2, z + 7.6, x + 0.08, 3.6, z + 8.6, 'paint', { color: body });
    decor(x - 0.6, 3.25, z + 8.1, x + 0.6, 3.35, z + 8.3, 'dark');
    // skids
    for (const s of [-1, 1]) {
      decor(x + s * 1.1 - 0.06, 0, z - 2.8, x + s * 1.1 + 0.06, 0.1, z + 2.0, 'dark');
      decor(x + s * 1.0 - 0.05, 0.1, z - 1.6, x + s * 1.0 + 0.05, 0.6, z - 1.5, 'dark');
      decor(x + s * 1.0 - 0.05, 0.1, z + 1.0, x + s * 1.0 + 0.05, 0.6, z + 1.1, 'dark');
    }
    world.add(x - 1.2, 0, z - 2.6, x + 1.2, 0.55, z + 2.0, { shoot: false });
    // rotor
    decor(x - 0.1, 3.1, z - 0.15, x + 0.1, 3.45, z + 0.15, 'dark');
    const rotor = new THREE.Group();
    rotor.position.set(x, 3.48, z - 0.1);
    const rm = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6 });
    ctx.disposables.push(rm);
    const blade = new THREE.BoxGeometry(11, 0.05, 0.32);
    ctx.disposables.push(blade);
    for (const a of [0.3, 0.3 + Math.PI / 2]) { const m = new THREE.Mesh(blade, rm); m.rotation.y = a; m.castShadow = true; rotor.add(m); }
    root.add(rotor);
  }

  const spawns = [
    [-44, 0, -36, 0.6], [-16, 0, -36, 0], [14, 0, -36, 0], [44, 0, -37, -0.7],
    [-44, 0, -10, -1.57], [-44, 0, 22, -1.57], [44, 0, -6, 1.57], [44, 0, 30, 2.2],
    [-18, 0, -20, -0.8], [18, 0, -28, 0.4], [-16, 0, 4, -1.57], [16, 0, -8, 1.57],
    [-22, 0, 18, -2.2], [-10, 0, 36, 3.14], [10, 0, 36, 3.14], [30, 0, 36, 3.14],
    [24, 0, 12, 2.4], [-6, 0, 10, 3.14], [6, 0, -14, 0], [-26, 0, -20, 0.2],
  ].map(([x, y, z, yaw]) => ({ x, y, z, yaw }));

  const pickups = [
    { id: 0, type: 'hp', x: 3.5, y: 0, z: -0.5 },
    { id: 1, type: 'hp', x: -40.6, y: 3.6, z: -6 },
    { id: 2, type: 'hp', x: 31, y: 3.0, z: 19 },
    { id: 3, type: 'hp', x: -5, y: 7.2, z: -6 },
    { id: 4, type: 'hp', x: -33, y: 0, z: -27 },
    { id: 5, type: 'ammo', x: 0, y: 1.6, z: -23 },
    { id: 6, type: 'ammo', x: -32, y: 0, z: 0.8 },
    { id: 7, type: 'ammo', x: 7.5, y: 3.6, z: -3 },
    { id: 8, type: 'ammo', x: 28, y: 0, z: 31 },
    { id: 9, type: 'ammo', x: -34, y: 0, z: 26.4 },
    { id: 10, type: 'ammo', x: 40.5, y: 0, z: -32.5 },
    { id: 11, type: 'nade', x: -6, y: 0.3, z: 29 },
    { id: 12, type: 'nade', x: 22, y: 0, z: -24 },
  ];

  return finishMap(ctx, def, { spawns, pickups });
}
