// Friends' activity (chat migration 0010): "Amy is playing Bing Ball" with a Join button.
//   play page: startActivity(gameId) sends a heartbeat (set_activity) about every 90 s while the game is open and the page
//              is visible, signed in to chat, and the person's own "Show friends what I'm playing" is on (read before
//              every beat; while it is off nothing about the game or room is sent). Games in this repo report their room
//              code (fp:room) and it rides along. Turning the setting off (any tab of this browser) stops it at once and
//              clears the row; leaving the page or logging out clears it too (best effort; a row nobody refreshes goes
//              stale after 3 minutes anyway). A Join link's room is only used when a friend is in it (friendInRoom).
//   home page: mountFriendsNow(section) polls friends_playing about once a minute while the page is visible and shows
//              the "Friends playing now" row only when at least one friend is playing.
// With chat not set up both do nothing and load nothing else. Who sees what is decided by the database (accepted friends,
// no blocks, each person's "Show friends what I'm playing" setting), never here.
import { h } from '../ui.js';
import { CHAT } from './config.js';

export const HEARTBEAT_MS = 90000;   // set_activity while playing (rows count as "playing now" for 3 minutes)
export const POLL_MS = 60000;        // the home page asks who is playing
export const JOIN_CHECK_MS = 6000;   // play page: how long a Join link waits to confirm a friend is in that room
const ROOM_RE = /^[A-Z0-9]{3,8}$/;   // the database's rule (0010)

const configured = () => !!(CHAT && CHAT.url && CHAT.key);

/** A room code as the database takes it (4-5 capital letters / digits, up to 8), or null. */
export function cleanRoom(v) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return ROOM_RE.test(s) ? s : null;
}

/** The Join link: the game, plus the friend's room for games that can deep-join one (games.js `joins`). */
export function joinHref(game, room) {
  const r = game && game.joins ? cleanRoom(room) : null;
  return 'play.html?g=' + encodeURIComponent(game.id) + (r ? '&room=' + r : '');
}

/** The game's own URL with ?join=CODE added (the play page frames this when it was opened from a Join button). */
export function withJoin(url, room) {
  const r = cleanRoom(room);
  if (!r) return url;
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash), tail = hash < 0 ? '' : url.slice(hash);
  return base + (base.includes('?') ? '&' : '?') + 'join=' + r + tail;
}

/** How long they have been on it, from the server's playing_secs. */
export function sinceText(secs) {
  const s = Number(secs);
  if (!Number.isFinite(s) || s < 60) return 'Just started';
  const m = Math.floor(s / 60);
  if (m < 60) return 'Started ' + m + ' min ago';
  const hr = Math.floor(m / 60);
  return 'Started ' + hr + (hr === 1 ? ' hour' : ' hours') + ' ago';
}

/** The tile's button: Join when there is a room to go into, else Play (the game's menu: solo, or a game that can't deep-join). */
export function joinLabel({ game, room, name }) {
  return room
    ? { text: 'Join', label: 'Join ' + (name || 'them') + ' in ' + game.title + ' (room ' + room + ')' }
    : { text: 'Play', label: 'Play ' + game.title + (name ? ' (' + name + ' is playing)' : '') };
}

