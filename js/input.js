// Keyboard / mouse (pointer lock with fallback) / touch input, driven by the player's bindings.
import { TOUCH_BUTTONS } from './settings.js';

// TouchList is not iterable in every browser
function eachTouch(list, fn) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) { const t = list[i] || (list.item && list.item(i)); if (t) fn(t); }
}

export class Input {
  constructor(canvas, touchRoot, settings) {
    this.version = '10/15a'; // checked by main.js to spot stale cached files
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.edges = new Set();
    this.mouseDown = [false, false, false, false, false];
    this.mdx = 0; this.mdy = 0;
    this.wheel = 0;
    this.locked = false;
    this.freeMouse = false; // pointer lock unavailable → raw movement over the canvas
    this.enabled = false;   // game consumes input
    this.typing = false;
    this.touch = false;
    this.capture = null;    // settings screen waiting for a key
    this.adsLatch = false; this.crouchLatch = false; this.sprintLatch = false;
    this.onUnlock = null;
    this.onEsc = null;
    this.onChat = null;
    this.onPause = null;
    this._bind();
    this._touchUI(touchRoot);
  }

  get binds() { return this.settings.binds; }
  isBound(code) { for (const k in this.binds) if (this.binds[k] === code) return true; return false; }

  _bind() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); this.capture(e.code); return; }
      if (this.typing) return;
      if (this.enabled && (this.isBound(e.code) || e.code === 'Tab' || e.code === 'Space')) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && e.code === this.binds.chat) { e.preventDefault(); this.onChat && this.onChat(); }
      if (e.code === 'Escape' && this.freeMouse && this.enabled) this.onEsc && this.onEsc();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown.fill(false); });
    // capture mouse buttons for rebinding anywhere on the page
    addEventListener('mousedown', (e) => {
      if (!this.capture) return;
      if (e.target && e.target.closest && e.target.closest('[data-nocapture]')) return;
      e.preventDefault(); e.stopPropagation();
      this._capT = performance.now();
      this.capture('Mouse' + e.button);
    }, true);
    addEventListener('contextmenu', (e) => { if (this.capture || performance.now() - (this._capT || 0) < 600) e.preventDefault(); }, true);
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.capture) return;
      if (!this.locked && !this.freeMouse) { this.lock(); return; }
      if (e.button < 5) { this.mouseDown[e.button] = true; this.edges.add('Mouse' + e.button); }
      e.preventDefault();
    });
    addEventListener('mouseup', (e) => {
      if (e.button < 5) this.mouseDown[e.button] = false;
      if (this.enabled && (e.button === 3 || e.button === 4)) e.preventDefault(); // no back/forward navigation
    });
    addEventListener('auxclick', (e) => { if (this.enabled) e.preventDefault(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || (this.freeMouse && e.target === c)) {
        // guard against the occasional huge jump some browsers report
        if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) { this.mdx += e.movementX; this.mdy += e.movementY; }
      }
    });
    c.addEventListener('wheel', (e) => { if (this.enabled) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      if (was && !this.locked) { this.mouseDown.fill(false); this.onUnlock && this.onUnlock(); }
    });
    document.addEventListener('pointerlockerror', () => {
      this.freeMouse = true;
      c.classList.add('free-mouse');
    });
    addEventListener('resize', () => this.applyTouchLayout());
  }

  lock() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeMouse = true; this.canvas.classList.add('free-mouse'); });
    } catch { this.freeMouse = true; this.canvas.classList.add('free-mouse'); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  resetToggles() { this.adsLatch = false; this.crouchLatch = false; this.sprintLatch = false; this.tCrouch = false; this.tSprint = false; }

  // ---------- touch ----------
  _touchUI(root) {
    this.tStick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.tLook = { id: -1, x: 0, y: 0 };
    this.tBtn = { fire: false, ads: false };
    this.tEdge = new Set();
    this.tPads = new Map();
    this.tEls = {};
    this.root = root;
    this.editing = false;
    let coarse = false;
    try { coarse = matchMedia('(pointer: coarse)').matches; } catch {}
    if (!root) return;
    const HOLD = { fire: 'fire', fire2: 'fire', ads: 'ads' };
    for (const def of TOUCH_BUTTONS) {
      const b = document.createElement('button');
      b.className = 'tbtn t-' + def.id; b.textContent = def.label; b.type = 'button';
      b.dataset.id = def.id;
      b.style.width = b.style.height = def.size + 'px';
      const hold = HOLD[def.id];
      b.addEventListener('touchstart', (e) => {
        if (this.editing) return;
        e.preventDefault(); e.stopPropagation();
        if (hold === 'ads' && this.settings.adsMode === 'toggle') {
          this.adsLatch = !this.adsLatch;
          eachTouch(e.changedTouches, (t) => this.tPads.set(t.identifier, { x: t.clientX, y: t.clientY, key: 'adspad' }));
        } else if (hold) {
          this.tBtn[hold] = true;
          // hold buttons double as look pads: drag the same finger to aim while firing / aiming
          eachTouch(e.changedTouches, (t) => this.tPads.set(t.identifier, { x: t.clientX, y: t.clientY, key: hold }));
        } else if (def.id !== 'pause') this.tEdge.add(def.id);
        b.classList.add('on');
      }, { passive: false });
      const up = (e) => {
        if (this.editing) return;
        e.preventDefault();
        eachTouch(e.changedTouches, (t) => this.tPads.delete(t.identifier));
        if (hold) this.tBtn[hold] = [...this.tPads.values()].some((p) => p.key === hold);
        b.classList.remove('on');
        if (def.id === 'pause' && e.type === 'touchend') this.onPause && this.onPause();
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('click', () => { if (!this.editing && def.id === 'pause') this.onPause && this.onPause(); });
      this._editDrag(b, def);
      root.appendChild(b);
      this.tEls[def.id] = b;
    }
    this.stickEl = document.createElement('div'); this.stickEl.className = 'tstick';
    this.knobEl = document.createElement('div'); this.knobEl.className = 'tknob';
    this.stickEl.appendChild(this.knobEl);
    root.appendChild(this.stickEl);
    this.tCrouch = false; this.tSprint = false;
    // Stick / look touches are read on the whole document, not only on the control layer, so a
    // touch still counts when it lands on the canvas or the HUD (e.g. under a notch or after a
    // home-screen web app resized the page).
    const skip = (el) => !!(el && el.closest && el.closest('.tbtn, .overlay, .modal, .screen, #chatbox, #touchEdit, input, select, textarea, button, a'));
    document.addEventListener('touchstart', (e) => {
      if (!this.enabled || this.editing) return;
      if (!this.touch) { this.touch = true; this.applyTouchLayout(); }
      if (!root.classList.contains('on') || skip(e.target)) return;
      this._touchAt = performance.now();
      this._dropStale(e.touches);
      const { W } = this._size();
      const rest = this._restPos();
      eachTouch(e.changedTouches, (t) => {
        const nearRest = Math.hypot(t.clientX - rest.x, t.clientY - rest.y) < 100;
        const left = nearRest || t.clientX < W * 0.5;
        if (left && this.tStick.id < 0) {
          this.tStick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          this._placeStick(t.clientX, t.clientY);
          this.stickEl.classList.add('on');
        } else if (this.tLook.id < 0 && t.identifier !== this.tStick.id) {
          this.tLook = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      });
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!this.enabled || this.editing) return;
      const k = 1.6 * this.settings.touchSens;
      let used = false;
      eachTouch(e.changedTouches, (t) => {
        if (t.identifier === this.tStick.id) { this.tStick.x = t.clientX; this.tStick.y = t.clientY; used = true; }
        if (t.identifier === this.tLook.id) {
          this.mdx += (t.clientX - this.tLook.x) * k; this.mdy += (t.clientY - this.tLook.y) * k;
          this.tLook.x = t.clientX; this.tLook.y = t.clientY; used = true;
        }
        const pad = this.tPads.get(t.identifier);
        if (pad) {
          this.mdx += (t.clientX - pad.x) * k; this.mdy += (t.clientY - pad.y) * k;
          pad.x = t.clientX; pad.y = t.clientY; used = true;
        }
      });
      if (used && e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      eachTouch(e.changedTouches, (t) => {
        if (t.identifier === this.tStick.id) this._releaseStick();
        if (t.identifier === this.tLook.id) this.tLook.id = -1;
      });
      this._dropStale(e.touches);
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    // sizes settle late after rotating (especially in home-screen web apps)
    const relayout = () => { this.applyTouchLayout(); setTimeout(() => this.applyTouchLayout(), 350); };
    addEventListener('orientationchange', relayout);
    if (window.visualViewport) visualViewport.addEventListener('resize', relayout);
    if (coarse) this.touch = true;
    this.applyTouchLayout();
  }

  // the joystick rests (faintly) at the lower left so it is clear where to put the thumb
  _size() {
    const r = this.root && this.root.getBoundingClientRect();
    if (r && r.width > 50 && r.height > 50) return { W: r.width, H: r.height };
    const vv = window.visualViewport;
    if (vv && vv.width > 50) return { W: vv.width, H: vv.height };
    return { W: innerWidth, H: innerHeight };
  }
  _restPos() {
    const { W, H } = this._size();
    const portrait = H > W;
    return { x: Math.round(portrait ? 120 : Math.min(W * 0.2, 150) + 30), y: Math.round(H - 110) };
  }
  _placeStick(x, y) { this.stickEl.style.left = x + 'px'; this.stickEl.style.top = y + 'px'; }
  _releaseStick() {
    this.tStick.id = -1;
    this.stickEl.classList.remove('on');
    const r = this._restPos();
    this._placeStick(r.x, r.y);
    if (this.knobEl) this.knobEl.style.transform = '';
  }
  // forget fingers the browser no longer reports (a touchend can be lost while a menu covers the controls)
  _dropStale(list) {
    const live = new Set();
    eachTouch(list, (t) => live.add(t.identifier));
    if (this.tStick.id >= 0 && !live.has(this.tStick.id)) this._releaseStick();
    if (this.tLook.id >= 0 && !live.has(this.tLook.id)) this.tLook.id = -1;
    for (const id of [...this.tPads.keys()]) if (!live.has(id)) this.tPads.delete(id);
    if (this.tBtn) for (const k in this.tBtn) this.tBtn[k] = [...this.tPads.values()].some((p) => p.key === k);
  }

  _layoutFor(id) {
    if (this.editing && this.editLayout[id]) return this.editLayout[id];
    const own = this.settings.touchLayout && this.settings.touchLayout[id];
    return own || TOUCH_BUTTONS.find((b) => b.id === id).def;
  }

  applyTouchLayout() {
    if (!this.root) return;
    if (this.stickEl && this.tStick.id < 0) { const r = this._restPos(); this._placeStick(r.x, r.y); }
    const S = this.settings;
    this.root.style.setProperty('--tscale', String(S.touchScale));
    this.root.style.setProperty('--topacity', String(S.touchOpacity));
    const { W, H } = this._size();
    for (const def of TOUCH_BUTTONS) {
      const el = this.tEls[def.id];
      if (!el) continue;
      const L = this._layoutFor(def.id);
      const half = (def.size * S.touchScale) / 2;
      let cx = L.h === 'l' ? L.x : W - L.x;
      let cy = L.v === 't' ? L.y : H - L.y;
      cx = Math.min(W - half, Math.max(half, cx));
      cy = Math.min(H - half, Math.max(half, cy));
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
    }
  }

  // ---------- touch layout editor ----------
  _editDrag(b, def) {
    let drag = null;
    b.addEventListener('pointerdown', (e) => {
      if (!this.editing) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      drag = { id: e.pointerId, ox: e.clientX - (r.left + r.width / 2), oy: e.clientY - (r.top + r.height / 2) };
      try { b.setPointerCapture(e.pointerId); } catch {}
      b.classList.add('drag');
    });
    b.addEventListener('pointermove', (e) => {
      if (!this.editing || !drag || e.pointerId !== drag.id) return;
      const { W, H } = this._size();
      const cx = Math.min(W, Math.max(0, e.clientX - drag.ox)), cy = Math.min(H, Math.max(0, e.clientY - drag.oy));
      this.editLayout[def.id] = {
        h: cx < W / 2 ? 'l' : 'r', x: Math.round(cx < W / 2 ? cx : W - cx),
        v: cy < H / 2 ? 't' : 'b', y: Math.round(cy < H / 2 ? cy : H - cy),
      };
      this.applyTouchLayout();
    });
    const stop = (e) => { if (drag && e.pointerId === drag.id) { drag = null; b.classList.remove('drag'); } };
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
  }

  startTouchEdit() {
    if (!this.root) return;
    this.editing = true;
    this.editLayout = {};
    for (const def of TOUCH_BUTTONS) this.editLayout[def.id] = { ...this._layoutFor(def.id) };
    this._wasOn = this.root.classList.contains('on');
    this.root.classList.add('on', 'editing');
    this.applyTouchLayout();
  }

  resetTouchEdit() {
    for (const def of TOUCH_BUTTONS) this.editLayout[def.id] = { ...def.def };
    this.applyTouchLayout();
  }

  finishTouchEdit(keep) {
    if (!this.editing) return;
    if (keep) this.settings.touchLayout = this.editLayout;
    this.editing = false;
    this.editLayout = null;
    this.root.classList.remove('editing');
    if (!this._wasOn) this.root.classList.remove('on');
    this.applyTouchLayout();
  }

  // ---------- per-frame snapshot ----------
  frame() {
    const S = this.settings, B = this.binds, e = this.edges, te = this.tEdge;
    const down = (a) => {
      const c = B[a];
      if (!c) return false;
      return c.startsWith('Mouse') ? !!this.mouseDown[+c.slice(5)] : this.keys.has(c);
    };
    const pressed = (a) => !!B[a] && e.has(B[a]);
    let mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    let my = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
    if (this.tStick.id >= 0) {
      const dx = this.tStick.x - this.tStick.ox, dy = this.tStick.y - this.tStick.oy;
      const r = 55;
      mx = Math.max(-1, Math.min(1, dx / r));
      my = Math.max(-1, Math.min(1, -dy / r));
      this.knobEl.style.transform = `translate(${mx * 30}px, ${-my * 30}px)`;
      if (Math.hypot(dx, dy) > r * 1.25 && my > 0.6 && !this.tBtn.ads && !this.adsLatch) this.tSprint = true;
    } else if (this.knobEl) this.knobEl.style.transform = '';
    if (te.has('crouch')) this.tCrouch = !this.tCrouch;
    if (te.has('sprint')) this.tSprint = !this.tSprint;
    if (my < 0.3) { this.tSprint = false; this.sprintLatch = false; }

    // hold or toggle, per the player's choice
    let ads, crouch, sprint;
    if (S.adsMode === 'toggle') { if (pressed('ads')) this.adsLatch = !this.adsLatch; ads = this.adsLatch; } else ads = down('ads') || this.adsLatch;
    ads = ads || this.tBtn.ads;
    if (ads) { this.tSprint = false; this.sprintLatch = false; } // aiming cancels sprint
    if (S.crouchMode === 'toggle') { if (pressed('crouch')) this.crouchLatch = !this.crouchLatch; crouch = this.crouchLatch; } else crouch = down('crouch');
    if (S.sprintMode === 'toggle') { if (pressed('sprint')) this.sprintLatch = !this.sprintLatch; sprint = this.sprintLatch; } else sprint = down('sprint');

    let slot = -1;
    if (pressed('slot1')) slot = 0;
    if (pressed('slot2')) slot = 1;
    if (pressed('slot3')) slot = 2;
    let wheel = this.wheel;
    if (pressed('next') || te.has('swap')) wheel = wheel || 1;
    const f = {
      moveX: mx, moveY: my,
      lookX: this.mdx, lookY: this.mdy,
      fire: down('fire') || this.tBtn.fire,
      ads: ads || this.tBtn.ads,
      jumpPressed: pressed('jump') || te.has('jump'),
      crouch: crouch || this.tCrouch,
      sprint: sprint || this.tSprint,
      reload: pressed('reload') || te.has('reload'),
      slot, wheel,
      grenade: pressed('grenade') || te.has('nade'),
      melee: pressed('melee'),
      score: down('score'),
    };
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    e.clear(); te.clear();
    return f;
  }

  clear() {
    this.keys.clear(); this.edges.clear(); this.mouseDown.fill(false);
    this.mdx = this.mdy = 0; this.wheel = 0;
    if (this.tBtn) for (const k in this.tBtn) this.tBtn[k] = false;
    if (this.tPads) this.tPads.clear();
    if (this.tStick && this.tStick.id >= 0) this._releaseStick();
    if (this.tLook) this.tLook.id = -1;
  }
}
