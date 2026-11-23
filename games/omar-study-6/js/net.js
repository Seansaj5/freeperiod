// Two ways to play with the same interface:
//   LocalSession runs the shared World right here (solo, no server needed);
//   NetSession talks to the online server.
// Both keep the latest picture of everyone else and smooth it between updates: sample('v', id, out).
import { World } from '../shared/world.js';

// which array slots hold x, z, heading (and y) for each kind of thing
const LAY = { p: { x: 1, y: 2, z: 3, a: 4, a2: 5 }, v: { x: 2, z: 3, a: 4, y: 11 }, n: { x: 3, z: 4, a: 5 } };

class Picture {
  constructor() { this.p = new Map(); this.v = new Map(); this.n = new Map(); this.k = []; this.g = 0; this.clock = 0; this.tm = 0; this.ts = 0; }
  put(s) {
    const ts = s.ts; this.ts = ts; this.g = s.g; this.clock = s.ck; this.tm = s.tm;
    for (const t of ['p', 'v', 'n']) {
      const m = this[t];
      for (const e of s[t]) { const r = m.get(e[0]); if (!r) m.set(e[0], { a: e, b: e, ta: ts, tb: ts, seen: ts }); else { r.a = r.b; r.ta = r.tb; r.b = e; r.tb = ts; r.seen = ts; } }
      // a full list arrives every few updates: anything missing from it is gone
      if (s.slow || t === 'p') { for (const [id, r] of m) if (r.seen !== ts) m.delete(id); } else for (const [id, r] of m) if (ts - r.seen > 3000) m.delete(id);
    }
    if (s.slow) this.k = s.k;
  }
  sample(t, id, now, out) {
    const r = this[t].get(id); if (!r) return null;
    const L = LAY[t], a = r.a, b = r.b, span = r.tb - r.ta;
    out.e = b;
    if (span <= 0 || span > 400) { out.x = b[L.x]; out.z = b[L.z]; out.a = b[L.a]; out.y = L.y ? b[L.y] : 0; if (L.a2) out.a2 = b[L.a2]; return out; }
    const f = Math.max(0, Math.min(1.3, (now - r.ta) / span));
    out.x = a[L.x] + (b[L.x] - a[L.x]) * f; out.z = a[L.z] + (b[L.z] - a[L.z]) * f;
    let d = b[L.a] - a[L.a]; d = Math.atan2(Math.sin(d), Math.cos(d)); out.a = a[L.a] + d * f;
    out.y = L.y ? a[L.y] + (b[L.y] - a[L.y]) * Math.min(1, f) : 0;
    if (L.a2) out.a2 = a[L.a2] + (b[L.a2] - a[L.a2]) * Math.min(1, f);
    return out;
  }
}

export class LocalSession {
  constructor(hello) { this.online = false; this.on = {}; this.hello = hello; this.meId = 1; this.pic = new Picture(); this.acc = 0; this.tick = 0; this.delay = 66; }
  begin() {
    this.world = new World({ seed: (Math.random() * 2 ** 31) >>> 0, density: this.hello.density });
    const h = this.hello;
    this.P = this.world.addPlayer({ id: 1, name: h.name, look: h.look, own: h.own, acct: h.acct, cash: h.cash, guns: h.guns, cars: h.cars, done: h.done });
    this.on.start && this.on.start({ id: 1, full: this.world.full(), own: h.own });
    this.step();
  }
  serverNow() { return performance.now(); }
  step() {
    const W = this.world;
    W.update(1 / 30); this.tick++;
    for (const e of W.drain(1)) this.on.ev && this.on.ev(e);
    W.flush();
    if (this.tick % 2 === 0) { const s = W.snapshot(this.P); s.ts = performance.now(); this.pic.put(s); }
    if (this.P.dirty || this.P.heat || this.P.crew || this.P.dead || this.tick % 15 === 0) { this.P.dirty = false; this.on.me && this.on.me(W.me(this.P)); }
  }
  update(dt) { if (!this.world) return; this.acc = Math.min(0.25, this.acc + dt); while (this.acc >= 1 / 30) { this.acc -= 1 / 30; this.step(); } }
  sendState(s) { this.world && this.world.state(1, s); }
  action(a) { this.world && this.world.action(1, a); }
  sample(t, id, out) { return this.pic.sample(t, id, performance.now() - this.delay, out); }
  close() { this.world = null; this.on = {}; }
}

export class NetSession {
  constructor(url) { this.online = true; this.url = url; this.ws = null; this.offset = 0; this.bestRtt = Infinity; this.rtt = 0; this.pic = new Picture(); this.on = {}; this.sentAt = 0; this.delay = 130; }
  serverNow() { return performance.now() + this.offset; }
  /** Opens the socket and resolves with the welcome. hello: { name, look, token, mode: 'quick'|'create'|'join', code, cash, guns, cars, done } */
  connect(hello, timeoutMs = 75000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } try { this.ws && this.ws.close(); } catch { /* closed */ } };
      const timer = setTimeout(() => fail('The online server did not answer. Try again in a minute, or play solo.'), timeoutMs);
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch { clearTimeout(timer); return fail('Could not reach the online server.'); }
      ws.onopen = () => ws.send(JSON.stringify({ ...hello, t: 'hello' }));
      ws.onerror = () => {};
      ws.onclose = () => { clearTimeout(timer); clearInterval(this.pinger); if (!done) fail('Could not reach the online server.'); else this.on.close && this.on.close(); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'err') { clearTimeout(timer); if (!done) return fail(m.msg); this.on.err && this.on.err(m.msg); return; }
        if (m.t === 'welcome') {
          clearTimeout(timer); done = true;
          this.meId = m.id; this.code = m.code; this.public = m.public; this.name = m.name; this.own = !!m.own;
          this.offset = m.now - performance.now();
          this.ping(); this.pinger = setInterval(() => this.ping(), 2000);
          resolve(m);
          return;
        }
        this.handle(m);
      };
    });
  }
  begin(welcome) { this.on.start && this.on.start({ id: welcome.id, full: welcome.full, own: welcome.own, code: welcome.code, name: welcome.name }); }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
  handle(m) {
    switch (m.t) {
      case 'pong': {
        const now = performance.now(), rtt = now - m.c; this.rtt = rtt;
        if (rtt < this.bestRtt * 1.3) { const est = m.now + rtt / 2 - now; this.offset = this.bestRtt === Infinity ? est : this.offset * 0.7 + est * 0.3; this.bestRtt = Math.min(this.bestRtt * 1.05, rtt); } else this.bestRtt *= 1.05;
        break;
      }
      case 'snap': this.pic.put(m); break;
      case 'ev': for (const e of m.ev) this.on.ev && this.on.ev(e); break;
      case 'me': this.on.me && this.on.me(m); break;
    }
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendState(s) { const now = performance.now(); if (now - this.sentAt < 62) return; this.sentAt = now; s.t = 'st'; this.send(s); }
  action(a) { this.send({ t: 'a', a }); }
  update() {}
  sample(t, id, out) { return this.pic.sample(t, id, this.serverNow() - this.delay, out); }
  close() { clearInterval(this.pinger); this.on = {}; try { this.send({ t: 'leave' }); this.ws && this.ws.close(); } catch { /* closed */ } this.ws = null; }
}
