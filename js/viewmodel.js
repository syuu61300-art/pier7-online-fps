// First-person weapon rendering in its own scene/camera so guns never clip into walls.
import * as THREE from 'three';
import { makeGun, sharedMats, makeGrenadeMesh, mergeStatic } from './models.js';
import { clamp, damp, lerp, smoothstep } from './util.js';

const HIP = {
  ar: [0.115, -0.125, -0.43], smg: [0.105, -0.115, -0.39], sg: [0.115, -0.12, -0.45], sr: [0.12, -0.13, -0.45],
  lmg: [0.125, -0.14, -0.46], pistol: [0.1, -0.105, -0.37], knife: [0.14, -0.15, -0.32],
};
const ADS_D = { ar: 0.22, smg: 0.21, sg: 0.3, sr: 0.16, lmg: 0.27, pistol: 0.34, knife: 0.3 };
// hand anchor points in gun space
const HANDS = {
  ar: { r: [0, -0.07, 0.05], l: [0, -0.01, -0.37] },
  smg: { r: [0, -0.065, 0.045], l: [0, -0.06, -0.24] },
  sg: { r: [0, -0.06, 0.08], l: [0, -0.005, -0.36] },
  sr: { r: [0, -0.07, 0.1], l: [0, -0.02, -0.36] },
  lmg: { r: [0, -0.075, 0.06], l: [0, -0.01, -0.4] },
  pistol: { r: [0, -0.05, 0.025], l: [-0.012, -0.065, 0.03] },
  knife: { r: [0, -0.005, 0.02], l: null },
};

function limb(parent, from, to, w, mat) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w * 1.05), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

const _a = new THREE.Vector3(), _hand = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const ease = (x) => x * x * (3 - 2 * x);
const seg = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));

