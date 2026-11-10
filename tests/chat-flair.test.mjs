// Profile flair rules (fp/chat/flair.js): the id lists, validFlair, nameStyle, badgesFor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, FRAMES, EFFECTS, validFlair, nameStyle, badgesFor, badgeInfo, cardTheme } from '../fp/chat/flair.js';

const fields = (r) => r.errors.map((e) => e.field).sort();

test('id lists are exactly the Global Constraints values, in order', () => {
  assert.deepEqual(FONTS, ['bungee', 'outfit', 'press-start', 'orbitron', 'creepster', 'pacifico']);
  assert.deepEqual(FRAMES, ['neon-ring', 'pulse', 'orbit', 'flame', 'frost', 'circuit', 'glitch', 'halo', 'thorns', 'sparkle',
    'wave', 'hex', 'crown', 'lightning', 'pixel', 'vortex', 'stars', 'shield', 'drip', 'eclipse']);
  assert.deepEqual(EFFECTS, ['sparkles', 'snow', 'embers', 'glitch', 'stars', 'bubbles', 'lightning', 'confetti', 'matrix', 'aurora']);
  assert.ok(Object.isFrozen(FONTS) && Object.isFrozen(FRAMES) && Object.isFrozen(EFFECTS), 'lists cannot be changed by a caller');
});

test('validFlair accepts every listed font, frame and effect id', () => {
  for (const name_font of FONTS) assert.deepEqual(validFlair({ name_font }), { ok: true, errors: [] }, name_font);
  for (const frame of FRAMES) assert.deepEqual(validFlair({ frame }), { ok: true, errors: [] }, frame);
  for (const effect of EFFECTS) assert.deepEqual(validFlair({ effect }), { ok: true, errors: [] }, effect);
});

test('validFlair accepts a full good patch, nulls for "none", and ignores non-flair fields', () => {
  const good = {
    name_color: '#c6ff3d', name_color2: '#3de0ff', name_font: 'orbitron', name_fill: 'gradient', name_glow: true,
    frame: 'crown', effect: 'aurora', theme_a: '#0b1a2e', theme_b: '#12304a', about: 'not checked here',
  };
  assert.deepEqual(validFlair(good), { ok: true, errors: [] });
  assert.equal(validFlair({ frame: null, effect: null, name_font: null, name_color: null, theme_a: null }).ok, true);
  assert.equal(validFlair({ name_fill: 'solid', name_glow: false }).ok, true);
  assert.equal(validFlair({}).ok, true);
});

test('validFlair rejects unknown font / frame / effect ids, naming each field', () => {
  const r = validFlair({ name_font: 'comic-sans', frame: 'rainbow', effect: 'fireworks' });
  assert.equal(r.ok, false);
  assert.deepEqual(fields(r), ['effect', 'frame', 'name_font']);
  for (const e of r.errors) assert.equal(typeof e.message, 'string');
  assert.equal(validFlair({ frame: 'NEON-RING' }).ok, false, 'ids are exact (lowercase)');
  assert.equal(validFlair({ effect: 'toString' }).ok, false, 'no prototype keys');
  assert.equal(validFlair({ name_font: '' }).ok, false);
  assert.equal(validFlair({ frame: 3 }).ok, false);
});

test('validFlair rejects bad hex colors (same rule as the database: #rrggbb lowercase)', () => {
  for (const bad of ['#C6FF3D', 'c6ff3d', '#c6ff3', '#c6ff3d0', '#ggffff', 'red', '', 123, '#fff']) {
    const r = validFlair({ name_color: bad, name_color2: bad, theme_a: bad, theme_b: bad });
    assert.equal(r.ok, false, String(bad));
    assert.deepEqual(fields(r), ['name_color', 'name_color2', 'theme_a', 'theme_b'], String(bad));
  }
});

test('validFlair rejects a bad fill or glow, and a patch that is not an object', () => {
  assert.deepEqual(fields(validFlair({ name_fill: 'rainbow' })), ['name_fill']);
  assert.deepEqual(fields(validFlair({ name_glow: 'yes' })), ['name_glow']);
  assert.deepEqual(fields(validFlair({ name_glow: null })), ['name_glow']);
  for (const bad of [null, undefined, 'frame', 7, ['frame']]) assert.equal(validFlair(bad).ok, false);
});

test('nameStyle: solid color in the chosen font', () => {
  const s = nameStyle({ name_color: '#3de0ff', name_font: 'press-start', name_fill: 'solid', name_glow: false });
  assert.deepEqual(Object.keys(s).sort(), ['color', 'fontFamily']);
  assert.equal(s.color, '#3de0ff');
  assert.match(s.fontFamily, /^'Press Start 2P'/);
});

test('nameStyle: defaults (no flair) are Outfit in the page text color', () => {
  const s = nameStyle({});
  assert.match(s.fontFamily, /^'Outfit'/);
  assert.equal(s.color, '#eef2ff');
  assert.equal(s.backgroundImage, undefined);
  assert.equal(s.textShadow, undefined);
  assert.deepEqual(nameStyle(null), s, 'a missing profile is the default');
  assert.equal(nameStyle({ name_color: 'javascript:alert(1)' }).color, '#eef2ff', 'bad colors never reach CSS');
  assert.match(nameStyle({ name_font: 'nope' }).fontFamily, /^'Outfit'/);
});

