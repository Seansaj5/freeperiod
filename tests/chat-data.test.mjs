// Chat data layer (fp/chat/data.js): the pure parts, no network. Error mapping uses the real shapes recorded on the
// test project (sql-apply-report.md); the WebP fixtures are real headless-Chrome canvas output (what reencode makes).
// The Supabase parts are covered by the integration test against the test project (scratchpad chattest/data.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
globalThis.localStorage = fakeStorage();
globalThis.sessionStorage = fakeStorage();
globalThis.location = { search: '', hostname: 'test.invalid' };
const data = await import('../fp/chat/data.js');
const { chatError, ChatError, _internals: { toChatError, imageSize, present, likeSafe, checkField } } = data;

const se = (code, statusCode, message) => ({ name: 'StorageApiError', __isStorageError: true, status: 400, statusCode, code, message });
const pg = (code, message, details = null) => ({ code, message, details, hint: null });

test('chatError: database refusals (P0001 message = code), muted minutes, checks and grants', () => {
  const words = {
    slow_down: 'Slow down a little', banned: 'You’re banned from chat', everyone_owner_only: 'Only Sean can ping everyone',
    owner_only_channel: 'Only Sean and mods post here', dm_refused: 'They aren’t taking DMs from you', group_full: 'Groups hold up to 10 people',
    not_allowed: 'You can’t do that', emoji_full: 'The server already has 50 emoji',
  };
  for (const [code, text] of Object.entries(words)) {
    assert.equal(chatError(pg('P0001', code)), text, code);
    assert.equal(chatError(new ChatError(code)), text, 'ChatError ' + code);
  }
  assert.equal(chatError(pg('P0001', 'muted', new Date(Date.now() + 59.5 * 60e3).toISOString())), 'You’re timed out for 60 min');
  assert.equal(chatError(pg('P0001', 'muted', '2026-11-10T15:45:01.471762+00:00')), 'You’re timed out for 1 min'); // in the past: at least 1
  assert.equal(toChatError(pg('P0001', 'muted', 'X')).detail, 'X');
  assert.equal(chatError(pg('P0001', 'not_allowed', 'minutes')), 'You can’t do that');
  assert.equal(chatError(pg('23505', 'duplicate key value violates unique constraint "channels_name_key"')), 'That name is already taken');
  assert.equal(chatError(pg('23514', 'new row for relation "messages" violates check constraint "messages_body_check"')), 'You can’t do that');
  assert.equal(chatError(pg('42501', 'new row violates row-level security policy for table "messages"')), 'You can’t do that');
  assert.equal(chatError(pg('42501', 'permission denied for table messages')), 'You can’t do that');
  assert.equal(chatError(Object.assign(new ChatError('bad_file'), { reason: 'That GIF is too big (max 8 MB)' })), 'That GIF is too big (max 8 MB)');
  assert.equal(chatError(new ChatError('discarded')), 'Not sent');
  // 0008's daily caps: the same slow_down code with details 'daily'
  assert.equal(chatError(pg('P0001', 'slow_down', 'daily')), 'You’ve hit today’s limit. Try again tomorrow.');
  assert.equal(chatError(new ChatError('slow_down', 'daily')), 'You’ve hit today’s limit. Try again tomorrow.');
  assert.equal(toChatError(pg('P0001', 'slow_down', 'daily')).code, 'slow_down'); // still a refusal: the send stays failed with Retry
  assert.equal(chatError(pg('P0001', 'slow_down', null)), 'Slow down a little');
  assert.equal(chatError(pg('P0001', 'slow_down', 'other')), 'Slow down a little');
  for (const junk of [null, undefined, {}, { weird: true }, pg('XX000', 'boom'), 'text']) assert.equal(chatError(junk), 'Something went wrong');
});

test('chatError: storage refusals map on message / code, never on the HTTP 400', () => {
  assert.equal(chatError(se('AccessDenied', '403', 'folder_full')), 'Too many pictures at once. Try again in a moment');
  assert.equal(chatError(se('AccessDenied', '403', 'slow_down')), 'Slow down a little');
  assert.equal(chatError(se('AccessDenied', '403', 'storage_full')), 'Your picture space is full. Delete some old pictures first');
  assert.equal(chatError(se('AccessDenied', '403', 'not_allowed')), 'You can’t do that');
  assert.equal(chatError(se('AccessDenied', '403', 'new row violates row-level security policy')), 'You can’t do that');
  assert.equal(chatError(se('KeyAlreadyExists', '409', 'The resource already exists')), 'That name is already taken');
  assert.equal(chatError(se('InvalidMimeType', '415', 'mime type text/html is not supported')), 'Only PNG, JPEG, WebP or GIF pictures');
  assert.equal(chatError(se('EntityTooLarge', '413', 'The object exceeded the maximum allowed size')), 'That picture is too big');
  assert.equal(chatError(se('NoSuchKey', '404', 'Object not found')), 'You can’t do that');
  assert.equal(toChatError(se('KeyAlreadyExists', '409', 'The resource already exists')).code, '23505');
});

