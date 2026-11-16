// One game of Nova Party, from the first category to the last player in orbit. The same code runs in the browser
// (solo against bots) and on the multiplayer server, so an answer is judged in exactly one place either way.
//
// How a game goes: everyone sits in a ring. A category comes up ("Name a fruit") and one player holds the nova, a
// star about to blow. Type an answer nobody has used yet and the nova passes to the next player. Its fuse is hidden
// and shared: passing does not reset it (it only tops up to a few seconds if it was nearly gone). Whoever holds it
// when it blows loses a life and a new category starts. Rarer answers score more, and a BLUE MOON answer gives a
// life back. The last player with a life left wins.
import { TIERS } from './words.js';

export const RULES = {
  MAX: 8,                    // players in a ring
  MAX_LIVES: 3,
  // fuse settings: [shortest, longest, what a pass tops it up to] in seconds
  FUSES: { chill: [16, 40, 9], normal: [10, 30, 8], chaos: [6, 18, 5] },
  INTRO: 3.4,                // "get ready" before the first category
  NEXT: 2.0,                 // a look at each new category before its fuse starts
  POP_HOLD: 2.6,             // the blast
  OVER_HOLD: 12,             // results stay up this long online
  DRY: 4,                    // fewer unused answers than this: the category is swapped out
  MAXLEN: 40,
  LADDER: 60,
};
export const BOT_NAMES = ['Cosmo', 'Luna', 'Orbit', 'Pixel', 'Ziggy', 'Nebby', 'Astro', 'Blip', 'Quasar', 'Rocket', 'Stella', 'Vega', 'Nova Jr', 'Comet', 'Gizmo', 'Zuzu'];

const clampInt = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);

export class Party {
  /** people: [{ id, name, look, own, bot, skill }] (2 to 8). settings: { lives 1-3, fuse 'chill'|'normal'|'chaos' }. */
  constructor({ people, cats, settings = {}, rand = Math.random }) {
    this.rand = rand;
    this.cats = cats;
    this.set = { lives: clampInt(settings.lives, 1, RULES.MAX_LIVES, 2), fuse: RULES.FUSES[settings.fuse] ? settings.fuse : 'normal' };
    this.players = people.slice(0, RULES.MAX).map((p) => ({
      id: p.id, name: p.name, look: p.look, own: !!p.own, bot: !!p.bot, skill: p.skill ?? 0.5,
      lives: this.set.lives, score: 0, out: false, gone: false, place: 0, finds: [0, 0, 0, 0, 0], best: null, sab: null,
    }));
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.bag = [];
    this.round = 0; this.cat = null; this.used = new Set(); this.log = [];
    this.holder = this.players[Math.floor(rand() * this.players.length)].id;
    this.phase = 'intro'; this.t = RULES.INTRO; this.fuse = 0; this.age = 0;
    this.ev = []; this.peek = new Set(); this.plan = null; this.winner = 0;
    this.deal();
  }

  alive() { return this.players.filter((p) => !p.out); }
  nextAfter(id) {
    const n = this.players.length;
    let i = this.players.findIndex((p) => p.id === id);
    for (let k = 0; k < n; k++) { i = (i + 1) % n; if (!this.players[i].out) return this.players[i].id; }
    return 0;
  }
  push(e, to) { if (to) e.to = to; this.ev.push(e); }
  /** Everything that happened since the last call. An event with `to` is for that player's eyes only. */
  drain() { const e = this.ev; this.ev = []; return e; }
  left() { return this.cat.answers.length - this.used.size; }

  /** A new category. keep: the fuse carries on (the old category ran out of answers mid-round). */
  deal(keep) {
    if (!this.bag.length) {
      this.bag = this.cats.map((_, i) => i).filter((i) => this.cats[i] !== this.cat);
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
    }
    this.cat = this.cats[this.bag.pop()];
    this.used.clear();
    this.round++;
    if (!keep) {
      const [lo, hi] = RULES.FUSES[this.set.fuse];
      this.fuse = lo + this.rand() * (hi - lo);
      this.age = 0;
    }
    this.push({ e: 'round', n: this.round, q: this.cat.q, holder: this.holder, total: this.cat.answers.length, keep: keep ? 1 : 0 });
    for (const p of this.players) if (p.sab && !p.out) { p.sab = this.decoy(); this.push({ e: 'q', q: p.sab.q }, p.id); }
    this.tell();
  }

  /** A different category whose everyday answers are all wrong for the real one. */
  decoy() {
    let pick = null;
    for (let k = 0; k < 16; k++) {
      const c = this.cats[Math.floor(this.rand() * this.cats.length)];
      if (c === this.cat) continue;
      pick = c;
      if (!c.answers.some((a) => a.tier <= 2 && this.cat.map.has(a.keys[0]))) break;
    }
    return { q: pick.q, cat: pick };
  }

