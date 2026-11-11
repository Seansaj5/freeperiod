// Voice engine: Discord-style voice channels as a full WebRTC mesh (VOICE_MAX people per channel). Supabase Realtime
// carries who is where (presence on chat:voice, key = user id, meta { ch, mute, deaf, sess, at }) and the signaling
// (broadcast on chat:voice:<id>: offer / answer / bye, payload { from, to, sdp, sess }). ICE is not trickled: each side
// waits for gathering (ICE_WAIT_MS at most) and sends one SDP. The smaller user id offers. A failed connection gets one
// ICE-restart offer from the offerer (again after it stayed up STABLE_MS), then the peer is 'unreachable' until they
// leave or rejoin presence.
// Presence is what clients send, so it is trusted only through the server's registry (0013 voice_sessions, one row per
// person, written by voice_join with the server's time): a join registers the session before tracking presence, and
// the roster, capacity, ordering, "moved" and the peers come from presence entries whose key, sess and ch match a row
// (voicelogic.js rosterFromPresence). A `bye` is only a hint to re-check that.
// A module-level singleton with its own Realtime channels (data.voiceChannel) and its own server feed (voice kicks,
// voice sessions, profile changes: bans and time-outs end voice even while the chat app is paused), so the chat app's
// pause (the in-game overlay closing) never touches it. The mic is asked and the hidden <audio> elements are made inside
// join() (the click: Safari). The app also calls voice.leave('blocked') when I'm banned or timed out and
// voice.channelGone(id) when a channel is deleted. Failures end in status 'idle' with `error` set (a VOICE_ERRORS key);
// the next join clears it.
import * as data from './data.js';
import { VOICE_MAX, ICE_WAIT_MS, KICK_MS, VOICE_ERRORS, isOfferer, rosterFromPresence, supersededBy, canJoin, peerDiff, speakingStep,
  sessionRow, applySession, timeMs } from './voicelogic.js';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const WAIT_MS = 10000;   // join: presence sync, the kick list + registry, the signaling channel, voice_join; past this, 'lost'
const PEER_MS = 20000;   // a peer not connected this long counts as one failed attempt
const STABLE_MS = 10000; // up this long, a later failure is a new connection's trouble: it gets its own retry
const TICK_MS = 50;      // speaking detection: an FFT_SIZE window (~43 ms at 48 kHz) every 50 ms sees nearly every sample
const FFT_SIZE = 2048;
const RETRACK_MS = 300;  // mute / deafen flips: presence re-tracked once they settle (trailing)

// Browser and data.js defaults, each replaceable through voice._inject (node tests have no DOM or WebRTC).
const real = {
  RTCPeerConnection: () => globalThis.RTCPeerConnection,
  getUserMedia: () => (c) => {
    const md = globalThis.navigator && globalThis.navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return Promise.reject(Object.assign(new Error('no mediaDevices'), { name: 'NotFoundError' }));
    return md.getUserMedia(c);
  },
  AudioContext: () => globalThis.AudioContext || globalThis.webkitAudioContext,
  channelFactory: () => data.voiceChannel,
  now: () => Date.now,
  document: () => globalThis.document,
  window: () => (typeof globalThis.addEventListener === 'function' ? globalThis : null),
  myId: () => data.myId,
  listVoiceKicks: () => data.listVoiceKicks,
  listVoiceSessions: () => data.listVoiceSessions,
  voiceJoin: () => data.voiceJoin,
  voiceLeave: () => data.voiceLeave,
  subscribeServer: () => data.subscribeServer,
};
const injected = {};
const dep = (k) => (injected[k] != null ? injected[k] : real[k]());
const now = () => dep('now')();
const quiet = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch { /* best effort */ } };
// Time-ordered and rising in this tab ([A-Za-z0-9_-], what voice_join accepts).
let lastSess = 0;
const sessId = () => {
  lastSess = Math.max(Math.floor(now()), lastSess + 1);
  return lastSess.toString(36).padStart(10, '0') + '-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
};
const idleSpeak = () => ({ speaking: false, lastLoud: -Infinity });
const micError = (e) => (/^(NotFoundError|DevicesNotFoundError|OverconstrainedError)$/.test(String(e && e.name)) ? 'nomic' : 'mic');
// voice_join refusals (data.js ChatError) -> a VOICE_ERRORS key
function joinError(e) {
  const code = e && e.code, detail = e && e.detail;
  if (code === 'banned' || code === 'muted') return 'blocked';
  if (code === 'not_allowed') return detail === 'kicked' ? 'kicked' : detail === 'channel' ? 'gone' : detail === 'sess' ? 'lost' : 'blocked';
  return 'lost';
}

