// Procedural gun models (shared by the first-person view and third-person soldiers) and grenades.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Merge sibling meshes that share a material into one mesh (per group, recursively),
// keeping animated sub-groups and anchor objects intact. Cuts draw calls ~3-4x.
export function mergeStatic(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (c.isMesh && !c.userData.keep) {
      c.updateMatrix();
      const g = c.geometry.clone().applyMatrix4(c.matrix);
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(g);
      group.remove(c);
      c.geometry.dispose();
    } else if (c.isGroup || (c.isObject3D && c.children.length)) {
      mergeStatic(c);
    }
  }
  for (const [mat, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((g) => (g.index ? g : g)), false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

const MAT = {};
function mats() {
  if (MAT.ready) return MAT;
  const s = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 0.9 }, o));
  MAT.gunmetal = s({ color: 0x2c3035, roughness: 0.35, metalness: 0.75 });
  MAT.polymer = s({ color: 0x1d1f22, roughness: 0.65, metalness: 0.1 });
  MAT.tan = s({ color: 0x8f7752, roughness: 0.7, metalness: 0.05 });
  MAT.olive = s({ color: 0x4d5440, roughness: 0.7, metalness: 0.05 });
  MAT.wood = s({ color: 0x6a4325, roughness: 0.6, metalness: 0.0 });
  MAT.steel = s({ color: 0x8b9096, roughness: 0.3, metalness: 0.9 });
  MAT.brass = s({ color: 0xc9a14a, roughness: 0.3, metalness: 0.9 });
  MAT.lens = s({ color: 0x223844, roughness: 0.05, metalness: 0.9, envMapIntensity: 2 });
  MAT.dot = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  MAT.knife = s({ color: 0xb8bec4, roughness: 0.18, metalness: 1.0 });
  MAT.uniform = s({ color: 0x3a4148, roughness: 0.85 });
  MAT.uniformDark = s({ color: 0x2a2f35, roughness: 0.85 });
  MAT.skin = s({ color: 0xb98e6e, roughness: 0.75 });
  MAT.boot = s({ color: 0x1a1b1d, roughness: 0.8 });
  MAT.glove = s({ color: 0x24272b, roughness: 0.8 });
  MAT.helmet = s({ color: 0x30363c, roughness: 0.6, metalness: 0.2 });
  MAT.nade = s({ color: 0x45502f, roughness: 0.6, metalness: 0.2 });
  MAT.ready = true;
  return MAT;
}

