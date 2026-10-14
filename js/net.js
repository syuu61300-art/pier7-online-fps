// Transport adapters. The game only uses: presence(patch), peers(), myId, leave().
// Peers are normalised to { id, presence, me }.

// ---------- claude.ai artifact room ----------
class ClaudeRoomWrap {
  constructor(r, isLobby) {
    this.r = r;
    this.isLobby = isLobby;
    this._cache = null; this._src = null;
  }
  presence(patch) { return this.r.presence(patch).catch(() => {}); }
  peers() {
    const src = this.r.peers();
    if (src === this._src && this._cache) return this._cache;
    this._src = src;
    this._cache = src.filter((p) => p.kind !== 'agent').map((p) => ({ id: p.peer, presence: p.presence, me: p.sameTab, other: p.isMe && !p.sameTab }));
    return this._cache;
  }
  get myId() {
    for (const p of this.r.peers()) if (p.sameTab) return p.peer;
    return null;
  }
  connected() {
    if (typeof this.r.connected !== 'function') return true;
    try { return this.r.connected() !== false; } catch { return true; }
  }
  async leave() {
    if (this.isLobby) return;
    try { await this.r.leave(); } catch {}
  }
}

export class ClaudeTransport {
  constructor() { this.kind = 'claude'; this.room = null; this.dead = false; this.fallback = false; this.isUp = false; this.downSince = 0; }
  async connect() {
    if (!window.claude || typeof window.claude.use !== 'function') throw new Error('この環境ではオンライン機能が使えません');
    // resolves null when this view cannot connect (the platform answers within ~10 s)
    const room = await withTimeout(window.claude.use('room'), 12000, 'オンライン機能の応答がありません');
    if (!room) throw new Error('この表示ではオンライン機能に接続できません（サインインが必要な場合があります）');
    this.room = room;
    this.lobby = new ClaudeRoomWrap(room, true);
    this.dead = false;
    try {
      room.onConnection((c) => { this.isUp = !!c; this.downSince = c ? 0 : performance.now(); }, (e) => { this.dead = true; this.deadCode = e && e.code; });
    } catch {}
    try { room.onPeers(() => {}, (e) => { this.dead = true; this.deadCode = e && e.code; }); } catch {}
    // wait briefly for the first connection (false at load is normal)
    const t0 = performance.now();
    while (!this.dead && !safe(() => room.connected()) && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
    if (this.dead) throw new Error('オンライン機能に接続できません（' + (this.deadCode || 'error') + '）');
    return true;
  }
  // brief reconnects are normal: only a drop lasting > 2 s counts as offline
  connected() {
    if (this.dead || !this.room) return false;
    if (safe(() => this.room.connected())) return true;
    return this.downSince === 0 || performance.now() - this.downSince < 2500;
  }
  async joinRoom(name) {
    let last = null;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await withTimeout(this.room.join(name), 12000, 'ルームへの参加がタイムアウトしました');
        this.fallback = false;
        return new ClaudeRoomWrap(r, false);
      } catch (e) {
        last = e;
        const code = e && e.code;
        if (code === 'not_permitted') {
          // named rooms are not offered to this viewer: everyone shares the page-wide room and
          // players are separated by the lobby id they publish (see Game._syncNetwork)
          this.fallback = true;
          return this.lobby;
        }
        if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') break;
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw new Error('ロビーに参加できませんでした' + (last && last.code ? `（${last.code}）` : ''));
  }
}

function safe(f) { try { return f(); } catch { return false; } }

function withTimeout(p, ms, msg) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(msg)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

// ---------- WebSocket server (Node version) ----------
class WsRoom {
  constructor(t, name) {
    this.t = t; this.name = name;
    this.map = new Map();
    this._arr = null;
    this.mine = {};
  }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.mine[k]; else this.mine[k] = patch[k]; }
    this._dirty = true;
    this._mark();
    return Promise.resolve();
  }
  _mark() { this._arr = null; }
  flush() {
    if (!this._dirty) return;
    this._dirty = false;
    this.t.send({ op: 'pres', room: this.name, p: this.mine });
  }
  peers() {
    if (this._arr) return this._arr;
    const out = [];
    if (this.t.myId) out.push({ id: this.t.myId, presence: this.mine, me: true });
    for (const [id, pr] of this.map) if (id !== this.t.myId) out.push({ id, presence: pr, me: false });
    this._arr = out;
    return out;
  }
  get myId() { return this.t.myId; }
  connected() { return this.t.open; }
  async leave() { this.t.send({ op: 'leave', room: this.name }); this.t.rooms.delete(this.name); }
}

