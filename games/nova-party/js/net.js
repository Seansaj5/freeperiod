// Two ways to play with the same interface:
//   LocalSession runs the shared Party right here against bots (no server needed);
//   NetSession talks to the multiplayer server, which runs the Party for the whole room.
// Both call on.lobby(m), on.start({ me, view, watch }), on.ev(e), on.back(), on.err(msg), on.close().
import { Party, RULES, makeBots } from '../shared/party.js';
import { CATS } from '../shared/cats.js';

export class LocalSession {
  /** opts: { name, look, own, bots, set: { lives, fuse } } */
  constructor(opts) {
    this.online = false; this.on = {}; this.meId = 1; this.own = !!opts.own; this.name = opts.name;
    this.o = opts; this.bots = Math.max(1, Math.min(RULES.MAX - 1, opts.bots || 3)); this.set = { lives: 2, fuse: 'normal', ...opts.set };
    this.state = 'lobby'; this.party = null; this.timer = null;
  }
  lobbyMsg() {
    const bots = Array.from({ length: this.bots }, (_, i) => ({ id: 100 + i, name: 'BOT', look: { c: (i * 3 + 1) % 8, top: i % 5 }, bot: 1 }));
    return { t: 'lobby', code: null, public: false, host: 1, state: this.state, bots: this.bots, set: this.set, startIn: null, players: [{ id: 1, name: this.name, look: this.o.look, own: this.own ? 1 : 0, acct: 0 }, ...bots] };
  }
  connect() { this.lobby = this.lobbyMsg(); return Promise.resolve(this.lobby); }
  setOpts(o) {
    if ([1, 2, 3].includes(o.lives)) this.set.lives = o.lives;
    if (RULES.FUSES[o.fuse]) this.set.fuse = o.fuse;
    if (Number.isInteger(o.bots)) this.bots = Math.max(1, Math.min(RULES.MAX - 1, o.bots));
    this.on.lobby && this.on.lobby(this.lobbyMsg());
  }
  start() {
    const people = [{ id: 1, name: this.name, look: this.o.look, own: this.own }, ...makeBots(this.bots, 2, Math.random, [this.name])];
    for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
    this.party = new Party({ people, cats: CATS, settings: this.set });
    this.party.drain();
    this.state = 'match';
    this.on.start && this.on.start({ me: 1, view: this.party.view(1) });
    let last = performance.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (!this.party) return;
      this.party.update(dt * (this.speed || 1));
      this.flush();
    }, 50);
  }
  flush() {
    if (!this.party) return;
    for (const e of this.party.drain()) { if (e.to && e.to !== 1) continue; this.on.ev && this.on.ev(e); }
  }
  answer(s) { this.party && this.party.answer(1, s); this.flush(); }
  typing(s) { this.party && this.party.typing(1, s); this.flush(); }
  admin(c) { this.party && this.party.admin(1, c); this.flush(); }
  /** Back to the setup screen (after the results, or walking out mid-game). */
  again() { clearInterval(this.timer); this.party = null; this.state = 'lobby'; this.on.lobby && this.on.lobby(this.lobbyMsg()); }
  kick() {}
  close() { clearInterval(this.timer); this.party = null; this.on = {}; }
}

export class NetSession {
  constructor(url) { this.online = true; this.url = url; this.ws = null; this.on = {}; this.lobby = null; this.sentType = 0; this.pendType = null; }
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
          this.pinger = setInterval(() => this.send({ t: 'ping', c: 0 }), 20000);   // keeps the socket (and a free server) awake
          resolve(m);
          return;
        }
        switch (m.t) {
          case 'lobby': this.lobby = m; this.on.lobby && this.on.lobby(m); break;
          case 'start': this.on.start && this.on.start(m); break;
          case 'ev': for (const ev of m.ev) this.on.ev && this.on.ev(ev); break;
          case 'back': this.on.back && this.on.back(); break;
        }
      };
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  answer(s) { this.send({ t: 'ans', s }); }
  typing(s) {
    // at most ~12 a second; the last keystroke always gets through
    const now = performance.now();
    if (now - this.sentType >= 80) { this.sentType = now; this.send({ t: 'type', s }); return; }
    this.pendType = s;
    clearTimeout(this.typeTimer);
    this.typeTimer = setTimeout(() => { this.sentType = performance.now(); this.send({ t: 'type', s: this.pendType }); }, 90);
  }
  admin(c) { this.send({ t: 'adm', ...c }); }
  start() { this.send({ t: 'start' }); }
  setOpts(o) { this.send({ t: 'set', ...o }); }
  kick(id) { this.send({ t: 'kick', id }); }
  again() {}
  close() { clearInterval(this.pinger); clearTimeout(this.typeTimer); this.on = {}; try { this.send({ t: 'leave' }); this.ws && this.ws.close(); } catch { /* closed */ } this.ws = null; }
}
