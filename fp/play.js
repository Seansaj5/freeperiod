// Play page: one game full-window in an iframe, plus account features
// (cloud-save sync before load, login hand-off into the frame, recent list, play time).
import * as session from './session.js';
import { syncGame, watch } from './saves.js';
import { touchRecent, addPlay, flush as flushMeta } from './meta.js';
import { resolveGame } from './status.js';
import { dailyCheckin } from './streak.js';
import { startActivity, cleanRoom, withJoin, friendInRoom } from './chat/activity.js';
import { hasFullscreenApi } from './viewport.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const id = params.get('g');
// A friend's Join button (home page): play.html?g=<game>&room=<CODE>. Games that can deep-join (games.js `joins`) get
// ?join=<CODE> on their own URL and go straight into that room, but only when an accepted chat friend is in it right
// now (friendInRoom); any other room link opens the game normally. Only the first load joins: Reload, F5 (the room
// leaves the address once the game has loaded) and New tab open the game's menu.
const joinRoom = cleanRoom(params.get('room'));
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
  let joinUrl = '';   // set when the Join link's room checks out; used by the first load only
  let gameOrigin = '';
  try { gameOrigin = new URL(gameUrl, location.href).origin; } catch { /* leave empty: no hand-off */ }

  // Chat overlay: only loaded once chat is set up (an empty config means nothing else is fetched).
  let chatOverlay = { isOpen: false };
  import('./chat/config.js')
    .then(({ CHAT }) => (CHAT && CHAT.url && CHAT.key ? import('./chat/overlay.js') : null))
    .then((m) => { if (m) chatOverlay = m.mountChatOverlay(document.querySelector('.bar')); })
    .catch(() => { /* chat is optional */ });
  // Friends' activity: chat friends see what is being played here, and the room once the game reports one (fp:room).
  const activity = startActivity(game.id);
  document.title = `${game.title} · Free Period`;
  $('title').textContent = game.title;
  mountRotateHint(game);
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
  settled.then(() => dailyCheckin()).catch(() => {}); // once a day per device, quiet (never blocks or covers the game)
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
    } else if (d.type === 'fp:room') {
      activity.setRoom(cleanRoom(d.room)); // the room code the game is in now (null = none)
    }
  });
  session.onChange(() => { if (helloSeen) postToken(); });

  let timer;
  function start() {
    clearInterval(timer);
    helloSeen = false;
    tokenSent = false;
    activity.setRoom(null); // a reloaded game starts outside any room until it says otherwise
    stage.innerHTML = '';
    loader.classList.remove('gone');
    setStatus('Loading the game...');
    frame = document.createElement('iframe');
    frame.src = joinUrl || gameUrl;
    joinUrl = '';
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

  // Fullscreen: the Fullscreen API where there is one (desktop, Android, iPad). iPhone Safari has none (and a home-screen
  // app has no browser bar anyway), so there the bar folds away and the game gets the whole screen (body.immersive).
  const canFull = hasFullscreenApi(document, stage);
  function fullscreen() {
    if (!canFull) { setImmersive(!document.body.classList.contains('immersive')); return; }
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const go = (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
      if (go && go.catch) go.catch(() => setImmersive(true)); // refused (an iframe without permission, a kiosk...): fold the bar instead
    }
    frame && !chatOverlay.isOpen && frame.focus();
  }
  function setImmersive(on) {
    if (on && chatOverlay.isOpen) chatOverlay.close();
    document.body.classList.toggle('immersive', on);
    $('full').setAttribute('aria-pressed', String(on));
    if (on) $('unfull').focus({ preventScroll: true });
    else $('full').focus({ preventScroll: true });
    if (frame && !on) setTimeout(() => frame && frame.focus(), 0);
  }
  if (!canFull) { $('full').title = 'Full screen: hide this bar'; $('full').setAttribute('aria-pressed', 'false'); }
  $('full').addEventListener('click', fullscreen);
  $('unfull').addEventListener('click', () => setImmersive(false));
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
  if (game.joins && joinRoom) {
    loader.classList.remove('gone');
    setStatus('Finding your friend\u2019s room\u2026');
    if (!loader.isConnected) stage.append(loader);
    if (await friendInRoom(game.id, joinRoom)) joinUrl = withJoin(game.url, joinRoom);
    // the room leaves the address bar: F5 must not drop the player back into it
    try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* keep it */ }
  }
  ready = true;
  start();
}

// "Rotate your phone" over the stage for a game that plays sideways (games.js orientation: 'landscape'). play.html's CSS
// shows it only on a touch phone held upright; turning the phone hides it, and "Play anyway" hides it for this visit.
function mountRotateHint(game) {
  if (game.orientation !== 'landscape') return;
  document.body.dataset.orient = 'landscape';
  const box = document.createElement('div');
  box.className = 'rotate';
  box.setAttribute('role', 'note');
  const inner = document.createElement('div');
  inner.className = 'box';
  const phone = document.createElement('div');
  phone.className = 'phone';
  phone.setAttribute('aria-hidden', 'true');
  const h2 = document.createElement('h2');
  h2.textContent = 'Rotate your phone';
  const p = document.createElement('p');
  p.textContent = `${game.title} plays sideways. Turn your phone to landscape for the full view.`;
  const anyway = document.createElement('button');
  anyway.type = 'button';
  anyway.className = 'tool';
  anyway.textContent = 'Play anyway';
  anyway.addEventListener('click', () => document.body.classList.add('rot-ok'));
  inner.append(phone, h2, p, anyway);
  box.append(inner);
  document.querySelector('.player').append(box);
}
