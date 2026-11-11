// Voice engine (fp/chat/voice.js) with fakes: fake RTCPeerConnection, fake Realtime channels (the test plays the server
// and the other people), the fake session registry (voice_join / voice_leave / voice_sessions + its Realtime events),
// fake mic, fake <audio> elements. Each test gets a fresh engine (a new module instance).
// Also data.js voiceChannel() against a fake supabase client.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.location = { search: '', hostname: 'test.invalid' };
const data = await import('../fp/chat/data.js');
const { KICK_MS, VOICE_MAX, ICE_WAIT_MS, rosterFromPresence, sessionRow } = await import('../fp/chat/voicelogic.js');

const ME = '55555555-0000-4000-8000-000000000005';
const A = '11111111-0000-4000-8000-000000000001'; // smaller than me: A offers to me
const B = '22222222-0000-4000-8000-000000000002'; // smaller than me
const C = '99999999-0000-4000-8000-000000000009'; // bigger than me: I offer to C
const T0 = Date.parse('2026-11-10T12:00:00.000Z');
const RETRACK_MS = 300;
const iso = (dt) => new Date(T0 + dt).toISOString();
const meta = (ch, dt, sess, extra = {}) => ({ presence_ref: 'ref-' + sess, ch, mute: false, deaf: false, sess, at: iso(dt), ...extra });
const flush = async (k = 40) => { for (let i = 0; i < k; i++) await new Promise((r) => setImmediate(r)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const chatError = (code, detail) => Object.assign(new Error(code), { name: 'ChatError', code, ...(detail ? { detail } : {}) });

function micStream(label = 'mic') {
  const ls = new Map();
  const t = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; },
    addEventListener(type, fn) { ls.set(type, [...(ls.get(type) || []), fn]); },
    removeEventListener(type, fn) { ls.set(type, (ls.get(type) || []).filter((f) => f !== fn)); },
    fire(type) { for (const fn of ls.get(type) || []) fn({ type }); } };
  return { label, getTracks: () => [t], getAudioTracks: () => [t], track: t };
}