  update(dt) {
    if (this.phase === 'intro') {
      this.t -= dt;
      if (this.t <= 0) { this.phase = 'play'; this.push({ e: 'go', holder: this.holder }); this.think(); this.tell(); }
    } else if (this.phase === 'play') {
      this.fuse -= dt; this.age += dt;
      if (this.fuse <= 0) this.pop(); else this.bot(dt);
    } else if (this.phase === 'pop') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.alive().length <= 1) this.finish();
        else { this.deal(); this.phase = 'intro'; this.t = RULES.NEXT; }
      }
    } else if (this.phase === 'over') this.t -= dt;
  }

  /** The holder's answer. True when it was taken. */
  answer(id, text) {
    if (this.phase !== 'play' || id !== this.holder) return false;
    const p = this.byId.get(id);
    const s = String(text ?? '').slice(0, RULES.MAXLEN).trim();
    if (!s) return false;
    const i = this.cat.find(s);
    if (i < 0) { this.push({ e: 'no', id, s, why: 'bad' }); return false; }
    const a = this.cat.answers[i];
    if (this.used.has(i)) { this.push({ e: 'no', id, s, why: 'used', a: a.name }); return false; }
    const tier = a.tier, pts = TIERS[tier].pts;
    this.used.add(i);
    p.score += pts; p.finds[tier]++;
    if (!p.best || tier > p.best.tier) p.best = { a: a.name, tier };
    let up = false;
    if (tier === TIERS.length - 1 && p.lives < RULES.MAX_LIVES) { p.lives++; up = true; }
    this.log.push({ id, a: a.name, tier });
    if (this.log.length > 60) this.log.shift();
    if (p.sab) { p.sab = null; this.push({ e: 'q', q: this.cat.q }, id); }
    const floor = RULES.FUSES[this.set.fuse][2];
    if (this.fuse < floor) this.fuse = floor;
    this.holder = this.nextAfter(id);
    this.push({ e: 'ok', id, a: a.name, tier, pts, score: p.score, lives: p.lives, up: up ? 1 : 0, next: this.holder, left: this.left() });
    if (this.left() < RULES.DRY) this.deal(true);
    this.think();
    this.tell();
    return true;
  }

  /** What the holder has typed so far, for everyone watching. */
  typing(id, s) {
    if (this.phase === 'play' && id === this.holder) this.push({ e: 'type', id, s: String(s ?? '').slice(0, RULES.MAXLEN) });
  }

  pop() {
    const p = this.byId.get(this.holder);
    this.plan = null;
    p.lives--; p.sab = null;
    const out = p.lives <= 0;
    if (out) { p.out = true; p.place = this.alive().length + 1; }
    // one answer nobody used, so the blast teaches something
    let say = null;
    for (let i = 0; i < this.cat.answers.length && !say; i++) if (!this.used.has(i)) say = this.cat.answers[i].name;
    this.phase = 'pop'; this.t = RULES.POP_HOLD;
    const next = out ? this.nextAfter(p.id) : p.id;   // whoever it blew up on starts the next category, if still in
    this.push({ e: 'pop', id: p.id, lives: p.lives, out: out ? 1 : 0, say, next });
    this.holder = next;
    this.tell();
  }

  finish() {
    const w = this.alive()[0];
    if (w) { w.place = 1; this.winner = w.id; }
    this.phase = 'over'; this.t = RULES.OVER_HOLD; this.plan = null;
    this.push({ e: 'over', win: this.winner, table: this.table() });
  }
  table() {
    return this.players.map((p) => ({ id: p.id, name: p.name, look: p.look, own: p.own ? 1 : 0, bot: p.bot ? 1 : 0, place: p.place || 1, score: p.score, finds: p.finds, best: p.best }))
      .sort((a, b) => a.place - b.place || b.score - a.score);
  }

  /** A player walked out (or lost their connection). */
  leave(id) {
    const p = this.byId.get(id);
    if (!p) return;
    this.peek.delete(id);
    if (p.out || this.phase === 'over') { p.gone = true; return; }
    p.out = true; p.gone = true; p.lives = 0; p.sab = null;
    p.place = this.alive().length + 1;
    const held = this.holder === id;
    if (held) { this.holder = this.nextAfter(id); this.plan = null; }
    this.push({ e: 'left', id, next: this.holder });
    if (this.alive().length <= 1) { this.finish(); return; }
    if (held && this.phase === 'play') this.think();
    this.tell();
  }

  // ---------- the owner's control panel ----------
  /** c: { c: 'peek', on } starts or stops the answer feed; { c: 'sab', id, on } shows that player a wrong category. */
  admin(id, c) {
    const me = this.byId.get(id);
    if (!me || !me.own || !c || this.phase === 'over') return;
    if (c.c === 'peek') {
      if (c.on) { this.peek.add(id); this.tell(id); } else this.peek.delete(id);
    } else if (c.c === 'sab') {
      const v = this.byId.get(c.id | 0);
      if (!v || v.out || v.id === id) return;
      if (c.on) { v.sab = this.decoy(); this.push({ e: 'q', q: v.sab.q }, v.id); }
      else if (v.sab) { v.sab = null; this.push({ e: 'q', q: this.cat.q }, v.id); }
      if (v.bot && this.holder === v.id && this.phase === 'play') this.think();
      this.tell();
    }
  }
  /** Sends the control panel its feed: unused answers from the rarest down, the fuse, and who is being fooled. */
  tell(only) {
    if (!this.peek.size) return;
    const ladder = [];
    for (let t = TIERS.length - 1; t >= 0 && ladder.length < RULES.LADDER; t--) {
      const names = [];
      this.cat.answers.forEach((a, i) => { if (a.tier === t && !this.used.has(i)) names.push(a.name); });
      for (let i = names.length - 1; i >= 0 && ladder.length < RULES.LADDER; i--) ladder.push([names[i], t]);
    }
    const m = { e: 'adm', ladder, fuse: +Math.max(0, this.fuse).toFixed(1), live: this.phase === 'play' ? 1 : 0, sab: this.players.filter((p) => p.sab).map((p) => [p.id, p.sab.q]) };
    for (const id of only ? [only] : this.peek) this.push({ ...m }, id);
  }

  // ---------- bots ----------
  /** Plans the holder's next attempt when the holder is a bot: what to type, how long to think, how fast to type. */
  think() {
    this.plan = null;
    const p = this.byId.get(this.holder);
    if (!p || !p.bot || this.phase !== 'play') return;
    const r = this.rand, real = !p.sab, cat = real ? this.cat : p.sab.cat;
    let text = null;
    if (real && this.used.size && r() < 0.06) {
      // now and then a bot forgets something was already said
      const said = [...this.used];
      text = this.cat.answers[said[Math.floor(r() * said.length)]].name;
    } else {
      const w = [58 - 30 * p.skill, 26, 10 + 8 * p.skill, 4 + 10 * p.skill, 1 + 5 * p.skill];
      const pool = [[], [], [], [], []];
      cat.answers.forEach((a, i) => { if (!real || !this.used.has(i)) pool[a.tier].push(a.name); });
      let tot = 0;
      for (let t = 0; t < 5; t++) if (pool[t].length) tot += w[t];
      let x = r() * tot, tier = -1;
      for (let t = 0; t < 5; t++) { if (!pool[t].length) continue; tier = t; x -= w[t]; if (x <= 0) break; }
      if (tier < 0) return;
      const list = pool[tier];
      text = list[Math.floor(r() * r() * list.length)];   // the commoner names in a tier come to mind first
    }
    // the more of the list is gone, the harder it is to think of something new
    const used = this.used.size;
    const freeze = r() < Math.min(0.55, 0.12 + used * 0.03) ? 3 + r() * 5 : 0;
    this.plan = { text: text.toLowerCase(), i: 0, wait: 1.1 + r() * 2.6 + r() * Math.min(4, used * 0.2) + freeze, per: 0.07 + r() * 0.07 };
  }
  bot(dt) {
    const pl = this.plan;
    if (!pl) return;
    pl.wait -= dt;
    while (pl.wait <= 0) {
      if (pl.i < pl.text.length) {
        pl.i++; pl.wait += pl.per;
        this.push({ e: 'type', id: this.holder, s: pl.text.slice(0, pl.i) });
      } else {
        const id = this.holder;
        this.plan = null;
        if (!this.answer(id, pl.text) && this.phase === 'play' && this.holder === id) {
          this.think();
          if (this.plan) this.plan.wait = 0.5 + this.rand() * 1.2;
        }
        return;
      }
    }
  }

  /** The whole picture for one player (id 0 = a spectator), sent when a game starts or someone drops in. */
  view(id) {
    const me = this.byId.get(id);
    return {
      phase: this.phase, round: this.round, q: me && me.sab ? me.sab.q : this.cat.q, holder: this.holder, set: this.set,
      total: this.cat.answers.length, left: this.left(), log: this.log.slice(-30),
      players: this.players.map((p) => ({ id: p.id, name: p.name, look: p.look, own: p.own ? 1 : 0, bot: p.bot ? 1 : 0, lives: p.lives, score: p.score, out: p.out ? 1 : 0 })),
    };
  }
}

/** Bots to fill a ring: n of them, with ids from firstId up. */
export function makeBots(n, firstId, rand = Math.random, taken = []) {
  const names = BOT_NAMES.filter((b) => !taken.some((t) => t.toLowerCase() === b.toLowerCase()));
  const out = [];
  for (let i = 0; i < n && names.length; i++) {
    const name = names.splice(Math.floor(rand() * names.length), 1)[0];
    out.push({ id: firstId + i, name, bot: true, skill: 0.15 + rand() * 0.7, look: { c: Math.floor(rand() * 8), top: Math.floor(rand() * 5) } });
  }
  return out;
}
