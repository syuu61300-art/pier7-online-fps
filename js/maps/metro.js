// 地下鉄駅 (Metro) — an underground station. Two side platforms, two tracks in a trench with
// stopped trains you can run through, concourses above both platforms joined by a footbridge,
// escalator stairs and maintenance steps down to the tracks. Close quarters, no sky.
import * as THREE from 'three';
import { createContext, finishMap, linColor } from './builder.js';

export const def = {
  id: 'metro',
  name: '地下鉄駅',
  sub: '地下ホーム・終電後',
  desc: '停車中の車両を抜け、線路に降り、連絡通路から撃ち下ろす。屋内の近距離戦。',
  size: '中',
  bounds: { minX: -40, maxX: 40, minZ: -24, maxZ: 24 },
  theme: {
    sky: { top: '#3a4048', mid: '#5a626b', horizon: '#6f747a', sun: '#cfd6dc', ground: '#2c2e31', clouds: 0, sunDisc: 0 },
    sunDir: [0.2, 1, 0.12],
    sunColor: 0xeef3ff,
    sunIntensity: 1.25,
    hemi: [0xdfe6ee, 0x55504a, 1.05],
    fog: [0x22262a, 35, 170],
    shadowPad: 6,
    miniMaxH: 9,
    ambience: { wind: 0.06, windFreq: 250, water: 0, hum: 0.09 },
    exposure: 1.15,
    preview: ['#2c3238', '#3fa49a'],
  },
  menuCam: { rx: 26, rz: 2.6, y: 4.3, bob: 0.4, dz: 0, look: [0, 2.4, 0] },
};

