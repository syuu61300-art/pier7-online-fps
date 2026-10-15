// All sounds are synthesised with WebAudio at runtime.

// Gunshot "voices": each weapon's shot is rendered once (offline) from layers —
// a sharp supersonic crack, the muzzle blast (saturated noise), a low pressure thump,
// the action cycling, and a long filtered tail with a few early echoes.
const VOICES = {
  ar:     { crack: 2700, blast: 2400, blastDecay: 0.085, thump: [118, 44], thumpDecay: 0.17, thumpGain: 0.95, mech: 0.32, tail: 0.8, tailF: 720, echo: 0.34, drive: 2.4, gain: 0.95 },
  smg:    { crack: 3300, blast: 3000, blastDecay: 0.055, thump: [155, 72], thumpDecay: 0.1, thumpGain: 0.6, mech: 0.42, tail: 0.5, tailF: 950, echo: 0.22, drive: 1.9, gain: 0.82 },
  lmg:    { crack: 2300, blast: 2050, blastDecay: 0.11, thump: [104, 38], thumpDecay: 0.21, thumpGain: 1.05, mech: 0.5, tail: 0.9, tailF: 650, echo: 0.38, drive: 2.7, gain: 1.0 },
  sr:     { crack: 2000, blast: 1650, blastDecay: 0.17, thump: [86, 28], thumpDecay: 0.4, thumpGain: 1.25, mech: 0, tail: 1.8, tailF: 520, echo: 0.55, drive: 3.2, gain: 1.25 },
  sg:     { crack: 1500, blast: 1350, blastDecay: 0.16, thump: [78, 32], thumpDecay: 0.32, thumpGain: 1.2, mech: 0, tail: 1.15, tailF: 560, echo: 0.45, drive: 3.0, gain: 1.15 },
  pistol: { crack: 3500, blast: 2900, blastDecay: 0.05, thump: [175, 82], thumpDecay: 0.085, thumpGain: 0.55, mech: 0.28, tail: 0.45, tailF: 980, echo: 0.2, drive: 1.7, gain: 0.78 },
};

function renderOffline(len, sampleRate, build) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.reject(new Error('no offline audio'));
  const oc = new OAC(1, Math.ceil(len * sampleRate), sampleRate);
  build(oc);
  return new Promise((resolve, reject) => {
    let done = false;
    oc.oncomplete = (e) => { if (!done) { done = true; resolve(e.renderedBuffer); } };
    try {
      const p = oc.startRendering();
      if (p && p.then) p.then((b) => { if (!done) { done = true; resolve(b); } }, reject);
    } catch (e) { reject(e); }
  });
}