export class WsTransport {
  constructor(url) { this.kind = 'ws'; this.url = url; this.rooms = new Map(); this.open = false; this.myId = null; }
  connect() {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; if (v) resolve(true); else { try { this.ws && this.ws.close(); } catch {} clearInterval(this._timer); reject(new Error('サーバー（' + this.url + '）に接続できません')); } } };
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        const to = setTimeout(() => finish(false), 3500);
        ws.onmessage = (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          if (m.op === 'welcome') {
            this.myId = m.id; this.open = true; clearTimeout(to);
            this.lobby = this._room('lobby');
            this.send({ op: 'join', room: 'lobby' });
            finish(true);
          } else if (m.op === 'p') {
            const r = this.rooms.get(m.room); if (!r) return;
            r.map.set(m.id, Object.freeze(m.p)); r._mark();
          } else if (m.op === 'snap') {
            const r = this.rooms.get(m.room); if (!r) return;
            r.map.clear();
            for (const [id, p] of m.peers) r.map.set(id, Object.freeze(p));
            r._mark();
          } else if (m.op === 'left') {
            const r = this.rooms.get(m.room); if (!r) return;
            r.map.delete(m.id); r._mark();
          }
        };
        ws.onclose = () => { this.open = false; this.dead = true; finish(false); };
        ws.onerror = () => finish(false);
        this._timer = setInterval(() => { for (const r of this.rooms.values()) r.flush(); }, 33);
      } catch { finish(false); }
    });
  }
  _room(name) {
    let r = this.rooms.get(name);
    if (!r) { r = new WsRoom(this, name); this.rooms.set(name, r); }
    return r;
  }
  send(o) { if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  connected() { return this.open; }
  async joinRoom(name) {
    const r = this._room(name);
    this.send({ op: 'join', room: name });
    return r;
  }
}

// ---------- offline ----------
export class LocalRoom {
  constructor() { this.mine = {}; this.myId = 'me'; this._arr = null; }
  presence(patch) { Object.assign(this.mine, patch); this._arr = null; return Promise.resolve(); }
  peers() { return this._arr || (this._arr = [{ id: 'me', presence: this.mine, me: true }]); }
  connected() { return true; }
  async leave() {}
}

// Where the online server is: inside a claude.ai artifact the page-wide room; otherwise the
// WebSocket relay of the bundled Node server (same host), or ?server=wss://host/ws.
export function serverUrl() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('server'); } catch {}
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return q;
  if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  return null;
}

export function onlineKind() {
  if (window.claude && typeof window.claude.use === 'function') return 'claude';
  return serverUrl() ? 'ws' : null;
}

// Connect with retries. Resolves to a transport or throws an Error with a readable message.
export async function connectTransport({ attempts = 3, onAttempt } = {}) {
  const kind = onlineKind();
  if (!kind) throw new Error('このページはファイルとして開かれているため、オンライン対戦はできません。サーバーから開いてください。');
  let last = null;
  for (let i = 0; i < attempts; i++) {
    onAttempt && onAttempt(i + 1, attempts);
    const t = kind === 'claude' ? new ClaudeTransport() : new WsTransport(serverUrl());
    try {
      await t.connect();
      return t;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last || new Error('オンラインに接続できませんでした');
}
