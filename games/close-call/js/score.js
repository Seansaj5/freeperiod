// Near misses, combos and banking.
//   Pass a car close at speed -> points go into the combo (pending) and the multiplier climbs.
//   Keep passing to keep the combo timer alive. When it runs out the combo BANKS into your score
//   and pays cash (10 points = $1). Crash before that and the whole combo is lost.
import { clamp } from './util.js';

export const COMBO_TIME = 5;
export const TIERS = [
  { max: 0.35, name: 'INSANE', pts: 500, nitro: 0.16 },
  { max: 0.8, name: 'CLOSE', pts: 250, nitro: 0.1 },
  { max: 1.5, name: 'NEAR MISS', pts: 100, nitro: 0.06 },
];
const MIN_KMH = 80;

export class Scorer {
  constructor() { this.cashMult = 1; this.reset(); }

  reset() {
    this.run = 0; // banked this session
    this.pending = 0; // in the current combo
    this.chain = 0;
    this.mult = 1;
    this.timer = 0;
    this.bestCombo = 0;
    this.near = new Map();
    this.lastAward = { t: -9, side: 0 };
    this.time = 0;
  }

  /** Called every frame after the car moves. Pushes events ({type: 'near'|'split'|'bank'|'lost', ...}) into ev. */
  update(dt, car, traffic, n, ev) {
    this.time += dt;
    const kmh = car.v * 3.6;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const hwE = car.hwEff;
    for (let i = 0; i < n; i++) {
      const c = traffic[i];
      const rel = car.s - c.s;
      const win = car.hl + c.hl + 1.5;
      if (rel < -win - 4 || rel > win + 30) continue;
      seen.add(c.id);
      let r = this.near.get(c.id);
      if (Math.abs(rel) < win) {
        if (!r) { r = { start: rel, min: 99, side: Math.sign(c.d - car.d) }; this.near.set(c.id, r); }
        const gap = Math.abs(car.d - c.d) - (hwE + c.hw);
        if (gap < r.min) r.min = gap;
        if (car.ghost > 0) r.dead = true;
      } else if (r && rel >= win) {
        if (r.start < 0 && !r.dead && car.ghost <= 0 && kmh >= MIN_KMH) this.award(r, car, ev);
        this.near.delete(c.id);
      }
    }
    for (const id of this.near.keys()) if (!seen.has(id)) this.near.delete(id);

    // combo timer
    if (this.timer > 0) {
      const drain = kmh < 60 ? 2 : kmh > 220 ? 0.7 : 1;
      this.timer -= dt * drain;
      if (kmh > 170) this.pending += (kmh - 170) * 1.6 * dt * this.mult; // speed bonus while the combo is live
      if (this.timer <= 0) this.bank(ev);
    }
  }

  award(r, car, ev) {
    const tier = TIERS.find((t) => r.min < t.max);
    if (!tier) return;
    const kmh = car.v * 3.6;
    const speedMul = clamp(kmh / 120, 0.7, 3);
    const pts = tier.pts * speedMul * this.mult;
    this.pending += pts;
    this.chain++;
    this.mult = Math.min(8, Math.round((1 + this.chain * 0.2) * 10) / 10);
    this.timer = COMBO_TIME;
    car.nitro = Math.min(1, car.nitro + tier.nitro);
    ev.push({ type: 'near', name: tier.name, pts, side: r.side, tier: TIERS.indexOf(tier) });
    // passing cars on both sides at once
    if (this.time - this.lastAward.t < 0.35 && this.lastAward.side && this.lastAward.side !== r.side) {
      const bonus = 600 * speedMul * this.mult;
      this.pending += bonus;
      ev.push({ type: 'split', name: 'THREAD THE NEEDLE', pts: bonus });
      this.lastAward.side = 0;
    } else this.lastAward = { t: this.time, side: r.side };
  }

  bank(ev) {
    if (this.pending > 0) {
      const pts = Math.round(this.pending);
      this.run += pts;
      this.bestCombo = Math.max(this.bestCombo, pts);
      ev.push({ type: 'bank', pts, cash: Math.floor((pts / 10) * this.cashMult), chain: this.chain });
    }
    this.pending = 0; this.chain = 0; this.mult = 1; this.timer = 0;
  }

  lose(ev, reason) {
    if (this.pending > 0) ev.push({ type: 'lost', pts: Math.round(this.pending), reason });
    this.pending = 0; this.chain = 0; this.mult = 1; this.timer = 0;
  }

  /** Passing under a speed trap: points for every km/h over 140, added to the combo (which it keeps alive). */
  trap(kmh, ev) {
    if (kmh < 140) { ev.push({ type: 'trap', kmh, pts: 0 }); return; }
    const pts = Math.round((kmh - 140) * 9 * Math.max(1, this.mult));
    this.pending += pts;
    this.timer = Math.max(this.timer, 2.5);
    ev.push({ type: 'trap', kmh, pts });
  }

  /** Scraping a wall eats into the combo timer. */
  scrape() { if (this.timer > 0) this.timer = Math.max(0.01, this.timer - 1.5); }
}
