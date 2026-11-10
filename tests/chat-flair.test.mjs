// Profile flair rules (fp/chat/flair.js): the id lists, validFlair, nameStyle, badgesFor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOfProfile } from '../fp/chat/perms.js';
import { FONTS, FRAMES, EFFECTS, FONT_LABELS, FRAME_LABELS, EFFECT_LABELS, SYMBIOTE_EFFECTS, EARNED, validFlair, nameStyle, badgesFor, badgeInfo,
  badgeLabel, badgeGlyph, GRANTED_BADGES, streakDays, cardTheme, earnedFlair, flairLocked, unlockHint } from '../fp/chat/flair.js';
import { frameMarkup } from '../fp/chat/frames.js';
import { effectMaker } from '../fp/chat/effects.js';

const fields = (r) => r.errors.map((e) => e.field).sort();

test('id lists are exactly the Global Constraints values, in order (0003, then 0009: symbiote set + earned streak flair)', () => {
  assert.deepEqual(FONTS, ['bungee', 'outfit', 'press-start', 'orbitron', 'creepster', 'pacifico', 'symbiote']);
  assert.deepEqual(FRAMES, ['neon-ring', 'pulse', 'orbit', 'flame', 'frost', 'circuit', 'glitch', 'halo', 'thorns', 'sparkle',
    'wave', 'hex', 'crown', 'lightning', 'pixel', 'vortex', 'stars', 'shield', 'drip', 'eclipse',
    'symbiote', 'symbiote-red', 'symbiote-white', 'ooze', 'ember']);
  assert.deepEqual(EFFECTS, ['sparkles', 'snow', 'embers', 'glitch', 'stars', 'bubbles', 'lightning', 'confetti', 'matrix', 'aurora',
    'tendrils', 'goo', 'inferno']);
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
  assert.deepEqual(fields(validFlair({ name_fill: null })), ['name_fill'], 'name_fill is NOT NULL in the database');
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
  assert.deepEqual(fams, ["'Bungee'", "'Outfit'", "'Press Start 2P'", "'Orbitron'", "'Creepster'", "'Pacifico'", "'Rubik Wet Paint'"]);
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

test('badgesFor: order is owner / mod, bot, early, granted, Bing Ball tier, streak', () => {
  const all = { id: 'u1', role: 'owner', is_mod: true, early_member: true, granted_badges: ['og', 'vip', 'bug-hunter'],
    game_stats: { bb: { level: 40, tier: 'egoist' }, badges: ['streak-7', 'streak-30', 'streak-3'] } };
  assert.deepEqual(badgesFor(all), ['owner', 'bug-hunter', 'vip', 'og', 'bb:egoist', 'streak:30'],
    'the owner is not also a mod, and never an early member (they have the crown)');
  assert.deepEqual(badgesFor({ id: 'u2', role: 'mod', early_member: true, granted_badges: ['helper'], game_stats: { bb: { tier: 'ace' }, badges: ['streak-14'] } }),
    ['mod', 'early', 'helper', 'bb:ace', 'streak:14']);
  assert.deepEqual(badgesFor({ id: 'b', role: 'member', is_bot: true, username: 'hallpass', early_member: true, granted_badges: ['helper'] }),
    ['bot', 'helper'], 'a bot is never an early member');
  assert.deepEqual(badgesFor({ id: 'u3', role: 'member', is_mod: true }), ['mod']);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: 'WORLD CLASS' } } }), ['bb:worldclass'], 'tier names are normalized to keys');
  assert.deepEqual(badgesFor({ role: 'member' }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: null } } }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: '' } } }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: 'rookie' } } }), [], 'Rookie is unranked: no badge');
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: ' ROOKIE ' } } }), []);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: { bb: { tier: 'contender' } } }), ['bb:contender']);
  assert.deepEqual(badgesFor({ role: 'member', game_stats: null }), []);
  assert.deepEqual(badgesFor(null), []);
});