function makeEnv({ me = ME, kicks = [] } = {}) {
  const env = { clock: T0, channels: [], pcs: [], streams: [], gum: [], body: [], listeners: new Map(), server: [], presence: {}, mine: null, micError: null,
    refuse: () => false, pcN: 0, log: [], kicks, regRows: new Map(), joinError: null, joins: [], leaves: [], lists: { kicks: 0, sessions: 0 }, holdJoin: null };
  const presenceChannels = () => env.channels.filter((c) => c.topic === 'chat:voice');
  env.pres = () => presenceChannels().filter((c) => !c.stopped).at(-1);
  env.sig = (id) => env.channels.filter((c) => c.topic === 'chat:voice:' + id).at(-1);
  env.state = () => {
    const s = { ...env.presence };
    if (env.mine) s[me] = [...(s[me] || []), { presence_ref: 'mine', ...env.mine }];
    return s;
  };
  env.sync = () => { for (const c of env.channels) if (!c.stopped && c.topic === 'chat:voice' && c.opts.onSync) c.opts.onSync(); };
  env.signal = (id, event, payload) => env.sig(id).opts.onBroadcast(event, payload);
  env.sent = (id, event, to) => env.sig(id).sent.filter((s) => s.event === event && (to === undefined || s.payload.to === to));
  env.offerPc = (to, id = 7) => { const o = env.sent(id, 'offer', to)[0]; return o && env.pcs.find((p) => p.offerSdps.includes(o.payload.sdp)); };
  env.answerPc = (sdp) => env.pcs.find((p) => p.remotes.includes(sdp));
  // the server feed (data.subscribeServer handlers the engine registered)
  env.feed = (kind, payload) => { for (const h of env.server) if (!h.off && h[kind]) h[kind](payload); };
  env.kick = (row) => env.feed('voiceKick', row);
  env.session = (type, row) => env.feed('voiceSession', { type, row });
  // the registry as the database has it, as the engine reads it (for rosterFromPresence in tests)
  env.reg = () => new Map([...env.regRows.values()].map((r) => sessionRow(r)).filter(Boolean).map((s) => [s.id, s]));
  // someone really in voice: a registry row (voice_join) + their presence meta; event = the Realtime INSERT/UPDATE
  env.put = (id, ch, dt, sess, extra = {}, { event = true } = {}) => {
    env.presence[id] = [meta(ch, dt, sess, extra)];
    const row = { user_id: id, sess, channel_id: ch, at: iso(dt) };
    env.regRows.set(id, row);
    if (event) env.session('update', { ...row });
  };
  // { id: [ch, dt, sess] } before the engine starts (it lists the registry when it starts)
  env.room = (spec) => { for (const [id, [ch, dt, sess]] of Object.entries(spec)) env.put(id, ch, dt, sess, {}, { event: false }); };
  env.unput = (id) => { delete env.presence[id]; if (env.regRows.delete(id)) env.session('delete', { user_id: id }); };

  class FakePC {
    constructor(cfg) {
      Object.assign(this, { cfg, n: ++env.pcN, tracks: [], offers: [], offerSdps: [], remotes: [], restarts: 0, closed: false, stats: [], ls: new Map(),
        signalingState: 'stable', connectionState: 'new', iceGatheringState: 'complete', localDescription: null, remoteDescription: null });
      env.pcs.push(this);
    }
    addTrack(t, s) { this.tracks.push([t, s]); }
    async createOffer(o) { this.offers.push(o || {}); const sdp = 'offer ' + this.n + '.' + this.offers.length; this.offerSdps.push(sdp); return { type: 'offer', sdp }; }
    async createAnswer() { return { type: 'answer', sdp: 'answer ' + this.n + ' to ' + this.remoteDescription.sdp }; }
    async setLocalDescription(d) {
      this.localDescription = d;
      this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
      queueMicrotask(() => this.fire('icecandidate', { candidate: null })); // this round's end-of-candidates
    }
    async setRemoteDescription(d) { this.remoteDescription = d; this.remotes.push(d.sdp); this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
    restartIce() { this.restarts++; }
    close() { this.closed = true; this.connectionState = 'closed'; this.signalingState = 'closed'; }
    async getStats() { return new Map(this.stats.map((r, i) => [String(i), r])); }
    addEventListener(t, fn) { this.ls.set(t, [...(this.ls.get(t) || []), fn]); }
    removeEventListener(t, fn) { this.ls.set(t, (this.ls.get(t) || []).filter((f) => f !== fn)); }
    fire(t, e) { for (const fn of this.ls.get(t) || []) fn(e); }
    set(state) { this.connectionState = state; if (this.onconnectionstatechange) this.onconnectionstatechange(); }
  }
  env.FakePC = FakePC;

  function channelFactory(topic, opts = {}) {
    const ch = { topic, opts, sent: [], tracks: [], untracks: 0, stopped: false };
    ch.track = (p) => { ch.tracks.push(p); if (topic === 'chat:voice') { env.log.push('track ' + p.ch); env.mine = p; queueMicrotask(env.sync); } return Promise.resolve('ok'); };
    ch.untrack = () => { ch.untracks++; if (topic === 'chat:voice') { env.mine = null; queueMicrotask(env.sync); } return Promise.resolve('ok'); };
    ch.send = (event, payload) => { ch.sent.push({ event, payload }); return Promise.resolve('ok'); };
    ch.presenceState = () => (topic === 'chat:voice' ? env.state() : {});
    ch.stop = () => { ch.stopped = true; if (topic === 'chat:voice') env.mine = null; };
    env.channels.push(ch);
    env.log.push('channel ' + topic);
    queueMicrotask(() => {
      if (ch.stopped) return;
      if (env.refuse(topic)) { if (opts.onStatus) opts.onStatus('unauthorized'); return; }
      if (opts.onStatus) opts.onStatus('SUBSCRIBED');
      if (opts.onSync) opts.onSync();
    });
    return ch;
  }

  const doc = {
    createElement(tag) {
      return { tag, attrs: {}, muted: false, srcObject: null, plays: 0, autoplay: false, playsInline: false,
        setAttribute(k, v) { this.attrs[k] = v; }, play() { this.plays++; return Promise.resolve(); },
        remove() { const i = env.body.indexOf(this); if (i >= 0) env.body.splice(i, 1); } };
    },
    body: { appendChild(el) { env.body.push(el); return el; } },
  };
  const win = {
    addEventListener(t, fn) { env.listeners.set(t, [...(env.listeners.get(t) || []), fn]); },
    removeEventListener(t, fn) { env.listeners.set(t, (env.listeners.get(t) || []).filter((f) => f !== fn)); },
  };
  env.deps = {
    myId: () => me,
    now: () => env.clock,
    listVoiceKicks: async () => { env.lists.kicks++; return env.kicks; },
    listVoiceSessions: async () => { env.lists.sessions++; return [...env.regRows.values()].map((r) => ({ ...r })); },
    // voice_join: my row, server time (at least 1 ms after the row it replaces), then the Realtime event
    voiceJoin: async (channel, sess) => {
      env.joins.push({ channel, sess });
      env.log.push('voice_join ' + channel);
      if (env.holdJoin) await env.holdJoin;
      if (env.joinError) throw env.joinError;
      const prev = env.regRows.get(me);
      const at = Math.max(env.clock, prev ? Date.parse(prev.at) + 1 : -Infinity);
      const row = { user_id: me, sess, channel_id: channel, at: new Date(at).toISOString() };
      env.regRows.set(me, row);
      queueMicrotask(() => env.session(prev ? 'update' : 'insert', { ...row }));
      return row.at;
    },
    voiceLeave: async (sess) => {
      env.leaves.push(sess);
      const r = env.regRows.get(me);
      if (r && r.sess === sess) { env.regRows.delete(me); queueMicrotask(() => env.session('delete', { user_id: me })); }
    },
    subscribeServer: (h) => { env.server.push(h); return () => { h.off = true; }; },
    getUserMedia: (c) => {
      env.gum.push(c);
      env.log.push('getUserMedia');
      if (env.micError) return Promise.reject(env.micError);
      const s = micStream();
      env.streams.push(s);
      return Promise.resolve(s);
    },
    RTCPeerConnection: FakePC,
    AudioContext: null,
    channelFactory,
    document: doc,
    window: win,
  };
  return env;
}

let n = 0;
const engines = [];
async function fresh(opts) {
  const { voice } = await import('../fp/chat/voice.js?t=' + (++n));
  const env = makeEnv(opts);
  voice._inject(env.deps);
  engines.push(voice);
  return { voice, env };
}
// a test that fails half-way still hangs up, so no peer timer keeps the run alive
afterEach(() => { for (const v of engines.splice(0)) v.leave(); });
const peerStates = (voice) => Object.fromEntries([...voice.state().peers].map(([id, p]) => [id, p.state]));

test('join registers the session (voice_join) before tracking presence {ch, mute, deaf, sess, at}; offers only to bigger ids', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  const changes = [];
  const off = voice.onChange(() => changes.push(voice.state().status));
  const stop = voice.watch();
  await flush();
  assert.deepEqual(voice.roster().get(7).map((p) => p.id), [A, C]);
  const p = voice.join({ id: 7, name: 'lounge' });
  // the mic is asked synchronously inside join (Safari: still inside the click), before any channel of the join
  assert.equal(env.gum.length, 1);
  assert.deepEqual(env.gum[0], { audio: true });
  assert.equal(voice.state().status, 'joining');
  await p;
  await flush();
  // the server's record (voice_join) comes before my presence
  assert.deepEqual(env.log, ['channel chat:voice', 'getUserMedia', 'channel chat:voice:7', 'voice_join 7', 'track 7']);
  // one chat:voice channel, shared by watch and join, keyed by my id
  assert.equal(env.channels.filter((c) => c.topic === 'chat:voice').length, 1);
  const pres = env.pres();
  assert.equal(pres.opts.presenceKey, ME);
  const tr = pres.tracks.at(-1);
  assert.deepEqual(Object.keys(tr).sort(), ['at', 'ch', 'deaf', 'mute', 'sess']);
  assert.equal(tr.ch, 7);
  assert.equal(tr.mute, false);
  assert.equal(tr.deaf, false);
  assert.equal(typeof tr.sess, 'string');
  assert.match(tr.sess, /^[A-Za-z0-9_-]{8,64}$/); // what voice_join accepts
  assert.deepEqual(env.joins, [{ channel: 7, sess: tr.sess }]);
  assert.equal(tr.at, env.regRows.get(ME).at); // the registry's time
  // the signaling channel has no presence
  assert.ok(!env.sig(7).opts.presenceKey);
  const offers = env.sent(7, 'offer');
  assert.equal(offers.length, 1);
  assert.deepEqual(Object.keys(offers[0].payload).sort(), ['from', 'sdp', 'sess', 'to']);
  assert.equal(offers[0].payload.to, C);
  assert.equal(offers[0].payload.from, ME);
  assert.equal(offers[0].payload.sess, tr.sess);
  const pcC = env.offerPc(C);
  assert.equal(offers[0].payload.sdp, pcC.localDescription.sdp);
  assert.deepEqual(pcC.cfg.iceServers.flatMap((s) => [].concat(s.urls)), ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']);
  assert.equal(pcC.tracks.length, 1);
  assert.equal(pcC.tracks[0][0], env.streams[0].track);
  const s = voice.state();
  assert.equal(s.status, 'connected');
  assert.equal(s.channelId, 7);
  assert.equal(s.error, null);
  assert.deepEqual(peerStates(voice), { [A]: 'connecting', [C]: 'connecting' });
  assert.equal(s.peers.get(C).speaking, false);
  assert.equal(s.meSpeaking, false);
  // the roster now has me too (registered + present)
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A, C, ME]);
  pcC.set('connected');
  assert.equal(voice.state().peers.get(C).state, 'connected');
  assert.ok(changes.includes('joining') && changes.includes('connected'));
  // join again to the same channel: nothing new
  await voice.join({ id: 7, name: 'lounge' });
  assert.equal(env.gum.length, 1);
  assert.equal(env.joins.length, 1);
  voice.leave();
  stop();
  off();
});

test('voice_join refused: kicked / banned or timed out / channel gone / anything else -> the matching error, nothing tracked', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  const cases = [[chatError('not_allowed', 'kicked'), 'kicked'], [chatError('banned'), 'blocked'], [chatError('muted', iso(60000)), 'blocked'],
    [chatError('not_allowed'), 'blocked'], [chatError('not_allowed', 'channel'), 'gone'], [chatError('slow_down'), 'lost'], [chatError('network'), 'lost'],
    [new TypeError('Failed to fetch'), 'lost']];
  for (const [e, want] of cases) {
    env.joinError = e;
    await voice.join({ id: 7, name: 'lounge' });
    await flush();
    const s = voice.state();
    assert.deepEqual([s.status, s.error], ['idle', want], e.code || e.message);
    assert.equal(env.pres() && env.pres().tracks.length || 0, 0, 'never tracked');
    assert.equal(env.sig(7).stopped, true);
    assert.equal(env.streams.at(-1).track.stopped, true);
    assert.equal(env.pcs.length, 0);
  }
  assert.deepEqual(env.leaves, [], 'nothing registered, nothing to take back');
  env.joinError = null;
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  voice.leave();
});

test('a voice_join that answers after the call ended is taken back (voice_leave)', async () => {
  const { voice, env } = await fresh();
  let release;
  env.holdJoin = new Promise((r) => { release = r; });
  const p = voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(env.joins.length, 1);
  voice.leave(); // hang up while voice_join is still on its way
  assert.equal(voice.state().status, 'idle');
  release();
  await p;
  await flush();
  assert.deepEqual(env.leaves, [env.joins[0].sess]);
  assert.equal(env.regRows.has(ME), false);
  assert.equal(env.pres(), undefined); // nobody watches: the presence channel is closed
  assert.equal(env.channels.every((c) => c.stopped), true);
});

