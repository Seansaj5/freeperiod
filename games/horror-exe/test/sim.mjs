// Runs whole rounds with nothing but bots and prints how they went. Usage: node test/sim.mjs [rounds]
import { Round } from '../shared/round.js';
import { ST } from '../shared/rules.js';
const N = +process.argv[2] || 20;
let survWins = 0, totalEsc = 0, totalShards = 0, totalTime = 0, stuckReports = 0;
const byVariant = {};
for (let k = 0; k < N; k++) {
  const R = new Round({ seed: 1000 + k, players: [], exeVariant: ['exe', 'glitch', 'grin'][k % 3] });
  const evs = {};
  const last = new Map();
  let idle = new Map();
  for (let i = 0; i < 30 * 260 && R.phase !== 'over'; i++) {
    R.update(1 / 30);
    for (const e of R.drain()) evs[e.k] = (evs[e.k] || 0) + 1;
    if (i % 90 === 0) for (const e of R.ents.values()) {
      if (e.st !== ST.alive || R.phase === 'intro') continue;
      const p = last.get(e.id);
      if (p && Math.hypot(p.x - e.x, p.z - e.z) < 0.5 && e.brain.mode !== 'stay') idle.set(e.id, (idle.get(e.id) || 0) + 1); else idle.set(e.id, 0);
      if (idle.get(e.id) === 4) { stuckReports++; console.log(`  stuck? r${k} ${e.name} (${e.role}) at ${e.x.toFixed(1)},${e.y.toFixed(1)},${e.z.toFixed(1)} mode=${e.brain.mode} -> ${e.brain.tx.toFixed(1)},${e.brain.tz.toFixed(1)}`); }
      last.set(e.id, { x: e.x, z: e.z });
    }
  }
  const res = R.result || { win: 'none', escaped: [] };
  if (res.win === 'surv') survWins++;
  totalEsc += res.escaped.length; totalShards += R.shards.filter((s) => s.taken).length; totalTime += R.time;
  const v = R.exeEnt().variant; byVariant[v] = byVariant[v] || [0, 0]; byVariant[v][0]++; if (res.win === 'surv') byVariant[v][1]++;
  console.log(`round ${k} ${v.padEnd(6)} win=${res.win.padEnd(4)} escaped=${res.escaped.length} shards=${R.shards.filter((s) => s.taken).length}/8 t=${R.time.toFixed(0)}s`, JSON.stringify(evs));
}
console.log(`\nsurvivors won ${survWins}/${N}, avg escaped ${(totalEsc / N).toFixed(2)}, avg shards ${(totalShards / N).toFixed(1)}, avg length ${(totalTime / N).toFixed(0)}s, stuck reports ${stuckReports}`);
console.log('survivor wins by variant', JSON.stringify(byVariant));
