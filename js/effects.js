// Visual effects: particles, tracers, decals, muzzle lights, explosions, casings.
import * as THREE from 'three';
import { rand } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();

const METAL = new Set(['container', 'dark', 'tread', 'paint', 'roof', 'siding', 'hazard', 'steel', 'labpanel', 'rubber', 'glass']);
const WOOD = new Set(['crate', 'wood']);
// dust colour per surface
const DUST = { snow: [0.92, 0.95, 1.0], sand: [0.8, 0.68, 0.5], rock: [0.72, 0.55, 0.42], ballast: [0.5, 0.48, 0.45], brick: [0.6, 0.38, 0.3], plaster: [0.85, 0.8, 0.72], cobble: [0.6, 0.58, 0.54], tile: [0.85, 0.84, 0.8], floortile: [0.66, 0.66, 0.65] };

class ParticleSystem {
  constructor(scene, max, texture, additive) {
    this.max = max;
    this.count = 0;
    this.p = []; // particle structs
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; uniform float uScale; varying vec4 vC;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a); if (gl_FragColor.a < 0.003) discard; }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  clear() { this.p = []; this.geo.setDrawRange(0, 0); }
  emit(o) {
    let q;
    if (this.p.length < this.max) { q = {}; this.p.push(q); } else {
      // recycle oldest
      q = this.p.shift(); this.p.push(q);
    }
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.life = 0; q.max = o.life || 1;
    q.s0 = o.s0 ?? 0.1; q.s1 = o.s1 ?? q.s0;
    q.r = o.r ?? 1; q.g = o.g ?? 1; q.b = o.b ?? 1;
    q.a0 = o.a0 ?? 1; q.a1 = o.a1 ?? 0;
    q.grav = o.grav ?? 0; q.drag = o.drag ?? 0;
    q.floor = o.floor ?? -100;
  }
  update(dt) {
    let n = 0;
    const P = this.p;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.vy -= q.grav * dt;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      const t = q.life / q.max;
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.col[n * 4] = q.r; this.col[n * 4 + 1] = q.g; this.col[n * 4 + 2] = q.b;
      this.col[n * 4 + 3] = q.a0 + (q.a1 - q.a0) * t;
      this.size[n] = q.s0 + (q.s1 - q.s0) * t;
      n++;
    }
    // compact dead particles occasionally
    if (P.length > 64 && n < P.length * 0.5) this.p = P.filter((q) => q.life < q.max);
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, textures, world) {
    this.scene = scene;
    this.world = world;
    this.T = textures;
    this.sparks = new ParticleSystem(scene, 900, textures.glow, true);
    this.smoke = new ParticleSystem(scene, 700, textures.smoke, false);

    // tracers: camera-facing glowing ribbons (bright core, soft glow, fading tail)
    this.tracerGeo = new THREE.PlaneGeometry(1, 1);
    this.tracerMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd28a) }, uOpacity: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){
          float y = (vUv.y - 0.5) * 2.0;
          float glow = exp(-y * y * 4.0);
          float core = exp(-y * y * 40.0);
          float fade = smoothstep(0.0, 1.0, vUv.x) * (0.55 + 0.45 * smoothstep(0.85, 1.0, vUv.x));
          vec3 col = mix(uColor, vec3(1.0, 0.98, 0.9), core);
          gl_FragColor = vec4(col * (glow * 0.55 + core * 1.4) * fade * uOpacity, 1.0);
        }`,
    });
    this.tracers = [];
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      m.renderOrder = 6;
      scene.add(m);
      this.tracers.push({ m, active: false });
    }
    this._ti = 0;

    // decals
    const dg = new THREE.PlaneGeometry(1, 1);
    this.holeMat = new THREE.MeshBasicMaterial({ map: textures.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0xdddddd });
    this.scorchMat = new THREE.MeshBasicMaterial({ map: textures.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.decals = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(dg, this.holeMat);
      m.visible = false;
      m.matrixAutoUpdate = true;
      scene.add(m);
      this.decals.push(m);
    }
    this._di = 0;
    this.scorches = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(dg, this.scorchMat);
      m.visible = false;
      scene.add(m);
      this.scorches.push(m);
    }
    this._si = 0;

    // flash lights (fixed count so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 14, 2);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 0.05, peak: 0 });
    }
    this._li = 0;

    // explosion flash sprites
    this.flashMat = new THREE.SpriteMaterial({ map: textures.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(this.flashMat.clone());
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, t: 0, dur: 0.3, size: 6 });
    }
    this._fi = 0;

    // casings
    const cg = new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6);
    cg.rotateZ(Math.PI / 2);
    const cm = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 0.9 });
    this.casings = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(cg, cm);
      m.visible = false;
      scene.add(m);
      this.casings.push({ m, v: new THREE.Vector3(), life: 0, floor: 0, spin: new THREE.Vector3() });
    }
    this._ci = 0;
    this.shake = 0;
  }

  setWorld(world) { this.world = world; }

  // remove everything that belongs to the previous map
  clear() {
    for (const d of this.decals) d.visible = false;
    for (const d of this.scorches) d.visible = false;
    for (const t of this.tracers) { t.active = false; t.m.visible = false; }
    for (const c of this.casings) { c.life = 0; c.m.visible = false; }
    for (const l of this.lights) { l.t = 0; l.l.intensity = 0; }
    for (const f of this.flashes) { f.t = f.dur; f.s.visible = false; }
    this.sparks.clear && this.sparks.clear();
    this.smoke.clear && this.smoke.clear();
    this.shake = 0;
  }

  setScale(px) {
    this.sparks.mat.uniforms.uScale.value = px;
    this.smoke.mat.uniforms.uScale.value = px;
  }

  tracer(sx, sy, sz, ex, ey, ez, color, opts = {}) {
    const t = this.tracers[this._ti++ % this.tracers.length];
    t.active = true;
    t.sx = sx; t.sy = sy; t.sz = sz;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz;
    t.len = Math.hypot(dx, dy, dz);
    if (t.len < 0.5) { t.active = false; t.m.visible = false; return; }
    t.dx = dx / t.len; t.dy = dy / t.len; t.dz = dz / t.len;
    t.head = Math.min(1.5, t.len);
    t.speed = opts.speed || 380;
    t.tail = opts.tail || 6;
    t.width = opts.width || 1;
    t.life = 0;
    t.m.visible = true;
    t.m.material.uniforms.uColor.value.set(color || 0xffd28a);
    t.m.material.uniforms.uOpacity.value = opts.opacity || 1;
  }

  muzzleLight(x, y, z, peak = 2.5, dur = 0.05) {
    const L = this.lights[this._li++ % this.lights.length];
    L.l.position.set(x, y, z);
    L.t = dur; L.dur = dur; L.peak = peak * 30;
    L.l.intensity = L.peak;
  }

  impact(x, y, z, nx, ny, nz, mat, decal = true) {
    const metal = METAL.has(mat), wood = WOOD.has(mat);
    const n = metal ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const sp = metal ? rand(3, 9) : rand(1, 4);
      this.sparks.emit({
        x, y, z,
        vx: nx * sp + rand(-3, 3), vy: ny * sp + rand(-1, 4), vz: nz * sp + rand(-3, 3),
        life: rand(0.12, 0.35), s0: metal ? 0.05 : 0.03, s1: 0.01,
        r: 1, g: metal ? 0.75 : 0.85, b: metal ? 0.35 : 0.6, a0: metal ? 1 : 0.6, a1: 0, grav: 14, drag: 1.5,
      });
    }
    const dustCol = wood ? [0.55, 0.4, 0.25] : metal ? [0.45, 0.43, 0.42] : DUST[mat] || [0.62, 0.6, 0.56];
    const puffs = mat === 'snow' || mat === 'sand' ? 7 : 4;
    for (let i = 0; i < puffs; i++) {
      this.smoke.emit({
        x: x + nx * 0.05, y: y + ny * 0.05, z: z + nz * 0.05,
        vx: nx * rand(0.4, 1.6) + rand(-0.3, 0.3), vy: ny * rand(0.4, 1.6) + rand(0, 0.5), vz: nz * rand(0.4, 1.6) + rand(-0.3, 0.3),
        life: rand(0.5, 1.0), s0: 0.12, s1: 0.55, r: dustCol[0], g: dustCol[1], b: dustCol[2], a0: 0.5, a1: 0, drag: 2.5,
      });
    }
    if (wood) {
      for (let i = 0; i < 4; i++) this.smoke.emit({ x, y, z, vx: nx * 3 + rand(-2, 2), vy: rand(1, 4), vz: nz * 3 + rand(-2, 2), life: 0.8, s0: 0.04, s1: 0.04, r: 0.5, g: 0.35, b: 0.2, a0: 1, a1: 1, grav: 12, floor: 0.02 });
    }
    if (decal) this.decal(x, y, z, nx, ny, nz);
  }

  decal(x, y, z, nx, ny, nz) {
    const m = this.decals[this._di++ % this.decals.length];
    m.material = this.holeMat;
    const s = rand(0.08, 0.12);
    m.scale.set(s, s, 1);
    m.position.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004);
    m.lookAt(x + nx, y + ny, z + nz);
    m.rotateZ(Math.random() * 6.28);
    m.visible = true;
  }

  blood(x, y, z, dx, dz, head) {
    const n = head ? 12 : 7;
    for (let i = 0; i < n; i++) {
      this.smoke.emit({
        x, y, z,
        vx: dx * rand(1, 3) + rand(-1, 1), vy: rand(-0.5, 1.8), vz: dz * rand(1, 3) + rand(-1, 1),
        life: rand(0.25, 0.5), s0: 0.06, s1: 0.22, r: 0.55, g: 0.06, b: 0.05, a0: 0.85, a1: 0, grav: 6, drag: 3,
      });
    }
    if (head) for (let i = 0; i < 5; i++) this.sparks.emit({ x, y, z, vx: rand(-2, 2), vy: rand(0, 3), vz: rand(-2, 2), life: 0.2, s0: 0.05, s1: 0.0, r: 1, g: 0.3, b: 0.2, a0: 0.9, grav: 8 });
  }

  muzzleSmoke(x, y, z, dx, dy, dz) {
    this.smoke.emit({ x, y, z, vx: dx * 1.5 + rand(-0.2, 0.2), vy: dy * 1.5 + 0.4, vz: dz * 1.5 + rand(-0.2, 0.2), life: 0.6, s0: 0.05, s1: 0.35, r: 0.8, g: 0.8, b: 0.8, a0: 0.25, a1: 0, drag: 3 });
  }

  casing(pos, vel) {
    const c = this.casings[this._ci++ % this.casings.length];
    c.m.position.copy(pos);
    c.v.copy(vel);
    c.spin.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    c.life = 1.6;
    c.floor = Math.max(0, this.world.groundAt(pos.x, pos.y, pos.z, 0.02)) + 0.005;
    c.m.visible = true;
  }

  explosion(x, y, z, camPos) {
    const f = this.flashes[this._fi++ % this.flashes.length];
    f.s.position.set(x, y + 0.6, z);
    f.t = 0; f.dur = 0.35; f.size = 9; f.s.visible = true;
    f.s.material.opacity = 1;
    f.s.material.rotation = Math.random() * 6.28;
    this.muzzleLight(x, y + 1, z, 9, 0.35);
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * 6.28, sp = rand(2, 9);
      this.sparks.emit({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rand(1, 8), vz: Math.sin(a) * sp, life: rand(0.3, 0.8), s0: 0.09, s1: 0.02, r: 1, g: rand(0.5, 0.8), b: 0.25, a0: 1, a1: 0, grav: 10, drag: 1, floor: y + 0.02 });
    }
    for (let i = 0; i < 14; i++) {
      this.sparks.emit({ x: x + rand(-0.8, 0.8), y: y + rand(0.2, 1.4), z: z + rand(-0.8, 0.8), vx: rand(-1.5, 1.5), vy: rand(0.5, 2.5), vz: rand(-1.5, 1.5), life: rand(0.25, 0.5), s0: 1.2, s1: 2.4, r: 1, g: 0.55, b: 0.18, a0: 0.9, a1: 0, drag: 2 });
    }
    for (let i = 0; i < 22; i++) {
      this.smoke.emit({ x: x + rand(-1, 1), y: y + rand(0.2, 1.5), z: z + rand(-1, 1), vx: rand(-1.4, 1.4), vy: rand(0.8, 2.6), vz: rand(-1.4, 1.4), life: rand(1.6, 3.2), s0: 1.0, s1: 4.2, r: 0.18, g: 0.17, b: 0.16, a0: 0.65, a1: 0, drag: 1.2 });
    }
    // scorch
    const g = this.world.groundAt(x, y + 0.5, z, 0.1);
    if (g > -Infinity && y - g < 1.2) {
      const s = this.scorches[this._si++ % this.scorches.length];
      s.position.set(x, g + 0.01, z);
      s.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
      s.scale.set(3.4, 3.4, 1);
      s.visible = true;
    }
    if (camPos) {
      const d = Math.hypot(camPos.x - x, camPos.y - y, camPos.z - z);
      this.shake = Math.max(this.shake, Math.max(0, 1 - d / 22) * 1.0);
    }
  }

  update(dt, camera) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    const cam = camera ? camera.position : null;
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.head += t.speed * dt;
      const tail = Math.max(0, t.head - t.tail);
      if (tail >= t.len) { t.active = false; t.m.visible = false; continue; }
      const h = Math.min(t.head, t.len);
      const L = Math.max(0.01, h - tail);
      _a.set(t.sx + t.dx * (tail + h) * 0.5, t.sy + t.dy * (tail + h) * 0.5, t.sz + t.dz * (tail + h) * 0.5);
      _b.set(t.dx, t.dy, t.dz);
      if (cam) _c.subVectors(cam, _a); else _c.set(0, 1, 0);
      const dist = _c.length();
      _s.crossVectors(_b, _c);
      if (_s.lengthSq() < 1e-8) _s.set(0, 1, 0);
      // keep a minimum on-screen width so far tracers stay visible
      const w = (0.035 + dist * 0.0032) * t.width;
      _s.normalize().multiplyScalar(w);
      _n.crossVectors(_b, _s).normalize();
      _b.multiplyScalar(L);
      t.m.matrix.makeBasis(_b, _s, _n).setPosition(_a);
      t.m.matrixWorldNeedsUpdate = true;
    }
    for (const L of this.lights) {
      if (L.t > 0) {
        L.t -= dt;
        L.l.intensity = Math.max(0, L.peak * (L.t / L.dur));
      } else if (L.l.intensity !== 0) L.l.intensity = 0;
    }
    for (const f of this.flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.s.visible = false; continue; }
      const sc = f.size * (0.4 + k * 0.8);
      f.s.scale.set(sc, sc, 1);
      f.s.material.opacity = 1 - k;
    }
    for (const c of this.casings) {
      if (!c.m.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      if (c.m.position.y < c.floor) {
        c.m.position.y = c.floor;
        c.v.y = Math.abs(c.v.y) * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
