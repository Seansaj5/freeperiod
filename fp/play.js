// Play page: one game full-window in an iframe, plus account features
// (cloud-save sync before load, login hand-off into the frame, recent list, play time).
import * as session from './session.js';
import { syncGame, watch } from './saves.js';
import { touchRecent, addPlay, flush as flushMeta } from './meta.js';
import { resolveGame } from './status.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('g');
const found = (window.GAMES || []).find((g) => g.id === id);
const stage = $('stage');

if (!found) {
  $('title').textContent = 'Game not found';
  document.querySelector('.tools').style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'missing';
  const inner = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = "That game isn't here";
  const a = document.createElement('a');
  a.className = 'tool main';
  a.href = './';
  a.textContent = 'See all games';
  inner.append(h1, a);
  wrap.append(inner);
  stage.append(wrap);
} else {
  run(found);
}

async function run(rawGame) {
  const game = resolveGame(rawGame);
  const gameUrl = game.url;
  let gameOrigin = '';
  try { gameOrigin = new URL(gameUrl, location.href).origin; } catch { /* leave empty: no hand-off */ }

  // Chat overlay: only loaded once chat is set up (an empty config means nothing else is fetched).
  let chatOverlay = { isOpen: false };
  import('./chat/config.js')
    .then(({ CHAT }) => (CHAT && CHAT.url && CHAT.key ? import('./chat/overlay.js') : null))
    .then((m) => { if (m) chatOverlay = m.mountChatOverlay(document.querySelector('.bar')); })
    .catch(() => { /* chat is optional */ });
  document.title = `${game.title} · Free Period`;
  $('title').textContent = game.title;
  $('controls').textContent = game.controls || '';
  $('newtab').href = gameUrl;

  // Loader overlay (static markup only; dynamic text via textContent).
  const loader = document.createElement('div');
  loader.className = 'loader';
  loader.innerHTML = `
    <div class="bg"></div>
    <div class="box">
      <div class="spinner"></div>
      <h1></h1>
      <p id="status">Loading the game...</p>
      <div class="why" id="why"></div>
    </div>`;
  loader.querySelector('.bg').style.backgroundImage = `url('${game.thumb}')`;
  loader.querySelector('h1').textContent = game.title;
  const statusEl = loader.querySelector('#status');
  const whyEl = loader.querySelector('#why');
  const setStatus = (text, secs) => {
    statusEl.textContent = text;
    if (secs != null) {
      const sp = document.createElement('span');
      sp.className = 'secs';
      sp.textContent = ` ${secs}s`;
      statusEl.append(sp);
    }
  };

  // Account bits. Everything here tolerates a missing token or an unreachable API.
  const settled = session.getToken()
    ? session.resume().catch(() => null).then(() => {})
    : Promise.resolve();
  let frame = null;
  let helloSeen = false;
  let tokenSent = false; // hub has sent fp:token to the current frame
  let ready = false;     // frame creation allowed (after the save sync)

  const postToken = () => {
    if (!frame || !frame.contentWindow || !gameOrigin) return;
    const token = session.getToken() || null;
    // No login here and nobody logged out here: the frame may keep a login of its own and hand it over (fp:session).
    const msg = token || session.wasLoggedOut() ? { type: 'fp:token', token } : { type: 'fp:token', token: null, offer: true };
    try {
      frame.contentWindow.postMessage(msg, gameOrigin);
      tokenSent = true;
    } catch { /* frame gone */ }
  };

  window.addEventListener('message', (e) => {
    if (!frame || !gameOrigin || e.origin !== gameOrigin || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'fp:hello') {
      settled.then(() => {
        if (!frame || e.source !== frame.contentWindow) return; // reloaded meanwhile
        helloSeen = true;
        postToken();
      });
    } else if (d.type === 'fp:session') {
      if (!tokenSent) return; // hub token wins until it has told the frame
      const u = d.user;
      if (typeof d.token === 'string' && d.token && u && typeof u === 'object' && typeof u.username === 'string') {
        session.adopt(d.token, { username: u.username, role: u.role });
      } else if (d.token === null && session.getToken()) {
        session.logout();
      }
    }
  });
  session.onChange(() => { if (helloSeen) postToken(); });

  let timer;
  function start() {
    clearInterval(timer);
    helloSeen = false;
    tokenSent = false;
    stage.innerHTML = '';
    loader.classList.remove('gone');
    setStatus('Loading the game...');
    frame = document.createElement('iframe');
    frame.src = gameUrl;
    frame.title = game.title;
    frame.allow = 'fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; microphone';
    frame.allowFullscreen = true;
    stage.append(frame, loader);

    const t0 = Date.now();
    timer = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      if (s >= 4) {
        setStatus(game.wakes ? 'Waking up the server...' : 'Still loading...', s);
        whyEl.textContent = game.wakes
          ? 'The game runs on a free server that naps when nobody is playing. The first load can take up to a minute, then it is fast.'
          : '';
      }
      if (s >= 90) whyEl.textContent = 'Taking longer than usual. Try Reload, or New tab up top.';
    }, 1000);

    frame.addEventListener('load', () => {
      if (!playing) { playing = true; playTimer = setInterval(() => { if (document.visibilityState === 'visible') addPlay(game.id, 15); }, 15000); }
      clearInterval(timer);
      loader.classList.add('gone');
      if (!chatOverlay.isOpen) frame.focus();
    }, { once: true });
  }
  let playing = false, playTimer;
  // Play time is counted locally and goes up every few minutes; what is left goes up as the page closes.
  addEventListener('pagehide', () => { flushMeta({ keepalive: true }).catch(() => {}); });

  $('reload').addEventListener('click', () => { if (ready) start(); });

  function fullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
    frame && !chatOverlay.isOpen && frame.focus();
  }
  $('full').addEventListener('click', fullscreen);
  document.querySelector('.bar').addEventListener('mouseup', () => setTimeout(() => frame && document.activeElement === document.body && !chatOverlay.isOpen && frame.focus(), 0));

  // Show the loader straight away; the save sync (max 4 s) runs behind it.
  touchRecent(game.id);
  const syncing = game.saveKey && session.getToken();
  if (syncing) {
    loader.classList.remove('gone');
    setStatus('Syncing your save\u2026');
    stage.append(loader);
    await Promise.race([
      syncGame(game, { pullBy: Date.now() + 4000 }).catch(() => 'none'),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  }
  if (game.saveKey) { try { watch(game); } catch { /* sync is optional */ } }
  ready = true;
  start();
}