const S = { status: 'idle', channelId: null, channelName: null, mute: false, deaf: false, error: null, meSpeaking: false };
const fns = new Set();
let roster = new Map();
let watchers = 0;
let pres = null;    // the one chat:voice channel: { h, uid, synced, refused, up, everUp }
let reg = new Map(); // the registry (voice_sessions): user id -> { id, sess, ch, at (ms, server time) }
let regQ = null;    // registry events that came while the list was loading (replayed onto it)
let kicks = [];     // [{ target, channel_id, until (ms, this clock) }]
const off = new Map(); // banned / timed-out people seen on the feed: user id -> until (ms; Infinity = banned)
let feedOff = null, feedDone = false, feedGen = 0;
let call = null;    // the current join (see join); every callback checks it is still the current one
const waiters = new Set();

function emit() { for (const fn of [...fns]) { try { fn(); } catch (e) { console.error(e); } } }
function nudge() { for (const w of [...waiters]) if (w.test()) { waiters.delete(w); clearTimeout(w.t); w.res(true); } }
function waitFor(test, ms) {
  if (test()) return Promise.resolve(true);
  return new Promise((res) => { const w = { test, res }; w.t = setTimeout(() => { waiters.delete(w); res(test()); }, ms); waiters.add(w); });
}

// ---------- presence (chat:voice), shared by watch() and join() ----------
function ensurePresence() {
  const uid = dep('myId')();
  if (pres && (pres.uid !== uid || pres.refused)) dropPresence();
  if (!pres) {
    const p = { h: null, uid, synced: false, refused: false, up: false, everUp: false };
    pres = p;
    try {
      p.h = dep('channelFactory')('chat:voice', { presenceKey: uid || '', onSync: () => onSync(p), onStatus: (s) => onPresStatus(p, s) });
    } catch { p.refused = true; } // chat is off
  }
  startFeed();
}
function dropPresence() {
  const p = pres;
  pres = null;
  if (p && p.h) quiet(() => p.h.stop());
  if (roster.size) { roster = new Map(); emit(); }
}
function settle() { // nothing uses the engine: close its channels
  if (watchers > 0 || call) return;
  if (pres) dropPresence();
  if (feedOff) { quiet(feedOff); feedOff = null; feedGen++; reg = new Map(); regQ = null; off.clear(); }
}
function onSync(p) {
  if (p !== pres) return;
  p.synced = true;
  refresh();
}
// The roster again from presence + the registry; then, in a call: handed over to a newer tab? past capacity? the peers.
function refresh() {
  const p = pres;
  let state = {};
  if (p && p.h && !p.refused) { try { state = p.h.presenceState() || {}; } catch { /* keep empty */ } }
  roster = rosterFromPresence(state, reg);
  const c = call;
  if (c && c.tracked) {
    if (supersededBy(c.me, c.sess, c.at, reg)) return leave('moved');
    // two joined at once past capacity: everyone sees the same order (registry at), the newest beyond VOICE_MAX leaves
    if ((roster.get(c.id) || []).findIndex((x) => x.id === c.me) >= VOICE_MAX) return leave('full');
    reconcile(c);
  }
  nudge();
  emit();
}
function onPresStatus(p, s) {
  if (p !== pres) return;
  if (s === 'unauthorized') { // not allowed to post (banned, timed out): no roster, no voice
    p.refused = true;
    nudge();
    if (call) leave('blocked');
    else if (roster.size) { roster = new Map(); emit(); }
    return;
  }
  if (s !== 'SUBSCRIBED') { p.up = false; return; }
  const again = p.everUp && !p.up;
  p.up = p.everUp = true;
  // back after a drop: everyone saw me leave presence and closed my connections, so start over as a new session
  if (again && call && call.tracked) rejoin(call, p);
}
function rejoin(c, p) {
  c.tracked = false; // until the new session is registered: no offers or answers, no roster checks
  quiet(() => p.h.untrack()); // (data.js would track the old session's payload again right after this status)
  for (const id of [...c.peers.keys()]) closePeer(c, id);
  c.pending.clear();
  register(c, sessId()).then((r) => {
    if (call !== c) return;
    if (!r.ok) { leave(r.reason || 'lost'); return; }
    c.tracked = true;
    trackMe(c);
    refresh();
  });
  emit();
}
function trackMe(c) {
  clearTimeout(c.retrack);
  c.retrack = 0;
  // at: the registry's time (older hub tabs still read it); this engine orders by the registry itself
  if (pres && pres.h) quiet(() => pres.h.track({ ch: c.id, mute: S.mute, deaf: S.deaf, sess: c.sess, at: new Date(c.at).toISOString() }));
}
function retrack() { // mute / deafen: presence once the flips settle
  const c = call;
  if (!c || !c.tracked) return;
  clearTimeout(c.retrack);
  c.retrack = setTimeout(() => { c.retrack = 0; if (call === c && c.tracked) trackMe(c); }, RETRACK_MS);
}

