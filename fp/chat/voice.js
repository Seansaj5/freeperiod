// Voice engine: Discord-style voice channels as a full WebRTC mesh (VOICE_MAX people per channel). Supabase Realtime
// carries who is where (presence on chat:voice, key = user id, meta { ch, mute, deaf, sess, at }) and the signaling
// (broadcast on chat:voice:<id>: offer / answer / bye, payload { from, to, sdp, sess }). ICE is not trickled: each side
// waits for gathering (ICE_WAIT_MS at most) and sends one SDP. The smaller user id offers. A failed connection gets one
// ICE-restart offer from the offerer, then the peer is 'unreachable' until they leave or rejoin presence.
// A module-level singleton with its own Realtime channels (data.voiceChannel), so the chat app's pause (the in-game
// overlay closing) never touches it. The mic is asked and the hidden <audio> elements are made inside join() (the click:
// Safari). The app drives the rest: voice.leave('blocked') when I'm banned or timed out, voice.channelGone(id) when a
// channel is deleted. Failures end in status 'idle' with `error` set (a VOICE_ERRORS key); the next join clears it.
import * as data from './data.js';
import { VOICE_MAX, ICE_WAIT_MS, KICK_MS, VOICE_ERRORS, isOfferer, rosterFromPresence, supersededBy, canJoin, peerDiff, speakingStep } from './voicelogic.js';

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const WAIT_MS = 10000; // join: presence sync, the kick list, the signaling channel; past this, 'lost'
const PEER_MS = 20000; // a peer not connected this long counts as one failed attempt
const TICK_MS = 100;   // speaking detection

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
  subscribeServer: () => data.subscribeServer,
};
const injected = {};
const dep = (k) => (injected[k] != null ? injected[k] : real[k]());
const now = () => dep('now')();
const quiet = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch { /* best effort */ } };
const sessId = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));
const idleSpeak = () => ({ speaking: false, lastLoud: -Infinity });
const micError = (e) => (/^(NotFoundError|DevicesNotFoundError|OverconstrainedError)$/.test(String(e && e.name)) ? 'nomic' : 'mic');

