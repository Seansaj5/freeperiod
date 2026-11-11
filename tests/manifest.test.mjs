// Add to Home Screen: the web app manifest, its icons, and the tags every hub page carries for phones and iPads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const PAGES = ['index.html', 'leaderboards.html', 'trophies.html', 'profile.html', 'play.html', 'chat.html'];
const NEON = '#05070c';   // the default theme's background (fp/theme.js THEME_COLORS.neon)

/** A PNG's width and height from its IHDR chunk. */
function pngSize(buf) {
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'is a PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('manifest.webmanifest is valid JSON with the app fields', async () => {
  const m = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  assert.equal(m.name, 'Free Period');
  assert.equal(m.short_name, 'Free Period');
  assert.equal(m.start_url, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.background_color, NEON);
  assert.equal(m.theme_color, NEON);
  const { THEME_COLORS, DEFAULT_THEME } = await import('../fp/theme.js');
  assert.equal(m.theme_color, THEME_COLORS[DEFAULT_THEME]);
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 3);
});

test('manifest icons exist as PNGs of the stated size (192, 512, maskable 512)', () => {
  const m = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  for (const ic of m.icons) {
    assert.ok(existsSync(new URL(ic.src, root)), ic.src + ' exists');
    assert.equal(ic.type, 'image/png', ic.src);
    const [w, h] = pngSize(read(ic.src));
    assert.equal(`${w}x${h}`, ic.sizes, ic.src);
  }
  const has = (sizes, purpose) => m.icons.some((ic) => ic.sizes === sizes && (ic.purpose || 'any').split(' ').includes(purpose));
  assert.ok(has('192x192', 'any'), '192 any');
  assert.ok(has('512x512', 'any'), '512 any');
  assert.ok(has('512x512', 'maskable'), '512 maskable');
  assert.deepEqual(pngSize(read('assets/icons/apple-touch-icon.png')), [180, 180]);
});

test('every hub page: viewport-fit=cover, manifest, apple-touch-icon, standalone + status bar tags, theme-color before the boot script', () => {
  for (const p of PAGES) {
    const html = read(p).toString('utf8');
    assert.match(html, /<meta name="viewport" content="[^"]*width=device-width[^"]*viewport-fit=cover/, p + ' viewport');
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/, p + ' manifest');
    const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/);
    assert.ok(touch && existsSync(new URL(touch[1], root)), p + ' apple-touch-icon');
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/, p);
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes"/, p);
    assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/, p);
    const tc = html.indexOf(`<meta name="theme-color" content="${NEON}"`), boot = html.indexOf('fp/theme-boot.js');
    assert.ok(tc > 0 && boot > tc, p + ': theme-color meta comes before theme-boot.js (the boot script tints it)');
  }
});

test('no service worker (live updates must never be cached away)', () => {
  const files = readdirSync(new URL('fp/', root), { recursive: true }).filter((f) => String(f).endsWith('.js'));
  for (const f of files) assert.doesNotMatch(read('fp/' + f).toString('utf8'), /serviceWorker\s*\.\s*register/, f);
  assert.ok(!existsSync(new URL('sw.js', root)) && !existsSync(new URL('service-worker.js', root)));
});