// ---------- the registry: voice_join / voice_leave ----------
// Registers sess for c (voice_join; WAIT_MS at most). { ok } or { ok: false, reason } (a VOICE_ERRORS key; null = this
// call is over anyway). A join that the server takes after this call gave up on it is taken back (voice_leave).
function register(c, sess) {
  c.sess = sess;
  const job = Promise.resolve().then(() => dep('voiceJoin')(c.id, sess));
  job.then(() => { if (call !== c || c.sess !== sess) quiet(() => dep('voiceLeave')(sess)); }, () => {});
  let t = 0;
  const late = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('voice_join timed out'), { code: 'network' })), WAIT_MS); });
  return Promise.race([job, late]).then((at) => {
    if (call !== c || c.sess !== sess) return { ok: false, reason: null };
    const ms = timeMs(at);
    if (!Number.isFinite(ms)) return { ok: false, reason: 'lost' };
    c.at = ms;
    c.regSess = sess;
    applySession(reg, { type: 'update', row: { user_id: c.me, sess, channel_id: c.id, at: ms } });
    return { ok: true };
  }, (e) => ({ ok: false, reason: call === c ? joinError(e) : null })).finally(() => clearTimeout(t));
}
// My row is gone (a delete event) while I'm in voice: register this session again. A refusal says why I'm out (a kick,
// a ban or time-out, the channel deleted); a stale delete (my own earlier session's) changes nothing.
function reRegister(c) {
  if (call !== c || !c.tracked || c.rereg) return;
  c.rereg = true;
  register(c, c.sess).then((r) => { c.rereg = false; if (call === c && !r.ok) leave(r.reason || 'lost'); else if (call === c) refresh(); });
}
// A fresh list for this engine's registry: mine stays mine (a list taken just before my voice_join would drop me).
function keepMine(next) {
  const c = call;
  if (!c || !c.regSess) return;
  const prev = next.get(c.me);
  if (!prev || prev.at < c.at) next.set(c.me, { id: c.me, sess: c.regSess, ch: c.id, at: c.at });
}

