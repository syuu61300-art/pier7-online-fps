// 旧市街 (Old Town) — sunny afternoon in a walled old town. A plaza with a fountain in the
// middle, a town hall with a clock tower, multi-storey houses you can enter (two have roof
// access), narrow alleys and a market street. Short to mid range, lots of verticality.
import * as THREE from 'three';
import { createContext, finishMap, linColor } from './builder.js';

export const def = {
  id: 'oldtown',
  name: '旧市街',
  sub: '石畳の広場・午後',
  desc: '噴水の広場を囲む石造りの家々。窓と屋上からの撃ち合い、狭い路地の近距離戦。',
  size: '中',
  bounds: { minX: -44, maxX: 44, minZ: -34, maxZ: 34 },
  theme: {
    sky: { top: '#3a6fb2', mid: '#8fb7de', horizon: '#efe3cf', sun: '#fff2d6', ground: '#6b5f52', clouds: 0.6, sunDisc: 1 },
    sunDir: [0.45, 0.62, 0.38],
    sunColor: 0xfff0d6,
    sunIntensity: 3.3,
    hemi: [0xbcd4f0, 0x7a6a58, 1.1],
    fog: [0xc5d3df, 120, 600],
    ambience: { wind: 0.22, windFreq: 520, water: 0.035 },
    exposure: 1.0,
    preview: ['#8fb7de', '#d9b98f'],
  },
};

const PL = ['#d9c7a5', '#cfa98a', '#e2d6bf', '#b9c2a6', '#d8b49a', '#c9b9a3', '#e0c9a0', '#c4a58f'].map(linColor);

