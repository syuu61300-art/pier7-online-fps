// Transport adapters. The game only uses: presence(patch), peers(), myId, leave().
// Peers are normalised to { id, presence, // Transport adapters. The game only uses: presence(patch), peers(), myId, leave().
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

// ---------- public relay (MQTT over secure WebSocket) ----------
// Static hosting such as GitHub Pages cannot run the Node relay, so by default the game talks
// through a free public MQTT broker. Every player publishes their presence to
// <NS>/r/<room>/<id> and subscribes to <NS>/r/<room>/+ ; an empty message (or the broker's
// last-will on <NS>/bye/<id>) means "left". Nothing is stored on the broker.
// Anyone can read these topics: only callsigns and game state are sent.
const MQTT_NS = 'pier7fps/v3';
export const RELAYS = [
  { url: 'wss://broker.hivemq.com:8884/mqtt', label: 'HiveMQ' },
  { url: 'wss://broker.emqx.io:8084/mqtt', label: 'EMQX' },
  { url: 'wss://test.mosquitto.org:8081/mqtt', label: 'Mosquitto' },
  { url: 'wss://public.cloud.shiftr.io', label: 'shiftr.io', user: 'public', pass: 'public' }, // port 443
];
const te = new TextEncoder(), td = new TextDecoder();

function mStr(s) {
  const b = te.encode(s);
  const out = new Uint8Array(b.length + 2);
  out[0] = b.length >> 8; out[1] = b.length & 255; out.set(b, 2);
  return out;
}
function mPacket(first, parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const head = [first];
  let x = len;
  do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; head.push(d); } while (x > 0);
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Minimal MQTT 3.1.1 client: QoS 0 publish/subscribe, last will, keep-alive.
class MiniMqtt {
  constructor(url, clientId, will, auth) {
    this.url = url; this.clientId = clientId; this.will = will; this.auth = auth || null;
    this.ws = null; this.open = false; this.buf = new Uint8Array(0); this.pid = 1;
    this.onmessage = null; this.onclose = null;
  }
  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return; done = true; clearTimeout(to);
        if (err) { try { this.ws && this.ws.close(); } catch {} reject(err); } else resolve(true);
      };
      const to = setTimeout(() => finish(new Error('timeout')), timeoutMs);
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { finish(e); return; }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const a = this.auth;
        const flags = 0x02 | (this.will ? 0x04 : 0) | (a ? 0xc0 : 0); // clean session, will QoS 0, user/pass
        const parts = [mStr('MQTT'), new Uint8Array([4, flags, 0, 60]), mStr(this.clientId)];
        if (this.will) parts.push(mStr(this.will.topic), mStr(this.will.payload));
        if (a) parts.push(mStr(a.user), mStr(a.pass));
        ws.send(mPacket(0x10, parts));
      };
      ws.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        const chunk = new Uint8Array(ev.data);
        const b = new Uint8Array(this.buf.length + chunk.length);
        b.set(this.buf, 0); b.set(chunk, this.buf.length);
        this.buf = b;
        this._drain((type, body) => {
          if (type === 2) {
            if (body[1] === 0) {
              this.open = true;
              this._ping = setInterval(() => this._send(new Uint8Array([0xc0, 0])), 25000);
              finish(null);
            } else finish(new Error('refused ' + body[1]));
          }
        });
      };
      ws.onerror = () => finish(new Error('error'));
      ws.onclose = () => {
        const was = this.open;
        this.open = false; clearInterval(this._ping);
        finish(new Error('closed'));
        if (was && this.onclose) this.onclose();
      };
    });
  }
  _drain(onCtl) {
    let o = 0;
    const B = this.buf;
    while (B.length - o >= 2) {
      let mult = 1, len = 0, i = o + 1, d;
      do {
        if (i >= B.length) { this.buf = B.slice(o); return; }
        d = B[i++]; len += (d & 127) * mult; mult *= 128;
      } while (d & 128 && mult <= 2097152);
      if (B.length - i < len) break;
      const first = B[o], body = B.subarray(i, i + len), type = first >> 4;
      o = i + len;
      if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        let p = 2 + tl;
        if ((first >> 1) & 3) p += 2;
        if (this.onmessage) {
          try { this.onmessage(td.decode(body.subarray(2, 2 + tl)), body.subarray(p)); } catch (e) { console.warn(e); }
        }
      } else onCtl(type, body);
    }
    this.buf = B.slice(o);
  }
  _send(bytes) {
    if (this.open && this.ws && this.ws.readyState === 1) { this.ws.send(bytes); return true; }
    return false;
  }
  _id() { this.pid = (this.pid % 65535) + 1; return new Uint8Array([this.pid >> 8, this.pid & 255]); }
  subscribe(topic) { return this._send(mPacket(0x82, [this._id(), mStr(topic), new Uint8Array([0])])); }
  unsubscribe(topic) { return this._send(mPacket(0xa2, [this._id(), mStr(topic)])); }
  publish(topic, payload, retain = false) {
    const data = typeof payload === 'string' ? te.encode(payload) : payload;
    return this._send(mPacket(0x30 | (retain ? 1 : 0), [mStr(topic), data]));
  }
  close() {
    this.onclose = null;
    try { this._send(new Uint8Array([0xe0, 0])); } catch {}
    try { this.ws && this.ws.close(); } catch {}
    this.open = false; clearInterval(this._ping);
  }
}