// ---------- the server feed: voice kicks, voice sessions, profiles (bans / time-outs) ----------
function addKick(target, channelId, until) {
  const t = now();
  const ch = Number(channelId);
  kicks = kicks.filter((k) => k.until > t && !(k.target === target && k.channel_id === ch && k.until <= until));
  if (!kicks.some((k) => k.target === target && k.channel_id === ch)) kicks.push({ target, channel_id: ch, until });
}
const kickedNow = (id, ch) => { const t = now(); return kicks.some((k) => k.target === id && k.channel_id === ch && k.until > t); };
const offNow = (id) => (off.get(id) || 0) > now();
function startFeed() {
  if (feedOff) return;
  const g = ++feedGen;
  feedDone = false;
  try {
    feedOff = dep('subscribeServer')({ voiceKick: onKick, voiceSession: onSession, profile: onProfile, status: (s) => { if (s === 'live') reload(g); } }) || (() => {});
  } catch { feedOff = () => {}; }
  reload(g);
}
// The kick list and the registry, at the start and again each time the feed is live (events missed while it was down).
// The latest reload owns the registry: events that come while its list loads are replayed onto the list.
function reload(g) {
  const kicksDone = Promise.resolve().then(() => dep('listVoiceKicks')()).then((rows) => {
    if (g !== feedGen) return;
    const t = now();
    for (const r of Array.isArray(rows) ? rows : []) {
      const u = Date.parse(r && r.until);
      if (r && typeof r.target === 'string' && Number.isFinite(u) && u > t) addKick(r.target, r.channel_id, Math.min(u, t + KICK_MS));
    }
  }).catch(() => {});
  const q = [];
  regQ = q;
  const regDone = Promise.resolve().then(() => dep('listVoiceSessions')()).then((rows) => {
    if (g !== feedGen || regQ !== q) return false;
    const next = new Map();
    for (const r of Array.isArray(rows) ? rows : []) { const s = sessionRow(r); if (s) next.set(s.id, s); }
    for (const ev of q) applySession(next, ev);
    keepMine(next);
    reg = next;
    return true;
  }).catch(() => g === feedGen && regQ === q).then((mine) => { if (regQ === q) regQ = null; return mine; });
  return Promise.all([kicksDone, regDone]).then(([, mine]) => {
    if (g !== feedGen || !mine) return; // (a newer reload finishes the job)
    feedDone = true;
    const c = call;
    if (c && c.tracked && kickedNow(c.me, c.id)) { leave('kicked'); return; }
    refresh();
  });
}
function onKick(row) {
  if (!row || typeof row.target !== 'string') return;
  addKick(row.target, row.channel_id, now() + KICK_MS); // a new row: 60 s from now on this clock (clocks differ)
  const c = call;
  if (!c || Number(row.channel_id) !== c.id) return;
  if (row.target === c.me) return leave('kicked');
  if (c.peers.has(row.target)) { closePeer(c, row.target); emit(); }
}
function onSession(ev) {
  if (!ev || !ev.row) return;
  if (regQ) regQ.push(ev);
  const c = call;
  if (ev.type === 'delete' && c && c.regSess && ev.row.user_id === c.me) { reRegister(c); return; }
  if (applySession(reg, ev)) refresh();
}
// Banned or timed out: me out of voice ('blocked'); someone else dropped like a kick, while it lasts.
function onProfile(row) {
  if (!row || typeof row.id !== 'string') return;
  const until = row.banned === true ? Infinity : Date.parse(row.muted_until || '');
  const c = call;
  if (!(until > now())) {
    if (off.delete(row.id) && c && c.tracked) reconcile(c);
    return;
  }
  off.set(row.id, until);
  if (!c) return;
  if (row.id === c.me) return leave('blocked');
  if (c.peers.has(row.id)) { closePeer(c, row.id); emit(); }
}

