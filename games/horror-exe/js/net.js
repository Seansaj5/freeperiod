// Two ways to play a round with the same interface:
//   LocalSession runs the shared Round right here in the browser (solo vs bots, no server needed);
//   NetSession talks to the multiplayer server and smooths everyone between its snapshots.
import { Round } from '../shared/round.js';

const indexSnap = (s) => { s.pm = new Map(); for (const e of s.p) s.pm.set(e[0], e); return s; };

export class LocalSession {
  constructor(opts) {
    this.online = false;
    this.round = new Round(opts);
    this.me = opts.me;
    this.info = this.round.info();
    this.latest = indexSnap(this.round.snapshot());
    this.on = {};
  }
  serverNow() { return performance.now(); }
  update(dt) {
    this.round.update(dt);
    for (const e of this.round.drain()) this.on.ev && this.on.ev(e);
    this.latest = indexSnap(this.round.snapshot());
  }
  sendState(s) { this.round.input(this.me, s); }
  action(a) { return this.round.action(this.me, a); }
  /** The owner's admin tools in a solo game: round tools only (there's no room to kick from or announce to). */
  admin(c) { return this.round.admin(this.me, c); }
  /** Pose of anyone right now. */
  sample(id, out) {
    const e = this.round.ents.get(id);
    if (!e) return null;
    out.x = e.x; out.y = e.y; out.z = e.z; out.ry = e.ry;
    return out;
  }
  close() {}
}

export class NetSession {
  constructor(url) {
    this.online = true;
    this.url = url;
    this.ws = null;
    this.offset = 0; this.bestRtt = Infinity; this.rtt = 0;
    this.snaps = []; this.latest = null; this.info = null; this.lobby = null;
    this.on = {}; // lobby, round, ev, close, acct, ann, adm, kicked
    this.own = false; this.acct = null; this.kicked = false;
    this.sentAt = 0;
  }

  serverNow() { return performance.now() + this.offset; }

  /** Opens the socket and resolves with the welcome message. hello: { name, look, char, variant, mode, code } */
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
        if (m.t === 'err') { clearTimeout(timer); return fail(m.msg); }
        if (m.t === 'welcome') {
          clearTimeout(timer); done = true;
          this.me = m.id; this.lobby = m;
          this.offset = m.now - performance.now();
          if (m.round) this.info = m.round.info;
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
      case 'round': this.info = m.info; this.snaps = []; this.latest = null; this.on.round && this.on.round(m.info); break;
      case 'snap':
        indexSnap(m);
        this.snaps.push(m); if (this.snaps.length > 40) this.snaps.shift();
        this.latest = m;
        break;
      case 'ev': for (const e of m.ev) this.on.ev && this.on.ev(e); break;
      // the server checked our Free Period sign-in
      case 'acct': this.acct = m.username; this.own = !!m.own; this.on.acct && this.on.acct(m); break;
      case 'ann': this.on.ann && this.on.ann(m); break;
      case 'adm': this.on.adm && this.on.adm(m); break;
      case 'kicked': this.kicked = true; break;
    }
  }

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendState(s) {
    const now = performance.now();
    if (now - this.sentAt < 66) return;
    this.sentAt = now;
    this.send({ t: 'st', x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), ry: +s.ry.toFixed(3), f: s.f });
  }
  action(a) { this.send({ t: 'act', k: a.k, ok: a.ok === true }); return true; }
  pick(p) { this.send({ t: 'pick', ...p }); }
  admin(c) { this.send({ t: 'admin', ...c }); return true; }
  start() { this.send({ t: 'start' }); }
  update() {}

  /** Where player id was ~110 ms ago (between two snapshots), so motion looks smooth. */
  sample(id, out) {
    const ts = this.serverNow() - 110, sn = this.snaps;
    if (!sn.length) return null;
    let b = null, a = null;
    for (let i = sn.length - 1; i >= 0; i--) {
      const e = sn[i].pm.get(id);
      if (!e) continue;
      if (sn[i].ts <= ts) { a = { ts: sn[i].ts, e }; break; }
      b = { ts: sn[i].ts, e };
    }
    if (a && b) {
      const f = (ts - a.ts) / Math.max(1, b.ts - a.ts);
      out.x = a.e[1] + (b.e[1] - a.e[1]) * f; out.y = a.e[2] + (b.e[2] - a.e[2]) * f; out.z = a.e[3] + (b.e[3] - a.e[3]) * f;
      let d = b.e[4] - a.e[4]; d = Math.atan2(Math.sin(d), Math.cos(d)); out.ry = a.e[4] + d * f;
      return out;
    }
    const s = a || b;
    if (!s) return null;
    out.x = s.e[1]; out.y = s.e[2]; out.z = s.e[3]; out.ry = s.e[4];
    return out;
  }

  close() { clearInterval(this.pinger); this.on = {}; try { this.ws && this.ws.close(); } catch { /* closed */ } this.ws = null; }
}