export function build(renderer, quality) {
  const B = def.bounds;
  const ctx = createContext({ renderer, quality, theme: def.theme, bounds: B, seed: 5 });
  const { world, geo, deco, far, solid, decor, stairs, railing, crate, barrel, M, T, rng, root } = ctx;
  const PLAT = 1.1, CON = 5.5, CEIL = 9;
  const TEAL = linColor('#2e8a80'), STEEL = linColor('#b9bfc4');
  const tileOpt = { scale: [3, 4.4], oy: -0.35 };

  ctx.ground('ballast', 2.5);

  // ---------------- shell: concourse blocks, platforms, ceiling, end walls ----------------
  solid(-40, 0, -24, 40, CON, -16, 'tile', tileOpt);                 // north concourse (solid below)
  solid(-40, 0, 16, 40, CON, 24, 'tile', tileOpt);                   // south concourse
  solid(-40, 0, -16, 40, PLAT, -6, 'concrete', { scale: [3, 3] });   // north platform
  solid(-40, 0, 6, 40, PLAT, 16, 'concrete', { scale: [3, 3] });     // south platform
  const floorTop = (x0, z0, x1, z1, y) => deco.box(x0, y, z0, x1, y + 0.012, z1, 'floortile', { scale: [2, 2], skip: 0b111011 });
  floorTop(-40, -16, 40, -6.7, PLAT); floorTop(-40, 6.7, 40, 16, PLAT); floorTop(-40, -24, 40, -16, CON); floorTop(-40, 16, 40, 24, CON);
  // platform edges: yellow tactile strip + white line
  decor(-40, PLAT, -6.7, 40, PLAT + 0.015, -6.3, 'paint', { color: linColor('#d9b42a') });
  decor(-40, PLAT, 6.3, 40, PLAT + 0.015, 6.7, 'paint', { color: linColor('#d9b42a') });
  decor(-40, PLAT, -6.3, 40, PLAT + 0.016, -6.0, 'paint', { color: [0.85, 0.85, 0.82] });
  decor(-40, PLAT, 6.0, 40, PLAT + 0.016, 6.3, 'paint', { color: [0.85, 0.85, 0.82] });
  // ceiling (does not cast shadows so the overhead light reaches the floor)
  solid(-40.6, CEIL, -24.6, 40.6, CEIL + 0.6, 24.6, 'ceil', { scale: [4, 4] });
  // long walls above the concourses
  solid(-40.6, CON, -24.6, 40.6, CEIL, -24, 'tile', tileOpt);
  solid(-40.6, CON, 24, 40.6, CEIL, 24.6, 'tile', tileOpt);
  // end walls with tunnel mouths over the tracks
  ctx.wall('z', -24, 24, -40.6, -40, 0, CEIL, [[-6, 6, 0, 5.4]], 'tile', tileOpt);
  ctx.wall('z', -24, 24, 40, 40.6, 0, CEIL, [[-6, 6, 0, 5.4]], 'tile', tileOpt);
  for (const s of [-1, 1]) {
    const xi = s * 40.6, xo = s * 70;
    decor(Math.min(xi, xo), 0, -6.6, Math.max(xi, xo), 5.4, -6, 'concrete', { scale: [3, 3], color: [0.5, 0.5, 0.5] });
    decor(Math.min(xi, xo), 0, 6, Math.max(xi, xo), 5.4, 6.6, 'concrete', { scale: [3, 3], color: [0.5, 0.5, 0.5] });
    decor(Math.min(xi, xo), 5.4, -6.6, Math.max(xi, xo), 6.0, 6.6, 'concrete', { scale: [3, 3], color: [0.4, 0.4, 0.4] });
    decor(Math.min(s * 69, xo), 0, -6, Math.max(s * 69, xo), 5.4, 6, 'dark', { color: [0.05, 0.05, 0.06] });
    ctx.fence(s * 39.4, -6, s * 39.4, 6, 3.0);
    for (const d of [18, 32, 46]) ctx.glow([s * (40 + d), 4.6, -5.6], 1.0, 0xffb060, 0.5);
    ctx.glow([s * 44, 4.6, 5.6], 0.8, 0x50ff80, 0.5);
  }
  // tracks: rails and sleepers
  for (const zc of [-4.45, 4.45]) {
    for (const dz of [-0.75, 0.75]) decor(-70, 0, zc + dz - 0.04, 70, 0.16, zc + dz + 0.04, 'steel');
    for (let x = -69.6; x < 70; x += 0.7) decor(x, 0, zc - 1.25, x + 0.24, 0.1, zc + 1.25, 'wood', { color: [0.45, 0.4, 0.36] });
    decor(-40, 0, zc - 2.0, 40, 0.02, zc + 2.0, 'ballast', { scale: [2, 2], skip: 0b111011, color: [0.85, 0.82, 0.78] });
  }
  // platform faces (dark under the edge)
  decor(-40, 0, -6.02, 40, 0.9, -6.0, 'dark'); decor(-40, 0, 6.0, 40, 0.9, 6.02, 'dark');

  // ---------------- pillars ----------------
  for (let x = -32; x <= 32; x += 8) {
    if (x === 0) continue;
    solid(x - 0.4, 0, -0.4, x + 0.4, CEIL, 0.4, 'tile', tileOpt);
    for (const z of [-11, 11]) solid(x - 0.35, PLAT, z - 0.35, x + 0.35, CEIL, z + 0.35, 'tile', tileOpt);
    for (const z of [-20, 20]) solid(x - 0.35, CON, z - 0.35, x + 0.35, CEIL, z + 0.35, 'tile', tileOpt);
  }

  // ---------------- escalator stairs platform <-> concourse ----------------
  const esc = (x0, x1, zWall, zOpen, dir) => {
    const z0 = Math.min(zWall, zOpen), z1 = Math.max(zWall, zOpen);
    stairs(x0, x1, z0, z1, dir, PLAT, CON, 'tread');
    // balustrade on the open side: blocks movement, not bullets
    const zb = zOpen + (zOpen > zWall ? 0.05 : -0.05);
    world.add(x0, PLAT, zb - 0.05, x1, CON + 1.1, zb + 0.05, { shoot: false });
    const bottomX = dir === '-x' ? x1 : x0, topX = dir === '-x' ? x0 : x1;
    const hm = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.4, metalness: 0.6 });
    ctx.disposables.push(hm);
    ctx.beam([bottomX, PLAT + 1.0, zb], [topX, CON + 1.0, zb], 0.08, null, { mat: hm });
    ctx.beam([bottomX, PLAT + 0.1, zb], [topX, CON + 0.1, zb], 0.32, null, { mat: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.35, metalness: 0.8 }) });
    for (let i = 0; i <= 4; i++) {
      const f = i / 4, x = bottomX + (topX - bottomX) * f, y = PLAT + (CON - PLAT) * f;
      decor(x - 0.04, y, zb - 0.04, x + 0.04, y + 1.0, zb + 0.04, 'steel');
    }
    // landing: a strip of floor at the top so you step off cleanly
    decor(Math.min(topX, topX + (dir === '-x' ? -1.2 : 1.2)), CON, z0, Math.max(topX, topX + (dir === '-x' ? -1.2 : 1.2)), CON + 0.02, z1, 'tread', { scale: [1, 1] });
  };
  esc(-28, -19.2, -16, -13.6, '-x');
  esc(19.2, 28, -16, -13.6, '+x');
  esc(-28, -19.2, 16, 13.6, '-x');
  esc(19.2, 28, 16, 13.6, '+x');
  // concourse edge railings (gaps where escalators arrive and at the footbridge)
  for (const zr of [-16, 16]) {
    for (const [a, b] of [[-40, -28.6], [-19.2, -4], [4, 19.2], [28.6, 40]]) railing(a, zr, b, zr, CON, 1.1, 'steel');
  }

  // ---------------- maintenance steps platform <-> tracks ----------------
  for (const [x0, x1] of [[-38, -36], [36, 38], [10, 12]]) { stairs(x0, x1, -6, -3.6, '-z', 0, PLAT, 'tread'); }
  for (const [x0, x1] of [[-38, -36], [36, 38], [-12, -10]]) { stairs(x0, x1, 3.6, 6, '+z', 0, PLAT, 'tread'); }

  // ---------------- footbridge over the tracks ----------------
  solid(-4, CON - 0.2, -16, 4, CON, 16, 'tread', { scale: [1, 1] });
  decor(-4, CON - 0.55, -16, -3.8, CON - 0.2, 16, 'paint', { color: TEAL }); decor(3.8, CON - 0.55, -16, 4, CON - 0.2, 16, 'paint', { color: TEAL });
  railing(-4, -16, -4, 16, CON, 1.1, 'steel'); railing(4, -16, 4, 16, CON, 1.1, 'steel');
  // glass side panels (see-through look), supports
  {
    const gm = new THREE.MeshStandardMaterial({ color: 0x9fc6d0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    ctx.disposables.push(gm);
    for (const x of [-4, 4]) ctx.mesh(new THREE.PlaneGeometry(32, 1.0), gm, [x, CON + 0.5, 0], { rot: [0, Math.PI / 2, 0], shadow: false });
  }
  for (const [x, z, y0] of [[-3.4, -6.6, PLAT], [3.4, -6.6, PLAT], [-3.4, 6.6, PLAT], [3.4, 6.6, PLAT], [-3.4, 0, 0], [3.4, 0, 0]]) solid(x - 0.25, y0, z - 0.25, x + 0.25, CON - 0.2, z + 0.25, 'paint', { color: TEAL });
  // cover on the bridge
  solid(-2.6, CON, -1.4, -1.2, CON + 1.0, 1.4, 'steel'); solid(1.2, CON, 5, 2.6, CON + 1.0, 7.5, 'steel'); solid(1.2, CON, -8, 2.6, CON + 1.0, -5.5, 'steel');

  // ---------------- trains ----------------
  car(-30, -18, -5.95, -2.95, 'w'); car(-17.5, -5.5, -5.95, -2.95, 'e');
  solid(-18, 0.9, -4.95, -17.5, PLAT, -3.95, 'dark');
  car(6, 18, 2.95, 5.95, 'w'); car(18.5, 30.5, 2.95, 5.95, 'e');
  solid(18, 0.9, 3.95, 18.5, PLAT, 4.95, 'dark');

  // ---------------- concourses ----------------
  gates(-10, -24, -16); gates(10, -24, -16); gates(-10, 16, 24); gates(10, 16, 24);
  // north: kiosk, vending machines, benches, blocked exit
  solid(-32, CON, -24, -27, CON + 2.6, -21.8, 'paint', { color: linColor('#7a5a3a') });
  solid(-32, CON, -21.8, -27, CON + 1.1, -21.2, 'wood', { color: [0.55, 0.4, 0.28] });
  decor(-32.2, CON + 2.6, -24, -26.8, CON + 2.75, -20.9, 'paint', { color: TEAL });
  ctx.sign(-29.5, CON + 2.2, -21.78, 4.0, 0.5, ['KIOSK  売店'], 'z', '#1f4d48', '#ffffff');
  for (const x of [14, 15.1, 16.2]) vending(x, -24, 'z');
  for (const x of [-20, 22]) bench(x, -22.8);
  exitStair(33, -24, 1); exitStair(-38.5, 24, -1);
  crate(-14, -18, CON, 1.0); crate(14, -18.6, CON, 1.1); crate(36, -17.8, CON, 1.2); crate(-37, -18, CON, 1.0);
  // south: convenience store you can enter
  ctx.building({
    x0: -26, x1: -14, z0: 17, z1: 24, y0: CON, floors: 1, fh: CEIL - CON, t: 0.25, mat: 'paint', color: linColor('#d9d6cf'), scale: [3, 3],
    doors: [{ side: 'n', a: -22.5, w: 1.6, h: 2.3 }, { side: 'e', a: 19.5, w: 1.4, h: 2.3 }],
    windows: [{ side: 'n', a: -17.5, floor: 0, w: 4.0, sill: 0.9, h: 1.6 }],
    floorMat: 'floortile', parapet: 0, trim: 'steel',
  });
  ctx.sign(-20, CON + 2.85, 16.97, 6, 0.6, ['MINATO MART'], '-z', '#c0392b', '#ffffff');
  for (const x of [-21.3, -18.3]) solid(x, CON, 19, x + 0.6, CON + 1.6, 22.5, 'steel');
  solid(-25.6, CON, 17.4, -24.8, CON + 1.0, 18.8, 'paint', { color: linColor('#4a5560') });
  for (const x of [-30, -31.1]) vending(x, 24, '-z');
  for (const x of [14, 26]) bench(x, 22.8);
  crate(-8, 18.8, CON, 1.1); crate(32, 18.2, CON, 1.0); crate(36, 22.6, CON, 1.2);
  // platform furniture
  for (const x of [-34, -14, 14, 34]) { bench(x, -14.6); bench(x, 14.6); }
  for (const x of [-30, -6, 6, 30]) { bin(x, -15.4); bin(x, 15.4); }
  for (const x of [-12, 12]) { vending(x, -16, 'z'); vending(x, 16, '-z'); }
  crate(-38, -9, PLAT, 1.2); crate(38, 9, PLAT, 1.2); crate(30, -9.5, PLAT, 1.0); crate(-30, 9.5, PLAT, 1.0);
  // trench clutter
  crate(-22, 1.6, 0, 1.0); crate(26, -1.6, 0, 1.0); barrel(0, -1.8); barrel(-34, -1.4); barrel(34, 1.4);

  // ---------------- signs, lights ----------------
  for (const x of [-32, -8, 16]) ctx.sign(x, 3.2, -15.98, 5.0, 1.1, ['港町', 'MINATOMACHI'], 'z', '#1f2a33', '#ffffff');
  for (const x of [-16, 8, 32]) ctx.sign(x, 3.2, 15.98, 5.0, 1.1, ['港町', 'MINATOMACHI'], '-z', '#1f2a33', '#ffffff');
  for (const [x, z, f, t] of [[-20, -11, 'z', '1番線  →  海浜公園'], [20, -11, '-z', '1番線  →  海浜公園'], [-20, 11, '-z', '2番線  →  中央'], [20, 11, 'z', '2番線  →  中央']]) {
    decor(x - 0.03, 7.0, z - 0.03, x + 0.03, CEIL, z + 0.03, 'steel');
    ctx.sign(x, 6.6, z + (f === 'z' ? 0.02 : -0.02), 4.2, 0.7, [t], f, '#20303b', '#e9f2f6');
    ctx.sign(x, 6.6, z + (f === 'z' ? -0.02 : 0.02), 4.2, 0.7, [t], f === 'z' ? '-z' : 'z', '#20303b', '#e9f2f6');
  }
  for (const [x, z] of [[-10, -20], [10, -20], [-10, 20], [10, 20]]) {
    ctx.sign(x + 0.02, CON + 2.6, z, 3.0, 0.6, ['改札  GATES'], 'x', '#2e8a80', '#ffffff');
    ctx.sign(x - 0.02, CON + 2.6, z, 3.0, 0.6, ['改札  GATES'], '-x', '#2e8a80', '#ffffff');
    decor(x - 0.03, CON + 2.9, z - 0.03, x + 0.03, CEIL, z + 0.03, 'steel');
  }
  // ceiling light strips
  for (const z of [-11, 11, -20, 20, 0]) {
    for (let x = -38; x < 38; x += 6) decor(x, CEIL - 0.12, z - 0.18 + (Math.abs(z) === 11 ? 1.2 : 0), x + 4, CEIL - 0.02, z + 0.18 + (Math.abs(z) === 11 ? 1.2 : 0), 'lampCold', { noShadow: true });
  }
  for (const [x, y, z, i] of [[-20, 8.3, -10, 34], [20, 8.3, -10, 34], [-20, 8.3, 10, 34], [20, 8.3, 10, 34], [0, 8.4, -20, 30], [0, 8.4, 20, 30]]) ctx.pointLight([x, y, z], 0xe4eeff, i, 22);
  // flickering work lamp in the east tunnel mouth
  const flick = ctx.glow([39, 4.9, -5.2], 1.4, 0xffb878, 0.8);
  ctx.updates.push((t) => { flick.material.opacity = Math.sin(t * 23) > 0.6 || Math.sin(t * 3.1) > 0.9 ? 0.15 : 0.8; });

  // ---------------- helpers ----------------
  function car(x0, x1, z0, z1, cabEnd) {
    const zc = (z0 + z1) / 2;
    solid(x0, 0.3, z0 + 0.15, x1, PLAT, z1 - 0.15, 'dark');
    for (const x of [x0 + 2, x0 + 4, x1 - 4, x1 - 2]) for (const z of [z0 + 0.6, z1 - 0.6]) decor(x - 0.45, 0, z - 0.1, x + 0.45, 0.8, z + 0.1, 'dark');
    const doorsAt = [x0 + 2.5, x0 + 6.5, x0 + 10.5].filter((a) => a < x1 - 1).map((a) => Math.floor(a) + 0.5);
    const doors = [];
    for (const a of doorsAt) { doors.push({ side: 'n', a, w: 1.3, h: 2.0 }); doors.push({ side: 's', a, w: 1.3, h: 2.0 }); }
    doors.push({ side: 'w', a: Math.floor(zc) + 0.5, w: 0.95, h: 1.95 }, { side: 'e', a: Math.floor(zc) + 0.5, w: 0.95, h: 1.95 });
    const windows = [];
    for (let i = 0; i < doorsAt.length - 1; i++) { const a = (doorsAt[i] + doorsAt[i + 1]) / 2; windows.push({ side: 'n', a, w: 2.2, floor: 0, sill: 0.9, h: 0.9 }, { side: 's', a, w: 2.2, floor: 0, sill: 0.9, h: 0.9 }); }
    ctx.building({ x0, x1, z0, z1, y0: PLAT, floors: 1, fh: 2.4, t: 0.12, mat: 'paint', color: STEEL, scale: [2, 2], doors, windows, floorMat: 'rubber', parapet: 0, trim: 'dark', slabMat: 'paint', roofMat: 'paint' });
    // livery stripe and roof equipment
    const cuts = [x0, ...doorsAt.flatMap((a) => [a - 0.7, a + 0.7]), x1];
    for (let i = 0; i < cuts.length; i += 2) for (const [za, zb] of [[z0 - 0.015, z0], [z1, z1 + 0.015]]) decor(cuts[i], PLAT + 0.55, za, cuts[i + 1], PLAT + 0.75, zb, 'paint', { color: TEAL });
    decor(x0 + 2, PLAT + 2.4, z0 + 0.6, x0 + 5, PLAT + 2.75, z1 - 0.6, 'dark'); decor(x1 - 5, PLAT + 2.4, z0 + 0.6, x1 - 2, PLAT + 2.75, z1 - 0.6, 'dark');
    // seats between the doors (low cover), poles, ceiling light
    for (let i = 0; i < doorsAt.length - 1; i++) {
      const a = doorsAt[i] + 0.9, b = doorsAt[i + 1] - 0.9;
      solid(a, PLAT, z0 + 0.12, b, PLAT + 0.48, z0 + 0.6, 'paint', { color: linColor('#3d5a7a') });
      solid(a, PLAT, z1 - 0.6, b, PLAT + 0.48, z1 - 0.12, 'paint', { color: linColor('#3d5a7a') });
    }
    for (const a of doorsAt) decor(a - 0.03, PLAT, zc - 0.03, a + 0.03, PLAT + 2.3, zc + 0.03, 'steel');
    decor(x0 + 0.5, PLAT + 2.22, zc - 0.15, x1 - 0.5, PLAT + 2.26, zc + 0.15, 'lampCold', { noShadow: true });
    // cab end: headlights and destination board
    const ex = cabEnd === 'w' ? x0 - 0.02 : x1 + 0.02;
    for (const dz of [-1.0, 1.0]) ctx.glow([ex + (cabEnd === 'w' ? -0.05 : 0.05), PLAT + 0.5, zc + dz], 0.7, 0xfff1d0, 0.8);
    ctx.sign(ex + (cabEnd === 'w' ? -0.01 : 0.01), PLAT + 2.1, zc, 1.6, 0.3, ['回送  NOT IN SERVICE'], cabEnd === 'w' ? '-x' : 'x', '#111', '#ff9a3a');
  }
  function gates(x, z0, z1) {
    for (let z = z0 + 1; z < z1; z += 2) {
      solid(x - 0.8, CON, z - 0.15, x + 0.8, CON + 1.0, z + 0.15, 'steel');
      decor(x - 0.82, CON + 1.0, z - 0.17, x + 0.82, CON + 1.04, z + 0.17, 'dark');
      decor(x - 0.6, CON + 1.04, z - 0.1, x - 0.3, CON + 1.06, z + 0.1, 'glowGreen', { noShadow: true });
    }
  }
  function vending(x, zWall, facing) {
    const s = facing === 'z' ? 1 : -1;
    const y0 = Math.abs(zWall) === 24 ? CON : PLAT;
    const za = zWall, zb = zWall + s * 0.75;
    solid(x - 0.5, y0, Math.min(za, zb), x + 0.5, y0 + 1.85, Math.max(za, zb), 'paint', { color: linColor(rng() < 0.5 ? '#b23a2e' : '#2f5f9a') });
    decor(x - 0.4, y0 + 0.9, Math.min(zb, zb + s * 0.01), x + 0.4, y0 + 1.7, Math.max(zb, zb + s * 0.01), 'lampCold', { noShadow: true });
  }
  function bench(x, z) {
    const y0 = Math.abs(z) > 16 ? CON : PLAT;
    solid(x - 1.0, y0, z - 0.25, x + 1.0, y0 + 0.45, z + 0.25, 'wood', { color: [0.55, 0.42, 0.3] });
    decor(x - 0.9, y0, z - 0.2, x - 0.8, y0 + 0.45, z + 0.2, 'steel'); decor(x + 0.8, y0, z - 0.2, x + 0.9, y0 + 0.45, z + 0.2, 'steel');
  }
  function bin(x, z) { solid(x - 0.25, PLAT, z - 0.25, x + 0.25, PLAT + 0.85, z + 0.25, 'steel'); }
  function exitStair(x, zWall, s) {
    // a short flight of steps up to a closed shutter in the outer wall (an alcove)
    const L = 4.2;
    for (let i = 0; i < 6; i++) {
      const len = (L / 6) * (6 - i), za = zWall, zb = zWall + s * len;
      solid(x, CON, Math.min(za, zb), x + 5.5, CON + 0.2 * (i + 1), Math.max(za, zb), 'tread', { scale: [1, 1] });
    }
    const zo = zWall + s * L;
    solid(x - 0.3, CON, Math.min(zWall, zo), x, CEIL, Math.max(zWall, zo), 'tile', tileOpt);
    solid(x + 5.5, CON, Math.min(zWall, zo), x + 5.8, CEIL, Math.max(zWall, zo), 'tile', tileOpt);
    decor(x + 0.1, CON + 1.2, Math.min(zWall, zWall + s * 0.06), x + 5.4, CON + 3.0, Math.max(zWall, zWall + s * 0.06), 'roof', { scale: [1.5, 0.4] });
    ctx.sign(x + 2.75, CON + 3.2, zWall + s * 0.08, 3.0, 0.5, ['出口  EXIT  A' + (s > 0 ? '1' : '2')], s > 0 ? 'z' : '-z', '#d9b42a', '#111111');
  }

  const spawns = [
    [-36, PLAT, -12, -1.57], [-12, PLAT, -13, -1.57], [12, PLAT, -9, 1.57], [36, PLAT, -12, 1.57],
    [-36, PLAT, 12, -1.57], [-6, PLAT, 9, -1.57], [6, PLAT, 13, 1.57], [36, PLAT, 12, 1.57],
    [-36, CON, -20, -1.57], [28, CON, -21, 1.57], [-36, CON, 18, -1.57], [36, CON, 21, 1.57],
    [-2, CON, -22, 0], [2, CON, 22, 3.14], [-20, CON, -19, -1.57], [22, CON, 19, 1.57],
    [30, 0, -1.6, 1.57], [-30, 0, 1.6, -1.57], [-2, 0, 1.6, 0], [14, 0, -1.6, 1.57],
  ].map(([x, y, z, yaw]) => ({ x, y, z, yaw }));

  const pickups = [
    { id: 0, type: 'hp', x: 0, y: CON, z: -3 },
    { id: 1, type: 'hp', x: -24, y: PLAT, z: -4.45 },
    { id: 2, type: 'hp', x: -20, y: CON, z: 20.6 },
    { id: 3, type: 'hp', x: 24, y: 0, z: -1.6 },
    { id: 4, type: 'ammo', x: -30, y: CON, z: -18.6 },
    { id: 5, type: 'ammo', x: 34, y: PLAT, z: 10 },
    { id: 6, type: 'ammo', x: -34, y: PLAT, z: -10 },
    { id: 7, type: 'ammo', x: 24, y: PLAT, z: 4.45 },
    { id: 8, type: 'ammo', x: -16, y: 0, z: 1.6 },
    { id: 9, type: 'ammo', x: 0, y: PLAT, z: -12 },
    { id: 10, type: 'nade', x: 30, y: CON, z: -18.6 },
    { id: 11, type: 'nade', x: -30, y: CON, z: 18.6 },
    { id: 12, type: 'hp', x: 0, y: PLAT, z: 12 },
  ];

  return finishMap(ctx, def, { spawns, pickups });
}