function topicKey(name) {
  const s = String(name || 'lobby');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const clean = s.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 32) || 'room';
  return clean + '~' + (h >>> 0).toString(36);
}

export const NET_BUILD = '10/14c';

// A room lives on one or more relay links. The lobby is announced on every relay this
// device can reach (so players on different relays still find each other); a match uses
// a single relay — the one its host advertises in the lobby ("ry").
class MqttRoom {
  constructor(t, name, links) {
    this.t = t; this.name = name; this.key = topicKey(name); this.links = links;
    this.map = new Map(); this.seen = new Map(); this.via = new Map();
    this._arr = null; this.mine = {}; this._dirty = false; this._sentAt = 0;
  }
  get topic() { return `${MQTT_NS}/r/${this.key}`; }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.mine[k]; else this.mine[k] = patch[k]; }
    this._dirty = true;
    this._arr = null;
    return Promise.resolve();
  }
  flush(now) {
    // send when something changed, and at least every 2 s so newcomers see everyone
    if (!this._dirty && now - this._sentAt < 2000) return;
    if (!Object.keys(this.mine).length) return;
    let body = this.mine;
    if (this === this.t.lobby && typeof body.rm === 'string') {
      const g = this.t.rooms.get(body.rm);
      if (g && g.links[0]) body = { ...body, ry: g.links[0].idx };
    }
    const json = JSON.stringify(body);
    let ok = false;
    for (const L of this.links) if (L.pub(`${this.topic}/${this.t.myId}`, json)) ok = true;
    if (ok) { this._dirty = false; this._sentAt = now; }
  }
  prune(now) {
    for (const [id, at] of this.seen) if (now - at > 6000) this._drop(id);
  }
  _drop(id) { this.seen.delete(id); this.via.delete(id); if (this.map.delete(id)) this._arr = null; }
  peers() {
    if (this._arr) return this._arr;
    const out = [{ id: this.t.myId, presence: this.mine, me: true }];
    for (const [id, pr] of this.map) out.push({ id, presence: pr, me: false });
    return (this._arr = out);
  }
  get myId() { return this.t.myId; }
  connected() { return this.links.some((L) => L.up()) || this.t.connected(); }
  async leave() {
    for (const L of this.links) { L.pub(`${this.topic}/${this.t.myId}`, ''); L.unsub(`${this.topic}/+`); }
    this.t.rooms.delete(this.name);
  }
}

