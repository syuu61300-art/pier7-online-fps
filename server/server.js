// PIER 7 — game server.
// Serves the game (index.html, css/, js/) and relays each player's presence
// (position, state and a short ring of recent events) to everyone in the same room.
// Game logic runs in the browsers; in each room the lowest player id acts as host
// (bots, match clock, map).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const MAX_PRESENCE = 4096;      // bytes of JSON per player
const MAX_MSGS_PER_SEC = 90;    // per connection
const MAX_ROOM_SIZE = 16;
const TICK_MS = 33;

// only these paths are served
const PUBLIC = [/^\/index\.html$/, /^\/css\/[\w.-]+\.css$/, /^\/js\/[\w./-]+\.js$/, /^\/favicon\.ico$/];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (url === '/') url = '/index.html';
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url.includes('..') || !PUBLIC.some((re) => re.test(url))) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  const file = path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const rooms = new Map(); // name -> Map(id -> member)
let counter = 0;

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function leaveRoom(client, name) {
  const room = rooms.get(name);
  if (!room || !room.has(client.id)) return;
  room.delete(client.id);
  client.rooms.delete(name);
  for (const m of room.values()) send(m.ws, { op: 'left', room: name, id: client.id });
  if (!room.size) rooms.delete(name);
}

wss.on('connection', (ws) => {
  const client = {
    id: 'p' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6),
    ws, rooms: new Set(), msgs: 0, window: Date.now(),
  };
  send(ws, { op: 'welcome', id: client.id });

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - client.window > 1000) { client.window = now; client.msgs = 0; }
    if (++client.msgs > MAX_MSGS_PER_SEC) return; // drop floods
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;

    if (m.op === 'join') {
      if (client.rooms.has(m.room)) return;
      let room = rooms.get(m.room);
      if (!room) rooms.set(m.room, (room = new Map()));
      if (room.size >= MAX_ROOM_SIZE && m.room !== 'lobby') return send(ws, { op: 'full', room: m.room });
      room.set(client.id, { ws, presence: {}, dirty: false });
      client.rooms.add(m.room);
      const peers = [];
      for (const [id, mem] of room) if (id !== client.id) peers.push([id, mem.presence]);
      send(ws, { op: 'snap', room: m.room, peers });
    } else if (m.op === 'leave') {
      leaveRoom(client, m.room);
    } else if (m.op === 'pres') {
      const room = rooms.get(m.room);
      const mem = room && room.get(client.id);
      if (!mem || !m.p || typeof m.p !== 'object' || Array.isArray(m.p)) return;
      if (Buffer.byteLength(JSON.stringify(m.p)) > MAX_PRESENCE) return;
      mem.presence = m.p;
      mem.dirty = true;
    }
  });

  ws.on('close', () => { for (const name of [...client.rooms]) leaveRoom(client, name); });
  ws.on('error', () => {});
});

// broadcast changed presences ~30 times a second
setInterval(() => {
  for (const [name, room] of rooms) {
    for (const [id, mem] of room) {
      if (!mem.dirty) continue;
      mem.dirty = false;
      const msg = JSON.stringify({ op: 'p', room: name, id, p: mem.presence });
      for (const [oid, other] of room) if (oid !== id && other.ws.readyState === 1) other.ws.send(msg);
    }
  }
}, TICK_MS);

// keep connections alive behind proxies
setInterval(() => { for (const ws of wss.clients) { try { ws.ping(); } catch {} } }, 25000);

server.listen(PORT, () => {
  console.log(`PIER 7 server: http://localhost:${PORT}`);
});
