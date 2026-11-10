// Runs whole rounds with nothing but bots and prints how they went. Usage: node test/sim.mjs [rounds]
import { Round } from '../shared/round.js';
import { ST, TASKS } from '../shared/rules.js';
const N = +process.argv[2] || 20;
let survWins = 0, totalEsc = 0, totalTasks = 0, totalTime = 0, stuckReports = 0;
const taskCount = Object.fromEntries(TASKS.map((t) => [t.id, 0]));
const byVariant = {};
for (let k = 0; k < N; k++) {
  const R = new Round({ seed: 1000 + k, players: [], exeVariant: ['exe', 'glitch', 'grin'][k % 3] });
  const evs = {};
  const last = new Map(), idle = new Map();
  for (let i = 0; i < 30 * 420 && R.phase !== 'over'; i++) {
    R.update(1 / 30);
    for (const e of R.drain()) evs[e.k] = (evs[e.k] || 0) + 1;
    if (i % 90 === 0) for (const e of R.ents.values()) {
      if (e.st !== ST.alive || R.phase === 'intro') continue;
      const p = last.get(e.id);
      if (p && Math.hypot(p.x - e.x, p.z - e.z) < 0.5 && e.brain.mode !== 'stay') idle.set(e.id, (idle.get(e.id) || 0) + 1); else idle.set(e.id, 0);
      if (idle.get(e.id) === 4 && process.argv.includes('-v')) console.log(`  stuck? r${k} ${e.name} (${e.role}) w${e.w} at ${e.x.toFixed(1)},${e.y.toFixed(1)},${e.z.toFixed(1)} mode=${e.brain.mode} -> ${e.brain.tx.toFixed(1)},${e.brain.tz.toFixed(1)}`);
      if (idle.get(e.id) === 4) stuckReports++;
      last.set(e.id, { x: e.x, z: e.z });
    }
  }
  const res = R.result || { win: 'none', escaped: [] };
  if (res.win === 'surv') survWins++;
  totalEsc += res.escaped.length; totalTime += R.time;
  for (const t of TASKS) if (R.done[t.id]) { taskCount[t.id]++; totalTasks++; }
  const v = R.exeEnt().variant; byVariant[v] = byVariant[v] || [0, 0]; byVariant[v][0]++; if (res.win === 'surv') byVariant[v][1]++;
  console.log(`round ${k} ${v.padEnd(6)} win=${res.win.padEnd(4)} escaped=${res.escaped.length} tasks=${TASKS.filter((t) => R.done[t.id]).map((t) => t.id).join(',') || '-'} t=${R.time.toFixed(0)}s portals=${evs.portal || 0} disguise=${evs.disguise || 0} pop=${evs.pop || 0} hits=${evs.hit || 0} downs=${evs.down || 0}`);
}
console.log(`\nsurvivors won ${survWins}/${N}, avg escaped ${(totalEsc / N).toFixed(2)}, avg tasks ${(totalTasks / N).toFixed(1)}/5, avg length ${(totalTime / N).toFixed(0)}s, stuck reports ${stuckReports}`);
console.log('tasks finished (rounds):', JSON.stringify(taskCount));
console.log('survivor wins by variant', JSON.stringify(byVariant));
