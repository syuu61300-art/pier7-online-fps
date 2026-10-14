// 砂塵採掘場 (Dust Quarry) — an open-pit mine at midday. The pit floor is crowded with haul
// trucks, an excavator and rock piles; terraces rise to the north and south, joined by haul
// ramps, steel stairs and a conveyor bridge across the pit. High ground matters here.
import * as THREE from 'three';
import { createContext, finishMap, linColor } from './builder.js';

export const def = {
  id: 'quarry',
  name: '砂塵採掘場',
  sub: '露天掘り鉱山・真昼',
  desc: '段々の採掘場。高台を取るか、重機の陰を進むか。橋とスロープで上下がつながる。',
  size: '大',
  bounds: { minX: -46, maxX: 46, minZ: -36, maxZ: 36 },
  theme: {
    sky: { top: '#3f78b8', mid: '#9cc0dc', horizon: '#ead6ae', sun: '#fff4d8', ground: '#a88a60', clouds: 0.35, sunDisc: 1 },
    sunDir: [-0.4, 0.78, -0.3],
    sunColor: 0xfff1d6,
    sunIntensity: 3.6,
    hemi: [0xc8dcf0, 0x9a7a52, 0.95],
    fog: [0xd9c7a2, 70, 430],
    particles: 'dust',
    ambience: { wind: 0.75, windFreq: 340, water: 0 },
    exposure: 0.95,
    preview: ['#9cc0dc', '#cfae7c'],
  },
};