test('answer path: an offer addressed to me is answered once', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const mySess = env.pres().tracks.at(-1).sess;
  assert.equal(env.sent(7, 'offer').length, 0); // A is smaller: A makes the offer
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' });
  await flush();
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' }); // the same offer again
  await flush();
  const answers = env.sent(7, 'answer');
  assert.equal(answers.length, 1);
  const pcA = env.answerPc('offerA');
  assert.deepEqual(pcA.remoteDescription, { type: 'offer', sdp: 'offerA' });
  assert.deepEqual(answers[0].payload, { from: ME, to: A, sdp: pcA.localDescription.sdp, sess: mySess });
  assert.equal(pcA.tracks.length, 1); // my mic goes to them too
  // an offer that comes before presence + the registry show its sender is kept, and answered when they show up
  env.signal(7, 'offer', { from: B, to: ME, sdp: 'offerB', sess: 'sb' });
  await flush();
  assert.equal(env.sent(7, 'answer').length, 1);
  env.put(B, 7, -100, 'sb');
  env.sync();
  await flush();
  assert.equal(env.sent(7, 'answer', B).length, 1);
  // an offer from an older session of A is not applied to this connection
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA-old', sess: 'old' });
  await flush();
  assert.equal(env.sent(7, 'answer', A).length, 1);
  assert.equal(env.answerPc('offerA-old'), undefined);
  // a new offer on the same connection (A restarting ICE) is answered too (after this round's end-of-candidates)
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA-restart', sess: 'sa' });
  await flush();
  assert.equal(env.sent(7, 'answer', A).length, 2);
  assert.equal(env.answerPc('offerA-restart'), pcA);
  voice.leave();
});

test('ignores signals addressed to someone else', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pcC = env.offerPc(C);
  env.signal(7, 'offer', { from: A, to: C, sdp: 'x', sess: 'sa' });
  env.signal(7, 'answer', { from: C, to: A, sdp: 'y', sess: 'sc' });
  env.signal(7, 'offer', { from: C, to: ME, sdp: 'z', sess: 'sc' }); // C is bigger: I make the offers there, never C
  for (const junk of [null, undefined, 'text', 42, {}, { from: 5 }, { from: ME, to: ME, sdp: 'self', sess: 'x' }]) {
    env.signal(7, 'offer', junk);
    env.signal(7, 'answer', junk);
    env.signal(7, 'bye', junk);
  }
  env.signal(7, 'offer', { from: A, to: ME, sdp: 7, sess: 'sa' }); // an sdp that is not text
  env.signal(7, 'answer', { from: C, to: ME, sdp: null, sess: 'sc' });
  await flush();
  assert.equal(env.sent(7, 'answer').length, 0);
  assert.equal(pcC.remoteDescription, null);
  assert.deepEqual(peerStates(voice), { [A]: 'connecting', [C]: 'connecting' });
  // an answer from the wrong session of C is not applied either; the right one is
  env.signal(7, 'answer', { from: C, to: ME, sdp: 'y-old', sess: 'old' });
  await flush();
  assert.equal(pcC.remoteDescription, null);
  env.signal(7, 'answer', { from: C, to: ME, sdp: 'y', sess: 'sc' });
  await flush();
  assert.deepEqual(pcC.remoteDescription, { type: 'answer', sdp: 'y' });
  voice.leave();
});

test('ice failure marks the peer unreachable and retries once', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pcC = env.offerPc(C);
  // I am C's offerer: the first failure re-offers once with an ICE restart
  pcC.set('failed');
  await flush();
  assert.equal(env.sent(7, 'offer', C).length, 2);
  assert.equal(pcC.restarts, 1);
  assert.deepEqual(pcC.offers[1], { iceRestart: true });
  assert.equal(env.sent(7, 'offer', C)[1].payload.sdp, pcC.localDescription.sdp);
  assert.equal(voice.state().peers.get(C).state, 'connecting');
  // the second failure: unreachable, no more offers
  pcC.set('failed');
  await flush();
  assert.equal(voice.state().peers.get(C).state, 'unreachable');
  pcC.set('failed');
  await flush();
  assert.equal(env.sent(7, 'offer', C).length, 2);
  assert.equal(pcC.restarts, 1);
  // A is the offerer for our pair: I never re-offer to A, I wait for A's restart
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' });
  await flush();
  const pcA = env.answerPc('offerA');
  pcA.set('failed');
  await flush();
  assert.equal(env.sent(7, 'offer', A).length, 0);
  assert.equal(voice.state().peers.get(A).state, 'connecting');
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA-restart', sess: 'sa' });
  await flush();
  assert.equal(env.sent(7, 'answer', A).length, 2);
  pcA.set('failed');
  await flush();
  assert.equal(voice.state().peers.get(A).state, 'unreachable');
  // unreachable lasts until they leave or rejoin: a new session of C is a new connection
  env.put(C, 7, 1000, 'sc2');
  env.sync();
  await flush();
  assert.equal(pcC.closed, true);
  assert.equal(env.sent(7, 'offer', C).length, 3);
  assert.notEqual(env.offerPc(C), undefined);
  assert.equal(voice.state().peers.get(C).state, 'connecting');
  const pcC2 = env.pcs.find((p) => p.offerSdps.includes(env.sent(7, 'offer', C)[2].payload.sdp));
  assert.notEqual(pcC2, pcC);
  pcC2.set('connected');
  assert.equal(voice.state().peers.get(C).state, 'connected');
  voice.leave();
});

test('mic denied → error mic, idle; retry works', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  env.micError = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  let s = voice.state();
  assert.equal(s.status, 'idle');
  assert.equal(s.error, 'mic');
  assert.equal(s.channelId, null);
  assert.equal(s.peers.size, 0);
  assert.equal(env.sig(7), undefined);           // never got as far as signaling
  assert.equal(env.joins.length, 0);             // nor the registry
  assert.equal(env.pcs.length, 0);
  assert.equal(env.body.length, 0);              // the audio elements made for the join are gone
  assert.equal(env.channels.every((c) => c.stopped), true); // nobody watches: the presence channel is closed again
  // retry: the mic is allowed now
  env.micError = null;
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  s = voice.state();
  assert.equal(s.status, 'connected');
  assert.equal(s.error, null);
  assert.equal(env.sent(7, 'offer', C).length, 1);
  voice.leave();
});

test('NotFoundError → nomic', async () => {
  const { voice, env } = await fresh();
  env.micError = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'nomic');
  // no mediaDevices at all (an insecure page) is "no microphone" too
  const { voice: v2, env: e2 } = await fresh();
  const { getUserMedia, ...rest } = e2.deps;
  v2._inject({ ...rest, getUserMedia: undefined });
  const saved = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  try {
    await v2.join({ id: 7, name: 'lounge' });
    await flush();
    assert.equal(v2.state().error, 'nomic');
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true, writable: true });
  }
  // a mic another app holds (NotReadableError) is the permission line, the error stays readable
  env.micError = Object.assign(new Error('Could not start audio source'), { name: 'NotReadableError' });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().error, 'mic');
});

test('the mic track ends mid-call (unplugged, Bluetooth switch) → lost (M8)', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const mySess = env.pres().tracks.at(-1).sess;
  env.streams[0].track.fire('ended');
  const s = voice.state();
  assert.deepEqual([s.status, s.error], ['idle', 'lost']);
  assert.equal(env.sig(7).sent.at(-1).event, 'bye');
  assert.deepEqual(env.leaves, [mySess]);
  assert.equal(env.offerPc(C).closed, true);
  // a track of an older call ending later does nothing to the next one
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  env.streams[0].track.fire('ended');
  assert.equal(voice.state().status, 'connected');
  voice.leave();
});

