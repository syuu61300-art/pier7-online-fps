// Shared map-building toolkit. Every solid box is both rendered and collided.
// A map module calls createContext(), places geometry with the helpers, then finishMap().
import * as THREE from 'three';
import { World } from '../physics.js';
import { makeTextures, makeSignTexture } from '../textures.js';
import { mulberry32 } from '../util.js';

// ---------- geometry builder: boxes with world-space UVs, batched per material ----------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: (x, y, z) => [-z, y] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: (x, y, z) => [z, y] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: (x, y, z) => [x, -z] },
  { n: [0, -1, 0], c: [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]], u: (x, y, z) => [-x, -z] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: (x, y, z) => [x, y] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: (x, y, z) => [-x, y] },
];
const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

export class GeoBuilder {
  constructor() { this.groups = new Map(); }
  _g(mat) {
    let g = this.groups.get(mat);
    if (!g) this.groups.set(mat, (g = { p: [], n: [], uv: [], c: [], i: [] }));
    return g;
  }
  box(x0, y0, z0, x1, y1, z1, mat, opt = {}) {
    const g = this._g(mat);
    const [su, sv] = opt.scale || [4, 4];
    const col = opt.color || [1, 1, 1];
    const skip = opt.skip || 0; // bitmask of faces to skip
    const X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const F = FACES[f];
      const base = g.p.length / 3;
      for (let k = 0; k < 4; k++) {
        const cc = F.c[k];
        const x = X[cc[0]], y = Y[cc[1]], z = Z[cc[2]];
        g.p.push(x, y, z);
        g.n.push(F.n[0], F.n[1], F.n[2]);
        if (opt.uv === 'face') g.uv.push(FACE_UV[k][0], FACE_UV[k][1]);
        else {
          const [u, v] = F.u(x + (opt.ox || 0), y + (opt.oy || 0), z + (opt.oz || 0));
          g.uv.push(u / su, v / sv);
        }
        g.c.push(col[0], col[1], col[2]);
      }
      g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  quadY(x0, z0, x1, z1, y, mat, opt = {}) {
    const g = this._g(mat);
    const [su, sv] = opt.scale || [4, 4];
    const col = opt.color || [1, 1, 1];
    const base = g.p.length / 3;
    const pts = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
    pts.forEach(([x, z], k) => {
      g.p.push(x, y, z); g.n.push(0, 1, 0);
      if (opt.uv === 'face') g.uv.push(FACE_UV[k][0], FACE_UV[k][1]);
      else g.uv.push(x / su, -z / sv);
      g.c.push(col[0], col[1], col[2]);
    });
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build(materials, parent, opts = {}) {
    const meshes = [];
    for (const [mat, g] of this.groups) {
      if (!materials[mat]) { console.warn('missing material', mat); continue; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
      geo.setIndex(g.i);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, materials[mat]);
      m.castShadow = opts.castShadow !== false && !materials[mat].userData.noShadow;
      m.receiveShadow = opts.receiveShadow !== false;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      meshes.push(m);
    }
    return meshes;
  }
}

export function linColor(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// ---------- shared textures & materials (built once) ----------
let SHARED = null;
function shared(renderer) {
  if (SHARED) return SHARED;
  const T = makeTextures(renderer);
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, envMapIntensity: 0.55 }, o));
  const M = {
    asphalt: std({ map: T.asphalt, roughness: 0.95, metalness: 0.0 }),
    concrete: std({ map: T.concrete, roughness: 0.9 }),
    wall: std({ map: T.wall, roughness: 0.92 }),
    container: std({ map: T.corrugated, roughness: 0.55, metalness: 0.35 }),
    siding: std({ map: T.siding, roughness: 0.7, metalness: 0.25 }),
    roof: std({ map: T.roof, roughness: 0.6, metalness: 0.4 }),
    crate: std({ map: T.crate, roughness: 0.85 }),
    tread: std({ map: T.tread, roughness: 0.45, metalness: 0.6 }),
    hazard: std({ map: T.hazard, roughness: 0.75 }),
    blocks: std({ map: T.blocks, roughness: 0.9 }),
    dark: std({ color: 0x2a2e33, roughness: 0.6, metalness: 0.55 }),
    paint: std({ color: 0xffffff, roughness: 0.7, metalness: 0.2 }),
    rubber: std({ color: 0x18191b, roughness: 0.95 }),
    glass: std({ color: 0x40505a, roughness: 0.15, metalness: 0.8, envMapIntensity: 1.2 }),
    marking: std({ map: T.paint, roughness: 0.8 }),
    plaster: std({ map: T.plaster, roughness: 0.95 }),
    brick: std({ map: T.brick, roughness: 0.9 }),
    cobble: std({ map: T.cobble, roughness: 0.9 }),
    wood: std({ map: T.wood, roughness: 0.8 }),
    snow: std({ map: T.snow, roughness: 0.85, envMapIntensity: 0.8 }),
    labpanel: std({ map: T.labpanel, roughness: 0.5, metalness: 0.3 }),
    rock: std({ map: T.rock, roughness: 0.95 }),
    sand: std({ map: T.sand, roughness: 1.0 }),
    tile: std({ map: T.tile, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.9 }),
    floortile: std({ map: T.floortile, roughness: 0.55 }),
    ballast: std({ map: T.ballast, roughness: 1.0 }),
    steel: std({ color: 0x8b9197, roughness: 0.35, metalness: 0.85 }),
    awning: std({ map: T.awning, roughness: 0.9, side: THREE.DoubleSide }),
    fence: std({ map: T.chainlink, roughness: 0.5, metalness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false }),
    water: std({ color: 0x2f6e86, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.3 }),
    ceil: std({ map: T.concrete, roughness: 0.92 }),      // ceilings that must not block the overhead light
    ceilTile: std({ map: T.tile, roughness: 0.5 }),
    lampHead: new THREE.MeshBasicMaterial({ color: 0xffd18a, vertexColors: true }),
    lampCold: new THREE.MeshBasicMaterial({ color: 0xdff0ff, vertexColors: true }),
    glowRed: new THREE.MeshBasicMaterial({ color: 0xff3a2a, vertexColors: true }),
    glowGreen: new THREE.MeshBasicMaterial({ color: 0x3aff8a, vertexColors: true }),
    // far scenery
    city: new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.9, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 0.9, vertexColors: true }),
    land: new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 1, vertexColors: true }),
  };
  for (const k of ['lampHead', 'lampCold', 'glowRed', 'glowGreen']) M[k].userData.noShadow = true;
  M.fence.userData.noShadow = true;
  M.ceil.userData.noShadow = true;
  M.ceilTile.userData.noShadow = true;
  M.awning.userData.noShadow = false;
  SHARED = { T, M };
  return SHARED;
}