function shotGraph(oc, v) {
  const sr = oc.sampleRate, n = sr * 2;
  const white = oc.createBuffer(1, n, sr), wd = white.getChannelData(0);
  for (let i = 0; i < n; i++) wd[i] = Math.random() * 2 - 1;
  const brown = oc.createBuffer(1, n, sr), bd = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * v.drive) / Math.tanh(v.drive); }
  const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
  const env = (g, t, peak, attack, decay) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  const noise = (buf, t, dur, type, freq, q, peak, attack, decay, dest = out, shaper = false) => {
    const src = oc.createBufferSource(); src.buffer = buf;
    const f = oc.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = oc.createGain(); env(g, t, peak, attack, decay);
    let node = src.connect(f);
    if (shaper) { const ws = oc.createWaveShaper(); ws.curve = curve; ws.oversample = '2x'; node = node.connect(ws); }
    node.connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur);
    return f;
  };
  // supersonic crack
  noise(white, 0, 0.03, 'highpass', v.crack, 0.7, 0.75, 0.0006, 0.012);
  noise(white, 0, 0.02, 'bandpass', v.crack * 1.6, 1.4, 0.35, 0.0004, 0.008);
  // muzzle blast (saturated)
  const bf = noise(white, 0.0008, v.blastDecay + 0.05, 'lowpass', v.blast, 0.8, 0.95, 0.0012, v.blastDecay, out, true);
  bf.frequency.setValueAtTime(v.blast, 0.001);
  bf.frequency.exponentialRampToValueAtTime(v.blast * 0.35, v.blastDecay);
  // pressure thump
  const o = oc.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(v.thump[0], 0);
  o.frequency.exponentialRampToValueAtTime(v.thump[1], v.thumpDecay);
  const og = oc.createGain(); env(og, 0, v.thumpGain, 0.002, v.thumpDecay);
  const ows = oc.createWaveShaper(); ows.curve = curve;
  o.connect(ows).connect(og).connect(out); o.start(0); o.stop(v.thumpDecay + 0.05);
  // action cycling (bolt carrier / slide)
  if (v.mech > 0) {
    noise(white, 0.022, 0.02, 'bandpass', 3400, 5, v.mech * 0.55, 0.0008, 0.014);
    noise(white, 0.058, 0.025, 'bandpass', 2300, 4, v.mech * 0.45, 0.001, 0.02);
  }
  // tail and early echoes off the surroundings
  noise(brown, 0.01, v.tail + 0.1, 'lowpass', v.tailF, 0.5, 1.6, 0.012, v.tail);
  noise(white, 0.004, v.tail * 0.5, 'bandpass', v.tailF * 1.6, 0.6, 0.22, 0.01, v.tail * 0.45);
  const echoBus = oc.createBiquadFilter(); echoBus.type = 'lowpass'; echoBus.frequency.value = 1400; echoBus.connect(out);
  [[0.085, 0.42], [0.18, 0.26], [0.3, 0.15], [0.46, 0.08]].forEach(([d, k]) => {
    noise(white, d, 0.12, 'bandpass', v.blast * 0.5, 0.7, v.echo * k * 2.4, 0.004, 0.09 + d * 0.4, echoBus);
  });
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.mix = { sfx: 1, amb: 0.6, ui: 0.8 };
    this.ready = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.mix.sfx; this.sfx.connect(this.master);
    this.ui = ctx.createGain(); this.ui.gain.value = 0.7 * this.mix.ui; this.ui.connect(this.master);
    // shared noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.ready = true;
    this._ambient();
    this._renderGuns();
    if (ctx.state === 'suspended') ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // master / effects (guns, steps, explosions together) / ambience / notifications
  setMix(master, sfx, amb, ui) {
    this.volume = master;
    this.mix = { sfx, amb, ui };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.ui.gain.setTargetAtTime(0.7 * ui, t, 0.05);
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(0.18 * amb, t, 0.05);
  }

  updateListener(pos, fwd) {
    if (!this.ready) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    this._lp = pos;
  }

  // output chain: local (dry) or spatial with distance muffling
  _out(pos, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (!pos) { g.connect(this.sfx); return g; }
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4; p.maxDistance = 400; p.rolloffFactor = 1.05;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const lpos = this._lp || { x: 0, y: 0, z: 0 };
    const dist = Math.hypot(pos.x - lpos.x, pos.y - lpos.y, pos.z - lpos.z);
    lp.frequency.value = 600 + 17000 * Math.exp(-dist / 45);
    g.connect(lp).connect(p).connect(this.sfx);
    return g;
  }

  _noise(out, t, dur, type, freq, q, g0, decay, rate = 1, buf) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf || this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(g0, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05);
    return f;
  }

  _tone(out, t, type, f0, f1, g0, decay, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + (dur || decay));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(g0, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + decay + 0.05);
  }

  async _renderGuns() {
    this.gunBuf = {};
    for (const [id, v] of Object.entries(VOICES)) {
      try {
        const buf = await renderOffline(v.tail + 0.6, this.ctx.sampleRate, (oc) => shotGraph(oc, v));
        // normalise so every weapon peaks at the same level before its own gain
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
        if (peak > 0) { const k = 0.9 / peak; for (let i = 0; i < d.length; i++) d[i] *= k; }
        this.gunBuf[id] = buf;
      } catch { return; } // old browsers: keep the simple synthesis below
    }
  }

  gun(def, pos = null, vol = 1) {
    if (!this.ready || !def.sound) return;
    const s = def.sound, t = this.ctx.currentTime;
    const buf = this.gunBuf && this.gunBuf[def.id];
    if (buf) {
      const v = VOICES[def.id];
      const out = this._out(pos, v.gain * vol * 0.95);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;
      src.connect(out);
      src.start(t);
      if (pos && this._lp) {
        const d = Math.hypot(pos.x - this._lp.x, pos.y - this._lp.y, pos.z - this._lp.z);
        if (d > 28) this._noise(out, t + 0.08 + d / 900, 0.5, 'lowpass', 380, 0.5, 0.3, 0.55, 0.5, this.brown);
      }
      return;
    }
    const out = this._out(pos, s.gain * vol);
    this._noise(out, t, 0.12, 'bandpass', s.crack * (0.92 + Math.random() * 0.16), 0.7, 0.9, 0.09);
    this._noise(out, t, 0.05, 'highpass', 3500, 0.5, 0.35, 0.03);
    this._tone(out, t, 'sine', s.body * 2.2, s.body * 0.7, 0.9, 0.16, 0.1);
    this._tone(out, t, 'triangle', s.body * 3, s.body, 0.3, 0.07);
    this._noise(out, t + 0.01, s.tail, 'lowpass', 900, 0.3, 0.32, s.tail, 0.6, this.brown);
    if (!pos) this._noise(out, t + 0.03, s.tail * 1.2, 'bandpass', 420, 0.6, 0.12, s.tail * 1.3); // slap-back
    else if (this._lp) {
      // distant shots: a delayed low rumble off the surroundings
      const d = Math.hypot(pos.x - this._lp.x, pos.y - this._lp.y, pos.z - this._lp.z);
      if (d > 28) this._noise(out, t + 0.08 + d / 900, 0.5, 'lowpass', 380, 0.5, 0.3, 0.55, 0.5, this.brown);
    }
  }

  // a round passing close by: a short falling hiss, louder the closer it was
  whiz(pos, k = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, 0.35 + 0.45 * k);
    const f = this._noise(out, t, 0.2, 'bandpass', 4200, 3, 0.8, 0.17);
    f.frequency.setValueAtTime(5200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.17);
    this._tone(out, t, 'sine', 3200, 600, 0.08 * k, 0.12);
    this._noise(out, t, 0.03, 'highpass', 6000, 0.7, 0.5 * k, 0.025); // supersonic snap
  }

  // a round glancing off metal / stone: a short falling "ping"
  ricochet(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, 0.55);
    const f0 = 2400 + Math.random() * 1800;
    this._tone(out, t, 'sine', f0, f0 * 0.45, 0.28, 0.22);
    this._tone(out, t, 'triangle', f0 * 1.5, f0 * 0.7, 0.08, 0.16);
    const f = this._noise(out, t, 0.18, 'bandpass', f0, 6, 0.35, 0.16);
    f.frequency.setValueAtTime(f0 * 1.2, t);
    f.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.16);
  }

  // per-map background: wind strength/colour, water, electrical hum
  setAmbience(a = {}) {
    this._amb = a;
    if (!this.ctx || !this._ambN) return;
    const t = this.ctx.currentTime, N = this._ambN;
    N.wind.gain.setTargetAtTime(a.wind ?? 0.5, t, 0.5);
    N.windF.frequency.setTargetAtTime(a.windFreq ?? 420, t, 0.5);
    N.water.gain.setTargetAtTime(a.water ?? 0.1, t, 0.5);
    N.hum.gain.setTargetAtTime(a.hum ?? 0, t, 0.5);
    N.windL.gain.setTargetAtTime((a.wind ?? 0.5) * 0.6, t, 0.5);
    N.waterL.gain.setTargetAtTime((a.water ?? 0.1) * 0.8, t, 0.5);
  }

  click(freq = 2400, gain = 0.25, when = 0, pos = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const out = this._out(pos, 1);
    this._noise(out, t, 0.02, 'bandpass', freq, 6, gain, 0.025);
    this._tone(out, t, 'square', freq * 0.5, freq * 0.45, gain * 0.15, 0.02);
  }

  // short mechanical sound: a filtered tick plus a little body
  mech(freq, gain, when = 0, len = 0.03, body = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when, out = this._out(null, 1);
    this._noise(out, t, len, 'bandpass', freq, 4, gain, len);
    this._noise(out, t, len * 0.6, 'highpass', freq * 1.8, 0.7, gain * 0.4, len * 0.5);
    if (body) this._tone(out, t, 'triangle', body, body * 0.7, gain * 0.5, len * 1.6);
  }
  slide(f0, f1, gain, when, len) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when, out = this._out(null, 1);
    const f = this._noise(out, t, len, 'bandpass', f0, 2.5, gain, len);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
  }
  // timed to the first-person hand animation (viewmodel.js)
  reload(def, dur, empty = false) {
    if (!this.ready || def.shellReload) return;
    const pistol = def.id === 'pistol';
    this.mech(3200, 0.28, dur * 0.13, 0.02);                 // mag release
    this.slide(1600, 700, 0.22, dur * 0.2, dur * 0.12);       // mag slides out
    this.mech(900, 0.18, dur * 0.34, 0.05, 180);              // old mag away
    this.slide(800, 1500, 0.16, dur * 0.47, dur * 0.1);       // new mag up
    this.mech(2100, 0.42, dur * 0.58, 0.035, 240);            // mag in
    this.mech(1400, 0.3, dur * 0.63, 0.03, 160);              // seat it
    if (empty || pistol) {
      this.slide(2400, 1300, 0.22, dur * 0.76, dur * 0.07);   // pull charging handle / slide back
      this.mech(3000, 0.45, dur * 0.86, 0.04, pistol ? 300 : 210); // release: bolt slams home
    }
  }
  shell() { this.mech(2000, 0.28, 0, 0.025, 260); this.mech(1100, 0.22, 0.06, 0.03, 180); }
  pump(when = 0.12) { this.slide(1800, 900, 0.3, when, 0.08); this.mech(1200, 0.4, when + 0.09, 0.04, 170); this.mech(2200, 0.35, when + 0.17, 0.03, 220); }
  bolt(when = 0.15) { this.click(2600, 0.3, when); this.click(1700, 0.28, when + 0.18); this.click(2900, 0.3, when + 0.42); }
  empty() { this.click(3200, 0.25, 0); }
  swap() { this.click(1200, 0.2, 0); this.click(2600, 0.18, 0.08); }

  swing() {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(null, 0.5);
    const f = this._noise(out, t, 0.2, 'bandpass', 600, 1.2, 0.6, 0.18);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
  }

  step(pos, metal, gain = 0.35) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, gain);
    this._noise(out, t, 0.08, 'lowpass', 500 + Math.random() * 400, 1, 0.8, 0.07);
    if (metal) this._noise(out, t, 0.12, 'bandpass', 1800 + Math.random() * 600, 8, 0.25, 0.12);
    else this._noise(out, t + 0.012, 0.04, 'highpass', 4000, 0.5, 0.12, 0.03);
  }
  land(metal) { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(null, 0.6); this._noise(out, t, 0.15, 'lowpass', 300, 1, 0.9, 0.14); if (metal) this._noise(out, t, 0.25, 'bandpass', 1300, 10, 0.25, 0.25); }
  jump() { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(null, 0.3); this._noise(out, t, 0.08, 'lowpass', 700, 1, 0.5, 0.08); }

  hit(head, kill) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (head) {
      this._tone(this.ui, t, 'sine', 2600, 2600, 0.35, 0.22);
      this._tone(this.ui, t, 'sine', 3900, 3900, 0.18, 0.18);
    } else {
      this._noise(this.ui, t, 0.03, 'bandpass', 3000, 4, 0.5, 0.03);
      this._tone(this.ui, t, 'square', 1700, 1500, 0.06, 0.03);
    }
    if (kill) {
      this._tone(this.ui, t + 0.05, 'triangle', 620, 620, 0.3, 0.18);
      this._tone(this.ui, t + 0.13, 'triangle', 930, 930, 0.28, 0.3);
    }
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(this.ui, t, 'sine', 160, 60, 0.6, 0.18);
    this._noise(this.ui, t, 0.1, 'lowpass', 400, 1, 0.5, 0.1);
  }

  explosion(pos) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 1.6);
    const f = this._noise(out, t, 1.8, 'lowpass', 2600, 0.7, 1.0, 1.6, 0.7, this.brown);
    f.frequency.exponentialRampToValueAtTime(140, t + 1.2);
    this._noise(out, t, 0.3, 'bandpass', 900, 0.6, 0.8, 0.25);
    this._tone(out, t, 'sine', 90, 30, 1.0, 0.9, 0.6);
  }

  bounce(pos) { if (!this.ready) return; const t = this.ctx.currentTime; const out = this._out(pos, 0.5); this._tone(out, t, 'triangle', 1900, 1600, 0.2, 0.08); this._noise(out, t, 0.04, 'bandpass', 2600, 8, 0.2, 0.05); }
  pin() { this.click(3400, 0.25, 0); this.click(2100, 0.2, 0.09); }
  pickup() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.ui, t, 'triangle', 880, 880, 0.25, 0.12); this._tone(this.ui, t + 0.08, 'triangle', 1320, 1320, 0.25, 0.2); }
  spawn() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.ui, t, 'sine', 440, 660, 0.15, 0.35, 0.3); }
  chat() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.ui, t, 'sine', 1200, 1200, 0.12, 0.08); }
  horn() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain(); out.gain.value = 0.22; out.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(out);
    for (const f of [73, 110, 146.5]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
      g.gain.setValueAtTime(0.25, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g).connect(lp); o.start(t); o.stop(t + 3.5);
    }
  }
  roundEnd() { if (!this.ready) return; const t = this.ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => this._tone(this.ui, t + i * 0.12, 'triangle', f, f, 0.25, 0.4)); }

  _ambient() {
    const ctx = this.ctx;
    const amb = ctx.createGain(); amb.gain.value = 0.18 * this.mix.amb; amb.connect(this.master);
    // wind
    const w = ctx.createBufferSource(); w.buffer = this.brown; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
    const wg = ctx.createGain(); wg.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.3;
    lfo.connect(lfoG).connect(wg.gain);
    w.connect(wf).connect(wg).connect(amb);
    w.start(); lfo.start();
    // water lapping
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 380; sf.Q.value = 0.8;
    const sg = ctx.createGain(); sg.gain.value = 0.1;
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.23;
    const l2g = ctx.createGain(); l2g.gain.value = 0.08;
    l2.connect(l2g).connect(sg.gain);
    s.connect(sf).connect(sg).connect(amb);
    s.start(); l2.start();
    // electrical hum (underground)
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hum.connect(hf).connect(hg).connect(amb); hum.start();
    this._ambN = { wind: wg, windF: wf, water: sg, hum: hg, windL: lfoG, waterL: l2g };
    this.ambientGain = amb;
    if (this._amb) this.setAmbience(this._amb);
  }
}