// One broker connection, reconnecting by itself after drops.
class RelayLink {
  constructor(t, idx, relay) {
    this.t = t; this.idx = idx; this.relay = relay; this.label = relay.label || 'MQTT';
    this.client = null; this.subs = new Set(); this.downSince = 0; this.dead = false;
  }
  _make() {
    const r = this.relay;
    const c = new MiniMqtt(r.url, 'pier7-' + this.t.myId, { topic: `${MQTT_NS}/bye/${this.t.myId}`, payload: '1' }, r.user ? { user: r.user, pass: r.pass || '' } : null);
    c.onmessage = (topic, payload) => this.t._onMessage(this, topic, payload);
    c.onclose = () => this._lost();
    return c;
  }
  async connect(ms = 5000) {
    const c = this._make();
    await c.connect(ms);
    this.client = c;
    this.sub(`${MQTT_NS}/bye/+`);
    for (const s of this.subs) c.subscribe(s);
    return this;
  }
  up() { return !!this.client && this.client.open; }
  sub(topic) { this.subs.add(topic); if (this.up()) this.client.subscribe(topic); }
  unsub(topic) { this.subs.delete(topic); if (this.up()) this.client.unsubscribe(topic); }
  pub(topic, payload) { return this.up() ? this.client.publish(topic, payload) : false; }
  async _lost() {
    if (this.t.closed) return;
    this.downSince = performance.now();
    for (let i = 0; i < 8 && !this.t.closed; i++) {
      await new Promise((r) => setTimeout(r, Math.min(800 * (i + 1), 4000)));
      if (this.t.closed) return;
      const c = this._make();
      try {
        await c.connect(6000);
        this.client = c;
        for (const s of this.subs) c.subscribe(s);
        for (const r of this.t.rooms.values()) if (r.links.includes(this)) r._dirty = true;
        this.downSince = 0;
        return;
      } catch {}
    }
    this.dead = true;
  }
  close() { this.dead = true; try { this.client && this.client.close(); } catch {} }
}