export class ViewModel {
  constructor(textures, env) {
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xb9c6e0, 0x4a3f36, 1.4);
    this.sun = new THREE.DirectionalLight(0xffc999, 2.4);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.24, 0.8).normalize();
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2, 2);
    this.scene.add(this.flashLight);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.color = new THREE.Color('#e8a33d');
    this.sleeveAccent = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.6, emissive: this.color, emissiveIntensity: 0.25 });
    this.models = {};
    this.cur = null;
    this.curId = '';
    // muzzle flash
    this.flashMat = new THREE.SpriteMaterial({ map: textures.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.flashT = 0;
    // grenade-throw hand
    this.throwGroup = new THREE.Group();
    const M = sharedMats();
    limb(this.throwGroup, [-0.05, -0.3, 0.2], [-0.02, -0.02, -0.02], 0.065, M.uniform);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.09), M.glove);
    glove.position.set(-0.02, 0.0, -0.03); this.throwGroup.add(glove);
    const nade = makeGrenadeMesh(); nade.scale.setScalar(0.8); nade.position.set(-0.02, 0.05, -0.05);
    this.throwGroup.add(nade);
    this.throwGroup.visible = false;
    this.scene.add(this.throwGroup);
    // state
    this.pos = new THREE.Vector3();
    this.rot = new THREE.Euler();
    this.swayX = 0; this.swayY = 0;
    this.kickZ = 0; this.kickRot = 0; this.kickV = 0; this.kickRV = 0;
    this.drawT = 1; this.drawDur = 0.4;
    this.meleeT = 0; this.meleeKind = '';
    this.throwT = 0;
    this.sprintT = 0;
    this.time = 0;
    this.landDip = 0;
  }

  // match the first-person lighting to the current map
  setLighting(map) {
    const th = map.theme;
    this.sunDir.copy(map.sunDir);
    this.sun.color.set(th.sunColor);
    this.sun.intensity = Math.min(2.8, Math.max(0.7, th.sunIntensity * 0.78));
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);
    this.hemi.intensity = th.hemi[2] * 1.2;
    this.scene.environment = map.env;
  }

  setColor(hex) {
    this.color.set(hex);
    this.sleeveAccent.color.set(hex);
    this.sleeveAccent.emissive.set(hex);
  }

  _build(id) {
    const M = sharedMats();
    const gun = makeGun(id);
    const g = gun.group;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    const H = HANDS[id];
    const sleeve = M.uniform;
    // right arm
    const rh = H.r;
    limb(g, [rh[0] + 0.1, rh[1] - 0.3, rh[2] + 0.32], [rh[0] + 0.01, rh[1] - 0.02, rh[2] + 0.04], 0.07, sleeve);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.025, 0.078), this.sleeveAccent);
    band.position.set(rh[0] + 0.06, rh[1] - 0.16, rh[2] + 0.18); band.rotation.x = -0.9; g.add(band);
    const rg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.09), M.glove);
    rg.position.set(rh[0], rh[1], rh[2]); g.add(rg);
    mergeStatic(g);
    // left arm: its own meshes (not merged) so it can reach for the magazine when reloading
    if (H.l) {
      const lh = H.l;
      const armGeo = new THREE.BoxGeometry(0.068, 1, 0.071); armGeo.translate(0, 0.5, 0); // pivot at the shoulder end
      const rig = {
        shoulder: new THREE.Vector3(lh[0] - 0.16, lh[1] - 0.28, lh[2] + 0.22),
        home: new THREE.Vector3(lh[0] - 0.01, lh[1] - 0.012, lh[2]),
        arm: new THREE.Mesh(armGeo, sleeve),
        glove: new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.07, 0.095), M.glove),
      };
      // where the hand grips the magazine: the bottom of the mag in gun space (measured before the arm is added)
      g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(gun.mag);
      rig.grip = bb.isEmpty() ? rig.home.clone() : new THREE.Vector3((bb.min.x + bb.max.x) / 2 - 0.005, bb.min.y + 0.03, (bb.min.z + bb.max.z) / 2);
      const gb = new THREE.Box3().setFromObject(g);
      // charging handle (rifles) / slide (pistol): top of the receiver, just behind the magazine
      // (kept forward of the camera so the hand never fills the screen)
      rig.charge = id === 'pistol' ? new THREE.Vector3(-0.03, rig.grip.y + 0.11, rig.grip.z - 0.02) : new THREE.Vector3(-0.065, rig.grip.y + 0.13, rig.grip.z + 0.01);
      // shotgun loading port: under the receiver, behind the pump
      rig.port = new THREE.Vector3(-0.005, rig.home.y - 0.035, rig.home.z + 0.24);
      g.add(rig.arm, rig.glove);
      gun.lh = rig;
      this._placeArm(rig, rig.home);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    g.visible = false;
    this.root.add(g);
    gun.magHome = gun.mag.position.clone();
    gun.id = id;
    this.models[id] = gun;
    return gun;
  }

  _placeArm(rig, hand) {
    const d = _a.subVectors(hand, rig.shoulder);
    const len = Math.max(0.05, d.length());
    rig.arm.position.copy(rig.shoulder);
    rig.arm.quaternion.setFromUnitVectors(_up, d.divideScalar(len));
    rig.arm.scale.set(1, len, 1);
    rig.glove.position.copy(hand);
  }

  // left-hand position (gun space) during a reload, and where the magazine is relative to home
  _reloadHand(rig, gun, st, magOff) {
    const p = st.reloadFrac;
    const H = rig.home, G = rig.grip;
    magOff.set(0, 0, 0);
    if (st.shellReload) {
      // hand goes to the loading port and pushes shells in, one after another
      const k = seg(p, 0, 0.12) * (1 - seg(p, 0.9, 1));
      const push = Math.max(0, Math.sin(this.time * 13.4));
      _hand.copy(H).lerp(rig.port, k);
      _hand.x -= k * (1 - push) * 0.05; _hand.y -= k * (1 - push) * 0.1; _hand.z += k * (1 - push) * 0.04;
      return _hand;
    }
    const out = _a.set(G.x - 0.07, G.y - 0.34, G.z + 0.12);
    const charge = st.reloadEmpty;
    // pistol: the slide stays locked back on an empty gun until it is racked
    if (gun.bolt && gun.id === 'pistol') gun.bolt.position.z = charge && p < 0.8 ? 0.04 : 0;
    if (p < 0.12) _hand.copy(H).lerp(G, seg(p, 0, 0.12));                  // reach for the magazine
    else if (p < 0.17) _hand.copy(G);                                         // grab
    else if (p < 0.33) { _hand.copy(G).lerp(out, seg(p, 0.17, 0.33)); magOff.subVectors(_hand, G); } // pull it out
    else if (p < 0.45) { _hand.copy(out); _hand.y -= 0.08 * Math.sin(seg(p, 0.33, 0.45) * Math.PI); magOff.set(0, -0.6, 0); } // swap (off screen)
    else if (p < 0.6) { _hand.copy(out).lerp(_a.set(G.x, G.y - 0.07, G.z), seg(p, 0.45, 0.6)); magOff.subVectors(_hand, G); } // new magazine up
    else if (p < 0.66) { _hand.set(G.x, G.y - 0.07 * (1 - seg(p, 0.6, 0.64)), G.z); magOff.subVectors(_hand, G); } // seat it
    else if (!charge) _hand.copy(G).lerp(H, seg(p, 0.66, 0.84));              // back to the handguard
    else {
      const C = rig.charge;
      if (p < 0.74) _hand.copy(G).lerp(C, seg(p, 0.66, 0.74));                // to the charging handle / slide
      else if (p < 0.88) {                                                     // pull back, let go
        const k = Math.sin(seg(p, 0.74, 0.88) * Math.PI);
        _hand.copy(C); _hand.z += k * 0.075; _hand.y += k * 0.01;
        if (gun.bolt && gun.id === 'pistol') gun.bolt.position.z = Math.max(gun.bolt.position.z, k * 0.045);
      } else _hand.copy(C).lerp(H, seg(p, 0.88, 1));
    }
    return _hand;
  }

  setWeapon(id, drawDur = 0.4) {
    if (!this.models[id]) this._build(id);
    if (this.cur) this.cur.group.visible = false;
    this.cur = this.models[id];
    this.curId = id;
    this.cur.group.visible = true;
    this.drawT = 0;
    this.drawDur = drawDur;
    this.meleeT = 0;
  }

  fire(def, ads) {
    const k = def.recoil || { v: 0 };
    const mul = def.id === 'sg' || def.id === 'sr' ? 2.2 : 1;
    this.kickV += (0.9 + Math.random() * 0.3) * mul * (ads ? 0.55 : 1);
    this.kickRV += (k.v * 6 + 0.04) * mul * (ads ? 0.5 : 1);
    if (this.cur && !def.melee) {
      this.flashT = 0.045;
      this.flash.visible = true;
      const s = def.id === 'sg' ? 0.32 : def.id === 'pistol' || def.id === 'smg' ? 0.16 : 0.22;
      this.flash.scale.set(s * (0.8 + Math.random() * 0.4), s * (0.8 + Math.random() * 0.4), 1);
      this.flashMat.rotation = Math.random() * 6.28;
      this.flashLight.intensity = 3;
    }
  }

  melee(kind) { this.meleeT = 0.0001; this.meleeKind = kind; }
  throwNade() { this.throwT = 0.0001; }
  land(v) { this.landDip = Math.min(0.06, v * 0.005); }

  // world-space muzzle position for tracers
  muzzleWorld(camera, out) {
    if (!this.cur) return out.copy(camera.position);
    this.cur.muzzle.getWorldPosition(out); // in viewmodel camera space (camera at origin)
    // convert from viewmodel space to world using the main camera's transform
    out.applyQuaternion(camera.quaternion).add(camera.position);
    return out;
  }

  update(dt, st, mainCamera) {
    this.time += dt;
    const id = this.curId;
    const gun = this.cur;
    if (!gun) return;
    const hip = HIP[id] || HIP.ar;
    const adsE = smoothstep(0, 1, st.adsT);
    const adsD = ADS_D[id] || 0.25;
    // sun direction in camera space for consistent lighting
    const inv = mainCamera.quaternion.clone().invert();
    this.sun.position.copy(this.sunDir).applyQuaternion(inv).multiplyScalar(5);
    this.sun.target.position.set(0, 0, 0);

    // ---- targets ----
    let tx = lerp(hip[0], 0, adsE);
    let ty = lerp(hip[1], -gun.sightY, adsE);
    let tz = lerp(hip[2], -adsD - gun.sightZ, adsE);
    // hip cant: muzzle turned slightly toward the crosshair so the stock swings off-screen
    let rx = 0, ry = (id === 'pistol' || id === 'knife' ? 0.02 : 0.07) * (1 - adsE), rz = -0.03 * (1 - adsE);

    // sprint pose
    this.sprintT = damp(this.sprintT, st.sprint ? 1 : 0, 10, dt);
    const sp = this.sprintT;
    tx += sp * (id === 'pistol' || id === 'knife' ? 0.0 : -0.04);
    ty += sp * -0.05;
    tz += sp * 0.04;
    rx += sp * (id === 'pistol' ? -0.5 : -0.18);
    ry += sp * (id === 'pistol' || id === 'knife' ? 0.1 : 0.75);
    rz += sp * 0.32;

    // bob
    const amp = clamp(st.speed / 5, 0, 1.5) * (st.onGround ? 1 : 0.2) * (1 - adsE * 0.85) * (st.bobScale ?? 1);
    const ph = st.bobPhase;
    tx += Math.sin(ph) * 0.011 * amp * (1 + sp * 0.8);
    ty += -Math.abs(Math.cos(ph)) * 0.011 * amp * (1 + sp * 0.8);
    rz += Math.sin(ph) * 0.02 * amp;
    // idle breathing
    const br = (1 - adsE * 0.8);
    ty += Math.sin(this.time * 1.6) * 0.0018 * br;
    tx += Math.sin(this.time * 0.8) * 0.001 * br;

    // sway (lags behind look)
    this.swayX = damp(this.swayX, clamp(-st.lookDX * 0.0009, -0.05, 0.05), 9, dt);
    this.swayY = damp(this.swayY, clamp(st.lookDY * 0.0009, -0.05, 0.05), 9, dt);
    const swayK = 1 - adsE * 0.75;
    tx += this.swayX * swayK; ty += this.swayY * swayK;
    ry += this.swayX * 1.2 * swayK; rx += this.swayY * 0.8 * swayK;

    // crouch / landing
    ty -= st.crouchT * 0.006;
    this.landDip = damp(this.landDip, 0, 8, dt);
    ty -= this.landDip;

    // recoil spring
    this.kickV = damp(this.kickV, 0, 14, dt);
    this.kickRV = damp(this.kickRV, 0, 14, dt);
    this.kickZ = damp(this.kickZ, this.kickV * 0.045, 40, dt);
    this.kickRot = damp(this.kickRot, this.kickRV, 40, dt);
    tz += this.kickZ;
    rx += this.kickRot;

    // reload animation: the gun cants toward the left hand, which swaps the magazine
    gun.mag.position.copy(gun.magHome);
    gun.mag.visible = true;
    const rig = gun.lh;
    if (st.reloading) {
      const p = st.reloadFrac;
      if (st.shellReload) {
        const tilt = smoothstep(0, 0.12, p) * (1 - smoothstep(0.92, 1, p));
        rz += tilt * 0.55; rx += tilt * 0.15; ry += tilt * 0.22; tx -= tilt * 0.04; ty += tilt * 0.035;
        const bump = Math.max(0, Math.sin(this.time * 13.4)) * 0.008 * tilt;
        ty += bump;
      } else {
        // bring the gun up and roll it so the magazine well faces the camera
        const tilt = smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p));
        rz += tilt * 0.62; rx += tilt * 0.22; ry += tilt * 0.28;
        tx -= tilt * 0.055; ty += tilt * 0.05; tz += tilt * 0.035;
        if (p > 0.6 && p < 0.66) ty += 0.014 * Math.sin(((p - 0.6) / 0.06) * Math.PI);   // magazine slapped home
        if (st.reloadEmpty && p > 0.74 && p < 0.88) { const k = Math.sin(((p - 0.74) / 0.14) * Math.PI); tz += 0.02 * k; rx -= 0.05 * k; }
      }
      if (rig) {
        const off = this._magOff || (this._magOff = new THREE.Vector3());
        const hand = this._reloadHand(rig, gun, st, off);
        this._placeArm(rig, hand);
        if (!st.shellReload) {
          gun.mag.position.add(off);
          gun.mag.visible = off.y > -0.5; // hidden while the swap happens off screen
        }
      }
    } else if (rig) this._placeArm(rig, rig.home);
    // pump / bolt / slide
    if (gun.pump) {
      const a = st.actionT > 0 ? 1 - st.actionT / st.actionDur : 1;
      const k = a < 0.25 ? 0 : a < 0.75 ? Math.sin(((a - 0.25) / 0.5) * Math.PI) : 0;
      gun.pump.position.z = k * 0.09;
    }
    if (gun.bolt && id === 'sr') {
      const a = st.actionT > 0 ? 1 - st.actionT / st.actionDur : 1;
      const k = a < 0.2 ? 0 : a < 0.8 ? Math.sin(((a - 0.2) / 0.6) * Math.PI) : 0;
      gun.bolt.position.z = k * 0.08;
      gun.bolt.rotation.z = k * 0.9;
      if (k > 0) { rz += k * 0.15; ty -= k * 0.015; }
    }
    if (gun.bolt && id === 'pistol' && !st.reloading) {
      gun.bolt.position.z = this.kickZ * 0.8 + (st.ammo === 0 ? 0.04 : 0);
    }

    // draw animation
    if (this.drawT < 1) {
      this.drawT = Math.min(1, this.drawT + dt / this.drawDur);
      const d = 1 - smoothstep(0, 1, this.drawT);
      ty -= d * 0.3; rx -= d * 0.7; rz += d * 0.2;
    }
    // melee / bash
    if (this.meleeT > 0) {
      this.meleeT += dt;
      const dur = this.meleeKind === 'knife' ? 0.42 : 0.45;
      const p = this.meleeT / dur;
      if (p >= 1) this.meleeT = 0;
      else if (this.meleeKind === 'knife') {
        const s = Math.sin(p * Math.PI);
        tx += lerp(0.05, -0.16, smoothstep(0.1, 0.55, p)) * s;
        ty += 0.05 * s; tz -= 0.12 * s;
        ry += lerp(0.6, -0.9, smoothstep(0.1, 0.55, p)) * s;
        rz += -0.9 * s; rx -= 0.2 * s;
      } else {
        const s = Math.sin(p * Math.PI);
        tz -= 0.16 * s; tx -= 0.08 * s; ry += 0.6 * s; rz -= 0.4 * s; ty += 0.03 * s;
      }
    }
    // grenade throw: lower gun, raise throwing hand
    this.throwGroup.visible = false;
    if (this.throwT > 0) {
      this.throwT += dt;
      const p = this.throwT / 0.55;
      if (p >= 1) this.throwT = 0;
      else {
        const low = Math.sin(Math.min(1, p * 1.4) * Math.PI);
        ty -= low * 0.25; rx -= low * 0.6;
        this.throwGroup.visible = p < 0.6;
        const a = smoothstep(0, 0.35, p), b = smoothstep(0.35, 0.6, p);
        this.throwGroup.position.set(-0.12 + b * 0.1, -0.25 + a * 0.2 + b * 0.05, -0.2 - b * 0.25);
        this.throwGroup.rotation.set(a * 0.6 - b * 1.4, 0, 0);
      }
    }

    // apply with smoothing
    const L = st.adsT > 0.02 && st.adsT < 0.98 ? 30 : 22;
    this.pos.set(damp(this.pos.x, tx, L, dt), damp(this.pos.y, ty, L, dt), damp(this.pos.z, tz, L, dt));
    // rotations: direct (already spring-based above), with light smoothing
    this.rot.set(damp(this.rot.x, rx, 20, dt), damp(this.rot.y, ry, 20, dt), damp(this.rot.z, rz, 20, dt));
    gun.group.position.copy(this.pos);
    gun.group.rotation.copy(this.rot);
    gun.group.visible = !(st.scoped);

    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      gun.group.updateMatrixWorld(true);
      gun.muzzle.getWorldPosition(this.flash.position);
      this.flashLight.position.copy(this.flash.position);
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
    if (st.scoped) { this.flash.visible = false; }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