function box(parent, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
// cylinder along z (barrels, tubes); r2 = radius at the far (+z) end
function cyl(parent, r, len, x, y, z, mat, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// cylinder along x (pins, knobs, turrets sideways)
function cylX(parent, r, len, x, y, z, mat, seg = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// cylinder along y
function cylY(parent, r, len, x, y, z, mat, seg = 8, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// picatinny rail: a base with cross slots
function rail(parent, len, x, y, z, mat, w = 0.022) {
  box(parent, w, 0.006, len, x, y, z, mat);
  const n = Math.floor(len / 0.0105);
  for (let i = 0; i < n; i++) box(parent, w + 0.004, 0.005, 0.005, x, y + 0.005, z - len / 2 + 0.006 + i * 0.0105, mat);
}
// trigger, guard and the curved front of the guard
function triggerGroup(parent, z, y, M, len = 0.065) {
  box(parent, 0.008, 0.026, 0.008, 0, y - 0.012, z, M.steel, 0.35);                 // trigger blade
  box(parent, 0.012, 0.004, len, 0, y - 0.034, z + 0.006, M.polymer);                // guard bottom
  box(parent, 0.012, 0.03, 0.004, 0, y - 0.019, z - len / 2 + 0.006, M.polymer);     // guard front
}
// pistol grip with finger grooves and a beavertail
function grip(parent, z, y, M, mat, ang = -0.3, h = 0.11) {
  const gp = new THREE.Group(); gp.position.set(0, y, z); gp.rotation.x = ang; parent.add(gp);
  box(gp, 0.034, h, 0.044, 0, -h / 2, 0, mat);
  for (let i = 0; i < 3; i++) box(gp, 0.036, 0.008, 0.01, 0, -0.025 - i * 0.025, -0.024, mat);   // finger grooves
  box(gp, 0.036, 0.012, 0.05, 0, -h, 0.002, mat);                                                // base
  box(gp, 0.03, 0.014, 0.02, 0, 0.004, 0.026, mat);                                              // beavertail
  for (let i = 0; i < 4; i++) box(gp, 0.0365, 0.004, 0.03, 0, -0.03 - i * 0.018, 0.004, M.polymer); // stippling bands
  return gp;
}
// small red-dot sight on a mount: an open tube (you look through it when aiming), front glass, the dot
function redDot(parent, y, z, M, big = false) {
  const r = big ? 0.021 : 0.017, len = big ? 0.062 : 0.05, t = 0.0045;
  box(parent, 0.03, 0.012, 0.05, 0, y - r - 0.006, z, M.polymer);                 // mount
  box(parent, 2 * r + t, t, len, 0, y + r, z, M.polymer);                          // top wall
  box(parent, 2 * r + t, t, len, 0, y - r, z, M.polymer);                          // bottom wall
  box(parent, t, 2 * r, len, -r, y, z, M.polymer);                                 // side walls
  box(parent, t, 2 * r, len, r, y, z, M.polymer);
  box(parent, 2 * r + 0.008, 0.006, 0.01, 0, y + r + 0.003, z - len / 2, M.polymer); // front hood
  cylX(parent, 0.006, 0.012, r + 0.008, y + 0.002, z + 0.006, M.polymer);          // brightness knob
  cylY(parent, 0.006, 0.01, 0, y + r + 0.006, z + 0.006, M.polymer);               // windage cap
  const lensF = new THREE.Mesh(new THREE.PlaneGeometry(2 * r - 0.002, 2 * r - 0.002), M.lens);
  lensF.position.set(0, y, z - len / 2 + 0.002); lensF.rotation.y = Math.PI; parent.add(lensF);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0021, 6, 4), M.dot);
  dot.position.set(0, y, z - len / 2 + 0.006); parent.add(dot);
}

// Returns { group, muzzle, eject, mag, pump, bolt, sightY, sightZ, scope }
// Gun space: -z is forward, y up; the origin sits above the grip. Weapon names are fictional;
// the shapes follow the general layout of real weapon types.
export function makeGun(id) {
  const M = mats();
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const eject = new THREE.Object3D();
  const mag = new THREE.Group();
  let pump = null, bolt = null, sightY = 0.1, sightZ = -0.1, scope = false;
  g.add(muzzle, eject, mag);

  if (id === 'ar') {
    // ---- KR-7: 5.56 carbine ----
    box(g, 0.054, 0.05, 0.3, 0, 0.05, -0.07, M.gunmetal);                 // upper receiver
    box(g, 0.05, 0.04, 0.2, 0, 0.007, -0.05, M.gunmetal);                 // lower receiver
    box(g, 0.05, 0.05, 0.07, 0, -0.025, -0.125, M.gunmetal);              // magazine well
    box(g, 0.054, 0.012, 0.075, 0, -0.051, -0.125, M.gunmetal);           // flared well lip
    rail(g, 0.3, 0, 0.078, -0.09, M.polymer);                             // top rail
    box(g, 0.014, 0.022, 0.03, 0.03, 0.05, -0.085, M.polymer);            // ejection port cover
    box(g, 0.004, 0.016, 0.05, 0.028, 0.052, -0.08, M.steel);             // port opening edge
    cylX(g, 0.008, 0.016, 0.033, 0.05, -0.01, M.steel);                   // forward assist
    box(g, 0.012, 0.016, 0.04, 0, 0.072, 0.085, M.polymer);               // charging handle
    box(g, 0.05, 0.01, 0.014, 0, 0.074, 0.103, M.polymer);                //   … its T-latch
    box(g, 0.006, 0.014, 0.022, -0.027, 0.0, -0.165, M.steel);            // mag release
    box(g, 0.004, 0.022, 0.012, -0.027, 0.032, 0.0, M.steel);             // bolt catch
    cylX(g, 0.006, 0.058, 0, 0.012, 0.01, M.steel);                       // takedown pins
    cylX(g, 0.006, 0.058, 0, 0.012, -0.15, M.steel);
    box(g, 0.006, 0.012, 0.02, -0.027, 0.012, 0.05, M.steel, 0, 0, 0.4); // selector
    triggerGroup(g, 0.0, 0.0, M);
    grip(g, 0.05, -0.012, M, M.polymer);
    // handguard with M-LOK slots, rail on top
    const hg = cyl(g, 0.034, 0.3, 0, 0.04, -0.37, M.tan, 8); hg.rotation.z = Math.PI / 8;
    rail(g, 0.28, 0, 0.078, -0.37, M.polymer);
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) box(g, 0.004, 0.012, 0.04, sx * 0.033, 0.04, -0.27 - i * 0.065, M.polymer);
    for (let i = 0; i < 4; i++) box(g, 0.012, 0.004, 0.04, 0, 0.006, -0.27 - i * 0.065, M.polymer);
    box(g, 0.07, 0.07, 0.012, 0, 0.04, -0.215, M.gunmetal);               // barrel nut / end cap
    // barrel, gas block, muzzle brake
    cyl(g, 0.0105, 0.13, 0, 0.04, -0.585, M.gunmetal, 12);
    box(g, 0.026, 0.03, 0.03, 0, 0.044, -0.54, M.gunmetal);               // gas block
    cyl(g, 0.016, 0.06, 0, 0.04, -0.69, M.gunmetal, 12);                  // brake
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) box(g, 0.004, 0.018, 0.008, sx * 0.015, 0.042, -0.675 - i * 0.015, M.polymer);
    cyl(g, 0.0175, 0.008, 0, 0.04, -0.722, M.gunmetal, 12);
    // folding iron sights
    box(g, 0.02, 0.012, 0.02, 0, 0.088, -0.49, M.polymer); box(g, 0.004, 0.022, 0.006, 0, 0.1, -0.49, M.polymer);
    box(g, 0.026, 0.01, 0.022, 0, 0.088, 0.055, M.polymer);
    // buffer tube and collapsible stock
    cyl(g, 0.015, 0.16, 0, 0.042, 0.17, M.gunmetal, 12);
    box(g, 0.022, 0.012, 0.04, 0, 0.024, 0.12, M.gunmetal);               // castle nut / plate
    box(g, 0.05, 0.07, 0.17, 0, 0.032, 0.235, M.tan);                     // stock body
    box(g, 0.046, 0.022, 0.12, 0, 0.074, 0.22, M.tan);                    // cheek riser
    box(g, 0.034, 0.028, 0.06, 0, -0.012, 0.19, M.tan);                   // adjust lever housing
    box(g, 0.056, 0.105, 0.016, 0, 0.02, 0.324, M.polymer);               // butt pad
    for (let i = 0; i < 4; i++) box(g, 0.058, 0.004, 0.018, 0, -0.02 + i * 0.024, 0.324, M.gunmetal);
    cylX(g, 0.006, 0.06, 0, 0.0, 0.29, M.steel);                          // sling point
    // curved 30-round magazine (moves with the reload hand)
    const seg = [[-0.072, -0.127, 0.08], [-0.134, -0.138, 0.2], [-0.193, -0.158, 0.33]];
    for (const [y, z, a] of seg) {
      box(mag, 0.044, 0.064, 0.074, 0, y, z, M.polymer, a);
      box(mag, 0.046, 0.05, 0.006, 0, y, z + 0.034, M.polymer, a);         // ribs
      box(mag, 0.046, 0.05, 0.006, 0, y, z - 0.034, M.polymer, a);
    }
    box(mag, 0.05, 0.014, 0.084, 0, -0.228, -0.172, M.polymer, 0.36);    // base plate
    box(mag, 0.03, 0.008, 0.05, 0, -0.035, -0.128, M.brass);             // top round
    redDot(g, 0.117, -0.12, M, true);
    sightY = 0.117; sightZ = -0.12;
    muzzle.position.set(0, 0.04, -0.73);
    eject.position.set(0.035, 0.052, -0.08);
  } else if (id === 'smg') {
    // ---- VX-9: 9 mm submachine gun ----
    cyl(g, 0.026, 0.3, 0, 0.034, -0.08, M.olive, 12);                    // tubular receiver
    box(g, 0.05, 0.04, 0.22, 0, 0.005, -0.05, M.olive);                  // lower / trigger housing
    rail(g, 0.2, 0, 0.066, -0.08, M.polymer);
    box(g, 0.012, 0.02, 0.06, -0.03, 0.04, -0.17, M.steel);              // cocking tube
    box(g, 0.022, 0.012, 0.016, -0.04, 0.04, -0.2, M.polymer);           // cocking handle
    box(g, 0.004, 0.018, 0.045, 0.027, 0.04, -0.05, M.polymer);          // ejection port
    // barrel shroud with vent holes, barrel and compensator
    cyl(g, 0.022, 0.16, 0, 0.034, -0.31, M.polymer, 12);
    for (let i = 0; i < 5; i++) for (const a of [0.6, -0.6, Math.PI / 2]) {
      const v = box(g, 0.005, 0.012, 0.014, Math.sin(a) * 0.022, 0.034 + Math.cos(a) * 0.022, -0.25 - i * 0.03, M.gunmetal);
      v.rotation.z = -a;
    }
    cyl(g, 0.01, 0.05, 0, 0.034, -0.41, M.gunmetal, 10);
    cyl(g, 0.014, 0.035, 0, 0.034, -0.44, M.gunmetal, 10);
    triggerGroup(g, 0.01, -0.015, M, 0.06);
    grip(g, 0.055, -0.02, M, M.polymer, -0.25, 0.1);
    // vertical foregrip on a short rail under the shroud
    box(g, 0.022, 0.026, 0.09, 0, 0.0, -0.27, M.polymer);
    box(g, 0.024, 0.012, 0.05, 0, -0.012, -0.25, M.polymer);
    cylY(g, 0.016, 0.07, 0, -0.05, -0.25, M.polymer, 10, 0.018);
    for (let i = 0; i < 3; i++) cylY(g, 0.0185, 0.004, 0, -0.03 - i * 0.02, -0.25, M.gunmetal, 10);
    // folding wire stock
    box(g, 0.05, 0.05, 0.02, 0, 0.022, 0.07, M.polymer);                 // hinge block
    box(g, 0.008, 0.01, 0.2, 0.021, 0.03, 0.17, M.steel);
    box(g, 0.008, 0.01, 0.2, -0.021, 0.03, 0.17, M.steel);
    box(g, 0.008, 0.01, 0.17, 0, -0.005, 0.16, M.steel, -0.2);
    box(g, 0.054, 0.08, 0.018, 0, 0.012, 0.275, M.polymer);              // butt plate
    // straight 30-round magazine
    box(mag, 0.036, 0.19, 0.046, 0, -0.1, -0.1, M.polymer, 0.05);
    for (let i = 0; i < 4; i++) box(mag, 0.038, 0.006, 0.048, 0, -0.04 - i * 0.04, -0.097 + i * 0.002, M.gunmetal, 0.05);
    box(mag, 0.042, 0.012, 0.054, 0, -0.198, -0.095, M.polymer, 0.05);
    // compact red dot
    redDot(g, 0.1, -0.07, M);
    sightY = 0.1; sightZ = -0.07;
    muzzle.position.set(0, 0.034, -0.46);
    eject.position.set(0.03, 0.05, -0.05);
  } else if (id === 'sg') {
    // ---- BR-12: pump-action 12 gauge ----
    box(g, 0.056, 0.07, 0.24, 0, 0.032, -0.04, M.gunmetal);              // receiver
    cyl(g, 0.028, 0.24, 0, 0.06, -0.04, M.gunmetal, 12);                 // rounded top
    box(g, 0.004, 0.024, 0.06, 0.029, 0.05, -0.05, M.polymer);           // ejection port
    box(g, 0.03, 0.006, 0.07, 0, -0.004, -0.06, M.polymer);              // loading port
    box(g, 0.008, 0.012, 0.016, 0, 0.0, 0.05, M.steel);                  // slide release
    cylY(g, 0.006, 0.012, 0, 0.09, 0.03, M.steel);                       // safety
    triggerGroup(g, 0.05, -0.002, M, 0.07);
    // barrel and magazine tube with cap and barrel clamp
    cyl(g, 0.014, 0.52, 0, 0.058, -0.42, M.gunmetal, 12);
    cyl(g, 0.0125, 0.42, 0, 0.022, -0.37, M.gunmetal, 12);
    cyl(g, 0.015, 0.03, 0, 0.022, -0.59, M.steel, 12);                   // mag cap
    box(g, 0.022, 0.05, 0.016, 0, 0.04, -0.6, M.gunmetal);               // barrel clamp
    cyl(g, 0.0155, 0.02, 0, 0.058, -0.67, M.gunmetal, 12);               // muzzle ring
    box(g, 0.008, 0.008, 0.008, 0, 0.076, -0.66, M.brass);               // bead sight
    box(g, 0.01, 0.006, 0.4, 0, 0.076, -0.38, M.polymer);                // vent rib
    // pump with grooves
    pump = new THREE.Group(); g.add(pump);
    box(pump, 0.054, 0.052, 0.17, 0, 0.018, -0.36, M.wood);
    for (let i = 0; i < 7; i++) box(pump, 0.056, 0.004, 0.008, 0, 0.018 + (i % 2 ? 0.012 : -0.012), -0.3 - i * 0.02, M.polymer);
    box(pump, 0.008, 0.006, 0.16, 0.022, 0.03, -0.18, M.steel);          // action bars
    box(pump, 0.008, 0.006, 0.16, -0.022, 0.03, -0.18, M.steel);
    // wooden stock with comb and recoil pad
    grip(g, 0.1, -0.005, M, M.wood, -0.45, 0.1);
    box(g, 0.048, 0.08, 0.28, 0, -0.006, 0.25, M.wood, 0.12);
    box(g, 0.044, 0.024, 0.18, 0, 0.034, 0.25, M.wood, 0.04);            // comb
    box(g, 0.054, 0.1, 0.022, 0, -0.032, 0.395, M.polymer, 0.12);        // recoil pad
    cylX(g, 0.005, 0.054, 0, -0.04, 0.33, M.steel);                      // sling swivel
    box(g, 0.02, 0.012, 0.02, 0, 0.088, -0.02, M.gunmetal);              // rear sight notch
    sightY = 0.078; sightZ = -0.02;
    muzzle.position.set(0, 0.058, -0.69);
    eject.position.set(0.035, 0.05, -0.02);
  } else if (id === 'sr') {
    // ---- LX-50: bolt-action precision rifle ----
    cyl(g, 0.028, 0.24, 0, 0.042, -0.04, M.gunmetal, 14);               // round receiver
    box(g, 0.062, 0.05, 0.36, 0, 0.012, -0.05, M.olive);                 // chassis
    box(g, 0.06, 0.03, 0.3, 0, -0.016, -0.38, M.olive);                  // forend
    for (let i = 0; i < 5; i++) box(g, 0.064, 0.008, 0.03, 0, -0.016, -0.27 - i * 0.05, M.polymer);
    rail(g, 0.24, 0, 0.074, -0.04, M.polymer);
    // fluted barrel and big muzzle brake
    cyl(g, 0.014, 0.6, 0, 0.042, -0.5, M.gunmetal, 12);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; box(g, 0.004, 0.004, 0.38, Math.cos(a) * 0.0135, 0.042 + Math.sin(a) * 0.0135, -0.44, M.polymer); }
    cyl(g, 0.022, 0.08, 0, 0.042, -0.83, M.gunmetal, 10);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) box(g, 0.006, 0.026, 0.012, sx * 0.022, 0.042, -0.805 - i * 0.022, M.polymer);
    // scope: tube, objective bell, eyepiece, turrets, rings
    cyl(g, 0.017, 0.26, 0, 0.118, -0.08, M.polymer, 16);
    cyl(g, 0.017, 0.07, 0, 0.118, -0.245, M.polymer, 16, 0.028);
    cyl(g, 0.03, 0.03, 0, 0.118, -0.29, M.polymer, 16);
    cyl(g, 0.024, 0.05, 0, 0.118, 0.065, M.polymer, 16, 0.017);
    cylY(g, 0.012, 0.03, 0, 0.145, -0.08, M.polymer, 12);                // elevation turret
    cylX(g, 0.012, 0.03, 0.028, 0.118, -0.08, M.polymer, 12);            // windage turret
    cylX(g, 0.01, 0.024, -0.026, 0.118, -0.08, M.polymer, 12);           // parallax
    for (const z of [-0.17, 0.02]) { box(g, 0.026, 0.046, 0.022, 0, 0.088, z, M.gunmetal); cyl(g, 0.02, 0.022, 0, 0.118, z, M.gunmetal, 14); }
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 14), M.lens);
    lens.position.set(0, 0.118, 0.091); g.add(lens);
    const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), M.lens);
    lensF.position.set(0, 0.118, -0.306); lensF.rotation.y = Math.PI; g.add(lensF);
    // bolt (animated)
    bolt = new THREE.Group(); g.add(bolt);
    cyl(bolt, 0.012, 0.05, 0.0, 0.045, 0.085, M.steel, 10);              // bolt shroud
    cylX(bolt, 0.006, 0.05, 0.03, 0.045, 0.06, M.steel);                 // bolt handle
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M.steel);
    knob.position.set(0.058, 0.04, 0.06); bolt.add(knob);
    triggerGroup(g, 0.06, -0.012, M, 0.07);
    grip(g, 0.11, -0.012, M, M.olive, -0.25);
    // adjustable stock: skeleton, cheek piece, butt pad, monopod
    box(g, 0.05, 0.022, 0.3, 0, 0.034, 0.31, M.olive);
    box(g, 0.05, 0.022, 0.24, 0, -0.04, 0.33, M.olive, -0.1);
    box(g, 0.044, 0.03, 0.14, 0, 0.068, 0.28, M.olive);                   // cheek piece
    cylY(g, 0.005, 0.04, 0.0, 0.05, 0.24, M.steel); cylY(g, 0.005, 0.04, 0.0, 0.05, 0.32, M.steel);
    box(g, 0.058, 0.13, 0.022, 0, -0.005, 0.47, M.polymer, 0.05);
    cylY(g, 0.007, 0.06, 0, -0.07, 0.4, M.steel);
    // detachable box magazine
    box(mag, 0.04, 0.075, 0.08, 0, -0.045, -0.06, M.polymer);
    box(mag, 0.044, 0.012, 0.084, 0, -0.086, -0.06, M.polymer);
    // folded bipod
    box(g, 0.03, 0.02, 0.03, 0, -0.035, -0.47, M.gunmetal);
    for (const sx of [-1, 1]) { box(g, 0.01, 0.014, 0.2, sx * 0.02, -0.034, -0.58, M.gunmetal); box(g, 0.012, 0.016, 0.02, sx * 0.02, -0.034, -0.69, M.polymer); }
    sightY = 0.118; sightZ = -0.08; scope = true;
    muzzle.position.set(0, 0.042, -0.87);
    eject.position.set(0.035, 0.052, -0.04);
  } else if (id === 'lmg') {
    // ---- HG-80: belt/box-fed light machine gun ----
    box(g, 0.078, 0.07, 0.36, 0, 0.03, -0.06, M.gunmetal);               // receiver
    box(g, 0.082, 0.026, 0.2, 0, 0.078, -0.08, M.gunmetal);              // feed cover
    box(g, 0.012, 0.012, 0.03, 0.044, 0.078, 0.0, M.steel);              // cover latch
    rail(g, 0.18, 0, 0.096, -0.08, M.polymer);
    box(g, 0.012, 0.03, 0.05, 0.045, 0.03, -0.02, M.steel);              // charging handle
    box(g, 0.004, 0.022, 0.07, 0.04, 0.03, -0.1, M.polymer);             // ejection port
    // ventilated heat shield over the barrel
    box(g, 0.064, 0.06, 0.3, 0, 0.04, -0.4, M.polymer);
    for (let i = 0; i < 6; i++) { box(g, 0.066, 0.026, 0.016, 0, 0.046, -0.29 - i * 0.045, M.gunmetal); box(g, 0.066, 0.006, 0.03, 0, 0.005, -0.29 - i * 0.045, M.gunmetal); }
    cyl(g, 0.016, 0.3, 0, 0.04, -0.64, M.gunmetal, 12);
    cyl(g, 0.022, 0.07, 0, 0.04, -0.82, M.polymer, 8);                   // flash hider
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; box(g, 0.005, 0.005, 0.05, Math.cos(a) * 0.02, 0.04 + Math.sin(a) * 0.02, -0.82, M.gunmetal); }
    box(g, 0.016, 0.06, 0.016, 0, 0.075, -0.7, M.gunmetal);              // front sight base
    box(g, 0.02, 0.034, 0.012, 0, 0.11, -0.7, M.polymer);                // front sight
    // carry handle (left of the sight line)
    box(g, 0.012, 0.05, 0.012, -0.034, 0.1, -0.05, M.polymer); box(g, 0.012, 0.05, 0.012, -0.034, 0.1, -0.19, M.polymer);
    box(g, 0.014, 0.014, 0.18, -0.034, 0.128, -0.12, M.polymer);
    triggerGroup(g, 0.05, -0.006, M, 0.07);
    grip(g, 0.1, -0.012, M, M.polymer, -0.3);
    // stock with buffer and shoulder rest
    box(g, 0.06, 0.08, 0.22, 0, 0.012, 0.24, M.polymer);
    box(g, 0.056, 0.03, 0.12, 0, 0.06, 0.24, M.polymer);
    box(g, 0.064, 0.12, 0.024, 0, 0.005, 0.355, M.polymer);
    box(g, 0.02, 0.05, 0.03, 0, -0.04, 0.33, M.polymer);                  // shoulder rest
    // ammo box with belt (the reload hand swaps it)
    box(mag, 0.1, 0.12, 0.13, -0.03, -0.08, -0.1, M.olive);
    box(mag, 0.104, 0.014, 0.134, -0.03, -0.022, -0.1, M.olive);         // lid
    box(mag, 0.02, 0.02, 0.04, -0.084, -0.08, -0.1, M.gunmetal);         // latch
    for (let i = 0; i < 4; i++) box(mag, 0.026, 0.01, 0.018, -0.0 + i * 0.01, -0.01 + i * 0.012, -0.1, M.brass, 0, 0, 0.6); // belt links
    // bipod
    box(g, 0.032, 0.02, 0.03, 0, -0.008, -0.53, M.gunmetal);
    for (const sx of [-1, 1]) { box(g, 0.012, 0.016, 0.22, sx * 0.024, -0.016, -0.64, M.gunmetal); box(g, 0.014, 0.018, 0.024, sx * 0.024, -0.016, -0.76, M.polymer); }
    box(g, 0.022, 0.04, 0.02, 0, 0.08, 0.08, M.gunmetal);                // rear sight base
    box(g, 0.03, 0.025, 0.012, 0, 0.105, 0.08, M.polymer);               // rear sight
    sightY = 0.112; sightZ = 0.08;
    muzzle.position.set(0, 0.04, -0.86);
    eject.position.set(0.045, 0.05, -0.1);
  } else if (id === 'pistol') {
    // ---- P-11: 9 mm striker pistol ----
    bolt = new THREE.Group(); g.add(bolt); // slide (animated)
    box(bolt, 0.03, 0.034, 0.19, 0, 0.047, -0.06, M.gunmetal);
    box(bolt, 0.026, 0.006, 0.19, 0, 0.066, -0.06, M.gunmetal);          // top bevel
    for (let i = 0; i < 6; i++) box(bolt, 0.032, 0.026, 0.004, 0, 0.047, 0.012 + i * 0.01, M.polymer);   // rear serrations
    for (let i = 0; i < 4; i++) box(bolt, 0.032, 0.022, 0.004, 0, 0.048, -0.13 - i * 0.01, M.polymer);  // front serrations
    box(bolt, 0.004, 0.016, 0.04, 0.016, 0.054, -0.04, M.steel);         // ejection port
    box(bolt, 0.006, 0.01, 0.006, 0, 0.073, -0.145, M.dot);              // front sight dot
    box(bolt, 0.024, 0.01, 0.008, 0, 0.073, 0.025, M.polymer);           // rear sight
    box(bolt, 0.004, 0.004, 0.004, -0.008, 0.078, 0.025, M.lens); box(bolt, 0.004, 0.004, 0.004, 0.008, 0.078, 0.025, M.lens);
    cyl(bolt, 0.0075, 0.01, 0, 0.045, -0.157, M.steel, 10);              // muzzle crown
    box(g, 0.028, 0.026, 0.15, 0, 0.018, -0.055, M.polymer);              // frame
    rail(g, 0.05, 0, 0.002, -0.1, M.polymer, 0.018);                      // accessory rail
    box(g, 0.004, 0.008, 0.024, -0.015, 0.03, -0.03, M.steel);           // slide stop
    box(g, 0.004, 0.006, 0.012, -0.015, 0.024, -0.075, M.steel);         // takedown lever
    triggerGroup(g, -0.012, 0.01, M, 0.06);
    grip(g, 0.022, 0.006, M, M.polymer, -0.22, 0.1);
    box(mag, 0.026, 0.02, 0.04, 0, -0.098, 0.035, M.gunmetal, -0.22);     // magazine base plate
    sightY = 0.074; sightZ = 0.03;
    muzzle.position.set(0, 0.045, -0.17);
    eject.position.set(0.02, 0.06, -0.04);
  } else if (id === 'knife') {
    // clip-point blade with a spine, guard, ribbed handle, pommel
    box(g, 0.005, 0.032, 0.17, 0, 0.0, -0.13, M.knife);
    box(g, 0.003, 0.01, 0.16, 0, 0.019, -0.12, M.steel);                  // spine
    box(g, 0.0025, 0.022, 0.03, 0, 0.006, -0.225, M.knife, 0.55);        // clipped tip
    box(g, 0.006, 0.006, 0.12, 0, -0.012, -0.12, M.steel);                // edge bevel
    box(g, 0.05, 0.012, 0.016, 0, 0, -0.04, M.gunmetal);                  // guard
    box(g, 0.024, 0.032, 0.11, 0, -0.004, 0.02, M.polymer);              // handle
    for (let i = 0; i < 5; i++) box(g, 0.026, 0.034, 0.006, 0, -0.004, -0.015 + i * 0.018, M.uniformDark);
    box(g, 0.028, 0.036, 0.016, 0, -0.004, 0.082, M.gunmetal);            // pommel
    sightY = 0; sightZ = 0;
    muzzle.position.set(0, 0, -0.22);
  } else if (id === 'grenade') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.nade);
    b.scale.set(1, 1.2, 1); g.add(b);
    box(g, 0.02, 0.03, 0.02, 0, 0.06, 0, M.steel);
    box(g, 0.012, 0.06, 0.006, 0.02, 0.03, 0, M.steel, 0, 0, 0.3);
  }

  mergeStatic(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, muzzle, eject, mag, pump, bolt, sightY, sightZ, scope };
}

export function makeGrenadeMesh() {
  const M = mats();
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.nade);
  b.scale.set(1, 1.2, 1); g.add(b);
  box(g, 0.025, 0.035, 0.025, 0, 0.075, 0, M.steel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function sharedMats() { return mats(); }
