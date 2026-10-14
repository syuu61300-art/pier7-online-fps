// Third-person character: snapshot interpolation + procedural animation (two-bone IK for
// legs and arms, so feet stay planted when crouching and both hands stay on the gun).
import * as THREE from 'three';
import { makeSoldier, BODY, GRIPS, MOUNT } from './character.js';
import { makeLabelTexture } from './textures.js';
import { hitboxes } from './physics.js';
import { clamp, damp, wrapAngle, lerp } from './util.js';

const INTERP_DELAY = 110; // ms
const ANKLE = 0.083;      // ankle height when the sole is on the ground
const DOWN = new THREE.Vector3(0, -1, 0);

// ---------- IK scratch ----------
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _k = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _e = new THREE.Euler(), _qd = new THREE.Quaternion(), _inv = new THREE.Matrix4();
const _gq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _tg = new THREE.Vector3(), _pl = new THREE.Vector3();

// orientation whose local -Y points along `axis` and local `fwdSign`·Z leans toward `pole`
function basisQuat(axis, pole, fwdSign, out) {
  _y.copy(axis).multiplyScalar(-1).normalize();               // local +Y = back up the limb
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize().multiplyScalar(fwdSign);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

// Two-bone chain: `upper` at its rest position in the parent space, `lower` a child
// `l1` below it, end effector `l2` below `lower`. target/pole in the parent space.
// fwdSign: -1 makes the limb's -Z face the pole (knees), +1 its +Z (elbows).
function solveTwoBone(upper, lower, l1, l2, target, pole, fwdSign, endQuat, endBone) {
  const S = upper.position;
  _d.subVectors(target, S);
  let len = _d.length();
  if (len < 1e-5) { _d.set(0, -1, 0); len = 1e-5; }
  _u.copy(_d).divideScalar(len);
  len = clamp(len, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _v.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_v.lengthSq() < 1e-8) _v.set(0, 0, -1);
  _v.normalize();
  const cosA = clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _k.copy(S).addScaledVector(_u, l1 * cosA).addScaledVector(_v, l1 * sinA);   // knee / elbow
  _t1.subVectors(_k, S);
  basisQuat(_t1, _v, fwdSign, _q1);
  upper.quaternion.copy(_q1);
  // lower bone: world (parent-space) orientation, then expressed relative to upper
  _t2.copy(S).addScaledVector(_u, len).sub(_k);
  basisQuat(_t2, _v, fwdSign, _q2);
  _qi.copy(_q1).invert();
  lower.quaternion.copy(_qi).multiply(_q2);
  if (endBone && endQuat) {
    _qi.copy(_q2).invert();
    endBone.quaternion.copy(_qi).multiply(endQuat);
  }
}

export class Avatar {
  constructor(game, id, name, color, isBot = false) {
    this.game = game;
    this.id = id;
    this.isBot = isBot;
    this.name = name;
    this.color = color;
    this.char = makeSoldier(color);
    this.root = this.char.root;
    this.root.rotation.order = 'YXZ';
    game.scene.add(this.root);
    this.char.setWeapon('ar');
    this.weapon = 'ar';
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.lvel = new THREE.Vector2();
    this.yaw = 0; this.pitch = 0;
    this.crouch = false; this.crouchT = 0; this.sprintT = 0; this.reloadT = 0; this.airT = 0;
    this.alive = false;
    this.flags = 0;
    this.snaps = [];
    this.phase = 0;
    this.stepDist = 0;
    this.deathT = 0;
    this.lastFire = -10;
    this.kickT = 0;
    this._lodSkip = 0;
    this.hb = [];
    this.visibleTag = false;
    this._tagCheck = 0;
    this.kills = 0; this.deaths = 0;
    this.feet = [new THREE.Vector3(-0.11, ANKLE, 0), new THREE.Vector3(0.12, ANKLE, 0)];
    // name tag
    this.tagMat = new THREE.SpriteMaterial({ map: makeLabelTexture(name, color), depthTest: true, transparent: true });
    this.tag = new THREE.Sprite(this.tagMat);
    this.tag.scale.set(1.3, 0.325, 1);
    this.tag.visible = false;
    this.tag.renderOrder = 6;
    game.scene.add(this.tag);
    // third-person muzzle flash: a star sprite facing the camera + crossed planes along the barrel
    const T = game.textures;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd9a0 }));
    this.flash.visible = false;
    game.scene.add(this.flash);
    const fm = new THREE.MeshBasicMaterial({ map: T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, color: 0xffc070 });
    const pg = new THREE.PlaneGeometry(0.22, 0.5);
    pg.translate(0, 0.25, 0);
    pg.rotateX(-Math.PI / 2); // extends along -Z (out of the barrel)
    this.flashCone = new THREE.Group();
    for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(pg, fm); m.rotation.z = r; this.flashCone.add(m); }
    this.flashCone.visible = false;
    this._flashGeo = pg; this._flashMat = fm;
    this.flashT = 0;
    this.root.visible = false;
  }

  setName(name, color) {
    if (name === this.name && color === this.color) return;
    this.name = name;
    if (color !== this.color) { this.color = color; this.char.setColor(color); }
    this.tagMat.map.dispose();
    this.tagMat.map = makeLabelTexture(name, color);
    this.tagMat.needsUpdate = true;
  }

  // network snapshot (t in local ms)
  pushSnap(t, x, y, z, yaw, pitch, flags, weapon) {
    const s = this.snaps;
    if (s.length && t <= s[s.length - 1].t) t = s[s.length - 1].t + 1;
    s.push({ t, x, y, z, yaw, pitch, flags, weapon });
    if (s.length > 30) s.shift();
    if (!this.alive && (flags & 1)) {
      this.pos.set(x, y, z); this.prev.copy(this.pos);
      this.yaw = yaw; this.pitch = pitch;
      this.deathT = 0;
    }
  }

  sample(now) {
    const s = this.snaps;
    if (!s.length) return;
    const rt = now - (this.game.interpDelay || INTERP_DELAY);
    let a = s[0], b = null;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= rt) { a = s[i]; b = s[i + 1] || null; break; }
    }
    let x, y, z, yaw, pitch;
    if (b) {
      const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
      x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k); z = lerp(a.z, b.z, k);
      yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
      pitch = lerp(a.pitch, b.pitch, k);
    } else {
      const last = s[s.length - 1], pre = s[s.length - 2];
      x = last.x; y = last.y; z = last.z; yaw = last.yaw; pitch = last.pitch;
      if (pre && (last.flags & 1)) {
        const dtm = Math.min(120, rt - last.t);
        const span = Math.max(1, last.t - pre.t);
        if (dtm > 0) {
          const k = dtm / span;
          x += (last.x - pre.x) * k * 0.6; z += (last.z - pre.z) * k * 0.6;
        }
      }
      a = last;
    }
    if (Math.hypot(x - this.pos.x, z - this.pos.z) > 6) this.prev.set(x, y, z);
    this.pos.set(x, y, z);
    this.yaw = yaw; this.pitch = pitch;
    this.setFlags(a.flags);
    this.setWeapon(a.weapon);
  }

  setFlags(f) {
    const wasAlive = this.alive;
    this.flags = f;
    this.alive = !!(f & 1);
    this.crouch = !!(f & 2);
    if (wasAlive && !this.alive) this.deathT = 0.0001;
  }

  setWeapon(id) {
    if (!id || id === this.weapon) return;
    this.weapon = id;
    this.char.setWeapon(id);
  }

  setDirect(x, y, z, yaw, pitch, flags, weapon) {
    this.pos.set(x, y, z);
    this.yaw = yaw; this.pitch = pitch;
    this.setFlags(flags);
    this.setWeapon(weapon);
  }

  muzzlePos(out) {
    const g = this.char.gun;
    if (g && this.root.visible) {
      this.root.updateMatrixWorld(true);
      g.muzzle.getWorldPosition(out);
    } else {
      out.set(this.pos.x, this.pos.y + (this.crouch ? 1.05 : 1.45), this.pos.z);
    }
    return out;
  }

  // world direction the barrel points (for flash cones, smoke and casings)
  muzzleDir(out) {
    const g = this.char.gun;
    if (!g) return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    g.group.getWorldQuaternion(_qd);
    return out.set(0, 0, -1).applyQuaternion(_qd);
  }
  ejectPos(out) {
    const g = this.char.gun;
    if (!g) return this.muzzlePos(out);
    return g.eject.getWorldPosition(out);
  }

  fired() {
    this.lastFire = this.game.time;
    this.flashT = 0.055;
    this.kickT = 1;
    this.flashScale = 0.8 + Math.random() * 0.5;
    this.flashRot = Math.random() * 6.28;
  }

  getHitboxes() {
    return hitboxes(this.pos.x, this.pos.y, this.pos.z, this.yaw, this.crouch, this.hb);
  }

  // ---------------------------------------------------------------- pose
  _pose(dt, hs) {
    const c = this.char;
    const cr = this.crouchT, sp = this.sprintT, rl = this.reloadT;
    const air = this.airT;
    const moving = hs > 0.35;
    const amp = moving ? clamp(hs / 5, 0.25, 1.3) : 0;
    // local (body-space) velocity direction
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const lx = this.vel.x * cy - this.vel.z * sy, lz = this.vel.x * sy + this.vel.z * cy;
    const ln = Math.hypot(lx, lz) || 1;
    const dirX = lx / ln, dirZ = lz / ln;
    const stride = clamp(hs * 0.085, 0, 0.42) * (1 - cr * 0.45) * (1 + sp * 0.15);
    if (moving) this.phase += dt * hs / Math.max(0.18, stride) * 0.78;
    else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 6, dt);
    const ph = this.phase;
    const sn = Math.sin(ph), cs = Math.cos(ph);

    // ---- hips ----
    const bob = Math.abs(sn) * 0.035 * amp;
    c.hips.position.set(0, lerp(BODY.hipY, 0.52, cr) - bob + air * 0.04, lerp(0, 0.1, cr));
    c.hips.rotation.set(0, sn * 0.08 * amp * (1 - cr), 0);
    // ---- spine / chest / head ----
    const mt = MOUNT[this.weapon] || MOUNT.ar;
    const twist = lerp(mt.twist, -0.05, sp);
    const lean = -(cr * 0.38 + sp * 0.2 + (moving ? 0.04 : 0));
    const spineY = -sn * 0.06 * amp * (1 - cr) + twist * 0.4;
    c.spine.rotation.set(lean, spineY, 0);
    const chestX = -cr * 0.12 + clamp(this.pitch, -1.2, 1.2) * 0.22;
    c.chest.rotation.set(chestX, twist * 0.6, 0);
    const bodyPitch = lean + chestX, bodyYaw = spineY + twist * 0.6 + c.hips.rotation.y;
    // head and gun cancel the body's lean and twist so they follow the real aim
    c.neck.rotation.set(0, -bodyYaw * 0.5, 0);
    c.head.rotation.set(clamp(this.pitch * 0.8 - bodyPitch, -0.9, 0.9), -bodyYaw * 0.5, 0);
    // ---- gun: points along the true aim, lowered when sprinting, canted when reloading ----
    const kick = this.kickT;
    c.aim.rotation.set(
      this.pitch - bodyPitch + lerp(0, -0.6, sp) + lerp(0, -0.35, rl) + kick * 0.06,
      -bodyYaw + lerp(0, 0.5, sp),
      lerp(0, 0.55, rl), 'YXZ');
    const mp = mt.p;
    c.gunMount.position.set(lerp(mp[0], 0.02, sp), lerp(mp[1], -0.1, sp), lerp(mp[2], -0.24, sp));
    c.kick.position.set(0, kick * 0.012, kick * 0.045);
    c.kick.rotation.set(kick * 0.1, 0, 0);

    // ---- legs (IK in hips space) ----
    const H = c.hips.position;
    for (let i = 0; i < 2; i++) {
      const left = i === 0, s = left ? -1 : 1;
      const f = this.feet[i];
      // stance target
      let x = lerp(left ? -0.11 : 0.12, left ? -0.13 : 0.15, cr);
      let y = lerp(ANKLE, left ? ANKLE : ANKLE + 0.07, cr);
      let z = lerp(left ? -0.04 : 0.06, left ? -0.32 : 0.36, cr);
      let toe = lerp(0, left ? 0 : -0.95, cr);
      if (moving && air < 0.5) {
        const o = left ? sn : -sn, swing = Math.max(0, left ? cs : -cs);
        x += dirX * stride * o; z += dirZ * stride * o;
        y += swing * (0.11 + sp * 0.07) * (1 - cr * 0.4) * Math.min(1, amp * 1.4);
        toe += swing * 0.25 - (o < -0.6 ? 0.2 : 0);
      }
      // in the air: tuck
      x = lerp(x, left ? -0.12 : 0.13, air); y = lerp(y, ANKLE + 0.34, air); z = lerp(z, left ? -0.14 : 0.1, air);
      f.set(x, y, z);
      _tg.set(f.x - H.x, f.y - H.y, f.z - H.z);
      _pl.set(0.12 * s, cr * (left ? -0.1 : -0.55), -1);
      _e.set(toe, 0, 0); _cq.setFromEuler(_e);
      // feet are expressed in hips space; undo the hips' small yaw so they stay planted
      _gq.copy(c.hips.quaternion).invert();
      _tg.applyQuaternion(_gq); _pl.applyQuaternion(_gq); _cq.premultiply(_gq);
      solveTwoBone(left ? c.thighL : c.thighR, left ? c.shinL : c.shinR, BODY.thigh, BODY.shin, _tg, _pl, -1, _cq, left ? c.footL : c.footR);
    }

    // ---- arms (IK in chest space to the gun's grips) ----
    c.root.updateMatrixWorld(true);
    const gun = c.gun;
    const grips = GRIPS[this.weapon] || GRIPS.ar;
    _inv.copy(c.chest.matrixWorld).invert();
    // chest-space orientation of the gun
    c.kick.getWorldQuaternion(_gq);
    c.chest.getWorldQuaternion(_cq);
    const gunInChest = _cq.invert().multiply(_gq);
    for (let i = 0; i < 2; i++) {
      const right = i === 0;
      const up = right ? c.upR : c.upL, fo = right ? c.foR : c.foL, ha = right ? c.haR : c.haL;
      let g = grips[right ? 0 : 1];
      let reloading = false;
      if (!right && rl > 0.5 && gun && gun.mag) { g = [gun.mag.position.x, -0.12 + Math.sin(this.game.time * 9) * 0.02, -0.12]; reloading = true; }
      if (g) {
        // wrist sits a little behind and below the contact point
        _tg.set(g[0], g[1] - (right ? 0.02 : 0.03), g[2] + (right ? 0.05 : 0.065));
        if (reloading) _tg.set(g[0], g[1], g[2]);
        c.kick.localToWorld(_tg).applyMatrix4(_inv);
        _e.set(Math.PI / 2 - (right ? 0.55 : 0.15), 0, right ? 0 : 0.6); _qd.setFromEuler(_e);
        _qd.premultiply(gunInChest);
      } else {
        // free hand (knife): in front of the stomach
        _tg.set(-0.16, -0.08, -0.2);
        _e.set(0.6, 0, 0); _qd.setFromEuler(_e);
      }
      _pl.set(right ? 0.9 : -0.55, -0.75, right ? 0.25 : 0.15);
      solveTwoBone(up, fo, BODY.upperArm, BODY.foreArm, _tg, _pl, 1, _qd, ha);
    }
  }

  update(dt, camPos) {
    const c = this.char;
    this.vel.subVectors(this.pos, this.prev).divideScalar(Math.max(dt, 1e-3));
    this.prev.copy(this.pos);
    const hs = Math.min(9, Math.hypot(this.vel.x, this.vel.z));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.crouchT = damp(this.crouchT, this.crouch ? 1 : 0, 10, dt);
    this.sprintT = damp(this.sprintT, this.flags & 16 ? 1 : 0, 8, dt);
    this.reloadT = damp(this.reloadT, this.flags & 8 ? 1 : 0, 10, dt);
    const ground = !!(this.flags & 32) || this.isBot;
    this.airT = damp(this.airT, ground ? 0 : 1, 9, dt);
    this.kickT = Math.max(0, this.kickT - dt * 14);

    if (!this.alive) {
      if (this.deathT > 0) {
        this.deathT += dt;
        const k = clamp(this.deathT / 0.65, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        // knees give way, then the body falls backwards
        this.crouchT = Math.max(this.crouchT, Math.min(1, this.deathT * 3) * 0.6);
        this.sprintT = 0; this.airT = 0;
        this.pitch = lerp(this.pitch, -0.9, Math.min(1, dt * 6));
        this._pose(dt, 0);
        this.root.rotation.x = -e * 1.35;
        this.root.position.y = this.pos.y + Math.sin(e * Math.PI) * 0.12 - e * 0.25;
        this.root.visible = this.deathT < 4.5;
      } else {
        this.root.visible = false;
      }
      this.tag.visible = false;
      this.flash.visible = false;
      this.flashCone.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.rotation.x = 0;

    // cheap level of detail: far avatars animate at a lower rate
    const far = camPos ? this.pos.distanceToSquared(camPos) > 55 * 55 : false;
    this._lodSkip = far ? (this._lodSkip + 1) % 3 : 0;
    if (!this._lodSkip) this._pose(far ? dt * 3 : dt, hs);

    // spawn protection shimmer
    const prot = !!(this.flags & 64);
    c.accent.emissiveIntensity = prot ? 0.6 + Math.sin(this.game.time * 14) * 0.5 : 0.35;

    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.muzzlePos(this.flash.position);
      const s = this.flashScale || 1;
      this.flash.scale.set(0.42 * s, 0.42 * s, 1);
      this.flash.material.rotation = this.flashRot || 0;
      this.flash.visible = true;
      if (!this.flashCone.parent && c.gun) c.gun.muzzle.add(this.flashCone);
      this.flashCone.scale.set(s, s, s * (0.8 + Math.random() * 0.6));
      this.flashCone.rotation.z = this.flashRot || 0;
      this.flashCone.visible = true;
    } else { this.flash.visible = false; this.flashCone.visible = false; }
    if (this.flashCone.parent && c.gun && this.flashCone.parent !== c.gun.muzzle) { this.flashCone.parent.remove(this.flashCone); }

    // footsteps (positional)
    if (hs > 0.4 && ground && !this.crouch && camPos) {
      this.stepDist += hs * dt;
      if (this.stepDist > 1.7) {
        this.stepDist = 0;
        const d = this.pos.distanceTo(camPos);
        if (d < 32) this.game.sound.step(this.pos, false, (this.flags & 16 ? 0.45 : 0.3));
      }
    }

    // name tag with line-of-sight check (no seeing names through walls)
    this.tag.position.set(this.pos.x, this.pos.y + (this.crouch ? 1.55 : 2.08), this.pos.z);
    this._tagCheck -= dt;
    if (this._tagCheck <= 0 && camPos) {
      this._tagCheck = 0.2;
      const d = this.pos.distanceTo(camPos);
      this.visibleTag = d < 45 && this.game.world.los(camPos.x, camPos.y, camPos.z, this.pos.x, this.pos.y + 1.5, this.pos.z);
    }
    this.tag.visible = this.visibleTag;
  }

  dispose() {
    this.game.scene.remove(this.root, this.tag, this.flash);
    if (this.flashCone.parent) this.flashCone.parent.remove(this.flashCone);
    this.char.dispose();
    this.tagMat.map.dispose(); this.tagMat.dispose();
    this.flash.material.dispose();
    this._flashGeo.dispose(); this._flashMat.dispose();
  }
}