test('kick of me leaves with kicked; kick of a peer drops that peer and refuses it until until', async () => {
  const { voice, env } = await fresh({ kicks: [{ target: ME, channel_id: 9, until: iso(30000) }] });
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  const stop = voice.watch();
  await flush();
  // the kick listed at start refuses channel 9 (and the mic it asked for is stopped again)
  await voice.join({ id: 9, name: 'gaming' });
  await flush();
  assert.equal(voice.state().error, 'kicked');
  assert.equal(voice.state().status, 'idle');
  assert.equal(env.streams.at(-1).track.stopped, true);
  assert.equal(env.sig(9), undefined);
  // channel 7 is fine
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  const pcC = env.offerPc(C);
  // a mod disconnects C: C is dropped and refused while the kick lasts, even though C still shows in presence
  env.kick({ target: C, channel_id: 7, until: iso(60000) });
  await flush();
  assert.equal(pcC.closed, true);
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  env.sync();
  await flush();
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  // a kick in another channel changes nothing here
  env.kick({ target: A, channel_id: 8, until: iso(60000) });
  await flush();
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  // after until, C is a peer again
  env.clock += KICK_MS + 1;
  env.sync();
  await flush();
  assert.deepEqual([...voice.state().peers.keys()].sort(), [A, C]);
  assert.equal(env.sent(7, 'offer', C).length, 2);
  // a mod disconnects me
  const mySess = env.pres().tracks.at(-1).sess;
  const sig = env.sig(7);
  env.kick({ target: ME, channel_id: 7, until: new Date(env.clock + 60000).toISOString() });
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'kicked');
  assert.equal(sig.stopped, true);
  assert.equal(sig.sent.at(-1).event, 'bye');
  assert.equal(sig.sent.at(-1).payload.sess, mySess);
  assert.equal(env.streams.at(-1).track.stopped, true);
  assert.ok(env.leaves.includes(mySess));
  // and can't come back until until
  const joins = env.joins.length;
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().error, 'kicked');
  assert.equal(env.sig(7), sig); // no new signaling channel
  assert.equal(env.joins.length, joins);
  env.clock += KICK_MS + 1;
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  voice.leave();
  stop();
  assert.equal(env.server.every((h) => h.off), true); // nothing uses the engine: its server feed is gone
});

test('the feed going live again re-lists kicks and the registry (missed while it was down) (M3)', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const lists = { ...env.lists };
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  // while the feed was down: B joined (no event reached us) and a mod kicked A
  env.put(B, 7, -100, 'sb', {}, { event: false });
  env.kicks = [{ target: A, channel_id: 7, until: iso(60000) }];
  env.sync();
  await flush();
  assert.deepEqual([...voice.state().peers.keys()], [A], 'nothing known yet');
  env.feed('status', 'reconnecting');
  env.feed('status', 'live');
  await flush();
  assert.equal(env.lists.kicks, lists.kicks + 1);
  assert.equal(env.lists.sessions, lists.sessions + 1);
  assert.deepEqual([...voice.state().peers.keys()], [B]); // A dropped (kicked), B connected (registered)
  // a kick of me missed while down: out as soon as the list says so
  env.kicks = [{ target: ME, channel_id: 7, until: iso(60000) }];
  env.feed('status', 'live');
  await flush();
  assert.deepEqual([voice.state().status, voice.state().error], ['idle', 'kicked']);
});

test('registry events that come while the list loads are replayed onto it', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'] });
  let release;
  const gate = new Promise((r) => { release = r; });
  const list = env.deps.listVoiceSessions;
  voice._inject({ listVoiceSessions: async () => { const rows = await list(); await gate; return rows; } });
  const stop = voice.watch();
  await flush();
  // the list (taken now: A only) is slow; meanwhile C joins and A leaves (Realtime events)
  env.put(C, 7, -1000, 'sc');
  env.unput(A);
  release();
  await flush();
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [C]);
  stop();
});

test('bans and time-outs on the feed end voice even with the chat app paused (I2)', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pcC = env.offerPc(C);
  // C is timed out: dropped like a kick, and not reconnected while it lasts
  env.feed('profile', { id: C, banned: false, muted_until: iso(10 * 60000) });
  assert.equal(pcC.closed, true);
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  env.sync();
  await flush();
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  // other profile changes of A (a new status) change nothing
  env.feed('profile', { id: A, banned: false, muted_until: null, status_text: 'hi' });
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  // the time-out lifted early: C is a peer again
  env.feed('profile', { id: C, banned: false, muted_until: null });
  await flush();
  assert.deepEqual([...voice.state().peers.keys()].sort(), [A, C]);
  // a time-out that is already over is no time-out
  env.feed('profile', { id: C, banned: false, muted_until: iso(-1000) });
  assert.deepEqual([...voice.state().peers.keys()].sort(), [A, C]);
  // A is banned: dropped
  env.feed('profile', { id: A, banned: true, muted_until: null });
  assert.deepEqual([...voice.state().peers.keys()], [C]);
  // I am banned (the overlay is closed, the app hears nothing): out with blocked
  const sig = env.sig(7);
  env.feed('profile', { id: ME, banned: true, muted_until: null });
  assert.deepEqual([voice.state().status, voice.state().error], ['idle', 'blocked']);
  assert.equal(sig.sent.at(-1).event, 'bye');
  // timed out while joining (before the registry answered): blocked as well
  env.feed('profile', { id: ME, banned: false, muted_until: null });
  const { voice: v2, env: e2 } = await fresh();
  let release;
  e2.holdJoin = new Promise((r) => { release = r; });
  const p = v2.join({ id: 7, name: 'lounge' });
  await flush();
  e2.feed('profile', { id: ME, banned: false, muted_until: iso(60000) });
  assert.deepEqual([v2.state().status, v2.state().error], ['idle', 'blocked']);
  release();
  await p;
  await flush();
  assert.equal(e2.regRows.has(ME), false, 'the late registration is taken back');
});

test('my registry row deleted (a kick, a ban, the channel) while in voice: registered again, or out with the reason', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const mySess = env.pres().tracks.at(-1).sess;
  // a stale delete (an earlier session of mine): registered again with the same session, still connected
  env.session('delete', { user_id: ME });
  await flush();
  assert.equal(env.joins.length, 2);
  assert.equal(env.joins[1].sess, mySess);
  assert.equal(voice.state().status, 'connected');
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [C, ME]);
  // the server deleted it because the channel went: voice_join refuses (channel) -> gone
  env.regRows.delete(ME);
  env.joinError = chatError('not_allowed', 'channel');
  env.session('delete', { user_id: ME });
  await flush();
  assert.deepEqual([voice.state().status, voice.state().error], ['idle', 'gone']);
});

test('channelGone leaves', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  voice.channelGone(8);
  assert.equal(voice.state().status, 'connected');
  voice.channelGone(7);
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'gone');
  assert.equal(env.sig(7).stopped, true);
  assert.equal(env.offerPc(C).closed, true);
  // while idle it does nothing
  voice.channelGone(7);
  assert.equal(voice.state().error, 'gone');
});

test('superseded session (a newer registry row of mine) leaves with moved; presence metas alone never move me', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const mySess = env.pres().tracks.at(-1).sess;
  // an older session of mine (a tab that has not left yet) does not move me
  env.presence[ME] = [meta(8, -9000, 'older')];
  env.sync();
  await flush();
  assert.equal(voice.state().status, 'connected');
  // a meta under my id with a far-future at (the old lock-out trick: anyone can track any key) does not either
  env.presence[ME] = [meta(8, 10 * 365 * 86400e3, 'zzzzzzzzzz-forged')];
  env.sync();
  await flush();
  assert.equal(voice.state().status, 'connected');
  // nor a late registry event of an older session of mine
  env.session('update', { user_id: ME, sess: 'older', channel_id: 8, at: iso(-9000) });
  await flush();
  assert.equal(voice.state().status, 'connected');
  // a newer registry row does: my other tab joined
  env.put(ME, 8, 5000, 'tab2');
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'moved');
  const sig = env.sig(7);
  assert.equal(sig.sent.at(-1).event, 'bye');
  assert.equal(sig.sent.at(-1).payload.sess, mySess);
  assert.equal(env.channels.find((c) => c.topic === 'chat:voice').untracks, 1);
  assert.equal(env.streams[0].track.stopped, true);
  assert.deepEqual(env.leaves, [mySess]); // voice_leave only removes my own session, never the newer tab's
  assert.equal(env.regRows.get(ME).sess, 'tab2');
});