export class MqttTransport {
  constructor(relays) {
    this.kind = 'mqtt'; this.build = NET_BUILD;
    this.relays = Array.isArray(relays) ? relays : [relays];
    this.links = []; this.rooms = new Map(); this.fallback = false; this.closed = false;
    this.myId = 'm' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
    this.interpDelay = 150;      // the relay adds a little jitter
    this.sendEvery = 50;         // ms between presence messages in a match (20 per second)
  }
  get label() { const up = this.links.filter((L) => L.up()).map((L) => L.label); return up.length ? up.join('・') : (this.links[0] ? this.links[0].label : '—'); }
  get dead() { return this.closed || (this.links.length > 0 && this.links.every((L) => L.dead)); }
  // connect to every relay at once; keep all that answer (late ones are added when they do)
  async connect() {
    const all = this.relays.map((r, i) => new RelayLink(this, i, r));
    const tries = all.map((L) => L.connect(5000).then(() => { this._addLink(L); return L; }, () => null));
    await new Promise((resolve) => {
      let left = tries.length;
      const to = setTimeout(resolve, 5500);
      tries.forEach((p, i) => p.then((L) => {
        left--;
        // the first relay in the list answered: no need to wait for the others
        if ((L && i === 0) || left === 0) { clearTimeout(to); resolve(); }
      }));
    });
    if (!this.links.length) {
      // give stragglers one more moment
      await Promise.race([Promise.all(tries), new Promise((r) => setTimeout(r, 1500))]);
    }
    if (!this.links.length) throw new Error('中継サーバーに接続できません');
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const now = performance.now();
      for (const r of this.rooms.values()) {
        if (r !== this.lobby || now - r._sentAt > 300) r.flush(now);
        r.prune(now);
      }
    }, this.sendEvery);
    try { addEventListener('pagehide', () => this.close()); } catch {}
    return true;
  }
  _addLink(L) {
    if (this.closed) { L.close(); return; }
    if (this.links.includes(L)) return;
    this.links.push(L);
    this.links.sort((a, b) => a.idx - b.idx);
    if (!this.lobby) this.lobby = this._room('lobby', this.links);
    else this.lobby._dirty = true;
    L.sub(`${this.lobby.topic}/+`);
  }
  _link(idx) { return this.links.find((L) => L.idx === idx) || null; }
  _onMessage(L, topic, payload) {
    const parts = topic.split('/');
    // pier7fps / v3 / r / <room> / <id>    or    pier7fps / v3 / bye / <id>
    if (parts.length === 4 && parts[2] === 'bye') {
      const id = parts[3];
      for (const r of this.rooms.values()) if (r.links.includes(L) && (r.links.length === 1 || r.via.get(id) === L.idx)) r._drop(id);
      return;
    }
    if (parts.length !== 5 || parts[2] !== 'r') return;
    const id = parts[4];
    if (id === this.myId || id.length > 24) return;
    let room = null;
    for (const r of this.rooms.values()) if (r.key === parts[3] && r.links.includes(L)) { room = r; break; }
    if (!room) return;
    if (!payload.length) { room._drop(id); return; }
    if (payload.length > 8192) return;
    let pr;
    try { pr = JSON.parse(td.decode(payload)); } catch { return; }
    if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return;
    room.map.set(id, Object.freeze(pr)); room.seen.set(id, performance.now()); room.via.set(id, L.idx); room._arr = null;
  }
  connected() {
    if (this.closed) return false;
    for (const L of this.links) if (L.up() || (!L.dead && performance.now() - L.downSince < 2500)) return true;
    return false;
  }
  _room(name, links) {
    let r = this.rooms.get(name);
    if (!r) { r = new MqttRoom(this, name, links); this.rooms.set(name, r); }
    return r;
  }
  // which relay a match uses: the one its players advertise in the lobby, else my first relay
  async joinRoom(name) {
    const old = this.rooms.get(name);
    if (old && old !== this.lobby) await old.leave();
    const votes = new Map();
    for (const p of this.lobby.peers()) {
      const pr = p.presence || {};
      if (!p.me && pr.rm === name && Number.isInteger(pr.ry)) votes.set(pr.ry, (votes.get(pr.ry) || 0) + 1);
    }
    let idx = null, best = 0;
    for (const [k, n] of votes) if (n > best || (n === best && k < idx)) { idx = k; best = n; }
    let L = idx === null ? this.links.find((x) => x.up()) || this.links[0] : this._link(idx);
    if (!L && idx !== null && this.relays[idx]) {
      // the lobby's relay was not reachable at start: try it once more
      const nl = new RelayLink(this, idx, this.relays[idx]);
      try { await nl.connect(6000); this._addLink(nl); L = nl; } catch {}
      if (!L) throw new Error(`このロビーは中継サーバー「${this.relays[idx].label}」を使っていますが、この端末からは接続できません。`);
    }
    if (!L) throw new Error('中継サーバーとの接続が切れています');
    const r = this._room(name, [L]);
    L.sub(`${r.topic}/+`);
    return r;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this._timer);
    for (const r of this.rooms.values()) for (const L of r.links) L.pub(`${r.topic}/${this.myId}`, '');
    for (const L of this.links) L.close();
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

