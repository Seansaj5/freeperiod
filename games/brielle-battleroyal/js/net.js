// Two ways to play with the same interface:
//   LocalSession runs the shared Match right here (solo vs bots, no server needed);
//   NetSession talks to the multiplayer server and smooths everyone between its snapshots.
// Both call on.start / on.ev / on.me / on.results / on.back / on.lobby and expose latest + sample(id).
import { Match } from '../shared/match.js';

const indexSnap = (s) => { s.pm = new Map(); for (const e of s.p) s.pm.set(e[0], e); return s; };

export class LocalSession {
  constructor(opts) {
    this.online = false;
    this.on = {};
    this.opts = opts;
    this.meId = 1;
  }
  begin() {
    const o = this.opts;
    this.match = new Match({ seed: (Math.random() * 2 ** 31) >>> 0, people: [{ id: 1, name: o.name, look: o.look, own: o.own, acct: o.acct }], warmup: 6, size: o.size });
    this.latest = indexSnap({ ts: performance.now(), ...this.match.snapshot() });
    this.on.start && this.on.start({ seed: this.match.seed, full: this.match.full(), me: 1 });
    this.done = false;
  }
  serverNow() { return performance.now(); }
  update(dt) {
    const m = this.match;
    if (!m) return;
    m.update(dt);
    for (const e of m.drain()) this.on.ev && this.on.ev(e);
    this.latest = indexSnap({ ts: performance.now(), ...m.snapshot() });
    const p = m.players.get(1);
    if (p && p.dirty) { p.dirty = false; this.on.me && this.on.me(m.me(1)); }
    if (m.phase === 'over' && !this.done) { this.done = true; this.on.results && this.on.results({ list: m.results(), win: m.winner }); }
  }
  sendState(s) { this.match && this.match.state(1, s); }
  action(a) { return this.match ? this.match.action(1, a) : false; }
  sample(id, out) {
    const e = this.latest && this.latest.pm.get(id);
    if (!e) return null;
    out.x = e[1]; out.y = e[2]; out.z = e[3]; out.ry = e[4]; out.pitch = e[5]; out.f = e[6]; out.held = e[7]; out.rar = e[8]; out.hp = e[9]; out.sh = e[10];
    return out;
  }
  close() { this.match = null; this.on = {}; }
}

export class NetSession {
  constructor(url) {
    this.online = true;
    this.url = url;
    this.ws = null;
    this.offset = 0; this.bestRtt = Infinity; this.rtt = 0;
    this.snaps = []; this.latest = null; this.lobby = null;
    this.on = {};
    this.sentAt = 0;
  }
  serverNow() { return performance.now() + this.offset; }

  /** Opens the socket and resolves with the welcome. hello: { name, look, token, mode: 'quick'|'create'|'join', code } */
  connect(hello, timeoutMs = 75000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } try { this.ws && this.ws.close(); } catch { /* closed */ } };
      const timer = setTimeout(() => fail('The multiplayer server did not answer. Try again in a minute, or play solo.'), timeoutMs);
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch { clearTimeout(timer); return fail('Could not reach the multiplayer server.'); }
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...hello }));
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer); clearInterval(this.pinger);
        if (!done) fail('Could not reach the multiplayer server.');
        else this.on.close && this.on.close();
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'err') { clearTimeout(timer); if (!done) return fail(m.msg); this.on.err && this.on.err(m.msg); return; }
        if (m.t === 'welcome') {
          clearTimeout(timer); done = true;
          this.meId = m.id; this.lobby = m; this.name = m.name; this.own = !!m.own; this.acct = m.acct;
          this.offset = m.now - performance.now();
          this.ping(); this.pinger = setInterval(() => this.ping(), 2000);
          resolve(m);
          return;
        }
        this.handle(m);
      };
    });
  }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
  handle(m) {
    switch (m.t) {
      case 'pong': {
        const now = performance.now(), rtt = now - m.c;
        this.rtt = rtt;
        if (rtt < this.bestRtt * 1.3) {
          const est = m.now + rtt / 2 - now;
          this.offset = this.bestRtt === Infinity ? est : this.offset * 0.7 + est * 0.3;
          this.bestRtt = Math.min(this.bestRtt * 1.05, rtt);
        } else this.bestRtt *= 1.05;
        break;
      }
      case 'lobby': this.lobby = m; this.on.lobby && this.on.lobby(m); break;
      case 'start': this.snaps = []; this.latest = null; this.meId = m.me; this.on.start && this.on.start(m); break;
      case 'snap': indexSnap(m); this.snaps.push(m); if (this.snaps.length > 40) this.snaps.shift(); this.latest = m; break;
      case 'ev': for (const e of m.ev) this.on.ev && this.on.ev(e); break;
      case 'me': this.on.me && this.on.me(m); break;
      case 'results': this.on.results && this.on.results(m); break;
      case 'back': this.on.back && this.on.back(); break;
      case 'ann': this.on.ann && this.on.ann(m.text); break;
    }
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendState(s) {
    const now = performance.now();
    if (now - this.sentAt < 50) return;
    this.sentAt = now;
    this.send({ t: 'st', x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), ry: +s.ry.toFixed(3), p: +s.p.toFixed(3), m: s.m, c: s.c ? 1 : 0, b: s.b ? 1 : 0, s: s.s });
  }
  action(a) { this.send({ t: 'a', a }); return true; }
  start() { this.send({ t: 'start' }); }
  kick(id) { this.send({ t: 'kick', id }); }
  announce(text) { this.send({ t: 'ann', text }); }
  update() {}

  /** Where player id was ~100 ms ago (between two snapshots), so motion looks smooth. */
  sample(id, out) {
    const ts = this.serverNow() - 100, sn = this.snaps;
    if (!sn.length) return null;
    let b = null, a = null;
    for (let i = sn.length - 1; i >= 0; i--) {
      const e = sn[i].pm.get(id);
      if (!e) continue;
      if (sn[i].ts <= ts) { a = { ts: sn[i].ts, e }; break; }
      b = { ts: sn[i].ts, e };
    }
    const s = a || b;
    if (!s) return null;
    const e = s.e;
    out.f = e[6]; out.held = e[7]; out.rar = e[8]; out.hp = e[9]; out.sh = e[10]; out.pitch = e[5];
    if (a && b) {
      const f = Math.min(1, (ts - a.ts) / Math.max(1, b.ts - a.ts));
      out.x = a.e[1] + (b.e[1] - a.e[1]) * f; out.y = a.e[2] + (b.e[2] - a.e[2]) * f; out.z = a.e[3] + (b.e[3] - a.e[3]) * f;
      let d = b.e[4] - a.e[4]; d = Math.atan2(Math.sin(d), Math.cos(d)); out.ry = a.e[4] + d * f;
      out.f = b.e[6]; out.held = b.e[7]; out.rar = b.e[8];
      return out;
    }
    out.x = e[1]; out.y = e[2]; out.z = e[3]; out.ry = e[4];
    return out;
  }
  close() { clearInterval(this.pinger); this.on = {}; try { this.send({ t: 'leave' }); this.ws && this.ws.close(); } catch { /* closed */ } this.ws = null; }
}
