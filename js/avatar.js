// Third-person character: snapshot interpolation + procedural animation (two-bone IK for
// legs and arms, so feet stay planted when crouching and both hands stay on the gun).
import * as THREE from 'three';
import { makeSoldier, BODY, GRIPS, MOUNT } from './character.js';
import { makeLabelTexture } from './textures.js';
import { hitboxes } from './physics.js';
import { clamp, damp, wrapAngle, lerp } from './util.js';
import { WEAPONS } from './config.js';

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
const _bb = new THREE.Box3(), _mi = new THREE.Matrix4();
const ease = (x) => x * x * (3 - 2 * x);
const seg = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));
const ACT_DUR = { throw: 0.6, knife: 0.42, bash: 0.45 };
// finger curls (radians): index (2 joints), other fingers (2 joints), thumb (toward index side, curl, tip)
const HAND_POSE = {
  grip:   [0.22, 0.95, 1.35, 1.45, 0.6, 0.7, 0.5],   // pistol grip, index pad on the trigger
  ready:  [0.05, 0.05, 1.35, 1.45, 0.6, 0.7, 0.5],   // index straight along the frame (sprinting)
  fore:   [0.95, 0.9, 1.05, 1.15, 0.35, 0.4, 0.3],   // wrapped around the handguard from below
  vfg:    [1.2, 1.25, 1.35, 1.45, 0.55, 0.65, 0.45], // fist around a vertical foregrip
  cup:    [0.75, 0.7, 0.85, 0.95, 0.3, 0.35, 0.25],  // support hand cupping the shooting hand
  mag:    [1.0, 1.0, 1.15, 1.2, 0.7, 0.85, 0.5],     // holding a magazine
  pinch:  [1.1, 1.0, 1.3, 1.4, 0.2, 0.9, 0.6],       // thumb and index working a bolt handle
  fist:   [1.5, 1.5, 1.5, 1.5, 0.5, 1.0, 0.6],       // knife handle
  open:   [0.12, 0.1, 0.15, 0.12, 0.2, 0.15, 0.1],   // just released a grenade
  relax:  [0.35, 0.35, 0.5, 0.5, 0.3, 0.3, 0.2],
};

