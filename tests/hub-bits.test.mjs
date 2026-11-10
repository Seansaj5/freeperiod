import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();

test('theme: five accents, lime by default, unknown ids fall back', async () => {
  const T = await import('../fp/theme.js');
  assert.deepEqual(T.ACCENTS.map((a) => a.id), ['lime', 'cyan', 'pink', 'orange', 'violet']);
  assert.equal(T.DEFAULT_ACCENT, 'lime');
  assert.equal(T.cleanAccent('pink'), 'pink');
  assert.equal(T.cleanAccent('neon'), 'lime');
  assert.equal(T.getAccent(), 'lime');
  assert.equal(T.setAccent('orange'), 'orange');      // no document: stored, nothing else
  assert.equal(localStorage.getItem('fp.accent'), 'orange');
  assert.equal(T.getAccent(), 'orange');
  T.setAccent('lime');
  assert.equal(localStorage.getItem('fp.accent'), null);   // the default is not stored
  for (const a of T.ACCENTS) assert.match(a.color, /^#[0-9a-f]{6}$/);
  // theme-boot.js must accept exactly the non-default accents
  const boot = (await import('node:fs')).readFileSync(new URL('../fp/theme-boot.js', import.meta.url), 'utf8');
  const re = new RegExp(boot.match(/\/\^\((.*?)\)\$\//)[0].slice(1, -1));
  for (const a of T.ACCENTS) assert.equal(re.test(a.id), a.id !== 'lime', a.id);
});

test('carousel wrapIndex', async () => {
  const { wrapIndex } = await import('../fp/carousel.js');
  assert.equal(wrapIndex(0, 1, 3), 1);
  assert.equal(wrapIndex(2, 1, 3), 0);
  assert.equal(wrapIndex(0, -1, 3), 2);
  assert.equal(wrapIndex(5, 0, 3), 2);
  assert.equal(wrapIndex(0, 1, 0), 0);
});

test('ticker: items in order, nothing for what is unknown, announcement titles', async () => {
  const { tickerItems, announceTitle } = await import('../fp/ticker.js');
  const games = [{ id: 'bing-ball', title: 'Bing Ball', wakes: true, status: { health: 'x' } }, { id: 'close-call', title: 'Close Call' }];
  assert.deepEqual(tickerItems({ games }).map((i) => i.key), ['g:close-call']);      // Bing Ball not checked yet: left out
  const all = tickerItems({ games, status: new Map([['bing-ball', { state: 'online', players: 3 }]]), friends: 2, announcement: 'Hi', streak: 4,
    news: [{ id: 'n1', title: 'One' }, { id: 'n2', title: 'Two', href: 'x.html' }, { id: 'n3', title: 'Three' }, { id: 'n4', title: 'Four' }] });
  assert.deepEqual(all.map((i) => i.key), ['g:bing-ball', 'g:close-call', 'friends', 'ann', 'streak', 'new:n1', 'new:n2', 'new:n3']);
  assert.equal(all[0].sub, '3 playing');
  assert.equal(all[2].text, '2 friends playing now');
  assert.equal(all[6].href, 'x.html');
  assert.equal(tickerItems({ games, status: new Map([['bing-ball', { state: 'online', players: 0 }]]) })[0].sub, 'Online');
  assert.equal(tickerItems({ games, status: new Map([['bing-ball', { state: 'waking' }]]) })[0].sub, 'Waking up');
  assert.equal(tickerItems({ friends: 0, streak: 0 }).length, 0);
  assert.equal(announceTitle('\n**Big news:** _Close Call_ maps!\nmore'), 'Big news: Close Call maps!');
  assert.equal(announceTitle('', [{}]), 'New picture');
  assert.equal(announceTitle('   '), '');
  assert.equal(announceTitle('x'.repeat(200)).length, 90);
});

test('ambient orbs: count by screen size, drift wraps around the edges', async () => {
  const { makeOrbs, stepOrbs } = await import('../fp/ambient.js');
  assert.equal(makeOrbs(360, 780).length, 6);
  assert.equal(makeOrbs(1440, 900).length, 8);
  assert.equal(makeOrbs(3840, 2160).length, 11);
  assert.deepEqual(makeOrbs(1440, 900, 3), makeOrbs(1440, 900, 3));      // seeded
  const o = [{ x: 1000, y: 10, r: 100, vx: 50, vy: -50 }];
  stepOrbs(o, 3, 1000, 800);
  assert.ok(o[0].x < 0 && o[0].y > 800, JSON.stringify(o));               // off the right/top edge: back in from the left/bottom
});

test('chat-profile pickProfile: exact username, any case', async () => {
  const { pickProfile } = await import('../fp/chat-profile.js');
  const rows = [{ username: 'amy2' }, { username: 'Amy' }, null];
  assert.equal(pickProfile(rows, 'amy').username, 'Amy');
  assert.equal(pickProfile(rows, 'am'), null);
  assert.equal(pickProfile(null, 'amy'), null);
  assert.equal(pickProfile(rows, ''), null);
});