export function sharedTextures(renderer) { return shared(renderer).T; }

// ---------- sky ----------
export function makeSky(theme) {
  const S = theme.sky;
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
      top: { value: new THREE.Color(S.top) },
      mid: { value: new THREE.Color(S.mid) },
      horizon: { value: new THREE.Color(S.horizon) },
      sunCol: { value: new THREE.Color(S.sun) },
      ground: { value: new THREE.Color(S.ground) },
      clouds: { value: S.clouds ?? 1 },
      sunSize: { value: S.sunDisc ?? 1 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 sunDir, top, mid, horizon, sunCol, ground; uniform float clouds, sunSize; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, sunDir), 0.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, top, smoothstep(0.15, 0.7, h));
        col += sunCol * pow(s, 8.0) * 0.55 * (1.0 - smoothstep(0.0, 0.6, h));
        col += sunCol * pow(s, 64.0) * 0.8;
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9975, 0.9988, s) * 3.0 * sunSize;
        float band = sin(d.x * 9.0 + d.z * 4.0) * sin(d.z * 13.0 - d.x * 3.0);
        col = mix(col, col * 0.82 + vec3(0.06, 0.05, 0.06), clouds * smoothstep(0.35, 0.9, band) * smoothstep(0.03, 0.12, h) * (1.0 - smoothstep(0.25, 0.45, h)));
        col = mix(col, ground, smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------- context with placement helpers ----------
export function createContext({ renderer, quality, theme, bounds, seed = 42 }) {
  const { T, M } = shared(renderer);
  const world = new World();
  const geo = new GeoBuilder(), deco = new GeoBuilder(), far = new GeoBuilder(), noShadow = new GeoBuilder();
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const ctx = { renderer, quality, theme, bounds, T, M, world, geo, deco, far, noShadow, rng, group, root, updates: [], pointLights: [], disposables: [] };

  const solid = (ctx.solid = (x0, y0, z0, x1, y1, z1, mat, opt = {}) => {
    const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), d = Math.max(z0, z1);
    if (opt.collide !== false) world.add(a, y0, c, b, y1, d, { shoot: opt.shoot, walk: opt.walk, mat });
    if (mat) (opt.deco ? deco : geo).box(a, y0, c, b, y1, d, mat, opt);
  });
  const decor = (ctx.decor = (x0, y0, z0, x1, y1, z1, mat, opt = {}) => (opt.noShadow ? noShadow : deco).box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), mat, opt));
  ctx.blocker = (x0, y0, z0, x1, y1, z1, opt = {}) => world.add(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), { shoot: opt.shoot !== undefined ? opt.shoot : false, walk: true });

  // solid stair rising toward dir, from y0 to y1 (each step a solid block down to y0)
  ctx.stairs = (x0, x1, z0, z1, dir, y0, y1, mat = 'tread', opt = {}) => {
    const n = Math.max(1, Math.round((y1 - y0) / 0.2));
    for (let i = 0; i < n; i++) {
      const top = y0 + (i + 1) * ((y1 - y0) / n);
      const f0 = i / n, f1 = (i + 1) / n;
      const o = Object.assign({ scale: [1, 1] }, opt);
      if (dir === '+x') solid(x0 + (x1 - x0) * f0, y0, z0, x0 + (x1 - x0) * f1, top, z1, mat, o);
      if (dir === '-x') solid(x1 - (x1 - x0) * f1, y0, z0, x1 - (x1 - x0) * f0, top, z1, mat, o);
      if (dir === '+z') solid(x0, y0, z0 + (z1 - z0) * f0, x1, top, z0 + (z1 - z0) * f1, mat, o);
      if (dir === '-z') solid(x0, y0, z1 - (z1 - z0) * f1, x1, top, z1 - (z1 - z0) * f0, mat, o);
    }
  };
  // railing: thin, blocks movement but not bullets
  ctx.railing = (x0, z0, x1, z1, y, h = 1.0, topMat = 'hazard') => {
    const t = 0.05;
    const minx = Math.min(x0, x1) - (x0 === x1 ? t : 0), maxx = Math.max(x0, x1) + (x0 === x1 ? t : 0);
    const minz = Math.min(z0, z1) - (z0 === z1 ? t : 0), maxz = Math.max(z0, z1) + (z0 === z1 ? t : 0);
    world.add(minx, y, minz, maxx, y + h, maxz, { shoot: false });
    decor(minx, y + h - 0.06, minz, maxx, y + h, maxz, topMat, { scale: [1, 1] });
    decor(minx + 0.01, y + h * 0.5 - 0.02, minz + 0.01, maxx - 0.01, y + h * 0.5 + 0.02, maxz - 0.01, 'dark');
    const len = Math.hypot(x1 - x0, z1 - z0);
    const posts = Math.max(2, Math.ceil(len / 1.5) + 1);
    for (let i = 0; i < posts; i++) {
      const f = i / (posts - 1);
      const px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f;
      decor(px - 0.035, y, pz - 0.035, px + 0.035, y + h, pz + 0.035, 'dark');
    }
  };
  // wall along an axis with rectangular openings [a0, a1, y0, y1]
  const wall = (ctx.wall = (axis, a0, a1, t0, t1, y0, y1, openings, mat, opt = {}) => {
    const cuts = new Set([a0, a1]);
    for (const o of openings) { if (o[0] > a0 && o[0] < a1) cuts.add(o[0]); if (o[1] > a0 && o[1] < a1) cuts.add(o[1]); }
    const cs = [...cuts].sort((p, q) => p - q);
    for (let i = 0; i < cs.length - 1; i++) {
      const s0 = cs[i], s1 = cs[i + 1], mid = (s0 + s1) / 2;
      const holes = openings.filter((o) => o[0] < mid && o[1] > mid).map((o) => [o[2], o[3]]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      const spans = [];
      for (const [h0, h1] of holes) { if (h0 > y) spans.push([y, h0]); y = Math.max(y, h1); }
      if (y < y1) spans.push([y, y1]);
      for (const [p0, p1] of spans) {
        if (p1 - p0 < 0.01) continue;
        if (axis === 'x') solid(s0, p0, t0, s1, p1, t1, mat, opt);
        else solid(t0, p0, s0, t1, p1, s1, mat, opt);
      }
    }
  });
  // horizontal slab (or solid mass) with rectangular holes [x0, x1, z0, z1]
  const slab = (ctx.slab = (x0, x1, z0, z1, y0, y1, mat, holes = [], opt = {}) => {
    const xs = new Set([x0, x1]);
    for (const h of holes) { if (h[0] > x0 && h[0] < x1) xs.add(h[0]); if (h[1] > x0 && h[1] < x1) xs.add(h[1]); }
    const cx = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < cx.length - 1; i++) {
      const a = cx[i], b = cx[i + 1], mid = (a + b) / 2;
      const hz = holes.filter((h) => h[0] < mid && h[1] > mid).map((h) => [h[2], h[3]]).sort((p, q) => p[0] - q[0]);
      let z = z0;
      for (const [h0, h1] of hz) { if (h0 > z) solid(a, y0, z, b, y1, Math.min(h0, z1), mat, opt); z = Math.max(z, h1); }
      if (z < z1) solid(a, y0, z, b, y1, z1, mat, opt);
    }
  });

  // Multi-floor building with doors, windows, interior stairs and an optional roof access.
  ctx.building = (s) => {
    const { x0, x1, z0, z1 } = s;
    const floors = s.floors || 1, fh = s.fh || 3.5, t = s.t || 0.3, by = s.y0 || 0;
    const mat = s.mat || 'plaster', opt = { scale: s.scale || [3, 3], color: s.color };
    const H = floors * fh, par = s.parapet ?? 1.0;
    const open = { n: [], s: [], w: [], e: [] };
    for (const d of s.doors || []) {
      const y = by + (d.floor || 0) * fh;
      open[d.side].push([d.a - (d.w || 1.4) / 2, d.a + (d.w || 1.4) / 2, y, y + (d.h || 2.4)]);
    }
    const winH = s.winH || 1.2, sill = s.sill ?? 1.0;
    for (const w of s.windows || []) {
      const y = by + (w.floor || 0) * fh + (w.sill ?? sill);
      open[w.side].push([w.a - (w.w || 1.2) / 2, w.a + (w.w || 1.2) / 2, y, y + (w.h || winH)]);
    }
    // automatic windows every `winEvery` metres on listed sides, avoiding doors
    if (s.autoWindows) {
      for (const side of s.autoWindows.sides || ['n', 's', 'w', 'e']) {
        const along = side === 'n' || side === 's' ? [x0, x1] : [z0, z1];
        const every = s.autoWindows.every || 3;
        for (let f = s.autoWindows.from ?? 0; f < floors; f++) {
          for (let a = along[0] + every * 0.75; a < along[1] - every * 0.5; a += every) {
            const y = by + f * fh + sill;
            const w = s.autoWindows.w || 1.1;
            const clash = open[side].some((o) => o[0] < a + w / 2 + 0.3 && o[1] > a - w / 2 - 0.3 && o[2] < y + winH && o[3] > y);
            if (!clash) open[side].push([a - w / 2, a + w / 2, y, y + winH]);
          }
        }
      }
    }
    const top = by + H + par;
    wall('x', x0, x1, z0, z0 + t, by, top, open.n, mat, opt);
    wall('x', x0, x1, z1 - t, z1, by, top, open.s, mat, opt);
    wall('z', z0 + t, z1 - t, x0, x0 + t, by, top, open.w, mat, opt);
    wall('z', z0 + t, z1 - t, x1 - t, x1, by, top, open.e, mat, opt);
    // trims: sills and door frames
    const trimMat = s.trim || 'dark';
    for (const side of ['n', 's', 'w', 'e']) for (const o of open[side]) {
      const isDoor = Math.abs(o[2] - by - Math.round((o[2] - by) / fh) * fh) < 0.01;
      if (isDoor) continue;
      const p = 0.08;
      if (side === 'n') decor(o[0] - 0.05, o[2] - 0.08, z0 - p, o[1] + 0.05, o[2], z0 + t + p, trimMat);
      if (side === 's') decor(o[0] - 0.05, o[2] - 0.08, z1 - t - p, o[1] + 0.05, o[2], z1 + p, trimMat);
      if (side === 'w') decor(x0 - p, o[2] - 0.08, o[0] - 0.05, x0 + t + p, o[2], o[1] + 0.05, trimMat);
      if (side === 'e') decor(x1 - t - p, o[2] - 0.08, o[0] - 0.05, x1 + p, o[2], o[1] + 0.05, trimMat);
    }
    // stairs and slabs
    const holesAt = (f) => (s.stairs || []).filter((st) => (st.floor || 0) === f - 1).map((st) => [st.x0 - 0.05, st.x1 + 0.05, st.z0 - 0.05, st.z1 + 0.05]);
    const slabMat = s.slabMat || 'concrete';
    for (let f = 1; f < floors; f++) slab(x0 + t, x1 - t, z0 + t, z1 - t, by + f * fh - 0.2, by + f * fh, slabMat, holesAt(f), { scale: [3, 3] });
    slab(x0 + t, x1 - t, z0 + t, z1 - t, by + H - 0.25, by + H, s.roofMat || slabMat, holesAt(floors), { scale: [3, 3] });
    for (const st of s.stairs || []) {
      const f = st.floor || 0;
      ctx.stairs(st.x0, st.x1, st.z0, st.z1, st.dir, by + f * fh, by + (f + 1) * fh, st.mat || 'tread');
    }
    if (s.floorMat) decor(x0 + t, by, z0 + t, x1 - t, by + 0.01, z1 - t, s.floorMat, { scale: [3, 3], skip: 0b111011 });
    if (s.roofTop) decor(x0 + t, by + H, z0 + t, x1 - t, by + H + 0.012, z1 - t, s.roofTop, { scale: [3, 3], skip: 0b111011 });
    // parapet cap
    if (par > 0) {
      const cap = s.capMat || 'concrete';
      decor(x0 - 0.05, top, z0 - 0.05, x1 + 0.05, top + 0.08, z0 + t + 0.05, cap, { scale: [2, 2] });
      decor(x0 - 0.05, top, z1 - t - 0.05, x1 + 0.05, top + 0.08, z1 + 0.05, cap, { scale: [2, 2] });
      decor(x0 - 0.05, top, z0, x0 + t + 0.05, top + 0.08, z1, cap, { scale: [2, 2] });
      decor(x1 - t - 0.05, top, z0, x1 + 0.05, top + 0.08, z1, cap, { scale: [2, 2] });
    }
    return { H: by + H, top };
  };

  const CONT = {
    red: linColor('#9a3d2f'), blue: linColor('#2e5f8f'), green: linColor('#3f6e4c'), orange: linColor('#c5692a'),
    white: linColor('#c9c4b8'), yellow: linColor('#c9a52c'), teal: linColor('#2f7a7a'), grey: linColor('#7a7f86'),
  };
  ctx.CONT = CONT;
  ctx.container = (cx, cz, lvl, len, alongX, col, y00 = 0) => {
    const w = 2.44, h = 2.6;
    const hx = alongX ? len / 2 : w / 2, hz = alongX ? w / 2 : len / 2;
    const y0 = y00 + lvl * h;
    const c = CONT[col] || CONT.grey;
    solid(cx - hx, y0, cz - hz, cx + hx, y0 + h, cz + hz, 'container', { scale: [2.4, 2.6], color: c, oy: -y00 });
    const endPos = alongX ? cx + hx : cz + hz;
    for (let k = 0; k < 4; k++) {
      const o = -0.9 + k * 0.6;
      if (alongX) decor(endPos, y0 + 0.15, cz + o - 0.025, endPos + 0.04, y0 + h - 0.15, cz + o + 0.025, 'dark');
      else decor(cx + o - 0.025, y0 + 0.15, endPos, cx + o + 0.025, y0 + h - 0.15, endPos + 0.04, 'dark');
    }
    if (alongX) decor(endPos, y0 + 0.02, cz - hz + 0.02, endPos + 0.03, y0 + h - 0.02, cz + hz - 0.02, 'container', { scale: [2.4, 2.6], color: c.map((v) => v * 0.7), skip: 0b000010, oy: -y00 });
    else decor(cx - hx + 0.02, y0 + 0.02, endPos, cx + hx - 0.02, y0 + h - 0.02, endPos + 0.03, 'container', { scale: [2.4, 2.6], color: c.map((v) => v * 0.7), skip: 0b100000, oy: -y00 });
  };
  ctx.crate = (cx, cz, y0, size) => {
    const tint = 0.85 + rng() * 0.25;
    solid(cx - size / 2, y0, cz - size / 2, cx + size / 2, y0 + size, cz + size / 2, 'crate', { uv: 'face', color: [tint, tint * 0.97, tint * 0.92] });
  };
  ctx.barrier = (cx, cz, len, alongX, y0 = 0) => {
    const hx = alongX ? len / 2 : 0.3, hz = alongX ? 0.3 : len / 2;
    solid(cx - hx, y0, cz - hz, cx + hx, y0 + 0.85, cz + hz, 'concrete', { scale: [2, 2] });
    decor(cx - hx - 0.01, y0 + 0.58, cz - hz - 0.01, cx + hx + 0.01, y0 + 0.7, cz + hz + 0.01, 'hazard', { scale: [0.6, 0.6] });
  };
  ctx.pallet = (cx, cz, y0 = 0) => decor(cx - 0.6, y0, cz - 0.5, cx + 0.6, y0 + 0.14, cz + 0.5, 'crate', { uv: 'face', color: [0.75, 0.7, 0.6] });
  // barrel: drawn as a cylinder, collides as a box
  const barrels = [];
  ctx.barrel = (x, z, y0 = 0, color = '#3f5a6b') => { solid(x - 0.32, y0, z - 0.32, x + 0.32, y0 + 0.95, z + 0.32, null); barrels.push([x, y0, z, color]); };
  // chain-link fence: blocks movement, bullets and sight pass through
  ctx.fence = (x0, z0, x1, z1, h = 2.6, y0 = 0) => {
    const along = x0 === x1 ? 'z' : 'x';
    const t = 0.04;
    if (along === 'x') {
      world.add(Math.min(x0, x1), y0, z0 - t, Math.max(x0, x1), y0 + h, z0 + t, { shoot: false });
      decor(Math.min(x0, x1), y0, z0 - 0.005, Math.max(x0, x1), y0 + h, z0 + 0.005, 'fence', { scale: [0.5, 0.5], noShadow: true });
    } else {
      world.add(x0 - t, y0, Math.min(z0, z1), x0 + t, y0 + h, Math.max(z0, z1), { shoot: false });
      decor(x0 - 0.005, y0, Math.min(z0, z1), x0 + 0.005, y0 + h, Math.max(z0, z1), 'fence', { scale: [0.5, 0.5], noShadow: true });
    }
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.ceil(len / 3) + 1);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f;
      decor(px - 0.04, y0, pz - 0.04, px + 0.04, y0 + h + 0.1, pz + 0.04, 'steel');
    }
    if (along === 'x') decor(Math.min(x0, x1), y0 + h - 0.03, z0 - 0.03, Math.max(x0, x1), y0 + h + 0.03, z0 + 0.03, 'steel');
    else decor(x0 - 0.03, y0 + h - 0.03, Math.min(z0, z1), x0 + 0.03, y0 + h + 0.03, Math.max(z0, z1), 'steel');
  };
  // boundary walls around the play area
  ctx.perimeter = (h, mat, opt = {}) => {
    const { minX, maxX, minZ, maxZ } = bounds;
    const t = 0.6, o = Object.assign({ scale: [6, h] }, opt);
    solid(minX - t, 0, minZ - t, maxX + t, h, minZ, mat, o);
    solid(minX - t, 0, maxZ, maxX + t, h, maxZ + t, mat, o);
    solid(minX - t, 0, minZ, minX, h, maxZ, mat, o);
    solid(maxX, 0, minZ, maxX + t, h, maxZ, mat, o);
  };
  // ground slab: collider + one big textured quad
  ctx.ground = (mat, scale = 6, y = 0, extent = 220) => {
    world.add(-extent, y - 6, -extent, extent, y, extent, { mat });
    geo.quadY(-extent, -extent, extent, extent, y, mat, { scale: [scale, scale] });
  };
  // beam between two points (non-colliding, rotated)
  ctx.beam = (a, b, size, color, opts = {}) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const mat = opts.mat || new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, len), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.lookAt(B);
    m.castShadow = opts.shadow !== false;
    root.add(m);
    ctx.disposables.push(m.geometry);
    return m;
  };
  ctx.mesh = (geometry, material, pos, opts = {}) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...pos);
    if (opts.rot) m.rotation.set(...opts.rot);
    if (opts.scale) m.scale.set(...opts.scale);
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = true;
    root.add(m);
    ctx.disposables.push(geometry);
    return m;
  };
  ctx.pointLight = (pos, color = 0xffb867, intensity = 60, distance = 26) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(...pos);
    group.add(l);
    ctx.pointLights.push(l);
    return l;
  };
  ctx.glow = (pos, scale = 3, color = 0xffc37a, opacity = 0.7) => {
    const m = new THREE.SpriteMaterial({ map: T.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: true });
    const s = new THREE.Sprite(m);
    s.position.set(...pos);
    s.scale.set(scale, scale, 1);
    root.add(s);
    ctx.disposables.push(m);
    return s;
  };
  // street lamp; dir = which way the head points (+x by default)
  ctx.lamp = (lx, lz, opts = {}) => {
    const h = opts.h || 7.5, dx = opts.dx ?? 1, dz = opts.dz ?? 0, cold = !!opts.cold;
    solid(lx - 0.13, 0, lz - 0.13, lx + 0.13, h, lz + 0.13, 'dark');
    decor(lx - 0.32, 0, lz - 0.32, lx + 0.32, 0.32, lz + 0.32, 'concrete', { scale: [1, 1] });
    const hx = lx + dx * 1.05, hz = lz + dz * 1.05;
    decor(Math.min(lx, hx) - 0.07, h - 0.2, Math.min(lz, hz) - 0.07, Math.max(lx, hx) + 0.07, h - 0.05, Math.max(lz, hz) + 0.07, 'dark');
    decor(hx - 0.32, h - 0.42, hz - 0.22, hx + 0.32, h - 0.22, hz + 0.22, 'dark');
    decor(hx - 0.27, h - 0.46, hz - 0.17, hx + 0.27, h - 0.42, hz + 0.17, cold ? 'lampCold' : 'lampHead');
    const p = [hx, h - 0.55, hz];
    ctx.glow(p, 3.2, cold ? 0xcfe6ff : 0xffc37a, 0.65);
    if (opts.light) ctx.pointLight(p, cold ? 0xd8ecff : 0xffb867, opts.intensity || 60, opts.distance || 26);
    return p;
  };
  // flat sign board with text
  ctx.sign = (x, y, z, w, h, lines, facing = 'z', bg, fg) => {
    const tex = makeSignTexture(lines, bg, fg, 512, Math.round(512 * (h / w)));
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x, y, z);
    if (facing === '-z') plane.rotation.y = Math.PI;
    if (facing === 'x') plane.rotation.y = Math.PI / 2;
    if (facing === '-x') plane.rotation.y = -Math.PI / 2;
    root.add(plane);
    ctx.disposables.push(plane.geometry, mat, tex);
    return plane;
  };
  ctx._barrels = barrels;
  return ctx;
}