// Where the online server is:
//  - inside a claude.ai artifact: the page-wide room
//  - ?server=wss://host/ws : the bundled Node relay running somewhere else
//  - ?relay=wss://broker/mqtt : a specific MQTT broker
//  - on static hosting (GitHub Pages etc.) or when opened as a file: the public relay
//  - otherwise: the Node relay on the same host if there is one, else the public relay
function query(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
export function serverUrl() {
  const q = query('server');
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return q;
  if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  return null;
}
const STATIC_HOSTS = /(\.github\.io|\.gitlab\.io|\.pages\.dev|\.netlify\.app|\.vercel\.app|\.surge\.sh|\.neocities\.org)$/i;

export function onlineKind() {
  if (window.claude && typeof window.claude.use === 'function') return 'claude';
  const q = query('server');
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return 'ws';
  if (typeof WebSocket === 'undefined') return null;
  const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
  if (!isWeb || STATIC_HOSTS.test(location.hostname) || query('relay')) return 'mqtt';
  return 'auto';
}

function relayList() {
  const q = query('relay');
  if (q) {
    const list = q.split(',').map((u) => u.trim()).filter((u) => /^wss?:\/\/[^\s]+$/.test(u));
    if (list.length) return list.map((u) => ({ url: u, label: u.replace(/^wss?:\/\//, '').split('/')[0] }));
  }
  return RELAYS;
}

// Connect with retries. Resolves to a transport or throws an Error with a readable message.
export async function connectTransport({ attempts = 3, onAttempt } = {}) {
  let kind = onlineKind();
  if (!kind) throw new Error('このブラウザではオンライン対戦ができません。');
  if (kind === 'auto') {
    // a Node relay on this host? (quick check, then the public relay)
    const t = new WsTransport(serverUrl());
    onAttempt && onAttempt(1, attempts);
    try { await t.connect(); return t; } catch {}
    kind = 'mqtt';
  }
  let last = null;
  const relays = relayList();
  if (kind === 'mqtt') attempts = Math.min(attempts, 2);
  for (let i = 0; i < attempts; i++) {
    onAttempt && onAttempt(i + 1, attempts);
    if (kind === 'mqtt') {
      const t = new MqttTransport(relays);
      try { await t.connect(); return t; } catch (e) { last = e; }
    } else {
      const t = kind === 'claude' ? new ClaudeTransport() : new WsTransport(serverUrl());
      try { await t.connect(); return t; } catch (e) { last = e; }
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  if (kind === 'mqtt') throw new Error('オンラインの中継サーバーに接続できませんでした。通信環境を確認して「再試行」を押してください。');
  throw last || new Error('オンラインに接続できませんでした');
} claude.ai artifact room ----------
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

// ---------- public relay (MQTT over secure WebSocket) ----------
// Static hosting such as GitHub Pages cannot run the Node relay, so by default the game talks
// through a free public MQTT broker. Every player publishes their presence to
// <NS>/r/<room>/<id> and subscribes to <NS>/r/<room>/+ ; an empty message (or the broker's
// last-will on <NS>/bye/<id>) means "left". Nothing is stored on the broker.
// Anyone can read these topics: only callsigns and game state are sent.
const MQTT_NS = 'pier7fps/v3';
export const RELAYS = [
  { url: 'wss://broker.hivemq.com:8884/mqtt', label: 'HiveMQ' },
  { url: 'wss://broker.emqx.io:8084/mqtt', label: 'EMQX' },
  { url: 'wss://test.mosquitto.org:8081/mqtt', label: 'Mosquitto' },
  { url: 'wss://public.cloud.shiftr.io', label: 'shiftr.io', user: 'public', pass: 'public' }, // port 443
];
const te = new TextEncoder(), td = new TextDecoder();

function mStr(s) {
  const b = te.encode(s);
  const out = new Uint8Array(b.length + 2);
  out[0] = b.length >> 8; out[1] = b.length & 255; out.set(b, 2);
  return out;
}
function mPacket(first, parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const head = [first];
  let x = len;
  do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; head.push(d); } while (x > 0);
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Minimal MQTT 3.1.1 client: QoS 0 publish/subscribe, last will, keep-alive.
class MiniMqtt {
  constructor(url, clientId, will, auth) {
    this.url = url; this.clientId = clientId; this.will = will; this.auth = auth || null;
    this.ws = null; this.open = false; this.buf = new Uint8Array(0); this.pid = 1;
    this.onmessage = null; this.onclose = null;
  }
  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return; done = true; clearTimeout(to);
        if (err) { try { this.ws && this.ws.close(); } catch {} reject(err); } else resolve(true);
      };
      const to = setTimeout(() => finish(new Error('timeout')), timeoutMs);
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { finish(e); return; }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const a = this.auth;
        const flags = 0x02 | (this.will ? 0x04 : 0) | (a ? 0xc0 : 0); // clean session, will QoS 0, user/pass
        const parts = [mStr('MQTT'), new Uint8Array([4, flags, 0, 60]), mStr(this.clientId)];
        if (this.will) parts.push(mStr(this.will.topic), mStr(this.will.payload));
        if (a) parts.push(mStr(a.user), mStr(a.pass));
        ws.send(mPacket(0x10, parts));
      };
      ws.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        const chunk = new Uint8Array(ev.data);
        const b = new Uint8Array(this.buf.length + chunk.length);
        b.set(this.buf, 0); b.set(chunk, this.buf.length);
        this.buf = b;
        this._drain((type, body) => {
          if (type === 2) {
            if (body[1] === 0) {
              this.open = true;
              this._ping = setInterval(() => this._send(new Uint8Array([0xc0, 0])), 25000);
              finish(null);
            } else finish(new Error('refused ' + body[1]));
          }
        });
      };
      ws.onerror = () => finish(new Error('error'));
      ws.onclose = () => {
        const was = this.open;
        this.open = false; clearInterval(this._ping);
        finish(new Error('closed'));
        if (was && this.onclose) this.onclose();
      };
    });
  }
  _drain(onCtl) {
    let o = 0;
    const B = this.buf;
    while (B.length - o >= 2) {
      let mult = 1, len = 0, i = o + 1, d;
      do {
        if (i >= B.length) { this.buf = B.slice(o); return; }
        d = B[i++]; len += (d & 127) * mult; mult *= 128;
      } while (d & 128 && mult <= 2097152);
      if (B.length - i < len) break;
      const first = B[o], body = B.subarray(i, i + len), type = first >> 4;
      o = i + len;
      if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        let p = 2 + tl;
        if ((first >> 1) & 3) p += 2;
        if (this.onmessage) {
          try { this.onmessage(td.decode(body.subarray(2, 2 + tl)), body.subarray(p)); } catch (e) { console.warn(e); }
        }
      } else onCtl(type, body);
    }
    this.buf = B.slice(o);
  }
  _send(bytes) {
    if (this.open && this.ws && this.ws.readyState === 1) { this.ws.send(bytes); return true; }
    return false;
  }
  _id() { this.pid = (this.pid % 65535) + 1; return new Uint8Array([this.pid >> 8, this.pid & 255]); }
  subscribe(topic) { return this._send(mPacket(0x82, [this._id(), mStr(topic), new Uint8Array([0])])); }
  unsubscribe(topic) { return this._send(mPacket(0xa2, [this._id(), mStr(topic)])); }
  publish(topic, payload, retain = false) {
    const data = typeof payload === 'string' ? te.encode(payload) : payload;
    return this._send(mPacket(0x30 | (retain ? 1 : 0), [mStr(topic), data]));
  }
  close() {
    this.onclose = null;
    try { this._send(new Uint8Array([0xe0, 0])); } catch {}
    try { this.ws && this.ws.close(); } catch {}
    this.open = false; clearInterval(this._ping);
  }
}