// where the hands hold each gun, in gun space: p = palm centre, d = wrist → knuckles, n = the way
// the palm faces. The shooting hand is placed from the trigger: knuckles just behind and right of
// it so the index pad lands on the blade and the other fingers wrap the front of the grip.
const PALM = 0.046;       // wrist → palm centre
const HANDS = (() => {
  const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const trig = { ar: [0, 0], smg: [-0.015, 0.01], sg: [-0.002, 0.05], sr: [-0.012, 0.06], lmg: [-0.006, 0.05], pistol: [0.01, -0.012] };
  const rd = v(-0.22, -0.15, -0.96), rn = v(-1, 0, 0.2);
  // support hand under a handguard / pump: palm up and a little right, fingers wrap the far side
  const under = (yb, z) => ({ p: new THREE.Vector3(-0.007, yb - 0.017, z), d: v(0.3, -0.17, -0.94), n: v(0.5, 0.866, 0), pose: 'fore' });
  const out = {};
  for (const [id, [ty, tz]] of Object.entries(trig)) {
    const K = new THREE.Vector3(0.02, ty - 0.04, tz + (id === 'pistol' ? 0.03 : 0.036));
    out[id] = { r: { p: K.addScaledVector(rd, -0.042), d: rd, n: rn, pose: 'grip' } };
  }
  out.ar.l = under(0.006, -0.335);
  out.sg.l = under(-0.008, -0.34);          // on the pump (follows it when racked)
  out.sr.l = under(-0.031, -0.31);
  out.lmg.l = under(0.01, -0.345);
  out.smg.l = { p: new THREE.Vector3(-0.03, -0.04, -0.229), d: v(0.22, -0.05, -0.97), n: v(1, 0, 0.23), pose: 'vfg' };
  out.pistol.l = { p: new THREE.Vector3(-0.058, -0.05, 0.036), d: v(0.25, -0.5, -0.83), n: v(0.92, 0.3, 0.12), pose: 'cup' };
  out.grenade = { r: out.pistol.r, l: null };
  return out;
})();
// orientation of a hand bone (gun space) from where it points and where the palm faces
function handQuat(d, n, s, out) {
  _y.copy(d).multiplyScalar(-1).normalize();
  _x.copy(n).multiplyScalar(-s);
  _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

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

  // a one-off action other players should see: 'throw' (grenade), 'knife', 'bash'
  action(kind) { this.actKind = kind; this.actT = 0.0001; }

  // left hand during a reload (kick space): to the magazine, out, new one in, back.
  // Also moves the gun's magazine with the hand. Returns null when not reloading.
  _reloadHand(gun, grips) {
    if (!(this.flags & 8) || !gun || !gun.mag) { if (gun && gun.magHome) { gun.mag.position.copy(gun.magHome); gun.mag.visible = true; } return null; }
    if (!gun.magHome) {
      gun.magHome = gun.mag.position.clone();
      gun.group.updateMatrixWorld(true);
      _bb.setFromObject(gun.mag).applyMatrix4(_mi.copy(gun.group.matrixWorld).invert());
      gun.magGrip = _bb.isEmpty() ? new THREE.Vector3(0, -0.12, -0.12) : new THREE.Vector3((_bb.min.x + _bb.max.x) / 2, _bb.min.y + 0.025, (_bb.min.z + _bb.max.z) / 2);
    }
    const def = WEAPONS[this.weapon] || WEAPONS.ar;
    const H = grips[1] || [0, -0.03, -0.3], G = gun.magGrip;
    if (def.shellReload) {
      // shells pushed into the loading port, one after another
      const push = Math.max(0, Math.sin(this.game.time * 13));
      return _k.set(H[0] - 0.02 - (1 - push) * 0.05, H[1] - 0.06 - (1 - push) * 0.1, H[2] + 0.22);
    }
    const p = clamp(this.rlClock / (def.reload || 2), 0, 1);
    const out = _p1.set(G.x - 0.1, G.y - 0.42, G.z + 0.18);
    const off = _p2.set(0, 0, 0);
    if (p < 0.12) _k.set(H[0], H[1], H[2]).lerp(G, seg(p, 0, 0.12));
    else if (p < 0.17) _k.copy(G);
    else if (p < 0.33) { _k.copy(G).lerp(out, seg(p, 0.17, 0.33)); off.subVectors(_k, G); }
    else if (p < 0.45) { _k.copy(out); off.set(0, -1, 0); }
    else if (p < 0.6) { _k.copy(out).lerp(_t1.set(G.x, G.y - 0.08, G.z), seg(p, 0.45, 0.6)); off.subVectors(_k, G); }
    else if (p < 0.66) { _k.set(G.x, G.y - 0.08 * (1 - seg(p, 0.6, 0.64)), G.z); off.subVectors(_k, G); }
    else _k.copy(G).lerp(_t1.set(H[0], H[1], H[2]), seg(p, 0.66, 0.85));
    gun.mag.position.copy(gun.magHome).add(off);
    gun.mag.visible = off.y > -0.9;
    return _k;
  }

  fired() {
    this.lastFire = this.game.time;
    const def = WEAPONS[this.weapon];
    if (def && (def.pump || def.bolt)) { this.cycT = 0.0001; this.cycDur = Math.min(1.1, (60 / def.rpm) * 0.85); }
    this.flashT = 0.055;
    this.kickT = 1;
    this.flashScale = 0.8 + Math.random() * 0.5;
    this.flashRot = Math.random() * 6.28;
  }

  getHitboxes() {
    return hitboxes(this.pos.x, this.pos.y, this.pos.z, this.yaw, this.crouch, this.hb);
  }

  // ---------------------------------------------------------------- pose
  // finger joints (bones from character.js), eased toward the pose for this hand
  _fingers(f, s, name, trigger, dt, slot) {
    if (!f) return;
    const P = HAND_POSE[name] || HAND_POSE.relax;
    const cur = (this._fp || (this._fp = [P.slice(), P.slice()]))[slot];
    const k = 1 - Math.exp(-14 * dt);
    for (let i = 0; i < 7; i++) cur[i] += (P[i] - cur[i]) * k;
    const pull = name === 'grip' ? trigger * 0.4 : 0;                 // trigger squeeze on each shot
    f.idx1.rotation.set(0, 0, -s * cur[0]); f.idx2.rotation.set(0, 0, -s * (cur[1] + pull));
    f.fin1.rotation.set(0, 0, -s * cur[2]); f.fin2.rotation.set(0, 0, -s * cur[3]);
    f.th1.rotation.set(cur[4], 0, -s * cur[5]); f.th2.rotation.set(0, 0, -s * cur[6]);
  }

  _pose(dt, hs) {
    const c = this.char;
    // turning on the spot: the feet shuffle round with the body
    const yawRate = wrapAngle(this.yaw - (this._yawPrev ?? this.yaw)) / Math.max(dt, 1e-3);
    this._yawPrev = this.yaw;
    this._turnK = damp(this._turnK || 0, Math.min(1, Math.abs(yawRate) / 2.5), 6, dt);
    if (hs < 0.35 && this._turnK > 0.35 && !(this.flags & 2)) { hs = 1.4 * this._turnK; this._turnStep = Math.sign(yawRate) || 1; } else this._turnStep = 0;
    const cr = this.crouchT, sp = this.sprintT, rl = this.reloadT;
    // crouched and still: kneel on the right knee; crouched and moving: a low walk on both feet
    this.kneelT = damp(this.kneelT ?? 0, this.crouch && hs < 0.6 ? 1 : 0, 5, dt);
    const kn = Math.min(cr, this.kneelT), cw = cr - kn;
    const air = this.airT;
    const moving = hs > 0.35;
    const amp = moving ? clamp(hs / 5, 0.25, 1.3) : 0;
    // local (body-space) velocity direction
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const lx = this.vel.x * cy - this.vel.z * sy, lz = this.vel.x * sy + this.vel.z * cy;
    const ln = Math.hypot(lx, lz) || 1;
    let dirX = lx / ln, dirZ = lz / ln;
    if (this._turnStep) { dirX = this._turnStep * 0.8; dirZ = 0.2; }
    // ---- gait timing: one cycle = a left and a right step ----
    // stance share falls from walking to sprinting; cadence rises with speed; the step length is
    // what the legs can reach, so the feet only slide a little at the game's fast running speeds
    const runK = clamp((hs - 2.8) / 1.6, 0, 1) * (1 - cr);              // walk → run blend
    const D = lerp(lerp(0.62, 0.4, runK), 0.33, sp);
    const cps = clamp(0.75 + hs * 0.17, 0.75, 1.95);                     // cycles per second
    // feet land a little ahead of the hips and push off well behind (heel up gives extra reach)
    const reach = hs * D / (2 * cps);                                    // half the ground contact length
    const strideF = Math.min(reach * 0.85, lerp(lerp(0.24, 0.3, runK), 0.34, sp)) * (1 - cr * 0.4);
    const strideB = Math.min(reach * 1.15, lerp(lerp(0.28, 0.42, runK), 0.5, sp)) * (1 - cr * 0.4);
    const stride = (strideF + strideB) / 2;
    if (moving) this.phase += dt * cps * Math.PI * 2;
    else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 6, dt);
    const ph = this.phase;
    const sn = Math.sin(ph), cs = Math.cos(ph);
    const mid = Math.cos(ph - Math.PI * D);                              // +1 at left mid-stance, -1 at right

    // ---- hips: bob, sway over the standing leg, turn and tilt with the stride ----
    const t = this.game.time;
    const idle = moving ? 0 : 1;
    const bobK = Math.cos(2 * (ph - Math.PI * D));                       // highest at mid-stance when walking
    // walking vaults over a straight leg (highest at mid-stance); running sinks into it
    const bob = moving ? amp * (lerp(0.016, -0.028, Math.max(sp, runK)) * bobK - lerp(0.004, 0.05, runK)) : 0;
    const sway = -mid * 0.024 * amp * (1 - sp * 0.6) * (1 - cr * 0.5) + idle * Math.sin(t * 0.55) * 0.012;
    // pelvis sits a little higher than the rest pose so standing legs are nearly straight;
    // the spine drops by the same amount so the torso stays where it is
    const hipUp = 0.017 * (1 - cr);
    c.spine.position.y = 0.06 - hipUp;
    c.hips.position.set(sway, lerp(BODY.hipY, 0.52, cr) + cw * 0.08 + hipUp + bob + air * 0.04 + idle * Math.sin(t * 1.1) * 0.003, lerp(0, 0.1, cr));
    const hipYaw = -cs * 0.11 * amp * (1 - cr), hipRoll = -mid * 0.045 * amp * (1 - cr) + idle * Math.sin(t * 0.55) * 0.02;
    c.hips.rotation.set(0, hipYaw, hipRoll);
    // ---- spine / chest / head ----
    const mt = MOUNT[this.weapon] || MOUNT.ar;
    const twist = lerp(mt.twist, -0.05, sp);
    const lean = -(cr * 0.38 + sp * 0.2 + (moving ? 0.03 + runK * 0.07 : 0));
    // the spine turns back against the hips so the shoulders and the gun stay steady
    const spineY = -hipYaw * 0.75 + twist * 0.4;
    c.spine.rotation.set(lean, spineY, -hipRoll * 0.7);
    const breath = Math.sin(t * 1.7) * 0.012 * (0.5 + idle * 0.5);
    const chestX = -cr * 0.12 + clamp(this.pitch, -1.2, 1.2) * 0.22 + breath;
    c.chest.rotation.set(chestX, twist * 0.6, -hipRoll * 0.3);
    const bodyPitch = lean + chestX, bodyYaw = spineY + twist * 0.6 + c.hips.rotation.y;
    // shoulders roll forward when the rifle is shouldered, relax when sprinting
    const aimK = (1 - sp) * (this.weapon === 'knife' ? 0.3 : 1);
    c.upR.position.set(BODY.shoulderX - 0.01 * aimK, BODY.shoulderY + 0.012 * aimK, -0.028 * aimK);
    c.upL.position.set(-BODY.shoulderX + 0.012 * aimK, BODY.shoulderY + 0.006 * aimK, -0.045 * aimK);
    // head and gun cancel the body's lean and twist so they follow the real aim
    c.neck.rotation.set(0, -bodyYaw * 0.5, 0);
    c.head.rotation.set(clamp(this.pitch * 0.8 - bodyPitch, -0.9, 0.9), -bodyYaw * 0.5, 0);
    // ---- gun: points along the true aim, lowered when sprinting, canted when reloading ----
    const kick = this.kickT;
    // one-off actions: grenade throw lowers the gun, knife swings across, rifle butt thrusts
    const act = this.actT > 0 ? clamp(this.actT / (ACT_DUR[this.actKind] || 0.5), 0, 1) : 0;
    const aS = act ? Math.sin(act * Math.PI) : 0;
    let aX = 0, aY = 0, aZ = 0, mZ = 0;
    if (this.actKind === 'throw') { aX -= 0.95 * aS; aZ += 0.3 * aS; }
    else if (this.actKind === 'knife') { aY += lerp(0.9, -1.0, seg(act, 0.1, 0.6)) * aS; aX -= 0.25 * aS; mZ -= 0.14 * aS; }
    else if (this.actKind === 'bash') { mZ -= 0.22 * aS; aX += 0.35 * aS; aZ -= 0.4 * aS; }
    c.aim.rotation.set(
      this.pitch - bodyPitch + lerp(0, -0.6, sp) + lerp(0, -0.3, rl) + kick * 0.06 + aX,
      -bodyYaw + lerp(0, 0.5, sp) + aY,
      lerp(0, 0.65, rl) + aZ, 'YXZ');
    const mp = mt.p;
    c.gunMount.position.set(lerp(mp[0], 0.02, sp), lerp(mp[1], -0.1, sp) + rl * 0.04, lerp(mp[2], -0.24, sp) + mZ);
    c.kick.position.set(0, kick * 0.012, kick * 0.045);
    c.kick.rotation.set(kick * 0.1, 0, 0);

    // ---- legs (IK in hips space): heel strike → flat foot → heel off → toe off → swing ----
    const H = c.hips.position;
    const lift = lerp(lerp(0.07, 0.15, runK), 0.24, sp) * (1 - cr * 0.5);
    const heelK = lerp(lerp(0.02, 0.14, runK), 0.24, sp) * (1 - cr);    // heel flick behind in a run
    for (let i = 0; i < 2; i++) {
      const left = i === 0, s = left ? -1 : 1;
      const f = this.feet[i];
      // stance: a rifleman's stance, left foot a little ahead, toes slightly out
      let x = lerp(left ? -0.11 : 0.12, left ? -0.13 : 0.15, cr);
      let y = lerp(ANKLE, left ? ANKLE : ANKLE + 0.07, kn);
      let z = lerp(left ? -0.05 : 0.07, left ? -0.32 : 0.36, kn) + cw * (left ? -0.06 : 0.06);
      let pitch = lerp(0, left ? 0 : -0.95, kn), toeBend = lerp(0, left ? 0 : 0.95, kn);
      const yawOut = s * (0.12 + idle * 0.08) * (1 - runK * 0.5);
      if (moving) {
        // feet come in under the body when moving (narrower base), more so when running
        x = lerp(x, s * lerp(0.1, 0.075, runK), Math.min(1, amp * 1.5));
        z = lerp(z, 0, Math.min(1, amp * 1.5) * (1 - kn));
      }
      if (moving && air < 0.5) {
        const u = ((((ph + (left ? 0 : Math.PI)) / (Math.PI * 2)) % 1) + 1) % 1;
        if (u < D) {
          // on the ground: the foot travels from in front to behind the hips
          const k = u / D, d = lerp(strideF, -strideB, k);
          x += dirX * d; z += dirZ * d;
          if (k < 0.18) pitch += lerp(lerp(0.26, 0.08, runK), 0, k / 0.18);      // heel strike, toes up
          else if (k > 0.55) pitch -= lerp(0.55, 0.85, runK) * ease((k - 0.55) / 0.45); // heel rises, push off
        } else {
          // swing: toe off, the heel flicks up behind, the knee drives forward, toes lift to land
          const k = (u - D) / (1 - D);
          const fw = ease(clamp((k - 0.12 * runK) / (1 - 0.12 * runK), 0, 1));
          const d = lerp(-strideB, strideF, fw);
          x += dirX * d; z += dirZ * d;
          y += Math.sin(Math.PI * Math.pow(k, 0.75)) * lift + Math.sin(Math.PI * clamp(k * 1.6, 0, 1)) * heelK;
          pitch += lerp(lerp(-0.7, -1.1, runK), lerp(0.25, 0.1, runK), ease(Math.min(1, k * 1.25)));
          // the hip swings the foot slightly in, toward the line of travel
          x -= s * Math.sin(Math.PI * k) * 0.02;
        }
        // heel off: the ankle lifts around the ball of the foot and the toe joint bends
        if (pitch < 0 && u < D) { y += 0.118 * Math.sin(-pitch); toeBend = Math.max(toeBend, -pitch * 0.9); }
        else if (pitch < 0) toeBend = Math.max(toeBend, -pitch * 0.25 * (1 - (u - D) / (1 - D)));
      }
      // in the air: tuck
      x = lerp(x, left ? -0.12 : 0.13, air); y = lerp(y, ANKLE + 0.34, air); z = lerp(z, left ? -0.14 : 0.1, air);
      pitch = lerp(pitch, 0.3, air);
      f.set(x, y, z);
      _tg.set(f.x - H.x, f.y - H.y, f.z - H.z);
      _pl.set(0.12 * s + cw * s * 0.25, -cr * 0.1 - (left ? 0 : kn * 0.45), -1);
      _e.set(pitch, yawOut, 0); _cq.setFromEuler(_e);
      // feet are expressed in hips space; undo the hips' turn and tilt so they stay planted
      _gq.copy(c.hips.quaternion).invert();
      _tg.applyQuaternion(_gq); _pl.applyQuaternion(_gq); _cq.premultiply(_gq);
      solveTwoBone(left ? c.thighL : c.thighR, left ? c.shinL : c.shinR, BODY.thigh, BODY.shin, _tg, _pl, -1, _cq, left ? c.footL : c.footR);
      const toeB = left ? c.toeL : c.toeR;
      if (toeB) toeB.rotation.x = toeBend;
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
    // pump / bolt cycling after a shot (shotgun pump, sniper bolt, pistol slide)
    const hands = HANDS[this.weapon] || HANDS.ar;
    const cyc = this.cycT > 0 ? clamp(this.cycT / this.cycDur, 0, 1) : 0;
    const cycK = cyc < 0.22 ? 0 : cyc < 0.8 ? Math.sin(((cyc - 0.22) / 0.58) * Math.PI) : 0;
    if (gun && gun.pump) gun.pump.position.z = cycK * 0.09;
    const boltHand = gun && gun.bolt && this.weapon === 'sr' ? seg(cyc, 0.04, 0.2) * (1 - seg(cyc, 0.82, 0.97)) : 0;
    if (gun && gun.bolt) {
      if (this.weapon === 'sr') { gun.bolt.position.z = cycK * 0.08; gun.bolt.rotation.z = cycK * 0.9; }
      else if (this.weapon === 'pistol') gun.bolt.position.z = kick * 0.035;
    }
    for (let i = 0; i < 2; i++) {
      const right = i === 0, s = right ? 1 : -1;
      const up = right ? c.upR : c.upL, fo = right ? c.foR : c.foL, ha = right ? c.haR : c.haL;
      let g = grips[right ? 0 : 1];
      const hp = hands[right ? 'r' : 'l'];
      let reloading = false, pose = null;
      const rh = !right ? this._reloadHand(gun, grips) : null;
      if (rh) { g = [rh.x, rh.y, rh.z]; reloading = true; }
      const throwing = !right && this.actKind === 'throw' && act > 0;
      if (throwing) {
        // left hand winds back and throws forward (chest space)
        const w = seg(act, 0, 0.45), f = seg(act, 0.45, 0.75);
        _tg.set(lerp(-0.22, -0.12, f), lerp(0.05, 0.28, w) - f * 0.05, lerp(0.15, -0.5, f));
        _e.set(0.4 - f * 1.2, 0, 0.3); _qd.setFromEuler(_e);
        pose = act > 0.55 ? 'open' : 'fist';
      } else if (hp && !reloading && g) {
        // hand placed on the gun: orientation from the table, wrist so the palm lands on p
        handQuat(hp.d, hp.n, s, _qd);
        _tg.copy(hp.p);
        if (!right && gun && gun.pump) _tg.z += gun.pump.position.z;
        pose = hp.pose;
        if (right && boltHand > 0) {
          // right hand leaves the grip, lifts the bolt handle, pulls it back and pushes it home
          _p1.set(0.064, 0.05, 0.09 + (gun.bolt ? gun.bolt.position.z : 0));
          _p1.y += Math.sin(gun.bolt ? gun.bolt.rotation.z : 0) * 0.025;
          _tg.lerp(_p1, boltHand);
          handQuat(_t1.set(-0.5, -0.6, -0.62), _t2.set(-0.6, -0.1, 0.8), s, _q2);
          _qd.slerp(_q2, boltHand);
          if (boltHand > 0.5) pose = 'pinch';
        }
        _p2.set(0, -PALM, 0).applyQuaternion(_qd);
        _tg.sub(_p2);
        c.kick.localToWorld(_tg).applyMatrix4(_inv);
        _qd.premultiply(gunInChest);
      } else if (g) {
        // reload hand (magazine) or a gun without a table entry: wrist near the contact point
        _tg.set(g[0], g[1] - (right ? 0.02 : 0.03), g[2] + (right ? 0.05 : 0.065));
        if (reloading) _tg.set(g[0], g[1], g[2]);
        c.kick.localToWorld(_tg).applyMatrix4(_inv);
        _e.set(Math.PI / 2 - (right ? 0.55 : 0.15), 0, right ? 0 : 0.6); _qd.setFromEuler(_e);
        _qd.premultiply(gunInChest);
        pose = reloading ? 'mag' : right ? 'grip' : 'fore';
      } else {
        // free hand (knife): in front of the stomach
        _tg.set(-0.16, -0.08, -0.2);
        _e.set(0.6, 0, 0); _qd.setFromEuler(_e);
        pose = 'relax';
      }
      _pl.set(right ? 0.9 : -0.55, -0.75, right ? 0.25 : 0.15);
      solveTwoBone(up, fo, BODY.upperArm, BODY.foreArm, _tg, _pl, 1, _qd, ha);
      // fingers wrap whatever this hand holds; the index finger works the trigger
      if (right) pose = this.weapon === 'knife' ? 'fist' : sp > 0.5 && pose === 'grip' ? 'ready' : pose;
      this._fingers(right ? c.fingersR : c.fingersL, s, pose, right ? this.kickT : 0, dt, right ? 0 : 1);
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
    this.rlClock = this.flags & 8 ? (this.rlClock || 0) + dt : 0;
    if (this.cycT > 0) { this.cycT += dt; if (this.cycT > this.cycDur || this.flags & 8) this.cycT = 0; }
    if (this.actT > 0) { this.actT += dt; if (this.actT > (ACT_DUR[this.actKind] || 0.5)) this.actT = 0; }
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
      const ally = this.game.isAlly && this.game.isAlly(this.id);
      this.visibleTag = ally ? d < 120 : d < 45 && this.game.world.los(camPos.x, camPos.y, camPos.z, this.pos.x, this.pos.y + 1.5, this.pos.z);
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