// ---------- join / leave ----------
// Order: the mic (synchronously, still inside the click), canJoin against the roster and kicks, the signaling channel,
// the registry (voice_join), presence, then connections to the people already there.
function join({ id, name } = {}) {
  const ch = Number(id);
  if (call && call.id === ch) return call.done;
  if (call) teardown(null); // switching channel: leave, then join
  const me = dep('myId')();
  if (!me || !Number.isSafeInteger(ch) || ch <= 0) { S.error = me ? 'gone' : 'blocked'; settle(); emit(); return Promise.resolve(); }
  const c = { id: ch, name: name == null ? null : String(name), me, sess: null, regSess: null, at: null, tracked: false, rereg: false,
    retrack: 0, stream: null, sig: null, sigStatus: null, peers: new Map(), pending: new Map(), els: [], pool: [], ac: null, sink: null,
    meAn: null, meSpeak: idleSpeak(), tick: 0, win: null, onHide: null, done: null };
  call = c;
  let media;
  try { media = Promise.resolve(dep('getUserMedia')({ audio: true })); } catch (e) { media = Promise.reject(e); }
  makeAudio(c);
  Object.assign(S, { status: 'joining', channelId: ch, channelName: c.name, error: null, meSpeaking: false });
  ensurePresence();
  emit();
  c.done = run(c, media);
  return c.done;
}
async function run(c, media) {
  let stream;
  try { stream = await media; } catch (e) { return end(c, micError(e)); }
  if (call !== c) return stopStream(stream);
  c.stream = stream;
  watchMic(c, stream);
  applyMic();
  c.meAn = analyse(c, stream);
  if (c.ac) c.tick = setInterval(() => tick(c), TICK_MS);
  const p = pres;
  await waitFor(() => call !== c || pres !== p || p.synced || p.refused, WAIT_MS);
  await waitFor(() => call !== c || feedDone, WAIT_MS);
  if (call !== c) return;
  if (pres !== p || !p.synced) return end(c, p && p.refused ? 'blocked' : 'lost');
  const ok = canJoin({ roster, channelId: c.id, myId: c.me, kicks, now: now() });
  if (!ok.ok) return end(c, ok.reason);
  try {
    c.sig = dep('channelFactory')('chat:voice:' + c.id, { onBroadcast: (ev, m) => onSignal(c, ev, m), onStatus: (s) => onSigStatus(c, s) });
  } catch { return end(c, 'lost'); }
  await waitFor(() => call !== c || c.sigStatus === 'SUBSCRIBED' || c.sigStatus === 'unauthorized', WAIT_MS);
  if (call !== c) return;
  if (c.sigStatus !== 'SUBSCRIBED') return end(c, c.sigStatus === 'unauthorized' ? 'blocked' : 'lost');
  const r = await register(c, sessId()); // the server's record first: refused = kicked, banned / timed out, channel gone
  if (call !== c) return;
  if (!r.ok) return end(c, r.reason || 'lost');
  c.tracked = true;
  trackMe(c);
  c.win = dep('window');
  if (c.win) { c.onHide = () => { if (call === c) leave(); }; c.win.addEventListener('pagehide', c.onHide); } // hang up (bye, voice_leave)
  S.status = 'connected';
  refresh();
}
function end(c, reason) { if (call === c) leave(reason); }
function onSigStatus(c, s) {
  if (call !== c) return;
  c.sigStatus = s;
  if (s === 'unauthorized' && c.tracked) leave('blocked');
  nudge();
}
// The mic unplugged, or a Bluetooth headset switched away: the call has no mic any more.
function watchMic(c, stream) {
  const tracks = stream.getAudioTracks ? stream.getAudioTracks() : stream.getTracks ? stream.getTracks() : [];
  for (const t of tracks) {
    const onEnd = () => { if (call === c) leave('lost'); };
    if (typeof t.addEventListener === 'function') t.addEventListener('ended', onEnd);
    else t.onended = onEnd;
  }
}
function stopStream(stream) { if (stream && stream.getTracks) for (const t of stream.getTracks()) quiet(() => t.stop()); }
function teardown(reason) {
  const c = call;
  if (!c) return false;
  call = null;
  clearTimeout(c.retrack);
  if (c.sig) {
    if (c.tracked) send(c, 'bye', null, null);
    quiet(() => c.sig.stop());
  }
  for (const id of [...c.peers.keys()]) closePeer(c, id);
  for (const a of c.els) { a.srcObject = null; quiet(() => a.remove()); }
  stopStream(c.stream);
  if (c.meAn) unhook(c.meAn);
  clearInterval(c.tick);
  if (c.ac) quiet(() => c.ac.close());
  if (c.tracked && pres && pres.h) quiet(() => pres.h.untrack());
  if (c.regSess) { // best effort (pagehide too); a newer tab's session is never touched (voice_leave checks sess)
    quiet(() => dep('voiceLeave')(c.regSess));
    const mine = reg.get(c.me);
    if (mine && mine.sess === c.regSess) reg.delete(c.me);
  }
  if (c.onHide) quiet(() => c.win.removeEventListener('pagehide', c.onHide));
  Object.assign(S, { status: 'idle', channelId: null, channelName: null, meSpeaking: false, error: typeof VOICE_ERRORS[reason] === 'string' ? reason : null });
  nudge();
  return true;
}
function leave(reason) {
  if (!call) { if (reason == null && S.error) { S.error = null; emit(); } return; } // not in voice: never a new error
  teardown(reason);
  settle();
  emit();
}