function topicKey(name) {
  const s = String(name || 'lobby');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const clean = s.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 32) || 'room';
  return clean + '~' + (h >>> 0).toString(36);
}

class MqttRoom {
  constructor(t, name) {
    this.t = t; this.name = name; this.key = topicKey(name);
    this.map = new Map(); this.seen = new Map();
    this._arr = null; this.mine = {}; this._dirty = false; this._sentAt = 0;
  }
  get topic() { return `${MQTT_NS}/r/${this.key}`; }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.mine[k]; else this.mine[k] = patch[k]; }
    this._dirty = true;
    this._arr = null;
    return Promise.resolve();
  }
  flush(now) {
    // send when something changed, and at least every 2 s so newcomers see everyone
    if (!this._dirty && now - this._sentAt < 2000) return;
    if (!Object.keys(this.mine).length) return;
    if (this.t.client.publish(`${this.topic}/${this.t.myId}`, JSON.stringify(this.mine))) { this._dirty = false; this._sentAt = now; }
  }
  prune(now) {
    for (const [id, at] of this.seen) if (now - at > 6000) { this.seen.delete(id); this.map.delete(id); this._arr = null; }
  }
  peers() {
    if (this._arr) return this._arr;
    const out = [{ id: this.t.myId, presence: this.mine, me: true }];
    for (const [id, pr] of this.map) out.push({ id, presence: pr, me: false });
    return (this._arr = out);
  }
  get myId() { return this.t.myId; }
  connected() { return this.t.connected(); }
  async leave() {
    try { this.t.client.publish(`${this.topic}/${this.t.myId}`, ''); this.t.client.unsubscribe(`${this.topic}/+`); } catch {}
    this.t.rooms.delete(this.name);
  }
}