test('deafen mutes remote audio and self; presence follows the flips once they settle (M6)', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'] });
  // set while idle, applied on join
  voice.setMute(true);
  assert.equal(voice.state().mute, true);
  assert.equal(voice.state().status, 'idle');
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pres = env.pres();
  const mic = env.streams[0].track;
  assert.equal(pres.tracks.at(-1).mute, true);
  assert.equal(mic.enabled, false);
  const first = pres.tracks.at(-1);
  const n0 = pres.tracks.length;
  voice.setMute(false);
  assert.equal(mic.enabled, true); // the mic at once
  assert.equal(pres.tracks.length, n0); // presence a moment later
  await wait(RETRACK_MS + 50);
  assert.deepEqual(pres.tracks.at(-1), { ...first, mute: false }); // same session, same at
  // flips in a row: one re-track, with the last state
  const n1 = pres.tracks.length;
  for (let i = 0; i < 5; i++) { voice.setMute(true); await wait(20); voice.setMute(false); await wait(20); }
  voice.setMute(true);
  await wait(RETRACK_MS + 50);
  assert.equal(pres.tracks.length, n1 + 1);
  assert.equal(pres.tracks.at(-1).mute, true);
  voice.setMute(false);
  await wait(RETRACK_MS + 50);
  // A's audio plays in one of the hidden <audio autoplay playsinline> elements made during join
  assert.equal(env.body.length, VOICE_MAX - 1);
  assert.ok(env.body.every((el) => el.tag === 'audio' && el.autoplay && el.playsInline && 'playsinline' in el.attrs && 'autoplay' in el.attrs));
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' });
  await flush();
  const pcA = env.answerPc('offerA');
  const remote = micStream('A');
  pcA.ontrack({ track: remote.track, streams: [remote] });
  const el = env.body.find((x) => x.srcObject === remote);
  assert.ok(el);
  assert.equal(el.muted, false);
  // deafen: their audio and my mic both off
  voice.setDeaf(true);
  assert.equal(el.muted, true);
  assert.equal(mic.enabled, false);
  await wait(RETRACK_MS + 50);
  assert.equal(pres.tracks.at(-1).deaf, true);
  assert.equal(voice.state().deaf, true);
  // undeafen: back to how it was (not muted)
  voice.setDeaf(false);
  assert.equal(el.muted, false);
  assert.equal(mic.enabled, true);
  await wait(RETRACK_MS + 50);
  assert.equal(pres.tracks.at(-1).deaf, false);
  // mute + deafen, then undeafen: still muted (like Discord)
  voice.setMute(true);
  voice.setDeaf(true);
  voice.setDeaf(false);
  assert.equal(mic.enabled, false);
  voice.setMute(false);
  // leaving before the re-track fires: nothing is tracked after the leave
  const n2 = pres.tracks.length;
  voice.leave();
  await wait(RETRACK_MS + 50);
  assert.equal(pres.tracks.length, n2);
  // deafened while idle: the next join starts deaf and new audio starts muted
  voice.setDeaf(true);
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(env.pres().tracks.at(-1).deaf, true);
  assert.equal(env.streams[1].track.enabled, false);
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA2', sess: 'sa' });
  await flush();
  const remote2 = micStream('A2');
  env.answerPc('offerA2').ontrack({ track: remote2.track, streams: [remote2] });
  assert.equal(env.body.find((x) => x.srcObject === remote2).muted, true);
  voice.leave();
  voice.setDeaf(false);
});

test('leave sends bye, voice_leave, closes peers, stops tracks, untracks', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'], [C]: [7, -3000, 'sc'] });
  const stop = voice.watch();
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' });
  await flush();
  const mySess = env.pres().tracks.at(-1).sess;
  const sig = env.sig(7);
  assert.equal(env.pcs.length, 2);
  assert.equal(env.listeners.get('pagehide').length, 1);
  voice.leave();
  assert.deepEqual(sig.sent.at(-1), { event: 'bye', payload: { from: ME, to: null, sdp: null, sess: mySess } });
  assert.deepEqual(env.leaves, [mySess]);
  assert.equal(env.pcs.every((p) => p.closed), true);
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.pres().untracks, 1);
  assert.equal(sig.stopped, true);
  assert.equal(env.body.length, 0);
  assert.equal(env.listeners.get('pagehide').length, 0);
  const s = voice.state();
  assert.deepEqual({ status: s.status, channelId: s.channelId, error: s.error, peers: s.peers.size }, { status: 'idle', channelId: null, error: null, peers: 0 });
  // still watching: the presence channel stays, the roster without me
  assert.equal(env.pres().stopped, false);
  await flush();
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A, C]);
  assert.equal(env.regRows.has(ME), false);
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  // a bye is only a hint (anyone can send one): C still registered and present -> C stays (no permanent exclusion)
  const pcC = env.offerPc(C);
  env.signal(7, 'bye', { from: C, to: null, sdp: null, sess: 'other' });
  env.signal(7, 'bye', { from: C, to: null, sdp: null, sess: 'sc' }); // forged: C never said it
  await flush();
  assert.equal(voice.state().peers.has(C), true);
  assert.equal(pcC.closed, false);
  env.sync();
  await flush();
  assert.equal(voice.state().peers.has(C), true);
  // C really leaves: presence first, then the bye; the bye's re-check drops C at once
  delete env.presence[C];
  env.signal(7, 'bye', { from: C, to: null, sdp: null, sess: 'sc' });
  assert.equal(voice.state().peers.has(C), false);
  assert.equal(pcC.closed, true);
  // and C coming back (a new join) is a new connection, never refused because of the old bye
  env.put(C, 7, 2000, 'sc2');
  env.sync();
  await flush();
  assert.equal(voice.state().peers.has(C), true);
  // pagehide hangs up the same way (bye + voice_leave)
  const sig2 = env.sig(7);
  const mySess2 = env.pres().tracks.at(-1).sess;
  for (const fn of env.listeners.get('pagehide')) fn();
  assert.equal(sig2.sent.at(-1).event, 'bye');
  assert.equal(env.leaves.at(-1), mySess2);
  assert.equal(voice.state().status, 'idle');
  stop();
  assert.equal(env.channels.every((c) => c.stopped), true);
  // leaving while idle is harmless, and never shows an error
  voice.leave('blocked');
  assert.equal(voice.state().error, null);
});

test('9th joiner gets full; capacity counts verified people only', async () => {
  const { voice, env } = await fresh();
  const others = Array.from({ length: VOICE_MAX }, (_, i) => '0000000' + i + '-0000-4000-8000-00000000000' + i);
  // eight presence entries nobody registered (forged keys): they are not people, I fit
  env.presence = Object.fromEntries(others.map((id, i) => [id, [meta(7, -10000 + i, 's' + i)]]));
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  assert.equal(voice.state().peers.size, 0);
  voice.leave();
  // eight real ones: full
  env.room(Object.fromEntries(others.map((id, i) => [id, [7, -10000 + i, 's' + i]])));
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'full');
  assert.equal(env.sig(7).stopped, true);
  assert.equal(env.streams.at(-1).track.stopped, true);
  // 7 others: I fit
  env.unput(others[7]);
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  assert.equal(voice.state().peers.size, VOICE_MAX - 1);
  // a race: someone who registered before me (earlier at) shows up after; 9 in the room and I am the newest, so I leave
  env.put(others[7], 7, -1, 's7');
  env.sync();
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'full');
});

test('a forged presence key (another user\'s id) is not in the roster; their real session is', async () => {
  const { voice, env } = await fresh();
  const SEAN = '00000000-0000-4000-8000-0000000000aa';
  env.room({ [A]: [7, -5000, 'sa'] });
  // someone tracks presence with Sean's id as the key, claiming channel 7 (Sean is not in voice)
  env.presence[SEAN] = [meta(7, -9000, 'forged')];
  const stop = voice.watch();
  await flush();
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A]);
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.deepEqual([...voice.state().peers.keys()], [A]); // no connection to the ghost
  // Sean really joins channel 8: he shows there, the forged channel-7 claim still counts for nothing
  env.regRows.set(SEAN, { user_id: SEAN, sess: 'real', channel_id: 8, at: iso(100) });
  env.presence[SEAN] = [meta(7, -9000, 'forged'), meta(8, 100, 'real')];
  env.session('insert', { ...env.regRows.get(SEAN) });
  await flush();
  assert.deepEqual(voice.roster().get(8).map((x) => x.id), [SEAN]);
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A, ME]);
  assert.deepEqual([...voice.state().peers.keys()], [A]);
  voice.leave();
  stop();
});

