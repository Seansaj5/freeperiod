import test from 'node:test';
import assert from 'node:assert/strict';
import { planUpload, reencode } from '../fp/chat/media.js';

const MB = 1024 * 1024;
const f = (type, mb, w = 4000, h = 3000) => ({ type, size: Math.round(mb * MB), width: w, height: h });

test('chat pictures re-encode to 1600, GIFs go as is up to 8 MB', () => {
  assert.deepEqual(planUpload(f('image/png', 6), 'chat'), { ok: true, mode: 'reencode', maxW: 1600, maxH: 1600, fit: 'inside' });
  assert.equal(planUpload(f('image/gif', 9), 'chat').ok, false);
  assert.equal(planUpload(f('image/gif', 7.9), 'chat').mode, 'asis');
});
test('avatar / banner / emoji limits', () => {
  assert.equal(planUpload(f('image/gif', 3), 'avatar').mode, 'asis');
  assert.equal(planUpload(f('image/gif', 5), 'avatar').ok, false);
  assert.deepEqual(planUpload(f('image/jpeg', 2), 'avatar'), { ok: true, mode: 'reencode', maxW: 512, maxH: 512, fit: 'cover' });
  assert.equal(planUpload(f('image/gif', 5), 'banner').mode, 'asis');
  assert.equal(planUpload(f('image/gif', 7), 'banner').ok, false);
  const b = planUpload(f('image/png', 1), 'banner');
  assert.equal(b.maxW, 1500); assert.equal(b.maxH, 600);
  assert.equal(planUpload(f('image/gif', 0.9), 'emoji').mode, 'asis');
  assert.equal(planUpload(f('image/gif', 1.5), 'emoji').ok, false);
  assert.equal(planUpload(f('image/png', 1), 'emoji').maxW, 128);
});
test('bad types, sizes and kinds are refused with a reason', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/pdf', '', undefined]) {
    const r = planUpload({ type, size: 100, width: 10, height: 10 }, 'chat');
    assert.equal(r.ok, false); assert.ok(r.reason);
  }
  assert.equal(planUpload({ type: 'image/png', size: 0 }, 'chat').ok, false);
  assert.equal(planUpload({ type: 'image/png', size: NaN }, 'chat').ok, false);
  assert.equal(planUpload(f('image/png', 1), 'wat').ok, false);
  assert.equal(planUpload(f('image/png', 40), 'chat').ok, false);
});

test('reencode scales inside the box, WebP at quality 0.86', async (t) => {
  const calls = [];
  const canvas = (w, h) => ({ width: w, height: h, getContext: () => ({ drawImage: (...a) => calls.push(['draw', ...a]) }), convertToBlob: async (o) => { calls.push(['blob', o]); return { size: 1000, type: o.type }; } });
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 2000, close() {} });
  globalThis.OffscreenCanvas = function (w, h) { calls.push(['canvas', w, h]); return canvas(w, h); };
  const blob = await reencode({ type: 'image/png' }, { ok: true, mode: 'reencode', maxW: 1600, maxH: 1600, fit: 'inside' });
  assert.deepEqual(calls[0], ['canvas', 1600, 800]);
  assert.deepEqual(calls.find(c => c[0] === 'blob')[1], { type: 'image/webp', quality: 0.86 });
  assert.equal(blob.type, 'image/webp');
  calls.length = 0;
  await reencode({ type: 'image/png' }, { ok: true, mode: 'reencode', maxW: 512, maxH: 512, fit: 'cover' });
  assert.deepEqual(calls[0], ['canvas', 512, 512]);
  delete globalThis.OffscreenCanvas; delete globalThis.createImageBitmap;
});
test('reencode never upscales and returns asis files untouched', async (t) => {
  const calls = [];
  globalThis.createImageBitmap = async () => ({ width: 100, height: 50, close() {} });
  globalThis.OffscreenCanvas = function (w, h) { calls.push([w, h]); return { getContext: () => ({ drawImage() {} }), convertToBlob: async (o) => ({ size: 1, type: o.type }) }; };
  await reencode({ type: 'image/png' }, { ok: true, mode: 'reencode', maxW: 1600, maxH: 1600, fit: 'inside' });
  assert.deepEqual(calls[0], [100, 50]);
  const file = { type: 'image/gif' };
  assert.equal(await reencode(file, { ok: true, mode: 'asis' }), file);
  delete globalThis.OffscreenCanvas; delete globalThis.createImageBitmap;
});
