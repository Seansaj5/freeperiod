import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();

test('theme: five accents, the theme\'s own accent by default, unknown ids fall back', async () => {
  const T = await import('../fp/theme.js');
  assert.deepEqual(T.ACCENTS.map((a) => a.id), ['lime', 'cyan', 'pink', 'orange', 'violet']);
  assert.equal(T.DEFAULT_ACCENT, 'theme');
  assert.equal(T.cleanAccent('pink'), 'pink');
  assert.equal(T.cleanAccent('neon'), 'theme');
  assert.equal(T.getAccent(), 'theme');
  assert.equal(T.setAccent('orange'), 'orange');      // no document: stored, nothing else
  assert.equal(localStorage.getItem('fp.accent'), 'orange');
  assert.equal(T.getAccent(), 'orange');
  T.setAccent('theme');
  assert.equal(localStorage.getItem('fp.accent'), null);   // the default is not stored
  for (const a of T.ACCENTS) assert.match(a.color, /^#[0-9a-f]{6}$/);
  // theme-boot.js must accept exactly the accent ids (lime included; 'theme' = none stored)
  const boot = (await import('node:fs')).readFileSync(new URL('../fp/theme-boot.js', import.meta.url), 'utf8');
  const re = new RegExp(boot.match(/\/\^\((.*?)\)\$\//)[0].slice(1, -1));
  for (const a of T.ACCENTS) assert.equal(re.test(a.id), true, a.id);
  assert.equal(re.test('theme'), false);
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

test('ambient mode: by theme, nothing with Effects off, a still frame for Night Aero with reduced motion', async () => {
  const { ambientMode } = await import('../fp/ambient.js');
  assert.equal(ambientMode({ theme: 'neon', fx: true, reduce: false }), 'orbs');
  assert.equal(ambientMode({ theme: 'neon', fx: true, reduce: true }), null);
  assert.equal(ambientMode({ theme: 'aero', fx: true, reduce: false }), 'aero');
  assert.equal(ambientMode({ theme: 'aero', fx: true, reduce: true }), 'aero-still');
  for (const theme of ['neon', 'aero', 'space', 'minimal']) {
    for (const reduce of [false, true]) assert.equal(ambientMode({ theme, fx: false, reduce }), null, theme);
  }
});

test('Night Aero sky: stars and bubbles scale with the screen, bubbles float up and wrap, the light follows the ribbon', async () => {
  const { makeStars, makeBubbles, stepBubbles, bezier, AERO_RIBBON } = await import('../fp/ambient.js');
  const fs = await import('node:fs');
  assert.equal(makeStars(390, 844).length, 24);
  assert.equal(makeStars(1440, 900).length, 81);
  assert.equal(makeStars(3840, 2160).length, 90);
  assert.deepEqual(makeStars(1440, 900), makeStars(1440, 900));          // seeded: a reload looks the same
  assert.ok(makeStars(1440, 900).every((s) => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 0.92));
  assert.equal(makeBubbles(390, 844).length, 4);                         // fewer on a phone
  assert.equal(makeBubbles(1440, 900).length, 9);
  assert.equal(makeBubbles(3840, 2160).length, 10);
  const b = [{ x: 0.5, y: 10, r: 20, vy: 10 }];
  stepBubbles(b, 1, 900);
  assert.equal(b[0].y, 0);                                               // up 10 px in a second
  stepBubbles(b, 3, 900);                                                // off the top: back in under the bottom, somewhere else
  assert.ok(b[0].y > 900 && b[0].x !== 0.5, JSON.stringify(b));
  assert.deepEqual(bezier(AERO_RIBBON, 0), AERO_RIBBON[0]);
  assert.deepEqual(bezier(AERO_RIBBON, 1), AERO_RIBBON[3]);
  // the light runs along the lit edge that assets/aero-sky.svg draws (x1000)
  const f = (n) => Math.round(n * 1000);
  const d = `M${f(AERO_RIBBON[0][0])} ${f(AERO_RIBBON[0][1])}C${AERO_RIBBON.slice(1).map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}`;
  const svg = fs.readFileSync(new URL('../assets/aero-sky.svg', import.meta.url), 'utf8');
  assert.ok(svg.includes(`d="${d}" stroke="url(#lit)"`), d);
});

test('chat-profile pickProfile: exact username, any case', async () => {
  const { pickProfile } = await import('../fp/chat-profile.js');
  const rows = [{ username: 'amy2' }, { username: 'Amy' }, null];
  assert.equal(pickProfile(rows, 'amy').username, 'Amy');
  assert.equal(pickProfile(rows, 'am'), null);
  assert.equal(pickProfile(null, 'amy'), null);
  assert.equal(pickProfile(rows, ''), null);
});
