// Bot-only matches: node test/sim.mjs [matches]  — prints how each match went (balance + crash check).
import { Match } from '../shared/match.js';
const N = +process.argv[2] || 1;
for (let k = 0; k < N; k++) {
  const t0 = Date.now();
  const m = new Match({ seed: 1000 + k, people: [], warmup: 1 });
  const dt = 1 / 30;
  let elims = [], pieces = 0, shots = 0, opened = 0, picked = 0, landedAt = null;
  let maxTick = 0;
  while (m.phase !== 'over' && m.now < 900) {
    const a = performance.now();
    m.update(dt);
    const t = performance.now() - a; if (t > maxTick) maxTick = t;
    for (const e of m.drain()) {
      if (e.e === 'elim') elims.push(`${m.now.toFixed(0)}s ${m.players.get(e.v).name} by ${e.a ? m.players.get(e.a).name : '-'} (${e.w})`);
      if (e.e === 'piece+') pieces++;
      if (e.e === 'shot') shots++;
      if (e.e === 'opened') opened++;
      if (e.e === 'got') picked++;
    }
    if (!landedAt && [...m.players.values()].every((p) => p.mode === 'ground' || p.mode === 'swim')) landedAt = m.now;
  }
  const w = m.players.get(m.winner);
  console.log(`match ${k}: ${m.phase} at ${m.now.toFixed(0)}s, winner ${w ? w.name + ' (' + w.kills + ' kills)' : '-'}, all landed ${landedAt && landedAt.toFixed(0)}s, storm phase ${m.storm.i}`);
  console.log(`  shots ${shots}, pieces ${pieces}, chests ${opened}, pickups ${picked}, sim ${(Date.now() - t0)} ms, worst tick ${maxTick.toFixed(1)} ms`);
  const causes = {}; for (const e of elims) { const c = e.match(/\((.*)\)$/)[1]; causes[c] = (causes[c] || 0) + 1; }
  console.log('  causes', JSON.stringify(causes));
  if (N === 1) console.log(elims.join('\n'));
}
