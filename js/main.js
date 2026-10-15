// Screen flow: boot → lobby (list / create) → connect (online or offline server) → match.
window.__pier7boot = true; // tells the startup check in index.html that the scripts loaded
import { Game } from './game.js';
import { WEAPONS, PRIMARIES, DIFFICULTY, NET_VERSION, RULES, TEAMS } from './config.js';
import { connectTransport, onlineKind } from './net.js';
import { sanitizeText } from './util.js';
import { loadSettings, saveSettings, sanitize, ACTIONS, keyName, normCode } from './settings.js';
import { createSettingsUI, isTouchDevice } from './settings-ui.js';
import { MAPS, mapDef } from './maps/index.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// let the browser paint before a long synchronous step
const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
const SCREENS = ['boot', 'namescr', 'lobby', 'create', 'connect'];
const CALLSIGNS = ['カモメ', 'ウミネコ', 'クレーン', 'ボラード', 'ガントリー', 'タグ', 'ブイ', 'アンカー', 'ハーバー', 'リーファー'];

function slug(s) {
  s = String(s || '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '').slice(0, 30);
  return s || 'lobby';
}
function newRoomId(name) { return `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`; }
// shown in the lobby so it is easy to tell whether every device loaded the same files
const BUILD = '10/15e';
// versions of the other files this main.js expects (only files that changed carry a new number)
const EXPECT = { net: '10/15a', input: '10/15e', game: '10/15e', proto: 7 };
// the call sign can be changed once every 30 days
const NAME_DAYS = 30;
const DAY = 24 * 3600 * 1000;
function genCode() {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  const r = new Uint8Array(8);
  try { crypto.getRandomValues(r); } catch { for (let i = 0; i < 8; i++) r[i] = Math.random() * 256; }
  for (const b of r) s += A[b % A.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const capOf = (tm) => (tm ? tm * 2 : 16);
// small DOM helper for the screens built here (so index.html stays as it is)
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function preview(def) { return `linear-gradient(135deg, ${def.theme.preview[0]} 0%, ${def.theme.preview[1]} 100%)`; }

async function start(hotData) {
  const touch = isTouchDevice();
  const show = (id) => { for (const s of SCREENS) { const e = $(s); if (e) e.hidden = s !== id; } };
  const boot = (f, msg) => { $('bootBar').style.width = Math.round(f * 100) + '%'; if (msg) { $('bootMsg').textContent = msg; $('bootMsg').style.color = ''; } };

  // ---------------- 1. boot ----------------
  show('boot');
  try { $('bootFoot').textContent = 'マップ5種 · オンライン対戦 · チーム戦 1v1〜5v5 · フレンド · Botマッチ'; } catch {}
  boot(0.08, '設定を読み込み中…');
  const settings = hotData && hotData.settings ? sanitize(hotData.settings) : loadSettings();
  if (!settings.name) settings.name = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)] + Math.floor(10 + Math.random() * 89);
  try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => ({ settings })); } catch {}
  const save = () => saveSettings(settings);
  if (!settings.friendCode) { settings.friendCode = genCode(); save(); }
  // settings are written on every change; also on leaving the page, in case a write was missed
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
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
  // ---- call sign: chosen on the first screen, then changeable once a month ----
  const nameIn = $('nameIn');
  nameIn.value = settings.name;
  nameIn.readOnly = true;
  nameIn.classList.add('locked');
  const nameRow = el('div', 'name-row');
  nameIn.before(nameRow); nameRow.appendChild(nameIn);
  const nameBtn = el('button', 'btn', '変更'); nameBtn.type = 'button';
  nameRow.appendChild(nameBtn);
  const nameNote = el('small', 'name-note');
  nameRow.after(nameNote);
  const nextNameAt = () => (settings.nameAt || 0) + NAME_DAYS * DAY;
  const fmtDay = (t) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function renderNameLock() {
    nameIn.value = settings.name;
    const wait = nextNameAt() - Date.now();
    nameBtn.disabled = wait > 0;
    nameNote.textContent = wait > 0 ? `名前は一か月に一回だけ変更できます — 次に変更できるのは ${fmtDay(nextNameAt())} 以降です。` : '名前を変更できます（変更すると、その後一か月は変更できません）。';
  }
  const commitName = () => { if (!settings.name) settings.name = CALLSIGNS[0] + '00'; };
  // the name screen (first start, or a change once a month)
  const nmScr = el('div', 'screen'); nmScr.id = 'namescr'; nmScr.hidden = true;
  const nmCard = el('div', 'cn-card nm-card');
  const nmKind = el('div', 'cn-kind', 'CALL SIGN');
  const nmTitle = el('h2', '', 'お名前を入力');
  const nmSub = el('div', 'nm-sub', 'ほかのプレイヤーに表示される名前です（14文字まで）。');
  const nmIn = el('input', 'text-in'); nmIn.maxLength = 14; nmIn.autocomplete = 'off'; nmIn.spellcheck = false; nmIn.placeholder = '例: カモメ';
  const nmErr = el('div', 'nm-err'); nmErr.hidden = true;
  const nmRule = el('div', 'nm-rule', '※ 名前は一か月に一回しか変更できません。');
  const nmRow = el('div', 'btnrow');
  const nmBack = el('button', 'btn', '戻る'); nmBack.type = 'button';
  const nmOk = el('button', 'btn primary', '決定'); nmOk.type = 'button';
  nmRow.append(nmBack, nmOk);
  const nmConfirm = el('div', 'nm-confirm'); nmConfirm.hidden = true;
  const nmQ = el('p');
  const nmCRow = el('div', 'btnrow');
  const nmNo = el('button', 'btn', 'いいえ'); nmNo.type = 'button';
  const nmYes = el('button', 'btn primary', 'はい'); nmYes.type = 'button';
  nmCRow.append(nmNo, nmYes);
  nmConfirm.append(nmQ, nmCRow);
  nmCard.append(nmKind, nmTitle, nmSub, nmIn, nmErr, nmRule, nmRow, nmConfirm);
  nmScr.appendChild(nmCard);
  $('boot').after(nmScr);
  let nmPending = '';
  function openName(change) {
    nmTitle.textContent = change ? '名前を変更' : 'お名前を入力';
    nmIn.value = change ? '' : settings.name || '';
    nmIn.placeholder = settings.name || '例: カモメ';
    nmBack.hidden = !change;
    nmErr.hidden = true; nmConfirm.hidden = true; nmRow.hidden = false; nmIn.disabled = false;
    show('namescr');
    if (!touch) setTimeout(() => nmIn.focus(), 50);
  }
  function askName() {
    const v = sanitizeText(nmIn.value, 14);
    nmErr.hidden = false;
    if (!v) { nmErr.textContent = 'お名前を入力してください。'; return; }
    if (settings.nameAt && v === settings.name) { nmErr.textContent = '今と同じ名前です。'; return; }
    nmErr.hidden = true;
    nmPending = v;
    nmQ.textContent = '';
    nmQ.append('「', el('b', '', v), '」にします。', document.createElement('br'), '一か月に一回しか変更できないですが、よろしいですか？');
    nmConfirm.hidden = false; nmRow.hidden = true; nmIn.disabled = true;
    try { nmIn.blur(); } catch {}
  }
  nmOk.addEventListener('click', askName);
  nmIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); askName(); } });
  nmNo.addEventListener('click', () => { nmConfirm.hidden = true; nmRow.hidden = false; nmIn.disabled = false; });
  nmYes.addEventListener('click', () => {
    if (!nmPending) return;
    settings.name = nmPending; settings.nameAt = Date.now(); save();
    renderNameLock();
    try { window.scrollTo(0, 0); } catch {}
    show('lobby'); renderLobby(true);
  });
  nmBack.addEventListener('click', () => { show('lobby'); renderLobby(true); });
  nameBtn.addEventListener('click', () => { if (nextNameAt() <= Date.now()) openName(true); });
  renderNameLock();

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
  { const h = document.querySelector('#settings .set-head h2'); if (h) h.after(el('small', 'autosave', '変更は自動で保存されます')); }
  $('openSettings').addEventListener('click', () => settingsUI.open(null, renderKeyHelp));

  // live list of online lobbies (from everyone's lobby presence)
  const roomList = $('roomList');
  function lobbyPeers() {
    if (!net.t || !net.t.lobby) return [];
    try { return net.t.lobby.peers(); } catch { return []; }
  }
  const friendCodes = () => new Set((settings.friends || []).map((f) => f.c));
  function lobbyGroups() {
    const groups = new Map();
    let idle = 0;
    const fr = friendCodes();
    for (const p of lobbyPeers()) {
      if (p.me) continue;
      const pr = p.presence || {};
      if (pr.v !== NET_VERSION) continue;
      if (pr.st !== 'play' || typeof pr.rm !== 'string') { idle++; continue; }
      const g = groups.get(pr.rm) || { rm: pr.rm, rn: '', mp: '', n: 0, bc: null, tm: 0, friends: [] };
      if (Number.isInteger(pr.bc) && pr.bc >= 0 && pr.bc <= 8) g.bc = pr.bc;
      if (RULES.hp.includes(pr.hp)) g.hp = pr.hp;
      if (pr.rc && typeof pr.rc === 'object' && Number.isInteger(pr.rc.n)) { g.rc = pr.rc; g.tm = RULES.team.includes(pr.rc.tm) ? pr.rc.tm : 0; }
      g.n++;
      if (typeof pr.fc === 'string' && fr.has(pr.fc)) g.friends.push(sanitizeText(pr.n, 14));
      if (!g.rn && typeof pr.rn === 'string') g.rn = sanitizeText(pr.rn, 24);
      const mp = (pr.m && pr.m.mp) || pr.mp;
      if (typeof mp === 'string' && (!g.mp || (pr.m && pr.m.mp))) g.mp = mp;
      groups.set(pr.rm, g);
    }
    const list = [...groups.values()];
    for (const g of list) { g.cap = capOf(g.tm); g.full = g.n >= g.cap; }
    list.sort((a, b) => (b.friends.length > 0) - (a.friends.length > 0) || a.full - b.full || b.n - a.n);
    return { list, idle };
  }
  const joinGroup = (g) => {
    commitName();
    lockForPlay();
    runConnect({ mode: 'online', create: false, roomId: g.rm, lobbyName: g.rn || g.rm, mapId: mapDef(g.mp).id, cfg: g.rc || null });
  };
  function renderLobby(force) {
    const { list, idle } = lobbyGroups();
    $('lobbyMeta').textContent = net.state === 'ok' ? `${list.length}件 · 待機中 ${idle}人` : '';
    const key = net.state + '|' + list.map((g) => `${g.rm}:${g.n}:${g.mp}:${g.rn}:${g.bc}:${g.hp}:${g.tm}:${g.friends.join('/')}`).join('|');
    renderFriends(force);
    if (!force && roomList._key === key) return;
    roomList._key = key;
    roomList.textContent = '';
    if (!list.length) {
      const d = document.createElement('div'); d.className = 'empty';
      d.textContent = net.state === 'ok' ? 'まだ遊んでいるロビーはありません。「ランダム参加」か「ロビーを作成」から始めましょう。'
        : net.state === 'none' ? 'この開き方ではオンラインのロビーは表示されません。オフラインのBotマッチは作成できます。'
          : net.state === 'fail' ? 'オンラインに接続できていません。上の「再接続」を押してください。' : 'オンラインのロビーを探しています…';
      roomList.appendChild(d);
      return;
    }
    for (const g of list) {
      const def = mapDef(g.mp);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'room-item' + (g.full ? ' full' : '');
      const pv = document.createElement('span'); pv.className = 'rp'; pv.style.background = preview(def);
      const mid = document.createElement('span'); mid.style.minWidth = '0';
      const n = document.createElement('div'); n.className = 'rn'; n.textContent = g.rn || g.rm;
      const m = document.createElement('div'); m.className = 'rm';
      m.textContent = `${TEAMS.label(g.tm)} · ${def.name} · ${g.bc === null ? def.sub : g.bc ? `Bot ${g.bc}体` : 'Botなし'}${g.hp ? ` · HP ${g.hp}` : ''}`;
      if (g.friends.length) { const f = el('div', 'rfr', `★ フレンド: ${g.friends.join('、')}`); mid.append(n, m, f); } else mid.append(n, m);
      const c = document.createElement('span'); c.className = 'rc';
      c.textContent = g.full ? `${g.n}/${g.cap}人 · 満員` : g.tm ? `${g.n}/${g.cap}人 · 参加 →` : `${g.n}人 · 参加 →`;
      b.append(pv, mid, c);
      b.disabled = g.full;
      b.addEventListener('click', () => { if (!g.full) joinGroup(g); });
      roomList.appendChild(b);
    }
  }

  // ---- random join: an open lobby (friends' first), or a new one when there is none ----
  const roomsCard = $('createBtn').closest('.lb-card');
  const rjRow = el('div', 'rj-row');
  const rjLabel = el('span', 'label', 'ランダム参加のモード');
  const rjSeg = el('div', 'seg');
  rjRow.append(rjLabel, rjSeg);
  const rjBtn = el('button', 'deploy alt'); rjBtn.type = 'button';
  rjBtn.append(el('span', '', 'ランダム参加'), el('small', '', '空いているロビーへ · なければ自動で作成'));
  $('createBtn').before(rjRow, rjBtn);
  const renderRj = () => {
    rjSeg.textContent = '';
    for (const [v, label] of [['any', 'すべて'], ...RULES.team.map((n) => [n, TEAMS.label(n)])]) {
      const b = el('button', '', label); b.type = 'button';
      b.setAttribute('aria-pressed', String(settings.randomMode === v));
      b.addEventListener('click', () => { settings.randomMode = v; save(); renderRj(); });
      rjSeg.appendChild(b);
    }
  };
  renderRj();
  function pickRandom() {
    const want = settings.randomMode;
    const ok = lobbyGroups().list.filter((g) => !g.full && (want === 'any' || g.tm === want));
    if (!ok.length) return null;
    const withFriends = ok.filter((g) => g.friends.length);
    const pool = withFriends.length ? withFriends : ok;
    const best = Math.max(...pool.map((g) => g.n));
    const top = pool.filter((g) => g.n >= best - 1);
    return top[Math.floor(Math.random() * top.length)];
  }
  rjBtn.addEventListener('click', async () => {
    commitName();
    lockForPlay();
    const my = (job = { plan: null, cancelled: false, room: null, random: true });
    const alive = () => job === my && !my.cancelled;
    show('connect');
    $('cnKind').textContent = 'ONLINE · RANDOM';
    $('cnTitle').textContent = '空いているロビーを探しています…';
    $('cnMap').textContent = '';
    $('cnErr').hidden = true; $('cnRetry').hidden = true; $('cnGo').hidden = true;
    setSteps(['サーバーに接続', '空いているロビーを検索']);
    step(0, 'active');
    try { await ensureNet(); } catch (e) { if (alive()) fail(0, `オンラインサーバーに接続できませんでした。${e.message || ''}`); return; }
    if (!alive()) return;
    step(0, 'done'); step(1, 'active');
    // lobbies announce themselves about once a second: give the list a moment to fill
    const t0 = performance.now();
    let g = null;
    for (;;) {
      g = pickRandom();
      const dt = performance.now() - t0;
      if ((g && dt > 900) || dt > 2600) break;
      await wait(200);
      if (!alive()) return;
    }
    step(1, 'done');
    if (g) { joinGroup(g); return; }
    // nobody to play with right now: open a new lobby for this mode
    if (settings.randomMode !== 'any') settings.teamMode = settings.randomMode;
    const def = MAPS[Math.floor(Math.random() * MAPS.length)];
    settings.map = def.id;
    const lobbyName = `${settings.name}のロビー`;
    save();
    runConnect({ mode: 'online', create: true, roomId: newRoomId(lobbyName), lobbyName, mapId: def.id });
  });

  // ---- friends: a code per device; see who is online and join their lobby ----
  const frBox = el('div', 'fr');
  const frHead = el('div', 'lb-head');
  const frMeta = el('span', 'fineprint');
  frHead.append(el('h2', '', 'フレンド'), frMeta);
  const frMe = el('div', 'fr-me');
  const frCodeEl = el('b', 'fr-code', settings.friendCode);
  const frCopy = el('button', 'btn sm', 'コピー'); frCopy.type = 'button';
  frMe.append(el('span', '', 'あなたのフレンドコード'), frCodeEl, frCopy);
  const frAddRow = el('div', 'fr-add');
  const frIn = el('input', 'text-in'); frIn.maxLength = 12; frIn.placeholder = 'フレンドのコード（例: ABCD-EFGH）'; frIn.autocomplete = 'off'; frIn.spellcheck = false;
  frIn.setAttribute('autocapitalize', 'characters');
  const frAddBtn = el('button', 'btn', '追加'); frAddBtn.type = 'button';
  frAddRow.append(frIn, frAddBtn);
  const frMsg = el('div', 'fr-msg'); frMsg.hidden = true;
  const frList = el('div', 'fr-list');
  frBox.append(frHead, frMe, frAddRow, frMsg, frList);
  roomsCard.appendChild(frBox);
  const frSay = (t, bad) => { frMsg.hidden = !t; frMsg.textContent = t || ''; frMsg.classList.toggle('bad', !!bad); };
  frCopy.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(settings.friendCode); ok = true; } catch {}
    if (!ok) {
      try { const ta = el('textarea'); ta.value = settings.friendCode; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch {}
    }
    frSay(ok ? 'コピーしました。フレンドに送って、お互いのコードを追加してください。' : `コピーできませんでした。コード: ${settings.friendCode}`);
  });
  const addFriend = () => {
    const c = normCode(frIn.value);
    if (!c) { frSay('コードは英数字8文字です（例: ABCD-EFGH）。', true); return; }
    if (c === settings.friendCode) { frSay('それはあなた自身のコードです。', true); return; }
    if ((settings.friends || []).some((f) => f.c === c)) { frSay('すでに追加済みです。', true); return; }
    if ((settings.friends || []).length >= 60) { frSay('フレンドは60人までです。', true); return; }
    let name = '';
    for (const p of lobbyPeers()) { const pr = p.presence || {}; if (pr.fc === c) name = sanitizeText(pr.n, 14); }
    settings.friends = [...(settings.friends || []), { c, n: name }];
    save();
    frIn.value = '';
    frSay(name ? `${name} を追加しました。` : '追加しました。相手がオンラインになると、ここに表示されます。');
    renderFriends(true);
  };
  frAddBtn.addEventListener('click', addFriend);
  frIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFriend(); } });
  let frKey = '', frDel = '';
  function friendStatus() {
    // the freshest presence for each friend code on the lobby channel
    const seen = new Map();
    for (const p of lobbyPeers()) {
      if (p.me) continue;
      const pr = p.presence || {};
      if (typeof pr.fc !== 'string') continue;
      const cur = seen.get(pr.fc);
      if (!cur || pr.st === 'play') seen.set(pr.fc, pr);
    }
    return seen;
  }
  function renderFriends(force) {
    const fr = settings.friends || [];
    const seen = friendStatus();
    const groups = new Map(lobbyGroups().list.map((g) => [g.rm, g]));
    let changed = false, online = 0;
    const rows = fr.map((f) => {
      const pr = seen.get(f.c);
      if (pr) {
        online++;
        const n = sanitizeText(pr.n, 14);
        if (n && n !== f.n) { f.n = n; changed = true; }
      }
      const g = pr && pr.st === 'play' && pr.v === NET_VERSION ? groups.get(pr.rm) : null;
      return { f, pr, g };
    });
    if (changed) save();
    frMeta.textContent = fr.length ? `${online} / ${fr.length}人がオンライン` : '';
    const key = rows.map(({ f, pr, g }) => `${f.c}:${f.n}:${pr ? pr.st : '-'}:${pr && pr.v}:${g ? g.rm + g.n + g.full : ''}`).join('|') + '|' + frDel + '|' + net.state;
    if (!force && key === frKey) return;
    frKey = key;
    frList.textContent = '';
    if (!fr.length) { frList.appendChild(el('div', 'empty', 'まだフレンドがいません。コードを交換して追加しましょう。')); return; }
    // online friends first
    rows.sort((a, b) => (!!b.pr - !!a.pr) || (!!b.g - !!a.g));
    for (const { f, pr, g } of rows) {
      const it = el('div', 'fr-item' + (pr ? ' on' : ''));
      const dot = el('span', 'dot ' + (pr ? (pr.st === 'play' ? 'ok' : 'warn') : ''));
      const mid = el('div', 'fr-mid');
      mid.append(el('div', 'fr-name', f.n || '（名前はオンライン時に表示）'), el('div', 'fr-st',
        !pr ? `オフライン · ${f.c}` : pr.v !== NET_VERSION ? 'オンライン（別のバージョン）' : pr.st === 'play'
          ? (g ? `プレイ中: ${g.rn || g.rm} · ${TEAMS.label(g.tm)} · ${g.n}/${g.cap}人` : 'プレイ中') : 'オンライン · ロビー画面'));
      it.append(dot, mid);
      if (g) {
        const jb = el('button', 'btn sm primary', g.full ? '満員' : '参加'); jb.type = 'button';
        jb.disabled = g.full;
        jb.addEventListener('click', () => joinGroup(g));
        it.appendChild(jb);
      }
      const del = el('button', 'btn sm danger', frDel === f.c ? '本当に削除' : '削除'); del.type = 'button';
      del.addEventListener('click', () => {
        if (frDel !== f.c) { frDel = f.c; renderFriends(true); setTimeout(() => { if (frDel === f.c) { frDel = ''; renderFriends(true); } }, 3000); return; }
        settings.friends = (settings.friends || []).filter((x) => x.c !== f.c);
        frDel = ''; save(); renderFriends(true);
      });
      it.appendChild(del);
      frList.appendChild(it);
    }
  }
  // notice line in the lobby (e.g. "that lobby was full")
  const lbNotice = el('div', 'lb-notice'); lbNotice.hidden = true;
  document.querySelector('#lobby .lb-top').after(lbNotice);
  const notice = (t) => { lbNotice.textContent = t || ''; lbNotice.hidden = !t; if (t) setTimeout(() => { if (lbNotice.textContent === t) lbNotice.hidden = true; }, 9000); };

  setInterval(() => {
    // my lobby presence: who I am, my friend code and which lobby I'm playing in
    if (net.t && net.t.lobby && net.state === 'ok') {
      const playing = game.state === 'play' && game.mode === 'online';
      if (!(playing && net.t.fallback)) {
        net.t.lobby.presence(playing
          ? { v: NET_VERSION, n: settings.name, fc: settings.friendCode, st: 'play', rm: game.roomId, rn: String(game.roomName || '').slice(0, 24), mp: game.mapId, bc: game.isHost ? game.botWant() : null, hp: game.isHost ? game.hpMax() : null, rc: game.isHost ? game.cfg() : null }
          : { v: NET_VERSION, n: settings.name, fc: settings.friendCode, st: 'menu', rm: null, rn: null, mp: null, bc: null, hp: null, rc: null });
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
  {
    // match type: free for all or a team match (1v1 … 5v5)
    const row = el('div', 'row between'); row.id = 'teamRow';
    const sg = el('div', 'seg');
    row.append(el('span', 'label', 'ルール'), sg);
    const note = el('div', 'fineprint team-note');
    $('segBots').closest('.row').before(row, note);
    const renderNote = () => {
      const t = settings.teamMode;
      note.textContent = t ? `${TEAMS.label(t)}: 2チームに分かれて戦います（最大${t * 2}人）。味方への攻撃は当たりません。先に${TEAMS.killLimit(t)}キルしたチームの勝ち。Botは空いている枠にだけ入ります。`
        : '個人戦: 自分以外の全員が敵のデスマッチです。';
    };
    seg(sg, RULES.team.map((n) => [n, TEAMS.label(n)]), 'teamMode', () => { renderNote(); renderGo(); });
    renderNote();
  }
  seg($('segBots'), [0, 1, 2, 3, 4, 5, 6, 8].map((n) => [n, n ? String(n) : 'オフ']), 'botCount', () => renderGo());
  { const sm = $('modeOnline').querySelector('small'); if (sm) sm.textContent = 'ほかのプレイヤーと対戦。Botを入れるかどうかは、ロビーを作った人が決められます（試合中も一時停止メニューで変更可）。'; }
  seg($('segDiff'), Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), 'difficulty', () => { for (const b of game.bots) b.setDifficulty(settings.difficulty); });
  {
    // HP / damage rules (rows added here so index.html stays as it is)
    let after = $('segDiff').closest('.row');
    for (const [label, key, items] of [
      ['HP', 'hpRule', RULES.hp.map((h) => [h, String(h)])],
      ['ダメージ', 'dmgRule', Object.entries(RULES.dmg).map(([k, v]) => [k, v.label])],
      ['キル回復', 'killHeal', RULES.killHeal.map((h) => [h, h ? `+${h}` : 'オフ'])],
    ]) {
      const row = document.createElement('div'); row.className = 'row between';
      const lb = document.createElement('span'); lb.className = 'label'; lb.textContent = label;
      const sg = document.createElement('div'); sg.className = 'seg';
      row.append(lb, sg);
      after.after(row); after = row;
      seg(sg, items, key, () => renderGo());
    }
  }
  function renderGo() {
    const def = mapDef(settings.map);
    $('crGoSub').textContent = `${pickMode === 'online' ? 'ONLINE' : 'OFFLINE'} · ${TEAMS.label(settings.teamMode)} · ${def.name} · ${settings.botCount ? 'BOT × ' + settings.botCount : 'BOT オフ'} · HP ${settings.hpRule}`;
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
            if (pr.m && Number.isInteger(pr.m.bc)) plan.cfg = { n: pr.m.bc, d: pr.m.bd, hp: pr.m.hp, dm: pr.m.dm, kh: pr.m.kh, tm: pr.m.tm | 0 };
          }
          if (found && plan.cfg) { mapId = mapDef(found).id; break; }
          if (found && performance.now() - t0 > 1500) { mapId = mapDef(found).id; break; }
          if (performance.now() - t0 > 3000) break;
          await wait(150);
          if (!alive()) { room.leave && room.leave(); return; }
        }
        // team modes have a fixed number of places
        const tm = plan.cfg && RULES.team.includes(plan.cfg.tm) ? plan.cfg.tm : 0;
        if (tm) {
          let n = 0;
          for (const p of room.peers()) { const pr = p.presence || {}; if (!p.me && pr.st === 'play' && pr.v === NET_VERSION && (!t.fallback || pr.rm === plan.roomId)) n++; }
          if (n >= capOf(tm)) { room.leave && room.leave(); my.room = null; if (alive()) fail(1, `このロビーは満員です（${TEAMS.label(tm)} · ${n}/${capOf(tm)}人）。ほかのロビーを選ぶか「ランダム参加」を使ってください。`); return; }
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
      // iOS: after typing a name the keyboard can leave the page shifted, which offsets
      // full-screen layers in home-screen web apps — close it and put the page back
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch {}
      try { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } catch {}
      await game.start(online ? 'online' : 'offline', room, { roomId: plan.roomId, lobbyName: plan.lobbyName, transport: online ? net.t : null, owner: !!plan.create, cfg: plan.cfg || null });
    };
    if (touch || game.input.touch || game.input.locked || game.input.freeMouse) { await go(); return; }
    // pointer lock was lost (Esc) — one more click to start
    $('cnTitle').textContent = online ? 'オンラインサーバーに接続しました' : 'オフラインサーバーの準備ができました';
    $('cnGo').hidden = false;
    $('cnGo').onclick = () => { lockForPlay(); go(); };
    $('cnGo').focus();
  }
  $('cnRetry').addEventListener('click', () => { if (job && job.random) { rjBtn.click(); return; } if (job) { const p = job.plan; if (p.mode === 'online') net.state = net.t ? net.state : 'idle'; lockForPlay(); runConnect(p); } });
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
  const pbRuleHead = document.createElement('span'); pbRuleHead.className = 'label'; pbRuleHead.textContent = 'HP ・ ダメージ ・ キル回復';
  const pbHp = document.createElement('div'); pbHp.className = 'seg';
  const pbDmg = document.createElement('div'); pbDmg.className = 'seg';
  const pbKh = document.createElement('div'); pbKh.className = 'seg';
  pb.append(pbHead, pbCount, pbDiff, pbRuleHead, pbHp, pbDmg, pbKh);
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
    const n = game.botWant(), d = game.botDiff(), hp = game.hpMax(), dm = game.cfg().dm, kh = game.cfg().kh;
    const online = game.mode === 'online';
    // rebuild only when something changed, so a tap is never lost to a re-render
    const key = `${can}|${n}|${d}|${hp}|${dm}|${kh}|${online}|${game.isOwner}|${game.teamSize()}|${game.myTeam()}`;
    if (!force && key === pbKey) return;
    pbKey = key;
    const tm = game.teamSize();
    const tmTxt = tm ? `${TEAMS.label(tm)}（チーム戦 · ${game.myTeam() >= 0 ? 'あなたは' + TEAMS.names[game.myTeam()] : 'チーム決定中'}）` : '個人戦';
    pbNote.textContent = (!online ? `ルール: ${tmTxt}` : can ? `あなたがロビー主です。変更はすぐ全員に反映されます。ルール: ${tmTxt}`
      : `ロビー主が決めたルールです（${tmTxt} · Bot ${n ? n + '体' : 'オフ'} · HP ${hp} · ダメージ ${RULES.dmg[dm].label} · キル回復 ${kh ? '+' + kh : 'オフ'}）`);
    const counts = [0, 2, 4, 6, 8]; if (!counts.includes(n)) { counts.push(n); counts.sort((a, b) => a - b); }
    pbCount.textContent = '';
    for (const c of counts) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c ? `${c}体` : 'オフ';
      b.setAttribute('aria-pressed', String(c === n)); b.disabled = !can;
      b.addEventListener('click', () => { if (game.setRoomCfg({ n: c })) { save(); renderPauseBots(true); } });
      pbCount.appendChild(b);
    }
    pbDiff.textContent = '';
    for (const [k, v] of Object.entries(DIFFICULTY)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = v.label;
      b.setAttribute('aria-pressed', String(k === d)); b.disabled = !can || n === 0;
      b.addEventListener('click', () => { if (game.setRoomCfg({ d: k })) { save(); renderPauseBots(true); } });
      pbDiff.appendChild(b);
    }
    pbHp.textContent = '';
    for (const h of RULES.hp) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `HP ${h}`;
      b.setAttribute('aria-pressed', String(h === hp)); b.disabled = !can;
      b.addEventListener('click', () => { if (game.setRoomCfg({ hp: h })) { save(); renderPauseBots(true); } });
      pbHp.appendChild(b);
    }
    pbDmg.textContent = '';
    for (const [k, v] of Object.entries(RULES.dmg)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `ダメージ ${v.label}`;
      b.setAttribute('aria-pressed', String(k === dm)); b.disabled = !can;
      b.addEventListener('click', () => { if (game.setRoomCfg({ dm: k })) { save(); renderPauseBots(true); } });
      pbDmg.appendChild(b);
    }
    pbKh.textContent = '';
    for (const h of RULES.killHeal) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = h ? `キル回復 +${h}` : 'キル回復 オフ';
      b.setAttribute('aria-pressed', String(h === kh)); b.disabled = !can;
      b.addEventListener('click', () => { if (game.setRoomCfg({ kh: h })) { save(); renderPauseBots(true); } });
      pbKh.appendChild(b);
    }
  }
  game.onRoomCfg = () => { if (!$('pause').hidden) renderPauseBots(); };
  // team lobby filled up before I got a place: back to the lobby list
  game.onFull = async () => {
    if (game.state !== 'play') return;
    game.paused = false; $('pause').hidden = true;
    await game.leave();
    show('lobby'); renderLobby(true);
    notice('ロビーが満員になったため、ロビー一覧に戻りました。ほかのロビーを選ぶか「ランダム参加」を使ってください。');
  };

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
    if (!settings.nameAt) { openName(false); return; }
    show('lobby');
    renderLobby(true);
  };
  $('boot').addEventListener('click', leaveBoot);
  addEventListener('keydown', (e) => { if (!$('boot').hidden && (e.key === 'Enter' || e.key === ' ')) leaveBoot(); });
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