// ---------- peers ----------
function reconcile(c) {
  if (call !== c || !c.tracked) return;
  const want = new Map(); // id -> their session
  for (const x of (roster.get(c.id) || []).slice(0, VOICE_MAX)) {
    if (x.id !== c.me && !kickedNow(x.id, c.id) && !offNow(x.id)) want.set(x.id, x.sess);
  }
  for (const [id, p] of c.peers) if (want.has(id) && want.get(id) !== p.sess) closePeer(c, id); // a new session = a new peer
  const { add, drop } = peerDiff(new Set(c.peers.keys()), new Set(want.keys()));
  for (const id of drop) closePeer(c, id);
  for (const id of add) openPeer(c, id, want.get(id));
}
const live = (c, p) => call === c && !p.dead;
function openPeer(c, id, sess) {
  let pc;
  try { const RTC = dep('RTCPeerConnection'); pc = new RTC({ iceServers: ICE_SERVERS }); } catch { return; }
  const p = { id, sess, pc, state: 'connecting', speaking: false, speak: idleSpeak(), offerer: isOfferer(c.me, id), answers: 0,
    fails: 0, upAt: null, upMs: 0, audio: c.pool.pop() || null, an: null, lastOffer: null, timer: 0, q: Promise.resolve(), dead: false };
  c.peers.set(id, p);
  for (const t of c.stream.getTracks()) quiet(() => pc.addTrack(t, c.stream));
  pc.ontrack = (e) => onTrack(c, p, e);
  pc.onconnectionstatechange = () => onConn(c, p);
  arm(c, p);
  if (p.offerer) negotiate(c, p, false);
  else {
    const o = c.pending.get(id); // their offer came before presence showed them
    if (o && o.sess === sess) { c.pending.delete(id); answer(c, p, o.sdp); }
  }
}
function closePeer(c, id) {
  const p = c.peers.get(id);
  if (!p) return;
  c.peers.delete(id);
  p.dead = true;
  clearTimeout(p.timer);
  p.pc.ontrack = null;
  p.pc.onconnectionstatechange = null;
  quiet(() => p.pc.close());
  if (p.an) unhook(p.an);
  if (p.audio) { p.audio.srcObject = null; c.pool.push(p.audio); }
}
function send(c, event, to, sdp) { if (c.sig) quiet(() => c.sig.send(event, { from: c.me, to, sdp, sess: c.sess })); }
// Resolves when this round of ICE gathering is over, ICE_WAIT_MS at most. Armed before setLocalDescription. fresh = a
// renegotiation (my ICE restart, or answering theirs): iceGatheringState may still read 'complete' from the round before,
// so only this round's end counts: end-of-candidates (a null icecandidate) or a change to 'complete'.
function iceWait(pc, fresh) {
  return new Promise((res) => {
    if (!fresh && pc.iceGatheringState === 'complete') { res(); return; }
    let t = 0;
    const onState = () => { if (pc.iceGatheringState === 'complete') done(); };
    const onCand = (e) => { if (e && !e.candidate) done(); };
    const done = () => {
      clearTimeout(t);
      quiet(() => pc.removeEventListener('icegatheringstatechange', onState));
      quiet(() => pc.removeEventListener('icecandidate', onCand));
      res();
    };
    t = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener('icegatheringstatechange', onState);
    pc.addEventListener('icecandidate', onCand);
  });
}
function negotiate(c, p, restart) { // offerer only
  p.q = p.q.then(async () => {
    if (!live(c, p)) return;
    if (restart && typeof p.pc.restartIce === 'function') p.pc.restartIce();
    const o = await p.pc.createOffer(restart ? { iceRestart: true } : undefined);
    if (!live(c, p)) return;
    const gathered = iceWait(p.pc, restart);
    await p.pc.setLocalDescription(o);
    await gathered;
    if (live(c, p)) send(c, 'offer', p.id, p.pc.localDescription.sdp);
  }).catch(() => failPeer(c, p));
}
function answer(c, p, sdp) {
  if (p.lastOffer === sdp) return; // the same offer twice: answered once
  p.lastOffer = sdp;
  const fresh = p.answers++ > 0;
  p.q = p.q.then(async () => {
    if (!live(c, p)) return;
    await p.pc.setRemoteDescription({ type: 'offer', sdp });
    const a = await p.pc.createAnswer();
    if (!live(c, p)) return;
    const gathered = iceWait(p.pc, fresh);
    await p.pc.setLocalDescription(a);
    await gathered;
    if (live(c, p)) send(c, 'answer', p.id, p.pc.localDescription.sdp);
  }).catch(() => failPeer(c, p));
}
function onSignal(c, ev, m) {
  if (call !== c || !m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === c.me) return;
  const p = c.peers.get(m.from);
  if (ev === 'bye') { // anyone can send one: only a hint to re-check the registry + presence (gone there = dropped)
    const o = c.pending.get(m.from);
    if (o && o.sess === m.sess) c.pending.delete(m.from);
    if (p && p.sess === m.sess && c.tracked) refresh();
    return;
  }
  if (!c.tracked || m.to !== c.me || typeof m.sdp !== 'string') return;
  if (ev === 'offer') {
    if (isOfferer(c.me, m.from)) return; // I make the offers to this one
    if (!p || p.sess !== m.sess) { c.pending.set(m.from, m); return; } // presence or the registry has not caught up yet
    answer(c, p, m.sdp);
  } else if (ev === 'answer' && p && p.offerer && p.sess === m.sess) {
    p.q = p.q.then(() => { if (live(c, p) && p.pc.signalingState === 'have-local-offer') return p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); })
      .catch(() => failPeer(c, p));
  }
}
function onConn(c, p) {
  if (!live(c, p)) return;
  const s = p.pc.connectionState;
  if (s === 'connected') {
    p.upAt = now();
    clearTimeout(p.timer);
    if (p.state !== 'connected') { p.state = 'connected'; emit(); }
    return;
  }
  if (p.upAt != null) { p.upMs = now() - p.upAt; p.upAt = null; } // how long it stayed up
  if (s === 'failed') failPeer(c, p);
}
// 1st failure: the offerer restarts ICE once; 2nd: unreachable, no more tries. "Once" is per established connection:
// after STABLE_MS up, a new failure starts the count again (R6).
function failPeer(c, p) {
  if (!live(c, p) || p.state === 'unreachable') return;
  clearTimeout(p.timer);
  if (p.upMs >= STABLE_MS) p.fails = 0;
  p.upMs = 0;
  if (++p.fails >= 2) { p.state = 'unreachable'; emit(); return; }
  p.state = 'connecting';
  if (p.offerer) negotiate(c, p, true);
  arm(c, p);
  emit();
}
function arm(c, p) {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => { if (live(c, p) && p.pc.connectionState !== 'connected') failPeer(c, p); }, PEER_MS);
}
function onTrack(c, p, e) {
  if (!live(c, p) || !e) return;
  const stream = (e.streams && e.streams[0]) || (e.track && globalThis.MediaStream ? new globalThis.MediaStream([e.track]) : null);
  if (!stream) return;
  if (p.audio) { p.audio.srcObject = stream; p.audio.muted = S.deaf; quiet(() => p.audio.play()); }
  if (p.an) unhook(p.an);
  p.an = analyse(c, stream);
}