test('badgesFor: the Mod badge follows perms.js roleOfProfile (banned or demoted staff get none)', () => {
  const mod = { id: 'u9', role: 'mod' };
  assert.deepEqual(badgesFor(mod), ['mod']);
  assert.deepEqual(badgesFor({ ...mod, banned: true }), [], 'a banned mod is a plain member');
  assert.deepEqual(badgesFor({ id: 'u8', role: 'member', is_mod: true, banned: true }), []);
  assert.deepEqual(badgesFor({ id: 'u7', role: 'mod', is_mod: false, mod_revoked: true }), [], 'a demoted Bing Ball admin / mod');
  assert.deepEqual(badgesFor({ id: 'u6', role: 'member', is_mod: true, mod_revoked: true }), ['mod'], 'is_mod wins in roleOfProfile');
  assert.deepEqual(badgesFor({ id: 'u5', role: 'owner', banned: true }), ['owner']);
  for (const p of [mod, { ...mod, banned: true }, { ...mod, mod_revoked: true }, { id: 'x', is_mod: true }, { id: 'y', role: 'owner' }, { id: 'z' }]) {
    assert.equal(badgesFor(p).includes('mod'), roleOfProfile(p) === 'mod', JSON.stringify(p));
  }
});

test('badgesFor: Early Member is the server-set early_member flag only (no date rule any more); kept after a ban', () => {
  assert.deepEqual(badgesFor({ id: 'a', early_member: true }), ['early']);
  assert.deepEqual(badgesFor({ id: 'a', early_member: true, banned: true }), ['early'], 'stored: a ban does not take it');
  assert.deepEqual(badgesFor({ id: 'a', early_member: false, joined_at: '2026-11-02T00:00:00Z' }), [], 'joining early is not enough');
  assert.deepEqual(badgesFor({ id: 'a', joined_at: '2026-11-02T00:00:00Z' }), [], 'older rows without the column');
  for (const v of ['true', 1, 'yes', null, undefined, {}]) assert.deepEqual(badgesFor({ id: 'a', early_member: v }), [], String(v));
});

test('badgesFor: granted badges come in the fixed order, unknown or repeated ids are dropped', () => {
  assert.deepEqual(GRANTED_BADGES, ['bug-hunter', 'helper', 'artist', 'tester', 'vip', 'og']);
  assert.deepEqual(badgesFor({ id: 'a', granted_badges: ['og', 'tester', 'artist', 'helper', 'bug-hunter', 'vip'] }), GRANTED_BADGES);
  assert.deepEqual(badgesFor({ id: 'a', granted_badges: ['vip', 'vip', 'admin', 'VIP', 'owner', 'early', 7, null] }), ['vip']);
  assert.deepEqual(badgesFor({ id: 'a', granted_badges: 'vip' }), [], 'not an array');
  assert.deepEqual(badgesFor({ id: 'a', granted_badges: null }), []);
});

test('badgesFor: the streak badge is the best one only', () => {
  assert.deepEqual(badgesFor({ game_stats: { badges: ['streak-3', 'streak-100', 'streak-50'] } }), ['streak:100']);
  assert.deepEqual(badgesFor({ game_stats: { badges: ['streak-x', 'streak-', 'streak-7.5', 7] } }), []);
  assert.equal(streakDays(['streak-14', 'streak-7']), 14);
});