test('chatError: a dropped connection or a timeout is "no connection"; any other TypeError is a bug, not the network', () => {
  for (const e of [new TypeError('Failed to fetch'), new TypeError('Load failed'), new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError('fetch failed'), { message: 'TypeError: fetch failed', details: '', hint: '', code: '' },
    { message: 'AbortError: signal is aborted without reason', code: '20' }, { message: 'TimeoutError: signal timed out', code: '23' },
    { name: 'StorageUnknownError', message: 'fetch failed', originalError: new TypeError('fetch failed') },
    Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }), new ChatError('network')]) {
    assert.equal(chatError(e), 'no connection', JSON.stringify(e.message));
  }
  assert.equal(chatError(new TypeError("Cannot read properties of undefined (reading 'id')")), 'Something went wrong');
});

test('checkField / likeSafe', () => {
  assert.equal(checkField('new row for relation "channels" violates check constraint "channels_name_check"'), 'name');
  assert.equal(checkField('new row for relation "profiles" violates check constraint "profiles_display_name_check"'), 'display_name');
  assert.equal(checkField('something else'), undefined);
  assert.equal(likeSafe('d1a2b3_'), 'd1a2b3\\_');
  assert.equal(likeSafe('50%'), '50\\%');
  assert.equal(likeSafe('a\\b'), 'a\\\\b');
});

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const blob = (u8, type) => new Blob([u8], { type });
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
test('imageSize: GIF, PNG and WebP (VP8X from Chrome, VP8, VP8L) headers; unknown -> null', async () => {
  assert.deepEqual(await imageSize(blob(bytes('GIF89a', [3, 0, 2, 0, 0x80, 0, 0]), 'image/gif')), { w: 3, h: 2 });
  assert.deepEqual(await imageSize(blob(bytes('GIF87a', [0x40, 0x01, 0xc8, 0x00]), 'image/gif')), { w: 320, h: 200 });
  const png = (w, h) => bytes([0x89], 'PNG', [13, 10, 26, 10, 0, 0, 0, 13], 'IHDR', [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, 6, 0, 0, 0]);
  assert.deepEqual(await imageSize(blob(png(1, 1), 'image/png')), { w: 1, h: 1 });
  assert.deepEqual(await imageSize(blob(png(1600, 900), 'image/png')), { w: 1600, h: 900 });
  // real convertToBlob({ type: 'image/webp' }) output (first 40 bytes): opaque q.86, with alpha, q 1
  assert.deepEqual(await imageSize(blob(b64('UklGRpwNAABXRUJQVlA4WAoAAAAgAAAAPwYAgwMASUNDUMgBAAAAAA=='), 'image/webp')), { w: 1600, h: 900 });
  assert.deepEqual(await imageSize(blob(b64('UklGRmAEAABXRUJQVlA4WAoAAAAwAAAATAEABAIASUNDUMgBAAAAAA=='), 'image/webp')), { w: 333, h: 517 });
  assert.deepEqual(await imageSize(blob(b64('UklGRjoCAABXRUJQVlA4WAoAAAAgAAAAYAAAKAAASUNDUMgBAAAAAA=='), 'image/webp')), { w: 97, h: 41 });
  // VP8 (lossy, simple): frame tag, start code 9d 01 2a, 14-bit width / height
  assert.deepEqual(await imageSize(blob(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], [0x80, 0x02, 0xe0, 0x01], [0, 0]), 'image/webp')), { w: 640, h: 480 });
  // VP8L (lossless): signature 0x2f, then (w-1) | (h-1) << 14 in 28 bits
  const v = (1500 - 1) | ((600 - 1) << 14);
  assert.deepEqual(await imageSize(blob(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8L', [0, 0, 0, 0], [0x2f, v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]), 'image/webp')), { w: 1500, h: 600 });
  assert.equal(await imageSize(blob(bytes('not a picture at all, no header here.'), 'image/png')), null);
  assert.equal(await imageSize(blob(bytes('GIF89a', [0, 0, 0, 0]), 'image/gif')), null); // 0 x 0 is no size
});

test('present: reactions summarized with mine, reply joined, deleted rows blanked', () => {
  data._inject({ me: () => ({ id: 'me' }) });
  const m = present({ id: 7, channel_id: 3, dm_id: null, author_id: 'a', body: 'hi', attachments: null, deleted: false, reply_to: 5,
    author: { id: 'a' }, reactions: [{ emoji: '🔥', user_id: 'me' }, { emoji: '🔥', user_id: 'x' }, { emoji: '😂', user_id: 'x' }],
    reply: { id: 5, author_id: 'b', body: 'orig', deleted: false, attachments: [{ bucket: 'public-media', path: 'chat/3/b/p.webp' }], created_at: 't', author: { id: 'b' } } });
  assert.deepEqual(m.reactions, [{ emoji: '🔥', count: 2, mine: true }, { emoji: '😂', count: 1, mine: false }]);
  assert.deepEqual(m.attachments, []);
  assert.equal(m.reply.body, 'orig');
  assert.equal(m.reply.author.id, 'b');
  assert.equal(m.reply.attachments.length, 1);
  const d = present({ id: 8, channel_id: 3, author_id: 'a', body: 'x', attachments: [{ path: 'p' }], deleted: true, reactions: [],
    reply: { id: 5, author_id: 'b', body: 'secret', deleted: true, attachments: [{ path: 'q' }] } });
  assert.equal(d.body, '');
  assert.deepEqual(d.attachments, []);
  assert.deepEqual([d.reply.body, d.reply.attachments, d.reply.deleted], ['', [], true]);
  assert.equal(present({ id: 9, channel_id: 3, author_id: 'a', body: 'x', reactions: [] }).reply, null);
});