// ---------- audio: hidden <audio> elements, mic on/off, speaking ----------
function makeAudio(c) { // inside join (the click)
  const doc = dep('document');
  if (doc && doc.body && typeof doc.createElement === 'function') {
    for (let i = 0; i < VOICE_MAX - 1; i++) {
      quiet(() => {
        const a = Object.assign(doc.createElement('audio'), { autoplay: true, playsInline: true });
        a.setAttribute('autoplay', '');
        a.setAttribute('playsinline', '');
        doc.body.appendChild(a);
        c.els.push(a);
        c.pool.push(a);
      });
    }
  }
  const AC = dep('AudioContext');
  if (!AC) return;
  try {
    c.ac = new AC();
    quiet(() => c.ac.resume());
    c.sink = c.ac.createGain(); // analysers feed a silent sink so every browser keeps them running
    c.sink.gain.value = 0;
    c.sink.connect(c.ac.destination);
  } catch { c.ac = null; }
}
function applyMic() {
  const s = call && call.stream;
  if (s) for (const t of s.getAudioTracks ? s.getAudioTracks() : s.getTracks()) t.enabled = !(S.mute || S.deaf);
}
function analyse(c, stream) {
  if (!c.ac) return null;
  try {
    const src = c.ac.createMediaStreamSource(stream);
    const an = c.ac.createAnalyser();
    an.fftSize = FFT_SIZE;
    src.connect(an);
    an.connect(c.sink);
    return { src, an, buf: new Float32Array(an.fftSize) };
  } catch { return null; }
}
function unhook(a) { quiet(() => a.src.disconnect()); quiet(() => a.an.disconnect()); }
function level(a) { // RMS, 0..1
  if (!a) return 0;
  try {
    let s = 0;
    if (a.an.getFloatTimeDomainData) { a.an.getFloatTimeDomainData(a.buf); for (const v of a.buf) s += v * v; }
    else { const b = new Uint8Array(a.buf.length); a.an.getByteTimeDomainData(b); for (const v of b) s += ((v - 128) / 128) ** 2; }
    return Math.sqrt(s / a.buf.length);
  } catch { return 0; }
}
function tick(c) {
  if (call !== c) return;
  // a context the browser suspended or interrupted (iOS: a call, Siri, the lock screen) reads silence: wake it up
  if (c.ac && c.ac.state !== 'running' && c.ac.state !== 'closed') quiet(() => c.ac.resume());
  const t = now();
  let changed = false;
  c.meSpeak = S.mute || S.deaf ? idleSpeak() : speakingStep(c.meSpeak, level(c.meAn), t);
  if (c.meSpeak.speaking !== S.meSpeaking) { S.meSpeaking = c.meSpeak.speaking; changed = true; }
  for (const p of c.peers.values()) {
    p.speak = speakingStep(p.speak, level(p.an), t);
    if (p.speak.speaking !== p.speaking) { p.speaking = p.speak.speaking; changed = true; }
  }
  if (changed) emit();
}