export class MqttTransport {
  constructor(relay) {
    this.kind = 'mqtt'; this.url = relay.url; this.label = relay.label || 'MQTT';
    this.auth = relay.user ? { user: relay.user, pass: relay.pass || '' } : null;
    this.rooms = new Map(); this.fallback = false; this.dead = false;
    this.myId = 'm' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
    this.interpDelay = 150;      // the relay adds a little jitter
    this.sendEvery = 50;         // ms between presence messages in a match (20 per second)
    this.downSince = 0;
  }
  _client() {
    const c = new MiniMqtt(this.url, 'pier7-' + this.myId, { topic: `${MQTT_NS}/bye/${this.myId}`, payload: '1' }, this.auth);
    c.onmessage = (topic, payload) => this._onMessage(topic, payload);
    c.onclose = () => this._lost();
    return c;
  }
  async connect() {
    this.client = this._client();
    try { await this.client.connect(5000); } catch (e) { throw new Error(`中継サーバー（${this.label}）に接続できません`); }
    this.client.subscribe(`${MQTT_NS}/bye/+`);
    this.lobby = this._room('lobby');
    this.client.subscribe(`${this.lobby.topic}/+`);
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const now = performance.now();
      for (const r of this.rooms.values()) {
        if (r !== this.lobby || now - r._sentAt > 300) r.flush(now);
        r.prune(now);
      }
    }, this.sendEvery);
    try { addEventListener('pagehide', () => this.close()); } catch {}
    return true;
  }
  _onMessage(topic, payload) {
    const parts = topic.split('/');
    // pier7fps / v3 / r / <room> / <id>    or    pier7fps / v3 / bye / <id>
    if (parts.length === 4 && parts[2] === 'bye') {
      for (const r of this.rooms.values()) if (r.map.delete(parts[3])) { r.seen.delete(parts[3]); r._arr = null; }
      return;
    }
    if (parts.length !== 5 || parts[2] !== 'r') return;
    const id = parts[4];
    if (id === this.myId || id.length > 24) return;
    let room = null;
    for (const r of this.rooms.values()) if (r.key === parts[3]) { room = r; break; }
    if (!room) return;
    if (!payload.length) { room.map.delete(id); room.seen.delete(id); room._arr = null; return; }
    if (payload.length > 8192) return;
    let pr;
    try { pr = JSON.parse(td.decode(payload)); } catch { return; }
    if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return;
    room.map.set(id, Object.freeze(pr)); room.seen.set(id, performance.now()); room._arr = null;
  }
  // brief drops (phones switching networks) reconnect by themselves
  async _lost() {
    if (this.closed) return;
    this.downSince = performance.now();
    for (let i = 0; i < 6 && !this.closed; i++) {
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      if (this.closed) return;
      const c = this._client();
      try {
        await c.connect(6000);
        this.client = c;
        c.subscribe(`${MQTT_NS}/bye/+`);
        for (const r of this.rooms.values()) { c.subscribe(`${r.topic}/+`); r._dirty = true; }
        this.downSince = 0;
        return;
      } catch {}
    }
    this.dead = true;
  }
  connected() {
    if (this.dead || this.closed || !this.client) return false;
    if (this.client.open) return true;
    return this.downSince === 0 || performance.now() - this.downSince < 2500;
  }
  _room(name) {
    let r = this.rooms.get(name);
    if (!r) { r = new MqttRoom(this, name); this.rooms.set(name, r); }
    return r;
  }
  async joinRoom(name) {
    const r = this._room(name);
    if (!this.client.subscribe(`${r.topic}/+`)) throw new Error('中継サーバーとの接続が切れています');
    return r;
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.dead = true;
    clearInterval(this._timer);
    try { for (const r of this.rooms.values()) this.client.publish(`${r.topic}/${this.myId}`, ''); } catch {}
    try { this.client.close(); } catch {}
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

// Where the online server is:
//  - inside a claude.ai artifact: the page-wide room
//  - ?server=wss://host/ws : the bundled Node relay running somewhere else
//  - ?relay=wss://broker/mqtt : a specific MQTT broker
//  - on static hosting (GitHub Pages etc.) or when opened as a file: the public relay
//  - otherwise: the Node relay on the same host if there is one, else the public relay
function query(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return null; }
}
export function serverUrl() {
  const q = query('server');
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return q;
  if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  return null;
}
const STATIC_HOSTS = /(\.github\.io|\.gitlab\.io|\.pages\.dev|\.netlify\.app|\.vercel\.app|\.surge\.sh|\.neocities\.org)$/i;

