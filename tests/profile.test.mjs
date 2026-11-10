// M4/M5: profile stats read from the games' own saves; horror.exe in the suggest bar and the inbox.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.location = { search: '', hostname: 'seansaj5.github.io' };
const profile = await import('../fp/profile.js');

test('M4: Close Call shows how many cars are owned, with no fixed total', () => {
  localStorage.setItem('closecall.v1', JSON.stringify({ cash: 1234, owned: ['pocket', 'a', 'b', 'a'], best: 99 }));
  const cc = profile.closeCall();
  assert.equal(cc.cars, '3');
  assert.equal(cc.cash, (1234).toLocaleString());
  localStorage.removeItem('closecall.v1');
  assert.equal(profile.closeCall(), null);
});

test('M5: horror.exe section from horrorexe.v1 (rounds, wins, escapes) plus its play time', () => {
  localStorage.setItem('horrorexe.v1', JSON.stringify({ name: 'x', stats: { rounds: 12, wins: 5, escapes: 3, shards: 40, downs: 2 } }));
  localStorage.setItem('fp.meta', JSON.stringify({ favs: [], recent: {}, play: { 'horror-exe': 600 }, at: 0 }));
  const hx = profile.horrorExe();
  assert.equal(hx.rounds, '12');
  assert.equal(hx.wins, '5');
  assert.equal(hx.escapes, '3');
  assert.equal(hx.played, '10m');
  localStorage.setItem('horrorexe.v1', JSON.stringify({ name: 'x' })); // no rounds played yet
  assert.equal(profile.horrorExe().rounds, null);
  localStorage.setItem('horrorexe.v1', 'not json');
  assert.equal(profile.horrorExe(), null);
});

test('M5: horror.exe is a suggest choice and an inbox label', async () => {
  const { ABOUT } = await import('../fp/suggest.js');
  const { LABELS } = await import('../fp/inbox.js');
  assert.ok(ABOUT.some(([label, key]) => key === 'fp-horrorexe' && label === 'horror.exe'));
  assert.equal(LABELS['fp-horrorexe'], 'horror.exe');
});