// ---------- ambient particles (snow / dust) that follow the camera ----------
function makeParticles(kind, T) {
  const N = kind === 'snow' ? 1400 : 500;
  const R = 26, H = 16;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * R; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: T.glow, size: kind === 'snow' ? 0.09 : 0.06, transparent: true, depthWrite: false,
    color: kind === 'snow' ? 0xffffff : 0xe8cfa0, opacity: kind === 'snow' ? 0.85 : 0.35, sizeAttenuation: true, fog: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const update = (dt, cam) => {
    const fall = kind === 'snow' ? 1.3 : 0.15, drift = kind === 'snow' ? 0.5 : 1.6;
    const t = performance.now() * 0.001;
    for (let i = 0; i < N; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      y -= fall * (0.6 + seed[i]) * dt;
      x += (Math.sin(t * 0.7 + seed[i] * 20) * 0.4 + drift * 0.5) * dt;
      z += Math.cos(t * 0.5 + seed[i] * 13) * 0.3 * dt;
      if (y < -1) y += H;
      if (x > R) x -= 2 * R; if (x < -R) x += 2 * R;
      if (z > R) z -= 2 * R; if (z < -R) z += 2 * R;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    if (cam) pts.position.set(cam.position.x, cam.position.y - H * 0.35, cam.position.z);
  };
  return { pts, update, dispose: () => { geo.dispose(); mat.dispose(); } };
}

// ---------- finish: build meshes, sky, lights; return the map object ----------
export function finishMap(ctx, def, { spawns, pickups }) {
  const { M, T, world, root, group, theme, renderer, bounds } = ctx;
  ctx.far.build(M, root, { castShadow: false });
  ctx.geo.build(M, root);
  ctx.deco.build(M, root);
  ctx.noShadow.build(M, root, { castShadow: false, receiveShadow: false });
  // barrels
  if (ctx._barrels.length) {
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.95, 14);
    const byColor = new Map();
    for (const b of ctx._barrels) { if (!byColor.has(b[3])) byColor.set(b[3], []); byColor.get(b[3]).push(b); }
    const mm = new THREE.Matrix4();
    for (const [color, list] of byColor) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.5 });
      const inst = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach(([x, y, z], i) => { mm.makeTranslation(x, y + 0.475, z); inst.setMatrixAt(i, mm); });
      inst.castShadow = inst.receiveShadow = true;
      root.add(inst);
      ctx.disposables.push(mat);
    }
    ctx.disposables.push(g);
  }

  // sky + environment
  const sky = makeSky(theme);
  group.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(theme));
  const env = pmrem.fromScene(envScene, 0.04, 0.1, 2000).texture;
  pmrem.dispose();

  // lights
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  sun.position.set(cx, 0, cz).addScaledVector(sunDir, 140);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = theme.sunIntensity > 0.05;
  const sm = ctx.quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  const ext = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5 + (theme.shadowPad ?? 18);
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 340;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  group.add(sun, sun.target);

  let particles = null;
  if (theme.particles) { particles = makeParticles(theme.particles, T); group.add(particles.pts); }

  world.finalize();

  const mini = world.boxes
    .filter((b) => b.walk && b.maxy > 0.5 && b.maxy < (theme.miniMaxH || 30) && b.maxx - b.minx < 120 && b.maxz - b.minz < 120 && b.minx < bounds.maxX && b.maxx > bounds.minX && b.minz < bounds.maxZ && b.maxz > bounds.minZ)
    .map((b) => ({ x0: b.minx, z0: b.minz, x1: b.maxx, z1: b.maxz, h: b.maxy }));

  let lastT = 0;
  return {
    id: def.id, name: def.name, def, theme, bounds, world, spawns, pickups, mini, sun, sunDir, hemi, env, group, root, textures: T,
    fog: new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]),
    background: new THREE.Color(theme.sky.mid),
    update(t, camera) {
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      for (const f of ctx.updates) f(t, dt, camera);
      if (particles) particles.update(dt, camera);
    },
    dispose() {
      group.parent && group.parent.remove(group);
      group.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.isSky || o === sky) o.material.dispose();
      });
      sky.material.dispose();
      for (const d of ctx.disposables) d.dispose && d.dispose();
      if (particles) particles.dispose();
      if (sun.shadow.map) sun.shadow.map.dispose();
      env.dispose();
    },
  };
}