test('watch shares one chat:voice channel, ref-counted; onChange on roster changes', async () => {
  const { voice, env } = await fresh();
  env.room({ [A]: [7, -5000, 'sa'] });
  let calls = 0;
  const off = voice.onChange(() => { calls++; });
  const s1 = voice.watch();
  const s2 = voice.watch();
  await flush();
  assert.equal(env.channels.length, 1);
  assert.equal(env.server.length, 1);
  assert.ok(calls > 0);
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A]);
  const before = calls;
  env.put(C, 7, 10, 'sc');
  env.sync();
  assert.ok(calls > before);
  assert.deepEqual(voice.roster().get(7).map((x) => x.id), [A, C]);
  s1();
  s1(); // twice is still one
  assert.equal(env.channels[0].stopped, false);
  s2();
  assert.equal(env.channels[0].stopped, true);
  assert.equal(env.server[0].off, true);
  assert.equal(voice.roster().size, 0);
  off();
  const after = calls;
  voice.watch()();
  await flush();
  assert.equal(calls, after); // unsubscribed
  // a refused presence (banned or timed out) leaves the roster empty and a join refused
  env.refuse = (t) => t === 'chat:voice';
  const s3 = voice.watch();
  await flush();
  assert.equal(voice.roster().size, 0);
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().error, 'blocked');
  assert.equal(env.streams.at(-1).track.stopped, true);
  s3();
});

test('refused signaling → blocked; presence refused while connected → blocked; switching channel', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  env.refuse = (t) => t === 'chat:voice:7';
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().error, 'blocked');
  assert.equal(env.streams[0].track.stopped, true);
  assert.equal(env.channels.every((c) => c.stopped), true);
  assert.equal(env.joins.length, 0);
  env.refuse = () => false;
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(voice.state().status, 'connected');
  // switching: leave 7 (bye, voice_leave), then join 8, on the same presence channel
  const pres = env.pres();
  const sig7 = env.sig(7);
  const sess7 = pres.tracks.at(-1).sess;
  await voice.join({ id: 8, name: 'gaming' });
  await flush();
  assert.equal(sig7.stopped, true);
  assert.equal(sig7.sent.at(-1).event, 'bye');
  assert.ok(env.leaves.includes(sess7));
  assert.equal(env.streams[1].track.stopped, true);
  assert.equal(voice.state().channelId, 8);
  assert.equal(voice.state().status, 'connected');
  assert.equal(env.pres(), pres);
  assert.equal(pres.tracks.at(-1).ch, 8);
  assert.deepEqual(env.regRows.get(ME).channel_id, 8);
  assert.equal(voice.state().peers.size, 0); // C is in 7
  assert.deepEqual(voice.roster().get(8).map((x) => x.id), [ME]);
  // the presence channel refuses us later (timed out): out of voice
  pres.opts.onStatus('unauthorized');
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'blocked');
});

test('a presence rejoin registers a new session first, then tracks it (everyone reconnects to the new one)', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pres = env.pres();
  const first = pres.tracks.at(-1);
  const pcC = env.offerPc(C);
  env.clock += 5000;
  pres.opts.onStatus('CHANNEL_ERROR');
  pres.opts.onStatus('SUBSCRIBED');
  assert.equal(pres.untracks, 1); // the old session's payload is not tracked again
  await flush();
  const again = pres.tracks.at(-1);
  assert.notEqual(again.sess, first.sess);
  assert.equal(env.joins.at(-1).sess, again.sess);
  assert.equal(env.regRows.get(ME).sess, again.sess);
  assert.equal(again.at, env.regRows.get(ME).at);
  assert.equal(again.ch, 7);
  assert.equal(pcC.closed, true);
  assert.equal(env.sent(7, 'offer', C).length, 2);
  assert.equal(env.sent(7, 'offer', C)[1].payload.sess, again.sess);
  assert.equal(voice.state().status, 'connected');
  // a rejoin the registry refuses (timed out meanwhile): out with that reason
  env.joinError = chatError('muted', iso(60000));
  pres.opts.onStatus('CHANNEL_ERROR');
  pres.opts.onStatus('SUBSCRIBED');
  await flush();
  assert.deepEqual([voice.state().status, voice.state().error], ['idle', 'blocked']);
});

test('a presence rejoin while my old meta lingers: I stay, and everyone picks my new session', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pres = env.pres();
  // after a network drop the server can keep the old socket's meta (old sess) for tens of seconds
  for (let i = 0; i < 20; i++) {
    const old = pres.tracks.at(-1);
    pres.opts.onStatus('CHANNEL_ERROR');
    pres.opts.onStatus('SUBSCRIBED');
    await flush();
    const cur = pres.tracks.at(-1);
    assert.notEqual(cur.sess, old.sess);
    env.presence[ME] = [{ presence_ref: 'stale-' + i, ...old }];
    env.sync();
    await flush();
    assert.equal(voice.state().status, 'connected', 'rejoin ' + i + ': not moved by my own stale meta');
    assert.equal(voice.state().error, null);
    // another client's view of the same presence + registry: my new session, so my offers and answers are not stashed
    assert.equal(rosterFromPresence(env.state(), env.reg()).get(7).find((x) => x.id === ME).sess, cur.sess, 'rejoin ' + i);
    assert.equal(voice.roster().get(7).find((x) => x.id === ME).sess, cur.sess);
    assert.equal(env.sent(7, 'offer', C).at(-1).payload.sess, cur.sess);
  }
  // a genuinely later join (another tab: a newer registry row) still supersedes, whatever its sess
  env.put(ME, 8, 5000, '0');
  await flush();
  assert.equal(voice.state().status, 'idle');
  assert.equal(voice.state().error, 'moved');
});

test('a connection that stayed up 10 s gets a fresh ICE-restart retry (R6)', async () => {
  const { voice, env } = await fresh();
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pcC = env.offerPc(C);
  const offers = () => env.sent(7, 'offer', C).length;
  pcC.set('failed'); // 1st failure: restart
  await flush();
  assert.equal(offers(), 2);
  pcC.set('connected');
  env.clock += 10000; // up for 10 s
  pcC.set('failed'); // a new blip: a new connection's retry, not unreachable
  await flush();
  assert.equal(offers(), 3);
  assert.equal(pcC.restarts, 2);
  assert.equal(voice.state().peers.get(C).state, 'connecting');
  // up only 3 s (then disconnected) before failing: that counts as the same trouble, so unreachable
  pcC.set('connected');
  env.clock += 3000;
  pcC.set('disconnected');
  env.clock += 20000;
  pcC.set('failed');
  await flush();
  assert.equal(voice.state().peers.get(C).state, 'unreachable');
  assert.equal(offers(), 3);
  voice.leave();
});

function fakeAudio(env, levels) {
  return class FakeAC {
    constructor() { this.destination = {}; this.closed = false; this.state = 'running'; this.currentTime = 0; this.resumes = 0; this.analysers = []; env.ac = this; }
    resume() { this.resumes++; if (this.state !== 'closed') this.state = 'running'; return Promise.resolve(); }
    close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createMediaStreamSource(stream) { return { stream, connect(an) { an.stream = stream; }, disconnect() {} }; }
    createAnalyser() {
      const an = { fftSize: 32, connect() {}, disconnect() {}, getFloatTimeDomainData(buf) { buf.fill(levels.get(this.stream) || 0); } };
      this.analysers.push(an);
      return an;
    }
  };
}