export const voice = {
  // Ref-counted chat:voice presence (+ the server feed) for the sidebar's voice occupants; returns stop().
  watch() {
    watchers++;
    ensurePresence();
    let done = false;
    return () => { if (done) return; done = true; watchers--; settle(); };
  },
  // Verified occupants only (presence entries that match the registry): Map<channel id, [{ id, mute, deaf, sess, at }]>.
  roster: () => roster,
  state() {
    const peers = new Map();
    if (call) for (const [id, p] of call.peers) peers.set(id, { state: p.state, speaking: p.speaking });
    return { ...S, peers };
  },
  onChange(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
  join,
  leave,
  // Both work while idle too; a join applies them. Deafen = every remote <audio> muted + my mic off (like Discord). The
  // mic and the audio change at once; presence (the icons others see) follows RETRACK_MS after the last flip.
  setMute(on) { S.mute = !!on; applyMic(); retrack(); emit(); },
  setDeaf(on) {
    S.deaf = !!on;
    applyMic();
    if (call) for (const a of call.els) a.muted = S.deaf;
    retrack();
    emit();
  },
  channelGone(id) { if (call && call.id === Number(id)) leave('gone'); },
  _inject(o = {}) { Object.assign(injected, o); },
  // Test-only (e2e): each peer's RTCPeerConnection state, inbound audio bytes and level; my level; the AudioContext.
  async _debug() {
    const c = call;
    const peers = [];
    for (const p of c ? [...c.peers.values()] : []) {
      let bytesIn = 0;
      try {
        (await p.pc.getStats()).forEach((r) => { if (r && r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'audio') bytesIn += r.bytesReceived || 0; });
      } catch { /* no stats: 0 */ }
      peers.push({ id: p.id, state: p.pc.connectionState, bytesIn, level: level(p.an) });
    }
    return { peers, meLevel: c ? level(c.meAn) : 0, ac: c && c.ac ? { state: c.ac.state, time: c.ac.currentTime } : null };
  },
};