test('nameStyle: every font id maps to its own family', () => {
  const fams = FONTS.map((f) => nameStyle({ name_font: f }).fontFamily.split(',')[0]);
  assert.deepEqual(fams, ["'Bungee'", "'Outfit'", "'Press Start 2P'", "'Orbitron'", "'Creepster'", "'Pacifico'"]);
});

test('nameStyle: gradient fills left to right from color 1 to color 2', () => {
  const s = nameStyle({ name_color: '#c6ff3d', name_color2: '#3de0ff', name_fill: 'gradient', name_font: 'bungee' });
  assert.equal(s.backgroundImage, 'linear-gradient(90deg, #c6ff3d, #3de0ff)');
  assert.equal(s.color, '#c6ff3d', 'color 1 stays as the fallback / currentColor');
  assert.equal(s.textShadow, undefined);
  const noSecond = nameStyle({ name_color: '#ffb020', name_fill: 'gradient' });
  assert.equal(noSecond.backgroundImage, 'linear-gradient(90deg, #ffb020, #3de0ff)', 'missing color 2 -> cyan');
});

test('nameStyle: glow adds a soft text shadow in the name color', () => {
  const s = nameStyle({ name_color: '#c6ff3d', name_glow: true });
  assert.equal(s.color, '#c6ff3d');
  assert.equal(s.textShadow, '0 0 6px rgba(198, 255, 61, 0.75), 0 0 16px rgba(198, 255, 61, 0.4)');
  const g = nameStyle({ name_color: '#c6ff3d', name_color2: '#3de0ff', name_fill: 'gradient', name_glow: true });
  assert.equal(g.backgroundImage, 'linear-gradient(90deg, #c6ff3d, #3de0ff)');
  assert.equal(g.textShadow, undefined, 'a text shadow would paint over gradient text');
  assert.equal(g.filter, 'drop-shadow(0 0 5px rgba(198, 255, 61, 0.55)) drop-shadow(0 0 9px rgba(61, 224, 255, 0.35))');
});

test('badgesFor: order is owner, mod, early, Bing Ball tier', () => {
  const all = { role: 'owner', is_mod: true, joined_at: '2026-11-10T12:00:00Z', game_stats: { bb: { level: 40, tier: 'egoist' } } };
  assert.deepEqual(badgesFor(all), ['owner', 'early', 'bb:egoist'], 'the owner is not also listed as a mod');
  assert.deepEqual(badgesFor({ role: 'mod', joined_at: '2026-11-20T00:00:00Z', game_stats: { bb: { tier: 'ace' } } }),
    ['mod', 'early', 'bb:ace']);
  assert.deepEqual(badgesFor({ role: 'member', is_mod: true, joined_at: '2027-01-02T00:00:00Z' }), ['mod']);
  assert.deepEqual(badgesFor({ role: 'member', joined_at: '2027-01-02T00:00:00Z', game_stats: { bb: { tier: 'WORLD CLASS' } } }),
    ['bb:worldclass'], 'tier names are normalized to keys');
  assert.deepEqual(badgesFor({ role: 'member' }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: null } } }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: '' } } }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: null }), []);
  assert.deepEqual(badgesFor(null), []);
});

test('badgesFor: Early Member means joined chat before 2026-12-01', () => {
  assert.deepEqual(badgesFor({ joined_at: '2026-11-30' }), ['early']);
  assert.deepEqual(badgesFor({ joined_at: '2026-11-30T23:59:59.999Z' }), ['early']);
  assert.deepEqual(badgesFor({ joined_at: '2026-11-30T23:30:00+00:00' }), ['early'], 'Postgres timestamptz text');
  assert.deepEqual(badgesFor({ joined_at: '2026-12-01' }), []);
  assert.deepEqual(badgesFor({ joined_at: '2026-12-01T00:00:00Z' }), []);
  assert.deepEqual(badgesFor({ joined_at: '2027-03-01T10:00:00Z' }), []);
  assert.deepEqual(badgesFor({ joined_at: 'not a date' }), []);
});

test('badgeInfo labels every badge, including tiers Bing Ball adds later', () => {
  assert.equal(badgeInfo('owner').label, 'Owner');
  assert.equal(badgeInfo('mod').label, 'Mod');
  assert.equal(badgeInfo('early').label, 'Early Member');
  assert.equal(badgeInfo('bb:worldclass').label, 'World Class');
  assert.equal(badgeInfo('bb:newtier').label, 'Newtier');
  for (const id of ['owner', 'mod', 'early', 'bb:ace', 'bb:newtier']) assert.match(badgeInfo(id).color, /^#[0-9a-f]{6}$/);
  assert.equal(badgeInfo('nope'), null);
});

test('cardTheme: two theme colors make a top-to-bottom gradient; bad or missing colors give none', () => {
  assert.equal(cardTheme({ theme_a: '#0b1a2e', theme_b: '#12304a' }), 'linear-gradient(180deg, #0b1a2e, #12304a)');
  assert.equal(cardTheme({ theme_a: '#0b1a2e' }), 'linear-gradient(180deg, #0b1a2e, #0b1a2e)');
  assert.equal(cardTheme({ theme_a: 'red', theme_b: '#12304a' }), 'linear-gradient(180deg, #12304a, #12304a)');
  assert.equal(cardTheme({}), null);
  assert.equal(cardTheme(null), null);
});
