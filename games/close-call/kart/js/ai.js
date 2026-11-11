// The computer drivers. Each follows the racing line with its own lane habit, drifts through the bends (and gets
// the mini-turbos), heads for item crystals when it has nothing, steers round oil, and uses its items with a
// little thought. Speed is set by the class, its own skill, and a gentle catch-up so races stay close.

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function newBrain(i, cls) {
  return { skill: 0.97 + Math.random() * 0.05 - (i % 3) * 0.008, lane: (Math.random() - 0.5) * 1.4, line: 0.7 + Math.random() * 0.3, drifting: 0, itemT: 1 + Math.random() * 3, wob: Math.random() * 10, cls };
}

/** Set kart.input for this frame. race: { track, karts, player, items, count } */
export function drive(k, race, dt, time) {
  const t = race.track, L = k.loc, inp = k.input, b = k.brain;
  // aim at the line a little way ahead, nearer in hairpins (a far point there cuts across the inside wall)
  let cMax = 0;
  for (let i = 4; i <= 24; i += 4) cMax = Math.max(cMax, Math.abs(t.curv[t.w(L.k + i)]));
  const look = Math.min(6 + Math.abs(k.v) * 0.42, 5 + 0.8 / Math.max(1e-4, cMax));
  const tk = t.w(L.k + Math.round(look));
  let d = t.LINE[tk] * b.line + b.lane * t.W[tk] * 0.3 + Math.sin(time * 0.3 + b.wob) * 1.2;
  // nothing in hand: aim at the nearest crystal in the next row
  if (!k.item) {
    for (const row of t.itemRows) {
      const dk = t.w(row - L.k);
      if (dk > 4 && dk < 45) {
        let best = null, bd = 1e9;
        for (const bx of race.items.boxes) if (bx.k === row && bx.t <= 0 && Math.abs(bx.d - L.d) < bd) { bd = Math.abs(bx.d - L.d); best = bx; }
        if (best && dk < 30) d = best.d;
        break;
      }
    }
  }
  // steer round oil
  for (const o of race.items.oilNear(L.k, 30)) {
    const ol = t.locate(o.x, o.z, o.k, {});
    if (Math.abs(ol.d - d) < 2.6) d = ol.d + (d >= ol.d ? 3.2 : -3.2);
  }
  // round other karts just ahead
  for (const o of race.karts) {
    if (o === k) continue;
    const dk = o.total - k.total;
    if (dk > 0 && dk < 7 && Math.abs(o.loc.d - L.d) < 1.8 && o.v < k.v) d += (L.d >= o.loc.d ? 2.2 : -2.2);
  }
  const lim = t.W[tk] - 1.4;
  d = Math.max(-lim, Math.min(lim, d));
  const p = t.point(tk, d);
  const want = Math.atan2(p.x - k.pos.x, p.z - k.pos.z);
  const diff = wrapA(want - k.yaw); // yaw is where it is going (the drift angle is only the body)
  let steer = Math.max(-1, Math.min(1, -diff * 2.6));
  inp.gas = true; inp.brake = false;
  if (Math.abs(diff) > 1.3 && k.v > 6) inp.gas = false;
  // drifting through bends: only ones that need a good share of full steering, and let go when the bend opens
  // out, when the next one turns the other way, or when the drift is carrying it too far in
  const full = k.fullTurn(), sp = Math.max(1, k.v);
  const cA = t.curv[t.w(L.k + 8)], cB = t.curv[t.w(L.k + 18)], cN = t.curv[t.w(L.k + 3)];
  const needA = Math.abs(cA) * sp / full, needB = Math.abs(cB) * sp / full, needN = Math.abs(cN) * sp / full;
  if (b.cool > 0) b.cool -= dt;
  if (!b.drifting) {
    if (needA > 0.55 && needB > 0.4 && Math.sign(cA) === Math.sign(cB) && k.v > 15 && k.ground && !k.spinT && !k.stallT && !(b.cool > 0)) { b.drifting = -Math.sign(cA); b.dT = 0; b.against = 0; }
    inp.drift = false;
  }
  if (b.drifting) {
    b.dT += dt;
    inp.drift = true;
    // hop and steer into the bend; once sliding, steer to hold the line (into it for more turn, out for less)
    if (!k.drift) steer = b.drifting;
    else steer = Math.max(-1, Math.min(1, steer * 1.6));
    b.against = k.drift && steer * b.drifting < -0.85 ? b.against + dt : 0;
    const done = needN < 0.3 && needA < 0.3 && b.dT > 0.7 && (k.charge >= 0.8 || b.dT > 1.4); // the bend has finished (hold on a moment to cash in blue sparks)
    const flips = Math.sign(cA) === b.drifting && needA > 0.35; // an S-bend: let go and drift the other way
    if (done || flips || b.against > 0.25 || (k.offroad && b.dT > 0.4) || b.dT > 6 || k.spinT > 0 || (k.drift === 0 && b.dT > 0.8)) { b.drifting = 0; inp.drift = false; b.cool = 0.35; }
  }
  // too fast for a hairpin ahead (more turn than even a tight drift gives): ease off, or brake (in a drift that
  // also tightens it)
  let needMax = 0;
  for (let i = 6; i <= 30; i += 4) needMax = Math.max(needMax, Math.abs(t.curv[t.w(L.k + i)]) * sp / full);
  const most = k.drift ? 1.45 : 1.05;
  if (needMax > most && k.v > 14 && !k.boosting) { inp.gas = needMax < most + 0.25; inp.brake = !inp.gas && (k.drift !== 0 || needMax > most + 0.5); }
  // about to run into a wall (where it will be in a third of a second): steer away, and let go of a drift
  // that is carrying it there
  const rel = wrapA(k.yaw - Math.atan2(L.tx, L.tz)), dPred = L.d - Math.sin(rel) * k.v * 0.35;
  const wallP = dPred < 0 ? L.el : L.er;
  if (!L.gap && Math.abs(dPred) > wallP - 2.4 && k.v > 8) {
    steer = -Math.sign(dPred);
    if (b.drifting && b.drifting === Math.sign(dPred) && Math.abs(dPred) > wallP - 1.6) { b.drifting = 0; inp.drift = false; b.cool = 0.5; }
  }
  inp.steer = steer;
  // catch-up: a bit quicker when behind you, a bit slower when far ahead
  const gap = race.player ? race.player.total - k.total : 0;
  let mul = race.cls.ai * b.skill;
  if (gap > 40) mul *= 1 + Math.min(0.12, (gap - 40) / 1400);
  else if (gap < -60) mul *= 1 - Math.min(0.08, (-gap - 60) / 2200);
  k.mul = mul;
  // items
  inp.item = false;
  if (k.item && k.item !== 'roll') {
    b.itemT -= dt;
    const it = k.item;
    const ahead = race.karts.find((o) => o.place === k.place - 1);
    const behind = race.karts.find((o) => o.place === k.place + 1);
    let use = false;
    if (it === 'shield' || it === 'coins') use = b.itemT < 0;
    else if (it === 'nitro' || it === 'nitro3' || it === 'overdrive') use = b.itemT < 0 && needA < 0.4;
    else if (it === 'oil') use = (behind && k.total - behind.total < 20) || b.itemT < -8;
    else if (it === 'ball') use = ahead && ahead.total - k.total < 40 && Math.abs(diff) < 0.2;
    else if (it === 'rocket') use = (ahead && b.itemT < 0) || b.itemT < -10;
    if (use) { inp.item = true; b.itemT = 0.6 + Math.random() * 3; }
  }
}