test('speaking: my level and each peer\'s level (2048-sample windows every 50 ms), held 250 ms; a suspended context is woken (M1)', async () => {
  const { voice, env } = await fresh();
  const levels = new Map(); // stream -> level
  voice._inject({ AudioContext: fakeAudio(env, levels) });
  env.room({ [A]: [7, -5000, 'sa'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  env.signal(7, 'offer', { from: A, to: ME, sdp: 'offerA', sess: 'sa' });
  await flush();
  const remote = micStream('A');
  env.answerPc('offerA').ontrack({ track: remote.track, streams: [remote] });
  assert.ok(env.ac.analysers.length >= 2 && env.ac.analysers.every((an) => an.fftSize === 2048));
  levels.set(env.streams[0], 0.3);
  levels.set(remote, 0.2);
  await wait(120);
  assert.equal(voice.state().meSpeaking, true);
  assert.equal(voice.state().peers.get(A).speaking, true);
  // muted: I am never "speaking"
  voice.setMute(true);
  await wait(120);
  assert.equal(voice.state().meSpeaking, false);
  voice.setMute(false);
  levels.set(remote, 0);
  env.clock += 1000; // past the hold
  await wait(120);
  assert.equal(voice.state().peers.get(A).speaking, false);
  // iOS 'interrupted' / a suspended context: the next tick resumes it
  const r0 = env.ac.resumes;
  env.ac.state = 'interrupted';
  await wait(120);
  assert.ok(env.ac.resumes > r0);
  assert.equal(env.ac.state, 'running');
  voice.leave();
  assert.equal(env.ac.closed, true);
});

test('_debug: inbound audio bytes and level per peer, my level, the AudioContext state and time', async () => {
  const { voice, env } = await fresh();
  const levels = new Map();
  voice._inject({ AudioContext: fakeAudio(env, levels) });
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  const pcC = env.offerPc(C);
  pcC.connectionState = 'connected';
  pcC.stats = [
    { type: 'inbound-rtp', kind: 'audio', bytesReceived: 1200 },
    { type: 'inbound-rtp', kind: 'audio', bytesReceived: 34 },
    { type: 'inbound-rtp', kind: 'video', bytesReceived: 99999 },
    { type: 'outbound-rtp', kind: 'audio', bytesSent: 5000 },
  ];
  const remote = micStream('C');
  pcC.ontrack({ track: remote.track, streams: [remote] });
  levels.set(remote, 0.25);
  levels.set(env.streams[0], 0.5);
  env.ac.currentTime = 12.5;
  const d = await voice._debug();
  assert.deepEqual(d.peers.map((p) => ({ ...p, level: Math.round(p.level * 100) / 100 })), [{ id: C, state: 'connected', bytesIn: 1234, level: 0.25 }]);
  assert.equal(Math.round(d.meLevel * 100) / 100, 0.5);
  assert.deepEqual(d.ac, { state: 'running', time: 12.5 });
  pcC.stats = [];
  assert.equal((await voice._debug()).peers[0].bytesIn, 0);
  voice.leave();
  assert.deepEqual(await voice._debug(), { peers: [], meLevel: 0, ac: null });
});

test('the ICE wait sends after gathering completes, or after 2 s at most', async () => {
  assert.equal(ICE_WAIT_MS, 2000);
  const { voice, env } = await fresh();
  // gathering that finishes a moment later: the offer goes out with the gathered description
  const Base = env.deps.RTCPeerConnection;
  class SlowPC extends Base {
    constructor(cfg) { super(cfg); this.iceGatheringState = 'gathering'; this.fns = new Set(); }
    addEventListener(t, fn) { if (t === 'icegatheringstatechange') this.fns.add(fn); }
    removeEventListener(t, fn) { if (t === 'icegatheringstatechange') this.fns.delete(fn); }
    async setLocalDescription(d) { await super.setLocalDescription(d); setTimeout(() => { this.localDescription = { ...d, sdp: d.sdp + ' +candidates' }; this.iceGatheringState = 'complete'; for (const f of this.fns) f(); }, 30); }
  }
  voice._inject({ RTCPeerConnection: SlowPC });
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(env.sent(7, 'offer', C).length, 0); // still gathering
  await wait(60);
  assert.equal(env.sent(7, 'offer', C).length, 1);
  assert.match(env.sent(7, 'offer', C)[0].payload.sdp, / \+candidates$/);
  assert.equal(env.pcs[0].fns.size, 0); // its listener is gone
  voice.leave();
});

test('an ICE restart waits for this round\'s end-of-candidates even while iceGatheringState still reads complete (M2)', async () => {
  const { voice, env } = await fresh();
  const Base = env.deps.RTCPeerConnection;
  // a browser that never leaves 'complete' through the restart: only the null icecandidate tells this round is over
  class StalePC extends Base {
    async setLocalDescription(d) {
      this.localDescription = d;
      this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
      const restart = this.offers.length > 1;
      const end = () => {
        if (restart) this.localDescription = { ...d, sdp: d.sdp + ' +new-candidates' };
        this.fire('icecandidate', { candidate: { candidate: 'x' } }); // a candidate is not the end
        this.fire('icecandidate', { candidate: null });
      };
      if (restart) setTimeout(end, 40); else queueMicrotask(end); // (the first round is over long before the restart)
    }
  }
  voice._inject({ RTCPeerConnection: StalePC });
  env.room({ [C]: [7, -3000, 'sc'] });
  await voice.join({ id: 7, name: 'lounge' });
  await flush();
  assert.equal(env.sent(7, 'offer', C).length, 1); // the first round: 'complete' is true, sent at once
  const pcC = env.offerPc(C);
  pcC.set('failed');
  await flush();
  assert.equal(pcC.restarts, 1);
  assert.equal(pcC.iceGatheringState, 'complete');
  assert.equal(env.sent(7, 'offer', C).length, 1, 'not sent on the stale complete');
  await wait(80);
  assert.equal(env.sent(7, 'offer', C).length, 2);
  assert.match(env.sent(7, 'offer', C)[1].payload.sdp, / \+new-candidates$/);
  assert.equal((pcC.ls.get('icecandidate') || []).length, 0); // its listeners are gone
  // no end-of-candidates at all: sent after ICE_WAIT_MS anyway
  class MutePC extends Base { async setLocalDescription(d) { this.localDescription = d; this.signalingState = 'have-local-offer'; } }
  voice._inject({ RTCPeerConnection: MutePC });
  env.put(C, 7, 1000, 'sc2');
  env.sync();
  await flush();
  const pc2 = env.pcs.at(-1);
  assert.equal(env.sent(7, 'offer', C).length, 3, 'a first round with complete: at once');
  pc2.set('failed');
  await flush();
  assert.equal(env.sent(7, 'offer', C).length, 3);
  await wait(ICE_WAIT_MS + 100);
  assert.equal(env.sent(7, 'offer', C).length, 4);
  voice.leave();
});

test('data.js voiceChannel: private channel, re-tracks after a rejoin, buffers sends while joining (M4), stops when unauthorized', async () => {
  const chans = [];
  const removed = [];
  const client = {
    channel(topic, opts) {
      const ch = { topic, opts, binds: [], tracked: [], untracked: 0, sent: [], cb: null, state: { u: [{ ch: 1 }] },
        on(type, filter, fn) { this.binds.push({ type, filter, fn }); return this; },
        subscribe(fn) { this.cb = fn; return this; },
        track(p) { this.tracked.push(p); return Promise.resolve('ok'); },
        untrack() { this.untracked++; return Promise.resolve('ok'); },
        send(m) { this.sent.push(m); return Promise.resolve('ok'); },
        presenceState() { return this.state; } };
      chans.push(ch);
      return ch;
    },
    removeChannel(ch) { removed.push(ch); return Promise.resolve('ok'); },
  };
  data._inject({ client, me: () => ({ id: ME }) });
  assert.equal(data.myId(), ME);
  // presence (chat:voice)
  const statuses = [];
  let syncs = 0;
  const pres = data.voiceChannel('chat:voice', { presenceKey: ME, onSync: () => { syncs++; }, onStatus: (s) => statuses.push(s) });
  await flush();
  const ch = chans[0];
  assert.equal(ch.topic, 'chat:voice');
  assert.deepEqual(ch.opts, { config: { private: true, broadcast: { self: false }, presence: { key: ME } } });
  pres.track({ ch: 7 }); // before SUBSCRIBED: kept, sent once subscribed
  assert.equal(ch.tracked.length, 0);
  ch.cb('SUBSCRIBED');
  assert.deepEqual(ch.tracked, [{ ch: 7 }]);
  assert.deepEqual(statuses, ['SUBSCRIBED']);
  ch.binds.find((b) => b.type === 'presence' && b.filter.event === 'sync').fn();
  assert.equal(syncs, 1);
  assert.deepEqual(pres.presenceState(), { u: [{ ch: 1 }] });
  pres.track({ ch: 8 });
  assert.deepEqual(ch.tracked.at(-1), { ch: 8 });
  // errored and rejoined by supabase-js: tracked again
  ch.cb('CHANNEL_ERROR', new Error('socket closed'));
  ch.cb('SUBSCRIBED');
  assert.deepEqual(ch.tracked.at(-1), { ch: 8 });
  assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED']);
  pres.untrack();
  assert.equal(ch.untracked, 1);
  ch.cb('CHANNEL_ERROR');
  ch.cb('SUBSCRIBED');
  assert.equal(ch.tracked.length, 3); // untracked: not tracked again
  pres.stop();
  assert.deepEqual(removed, [ch]);
  assert.deepEqual(pres.presenceState(), {});
  pres.stop();
  assert.equal(removed.length, 1);
  // signaling (chat:voice:7): broadcast only
  const got = [];
  const st2 = [];
  let sentAtStatus = -1;
  const sig = data.voiceChannel('chat:voice:7', { onBroadcast: (ev, p) => got.push([ev, p]), onStatus: (s) => { st2.push(s); if (s === 'SUBSCRIBED' && sentAtStatus < 0) sentAtStatus = chans[1].sent.length; } });
  await flush();
  const ch2 = chans[1];
  assert.deepEqual(ch2.opts, { config: { private: true, broadcast: { self: false }, presence: { key: '' } } });
  assert.equal(ch2.binds.some((b) => b.type === 'presence'), false);
  assert.equal(await sig.send('offer', { a: 1 }), 'queued'); // not subscribed yet: kept
  assert.equal(ch2.sent.length, 0);
  ch2.cb('SUBSCRIBED');
  assert.deepEqual(ch2.sent, [{ type: 'broadcast', event: 'offer', payload: { a: 1 } }]); // sent on SUBSCRIBED
  assert.equal(sentAtStatus, 1, 'before onStatus hears of it');
  await sig.send('answer', { a: 2 });
  assert.deepEqual(ch2.sent.at(-1), { type: 'broadcast', event: 'answer', payload: { a: 2 } });
  const b = ch2.binds.find((x) => x.type === 'broadcast');
  assert.equal(b.filter.event, '*');
  b.fn({ type: 'broadcast', event: 'answer', payload: { z: 2 } });
  assert.deepEqual(got, [['answer', { z: 2 }]]);
  // rejoining: at most the newest 20 kept, in order, sent once back
  ch2.cb('CHANNEL_ERROR', new Error('socket closed'));
  for (let i = 0; i < 25; i++) await sig.send('offer', { i });
  assert.equal(ch2.sent.length, 2);
  ch2.cb('SUBSCRIBED');
  assert.deepEqual(ch2.sent.slice(2).map((m) => m.payload.i), Array.from({ length: 20 }, (_, i) => i + 5));
  // refused: stop for good, say so; nothing kept
  ch2.cb('CHANNEL_ERROR', new Error('socket closed'));
  await sig.send('offer', { late: true });
  ch2.cb('CHANNEL_ERROR', new Error('Unauthorized: You do not have permissions to read from this Channel topic: chat:voice:7'));
  assert.deepEqual(st2, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED', 'CHANNEL_ERROR', 'unauthorized']);
  assert.equal(removed.at(-1), ch2);
  const nSent = ch2.sent.length;
  assert.equal(await sig.send('bye', {}), 'not_joined');
  ch2.cb('SUBSCRIBED'); // (a stopped channel ignores its old callback)
  assert.equal(ch2.sent.length, nSent);
  b.fn({ type: 'broadcast', event: 'offer', payload: {} });
  assert.equal(got.length, 1); // nothing after stop
  // the same topic again waits for the old channel to be gone, then opens a new one
  const sig2 = data.voiceChannel('chat:voice:7', {});
  await flush();
  assert.equal(chans.length, 3);
  sig2.stop();
  // a rejoin where the caller tracks a newer payload (voice.js: a new session): the stale one is not sent again
  let renew = false;
  const p2 = data.voiceChannel('chat:voice', { presenceKey: ME, onStatus: (s) => { if (s === 'SUBSCRIBED' && renew) p2.track({ ch: 7, sess: 'new' }); } });
  await flush();
  const ch4 = chans[3];
  assert.equal(ch4.topic, 'chat:voice');
  p2.track({ ch: 7, sess: 'old' });
  ch4.cb('SUBSCRIBED');
  renew = true;
  ch4.cb('CHANNEL_ERROR', new Error('socket closed'));
  ch4.cb('SUBSCRIBED');
  assert.deepEqual(ch4.tracked, [{ ch: 7, sess: 'old' }, { ch: 7, sess: 'new' }]);
  p2.stop();
});

test('data.js: voiceJoin / voiceLeave / listVoiceSessions and the voiceSession feed', async () => {
  const calls = [];
  const binds = [];
  const ok = (d) => Promise.resolve({ data: d, error: null });
  const client = {
    rpc(fn, args) { calls.push(['rpc', fn, args]); return fn === 'voice_join' ? ok('2026-11-10T12:00:00.123456+00:00') : ok(null); },
    from(t) { const q = { select(cols) { calls.push(['select', t, cols]); return ok([{ user_id: A, sess: 's', channel_id: 7, at: iso(0) }]); } }; return q; },
    channel(name) { const ch = { name, on(type, filter, fn) { binds.push({ type, filter, fn }); return this; }, subscribe() { return this; } }; return ch; },
    removeChannel() { return Promise.resolve('ok'); },
  };
  data._inject({ client, me: () => ({ id: ME }) });
  assert.equal(await data.voiceJoin(7, 'abc'), '2026-11-10T12:00:00.123456+00:00');
  await data.voiceLeave('abc');
  assert.deepEqual(await data.listVoiceSessions(), [{ user_id: A, sess: 's', channel_id: 7, at: iso(0) }]);
  assert.deepEqual(calls, [['rpc', 'voice_join', { channel: 7, sess: 'abc' }], ['rpc', 'voice_leave', { sess: 'abc' }], ['select', 'voice_sessions', 'user_id, sess, channel_id, at']]);
  // refusals come back as ChatErrors the engine maps (not_allowed + detail 'kicked')
  client.rpc = () => Promise.resolve({ data: null, error: { code: 'P0001', message: 'not_allowed', details: 'kicked' } });
  await assert.rejects(data.voiceJoin(7, 'abc'), (e) => e.code === 'not_allowed' && e.detail === 'kicked');
  client.rpc = () => Promise.resolve({ data: null, error: { code: 'P0001', message: 'muted', details: iso(60000) } });
  await assert.rejects(data.voiceJoin(7, 'abc'), (e) => e.code === 'muted');
  // the server feed: insert / update rows, delete with only the key
  const evs = [];
  const off = data.subscribeServer({ voiceSession: (e) => evs.push(e) });
  const bind = binds.find((x) => x.type === 'postgres_changes' && x.filter.table === 'voice_sessions');
  assert.equal(bind.filter.event, '*');
  bind.fn({ eventType: 'INSERT', new: { user_id: A, sess: 's', channel_id: 7, at: iso(0) } });
  bind.fn({ eventType: 'DELETE', old: { user_id: A } });
  assert.deepEqual(evs, [{ type: 'insert', row: { user_id: A, sess: 's', channel_id: 7, at: iso(0) } }, { type: 'delete', row: { user_id: A } }]);
  off();
});