/** friendsPlaying() rows -> what the row shows: only known games, one entry per friend, newest first. */
export function friendsNowItems(rows, games) {
  const byId = new Map((games || []).map((g) => [g.id, g]));
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const game = r && byId.get(r.game);
    if (!game || !r.profile || seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    const room = game.joins ? cleanRoom(r.room) : null;
    out.push({ id: r.user_id, profile: r.profile, game, room, secs: Number(r.playing_secs) || 0, href: joinHref(game, room) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- heartbeat
/**
 * The heartbeat's timing, without the network (unit-tested). Before every beat `check()` reads the person's own setting:
 * off = nothing is sent (and a shown row is cleared with `clear()`); on = `send(game, room)` (true = shown, false = the
 * database found the setting off). `setAllowed(false)` (the setting was just turned off) stops sending at once and clears;
 * `setAllowed(true)` beats at once. `exit()` is the page-close call. Beats only while chat is ready and the page is visible.
 */
export function createHeartbeat({ game, send, exit, check = async () => true, clear = async () => {}, every = HEARTBEAT_MS, settle = 1500, now = () => Date.now(), timers = globalThis } = {}) {
  let room = null, ready = false, visible = true, stopped = false, off = false, shown = false;
  let timer = 0, busy = false, again = false, last = -Infinity, gen = 0; // gen: bumped by setAllowed
  const stopTimer = () => { if (timer) { timers.clearTimeout(timer); timer = 0; } };
  const live = () => !stopped && ready && visible;
  function plan(ms) { stopTimer(); if (live()) timer = timers.setTimeout(beat, Math.max(0, ms)); }
  function hide() { if (shown) { shown = false; Promise.resolve().then(clear).catch(() => { /* the row goes stale in 3 min */ }); } }
  async function beat() {
    timer = 0;
    if (!live()) return;
    if (busy) { again = true; return; }
    busy = true;
    const g0 = gen;
    try {
      const on = await check();
      if (gen === g0 && live()) {          // (a setting change meanwhile has planned what comes next)
        if (!on) { off = true; hide(); }   // opted out: only the setting was read, nothing was sent
        else {
          off = false;
          const r = await send(game, room);
          if (gen !== g0 && off) { if (r === true) { shown = true; hide(); } }   // turned off while in flight: take it back
          else { shown = r === true; off = r === false; }
        }
      }
      last = now();
    } catch (e) {
      if (e && e.code === 'banned') stopped = true; // slow_down, network, not set up yet: the next beat tries again
    } finally { busy = false; }
    if (again) { again = false; plan(off ? every : 0); return; }
    plan(every);
  }
  // back from hidden: keep the cadence (a quick tab switch sends nothing extra), but beat at once if a beat is due
  const resume = () => plan(Math.max(0, last + every - now()));
  return {
    setReady(v) {
      ready = !!v;
      if (ready) { resume(); return; }
      stopTimer();
      if (shown) { shown = false; try { exit(); } catch { /* best effort */ } }   // logged out / switched: the row goes now
    },
    setVisible(v) { visible = !!v; if (visible) resume(); else stopTimer(); },
    setAllowed(on) {
      gen++;
      if (!on) { off = true; hide(); plan(every); return; }   // stop now; the next beats only read the setting
      off = false; last = -Infinity; plan(0);   // (a hidden page beats as soon as it is visible again)
    },
    setRoom(r) {
      const next = cleanRoom(r);
      if (next === room) return;
      room = next;
      if (!off) plan(settle);   // a room change goes out within a moment (several in a row count once)
    },
    leave() {
      stopped = true;
      stopTimer();
      if (shown) { shown = false; try { exit(); } catch { /* best effort */ } }
    },
    back() { if (stopped) { stopped = false; last = -Infinity; resume(); } },   // the page came back from the back/forward cache
    get room() { return room; },
    get shown() { return shown; },
    get off() { return off; },
  };
}

/** Play page: starts the heartbeat for `gameId` once chat is signed in. Returns { setRoom(code) }; a no-op without chat. */
export function startActivity(gameId) {
  let hb = null, pending;
  const api = { setRoom(r) { if (hb) hb.setRoom(r); else pending = r; } };
  if (!configured() || typeof document === 'undefined') return api;
  Promise.all([import('./client.js'), import('./data.js')]).then(([client, data]) => {
    if (!data.ACTIVITY_GAMES.includes(gameId)) return;
    hb = createHeartbeat({
      game: gameId,
      check: () => data.myShowActivity(),
      send: (g, r) => data.setActivity(g, r),
      clear: () => data.clearActivity(),
      exit: () => data.clearActivityOnExit(),
    });
    if (pending !== undefined) hb.setRoom(pending);
    hb.setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', () => hb.setVisible(document.visibilityState !== 'hidden'));
    addEventListener('pagehide', () => hb.leave());
    addEventListener('pageshow', (e) => { if (e.persisted) hb.back(); });
    data.onActivitySetting(({ uid, on }) => { const m = client.me(); if (m && m.id === uid) hb.setAllowed(on); });
    client.onChatState((s) => hb.setReady(s === 'ready'));
    hb.setReady(client.chatState() === 'ready');
    client.ensureChatSession().catch(() => {});
  }).catch(() => { /* chat is optional */ });
  return api;
}

/**
 * Play page, opened from a Join link (play.html?g=<game>&room=<CODE>): is an accepted friend in that game and room right
 * now? Only then does the game get ?join=CODE; any other link (a stranger's room posted in chat) opens the game normally.
 * Gives up (false) after `timeout` ms: chat signing in slowly never holds the game back for long.
 */
export async function friendInRoom(gameId, room, { timeout = JOIN_CHECK_MS } = {}) {
  const r = cleanRoom(room);
  if (!r || !configured()) return false;
  const late = new Promise((res) => setTimeout(() => res(false), timeout));
  const look = (async () => {
    const [client, data] = await Promise.all([import('./client.js'), import('./data.js')]);
    if ((await client.ensureChatSession()) !== 'ready') return false;
    const rows = await data.friendsPlaying();
    return rows.some((x) => x.game === gameId && cleanRoom(x.room) === r);
  })().catch(() => false);
  return Promise.race([look, late]);
}

// ------------------------------------------------------------------------------------------ home: Friends playing now
const SVG_NS = 'http://www.w3.org/2000/svg';
function joinIcon() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic'); s.setAttribute('fill', 'currentColor');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M3 1.8v12.4a.8.8 0 0 0 1.2.7l10.4-6.2a.8.8 0 0 0 0-1.4L4.2 1.1A.8.8 0 0 0 3 1.8z');
  s.append(p);
  return s;
}

/** One friend: poster with their avatar on it, name, "is playing <Game>", how long, Join. */
export function friendTile(item, { avatar, nameEl }) {
  const { profile, game, room, secs, href } = item;
  const accent = /^#[0-9a-f]{3,8}$/i.test(game.accent || '') ? game.accent : '#c6ff3d';
  const thumb = h('img', { alt: '', src: game.thumb, decoding: 'async', loading: 'lazy' });
  thumb.addEventListener('error', () => thumb.classList.add('broken'));
  const who = nameEl(profile, 'strong', 'fn-name', { plain: true });
  const btn = joinLabel({ game, room, name: who.textContent });
  return h('div', { class: 'fn-tile', style: '--accent:' + accent, dataset: { uid: item.id, game: game.id } },
    h('span', { class: 'fn-art' },
      h('span', { class: 'fn-thumb' }, thumb, room ? h('span', { class: 'fn-room', title: 'Room ' + room, text: room }) : null),
      avatar(profile, { size: 40, cls: 'fn-av' })),
    h('span', { class: 'fn-text' },
      who,
      h('span', { class: 'fn-what' }, 'is playing ', h('b', { text: game.title })),
      h('span', { class: 'fn-when' }, h('i', { class: 'fn-live', 'aria-hidden': 'true' }), h('span', { class: 'fn-since', text: sinceText(secs) }))),
    h('a', { class: 'fn-join' + (room ? '' : ' fn-play'), href, title: btn.label, 'aria-label': btn.label }, joinIcon(), btn.text));
}

/** Home page: fills `section` (hidden until a friend is playing). games = the resolved games.js list. */
export function mountFriendsNow(section, { games = [] } = {}) {
  if (!section) return;
  section.hidden = true;
  if (!configured()) return;
  const row = h('div', { class: 'fn-row', role: 'list' });
  const count = h('span', { class: 'count fn-count' });
  section.replaceChildren(
    h('div', { class: 'section-head' }, h('h2', { id: 'friends-now-h', text: 'Friends playing now' }), count),
    row);
  section.setAttribute('aria-labelledby', 'friends-now-h');
  Promise.all([import('./client.js'), import('./data.js'), import('./views/common.js'), ensureChatCss()]).then(([client, data, common]) => {
    let timer = 0, seq = 0, lastKey = '';
    function draw(items) {
      const key = JSON.stringify(items.map((i) => [i.id, i.game.id, i.room, i.profile.updated_at]));
      section.hidden = !items.length;
      if (key === lastKey) {   // same friends, games and rooms: only the times move, in place (a focused Join keeps focus)
        for (const it of items) {
          const el = [...row.children].find((t) => t.dataset.uid === it.id);
          const since = el && el.querySelector('.fn-since');
          if (since && since.textContent !== sinceText(it.secs)) since.textContent = sinceText(it.secs);
        }
        return;
      }
      lastKey = key;
      common.stopFrames(row);
      row.replaceChildren(...items.map((it) => { const t = friendTile(it, common); t.setAttribute('role', 'listitem'); return t; }));
      count.textContent = items.length === 1 ? '1 friend' : items.length + ' friends';
    }
    async function refresh() {
      if (client.chatState() !== 'ready' || document.hidden) return;
      const my = ++seq;
      try {
        const rows = await data.friendsPlaying();
        if (my === seq && client.chatState() === 'ready') draw(friendsNowItems(rows, games));
      } catch { /* keep what is shown; the next poll tries again */ }
    }
    function onState(s) {
      clearInterval(timer);
      if (s === 'ready') { refresh(); timer = setInterval(refresh, POLL_MS); } else { seq++; lastKey = ''; section.hidden = true; row.replaceChildren(); }
    }
    client.onChatState(onState);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    onState(client.chatState());
    client.ensureChatSession().catch(() => {});
  }).catch(() => { section.hidden = true; });
}

// chat.css styles the avatars (the Messages button loads it too; whichever comes first adds it once)
function ensureChatCss() {
  const href = new URL('../../chat.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
  return new Promise((res) => {
    const l = h('link', { rel: 'stylesheet', href });
    l.addEventListener('load', res); l.addEventListener('error', res);
    document.head.append(l);
  });
}