export function build(renderer, quality) {
  const B = def.bounds;
  const ctx = createContext({ renderer, quality, theme: def.theme, bounds: B, seed: 1234 });
  const { world, geo, deco, far, solid, decor, stairs, railing, crate, barrel, barrier, container, M, T, rng, root } = ctx;
  const ROCK = linColor('#d9b48e'), ROCK2 = linColor('#c49a74'), SAND = [1, 1, 1];
  const YEL = linColor('#d8a21c'), RUST = linColor('#9c5a36'), TEAL = linColor('#3f7f80');

  ctx.ground('sand', 6);

  // ---------------- terrain: cliffs and terraces ----------------
  const rock = (x0, y0, z0, x1, y1, z1, col = ROCK) => solid(x0, y0, z0, x1, y1, z1, 'rock', { scale: [9, 7], color: col });
  rock(-52, 0, -42, 52, 16, -36);          // north cliff
  rock(-52, 0, 36, 52, 13, 42);            // south cliff
  rock(-52, 0, -36, -46, 14, 36, ROCK2);   // west cliff
  rock(46, 0, -36, 52, 14, 36, ROCK2);     // east cliff
  rock(-46, 0, -36, 46, 7, -30);           // upper north terrace (top 7)
  rock(-46, 0, -30, 46, 3.5, -18, ROCK2);  // lower north terrace (top 3.5)
  rock(-46, 0, 18, 46, 3.5, 36, ROCK2);    // south terrace (top 3.5)
  // sand on the terrace tops
  const sandTop = (x0, z0, x1, z1, y) => deco.box(x0, y, z0, x1, y + 0.012, z1, 'sand', { scale: [6, 6], skip: 0b111011 });
  sandTop(-46, -36, 46, -30, 7); sandTop(-46, -30, 46, -18, 3.5); sandTop(-46, 18, 46, 36, 3.5);
  // ledges/benches on the cliff faces for texture
  for (let x = -44; x < 44; x += 11) {
    rock(x, 3.5, -37.2, x + 6 + rng() * 3, 9 + rng() * 3, -36, ROCK2);
    rock(x + 3, 3.5, 35.2, x + 8, 7 + rng() * 3, 36);
  }
  // boulders along terrace edges (cover)
  for (const [x, z, y, s] of [[-30, -19.2, 3.5, 1.3], [-18, -19, 3.5, 1.0], [20, -19.3, 3.5, 1.2], [40, -19, 3.5, 1.1], [-20, -30.8, 7, 1.2], [14, -31, 7, 1.0], [30, -30.9, 7, 1.3],
    [-40, 19.2, 3.5, 1.2], [-12, 19, 3.5, 1.1], [3, 19.2, 3.5, 1.0], [32, 19.1, 3.5, 1.3]]) boulder(x, z, y, s);

  // far mesas and desert floor
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rng() * 0.15, r = 160 + rng() * 140;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, w = 25 + rng() * 50, d = 20 + rng() * 40, h = 14 + rng() * 40;
    far.box(x - w / 2, -2, z - d / 2, x + w / 2, h, z + d / 2, 'rock', { scale: [30, 20], color: ROCK.map((v) => v * (0.85 + rng() * 0.2)) });
  }

  // ---------------- haul ramps and stairs ----------------
  stairs(28, 34, -18, -6, '-z', 0, 3.5, 'ballast', { scale: [3, 3] });          // pit -> north terrace
  stairs(-34, -28, 6, 18, '+z', 0, 3.5, 'ballast', { scale: [3, 3] });          // pit -> south terrace
  stairs(-40, -34, -30, -21, '-z', 3.5, 7, 'ballast', { scale: [3, 3] });       // north terrace -> upper
  stairs(36, 42, -30, -21, '-z', 3.5, 7, 'ballast', { scale: [3, 3] });
  for (const [x0, x1, z0, z1] of [[28, 34, -18, -6], [-34, -28, 6, 18]]) { decor(x0 - 0.3, 0, z0, x0, 0.6, z1, 'concrete', { scale: [2, 2] }); decor(x1, 0, z0, x1 + 0.3, 0.6, z1, 'concrete', { scale: [2, 2] }); }
  // steel staircases
  stairs(-2, 0, -18, -11, '-z', 0, 3.5, 'tread');
  railing(-2.05, -18, -2.05, -11, 0.4, 3.5); railing(0.05, -18, 0.05, -11, 0.4, 3.5);
  stairs(18, 20, 11, 18, '+z', 0, 3.5, 'tread');
  railing(17.95, 11, 17.95, 18, 0.4, 3.5); railing(20.05, 11, 20.05, 18, 0.4, 3.5);
  stairs(-12, -10, -30, -23.4, '-z', 3.5, 7, 'tread');
  railing(-12.05, -30, -12.05, -23.4, 3.8, 3.4); railing(-9.95, -30, -9.95, -23.4, 3.8, 3.4);

  // ---------------- conveyor bridge across the pit (top 3.5) ----------------
  solid(8, 3.3, -18, 11, 3.5, 18, 'tread', { scale: [1, 1] });
  decor(8, 3.0, -18, 8.2, 3.3, 18, 'paint', { color: YEL }); decor(10.8, 3.0, -18, 11, 3.3, 18, 'paint', { color: YEL });
  railing(8, -18, 8, 18, 3.5); railing(11, -18, 11, 18, 3.5);
  for (const z of [-9, 0, 9]) {
    solid(8.6, 0, z - 0.3, 10.4, 3.3, z + 0.3, 'paint', { color: YEL, scale: [2, 2] });
    decor(8.2, 0, z - 0.5, 10.8, 0.3, z + 0.5, 'concrete');
  }
  // belt on the east half of the deck (low cover)
  solid(9.9, 3.5, -17, 10.9, 4.1, 17, 'rubber');
  for (let z = -16; z <= 16; z += 2) decor(9.85, 3.5, z - 0.05, 10.95, 4.15, z + 0.05, 'dark');

  // ---------------- crusher plant (pit east): two floors ----------------
  ctx.building({
    x0: 32, x1: 42, z0: -4, z1: 10, floors: 2, fh: 4.0, mat: 'siding', color: linColor('#c8a76a'), scale: [4, 4],
    doors: [{ side: 'w', a: 1.5, w: 2.4, h: 3.0 }, { side: 'n', a: 36.5 }, { side: 's', a: 38.5, w: 2.0 }],
    autoWindows: { sides: ['w', 'n', 's', 'e'], every: 3.0, from: 1, w: 1.6 },
    windows: [{ side: 'w', a: 6.5, floor: 0 }],
    stairs: [{ x0: 39.9, x1: 41.7, z0: -3.0, z1: 4.0, dir: '+z', floor: 0 }],
    floorMat: 'concrete', slabMat: 'tread', parapet: 0.6, capMat: 'steel', trim: 'steel',
  });
  solid(34, 0, 4, 37.5, 2.6, 8, 'paint', { color: linColor('#7a8086') });         // crusher
  decor(34.3, 2.6, 4.3, 37.2, 3.4, 7.7, 'dark');
  crate(34, -2.4, 0, 1.2); crate(35.3, -2.0, 0, 1.0); crate(38, 8.5, 4.0, 1.2); crate(33, -2.8, 4.0, 1.0);
  solid(35, 4.0, 2, 37.5, 4.9, 3, 'steel');
  // conveyor from the plant roof up to the upper terrace (decor beams)
  {
    const cm = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.5, metalness: 0.6 });
    ctx.disposables.push(cm);
    ctx.beam([37, 8.6, -4], [37, 9.4, -30], 1.2, null, { mat: cm });
    ctx.beam([36.4, 9.3, -4], [36.4, 10.1, -30], 0.12, null, { mat: cm }); ctx.beam([37.6, 9.3, -4], [37.6, 10.1, -30], 0.12, null, { mat: cm });
    for (const z of [-10, -16]) { solid(36.6, 0, z - 0.2, 37.4, 8.6, z + 0.2, 'steel'); }
  }

  // ---------------- workshop / garage (pit west) ----------------
  ctx.building({
    x0: -42, x1: -30, z0: -8, z1: 6, floors: 1, fh: 5.2, mat: 'siding', color: RUST, scale: [4, 4],
    doors: [{ side: 'e', a: -1, w: 4.4, h: 4.2 }, { side: 'n', a: -36.5 }, { side: 's', a: -35.5 }],
    windows: [{ side: 'w', a: -4.5, floor: 0, sill: 2.4 }, { side: 'w', a: 2.5, floor: 0, sill: 2.4 }, { side: 'n', a: -32.5, floor: 0, sill: 1.6 }],
    floorMat: 'concrete', parapet: 0.4, capMat: 'steel',
  });
  solid(-41.5, 0, -7.5, -38.5, 1.0, -6.5, 'steel');                                // workbench
  solid(-41.6, 0, 2.5, -40.4, 2.4, 5.5, 'dark');                                   // tool cabinets
  crate(-33, -6.4, 0, 1.2); crate(-33.5, 4.6, 0, 1.0); barrel(-40.6, -4); barrel(-40.6, -3.2, 0, '#7a2f22');
  pickup4x4(-36, -1.2, false, linColor('#e2e0d8'));
  ctx.pointLight([-36, 4.4, -1], 0xffe2b8, 26, 16);

  // ---------------- buildings on the terraces ----------------
  // site office (south terrace): two floors with roof access
  ctx.building({
    x0: 10, x1: 24, z0: 24, z1: 32, y0: 3.5, floors: 2, fh: 3.2, mat: 'labpanel', color: linColor('#e7e1d4'), scale: [2.4, 2.4],
    doors: [{ side: 'n', a: 14.5 }, { side: 'w', a: 28.5 }, { side: 'e', a: 26.5 }],
    autoWindows: { sides: ['n', 's', 'w', 'e'], every: 3.0, from: 0, w: 1.4 },
    stairs: [
      { x0: 16, x1: 22.4, z0: 30.0, z1: 31.7, dir: '+x', floor: 0 },
      { x0: 12, x1: 18.4, z0: 24.3, z1: 26.0, dir: '+x', floor: 1 },
    ],
    floorMat: 'floortile', roofTop: 'concrete', parapet: 0.9, capMat: 'steel', trim: 'steel',
  });
  ctx.sign(17, 6.1, 23.97, 5.2, 0.7, ['SITE OFFICE'], '-z', '#244056', '#f2efe6');
  solid(19, 3.5, 26.5, 22.5, 4.35, 27.5, 'paint', { color: linColor('#6b5a48') }); crate(11.2, 28, 3.5, 1.0);
  solid(13, 6.7, 28.5, 16, 7.55, 29.5, 'paint', { color: linColor('#6b5a48') }); crate(22.6, 27, 6.7, 1.0);
  solid(20, 9.9, 26.5, 22, 11.0, 28.5, 'steel');
  // portable cabins and water tower on the south terrace
  container(-14, 26, 0, 6.1, true, 'white', 3.5);
  container(-14, 28.6, 0, 6.1, true, 'teal', 3.5);
  container(-24, 30, 0, 12.2, true, 'red', 3.5);
  container(-24, 30, 1, 6.1, true, 'yellow', 3.5);
  {
    const wt = new THREE.MeshStandardMaterial({ color: 0x8a9095, roughness: 0.5, metalness: 0.5 });
    ctx.disposables.push(wt);
    for (const [x, z] of [[33, 25], [37, 25], [33, 29], [37, 29]]) solid(x - 0.15, 3.5, z - 0.15, x + 0.15, 11, z + 0.15, 'steel');
    ctx.mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.4, 20), wt, [35, 12.7, 27]);
    ctx.mesh(new THREE.ConeGeometry(2.8, 1.1, 20), wt, [35, 14.95, 27]);
  }
  haulTruck(-2, 27, true, YEL, 3.5);
  crate(28, 21, 3.5, 1.4); crate(29.4, 21.4, 3.5, 1.0); barrel(-38, 28, 3.5); barrel(-38.7, 28.6, 3.5, '#7a2f22'); barrel(-37.3, 28.7, 3.5);
  crate(42, 22, 3.5, 1.2); crate(-43, 22, 3.5, 1.2);

  // workshop on the lower north terrace
  ctx.building({
    x0: -26, x1: -14, z0: -30, z1: -21, y0: 3.5, floors: 1, fh: 3.6, mat: 'siding', color: TEAL, scale: [4, 4],
    doors: [{ side: 's', a: -20.5, w: 2.0 }, { side: 'e', a: -25.5 }, { side: 'w', a: -23.5 }],
    windows: [{ side: 's', a: -24.5, floor: 0 }, { side: 's', a: -16.5, floor: 0 }],
    floorMat: 'concrete', parapet: 0.3, capMat: 'steel',
  });
  solid(-25.5, 3.5, -29, -22, 4.5, -28, 'steel'); crate(-15.5, -27.5, 3.5, 1.2);
  // guard hut + sandbags on the upper terrace
  ctx.building({
    x0: -4, x1: 2, z0: -35.6, z1: -31, y0: 7, floors: 1, fh: 2.8, mat: 'blocks', color: linColor('#c9c1b0'), scale: [3, 3],
    doors: [{ side: 's', a: -2.5 }],
    windows: [{ side: 's', a: 0.5, floor: 0, w: 1.6 }, { side: 'w', a: -33.5, floor: 0 }, { side: 'e', a: -33.5, floor: 0 }],
    floorMat: 'concrete', parapet: 0.3, capMat: 'concrete',
  });
  for (const [x, z, along] of [[-30, -30.6, true], [24, -30.6, true], [6, -30.6, true]]) sandbags(x, z, along, 7);
  for (const [x, z, along] of [[-6, -18.6, true], [26, -18.7, true], [-24, 18.6, true], [12, 18.6, true]]) sandbags(x, z, along, 3.5);
  // north terrace clutter
  container(4, -26, 0, 12.2, true, 'blue', 3.5);
  container(22, -24, 0, 6.1, false, 'orange', 3.5);
  crate(-6, -24, 3.5, 1.4); crate(-4.6, -24.4, 3.5, 1.2); crate(-5.4, -24.2, 4.9, 1.0);
  barrel(30, -25, 3.5); barrel(30.7, -25.6, 3.5, '#7a2f22'); crate(43, -24, 3.5, 1.2); crate(-43, -24, 3.5, 1.2);

  // ---------------- pit floor: machines, piles, explosives ----------------
  haulTruck(-12, 6, true, YEL);
  haulTruck(20, -6, false, YEL);
  excavator(-16, -9);
  heap(-4, 2, 3.6, 2.2); heap(24, 7, 3.0, 1.8); heap(-24, -14, 3.2, 1.9); heap(-22, 13, 2.6, 1.6);
  container(2, 12, 0, 6.1, true, 'red');
  container(-2, -6, 0, 6.1, false, 'blue');
  for (const [x, z] of [[14, 2], [15.2, 2.6], [14.4, 2.3]]) crate(x, z, x === 14.4 ? 1.1 : 0, 1.1);
  explosives(4, -3); explosives(-26, 2);
  barrier(-8, -15, 4, true); barrier(16, 14, 4, true); barrier(26, 2, 3.2, false); barrier(-28, -2, 3.2, false);
  crate(-44, -14, 0, 1.2); crate(-44, 14, 0, 1.2); crate(44, -14, 0, 1.2); crate(44.2, 14, 0, 1.0);
  barrel(26, -14); barrel(26.7, -13.4); barrel(-20, 16.5);
  // work lights on poles
  for (const [x, z, y] of [[-20, -19.5, 3.5], [24, -19.6, 3.5], [-6, 19.4, 3.5], [28, 19.5, 3.5], [-44, 0, 0], [44, -2, 0]]) floodlight(x, z, y);

  // ---------------- helpers ----------------
  function boulder(x, z, y, s) {
    solid(x - s, y, z - s * 0.7, x + s, y + s * 0.8, z + s * 0.7, 'rock', { scale: [3, 3], color: ROCK2 });
    solid(x - s * 0.6, y + s * 0.8, z - s * 0.45, x + s * 0.5, y + s * 1.2, z + s * 0.4, 'rock', { scale: [3, 3], color: ROCK });
  }
  function heap(x, z, r, h) {
    solid(x - r, 0, z - r * 0.8, x + r, h * 0.45, z + r * 0.8, 'ballast', { scale: [3, 3] });
    solid(x - r * 0.7, h * 0.45, z - r * 0.55, x + r * 0.65, h * 0.8, z + r * 0.5, 'ballast', { scale: [3, 3] });
    solid(x - r * 0.35, h * 0.8, z - r * 0.3, x + r * 0.3, h, z + r * 0.25, 'ballast', { scale: [3, 3] });
  }
  function sandbags(x, z, alongX, y) {
    const hx = alongX ? 1.6 : 0.35, hz = alongX ? 0.35 : 1.6;
    solid(x - hx, y, z - hz, x + hx, y + 0.95, z + hz, 'sand', { scale: [0.8, 0.8], color: [0.85, 0.78, 0.62] });
    decor(x - hx + 0.1, y + 0.95, z - hz + 0.05, x + hx - 0.1, y + 1.1, z + hz - 0.05, 'sand', { scale: [0.8, 0.8], color: [0.8, 0.72, 0.56] });
  }
  function explosives(x, z) {
    for (const [dx, dz, y, s] of [[0, 0, 0, 1.0], [1.05, 0.1, 0, 1.0], [0.5, 0.05, 1.0, 0.9]]) {
      solid(x + dx - s / 2, y, z + dz - s / 2, x + dx + s / 2, y + s, z + dz + s / 2, 'crate', { uv: 'face', color: [1.0, 0.45, 0.35] });
    }
    decor(x - 0.52, 0.35, z - 0.51, x + 0.52, 0.65, z - 0.5, 'hazard', { scale: [0.5, 0.5] });
  }
  function haulTruck(x, z, alongX, color, y0 = 0) {
    // big wheels (cover you can hide behind), bed and cab
    const L = 8.4, W = 4.4;
    const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
    const wheel = (wx, wz) => solid(wx - (alongX ? 0.9 : 0.45), y0, wz - (alongX ? 0.45 : 0.9), wx + (alongX ? 0.9 : 0.45), y0 + 1.8, wz + (alongX ? 0.45 : 0.9), 'rubber');
    for (const s of [-1, 1]) {
      if (alongX) { wheel(x - 2.6, z + s * (hz - 0.45)); wheel(x + 2.4, z + s * (hz - 0.45)); }
      else { wheel(x + s * (hx - 0.45), z - 2.6); wheel(x + s * (hx - 0.45), z + 2.4); }
    }
    world.add(x - hx + 0.5, y0, z - hz + 0.5, x + hx - 0.5, y0 + 1.3, z + hz - 0.5, { shoot: false });
    decor(x - hx + 0.6, y0 + 0.9, z - hz + 0.9, x + hx - 0.6, y0 + 1.3, z + hz - 0.9, 'dark');
    // bed (tilted look via two boxes)
    if (alongX) {
      solid(x - hx, y0 + 1.6, z - hz, x + hx - 2.2, y0 + 3.4, z + hz, 'paint', { color, scale: [2, 2] });
      decor(x - hx - 0.4, y0 + 2.6, z - hz + 0.2, x - hx, y0 + 3.6, z + hz - 0.2, 'paint', { color });
      solid(x + hx - 2.2, y0 + 1.6, z - hz + 0.3, x + hx, y0 + 3.6, z - 0.2, 'paint', { color: color.map((v) => v * 0.92) });
      decor(x + hx - 2.0, y0 + 2.6, z - hz + 0.28, x + hx + 0.01, y0 + 3.4, z - 0.4, 'glass');
      decor(x + hx - 2.2, y0 + 1.6, z - 0.2, x + hx, y0 + 2.2, z + hz - 0.3, 'dark');
    } else {
      solid(x - hx, y0 + 1.6, z - hz, x + hx, y0 + 3.4, z + hz - 2.2, 'paint', { color, scale: [2, 2] });
      decor(x - hx + 0.2, y0 + 2.6, z - hz - 0.4, x + hx - 0.2, y0 + 3.6, z - hz, 'paint', { color });
      solid(x - hx + 0.3, y0 + 1.6, z + hz - 2.2, x - 0.2, y0 + 3.6, z + hz, 'paint', { color: color.map((v) => v * 0.92) });
      decor(x - hx + 0.28, y0 + 2.6, z + hz - 2.0, x - 0.4, y0 + 3.4, z + hz + 0.01, 'glass');
      decor(x - 0.2, y0 + 1.6, z + hz - 2.2, x + hx - 0.3, y0 + 2.2, z + hz, 'dark');
    }
  }
  function excavator(x, z) {
    for (const s of [-1, 1]) solid(x - 2.6, 0, z + s * 1.4 - 0.5, x + 2.6, 1.0, z + s * 1.4 + 0.5, 'rubber');
    solid(x - 2.0, 1.0, z - 1.6, x + 2.0, 2.4, z + 1.6, 'paint', { color: YEL });
    solid(x - 2.0, 2.4, z - 1.6, x - 0.4, 3.6, z - 0.2, 'paint', { color: YEL.map((v) => v * 0.95) });
    decor(x - 1.98, 2.7, z - 1.62, x - 0.42, 3.4, z - 0.18, 'glass');
    decor(x + 0.2, 2.4, z - 1.2, x + 1.9, 2.9, z + 1.4, 'dark');
    const bm = new THREE.MeshStandardMaterial({ color: 0xd8a21c, roughness: 0.6, metalness: 0.3 });
    ctx.disposables.push(bm);
    ctx.beam([x + 1.4, 2.6, z + 0.6], [x + 5.2, 5.6, z + 0.6], 0.6, null, { mat: bm });
    ctx.beam([x + 5.2, 5.6, z + 0.6], [x + 6.8, 1.2, z + 0.6], 0.45, null, { mat: bm });
    solid(x + 6.0, 0, z - 0.4, x + 7.6, 1.2, z + 1.6, 'dark');
  }
  function pickup4x4(x, z, alongX, color) {
    const hx = alongX ? 2.6 : 1.0, hz = alongX ? 1.0 : 2.6;
    solid(x - hx, 0.35, z - hz, x + hx, 1.2, z + hz, 'paint', { color });
    world.add(x - hx + 0.2, 0, z - hz + 0.2, x + hx - 0.2, 0.35, z + hz - 0.2, { shoot: false });
    const c0 = alongX ? [x - 0.6, z - hz + 0.1, x + 1.2, z + hz - 0.1] : [x - hx + 0.1, z - 1.2, x + hx - 0.1, z + 0.6];
    solid(c0[0], 1.2, c0[1], c0[2], 1.9, c0[3], 'paint', { color: color.map((v) => v * 0.92) });
    decor(c0[0] - 0.01, 1.3, c0[1] - 0.01, c0[2] + 0.01, 1.8, c0[3] + 0.01, 'glass');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wx = alongX ? x + sx * 1.7 : x + sx * (hx - 0.1), wz = alongX ? z + sz * (hz - 0.1) : z + sz * 1.7;
      decor(wx - (alongX ? 0.38 : 0.15), 0, wz - (alongX ? 0.15 : 0.38), wx + (alongX ? 0.38 : 0.15), 0.76, wz + (alongX ? 0.15 : 0.38), 'rubber');
    }
  }
  function floodlight(x, z, y) {
    solid(x - 0.12, y, z - 0.12, x + 0.12, y + 7, z + 0.12, 'steel');
    decor(x - 1.0, y + 7, z - 0.1, x + 1.0, y + 7.15, z + 0.1, 'steel');
    for (const dx of [-0.7, 0, 0.7]) { decor(x + dx - 0.25, y + 7.15, z - 0.2, x + dx + 0.25, y + 7.6, z + 0.2, 'dark'); decor(x + dx - 0.2, y + 7.2, z - 0.21, x + dx + 0.2, y + 7.55, z - 0.2, 'lampCold'); }
  }

  const spawns = [
    [-44, 0, -16, 0.5], [-44, 0, 16, 2.6], [44, 0, -16, -0.5], [44, 0, 16, -2.6],
    [-20, 0, -4, -1.57], [24, 0, 14, 2.4], [-8, 0, 15, 3.14], [3, 0, -14, 0],
    [-44, 3.5, -21, 0], [-2, 3.5, -21, 0], [30, 3.5, -22, 0], [44, 3.5, -27, 0.6],
    [-40, 3.5, 23, 3.14], [-8, 3.5, 22, 3.14], [26, 3.5, 22, 3.14], [42, 3.5, 32, 2.6],
    [-30, 7, -33, 0], [22, 7, -33, 0], [-36, 3.5, 32, 3.14], [4, 3.5, 33, 3.14],
  ].map(([x, y, z, yaw]) => ({ x, y, z, yaw }));

  const pickups = [
    { id: 0, type: 'hp', x: 9.5, y: 3.5, z: 0 },
    { id: 1, type: 'hp', x: -1, y: 7, z: -33.5 },
    { id: 2, type: 'hp', x: 36, y: 4.0, z: 7 },
    { id: 3, type: 'hp', x: 17, y: 6.7, z: 27 },
    { id: 4, type: 'hp', x: -36, y: 0, z: 3.5 },
    { id: 5, type: 'ammo', x: 6, y: 0, z: 4 },
    { id: 6, type: 'ammo', x: -20, y: 3.5, z: -25 },
    { id: 7, type: 'ammo', x: 12, y: 3.5, z: -22 },
    { id: 8, type: 'ammo', x: -14, y: 3.5, z: 32 },
    { id: 9, type: 'ammo', x: 37, y: 0, z: 1 },
    { id: 10, type: 'ammo', x: -10, y: 0, z: -2 },
    { id: 11, type: 'nade', x: 26, y: 7, z: -33 },
    { id: 12, type: 'nade', x: -26, y: 0, z: 9 },
  ];

  return finishMap(ctx, def, { spawns, pickups });
}