test('badgeInfo labels every badge, including tiers Bing Ball adds later; ids stay as they were', () => {
  assert.equal(badgeInfo('owner').label, 'Owner');
  assert.equal(badgeInfo('mod').label, 'Mod');
  assert.equal(badgeInfo('early').label, 'Early Member');
  assert.equal(badgeInfo('bot').label, 'Bot');
  assert.deepEqual(GRANTED_BADGES.map((id) => badgeInfo(id).label), ['Bug Hunter', 'Helper', 'Artist', 'Tester', 'VIP', 'OG']);
  assert.equal(badgeInfo('bb:worldclass').label, 'World Class');
  assert.equal(badgeInfo('bb:newtier').label, 'Newtier');
  assert.equal(badgeInfo('streak:7').label, '\u{1F525} 7-day streak');
  assert.equal(badgeInfo('streak:7').streak, 7);
  for (const id of ['owner', 'mod', 'bot', 'early', ...GRANTED_BADGES, 'bb:ace', 'bb:newtier', 'streak:3']) assert.match(badgeInfo(id).color, /^#[0-9a-f]{6}$/, id);
  assert.equal(badgeInfo('owner').color, '#ffc847', 'gold crown');
  assert.equal(badgeInfo('nope'), null);
  assert.equal(badgeInfo('streak:0'), null);
  assert.equal(badgeInfo(null), null);
});

test('streak badges: the flame color heats up with each milestone', () => {
  const c = (n) => badgeInfo('streak:' + n).color;
  assert.equal(c(3), '#ffb020');
  assert.equal(c(7), '#ff7a3d');
  assert.equal(c(14), '#ff4b3a');
  assert.equal(c(30), '#3de0ff');
  assert.equal(c(50), '#c6ff3d');
  assert.equal(c(100), '#ffe066');
  assert.equal(c(20), c(14), 'between milestones: the one reached');
  assert.equal(c(1), c(3));
  assert.equal(new Set([3, 7, 14, 30, 50, 100].map(c)).size, 6);
});

test('badgeLabel: a title and a line for every badge, with the "since" date for Early Member', () => {
  const p = { id: 'a', username: 'mia', early_member: true, joined_at: '2026-11-10T12:00:00Z', game_stats: { bb: { level: 54, tier: 'ace' } } }; // noon UTC: Nov 10 in any US zone
  assert.deepEqual(badgeLabel('early', p), { title: 'Early Member', detail: 'One of the first 5 members · since Nov 10, 2026',
    text: 'Early Member. One of the first 5 members · since Nov 10, 2026' });
  assert.equal(badgeLabel('early', { early_member: true }).detail, 'One of the first 5 members', 'no date: no since');
  assert.equal(badgeLabel('owner').title, 'Owner');
  assert.equal(badgeLabel('mod').title, 'Moderator');
  assert.equal(badgeLabel('bot', { username: 'hallpass' }).detail, 'Hallpass, Free Period’s helper bot');
  assert.deepEqual(badgeLabel('bb:ace', p), { title: 'Bing Ball: Ace', detail: 'Ranked tier · Level 54', text: 'Bing Ball: Ace. Ranked tier · Level 54' });
  assert.equal(badgeLabel('bb:ace', {}).detail, 'Ranked tier');
  assert.equal(badgeLabel('streak:30', p).title, '30-day streak');
  for (const id of GRANTED_BADGES) { const l = badgeLabel(id); assert.ok(l.title && l.detail && l.text.startsWith(l.title), id); }
  assert.equal(badgeLabel('nope'), null);
});

test('badgeGlyph: every badge has a drawing in its own color; only safe path data and colors', () => {
  const ids = ['owner', 'mod', 'bot', 'early', ...GRANTED_BADGES, 'bb:ace', 'bb:newtier', 'streak:3', 'streak:100'];
  const seen = new Set();
  for (const id of ids) {
    const g = badgeGlyph(id);
    assert.ok(g && g.shapes.length, id);
    assert.equal(g.color, badgeInfo(id).color, id);
    for (const sh of g.shapes) {
      assert.match(sh.d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, id + ' path');
      for (const k of ['f', 's']) if (sh[k]) assert.match(sh[k], /^#[0-9a-f]{6}$/, id + ' color');
      assert.ok(sh.f || sh.s, id + ' paints something');
      if (sh.o != null) assert.ok(sh.o > 0 && sh.o <= 1, id + ' opacity');
    }
    if (!id.startsWith('bb:') && !id.startsWith('streak:')) { assert.ok(!seen.has(JSON.stringify(g.shapes.map((x) => x.d))), id + ' has its own glyph'); seen.add(JSON.stringify(g.shapes.map((x) => x.d))); }
  }
  assert.equal(badgeGlyph('streak:30').shapes[0].f, '#3de0ff', 'the flame takes the tier color');
  assert.equal(badgeGlyph('nope'), null);
});

test('cardTheme: two theme colors make a top-to-bottom gradient; bad or missing colors give none', () => {
  assert.equal(cardTheme({ theme_a: '#0b1a2e', theme_b: '#12304a' }), 'linear-gradient(180deg, #0b1a2e, #12304a)');
  assert.equal(cardTheme({ theme_a: '#0b1a2e' }), 'linear-gradient(180deg, #0b1a2e, #0b1a2e)');
  assert.equal(cardTheme({ theme_a: 'red', theme_b: '#12304a' }), 'linear-gradient(180deg, #12304a, #12304a)');
  assert.equal(cardTheme({}), null);
  assert.equal(cardTheme(null), null);
});

// ---------------------------------------------------------------------------------------------- symbiote set + earned

test('every font, frame and effect has a picker label; no Marvel names anywhere in them', () => {
  for (const id of FONTS) assert.equal(typeof FONT_LABELS[id], 'string', id);
  for (const id of FRAMES) assert.equal(typeof FRAME_LABELS[id], 'string', id);
  for (const id of EFFECTS) assert.equal(typeof EFFECT_LABELS[id], 'string', id);
  const all = [...FONTS, ...FRAMES, ...EFFECTS, ...Object.values(FONT_LABELS), ...Object.values(FRAME_LABELS), ...Object.values(EFFECT_LABELS)].join(' ');
  assert.doesNotMatch(all, /venom|carnage|spider|marvel/i);
  assert.ok(SYMBIOTE_EFFECTS.every((id) => EFFECTS.includes(id)));
});

test('nameStyle: symbiote is glossy goo letters (Rubik Wet Paint, three paint layers, an outline in the name color)', () => {
  const s = nameStyle({ name_font: 'symbiote' });
  assert.match(s.fontFamily, /^'Rubik Wet Paint'/);
  assert.equal(s.color, '#eef2ff', 'the default accent is the page text color');
  assert.equal(s.backgroundImage.split(/,\s*(?=linear-gradient)/).length, 3, 'highlight, sheen, body (flair.css sizes three layers)');
  assert.equal(s.webkitTextStroke, '0.05em rgba(238, 242, 255, 0.92)', 'the outline keeps black letters readable on the dark page');
  assert.equal(s.filter, 'drop-shadow(0 0 3px rgba(238, 242, 255, 0.35))');
  assert.equal(s.textShadow, undefined, 'a text shadow would paint over the goo');
  assert.equal(nameStyle({ name_font: 'bungee' }).webkitTextStroke, undefined, 'only symbiote names are outlined');
  const red = nameStyle({ name_font: 'symbiote', name_color: '#ff2a3d', name_fill: 'solid' });
  assert.match(red.backgroundImage, /rgba\(255, 42, 61, 0\.55\)/, 'the sheen takes the accent');
  assert.match(red.webkitTextStroke, /rgba\(255, 42, 61, 0\.92\)/);
  assert.doesNotMatch(red.backgroundImage, /rgba\(61, 224, 255, 0\.55\)/, 'solid: one accent');
});

test('nameStyle: symbiote with a gradient runs the accent into color 2; glow widens the halo; bad colors never reach CSS', () => {
  const g = nameStyle({ name_font: 'symbiote', name_fill: 'gradient', name_color: '#c6ff3d', name_color2: '#3de0ff' });
  assert.match(g.backgroundImage, /rgba\(198, 255, 61, 0\.55\).*rgba\(61, 224, 255, 0\.55\)/);
  const plain = nameStyle({ name_font: 'symbiote', name_color: '#c6ff3d' });
  const glow = nameStyle({ name_font: 'symbiote', name_color: '#c6ff3d', name_glow: true });
  assert.equal(plain.filter.split('drop-shadow').length - 1, 1);
  assert.equal(glow.filter.split('drop-shadow').length - 1, 2);
  assert.match(glow.filter, /0 0 10px rgba\(198, 255, 61, 0\.45\)/, 'solid + glow: one accent');
  const bad = nameStyle({ name_font: 'symbiote', name_color: 'url(javascript:1)', name_color2: 'red', name_fill: 'gradient' });
  assert.doesNotMatch(bad.backgroundImage + bad.filter, /javascript|red\b/);
  assert.match(bad.backgroundImage, /rgba\(238, 242, 255, 0\.55\).*rgba\(61, 224, 255, 0\.55\)/, 'defaults: page text, then cyan');
});

test('earned flair: ember (7-day streak) and inferno (30-day streak) are locked until game_stats.flair lists them', () => {
  assert.deepEqual(Object.keys(EARNED), ['ember', 'inferno']);
  assert.ok(FRAMES.includes('ember') && EFFECTS.includes('inferno'));
  const none = { game_stats: { bb: { level: 3 } } };
  assert.equal(flairLocked(none, 'ember'), true);
  assert.equal(flairLocked(none, 'inferno'), true);
  assert.equal(flairLocked(null, 'ember'), true);
  assert.equal(flairLocked({ game_stats: { flair: 'ember' } }, 'ember'), true, 'flair must be an array');
  const seven = { game_stats: { flair: ['ember'] } };
  assert.equal(flairLocked(seven, 'ember'), false);
  assert.equal(flairLocked(seven, 'inferno'), true);
  assert.deepEqual([...earnedFlair({ game_stats: { flair: ['inferno', 'ember', 'bogus', 7, null] } })].sort(), ['ember', 'inferno']);
  for (const free of ['symbiote', 'tendrils', 'neon-ring', 'aurora', null, undefined, 'toString']) assert.equal(flairLocked(none, free), false, String(free));
  assert.equal(unlockHint('ember'), 'Reach a 7-day streak');
  assert.equal(unlockHint('inferno'), 'Reach a 30-day streak');
  assert.equal(unlockHint('symbiote'), '');
  assert.equal(validFlair({ frame: 'ember', effect: 'inferno' }).ok, true, 'the id lists allow them; the database checks the unlock');
});

test('validFlair accepts the symbiote set and refuses look-alikes', () => {
  for (const patch of [{ name_font: 'symbiote' }, { frame: 'symbiote' }, { frame: 'symbiote-red' }, { frame: 'symbiote-white' }, { frame: 'ooze' },
    { effect: 'tendrils' }, { effect: 'goo' }]) assert.equal(validFlair(patch).ok, true, JSON.stringify(patch));
  for (const patch of [{ frame: 'symbiote-blue' }, { frame: 'Symbiote' }, { effect: 'tendril' }, { name_font: 'rubik-wet-paint' }, { name_fill: 'symbiote' }])
    assert.equal(validFlair(patch).ok, false, JSON.stringify(patch));
});

test('every frame id has a drawing: well-formed SVG layers, no NaN / undefined, ids made unique per mount', () => {
  assert.equal(frameMarkup('nope'), null);
  assert.equal(frameMarkup('toString'), null);
  for (const id of FRAMES) {
    const m = frameMarkup(id);
    assert.equal(typeof m, 'string', id);
    assert.match(m, /^<svg class="fl /, id);
    assert.doesNotMatch(m, /NaN|undefined|Infinity|\[object/, id);
    assert.equal((m.match(/<svg /g) || []).length, (m.match(/<\/svg>/g) || []).length, id);
    const ids = [...m.matchAll(/ id="([^"]+)"/g)].map((x) => x[1]);
    assert.ok(ids.every((x) => x.startsWith('@@')), id + ': every id gets the per-mount prefix');
    assert.equal(new Set(ids).size, ids.length, id + ': no id twice in one frame');
    for (const [, ref] of m.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), `${id}: url(#${ref}) is defined`);
  }
});

// a canvas 2D context that fails on any non-finite number (a NaN coordinate draws nothing and hides a bug)
function fakeCtx() {
  const calls = { n: 0 };
  const grad = { addColorStop(o, c) { assert.ok(Number.isFinite(o) && o >= 0 && o <= 1, 'stop ' + o); assert.equal(typeof c, 'string'); } };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { a.forEach((v) => assert.ok(Number.isFinite(v), k + ' ' + a)); return grad; };
      if (k in t) return t[k];
      return (...a) => { calls.n++; for (const v of a) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(k)}(${a.join(', ')})`); };
    },
    set(t, k, v) { if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(k)} = ${v}`); t[k] = v; return true; },
  });
  return { ctx, calls };
}

test('the new effects (tendrils, goo, inferno) run 12 s at card and tile sizes and only ever draw finite numbers', () => {
  const had = globalThis.document;
  const { ctx: spriteCtx } = fakeCtx();
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => spriteCtx }) }; // glow sprites
  try {
    assert.equal(effectMaker('nope'), null);
    for (const id of EFFECTS) assert.equal(typeof effectMaker(id), 'function', id);
    for (const id of ['tendrils', 'goo', 'inferno']) {
      for (const [w, h] of [[340, 520], [390, 640], [140, 86]]) {
        let seed = 5;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const fx = effectMaker(id)(rand, { accent: id === 'goo' ? '#ff2a3d' : undefined });
        const { ctx, calls } = fakeCtx();
        fx.init(w, h);
        let t = 0;
        for (let i = 0; i < 720; i++) { t += 1 / 60; fx.step(1 / 60, t); if (i % 24 === 0) fx.draw(ctx, w, h, t, 2); }
        if (fx.still) fx.still(t);
        fx.draw(ctx, w, h, t, 2);
        assert.ok(calls.n > 50, `${id} ${w}x${h} draws something`);
      }
    }
  } finally { globalThis.document = had; }
});