const S = { status: 'idle', channelId: null, channelName: null, mute: false, deaf: false, error: null, meSpeaking: false };
const fns = new Set();
let roster = new Map();
let watchers = 0;
let pres = null;    // the one chat:voice channel: { h, uid, synced, refused, up, everUp }
let kicks = [];     // [{ target, channel_id, until (ms, this clock) }]
let kicksOff = null, kicksDone = false, kicksGen = 0;
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
  startKicks();
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
  if (kicksOff) { quiet(kicksOff); kicksOff = null; }
}
function onSync(p) {
  if (p !== pres) return;
  p.synced = true;
  let state = {};
  try { state = p.h.presenceState() || {}; } catch { /* keep empty */ }
  roster = rosterFromPresence(state);
  const c = call;
  if (c && c.tracked) {
    if (supersededBy(c.me, c.sess, c.at, state)) return leave('moved');
    // two joined at once past capacity: everyone sees the same order, the newest beyond VOICE_MAX leaves
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
  if (again && call && call.tracked) {
    call.sess = sessId();
    for (const id of [...call.peers.keys()]) closePeer(call, id);
    call.pending.clear();
    trackMe(call);
    emit();
  }
}
function trackMe(c) {
  if (pres && pres.h) quiet(() => pres.h.track({ ch: c.id, mute: S.mute, deaf: S.deaf, sess: c.sess, at: c.at }));
}

// ---------- staff disconnects (voice_kicks) ----------
function addKick(target, channelId, until) {
  const t = now();
  kicks = kicks.filter((k) => k.until > t);
  kicks.push({ target, channel_id: Number(channelId), until });
}
const kickedNow = (id, ch) => { const t = now(); return kicks.some((k) => k.target === id && k.channel_id === ch && k.until > t); };
function startKicks() {
  if (kicksOff) return;
  const g = ++kicksGen;
  kicksDone = false;
  try { kicksOff = dep('subscribeServer')({ voiceKick: onKick }) || (() => {}); } catch { kicksOff = () => {}; }
  Promise.resolve().then(() => dep('listVoiceKicks')()).then((rows) => {
    const t = now();
    for (const r of Array.isArray(rows) ? rows : []) {
      const u = Date.parse(r && r.until);
      if (r && typeof r.target === 'string' && Number.isFinite(u) && u > t) addKick(r.target, r.channel_id, Math.min(u, t + KICK_MS));
    }
  }).catch(() => {}).then(() => { if (g === kicksGen) { kicksDone = true; nudge(); } });
}
function onKick(row) {
  if (!row || typeof row.target !== 'string') return;
  addKick(row.target, row.channel_id, now() + KICK_MS); // a new row: 60 s from now on this clock (clocks differ)
  const c = call;
  if (!c || Number(row.channel_id) !== c.id) return;
  if (row.target === c.me) return leave('kicked');
  if (c.peers.has(row.target)) { closePeer(c, row.target); emit(); }
}

// ---------- join / leave ----------
// Order: the mic (synchronously, still inside the click), canJoin against the roster and kicks, the signaling channel,
// presence, then connections to the people already there.
function join({ id, name } = {}) {
  const ch = Number(id);
  if (call && call.id === ch) return call.done;
  if (call) teardown(null); // switching channel: leave, then join
  const me = dep('myId')();
  if (!me || !Number.isSafeInteger(ch) || ch <= 0) { S.error = me ? 'gone' : 'blocked'; settle(); emit(); return Promise.resolve(); }
  const c = { id: ch, name: name == null ? null : String(name), me, sess: null, at: null, tracked: false, stream: null, sig: null,
    sigStatus: null, peers: new Map(), pending: new Map(), byes: new Set(), els: [], pool: [], ac: null, sink: null, meAn: null,
    meSpeak: idleSpeak(), tick: 0, win: null, onHide: null, done: null };
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
  applyMic();
  c.meAn = analyse(c, stream);
  if (c.ac) c.tick = setInterval(() => tick(c), TICK_MS);
  const p = pres;
  await waitFor(() => call !== c || pres !== p || p.synced || p.refused, WAIT_MS);
  await waitFor(() => call !== c || kicksDone, WAIT_MS);
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
  c.sess = sessId();
  c.at = new Date(now()).toISOString();
  c.tracked = true;
  trackMe(c);
  c.win = dep('window');
  if (c.win) { c.onHide = () => { if (call === c) leave(); }; c.win.addEventListener('pagehide', c.onHide); } // hang up (bye)
  S.status = 'connected';
  reconcile(c);
  emit();
}
function end(c, reason) { if (call === c) leave(reason); }
function onSigStatus(c, s) {
  if (call !== c) return;
  c.sigStatus = s;
  if (s === 'unauthorized' && c.tracked) leave('blocked');
  nudge();
}
function stopStream(stream) { if (stream && stream.getTracks) for (const t of stream.getTracks()) quiet(() => t.stop()); }
function teardown(reason) {
  const c = call;
  if (!c) return false;
  call = null;
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
    if (x.id !== c.me && !c.byes.has(x.id + ' ' + x.sess) && !kickedNow(x.id, c.id)) want.set(x.id, x.sess);
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
  const p = { id, sess, pc, state: 'connecting', speaking: false, speak: idleSpeak(), offerer: isOfferer(c.me, id), fails: 0,
    audio: c.pool.pop() || null, an: null, lastOffer: null, timer: 0, q: Promise.resolve(), dead: false };
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
function iceDone(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    let t = 0;
    const on = () => { if (pc.iceGatheringState === 'complete') done(); };
    const done = () => { clearTimeout(t); quiet(() => pc.removeEventListener('icegatheringstatechange', on)); res(); };
    t = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener('icegatheringstatechange', on);
  });
}
function negotiate(c, p, restart) { // offerer only
  p.q = p.q.then(async () => {
    if (!live(c, p)) return;
    if (restart && typeof p.pc.restartIce === 'function') p.pc.restartIce();
    const o = await p.pc.createOffer(restart ? { iceRestart: true } : undefined);
    if (!live(c, p)) return;
    await p.pc.setLocalDescription(o);
    await iceDone(p.pc);
    if (live(c, p)) send(c, 'offer', p.id, p.pc.localDescription.sdp);
  }).catch(() => failPeer(c, p));
}
function answer(c, p, sdp) {
  if (p.lastOffer === sdp) return; // the same offer twice: answered once
  p.lastOffer = sdp;
  p.q = p.q.then(async () => {
    if (!live(c, p)) return;
    await p.pc.setRemoteDescription({ type: 'offer', sdp });
    const a = await p.pc.createAnswer();
    if (!live(c, p)) return;
    await p.pc.setLocalDescription(a);
    await iceDone(p.pc);
    if (live(c, p)) send(c, 'answer', p.id, p.pc.localDescription.sdp);
  }).catch(() => failPeer(c, p));
}
function onSignal(c, ev, m) {
  if (call !== c || !m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === c.me) return;
  const p = c.peers.get(m.from);
  if (ev === 'bye') { // only for the session that said it (a newer tab of theirs may already be here)
    c.byes.add(m.from + ' ' + m.sess);
    const o = c.pending.get(m.from);
    if (o && o.sess === m.sess) c.pending.delete(m.from);
    if (p && p.sess === m.sess) { closePeer(c, m.from); emit(); }
    return;
  }
  if (!c.tracked || m.to !== c.me || typeof m.sdp !== 'string') return;
  if (ev === 'offer') {
    if (isOfferer(c.me, m.from)) return; // I make the offers to this one
    if (!p || p.sess !== m.sess) { c.pending.set(m.from, m); return; } // presence has not caught up yet
    answer(c, p, m.sdp);
  } else if (ev === 'answer' && p && p.offerer && p.sess === m.sess) {
    p.q = p.q.then(() => { if (live(c, p) && p.pc.signalingState === 'have-local-offer') return p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); })
      .catch(() => failPeer(c, p));
  }
}
function onConn(c, p) {
  if (!live(c, p)) return;
  const s = p.pc.connectionState;
  if (s === 'connected') { clearTimeout(p.timer); if (p.state !== 'connected') { p.state = 'connected'; emit(); } }
  else if (s === 'failed') failPeer(c, p);
}
function failPeer(c, p) { // 1st failure: the offerer restarts ICE once; 2nd: unreachable, no more tries on this connection
  if (!live(c, p) || p.state === 'unreachable') return;
  clearTimeout(p.timer);
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
    an.fftSize = 512;
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
  // Ref-counted chat:voice presence for the sidebar's voice occupants; returns stop().
  watch() {
    watchers++;
    ensurePresence();
    let done = false;
    return () => { if (done) return; done = true; watchers--; settle(); };
  },
  roster: () => roster,
  state() {
    const peers = new Map();
    if (call) for (const [id, p] of call.peers) peers.set(id, { state: p.state, speaking: p.speaking });
    return { ...S, peers };
  },
  onChange(fn) { fns.add(fn); return () => { fns.delete(fn); }; },
  join,
  leave,
  // Both work while idle too; a join applies them. Deafen = every remote <audio> muted + my mic off (like Discord).
  setMute(on) { S.mute = !!on; applyMic(); if (call && call.tracked) trackMe(call); emit(); },
  setDeaf(on) {
    S.deaf = !!on;
    applyMic();
    if (call) for (const a of call.els) a.muted = S.deaf;
    if (call && call.tracked) trackMe(call);
    emit();
  },
  channelGone(id) { if (call && call.id === Number(id)) leave('gone'); },
  _inject(o = {}) { Object.assign(injected, o); },
  // Test-only (e2e): each peer's RTCPeerConnection state and inbound audio bytes.
  async _debug() {
    const peers = [];
    for (const p of call ? [...call.peers.values()] : []) {
      let bytesIn = 0;
      try {
        (await p.pc.getStats()).forEach((r) => { if (r && r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'audio') bytesIn += r.bytesReceived || 0; });
      } catch { /* no stats: 0 */ }
      peers.push({ id: p.id, state: p.pc.connectionState, bytesIn });
    }
    return { peers };
  },
};
