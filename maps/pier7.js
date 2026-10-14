// PIER 7 — container port at dusk. Warehouse with mezzanine, office block, two container
// yards with stair routes and a catwalk, gantry crane on the dock.
import * as THREE from 'three';
import { createContext, finishMap, linColor } from './builder.js';

export const def = {
  id: 'pier7',
  name: 'PIER 7',
  sub: 'コンテナ港・夕暮れ',
  desc: '倉庫の中二階、積み上がったコンテナ、クレーンの下の岸壁。中〜遠距離。',
  size: '大',
  bounds: { minX: -50, maxX: 50, minZ: -40, maxZ: 40 },
  theme: {
    sky: { top: '#1c2a4a', mid: '#6b6f8f', horizon: '#f0a46a', sun: '#ffd9a0', ground: '#2a2f36', clouds: 1, sunDisc: 1 },
    sunDir: [-0.55, 0.24, 0.8],
    sunColor: 0xffc999,
    sunIntensity: 3.1,
    hemi: [0xa9b8d6, 0x4a3f36, 1.15],
    fog: [0x8a7f86, 90, 520],
    ambience: { wind: 0.5, windFreq: 420, water: 0.1 },
    exposure: 1.05,
    preview: ['#1c2a4a', '#f0a46a'],
  },
};

