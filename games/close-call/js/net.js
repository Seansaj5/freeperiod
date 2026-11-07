// Multiplayer client: joins a room, keeps a shared clock, sends our car 10x a second and
// smooths the other drivers between the server's snapshots.
export class Net {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.offset = 0; // serverTime = performance.now() + offset
    this.bestRtt = Infinity;
    this.players = new Map(); // id -> { id, name, car, color, snaps: [], sc, pd, m }
    this.on = {}; // join, leave, ev, close
    this.sentAt = 0;
    this.rtt = 0;
  }

  serverNow() { return performance.now() + this.offset; }

  /** Opens the socket and resolves with the welcome message. hello: { name, car, color, mode, code } */
  connect(hello, timeoutMs = 75000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } try { this.ws && this.ws.close(); } catch {} };
      const timer = setTimeout(() => fail('The multiplayer server did not answer. Try again in a minute.'), timeoutMs);
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch { clearTimeout(timer); return fail('Could not reach the multiplayer server.'); }
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...hello }));
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        clearInterval(this.pinger);
        if (!done) fail('Could not reach the multiplayer server.');
        else this.on.close && this.on.close();
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'err') { clearTimeout(timer); return fail(m.msg); }
        if (m.t === 'welcome') {
          clearTimeout(timer);
          done = true;
          this.id = m.id; this.room = m;
          this.offset = m.now - performance.now();
          for (const p of m.players) this.addPlayer(p);
          this.ping();
          this.pinger = setInterval(() => this.ping(), 2000);
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
        // trust the quickest round trips most; drift slowly toward newer ones
        if (rtt < this.bestRtt * 1.3) {
          const est = m.now + rtt / 2 - now;
          this.offset = this.bestRtt === Infinity ? est : this.offset * 0.7 + est * 0.3;
          this.bestRtt = Math.min(this.bestRtt * 1.05, rtt);
        } else this.bestRtt *= 1.05;
        break;
      }
      case 'join': {
        const known = this.players.get(m.p.id);
        if (known) { Object.assign(known, m.p); this.on.changed && this.on.changed(known); }
        else { this.addPlayer(m.p); this.on.join && this.on.join(this.players.get(m.p.id)); }
        break;
      }
      case 'leave': {
        const p = this.players.get(m.id);
        this.players.delete(m.id);
        if (p && this.on.leave) this.on.leave(p);
        break;
      }
      case 'snap':
        for (const [id, ts, s, d, y, v, b, sc, pd, mult] of m.p) {
          if (id === this.id) continue;
          const p = this.players.get(id);
          if (!p) continue;
          const last = p.snaps[p.snaps.length - 1];
          if (last && last.ts === ts) continue;
          p.snaps.push({ ts, s, d, y, v, b });
          if (p.snaps.length > 30) p.snaps.shift();
          p.sc = sc; p.pd = pd; p.m = mult;
        }
        break;
      case 'ev': {
        const p = this.players.get(m.id);
        if (p && this.on.ev) this.on.ev(p, m.k, m.p);
        break;
      }
    }
  }

  addPlayer(p) { this.players.set(p.id, { ...p, snaps: [], sc: 0, pd: 0, m: 1 }); }

  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  /** Called every frame; actually sends 10 times a second. */
  sendState(car, scorer) {
    const now = performance.now();
    if (now - this.sentAt < 100) return;
    this.sentAt = now;
    this.send({ t: 'st', s: +car.s.toFixed(2), d: +car.d.toFixed(3), y: +car.yaw.toFixed(4), v: +car.v.toFixed(2), b: car.boosting ? 1 : 0, sc: scorer.run, pd: Math.round(scorer.pending), m: scorer.mult });
  }

  /** Where player p was at server time ts (interpolated, or extrapolated a little past the last snapshot). */
  sample(p, ts, out) {
    const sn = p.snaps;
    if (!sn.length) return null;
    let i = sn.length - 1;
    while (i > 0 && sn[i - 1].ts > ts) i--;
    const b = sn[i], a = sn[i - 1];
    if (a && ts >= a.ts && ts <= b.ts) {
      const f = (ts - a.ts) / Math.max(1, b.ts - a.ts);
      out.s = a.s + (b.s - a.s) * f; out.d = a.d + (b.d - a.d) * f; out.y = a.y + (b.y - a.y) * f; out.v = a.v + (b.v - a.v) * f; out.b = b.b;
    } else {
      const late = Math.min(0.5, Math.max(0, (ts - b.ts) / 1000));
      out.s = b.s + b.v * late; out.d = b.d; out.y = b.y; out.v = b.v; out.b = b.b;
    }
    return out;
  }

  close() { clearInterval(this.pinger); this.on = {}; try { this.ws && this.ws.close(); } catch {} this.ws = null; }
}
