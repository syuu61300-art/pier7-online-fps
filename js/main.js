// Screen flow: boot → lobby (list / create) → connect (online or offline server) → match.
window.__pier7boot = true; // tells the startup check in index.html that the scripts loaded
import { Game } from './game.js';
import { WEAPONS, PRIMARIES, DIFFICULTY, NET_VERSION } from './config.js';
import { connectTransport, onlineKind } from './net.js';
import { sanitizeText } from './util.js';
import { loadSettings, saveSettings, sanitize, ACTIONS, keyName } from './settings.js';
import { createSettingsUI, isTouchDevice } from './settings-ui.js';
import { MAPS, mapDef } from './maps/index.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// let the browser paint before a long synchronous step
const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
const SCREENS = ['boot', 'lobby', 'create', 'connect'];
const CALLSIGNS = ['カモメ', 'ウミネコ', 'クレーン', 'ボラード', 'ガントリー', 'タグ', 'ブイ', 'アンカー', 'ハーバー', 'リーファー'];

function slug(s) {
  s = String(s || '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '').slice(0, 30);
  return s || 'lobby';
}
function newRoomId(name) { return `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`; }
// shown in the lobby so it is easy to tell whether every device loaded the same files
const BUILD = '10/15b';
// versions of the other files this main.js expects (only files that changed carry a new number)
const EXPECT = { net: '10/15a', input: '10/15b', game: '10/15b', proto: 4 };
function preview(def) { return `linear-gradient(135deg, ${def.theme.preview[0]} 0%, ${def.theme.preview[1]} 100%)`; }

async function start(hotData) {
  const touch = isTouchDevice();
  const show = (id) => { for (const s of SCREENS) $(s).hidden = s !== id; };
  const boot = (f, msg) => { $('bootBar').style.width = Math.round(f * 100) + '%'; if (msg) { $('bootMsg').textContent = msg; $('bootMsg').style.color = ''; } };

  // ---------------- 1. boot ----------------
  show('boot');
  boot(0.08, '設定を読み込み中…');
  const settings = hotData && hotData.settings ? sanitize(hotData.settings) : loadSettings();
  if (!settings.name) settings.name = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)] + Math.floor(10 + Math.random() * 89);
  try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ settings })); } catch {}
  const save = () => saveSettings(settings);
  await paint();
  boot(0.2, `マップ「${mapDef(settings.map).name}」を生成中…`);
  await paint();
  let game;
  try {
    game = new Game($('game'), settings);
  } catch (e) {
    console.error(e);
    boot(1, 'WebGLを初期化できませんでした。ブラウザのハードウェアアクセラレーションを有効にしてください。');
    return;
  }
  window.__pier7 = game;
  game.onSettingsChanged = save;
  boot(0.85, 'ロビーを準備中…');

  // ---------------- network state ----------------
  // online is never replaced by offline silently: failures are shown with a retry button
  const net = { t: null, state: onlineKind() ? 'idle' : 'none', err: '', pending: null, attempt: 0 };
  let pickMode = settings.mode;
  function ensureNet() {
    if (net.state === 'none') return Promise.reject(new Error('このブラウザではオンライン対戦ができません。'));
    if (net.t && net.t.connected()) return Promise.resolve(net.t);
    if (net.pending) return net.pending;
    net.state = 'connecting'; net.err = '';
    renderNet();
    net.pending = connectTransport({ attempts: 3, onAttempt: (i) => { net.attempt = i; renderNet(); } })
      .then((t) => { net.t = t; net.state = 'ok'; return t; })
      .catch((e) => { net.t = null; net.state = 'fail'; net.err = e.message || String(e); throw e; })
      .finally(() => { net.pending = null; renderNet(); });
    return net.pending;
  }
  setInterval(() => {
    if (net.state === 'ok' && net.t && !net.t.connected()) {
      net.state = 'fail';
      net.err = 'オンライン接続が切れました。';
      if (net.t.kind === 'ws' || net.t.dead) net.t = null;
      renderNet();
    } else if (net.state === 'fail' && net.t && net.t.connected()) {
      net.state = 'ok'; net.err = ''; renderNet();
    }
  }, 1000);
  function staleFiles() {
    const out = [];
    if (net.t && net.t.kind === 'mqtt' && net.t.build !== EXPECT.net) out.push('js/net.js');
    if (game.input.version !== EXPECT.input) out.push('js/input.js');
    if (game.version !== EXPECT.game) out.push('js/game.js');
    if (NET_VERSION !== EXPECT.proto) out.push('js/config.js');
    return out;
  }
  function renderNet() {
    const el = $('netStatus');
    el.textContent = '';
    const dot = document.createElement('span');
    const txt = document.createElement('span');
    const kindName = net.t ? (net.t.kind === 'claude' ? 'このページのオンライン機能' : net.t.kind === 'mqtt' ? `公開中継サーバー（${net.t.label}）` : 'ゲームサーバー') : '';
    if (net.state === 'ok') {
      const stale = staleFiles();
      dot.className = stale.length ? 'dot warn' : 'dot ok';
      txt.textContent = stale.length ? `古いファイルが残っています — 少し待ってから開き直してください（${stale.join('・')}）` : `オンライン — ${kindName}に接続中 · ver ${BUILD}`;
    }
    else if (net.state === 'connecting' || net.state === 'idle') { dot.className = 'dot warn'; txt.textContent = net.attempt > 1 ? `オンラインに接続中…（${net.attempt}回目）` : 'オンラインに接続中…'; }
    else if (net.state === 'none') { dot.className = 'dot bad'; txt.textContent = 'オンライン不可（このブラウザは未対応）— オフラインのBotマッチは遊べます'; }
    else { dot.className = 'dot bad'; txt.textContent = `オンラインに接続できません — ${net.err || ''}`; }
    el.append(dot, txt);
    $('netRetry').hidden = net.state !== 'fail';
    if (typeof showUpdate === 'function') { try { showUpdate(); } catch {} }
    // create screen: online option state
    const st = $('modeOnlineState');
    st.className = net.state === 'ok' ? '' : net.state === 'fail' || net.state === 'none' ? 'bad' : 'warn';
    st.textContent = net.state === 'ok' ? '接続済み' : net.state === 'none' ? 'この開き方では使えません' : net.state === 'fail' ? '未接続 — 出撃時に再接続します' : '接続中…';
    $('modeOnline').disabled = net.state === 'none';
    if (net.state === 'none' && settings.mode === 'online') { /* not persisted: only the screen shows offline */ renderMode('offline'); }
    renderGo();
  }
  $('netRetry').addEventListener('click', () => { net.state = 'idle'; ensureNet().catch(() => {}); });

  // ---------------- updates ----------------
  // Home-screen web apps (and phone browsers) can keep old files for a long time: look for a
  // newer main.js now and then, and offer a button that refetches every file and reloads.
  const updBtn = document.createElement('button');
  updBtn.type = 'button'; updBtn.className = 'btn sm'; updBtn.id = 'updBtn'; updBtn.hidden = true;
  $('netRetry').after(updBtn);
  let latest = null, lastCheck = -1e9;
  function showUpdate() {
    const stale = staleFiles().length > 0;
    updBtn.hidden = !(latest || stale);
    updBtn.textContent = latest ? `新しい版（${latest}）に更新` : '最新版に更新';
  }
  async function checkUpdate(force) {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!force && performance.now() - lastCheck < 60000) return;
    lastCheck = performance.now();
    try {
      const r = await fetch(new URL('js/main.js', location.href), { cache: 'no-store' });
      if (r.ok) {
        const m = (await r.text()).match(/const BUILD = '([^']+)'/);
        latest = m && m[1] !== BUILD ? m[1] : null;
      }
    } catch {}
    showUpdate();
  }
  async function doUpdate() {
    updBtn.disabled = true; updBtn.textContent = '更新中…';
    const urls = new Set([location.href.split('#')[0]]);
    try {
      for (const e of performance.getEntriesByType('resource')) {
        const u = new URL(e.name);
        if (u.origin === location.origin && /\.(js|css|html?)$/.test(u.pathname)) urls.add(u.href.split('#')[0]);
      }
    } catch {}
    await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    location.reload();
  }
  updBtn.addEventListener('click', doUpdate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && game.state !== 'play') checkUpdate(true); });

  // ---------------- 2. lobby ----------------
  const nameIn = $('nameIn');
  nameIn.value = settings.name;
  nameIn.addEventListener('input', () => { settings.name = sanitizeText(nameIn.value, 14); save(); });
  const commitName = () => { settings.name = sanitizeText(nameIn.value, 14) || settings.name; nameIn.value = settings.name; save(); };

  const renderDetail = () => {
    const d = WEAPONS[settings.primary];
    const det = $('wdetail');
    det.textContent = '';
    const desc = document.createElement('div'); desc.className = 'wd-desc';
    desc.textContent = `${d.name} — ${d.desc}`;
    det.appendChild(desc);
    for (const [k, v] of Object.entries(d.stats)) {
      const s = document.createElement('div'); s.className = 'stat';
      const lab = document.createElement('span'); lab.textContent = k;
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = Math.round(v * 100) + '%';
      bar.appendChild(fill); s.append(lab, bar); det.appendChild(s);
    }
  };
  const renderCards = () => {
    const wcards = $('wcards');
    wcards.textContent = '';
    PRIMARIES.forEach((id, i) => {
      const d = WEAPONS[id];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wcard';
      b.setAttribute('aria-pressed', String(settings.primary === id));
      const k = document.createElement('span'); k.className = 'wk'; k.textContent = String(i + 1).padStart(2, '0');
      const n = document.createElement('span'); n.className = 'wn'; n.textContent = d.name.split(' ')[0];
      const c = document.createElement('span'); c.className = 'wc'; c.textContent = d.cls;
      b.append(k, n, c);
      b.addEventListener('click', () => { settings.primary = id; save(); renderCards(); });
      wcards.appendChild(b);
    });
    renderDetail();
  };
  renderCards();

  const renderKeyHelp = () => {
    const el = $('keyHelp');
    el.textContent = '';
    const add = (label, keys) => {
      const d = document.createElement('div');
      const a = document.createElement('span'); a.textContent = label;
      const b = document.createElement('span');
      for (const k of keys) { const kb = document.createElement('kbd'); kb.textContent = k; b.appendChild(kb); }
      d.append(a, b); el.appendChild(d);
    };
    if (touch) {
      add('移動', ['左側をドラッグ']); add('視点', ['右側をドラッグ']);
      add('射撃 / ADS', ['🔥 / ◎（押したまま視点も動かせます）']); add('配置の変更', ['設定 → ボタン配置']);
      return;
    }
    const B = settings.binds;
    const name = (id) => keyName(B[id]);
    add('移動', ['forward', 'left', 'back', 'right'].map(name));
    add('視点', ['マウス']);
    for (const a of ACTIONS) if (!['forward', 'back', 'left', 'right'].includes(a.id)) add(a.label, [name(a.id)]);
    add('武器切替', ['ホイール']);
    add('メニュー', ['Esc']);
  };
  renderKeyHelp();
  const settingsUI = createSettingsUI({ settings, game, save });
  $('openSettings').addEventListener('click', () => settingsUI.open(null, renderKeyHelp));

  // live list of online lobbies (from everyone's lobby presence)
  const roomList = $('roomList');
  function lobbyPeers() {
    if (!net.t || !net.t.lobby) return [];
    try { return net.t.lobby.peers(); } catch { return []; }
  }
  function renderLobby(force) {
    const groups = new Map();
    let idle = 0;
    for (const p of lobbyPeers()) {
      if (p.me) continue;
      const pr = p.presence || {};
      if (pr.v !== NET_VERSION) continue;
      if (pr.st !== 'play' || typeof pr.rm !== 'string') { idle++; continue; }
      const g = groups.get(pr.rm) || { rm: pr.rm, rn: '', mp: '', n: 0, bc: null };
      if (Number.isInteger(pr.bc) && pr.bc >= 0 && pr.bc <= 8) g.bc = pr.bc;
      g.n++;
      if (!g.rn && typeof pr.rn === 'string') g.rn = sanitizeText(pr.rn, 24);
      const mp = (pr.m && pr.m.mp) || pr.mp;
      if (typeof mp === 'string' && (!g.mp || (pr.m && pr.m.mp))) g.mp = mp;
      groups.set(pr.rm, g);
    }
    const list = [...groups.values()].sort((a, b) => b.n - a.n);
    $('lobbyMeta').textContent = net.state === 'ok' ? `${list.length}件 · 待機中 ${idle}人` : '';
    const key = net.state + '|' + list.map((g) => `${g.rm}:${g.n}:${g.mp}:${g.rn}:${g.bc}`).join('|');
    if (!force && roomList._key === key) return;
    roomList._key = key;
    roomList.textContent = '';
    if (!list.length) {
      const d = document.createElement('div'); d.className = 'empty';
      d.textContent = net.state === 'ok' ? 'まだ遊んでいるロビーはありません。「ロビーを作成」から始めましょう。'
        : net.state === 'none' ? 'この開き方ではオンラインのロビーは表示されません。オフラインのBotマッチは作成できます。'
          : net.state === 'fail' ? 'オンラインに接続できていません。上の「再接続」を押してください。' : 'オンラインのロビーを探しています…';
      roomList.appendChild(d);
      return;
    }
    for (const g of list) {
      const def = mapDef(g.mp);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'room-item';
      const pv = document.createElement('span'); pv.className = 'rp'; pv.style.background = preview(def);
      const mid = document.createElement('span'); mid.style.minWidth = '0';
      const n = document.createElement('div'); n.className = 'rn'; n.textContent = g.rn || g.rm;
      const m = document.createElement('div'); m.className = 'rm'; m.textContent = `${def.name} · ${g.bc === null ? def.sub : g.bc ? `Bot ${g.bc}体` : 'Botなし'}`;
      mid.append(n, m);
      const c = document.createElement('span'); c.className = 'rc'; c.textContent = `${g.n}人 · 参加 →`;
      b.append(pv, mid, c);
      b.addEventListener('click', () => {
        commitName();
        lockForPlay();
        runConnect({ mode: 'online', create: false, roomId: g.rm, lobbyName: g.rn || g.rm, mapId: def.id });
      });
      roomList.appendChild(b);
    }
  }
  setInterval(() => {
    // my lobby presence: who I am and which lobby I'm playing in
    if (net.t && net.t.lobby && net.state === 'ok') {
      const playing = game.state === 'play' && game.mode === 'online';
      if (!(playing && net.t.fallback)) {
        net.t.lobby.presence(playing
          ? { v: NET_VERSION, n: settings.name, st: 'play', rm: game.roomId, rn: String(game.roomName || '').slice(0, 24), mp: game.mapId, bc: game.isHost ? game.botWant() : null }
          : { v: NET_VERSION, n: settings.name, st: 'menu', rm: null, rn: null, mp: null, bc: null });
      }
    }
    if (!$('lobby').hidden) { renderLobby(false); checkUpdate(); }
    if (!$('pause').hidden) renderPauseBots(false); // e.g. I just became the host
    // relay label can change as relays connect / drop
    if (net.state === 'ok' && net.t && net.t.kind === 'mqtt' && net.t.label !== net._label) { net._label = net.t.label; renderNet(); }
  }, 700);
  // a backgrounded tab stops drawing frames; keep announcing myself so I don't vanish from the match
  setInterval(() => {
    if (document.hidden && game.state === 'play' && game.mode === 'online') { try { game._sendPresence(true); } catch {} }
  }, 1000);

  $('createBtn').addEventListener('click', () => { commitName(); openCreate(); });

  // ---------------- 3. create lobby ----------------
  const lobbyNameIn = $('lobbyNameIn');
  function openCreate() {
    lobbyNameIn.value = settings.lobbyName || `${settings.name}のロビー`;
    pickMode = net.state === 'none' ? 'offline' : settings.mode;
    renderMaps(); renderMode(pickMode); renderGo();
    show('create');
  }
  lobbyNameIn.addEventListener('input', () => { settings.lobbyName = sanitizeText(lobbyNameIn.value, 24); save(); });
  const mapCards = $('mapCards');
  const mapDesc = document.createElement('div'); mapDesc.className = 'mapdesc';
  mapCards.after(mapDesc);
  function renderMaps() {
    mapCards.textContent = '';
    for (const def of MAPS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mapcard';
      b.setAttribute('aria-pressed', String(settings.map === def.id));
      const pv = document.createElement('span'); pv.className = 'mp'; pv.style.background = preview(def);
      const sz = document.createElement('i'); sz.textContent = def.size; pv.appendChild(sz);
      const body = document.createElement('span'); body.className = 'mb';
      const n = document.createElement('span'); n.className = 'mn'; n.textContent = def.name;
      const s = document.createElement('span'); s.className = 'ms'; s.textContent = def.sub;
      body.append(n, s);
      b.append(pv, body);
      b.addEventListener('click', () => { settings.map = def.id; save(); renderMaps(); renderGo(); });
      mapCards.appendChild(b);
    }
    mapDesc.textContent = mapDef(settings.map).desc;
  }
  function renderMode(m) {
    pickMode = m;
    $('modeOnline').setAttribute('aria-pressed', String(m === 'online'));
    $('modeOffline').setAttribute('aria-pressed', String(m === 'offline'));
    renderGo();
  }
  $('modeOnline').addEventListener('click', () => { if (net.state === 'none') return; settings.mode = 'online'; save(); renderMode('online'); if (net.state === 'fail') { net.state = 'idle'; ensureNet().catch(() => {}); } });
  $('modeOffline').addEventListener('click', () => { settings.mode = 'offline'; save(); renderMode('offline'); });
  const seg = (el, items, key, after) => {
    el.textContent = '';
    for (const [val, label] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(settings[key] === val));
      b.addEventListener('click', () => { settings[key] = val; save(); seg(el, items, key, after); after && after(); });
      el.appendChild(b);
    }
  };
  seg($('segBots'), [0, 1, 2, 3, 4, 5, 6, 8].map((n) => [n, n ? String(n) : 'オフ']), 'botCount', () => renderGo());
  { const sm = $('modeOnline').querySelector('small'); if (sm) sm.textContent = 'ほかのプレイヤーと対戦。Botを入れるかどうかは、ロビーを作った人が決められます（試合中も一時停止メニューで変更可）。'; }
  seg($('segDiff'), Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), 'difficulty', () => { for (const b of game.bots) b.setDifficulty(settings.difficulty); });
  function renderGo() {
    const def = mapDef(settings.map);
    $('crGoSub').textContent = `${pickMode === 'online' ? 'ONLINE' : 'OFFLINE'} · ${def.name} · ${settings.botCount ? 'BOT × ' + settings.botCount : 'BOT オフ'}`;
  }
  $('crBack').addEventListener('click', () => { show('lobby'); renderLobby(true); });
  $('crGo').addEventListener('click', () => {
    commitName();
    const lobbyName = sanitizeText(lobbyNameIn.value, 24) || `${settings.name}のロビー`;
    settings.lobbyName = lobbyName; save();
    lockForPlay();
    if (pickMode === 'online') runConnect({ mode: 'online', create: true, roomId: newRoomId(lobbyName), lobbyName, mapId: settings.map });
    else runConnect({ mode: 'offline', create: true, lobbyName, mapId: settings.map });
  });

  // ---------------- 4. connect → match ----------------
  // pointer lock needs the user's click, so it is requested on the button that starts the flow
  function lockForPlay() {
    game.sound.init();
    if (touch) return;
    game.input.enabled = true;
    game.input.lock();
  }
  let job = null;
  const steps = $('cnSteps');
  function setSteps(labels) {
    steps.textContent = '';
    for (const l of labels) { const li = document.createElement('li'); li.textContent = l; steps.appendChild(li); }
  }
  const step = (i, st) => { const li = steps.children[i]; if (li) li.className = st; };
  function fail(i, msg) {
    step(i, 'fail');
    $('cnErr').hidden = false;
    $('cnErr').textContent = msg;
    $('cnRetry').hidden = false;
    game.input.unlock();
  }
  async function runConnect(plan) {
    const my = (job = { plan, cancelled: false, room: null });
    const online = plan.mode === 'online';
    const def = mapDef(plan.mapId);
    show('connect');
    $('cnKind').textContent = online ? 'ONLINE SERVER' : 'OFFLINE SERVER';
    $('cnTitle').textContent = online ? 'オンラインサーバーに接続中…' : 'オフラインサーバーを起動中…';
    const cm = $('cnMap'); cm.textContent = '';
    const pv = document.createElement('span'); pv.className = 'rp'; pv.style.background = preview(def);
    const tx = document.createElement('span'); tx.textContent = `${plan.lobbyName} · ${def.name}`;
    cm.append(pv, tx);
    $('cnErr').hidden = true; $('cnRetry').hidden = true; $('cnGo').hidden = true;
    setSteps(online ? ['サーバーに接続', plan.create ? 'ロビーを作成' : 'ロビーに参加', 'マップを読み込み', '出撃準備'] : ['オフラインサーバーを起動', 'マップを読み込み', 'Botを配置']);
    const alive = () => job === my && !my.cancelled;
    let room = null, mapId = def.id;
    if (online) {
      step(0, 'active');
      let t;
      try { t = await ensureNet(); } catch (e) { if (alive()) fail(0, `オンラインサーバーに接続できませんでした。${e.message || ''}`); return; }
      if (!alive()) return;
      step(0, 'done'); step(1, 'active');
      try { room = my.room = await t.joinRoom(plan.roomId); } catch (e) { if (alive()) fail(1, `${e.message || 'ロビーに参加できませんでした。'}`); return; }
      if (!alive()) { room.leave && room.leave(); return; }
      if (!plan.create) {
        // use the map the lobby's host is playing (wait briefly for their presence)
        const t0 = performance.now();
        for (;;) {
          let found = null;
          for (const p of room.peers()) {
            const pr = p.presence || {};
            if (p.me || pr.st !== 'play' || pr.v !== NET_VERSION || (t.fallback && pr.rm !== plan.roomId)) continue;
            const mp = (pr.m && pr.m.mp) || pr.mp;
            if (typeof mp === 'string' && (!found || pr.m)) found = mp;
          }
          if (found) { mapId = mapDef(found).id; break; }
          if (performance.now() - t0 > 3000) break;
          await wait(150);
          if (!alive()) { room.leave && room.leave(); return; }
        }
      }
      step(1, 'done');
    } else {
      step(0, 'active');
      await wait(200);
      if (!alive()) return;
      step(0, 'done');
    }
    const iMap = online ? 2 : 1;
    step(iMap, 'active');
    $('cnMap').lastChild.textContent = `${plan.lobbyName} · ${mapDef(mapId).name}`;
    await paint();
    try { game.loadMap(mapId); } catch (e) { console.error(e); if (alive()) fail(iMap, 'マップを読み込めませんでした。'); return; }
    if (!alive()) { room && room.leave && room.leave(); return; }
    step(iMap, 'done'); step(iMap + 1, 'active');
    await wait(150);
    if (!alive()) { room && room.leave && room.leave(); return; }
    step(iMap + 1, 'done');
    const go = async () => {
      if (!alive()) return;
      job = null;
      show(null);
      game.input.enabled = true;
      game.interpDelay = (online && net.t && net.t.interpDelay) || 0;
      await game.start(online ? 'online' : 'offline', room, { roomId: plan.roomId, lobbyName: plan.lobbyName, transport: online ? net.t : null, owner: !!plan.create });
    };
    if (touch || game.input.touch || game.input.locked || game.input.freeMouse) { await go(); return; }
    // pointer lock was lost (Esc) — one more click to start
    $('cnTitle').textContent = online ? 'オンラインサーバーに接続しました' : 'オフラインサーバーの準備ができました';
    $('cnGo').hidden = false;
    $('cnGo').onclick = () => { lockForPlay(); go(); };
    $('cnGo').focus();
  }
  $('cnRetry').addEventListener('click', () => { if (job) { const p = job.plan; if (p.mode === 'online') net.state = net.t ? net.state : 'idle'; lockForPlay(); runConnect(p); } });
  $('cnBack').addEventListener('click', () => {
    if (job) { job.cancelled = true; job.room && job.room.leave && job.room.leave(); job = null; }
    game.input.unlock();
    show('lobby'); renderLobby(true);
  });

  // ---------------- pause: Bot settings (offline: always, online: the lobby owner / host) ----------------
  const pb = document.createElement('div'); pb.className = 'pbots';
  const pbHead = document.createElement('div'); pbHead.className = 'pb-head';
  const pbLabel = document.createElement('span'); pbLabel.className = 'label'; pbLabel.textContent = 'Bot';
  const pbNote = document.createElement('small'); pbNote.className = 'pb-note';
  pbHead.append(pbLabel, pbNote);
  const pbCount = document.createElement('div'); pbCount.className = 'seg';
  const pbDiff = document.createElement('div'); pbDiff.className = 'seg';
  pb.append(pbHead, pbCount, pbDiff);
  $('pauseSub').after(pb);
  // phones: a one-line touch readout, to tell what is wrong when the stick does not respond
  const tdiag = document.createElement('small'); tdiag.className = 'pb-note tdiag';
  pb.after(tdiag);
  function renderTouchDiag() {
    const D = game.input.tdbg;
    tdiag.hidden = !game.input.touch || !D;
    if (tdiag.hidden) return;
    const st = game.input.tStick;
    tdiag.textContent = `タッチ診断 ver ${BUILD}: 開始${D.n}回 · スティック移動${D.mv}回 · 最後 ${D.tgt} (${D.x},${D.y}) ${D.why} · 画面 ${D.W}×${D.H}` + (st && st.id >= 0 ? ' · 操作中' : '');
  }
  let pbKey = '';
  function renderPauseBots(force) {
    if (game.state !== 'play') return;
    const can = game.canEditBots();
    const n = game.botWant(), d = game.botDiff();
    const online = game.mode === 'online';
    // rebuild only when something changed, so a tap is never lost to a re-render
    const key = `${can}|${n}|${d}|${online}|${game.isOwner}`;
    if (!force && key === pbKey) return;
    pbKey = key;
    pbNote.textContent = !online ? '' : can ? (game.isOwner ? 'あなたがロビー主です。変更はすぐ全員に反映されます。' : 'ロビー主が抜けたため、いまはあなたがBotを管理しています。')
      : `ロビー主だけが変更できます（いま: ${n ? n + '体' : 'オフ'}）`;
    const counts = [0, 2, 4, 6, 8]; if (!counts.includes(n)) { counts.push(n); counts.sort((a, b) => a - b); }
    pbCount.textContent = '';
    for (const c of counts) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c ? `${c}体` : 'オフ';
      b.setAttribute('aria-pressed', String(c === n)); b.disabled = !can;
      b.addEventListener('click', () => { if (game.setRoomBots(c, game.botDiff())) { save(); renderPauseBots(true); } });
      pbCount.appendChild(b);
    }
    pbDiff.textContent = '';
    for (const [k, v] of Object.entries(DIFFICULTY)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = v.label;
      b.setAttribute('aria-pressed', String(k === d)); b.disabled = !can || n === 0;
      b.addEventListener('click', () => { if (game.setRoomBots(game.botWant(), k)) { save(); renderPauseBots(true); } });
      pbDiff.appendChild(b);
    }
  }
  game.onRoomBots = () => { if (!$('pause').hidden) renderPauseBots(); };

  // ---------------- pause / chat ----------------
  const pause = (on) => {
    if (game.state !== 'play') return;
    game.paused = on;
    $('pause').hidden = !on;
    $('pauseSub').textContent = game.mode === 'online' ? `オンライン · ${game.roomName} — 一時停止中もマッチは続きます。` : 'オフラインのBotマッチ — Botは動き続けます。';
    if (on) { renderPauseBots(true); renderTouchDiag(); }
    if (!on) { game.input.clear(); game.input.lock(); }
  };
  game.input.onUnlock = () => { if (game.state === 'play') { closeChat(); pause(true); } };
  game.input.onEsc = () => { if (!settingsUI.isOpen) pause(!game.paused); };
  game.input.onPause = () => { if (!settingsUI.isOpen) pause(!game.paused); };
  $('resumeBtn').addEventListener('click', () => pause(false));
  $('pauseSettings').addEventListener('click', () => settingsUI.open(null, renderKeyHelp));
  $('leaveBtn').addEventListener('click', async () => {
    game.paused = false;
    $('pause').hidden = true;
    await game.leave();
    show('lobby');
    renderLobby(true);
  });

  const chatbox = $('chatbox'), chatin = $('chatin');
  const closeChat = () => {
    if (!game.chatOpen) return;
    game.chatOpen = false;
    game.input.typing = false;
    chatbox.hidden = true;
    chatin.value = '';
    chatin.blur();
  };
  game.input.onChat = () => {
    if (game.state !== 'play' || game.chatOpen || game.paused) return;
    game.chatOpen = true;
    game.input.typing = true;
    game.input.keys.clear();
    chatbox.hidden = false;
    setTimeout(() => chatin.focus(), 0);
  };
  chatin.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); game.sendChat(chatin.value); closeChat(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
  });
  $('game').addEventListener('click', () => {
    if (game.state === 'play' && !game.paused && !game.input.locked && !game.input.freeMouse && !game.input.touch) game.input.lock();
  });
  renderNet();
  // start connecting in the background while the boot screen waits for the first click
  ensureNet().catch(() => {});
  await wait(200);
  boot(1, '準備完了');
  const startBtn = $('bootStart');
  startBtn.textContent = touch ? 'タップして開始' : 'クリックして開始';
  startBtn.hidden = false;
  $('boot').classList.add('ready');
  const leaveBoot = () => {
    if ($('boot').hidden) return;
    game.sound.init(); // audio may only start after a user gesture
    show('lobby');
    renderLobby(true);
  };
  $('boot').addEventListener('click', leaveBoot);
  addEventListener('keydown', (e) => { if (!$('boot').hidden && (e.key === 'Enter' || e.key === ' ')) leaveBoot(); });
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