export function onlineKind() {
  if (window.claude && typeof window.claude.use === 'function') return 'claude';
  const q = query('server');
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return 'ws';
  if (typeof WebSocket === 'undefined') return null;
  const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
  if (!isWeb || STATIC_HOSTS.test(location.hostname) || query('relay')) return 'mqtt';
  return 'auto';
}

function relayList() {
  const q = query('relay');
  if (q && /^wss?:\/\/[^\s]+$/.test(q)) return [{ url: q, label: q.replace(/^wss?:\/\//, '').split(/[/:]/)[0] }];
  return RELAYS;
}

// Connect with retries. Resolves to a transport or throws an Error with a readable message.
export async function connectTransport({ attempts = 3, onAttempt } = {}) {
  let kind = onlineKind();
  if (!kind) throw new Error('このブラウザではオンライン対戦ができません。');
  if (kind === 'auto') {
    // a Node relay on this host? (quick check, then the public relay)
    const t = new WsTransport(serverUrl());
    onAttempt && onAttempt(1, attempts);
    try { await t.connect(); return t; } catch {}
    kind = 'mqtt';
  }
  let last = null;
  const relays = relayList();
  if (kind === 'mqtt') attempts = Math.min(attempts, 2);
  for (let i = 0; i < attempts; i++) {
    onAttempt && onAttempt(i + 1, attempts);
    if (kind === 'mqtt') {
      // same order for everyone, so players end up on the same relay
      for (const relay of relays) {
        const t = new MqttTransport(relay);
        try { await t.connect(); return t; } catch (e) { last = e; }
      }
    } else {
      const t = kind === 'claude' ? new ClaudeTransport() : new WsTransport(serverUrl());
      try { await t.connect(); return t; } catch (e) { last = e; }
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  if (kind === 'mqtt') throw new Error('オンラインの中継サーバーに接続できませんでした。通信環境を確認して「再試行」を押してください。');
  throw last || new Error('オンラインに接続できませんでした');
}