export function build(renderer, quality) {
  const ctx = createContext({ renderer, quality, theme: def.theme, bounds: def.bounds, seed: 42 });
  const { world, geo, deco, far, solid, decor, wall, stairs, railing, container, crate, barrier, pallet, CONT, M, T, rng, root } = ctx;

  // ---------------- ground ----------------
  world.add(-200, -6, -200, 200, 0, 40, { mat: 'asphalt' });
  geo.quadY(-160, -160, 160, 40, 0, 'asphalt', { scale: [9, 9] });
  decor(-50, 0, 30.5, 50, 0.012, 40, 'concrete', { scale: [5, 5], skip: 0b111011 });   // quay apron
  decor(-160, -3.5, 40, 160, 0.0, 40.6, 'wall', { scale: [4, 4] });                   // quay face
  for (let x = -50; x < 50; x += 10) solid(x + 0.05, 0, 39.3, x + 9.95, 0.18, 39.8, 'hazard', { scale: [1.2, 1.2] });
  world.add(-60, 0, 39.8, 60, 30, 41, { shoot: false });                               // keep players out of the water

  const mark = (x0, z0, x1, z1) => deco.box(x0, 0, z0, x1, 0.015, z1, 'marking', { scale: [1, 4], skip: 0b111011 });
  for (let z = -36; z < 30; z += 6) mark(14.9, z, 15.1, z + 3.5);
  for (let x = -46; x < 46; x += 6) mark(x, 15.4, x + 3.5, 15.6);
  mark(-50, 30.3, 50, 30.5);
  for (let x = -28; x < 0; x += 4) mark(x, -24.2, x + 0.2, -21);

  // ---------------- perimeter walls ----------------
  const WH = 4.5;
  solid(-50.6, 0, -40.6, 50.6, WH, -40, 'wall', { scale: [6, WH] });
  solid(-50.6, 0, -40, -50, WH, 39.8, 'wall', { scale: [6, WH] });
  solid(50, 0, -40, 50.6, WH, 39.8, 'wall', { scale: [6, WH] });
  decor(-50.8, WH, -40.8, 50.8, WH + 0.15, -39.9, 'dark');
  decor(-50.8, WH, -40, -49.9, WH + 0.15, 39.8, 'dark');
  decor(49.9, WH, -40, 50.8, WH + 0.15, 39.8, 'dark');
  for (let x = -45; x <= 45; x += 10) decor(x - 0.3, 0, -40, x + 0.3, WH, -39.6, 'wall', { scale: [2, WH] });

  // ---------------- central warehouse ----------------
  {
    const X0 = -12, X1 = 12, Z0 = -9, Z1 = 7, H = 8, t = 0.4;
    const sid = { scale: [4, 4] };
    wall('z', Z0, Z1, X0, X0 + t, 0, H, [[-2.5, 2.5, 0, 5]], 'siding', sid);
    wall('z', Z0, Z1, X1 - t, X1, 0, H, [[-2.5, 2.5, 0, 5]], 'siding', sid);
    wall('x', X0, X1, Z0, Z0 + t, 0, H, [[-7, -5.6, 0, 2.4], [-9.5, -7.5, 4.4, 5.8], [-3, 0, 4.4, 5.8], [3, 6, 4.4, 5.8], [8, 10, 4.4, 5.8]], 'siding', sid);
    wall('x', X0, X1, Z1 - t, Z1, 0, H, [[-3, 3, 0, 4.4], [7, 8.4, 0, 2.4]], 'siding', sid);
    decor(-3, 4.4, Z1 - 0.15, 3, 5.2, Z1 + 0.15, 'roof', { scale: [2, 1] });
    for (const x of [-3, 3]) decor(x - 0.12, 0, Z1 - 0.25, x + 0.12, 4.5, Z1 + 0.25, 'hazard', { scale: [0.8, 0.8] });
    for (const z of [-2.5, 2.5]) { decor(X0 - 0.2, 0, z - 0.12, X0 + 0.5, 5.05, z + 0.12, 'hazard', { scale: [0.8, 0.8] }); decor(X1 - 0.5, 0, z - 0.12, X1 + 0.2, 5.05, z + 0.12, 'hazard', { scale: [0.8, 0.8] }); }
    solid(X0 - 0.4, H, Z0 - 0.4, X1 + 0.4, H + 0.3, Z1 + 0.4, 'roof', { scale: [3, 3] });
    decor(X0 - 0.2, H + 0.3, Z0 - 0.2, X1 + 0.2, H + 1.0, Z1 + 0.2, 'roof', { scale: [3, 3] });
    decor(X0, H + 1.0, -1.4, X1, H + 1.5, 0.2, 'roof', { scale: [3, 3] });
    decor(X0 + t, 0, Z0 + t, X1 - t, 0.01, Z1 - t, 'concrete', { scale: [4, 4], skip: 0b111011 });
    // mezzanine (top 3.8)
    solid(X0 + t, 3.6, Z0 + t, X1 - t, 3.8, -5.2, 'tread', { scale: [2, 2] });
    for (const x of [-8, -2, 4]) solid(x - 0.15, 0, -5.55, x + 0.15, 3.6, -5.25, 'dark');
    decor(X0 + t, 3.4, -5.4, X1 - t, 3.6, -5.2, 'hazard', { scale: [1, 1] });
    railing(X0 + t, -5.2, 7.8, -5.2, 3.8);
    railing(9.8, -5.2, X1 - t, -5.2, 3.8);
    stairs(8, 9.6, -5.2, 2.6, '-z', 0, 3.8);
    railing(7.95, 2.6, 7.95, -5.2, 0.4, 3.5);
    crate(-6.5, -0.5, 0, 2.0); crate(-6.4, -0.4, 2.0, 1.2); crate(-4.6, -0.8, 0, 1.2);
    crate(4, 1, 0, 2.0); crate(5.6, 1.2, 0, 1.2); crate(3.6, 2.8, 0, 1.2);
    crate(-2.4, 3.6, 0, 1.2); crate(-0.9, 3.8, 0, 1.2); crate(-1.6, 3.7, 1.2, 1.2);
    crate(-9.8, -3.2, 0, 1.2);
    solid(-11.4, 0, 5.0, -5.4, 2.9, 6.3, 'crate', { uv: 'face', color: [0.7, 0.66, 0.6] });
    decor(-11.5, 2.9, 4.95, -5.3, 3.0, 6.35, 'dark');
    for (const x of [-11.45, -8.4, -5.35]) decor(x - 0.05, 0, 4.9, x + 0.05, 3.0, 6.4, 'dark');
    crate(-9.5, -7.9, 3.8, 1.2); crate(-1.5, -7.95, 3.8, 1.2); crate(5.5, -7.9, 3.8, 1.2);
    for (const x of [-6, 0, 6]) { decor(x - 0.4, 7.0, -1.6, x + 0.4, 7.15, -1.0, 'lampHead'); ctx.glow([x, 6.95, -1.3], 2.2); }
    ctx.pointLight([-4, 6.6, -1.3]);
    ctx.pointLight([5, 6.6, -1.3]);
    ctx.sign(0, 6.3, Z1 + 0.22, 5.2, 1.0, ['WAREHOUSE 7'], 'z', '#24313b', '#e9e2cf');
  }

  // ---------------- office / control building (NW) ----------------
  {
    const X0 = -47, X1 = -35, Z0 = -38, Z1 = -29, t = 0.3;
    const bl = { scale: [3, 3] };
    wall('x', X0, X1, Z0, Z0 + t, 0, 6.6, [[-45, -43, 4.6, 5.8], [-40, -38, 4.6, 5.8]], 'blocks', bl);
    wall('x', X0, X1, Z1 - t, Z1, 0, 6.6, [[-43, -41.5, 0, 2.4], [-39, -37, 1.1, 2.2], [-45.5, -42.5, 4.6, 5.8], [-40, -36.5, 4.6, 5.8]], 'blocks', bl);
    wall('z', Z0 + t, Z1 - t, X0, X0 + t, 0, 6.6, [[-35, -33, 4.6, 5.8], [-34, -32.6, 1.1, 2.2]], 'blocks', bl);
    wall('z', Z0 + t, Z1 - t, X1 - t, X1, 0, 6.6, [[-36.6, -35.2, 0, 2.4], [-33.4, -32.0, 3.6, 6.0], [-31.5, -30.2, 4.6, 5.8]], 'blocks', bl);
    solid(X0 + t, 3.4, Z0 + t, X1 - t, 3.6, Z1 - t, 'concrete', { scale: [3, 3] });
    solid(X0 - 0.3, 6.6, Z0 - 0.3, X1 + 0.3, 6.95, Z1 + 0.3, 'roof', { scale: [3, 3] });
    decor(X0 - 0.35, 6.95, Z0 - 0.35, X1 + 0.35, 7.1, Z1 + 0.35, 'dark');
    decor(-44, 7.1, -36, -41.5, 8.2, -34, 'paint', { color: linColor('#9aa1a6') });
    decor(-37.2, 7.1, -31.2, -37.0, 11.5, -31.0, 'dark');
    stairs(-34.6, -33.2, -31.6, -24.4, '-z', 0, 3.6);
    solid(-35.0, 3.4, -33.6, -33.1, 3.6, -31.6, 'tread', { scale: [1, 1] });
    for (const z of [-33.5, -31.7]) solid(-33.25, 0, z - 0.08, -33.1, 3.4, z + 0.08, 'dark');
    railing(-33.1, -33.6, -33.1, -31.6, 3.6);
    railing(-35.0, -33.6, -33.1, -33.6, 3.6);
    railing(-33.15, -31.6, -33.15, -24.4, 0.6, 3.4);
    solid(-46.5, 0, -37.5, -44.5, 0.85, -36.6, 'paint', { color: linColor('#6b5a48') });
    solid(-40, 0, -34.5, -38, 0.85, -33.4, 'paint', { color: linColor('#6b5a48') });
    solid(-46.6, 3.6, -37.6, -45.9, 5.6, -34.6, 'paint', { color: linColor('#55636e') });
    solid(-42, 3.6, -33, -39.6, 4.45, -31.8, 'paint', { color: linColor('#6b5a48') });
    crate(-37.2, -36.8, 3.6, 1.0);
    wall('z', Z0 + t, Z1 - t, -41.1, -40.9, 0, 3.4, [[-35.5, -34.0, 0, 2.3]], 'blocks', bl);
    ctx.sign(-41, 6.2, Z1 + 0.02, 3.0, 0.6, ['CONTROL'], 'z', '#2d3a2f', '#dfe8d6');
  }

  // ---------------- north lot: trailers, truck, tanks ----------------
  const trailer = (x0, x1, z0, z1) => {
    solid(x0, 1.15, z0, x1, 3.9, z1, 'container', { scale: [2.4, 2.6], color: CONT.white, oy: 0.25 });
    world.add(x0 + 0.1, 0, z0 + 0.1, x1 - 0.1, 1.15, z1 - 0.1, { shoot: false });
    decor(x0 + 0.2, 0.95, z0 + 0.15, x1 - 0.2, 1.15, z1 - 0.15, 'dark');
    const L = x1 - x0;
    for (const fx of [0.08, 0.16]) for (const zz of [z0 + 0.1, z1 - 0.45]) decor(x1 - L * fx - 0.5, 0, zz, x1 - L * fx + 0.5, 1.0, zz + 0.35, 'rubber');
    for (const zz of [z0 + 0.3, z1 - 0.4]) decor(x0 + L * 0.25 - 0.08, 0, zz, x0 + L * 0.25 + 0.08, 1.0, zz + 0.1, 'dark');
    decor(x0 + 0.5, 1.6, z0 - 0.01, x0 + 3.5, 2.2, z0, 'hazard', { scale: [1, 1] });
  };
  trailer(-26, -14, -34, -31.5);
  trailer(-8, 4, -30, -27.5);
  solid(4.2, 0, -30.2, 6.4, 3.3, -27.3, 'paint', { color: linColor('#a2331f') });
  solid(6.4, 0, -30.0, 7.6, 1.8, -27.5, 'paint', { color: linColor('#a2331f') });
  decor(5.3, 2.0, -30.25, 6.45, 3.0, -27.25, 'glass');
  decor(6.42, 1.0, -30.05, 7.62, 1.6, -27.45, 'dark');
  const tanks = [];
  for (const tz of [-35.2, -31]) {
    solid(26, 0.0, tz - 1.55, 38, 3.4, tz + 1.55, null);
    tanks.push(tz);
    for (const sx of [27.5, 32, 36.5]) decor(sx - 0.3, 0, tz - 1.3, sx + 0.3, 0.8, tz + 1.3, 'concrete', { scale: [1, 1] });
  }
  solid(39.5, 0, -38, 40, 2.5, -27, 'dark');
  decor(26, 2.8, -38.4, 40, 3.0, -38.2, 'dark');
  decor(26, 2.4, -38.6, 40, 2.6, -38.4, 'paint', { color: linColor('#b8862e') });
  barrier(-30, -22, 4, true); barrier(-10, -20, 4, true); barrier(16.5, -20.5, 3.2, false);
  barrier(16.5, -11.5, 3.2, false); barrier(13, -36, 3.2, false);
  crate(-18, -24, 0, 1.4); crate(-16.6, -23.6, 0, 1.2); crate(-17.4, -23.9, 1.4, 1.0);
  crate(10, -24, 0, 1.4); crate(11.3, -25.1, 0, 1.2);
  crate(20, -36.5, 0, 1.4); crate(21.4, -37.0, 0, 1.2); crate(20.2, -36.5, 1.4, 1.2);
  pallet(-3, -36); crate(-3, -36, 0.14, 1.1);
  container(-26.5, -38.6, 0, 6.1, true, 'teal');
  container(-0.5, -38.6, 0, 12.2, true, 'grey');
  container(-0.5, -38.6, 1, 6.1, true, 'red');
  container(46.5, -28, 0, 12.2, false, 'blue');
  container(46.5, -28, 1, 12.2, false, 'orange');
  container(43.9, -31, 0, 6.1, false, 'white');

  // ---------------- east yard ----------------
  container(25, -17.5, 0, 12.2, true, 'red');
  container(25, -17.5, 1, 12.2, true, 'blue');
  container(40, -17.5, 0, 12.2, true, 'green');
  container(25, -14.94, 0, 12.2, true, 'orange');
  container(40, -14.94, 0, 12.2, true, 'white');
  container(40, -14.94, 1, 12.2, true, 'red');
  container(23.5, -4, 0, 6.1, true, 'yellow');
  container(37, -4, 0, 12.2, true, 'blue');
  container(37, -4, 1, 12.2, true, 'green');
  container(23, 6, 0, 12.2, true, 'red');
  container(23, 6, 1, 12.2, true, 'white');
  container(37, 6, 0, 12.2, true, 'orange');
  container(37, 6, 1, 12.2, true, 'blue');
  container(37, 8.5, 0, 12.2, true, 'green');
  container(26, 18, 0, 12.2, true, 'blue');
  container(42, 18, 0, 6.1, true, 'red');
  container(42, 20.56, 0, 6.1, true, 'teal');
  container(42, 20.56, 1, 6.1, true, 'yellow');
  stairs(43.1, 48.4, 7.4, 9.0, '-x', 0, 2.6);
  railing(43.1, 9.05, 48.4, 9.05, 0.3, 2.6);
  solid(30.95, 2.6, 7.28, 32.6, 5.2, 9.05, 'tread', { scale: [1, 1] });
  stairs(32.6, 36.9, 7.28, 9.05, '-x', 2.6, 5.2);
  railing(32.6, 9.1, 36.9, 9.1, 2.8, 2.4);
  solid(33, 5.0, -2.78, 34.6, 5.2, 4.78, 'tread', { scale: [1, 1] });
  decor(33.05, 4.7, -2.7, 33.2, 5.0, 4.7, 'dark'); decor(34.4, 4.7, -2.7, 34.55, 5.0, 4.7, 'dark');
  railing(33, -2.78, 33, 4.78, 5.2);
  railing(34.6, -2.78, 34.6, 4.78, 5.2);
  crate(30.5, -9.5, 0, 1.4); crate(31.9, -9.9, 0, 1.2); crate(31, -9.6, 1.4, 1.0);
  crate(45, -8, 0, 1.4); crate(46.3, -7.6, 0, 1.2);
  crate(19.5, 12, 0, 1.4); crate(20.8, 12.4, 0, 1.0);
  barrier(30, 13, 4, true); barrier(44, -1, 3.2, false);
  pallet(27, -9); pallet(46, 13); crate(46, 13, 0.14, 1.1);

  // ---------------- west yard ----------------
  container(-45.5, -15, 0, 12.2, false, 'blue');
  container(-45.5, -15, 1, 12.2, false, 'red');
  container(-42.9, -15, 0, 12.2, false, 'green');
  container(-45.5, 2, 0, 6.1, false, 'orange');
  container(-45.5, 16, 0, 12.2, false, 'white');
  container(-45.5, 16, 1, 12.2, false, 'yellow');
  container(-42.9, 16, 0, 12.2, false, 'red');
  container(-34, -12, 0, 12.2, false, 'red');
  container(-34, -12, 1, 12.2, false, 'blue');
  container(-31.4, -12, 0, 12.2, false, 'orange');
  stairs(-32.2, -30.6, -5.86, -0.56, '-z', 0, 2.6);
  railing(-30.55, -5.86, -30.55, -0.56, 0.3, 2.6);
  stairs(-32.6, -31.0, -12.3, -7.0, '-z', 2.6, 5.2);
  container(-34, 6, 0, 12.2, false, 'green');
  container(-26, -2, 0, 6.1, true, 'blue');
  container(-24, 14, 0, 12.2, false, 'red');
  container(-21.4, 14, 0, 12.2, false, 'white');
  container(-21.4, 14, 1, 12.2, false, 'orange');
  container(-34, 24, 0, 6.1, false, 'yellow');
  crate(-38.5, 1, 0, 1.4); crate(-37.2, 1.4, 0, 1.2); crate(-38.2, 1.1, 1.4, 1.0);
  crate(-27, 6, 0, 1.4); crate(-28.4, 5.6, 0, 1.0);
  crate(-40, -24, 0, 1.4); crate(-38.6, -24.4, 0, 1.2);
  barrier(-18, -6, 3.2, false); barrier(-29, 18.5, 3.2, true);
  pallet(-24, -14); crate(-24, -14, 0.14, 1.1);

  // ---------------- south dock: gantry crane ----------------
  const crane = linColor('#c58a1c');
  for (const [lx, lz] of [[-9, 23], [-9, 37], [9, 23], [9, 37]]) {
    solid(lx - 0.6, 0, lz - 0.6, lx + 0.6, 24, lz + 0.6, 'paint', { color: crane, scale: [2, 2] });
    solid(lx - 1.0, 0, lz - 1.6, lx + 1.0, 1.1, lz + 1.6, 'paint', { color: linColor('#4b4f55') });
  }
  for (const lx of [-9, 9]) decor(lx - 0.5, 22, 22.4, lx + 0.5, 24, 37.6, 'paint', { color: crane });
  for (const lz of [23, 37]) decor(-9.6, 23, lz - 0.5, 9.6, 24.6, lz + 0.5, 'paint', { color: crane });
  decor(-1.2, 24.6, 10, 1.2, 26.4, 85, 'paint', { color: crane });
  decor(-2.4, 22.2, 28, 2.4, 25.0, 32, 'paint', { color: linColor('#d9d4c8') });
  decor(-1.4, 21.0, 32, 1.4, 22.8, 34.2, 'glass');
  decor(-1.0, 26.4, 14, 1.0, 34, 16, 'paint', { color: crane });
  const braceMat = new THREE.MeshStandardMaterial({ color: 0xb07a18, roughness: 0.55, metalness: 0.4 });
  ctx.disposables.push(braceMat);
  for (const lx of [-9, 9]) {
    for (const [a, b] of [[[lx, 1.2, 23.6], [lx, 11.5, 36.4]], [[lx, 1.2, 36.4], [lx, 11.5, 23.6]], [[lx, 11.5, 23.6], [lx, 21.8, 36.4]], [[lx, 11.5, 36.4], [lx, 21.8, 23.6]]]) ctx.beam(a, b, 0.28, null, { mat: braceMat });
    decor(lx - 0.35, 11.3, 23, lx + 0.35, 11.7, 37, 'paint', { color: linColor('#b07a18') });
    decor(lx - 0.1, 0, 18, lx + 0.1, 0.05, 40, 'dark');
  }
  // bollards
  const bollards = [];
  for (let x = -45; x <= 45; x += 7.5) { solid(x - 0.3, 0, 38.6, x + 0.3, 0.7, 39.2, null); bollards.push([x, 38.9]); }
  container(-30, 33, 0, 12.2, true, 'orange');
  container(-31.5, 35.56, 0, 6.1, true, 'red');
  container(29, 33, 0, 12.2, true, 'green');
  container(29, 33, 1, 12.2, true, 'blue');
  container(27, 35.56, 0, 6.1, true, 'white');
  barrier(-15, 19, 4, true); barrier(15, 22, 3.2, false); barrier(0, 34, 4, true); barrier(-22, 26, 3.2, false);
  crate(-3, 25.5, 0, 1.4); crate(-1.6, 25.9, 0, 1.2); crate(-2.6, 25.6, 1.4, 1.0);
  crate(4, 30, 0, 1.4); crate(5.4, 29.6, 0, 1.2);
  crate(18, 28, 0, 1.4); crate(19.4, 28.4, 0, 1.4); crate(18.7, 28.2, 1.4, 1.2);
  crate(-40, 28, 0, 1.4); crate(-41.4, 28.5, 0, 1.0);
  pallet(-12, 31); crate(-12, 31, 0.14, 1.1);
  // forklift
  solid(21, 0, 21, 22.6, 1.6, 23.4, 'paint', { color: linColor('#d4a017') });
  decor(21.1, 1.6, 21.3, 22.5, 2.6, 22.6, 'dark');
  decor(20.4, 0.05, 21.4, 21.0, 1.9, 21.5, 'dark'); decor(20.4, 0.05, 22.9, 21.0, 1.9, 23.0, 'dark');
  decor(19.6, 0.1, 21.5, 21.0, 0.16, 21.7, 'dark'); decor(19.6, 0.1, 22.7, 21.0, 0.16, 22.9, 'dark');

  // ---------------- road cover ----------------
  barrier(-15.5, -12, 3.2, false); barrier(-15.5, 4, 3.2, false);
  crate(14, 2, 0, 1.4); crate(15.3, 2.5, 0, 1.0);
  crate(-15, 12, 0, 1.4);
  barrier(6, 13, 4, true); barrier(-6, 13, 4, true);
  barrier(0, -16, 4, true);

  // ---------------- lamp posts ----------------
  const lampPos = [[-16, -16], [16, -16], [-16, 16.5], [16.5, 16.5], [-30, -27], [31, -24.5], [-37, 30], [37, 29], [0, -21], [0, 21]];
  lampPos.forEach(([lx, lz], i) => ctx.lamp(lx, lz, { h: 8, light: i === 1 || i === 2 }));

  // ---------------- distant scenery ----------------
  for (let i = 0; i < 46; i++) {
    const x = -420 + i * 18 + rng() * 8, z = 230 + rng() * 80;
    const w = 10 + rng() * 14, d = 10 + rng() * 14, h = 18 + rng() * rng() * 110;
    far.box(x, -2, z, x + w, h, z + d, 'city', { scale: [24, 24], ox: rng() * 100 });
  }
  far.box(-600, -3, 220, 600, 1.5, 420, 'land', { scale: [50, 50] });
  for (const [x0, z0, x1, z1, h] of [[-110, -90, -60, -50, 14], [-110, -30, -66, 20, 10], [60, -95, 120, -55, 16], [64, -30, 110, 25, 12], [-30, -110, 40, -60, 18]]) {
    far.box(x0, 0, z0, x1, h, z1, 'siding', { scale: [4, 4] });
  }

  // ---------------- cylinders: tanks, bollards ----------------
  {
    const tankGeo = new THREE.CylinderGeometry(1.55, 1.55, 11.6, 24, 1);
    tankGeo.rotateZ(Math.PI / 2);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.8 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xb8862e, roughness: 0.6 });
    const capGeo = new THREE.SphereGeometry(1.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const bandGeo = new THREE.CylinderGeometry(1.57, 1.57, 0.5, 24);
    ctx.disposables.push(tankGeo, tankMat, bandMat, capGeo, bandGeo);
    for (const tz of tanks) {
      const m = new THREE.Mesh(tankGeo, tankMat);
      m.position.set(32, 1.9, tz); m.castShadow = m.receiveShadow = true; root.add(m);
      for (const [x, rz] of [[37.8, -Math.PI / 2], [26.2, Math.PI / 2]]) {
        const cap = new THREE.Mesh(capGeo, tankMat);
        cap.scale.set(0.35, 1, 1); cap.rotation.z = rz; cap.position.set(x, 1.9, tz); cap.castShadow = true; root.add(cap);
      }
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.rotation.z = Math.PI / 2; band.position.set(32, 1.9, tz); root.add(band);
    }
    const bGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
    ctx.disposables.push(bGeo, bMat);
    const inst = new THREE.InstancedMesh(bGeo, bMat, bollards.length);
    const mm = new THREE.Matrix4();
    bollards.forEach(([x, z], i) => { mm.makeTranslation(x, 0.35, z); inst.setMatrixAt(i, mm); });
    inst.castShadow = true;
    root.add(inst);
  }

  // ---------------- water ----------------
  const waterNormal = T.waterNormal.clone();
  waterNormal.needsUpdate = true;
  waterNormal.repeat.set(60, 30);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x16313a, roughness: 0.08, metalness: 0.15, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
  ctx.disposables.push(waterNormal, waterMat);
  ctx.mesh(new THREE.PlaneGeometry(1600, 600), waterMat, [0, -1.3, 340], { rot: [-Math.PI / 2, 0, 0], shadow: false });

  // red aviation lights on the crane (blink)
  const aviation = [[0, 34.4, 15], [-9, 24.8, 23], [9, 24.8, 37], [0, 26.8, 84]].map((p) => ctx.glow(p, 2.4, 0xff3020, 1));
  ctx.updates.push((t) => {
    waterNormal.offset.set(t * 0.004, t * 0.009);
    const blink = Math.sin(t * 2.2) > 0.2 ? 1 : 0.15;
    for (const s of aviation) s.material.opacity = blink;
  });

  const spawns = [
    [-40, 0, -22, 0], [-26, 0, -28, 0], [-8, 0, -23, 0], [9, 0, -33, 0], [22, 0, -28, 0], [44, 0, -37, 0.8],
    [-46, 0, 6, -1.57], [-28, 0, 27, 3.14], [-14, 0, 33, 3.14], [3, 0, 37, 3.14], [16, 0, 25, 2.4], [36, 0, 26, 2.6],
    [46, 0, 4, 1.57], [17, 0, -4, 1.57], [-1, 0, 0, 0], [-18, 0, 9, -1.57], [44, 0, -10, 1.2], [-38, 0, -3, -1.57],
    [-41, 3.6, -36, 0.6], [28, 0, -8, 0.5],
  ].map(([x, y, z, yaw]) => ({ x, y, z, yaw }));

  const pickups = [
    { id: 0, type: 'hp', x: 0, y: 0, z: -2.2 },
    { id: 1, type: 'hp', x: -42, y: 3.6, z: -31 },
    { id: 2, type: 'hp', x: 37.5, y: 5.2, z: 6 },
    { id: 3, type: 'hp', x: 0, y: 0, z: 30 },
    { id: 4, type: 'hp', x: -38, y: 0, z: 8.5 },
    { id: 5, type: 'ammo', x: -20, y: 0, z: -27 },
    { id: 6, type: 'ammo', x: 30.5, y: 0, z: -7.4 },
    { id: 7, type: 'ammo', x: -7, y: 0, z: 23 },
    { id: 8, type: 'ammo', x: 12, y: 0, z: -22 },
    { id: 9, type: 'ammo', x: 1.5, y: 3.8, z: -7 },
    { id: 10, type: 'ammo', x: -34, y: 5.2, z: -16 },
    { id: 11, type: 'nade', x: 22, y: 0, z: 1 },
    { id: 12, type: 'nade', x: -22, y: 0, z: 3 },
  ];

  return finishMap(ctx, def, { spawns, pickups });
}