export function build(renderer, quality) {
  const B = def.bounds;
  const ctx = createContext({ renderer, quality, theme: def.theme, bounds: B, seed: 7 });
  const { world, geo, far, solid, decor, crate, barrel, M, T, rng, root } = ctx;

  ctx.ground('cobble', 3.2);

  // ---------------- town edge: tall facades all round (collide) ----------------
  // each side is split into houses of different height and colour with windows and shutters
  const facade = (axis, along0, along1, inner, outward, seedK) => {
    let a = along0, k = seedK;
    while (a < along1 - 0.01) {
      const w = Math.min(along1 - a, 7 + ((k * 37) % 6));
      const h = 9.5 + ((k * 53) % 4) * 1.1;
      const col = PL[k % PL.length];
      const t0 = inner, t1 = inner + outward * 3;
      if (axis === 'x') solid(a, 0, Math.min(t0, t1), a + w, h, Math.max(t0, t1), 'plaster', { scale: [3, 3], color: col });
      else solid(Math.min(t0, t1), 0, a, Math.max(t0, t1), h, a + w, 'plaster', { scale: [3, 3], color: col });
      // roof cap
      const c0 = inner - outward * 0.25, c1 = inner + outward * 3;
      if (axis === 'x') decor(a - 0.05, h, Math.min(c0, c1), a + w + 0.05, h + 0.35, Math.max(c0, c1), 'roof', { color: linColor('#a9573b') });
      else decor(Math.min(c0, c1), h, a - 0.05, Math.max(c0, c1), h + 0.35, a + w + 0.05, 'roof', { color: linColor('#a9573b') });
      // windows (two upper floors) and a door on the ground floor
      const f = inner - outward * 0.04, g = inner - outward * 0.1;
      for (let x = a + 1.3; x < a + w - 1.0; x += 2.4) {
        for (const y of [3.6, 6.7]) {
          if (axis === 'x') {
            decor(x, y, Math.min(f, inner), x + 1.0, y + 1.4, Math.max(f, inner), 'glass');
            decor(x - 0.45, y - 0.05, Math.min(g, inner), x - 0.05, y + 1.45, Math.max(g, inner), 'wood', { color: [0.35, 0.5, 0.42] });
            decor(x + 1.05, y - 0.05, Math.min(g, inner), x + 1.45, y + 1.45, Math.max(g, inner), 'wood', { color: [0.35, 0.5, 0.42] });
            decor(x - 0.1, y - 0.12, Math.min(g, inner), x + 1.1, y, Math.max(g, inner), 'concrete');
          } else {
            decor(Math.min(f, inner), y, x, Math.max(f, inner), y + 1.4, x + 1.0, 'glass');
            decor(Math.min(g, inner), y - 0.05, x - 0.45, Math.max(g, inner), y + 1.45, x - 0.05, 'wood', { color: [0.35, 0.5, 0.42] });
            decor(Math.min(g, inner), y - 0.05, x + 1.05, Math.max(g, inner), y + 1.45, x + 1.45, 'wood', { color: [0.35, 0.5, 0.42] });
            decor(Math.min(g, inner), y - 0.12, x - 0.1, Math.max(g, inner), y, x + 1.1, 'concrete');
          }
        }
      }
      const dx = a + w * 0.5 - 0.6;
      if (axis === 'x') decor(dx, 0, Math.min(f, inner), dx + 1.2, 2.3, Math.max(f, inner), 'wood', { color: [0.55, 0.4, 0.3] });
      else decor(Math.min(f, inner), 0, dx, Math.max(f, inner), 2.3, dx + 1.2, 'wood', { color: [0.55, 0.4, 0.3] });
      a += w; k++;
    }
  };
  facade('x', B.minX - 3, B.maxX + 3, B.minZ, -1, 1);
  facade('x', B.minX - 3, B.maxX + 3, B.maxZ, 1, 4);
  facade('z', B.minZ, B.maxZ, B.minX, -1, 2);
  facade('z', B.minZ, B.maxZ, B.maxX, 1, 6);

  // far hills and rooftops beyond the walls
  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2, r = 95 + rng() * 40;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r * 0.85;
    const w = 12 + rng() * 14, h = 8 + rng() * 10;
    far.box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, 'plaster', { scale: [4, 4], color: PL[i % PL.length].map((v) => v * 0.92) });
    far.box(x - w / 2 - 0.3, h, z - w / 2 - 0.3, x + w / 2 + 0.3, h + 0.6, z + w / 2 + 0.3, 'roof', { color: linColor('#9c5238') });
  }
  far.box(-700, -2, -700, 700, 0.2, -170, 'land', { color: linColor('#5d6a4a') });
  far.box(-700, -2, 170, 700, 0.2, 700, 'land', { color: linColor('#5d6a4a') });

  // ---------------- town hall with clock tower (north of the plaza) ----------------
  const hallCol = linColor('#e3d5b8');
  ctx.building({
    x0: -9, x1: 9, z0: -28, z1: -14, floors: 2, fh: 4.0, t: 0.35, mat: 'plaster', color: hallCol, scale: [3, 3],
    doors: [{ side: 's', a: 0.5, w: 2.4, h: 3.2 }, { side: 'w', a: -20.5 }, { side: 'e', a: -15.5 }, { side: 'n', a: -4.5 }],
    windows: [
      { side: 's', a: -6.5, floor: 0, h: 1.6 }, { side: 's', a: 6.5, floor: 0, h: 1.6 },
      { side: 's', a: -6.5, floor: 1 }, { side: 's', a: -3.5, floor: 1 }, { side: 's', a: 3.5, floor: 1 }, { side: 's', a: 6.5, floor: 1 },
      { side: 'w', a: -24.5, floor: 1 }, { side: 'w', a: -17.5, floor: 1 }, { side: 'e', a: -24.5, floor: 1 }, { side: 'e', a: -20.5, floor: 1 },
      { side: 'n', a: 3.5, floor: 1 }, { side: 'n', a: -1.5, floor: 1 },
    ],
    stairs: [{ x0: 6.9, x1: 8.65, z0: -25, z1: -17.4, dir: '-z', floor: 0 }],
    floorMat: 'floortile', slabMat: 'concrete', roofTop: 'roof', capMat: 'concrete', parapet: 0.9,
  });
  // portico and steps
  for (const x of [-2.2, 3.2]) solid(x - 0.3, 0, -13.9, x + 0.3, 4.0, -13.3, 'concrete', { scale: [1, 2] });
  decor(-2.8, 4.0, -14, 3.8, 4.35, -13.1, 'concrete', { scale: [2, 2] });
  ctx.sign(0.5, 4.75, -13.97, 4.2, 0.55, ['MUNICIPIO'], 'z', '#2d3b47', '#efe6cf');
  // tower above the roof
  solid(-3, 8, -28, 3, 19, -22, 'brick', { scale: [2.5, 2.5], color: linColor('#c9a689') });
  decor(-3.2, 18.6, -28.2, 3.2, 19.2, -21.8, 'concrete');
  for (const [x, z] of [[-1.6, -22], [1.6, -22]]) decor(x - 0.55, 15.2, z - 0.05, x + 0.55, 17.6, z + 0.05, 'dark');
  {
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9c4f36, roughness: 0.8 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.6 });
    ctx.disposables.push(roofMat, faceMat);
    ctx.mesh(new THREE.ConeGeometry(4.6, 5, 4), roofMat, [0, 21.7, -25], { rot: [0, Math.PI / 4, 0] });
    ctx.mesh(new THREE.CircleGeometry(1.5, 28), faceMat, [0, 12.6, -21.96], { shadow: false });
    decor(-0.06, 12.6, -21.94, 0.06, 13.8, -21.9, 'dark');  // minute hand (12)
    decor(0, 12.54, -21.93, 0.9, 12.66, -21.89, 'dark');    // hour hand (3)
  }
  // inside: benches as cover, gallery crates
  for (const z of [-24, -21, -18]) { solid(-6.5, 0, z - 0.3, -1.5, 0.75, z + 0.3, 'wood', { color: [0.6, 0.45, 0.32] }); solid(1.5, 0, z - 0.3, 5.6, 0.75, z + 0.3, 'wood', { color: [0.6, 0.45, 0.32] }); }
  crate(-6.8, -26.5, 4.0, 1.2); crate(-5.5, -26.7, 4.0, 1.0); crate(3.5, -16, 4.0, 1.2);
  solid(-3.5, 4.0, -21.5, -1.0, 4.85, -20.6, 'wood', { color: [0.5, 0.36, 0.26] });

  // ---------------- west houses ----------------
  // W1: three floors + roof access
  ctx.building({
    x0: -40, x1: -22, z0: -30, z1: -18, floors: 3, fh: 3.2, mat: 'plaster', color: PL[0],
    doors: [{ side: 'e', a: -24.5 }, { side: 's', a: -30.5 }, { side: 'w', a: -21.5 }],
    autoWindows: { sides: ['e', 's', 'n', 'w'], every: 3.2, from: 0 },
    stairs: [
      { x0: -36, x1: -29.6, z0: -29.7, z1: -27.9, dir: '+x', floor: 0 },
      { x0: -32.4, x1: -26, z0: -20.1, z1: -18.3, dir: '-x', floor: 1 },
      { x0: -36, x1: -29.6, z0: -29.7, z1: -27.9, dir: '+x', floor: 2 },
    ],
    floorMat: 'wood', roofTop: 'concrete', capMat: 'roof',
  });
  crate(-25, -27, 0, 1.2); crate(-38, -20, 0, 1.0);
  solid(-34, 3.2, -24.5, -31.5, 4.0, -23.3, 'wood', { color: [0.5, 0.36, 0.26] });
  crate(-25, -27.5, 6.4, 1.1); crate(-38.5, -21, 6.4, 1.0);
  // roof cover
  solid(-27, 9.6, -25, -25, 11.2, -22.8, 'blocks', { scale: [2, 2] });
  decor(-38, 9.6, -24.5, -36, 10.8, -22.5, 'paint', { color: linColor('#9aa1a6') });
  solid(-38, 9.6, -24.5, -36, 10.8, -22.5, null);

  // W2: shop house, two floors, open front to the street
  ctx.building({
    x0: -40, x1: -22, z0: -12, z1: 2, floors: 2, fh: 3.4, mat: 'plaster', color: PL[1],
    doors: [{ side: 'e', a: -8.5, w: 2.2, h: 2.6 }, { side: 'e', a: -2.5, w: 2.2, h: 2.6 }, { side: 'w', a: -5.5 }, { side: 'n', a: -27.5 }],
    autoWindows: { sides: ['e', 'n', 's', 'w'], every: 3.0, from: 1 },
    windows: [{ side: 's', a: -36.5, floor: 0 }, { side: 's', a: -27.5, floor: 0 }],
    stairs: [{ x0: -38, x1: -31.6, z0: -11.7, z1: -9.9, dir: '+x', floor: 0 }],
    floorMat: 'floortile', roofTop: 'roof', capMat: 'concrete', parapet: 0.6,
  });
  solid(-30, 0, -7, -25.5, 1.0, -6.2, 'wood', { color: [0.55, 0.4, 0.28] });       // shop counter
  solid(-36, 0, -3, -35.2, 2.2, 1.2, 'wood', { color: [0.45, 0.33, 0.24] });       // shelf
  crate(-37.5, -6, 0, 1.2); crate(-28, -1, 0, 1.0); crate(-33, -6.5, 3.4, 1.2); crate(-26, -1, 3.4, 1.0);
  // awning over the shop front
  awning(-21.9, -10, -21.9, 0, 1.6, 2.7, '#b33a2e');

  // W3: two floors + roof access
  ctx.building({
    x0: -40, x1: -22, z0: 8, z1: 20, floors: 2, fh: 3.2, mat: 'plaster', color: PL[3],
    doors: [{ side: 'e', a: 11.5 }, { side: 'n', a: -30.5 }, { side: 's', a: -36.5 }],
    autoWindows: { sides: ['e', 'n', 's', 'w'], every: 3.2, from: 0 },
    stairs: [
      { x0: -32.4, x1: -26, z0: 17.9, z1: 19.7, dir: '-x', floor: 0 },
      { x0: -36, x1: -29.6, z0: 8.3, z1: 10.1, dir: '+x', floor: 1 },
    ],
    floorMat: 'wood', roofTop: 'concrete', capMat: 'roof',
  });
  crate(-37, 15, 0, 1.2); crate(-24.5, 9.5, 0, 1.0); crate(-37.5, 17.5, 3.2, 1.0);
  solid(-30, 0, 13, -27, 0.8, 14.4, 'wood', { color: [0.55, 0.4, 0.28] });
  solid(-36, 6.4, 14, -34, 7.6, 16, 'blocks', { scale: [2, 2] });
  decor(-26, 6.4, 15, -24.2, 7.4, 17, 'paint', { color: linColor('#9aa1a6') });
  solid(-26, 6.4, 15, -24.2, 7.4, 17, null);

  // ---------------- east houses ----------------
  // E1: hotel, three floors + roof
  ctx.building({
    x0: 22, x1: 40, z0: -30, z1: -18, floors: 3, fh: 3.2, mat: 'plaster', color: PL[4],
    doors: [{ side: 'w', a: -23.5, w: 2.0, h: 2.6 }, { side: 's', a: 31.5 }, { side: 'n', a: 35.5 }],
    autoWindows: { sides: ['w', 's', 'n', 'e'], every: 3.2, from: 0 },
    stairs: [
      { x0: 26, x1: 32.4, z0: -29.7, z1: -27.9, dir: '+x', floor: 0 },
      { x0: 29.6, x1: 36, z0: -20.1, z1: -18.3, dir: '-x', floor: 1 },
      { x0: 26, x1: 32.4, z0: -29.7, z1: -27.9, dir: '+x', floor: 2 },
    ],
    floorMat: 'floortile', roofTop: 'concrete', capMat: 'roof',
  });
  ctx.sign(21.94, 2.95, -23.5, 3.4, 0.6, ['HOTEL SOLE'], '-x', '#5a2a22', '#f3e3c4');
  solid(25, 0, -26, 27.5, 1.05, -25.2, 'wood', { color: [0.5, 0.36, 0.26] });   // reception desk
  crate(37, -21, 0, 1.2); crate(37.5, -27, 3.2, 1.0); crate(24.5, -26, 6.4, 1.1);
  solid(34, 9.6, -26, 36.2, 11.0, -23.8, 'blocks', { scale: [2, 2] });
  decor(25, 9.6, -21.5, 27, 10.6, -19.5, 'paint', { color: linColor('#9aa1a6') });
  solid(25, 9.6, -21.5, 27, 10.6, -19.5, null);

  // E2: market hall — one tall open floor with arches on both long sides
  ctx.building({
    x0: 22, x1: 40, z0: -12, z1: 2, floors: 1, fh: 5.5, mat: 'brick', color: linColor('#caa58a'), scale: [2.5, 2.5],
    doors: [{ side: 'w', a: -8.5, w: 3.0, h: 3.6 }, { side: 'w', a: -1.5, w: 3.0, h: 3.6 }, { side: 'e', a: -5.5, w: 2.4, h: 3.0 }, { side: 'n', a: 31.5, w: 2.4, h: 3.0 }, { side: 's', a: 27.5 }],
    windows: [{ side: 'w', a: -5, floor: 0, sill: 3.2, h: 1.4, w: 2.0 }, { side: 's', a: 35.5, floor: 0, sill: 1.2 }, { side: 'n', a: 25.5, floor: 0, sill: 1.2 }],
    floorMat: 'floortile', parapet: 0.6, capMat: 'concrete',
  });
  for (const [x0, z0, x1, z1] of [[25, -9, 29, -7.8], [25, -3, 29, -1.8], [32, -9, 36, -7.8], [32, -3, 36, -1.8]]) {
    solid(x0, 0, z0, x1, 0.95, z1, 'wood', { color: [0.55, 0.42, 0.3] });
    decor(x0 + 0.2, 0.95, z0 + 0.15, x1 - 0.2, 1.15, z1 - 0.15, 'crate', { uv: 'face', color: [0.9, 0.62, 0.3] });
  }
  barrel(24.5, -10.6); barrel(25.2, -10.0, 0, '#6b4a2f'); crate(38, -10, 0, 1.2); crate(24, 0, 0, 1.0);
  ctx.pointLight([30.5, 4.6, -5], 0xffd9a8, 30, 18);

  // E3: two floors
  ctx.building({
    x0: 22, x1: 40, z0: 8, z1: 20, floors: 2, fh: 3.4, mat: 'plaster', color: PL[6],
    doors: [{ side: 'w', a: 10.5 }, { side: 's', a: 29.5 }, { side: 'e', a: 14.5 }],
    autoWindows: { sides: ['w', 's', 'n', 'e'], every: 3.2, from: 0 },
    stairs: [{ x0: 25.6, x1: 32, z0: 8.3, z1: 10.1, dir: '-x', floor: 0 }],
    floorMat: 'wood', roofTop: 'roof', capMat: 'concrete', parapet: 0.6,
  });
  crate(37, 12, 0, 1.2); crate(35.8, 17.5, 0, 1.0); crate(24, 16.5, 3.4, 1.2); crate(37.5, 11, 3.4, 1.0);
  solid(30, 0, 14, 33, 0.8, 15.2, 'wood', { color: [0.55, 0.4, 0.28] });
  awning(21.9, 12.5, 21.9, 18.5, -1.6, 2.7, '#2f6d8f');

  // ---------------- south row (narrow houses) ----------------
  ctx.building({
    x0: -36, x1: -16, z0: 25, z1: 30, floors: 2, fh: 3.2, mat: 'plaster', color: PL[2],
    doors: [{ side: 'n', a: -30.5 }, { side: 'n', a: -20.5 }, { side: 's', a: -33.5 }],
    autoWindows: { sides: ['n', 's'], every: 3.0, from: 1 },
    windows: [{ side: 'n', a: -34.5, floor: 0 }, { side: 'n', a: -25.5, floor: 0 }],
    stairs: [{ x0: -27.4, x1: -21, z0: 28.0, z1: 29.7, dir: '-x', floor: 0 }],
    floorMat: 'wood', capMat: 'roof',
  });
  ctx.building({
    x0: -9, x1: 9, z0: 25, z1: 30, floors: 1, fh: 4.0, mat: 'brick', color: linColor('#b98f74'), scale: [2.5, 2.5],
    doors: [{ side: 'n', a: -5.5, w: 2.0 }, { side: 'n', a: 5.5, w: 2.0 }, { side: 's', a: 0.5, w: 2.0 }],
    windows: [{ side: 'n', a: 0.5, floor: 0, w: 2.4 }],
    floorMat: 'floortile', capMat: 'concrete', parapet: 0.7,
  });
  ctx.sign(0.5, 3.5, 24.97, 4.6, 0.6, ['PANETTERIA'], '-z', '#7a3b26', '#fbe9c6');
  crate(-2.5, 27.5, 0, 1.0); solid(2, 0, 26.2, 6, 1.0, 27, 'wood', { color: [0.55, 0.4, 0.28] });
  ctx.building({
    x0: 16, x1: 36, z0: 25, z1: 30, floors: 2, fh: 3.2, mat: 'plaster', color: PL[5],
    doors: [{ side: 'n', a: 20.5 }, { side: 'n', a: 31.5 }, { side: 's', a: 33.5 }],
    autoWindows: { sides: ['n', 's'], every: 3.0, from: 1 },
    windows: [{ side: 'n', a: 25.5, floor: 0 }],
    stairs: [{ x0: 22, x1: 28.4, z0: 28.0, z1: 29.7, dir: '+x', floor: 0 }],
    floorMat: 'wood', capMat: 'roof',
  });
  crate(33.5, 27, 0, 1.0); crate(18, 26.8, 3.2, 1.0);

  // ---------------- plaza: fountain, stalls, benches, planters ----------------
  {
    const stone = new THREE.MeshStandardMaterial({ map: T.concrete, color: 0xd9d2c3, roughness: 0.85 });
    const waterM = new THREE.MeshStandardMaterial({ color: 0x4b8aa0, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.4, transparent: true, opacity: 0.85 });
    ctx.disposables.push(stone, waterM);
    ctx.mesh(new THREE.CylinderGeometry(3.1, 3.25, 0.65, 40, 1, true), stone, [0, 0.325, 1]);
    ctx.mesh(new THREE.TorusGeometry(3.15, 0.18, 8, 40), stone, [0, 0.65, 1], { rot: [Math.PI / 2, 0, 0] });
    ctx.mesh(new THREE.CircleGeometry(3.0, 40), waterM, [0, 0.45, 1], { rot: [-Math.PI / 2, 0, 0], shadow: false });
    ctx.mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 16), stone, [0, 1.2, 1]);
    ctx.mesh(new THREE.CylinderGeometry(1.2, 0.3, 0.45, 24), stone, [0, 2.45, 1]);
    ctx.mesh(new THREE.SphereGeometry(0.32, 14, 10), stone, [0, 2.95, 1]);
    // collision: rough octagon + column
    solid(-2.25, 0, -1.25, 2.25, 0.75, 3.25, null);
    solid(-3.15, 0, -0.2, 3.15, 0.75, 2.2, null);
    solid(-1.2, 0, -2.15, 1.2, 0.75, 4.15, null);
    solid(-0.5, 0, 0.5, 0.5, 3.1, 1.5, null);
  }
  // paving ring around the fountain
  decor(-13, 0, -10, 13, 0.01, 12, 'floortile', { scale: [2.5, 2.5], skip: 0b111011, color: [0.92, 0.88, 0.8] });
  stall(-9.5, -5.5, '#c0392b', true); stall(-9.5, 6.5, '#2e7d5b', true); stall(9.5, -5.5, '#d8a12a', false); stall(9.5, 6.5, '#2f5f9a', false);
  for (const [x, z, along] of [[-4.5, -7.5, true], [5.5, -7.5, true], [-4.5, 9.5, true], [5.5, 9.5, true]]) bench(x, z, along);
  for (const [x, z] of [[-12, -8.5], [12, -8.5], [-12, 10.5], [12, 10.5]]) planter(x, z);
  // little parked car on the market street
  car(-6, 17.5, true, '#8a2d24'); car(16, 22.2, true, '#3c6e8f');
  // market street cover
  crate(-14, 21, 0, 1.2); crate(-12.7, 21.4, 0, 1.0); crate(-13.6, 21.1, 1.2, 0.9);
  barrel(12.5, 15); barrel(13.2, 15.6, 0, '#6b4a2f');
  crate(3, 21.8, 0, 1.2); cart(-18.5, 13, false);
  // west & east streets
  cart(-17, -3, true); crate(-16.5, -14.5, 0, 1.2); crate(-15.3, -14.9, 0, 1.0); barrel(-19.5, 4.5); barrel(-20.1, 5.2, 0, '#6b4a2f');
  cart(17.5, 3.5, true); crate(17, -14.8, 0, 1.2); crate(18.2, -15.2, 0, 1.0); barrel(19.8, -9); crate(15, 20.8, 0, 1.0);
  // north alley & side streets
  crate(-14.5, -31.5, 0, 1.2); crate(-13.2, -31.8, 0, 1.0); barrel(13, -31.5); crate(14.4, -31.8, 0, 1.1);
  crate(-42, -24, 0, 1.2); crate(-42.2, -2, 0, 1.0); barrel(-42.2, 14);
  crate(42, -24, 0, 1.2); crate(42.1, -3, 0, 1.0); barrel(42.2, 13);
  crate(-12, -18, 0, 1.0); crate(12, -19, 0, 1.0);
  // south back alley
  crate(-10.5, 32, 0, 1.2); crate(10.5, 32.2, 0, 1.1); barrel(-38.5, 32); barrel(38.5, 31.8);
  // arches over the alleys between west/east houses (decor only, high enough to walk under)
  for (const [x0, x1, z0, z1] of [[-40, -22, -18, -17.6], [-40, -22, 2, 2.4], [22, 40, -18, -17.6], [22, 40, 2, 2.4]]) {
    const xm = (x0 + x1) / 2;
    decor(xm - 1.0, 5.2, z0 - 0.0, xm + 1.0, 6.0, z0 + 6, 'brick', { color: linColor('#c9a689'), scale: [2.5, 2.5] });
  }
  // lanterns on brackets
  for (const [x, z, dx, dz] of [[-21.95, -21, 1, 0], [21.95, -21, -1, 0], [-21.95, -11, 1, 0], [21.95, -11, -1, 0], [-21.95, 15, 1, 0], [21.95, 19, -1, 0], [-7.8, 24.95, 0, -1], [-9.05, -17, -1, 0], [9.05, -19, 1, 0]]) lantern(x, z, dx, dz);
  for (const [x, z] of [[-13.5, -10.5], [13.5, -10.5], [-13.5, 12.5], [13.5, 12.5]]) postLamp(x, z);
  // wall-mounted flower boxes for colour
  for (let x = -38; x < -24; x += 3.2) decor(x, 4.2, -18.0, x + 1.2, 4.45, -17.75, 'wood', { color: [0.5, 0.3, 0.2] });

  // ---------------- local helpers ----------------
  function awning(x0, z0, x1, z1, depth, y, color) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mat = M.awning.clone(); mat.vertexColors = false; mat.color.set(color);
    ctx.disposables.push(mat);
    const along = z0 === z1 ? 'x' : 'z';
    const geo = new THREE.PlaneGeometry(len, Math.abs(depth) * 1.05);
    const m = ctx.mesh(geo, mat, [0, 0, 0]);
    if (along === 'z') {
      m.position.set(x0 + depth / 2, y - 0.25, (z0 + z1) / 2);
      m.rotation.set(0, depth > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      m.rotateX(-Math.PI / 2 + 0.32);
    } else {
      m.position.set((x0 + x1) / 2, y - 0.25, z0 + depth / 2);
      m.rotation.set(0, depth > 0 ? 0 : Math.PI, 0);
      m.rotateX(-Math.PI / 2 + 0.32);
    }
  }
  function stall(cx, cz, color, west) {
    // counter (cover), four posts and a striped roof
    solid(cx - 1.6, 0, cz - 0.4, cx + 1.6, 1.0, cz + 0.4, 'wood', { color: [0.58, 0.43, 0.3] });
    decor(cx - 1.5, 1.0, cz - 0.35, cx + 1.5, 1.2, cz + 0.35, 'crate', { uv: 'face', color: west ? [0.95, 0.5, 0.3] : [0.6, 0.85, 0.35] });
    for (const [px, pz] of [[-1.6, -1.3], [1.6, -1.3], [-1.6, 1.3], [1.6, 1.3]]) decor(cx + px - 0.05, 0, cz + pz - 0.05, cx + px + 0.05, 2.5, cz + pz + 0.05, 'wood', { color: [0.4, 0.3, 0.22] });
    const mat = M.awning.clone(); mat.vertexColors = false; mat.color.set(color);
    ctx.disposables.push(mat);
    const m = ctx.mesh(new THREE.PlaneGeometry(3.6, 3.0), mat, [cx, 2.65, cz], { rot: [-Math.PI / 2, 0, 0] });
    m.rotation.x = -Math.PI / 2 + (west ? 0.12 : -0.12);
    crate(cx + (west ? -0.9 : 0.9), cz + 1.0, 0, 0.8);
  }
  function bench(x, z, alongX) {
    const hx = alongX ? 1.0 : 0.25, hz = alongX ? 0.25 : 1.0;
    solid(x - hx, 0, z - hz, x + hx, 0.45, z + hz, 'wood', { color: [0.55, 0.4, 0.28] });
    if (alongX) decor(x - hx, 0.45, z + hz - 0.08, x + hx, 0.95, z + hz, 'wood', { color: [0.5, 0.36, 0.25] });
    else decor(x + hx - 0.08, 0.45, z - hz, x + hx, 0.95, z + hz, 'wood', { color: [0.5, 0.36, 0.25] });
  }
  function planter(x, z) {
    solid(x - 0.9, 0, z - 0.9, x + 0.9, 0.85, z + 0.9, 'brick', { color: linColor('#b88a6a'), scale: [2, 2] });
    decor(x - 0.75, 0.85, z - 0.75, x + 0.75, 1.4, z + 0.75, 'paint', { color: linColor('#4f7a3a') });
  }
  function cart(x, z, alongX) {
    const hx = alongX ? 1.3 : 0.75, hz = alongX ? 0.75 : 1.3;
    solid(x - hx, 0.35, z - hz, x + hx, 1.2, z + hz, 'wood', { color: [0.6, 0.45, 0.3] });
    world.add(x - hx + 0.1, 0, z - hz + 0.1, x + hx - 0.1, 0.35, z + hz - 0.1, { shoot: false });
    for (const s of [-1, 1]) {
      if (alongX) decor(x - 0.4, 0, z + s * (hz + 0.02) - 0.04, x + 0.4, 0.8, z + s * (hz + 0.02) + 0.04, 'dark');
      else decor(x + s * (hx + 0.02) - 0.04, 0, z - 0.4, x + s * (hx + 0.02) + 0.04, 0.8, z + 0.4, 'dark');
    }
    decor(x - hx * 0.7, 1.2, z - hz * 0.7, x + hx * 0.7, 1.45, z + hz * 0.7, 'crate', { uv: 'face', color: [0.8, 0.7, 0.45] });
  }
  function car(x, z, alongX, color) {
    const c = linColor(color);
    const hx = alongX ? 1.75 : 0.8, hz = alongX ? 0.8 : 1.75;
    solid(x - hx, 0.25, z - hz, x + hx, 1.0, z + hz, 'paint', { color: c });
    world.add(x - hx + 0.2, 0, z - hz + 0.1, x + hx - 0.2, 0.25, z + hz - 0.1, { shoot: false });
    const cx0 = alongX ? x - 0.9 : x - hx + 0.12, cx1 = alongX ? x + 0.6 : x + hx - 0.12;
    const cz0 = alongX ? z - hz + 0.12 : z - 0.9, cz1 = alongX ? z + hz - 0.12 : z + 0.6;
    solid(cx0, 1.0, cz0, cx1, 1.55, cz1, 'paint', { color: c.map((v) => v * 0.9) });
    decor(cx0 + 0.05, 1.05, cz0 - 0.01, cx1 - 0.05, 1.5, cz1 + 0.01, 'glass');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wx = alongX ? x + sx * 1.15 : x + sx * (hx - 0.05), wz = alongX ? z + sz * (hz - 0.05) : z + sz * 1.15;
      decor(wx - 0.3, 0, wz - 0.12, wx + 0.3, 0.6, wz + 0.12, 'rubber');
    }
  }
  function postLamp(x, z) {
    solid(x - 0.1, 0, z - 0.1, x + 0.1, 3.6, z + 0.1, 'dark');
    decor(x - 0.22, 0, z - 0.22, x + 0.22, 0.4, z + 0.22, 'dark');
    decor(x - 0.2, 3.6, z - 0.2, x + 0.2, 4.1, z + 0.2, 'glass');
    decor(x - 0.26, 4.1, z - 0.26, x + 0.26, 4.2, z + 0.26, 'dark');
  }
  function lantern(x, z, dx, dz) {
    const y = 3.4;
    decor(Math.min(x, x + dx * 0.6) - 0.03, y + 0.5, Math.min(z, z + dz * 0.6) - 0.03, Math.max(x, x + dx * 0.6) + 0.03, y + 0.56, Math.max(z, z + dz * 0.6) + 0.03, 'dark');
    const lx = x + dx * 0.6, lz = z + dz * 0.6;
    decor(lx - 0.16, y - 0.1, lz - 0.16, lx + 0.16, y + 0.4, lz + 0.16, 'glass');
    decor(lx - 0.2, y + 0.4, lz - 0.2, lx + 0.2, y + 0.5, lz + 0.2, 'dark');
    decor(lx - 0.18, y - 0.16, lz - 0.18, lx + 0.18, y - 0.1, lz + 0.18, 'dark');
  }

  const spawns = [
    [-42, 0, -32, 0.8], [-17, 0, -31.5, 0], [17, 0, -31.5, 0], [42, 0, -32, -0.8],
    [-42, 0, -10, -1.57], [-42, 0, 22, -1.57], [42, 0, -10, 1.57], [42, 0, 22, 1.57],
    [-17.5, 0, -16, -1.57], [17.5, 0, -16, 1.57], [-17.5, 0, 22.5, -2.2], [17.5, 0, 18, 2.2],
    [-30, 0, 5, -1.57], [30, 0, 5, 1.57], [-30, 0, -15, -1.57], [30, 0, -15, 1.57],
    [-25, 0, 32.2, 3.14], [25, 0, 32.2, 3.14], [0, 0, 32.2, 3.14], [0, 0, -31.5, 0],
    [-11, 0, 0.5, -1.57], [11, 0, 0.5, 1.57],
  ].map(([x, y, z, yaw]) => ({ x, y, z, yaw }));

  const pickups = [
    { id: 0, type: 'hp', x: 0.5, y: 0, z: -11.2 },
    { id: 1, type: 'hp', x: -31, y: 9.6, z: -24 },
    { id: 2, type: 'hp', x: 30.5, y: 0, z: -5.4 },
    { id: 3, type: 'hp', x: 0.5, y: 0, z: 22.5 },
    { id: 4, type: 'hp', x: -30, y: 3.2, z: 14 },
    { id: 5, type: 'ammo', x: -2, y: 4.0, z: -24.5 },
    { id: 6, type: 'ammo', x: -27, y: 0, z: -4 },
    { id: 7, type: 'ammo', x: 30, y: 9.6, z: -22 },
    { id: 8, type: 'ammo', x: 30, y: 3.4, z: 13 },
    { id: 9, type: 'ammo', x: -42, y: 0, z: 5 },
    { id: 10, type: 'ammo', x: 42, y: 0, z: 5 },
    { id: 11, type: 'nade', x: -17.5, y: 0, z: 9 },
    { id: 12, type: 'nade', x: 17.5, y: 0, z: -7 },
  ];

  return finishMap(ctx, def, { spawns, pickups });
}
