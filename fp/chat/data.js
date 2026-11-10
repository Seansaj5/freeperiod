// Chat data layer: every read and write the chat views make, backed by Supabase (the client from client.js).
// Refusals come back as ChatError { code, detail? } in the database's own vocabulary (slow_down, muted, banned,
// everyone_owner_only, owner_only_channel, dm_refused, group_full, not_allowed, emoji_full, storage_full, folder_full,
// '23505'), plus network (no answer), discarded (a send the person cancelled) and bad_file (planUpload said no).
// chatError(e) turns any error, ours or a raw supabase-js one, into the line the UI shows.
//
// Realtime: one Postgres Changes channel carries messages + reactions for every conversation the views subscribe to
// (RLS decides what each person receives); one more carries profiles, channels, DM membership and emoji. Typing and presence
// are Broadcast / Presence on PRIVATE channels, authorized by realtime.messages policies:
//   chat:presence            every member
//   chat:typing:c:<id>       members (channel typing)
//   chat:typing:d:<uuid>     members of that DM only
import { getChat, me as sessionMe } from './client.js';
import { planUpload, reencode as reencodePicture } from './media.js';

// ---------- errors ----------
export class ChatError extends Error {
  constructor(code, detail, cause) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
    if (detail != null && detail !== '') this.detail = detail;
    if (cause) this.cause = cause;
  }
}
const fail = (code, detail, cause) => new ChatError(code, detail, cause);
const CODES = new Set(['slow_down', 'muted', 'banned', 'everyone_owner_only', 'owner_only_channel', 'dm_refused', 'group_full',
  'not_allowed', 'emoji_full', 'storage_full', 'folder_full', 'network', 'discarded', 'bad_file']);
const NETWORK = /failed to fetch|fetch failed|networkerror|network request failed|load failed|network/i;
const ABORTED = /^(AbortError|TimeoutError)\b/; // postgrest-js: "<name>: <message>" for a fetch our timeout aborted
// "new row for relation "channels" violates check constraint "channels_name_check"" -> 'name'
const checkField = (msg) => { const m = /constraint "\w+?_(\w+?)_check"/.exec(String(msg || '')); return m ? m[1] : undefined; };

// Any error (ours, a PostgREST / RPC error object, a Storage error, a fetch TypeError) -> ChatError.
function toChatError(e) {
  if (e instanceof ChatError) return e;
  if (!e) return fail('error');
  const msg = String(e.message || '');
  const code = e.code == null ? '' : String(e.code);
  // fetch failures: TypeError 'Failed to fetch' (Chrome) / 'Load failed' (Safari) / 'NetworkError ...' (Firefox) / 'fetch failed'
  // (node); storage-js wraps them as StorageUnknownError. Any other TypeError is a bug, not a dropped connection.
  if (e.name === 'AbortError' || e.name === 'TimeoutError' || ABORTED.test(msg)
      || ((e.name === 'TypeError' || e.name === 'StorageUnknownError') && NETWORK.test(msg + ' ' + String(e.originalError && e.originalError.message || '')))) {
    return fail('network', undefined, e);
  }
  if (e.name === 'StorageApiError' || e.__isStorageError) {
    // Every refusal is HTTP 400; the real answer is the body: message (our trigger's code, or the API's text), code
    // (AccessDenied, KeyAlreadyExists, InvalidMimeType, EntityTooLarge, NoSuchKey) and statusCode (a string: "403", ...).
    if (CODES.has(msg)) return fail(msg, undefined, e);             // slow_down / storage_full / folder_full / not_allowed
    const st = String(e.statusCode || '');
    if (code === 'KeyAlreadyExists' || st === '409' || /already exists/i.test(msg)) return fail('23505', undefined, e);
    if (code === 'EntityTooLarge' || st === '413' || /maximum allowed size|too large/i.test(msg)) return Object.assign(fail('bad_file', undefined, e), { reason: 'That picture is too big' });
    if (code === 'InvalidMimeType' || st === '415' || /mime type/i.test(msg)) return Object.assign(fail('bad_file', undefined, e), { reason: 'Only PNG, JPEG, WebP or GIF pictures' });
    if (code === 'AccessDenied' || code === 'NoSuchKey' || ['401', '403', '404'].includes(st) || /row-level security|not found|not authorized|unauthorized/i.test(msg)) {
      return fail('not_allowed', undefined, e);
    }
    return fail('error', msg, e);
  }
  if (CODES.has(code)) return Object.assign(fail(code, e.detail, e), e.reason ? { reason: e.reason } : {});
  // PostgREST: an empty code with a fetch message = the request never got an answer (check() also maps status 0)
  if (!code && NETWORK.test(msg)) return fail('network', undefined, e);
  if (CODES.has(msg)) return fail(msg, e.details || e.detail, e);   // raise exception '<code>' (P0001), 42501 storage caps
  if (code === '23505') return fail('23505', e.details, e);
  if (code === '23514') return fail('not_allowed', checkField(msg), e);
  if (code === '42501' || code === '23503' || code === '22001' || code === '22P02' || code === '23502' || code === 'PGRST116' || code === 'PGRST204' || code === '42703') {
    return fail('not_allowed', undefined, e);
  }
  return fail('error', msg || code, e);
}
const check = (r) => {
  if (r && r.error) throw r.status === 0 ? fail('network', undefined, r.error) : toChatError(r.error);
  return r ? r.data : null;
};

export function chatError(e) {
  let x;
  try { x = toChatError(e); } catch { return 'Something went wrong'; }
  const code = x.code;
  if (code === 'muted') {
    const until = Date.parse(x.detail || '');
    const min = Number.isFinite(until) ? Math.max(1, Math.ceil((until - Date.now()) / 60e3)) : 9;
    return 'You’re timed out for ' + min + ' min';
  }
  if (code === 'bad_file') return x.reason || (e && e.reason) || 'That picture can’t be used';
  return ({
    slow_down: 'Slow down a little', banned: 'You’re banned from chat', everyone_owner_only: 'Only Sean can ping everyone',
    owner_only_channel: 'Only Sean and mods post here', dm_refused: 'They aren’t taking DMs from you', group_full: 'Groups hold up to 10 people',
    not_allowed: 'You can’t do that', emoji_full: 'The server already has 50 emoji', '23505': 'That name is already taken',
    storage_full: 'Your picture space is full. Delete some old pictures first', folder_full: 'Too many pictures at once. Try again in a moment',
    network: 'no connection', discarded: 'Not sent',
  })[code] || 'Something went wrong';
}

// ---------- client + who I am (test seam: one injected client per signed-in test user) ----------
let seam = null;
const reencoder = { fn: reencodePicture };
// A send that gets no answer at all (captive portal, a stalled school network) fails as `network` instead of hanging:
// the insert after 30 s, an upload after 30 s plus 10 s per MB (about 100 KB/s).
const limits = { insertMs: 30000, uploadMs: 30000, uploadBytesPerMs: 100 };
export function _inject({ client, me, reencode, limits: l } = {}) {
  if (client || me) seam = { client, me };
  if (reencode) reencoder.fn = reencode;
  if (l) Object.assign(limits, l);
}
function sb() {
  const c = seam && seam.client ? seam.client : getChat();
  if (!c) throw fail('not_allowed', 'chat is off');
  return c;
}
const meNow = () => (seam && seam.me ? seam.me() : sessionMe());
const myId = () => { const m = meNow(); return (m && m.id) || null; };
const needMe = () => { const id = myId(); if (!id) throw fail('not_allowed'); return id; };
const tkey = (t) => (t && t.dm ? 'd:' + t.dm : 'c:' + (t && t.channel));
const keyOfRow = (m) => (m.dm_id ? 'd:' + m.dm_id : 'c:' + m.channel_id);
const uuid = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
async function myRole() { return check(await sb().rpc('my_role')) || 'guest'; }
async function ownerOnly() { if ((await myRole()) !== 'owner') throw fail('not_allowed'); }

// message id -> 'c:<id>' | 'd:<uuid>' for every message this page has loaded or received: routes reaction events
const where = new Map();
function remember(id, key) {
  if (id == null) return;
  where.delete(id);
  where.set(id, key);
  if (where.size > 5000) where.delete(where.keys().next().value);
}

// ---------- messages ----------
const AUTHOR = 'author:profiles!author_id(*)';
const MSG_SELECT = '*, ' + AUTHOR + ', reactions(emoji, user_id), reply:reply_to(id, author_id, body, deleted, attachments, created_at, ' + AUTHOR + ')';

function present(row) {
  if (!row) return row;
  const me = myId();
  const out = { ...row };
  const by = new Map();
  for (const r of Array.isArray(row.reactions) ? row.reactions : []) {
    if (!r || !r.emoji) continue;
    const x = by.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    x.count++;
    if (me && r.user_id === me) x.mine = true;
    by.set(r.emoji, x);
  }
  out.reactions = [...by.values()];
  if (row.reply) {
    const o = row.reply;
    out.reply = { id: o.id, author_id: o.author_id, author: o.author || null, body: o.deleted ? '' : o.body, deleted: !!o.deleted,
      attachments: o.deleted ? [] : (Array.isArray(o.attachments) ? o.attachments : []), created_at: o.created_at };
  } else out.reply = null;
  if (!Array.isArray(out.attachments)) out.attachments = [];
  if (out.deleted) { out.body = ''; out.attachments = []; }
  remember(out.id, keyOfRow(out));
  return out;
}

export async function listChannels() {
  return check(await sb().from('channels').select('*').order('position').order('id'));
}

export async function loadMessages(target, { before, limit = 50 } = {}) {
  let q = sb().from('messages').select(MSG_SELECT);
  q = target && target.dm ? q.eq('dm_id', target.dm) : q.eq('channel_id', target && target.channel);
  if (before != null) q = q.lt('id', before);
  const rows = check(await q.order('id', { ascending: false }).limit(Math.max(1, Math.min(100, limit | 0 || 50))));
  return (rows || []).reverse().map(present);
}

// Sends. A job stays queued (Retry) until it is stored or discarded; its client_id never changes, so a retry of a send
// whose answer was lost hits the unique (author_id, client_id) index (23505) and resolves with the stored row.
let tempN = 0;
const queue = new Map(); // tempId -> job
// Refusals that prove the insert stored nothing. Anything else (no answer, an unknown error) may have been stored.
const REFUSED = new Set(['slow_down', 'muted', 'banned', 'everyone_owner_only', 'owner_only_channel', 'dm_refused', 'not_allowed', 'bad_file']);

export function sendMessage(target, { body = '', replyTo, files = [], clientId, onPending } = {}) {
  const tempId = 'tmp-' + (++tempN) + '-' + Date.now().toString(36);
  // Each picture keeps its re-encoded blob and its storage path across Retries: an upload whose answer was lost is
  // found again (409 on the same name = it is there) instead of being uploaded twice.
  const job = { tempId, uid: myId(), target: { ...target }, body: String(body ?? ''), replyTo: replyTo ?? null, files: [...(files || [])].slice(0, 4),
    clientId: clientId || uuid(), blobs: [], paths: [], atts: [], tried: false, maybeStored: false, cancelled: false, run: null };
  queue.set(tempId, job);
  if (onPending) {
    try {
      onPending({ pending: true, tempId, client_id: job.clientId, channel_id: target.dm ? null : target.channel ?? null, dm_id: target.dm || null,
        author_id: myId(), body: job.body, reply_to: job.replyTo, attachments: [], created_at: new Date().toISOString() });
    } catch { /* the view's problem, not the send's */ }
  }
  return deliver(job);
}

export function retrySend(tempId) {
  const job = queue.get(tempId);
  if (!job) return Promise.reject(fail('not_allowed'));
  return deliver(job);
}

// Removes a job's uploaded pictures (best effort: a leftover only waits for the server's media cleanup).
function dropUploads(job) {
  const atts = job.atts.splice(0);
  const byBucket = {};
  for (const a of atts) (byBucket[a.bucket] = byBucket[a.bucket] || []).push(a.path);
  for (const [b, paths] of Object.entries(byBucket)) Promise.resolve().then(() => sb().storage.from(b).remove(paths)).catch(() => {});
}

// Cancels a queued or retrying send (sync, never throws). A send the server already accepted can't be undone: its row
// just arrives. Its uploaded pictures count toward the person's 150 MB, so they go too (when a running attempt ends, if
// one is running), unless the message may have been stored with them: then only once a lookup by client_id shows it wasn't.
export function discardSend(tempId) {
  const job = queue.get(tempId);
  queue.delete(tempId);
  if (!job) return;
  job.cancelled = true;
  if (!job.run) cleanupDiscarded(job);
}
function cleanupDiscarded(job) {
  if (job.sent) return;
  // a picture whose upload timed out may still have landed: it was never part of an insert, so it can always go
  const unsent = job.paths.filter((p) => p && !job.atts.some((a) => a.path === p));
  if (unsent.length) Promise.resolve().then(() => sb().storage.from(job.target.dm ? 'dm-media' : 'public-media').remove(unsent)).catch(() => {});
  if (!job.atts.length) return;
  if (!job.maybeStored) { dropUploads(job); return; } // never inserted, or every insert was refused outright
  const uid = job.uid;
  Promise.resolve()
    .then(() => sb().from('messages').select('id').eq('author_id', uid).eq('client_id', job.clientId).maybeSingle())
    .then((r) => { if (!r.error && !r.data && myId() === uid) dropUploads(job); }, () => {});
}

function deliver(job) {
  if (job.run) return job.run;
  job.run = (async () => {
    try { const m = await deliverOnce(job); job.sent = true; return m; } finally {
      job.run = null;
      if (job.cancelled && !job.sent) cleanupDiscarded(job); // discarded while this attempt ran
    }
  })();
  return job.run;
}

const extOf = (type) => (type === 'image/gif' ? 'gif' : type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp');
// Rejects as `network` when p hasn't settled after ms (the request itself may still finish: callers allow for that).
function within(p, ms) {
  let t = 0;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(fail('network', 'timeout')), ms); })]).finally(() => clearTimeout(t));
}
const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  if (typeof AbortController !== 'function') return null;
  const c = new AbortController();      // (older Safari has no AbortSignal.timeout)
  setTimeout(() => c.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
  return c.signal;
};

async function deliverOnce(job) {
  const gone = () => { if (job.cancelled || !queue.has(job.tempId)) throw fail('discarded'); };
  gone();
  const me = needMe();
  if (job.uid !== me) { queue.delete(job.tempId); throw fail('discarded'); } // made by another account on this computer
  const c = sb();
  const dm = job.target.dm || null;
  const channel = dm ? null : job.target.channel;
  const bucket = dm ? 'dm-media' : 'public-media';
  const prefix = dm ? dm + '/' + me + '/' : 'chat/' + channel + '/' + me + '/';
  for (let i = job.atts.length; i < job.files.length; i++) {
    if (!job.blobs[i]) {
      const f = job.files[i];
      const plan = planUpload({ type: f && f.type, size: f && f.size }, 'chat');
      if (!plan.ok) throw Object.assign(fail('bad_file'), { reason: plan.reason });
      try { job.blobs[i] = plan.mode === 'reencode' ? await reencoder.fn(f, plan) : f; } catch (e) { throw Object.assign(fail('bad_file', undefined, e), { reason: (e && e.message) || 'That picture can’t be used' }); }
      gone();
    }
    const blob = job.blobs[i];
    const path = job.paths[i] || (job.paths[i] = prefix + uuid() + '.' + extOf(blob.type));
    const size = await imageSize(blob);
    const up = await within(c.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' }),
      limits.uploadMs + blob.size / limits.uploadBytesPerMs);
    // already there = an earlier attempt of this send stored it (the name is ours alone) and only its answer was lost
    if (up.error && toChatError(up.error).code !== '23505') throw toChatError(up.error);
    const a = { bucket, path, kind: blob.type === 'image/gif' ? 'gif' : 'image', bytes: blob.size };
    if (size) { a.w = size.w; a.h = size.h; }
    job.atts.push(a);
    gone(); // discarded mid-upload: deliver() cleans up
  }
  job.tried = true;
  let q = c.from('messages').insert({ channel_id: channel ?? null, dm_id: dm, author_id: job.uid, body: job.body, reply_to: job.replyTo,
    attachments: job.atts, client_id: job.clientId }).select(MSG_SELECT);
  const sig = timeoutSignal(limits.insertMs);
  if (sig) q = q.abortSignal(sig);
  const r = await q.single();
  let row;
  if (r.error && String(r.error.code) === '23505') {
    // the same client_id is already stored: an earlier attempt went through and only its answer was lost
    job.maybeStored = true;
    row = check(await c.from('messages').select(MSG_SELECT).eq('author_id', me).eq('client_id', job.clientId).maybeSingle());
    if (!row) throw toChatError(r.error);
  } else if (r.error) {
    const e = r.status === 0 ? fail('network', undefined, r.error) : toChatError(r.error);
    if (!REFUSED.has(e.code)) job.maybeStored = true;
    throw e;
  } else row = r.data;
  queue.delete(job.tempId);
  return present(row);
}

// Width / height from the file header (GIF, PNG, WebP; anything else through createImageBitmap when the browser has it).
async function imageSize(blob) {
  const ok = (w, h) => (Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 16384 && h <= 16384 ? { w, h } : null);
  try {
    const b = new Uint8Array(await blob.slice(0, 40).arrayBuffer());
    const s = (i, j) => String.fromCharCode(...b.slice(i, j));
    if (s(0, 3) === 'GIF') return ok(b[6] | (b[7] << 8), b[8] | (b[9] << 8));
    if (b[0] === 0x89 && s(1, 4) === 'PNG') return ok(((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0);
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') {
      const kind = s(12, 16);
      if (kind === 'VP8 ') return ok((b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
      if (kind === 'VP8L') { const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; return ok((v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1); }
      if (kind === 'VP8X') return ok(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
    }
  } catch { /* fall through */ }
  if (typeof createImageBitmap === 'function') {
    try { const bm = await createImageBitmap(blob); const r = ok(bm.width, bm.height); if (bm.close) bm.close(); return r; } catch { /* unknown size */ }
  }
  return null;
}

// Updates one message. 0 rows back means a no-op (the trigger writes nothing) or a row this person can't change.
async function updateMessage(id, patch, isNoop) {
  const rows = check(await sb().from('messages').update(patch).eq('id', id).select('id'));
  if (rows && rows.length) return;
  const cur = check(await sb().from('messages').select('id, author_id, body, pinned, deleted').eq('id', id).maybeSingle());
  if (cur && !cur.deleted && isNoop(cur)) return;
  throw fail('not_allowed');
}
export async function editMessage(id, body) {
  const me = needMe();
  const text = String(body ?? '');
  await updateMessage(id, { body: text }, (cur) => cur.author_id === me && cur.body === text);
}
// Deleting your own message also removes its pictures (they count toward your 150 MB). A picture an open report names
// stays for Sean while the report is open: storage answers without it, and its path comes back in `underReview`. Staff
// deleting someone else's message leave the files (report evidence; the server's media cleanup takes them later).
export async function deleteMessage(id) {
  const me = myId();
  // The attachments are read first (best effort) so the files can be freed after the delete; a failed read or file
  // removal never fails the delete itself (the server's media cleanup takes leftover files later).
  let cur = null;
  if (me) { try { cur = (await sb().from('messages').select('author_id, attachments').eq('id', id).maybeSingle()).data || null; } catch { cur = null; } }
  await updateMessage(id, { deleted: true }, () => false);
  const out = { underReview: [] };
  if (!cur || cur.author_id !== me || !Array.isArray(cur.attachments)) return out;
  const byBucket = {};
  for (const a of cur.attachments) if (a && a.path && !a.expired && (a.bucket === 'public-media' || a.bucket === 'dm-media')) (byBucket[a.bucket] = byBucket[a.bucket] || []).push(a.path);
  for (const [b, paths] of Object.entries(byBucket)) {
    try {
      const r = await sb().storage.from(b).remove(paths);
      if (r.error) continue;
      const gone = new Set((r.data || []).map((o) => o.name));
      for (const p of paths) if (!gone.has(p)) out.underReview.push(p);
    } catch { /* deleted either way */ }
  }
  return out;
}
export async function pin(id, on) {
  await updateMessage(id, { pinned: !!on }, (cur) => cur.pinned === !!on);
}
export async function react(id, emoji, on) {
  const me = needMe();
  if (on) {
    const r = await sb().from('reactions').insert({ message_id: id, emoji });
    if (r.error && String(r.error.code) === '23505') return; // already there
    check(r);
  } else {
    check(await sb().from('reactions').delete().eq('message_id', id).eq('user_id', me).eq('emoji', emoji));
  }
}

export async function markRead(target) {
  if (!myId()) return;
  const r = await sb().from('reads').upsert({ target: tkey(target) }, { onConflict: 'user_id,target' });
  if (r.error) {
    const e = toChatError(r.error);
    if (e.code === 'not_allowed' && target && target.dm) return; // a DM this person has left
    throw e;
  }
}
export async function unreadCounts() {
  if (!myId()) return [];
  return check(await sb().rpc('unread_counts')) || [];
}

// ---------- realtime: messages + reactions ----------
const live = { ch: null, client: null, uid: null, subs: new Map(), status: 'connecting', n: 0 };
const each = (key, fn) => { for (const hd of [...(live.subs.get(key) || [])]) { try { fn(hd); } catch (e) { console.error(e); } } };
function setLive(s) {
  if (live.status === s) return;
  live.status = s;
  for (const key of live.subs.keys()) each(key, (hd) => hd.status && hd.status(s));
}
function onRow(kind, row) {
  if (!row || row.id == null) return;
  const key = keyOfRow(row);
  remember(row.id, key);
  if (row.deleted) row = { ...row, body: '', attachments: [] };
  if (kind === 'insert' && row.dm_id && !live.subs.has(key)) { emitServer('dmMessage', row); return; } // a DM this page doesn't know yet
  each(key, (hd) => hd[kind] && hd[kind](row));
}
function onReact(row, on) {
  if (!row || row.message_id == null) return;
  const ev = { message_id: row.message_id, user_id: row.user_id, emoji: row.emoji, on };
  // Every message the views show was loaded or received here (so it is in `where`); a reaction on any other message
  // has nothing to update. (Asking the database where it lives would cost a query per client per reaction.)
  const key = where.get(row.message_id);
  if (key) each(key, (hd) => hd.react && hd.react(ev));
}
function startLive() {
  const c = sb();
  live.client = c;
  live.uid = myId();
  live.status = 'connecting';
  const ch = c.channel('chat-db-' + (++live.n) + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onRow('insert', p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => onRow('update', p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (p) => onReact(p.new, true))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (p) => onReact(p.old, false))
    .on('system', {}, (p) => {
      if (live.ch !== ch || !p || p.extension !== 'postgres_changes') return;
      setLive(p.status === 'ok' ? 'live' : 'reconnecting');
    });
  live.ch = ch;
  ch.subscribe((s) => {
    if (live.ch !== ch) return;
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setLive('reconnecting');
    // errored / timed-out channels rejoin by themselves; a channel the server closed does not: start a new one
    if (s === 'CLOSED') setTimeout(() => { if (live.ch === ch && live.subs.size) { stopLive(); startLive(); } }, 2000);
  });
}
function stopLive() {
  const { ch, client } = live;
  live.ch = null; live.client = null;
  if (ch && client) client.removeChannel(ch).catch(() => {});
}

// handlers.status: 'connecting' (the first join: rows sent before it is live are not delivered, so catch up once 'live'
// comes, no banner), 'live', 'reconnecting'. Inserts into a DM nobody subscribed to go to subscribeServer's dmMessage.
export function subscribe(target, handlers = {}) {
  const key = tkey(target);
  // one client for every account (client.js): a new account gets a new channel, joined with its own token
  if (live.ch && (live.client !== sb() || live.uid !== myId())) { stopLive(); where.clear(); }
  if (!live.ch) startLive();
  const set = live.subs.get(key) || new Set();
  live.subs.set(key, set);
  const hd = { ...handlers };
  set.add(hd);
  if (live.status !== 'live' && hd.status) { const s0 = live.status; setTimeout(() => { if (set.has(hd) && live.status === s0) hd.status(s0); }, 0); }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set.delete(hd);
    if (!set.size) live.subs.delete(key);
    if (!live.subs.size) stopLive();
  };
}

// ---------- realtime: profiles, channels, DM membership, emoji (+ dmMessage for DMs nobody subscribed to) ----------
const server = { ch: null, client: null, uid: null, subs: new Set(), n: 0, status: 'connecting' };
function emitServer(kind, payload) { for (const hd of [...server.subs]) { try { if (hd[kind]) hd[kind](payload); } catch (e) { console.error(e); } } }
function startServer(c) {
  server.client = c;
  server.uid = myId();
  server.status = 'connecting';
  const ch = c.channel('chat-srv-' + (++server.n) + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (p) => emitServer('profile', p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => emitServer('profile', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, (p) => {
      const type = String(p.eventType || '').toLowerCase();
      emitServer('channel', { type, row: type === 'delete' ? { id: p.old && p.old.id } : p.new });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_members' }, (p) => emitServer('dmMember', { type: 'insert', dm_id: p.new.dm_id, user_id: p.new.user_id }))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_members' }, (p) => emitServer('dmMember', { type: 'delete', dm_id: p.old.dm_id, user_id: p.old.user_id }))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emoji' }, (p) => emitServer('emoji', { type: 'insert', row: p.new }))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'emoji' }, (p) => emitServer('emoji', { type: 'delete', row: { name: p.old && p.old.name } }))
    .on('system', {}, (p) => {
      if (server.ch !== ch || !p || p.extension !== 'postgres_changes') return;
      server.status = p.status === 'ok' ? 'live' : 'reconnecting';
      emitServer('status', server.status);
    });
  server.ch = ch;
  ch.subscribe((s) => {
    if (server.ch !== ch) return;
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { server.status = 'reconnecting'; emitServer('status', 'reconnecting'); }
    if (s === 'CLOSED') setTimeout(() => { if (server.ch === ch && server.subs.size) { stopServer(); startServer(sb()); } }, 2000);
  });
}
function stopServer() {
  const { ch, client } = server;
  server.ch = null; server.client = null;
  if (ch && client) client.removeChannel(ch).catch(() => {});
}
export function subscribeServer(handlers = {}) {
  const c = sb();
  if (server.ch && (server.client !== c || server.uid !== myId())) stopServer();
  if (!server.ch) startServer(c);
  const hd = { ...handlers };
  server.subs.add(hd);
  if (server.status === 'live' && hd.status) setTimeout(() => { if (server.subs.has(hd)) hd.status('live'); }, 0);
  return () => { if (server.subs.delete(hd) && !server.subs.size) stopServer(); };
}

// ---------- realtime: presence + typing (private Broadcast / Presence rooms) ----------
// One channel per topic per client while anyone uses it; each handle adds its own listeners. A topic being left is
// fully closed before it is joined again (supabase-js hands back the old channel object for a topic until it has left).
const rooms = new Map();   // topic -> room
const leaving = new Map(); // topic -> Promise
function joinRoom(topic, kind) {
  const c = sb();
  const uid = myId();
  const old = rooms.get(topic);
  if (old && !old.dead && old.client === c && old.uid === uid) { old.refs++; return old; }
  if (old) closeRoom(old);
  const r = { topic, kind, client: c, uid, refs: 1, ch: null, ready: false, dead: false, onTyping: new Set(), onSync: new Set() };
  rooms.set(topic, r);
  connectRoom(r);
  return r;
}
function connectRoom(r) {
  const { topic, kind, client: c, uid } = r;
  (leaving.get(topic) || Promise.resolve()).then(() => {
    if (r.dead) return;
    const ch = c.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key: kind === 'presence' ? uid || '' : '' } } });
    r.ch = ch;
    if (kind === 'presence') ch.on('presence', { event: 'sync' }, () => { for (const fn of [...r.onSync]) fn(); });
    else ch.on('broadcast', { event: 'typing' }, (msg) => { for (const fn of [...r.onTyping]) fn(msg); });
    ch.subscribe((s, err) => {
      if (r.dead || r.ch !== ch) return;
      if (s === 'SUBSCRIBED') {
        r.ready = true;
        if (kind === 'presence' && uid) ch.track({ at: new Date().toISOString() }).catch(() => {}); // again after every rejoin
        return;
      }
      r.ready = false;
      // not authorized (no realtime.messages policy for this topic, or not a member): stop instead of rejoining forever
      if (s === 'CHANNEL_ERROR' && err && /unauthori[sz]ed|permission/i.test(String(err.message || err))) closeRoom(r);
      // closed by the server (errored ones rejoin by themselves): join again on a fresh channel
      else if (s === 'CLOSED') {
        const p = c.removeChannel(ch).catch(() => {}).then(() => { if (leaving.get(topic) === p) leaving.delete(topic); });
        leaving.set(topic, p);
        setTimeout(() => { if (!r.dead && r.ch === ch) { r.ch = null; connectRoom(r); } }, 2000);
      }
    });
  });
}
function closeRoom(r) {
  if (r.dead) return;
  r.dead = true;
  r.ready = false;
  if (rooms.get(r.topic) === r) rooms.delete(r.topic);
  if (!r.ch) return;
  const p = r.client.removeChannel(r.ch).catch(() => {}).then(() => { if (leaving.get(r.topic) === p) leaving.delete(r.topic); });
  leaving.set(r.topic, p);
}
function releaseRoom(r) { if (r && !r.dead && --r.refs <= 0) closeRoom(r); }

let botIds = null;
function bots() { // a failed lookup is not kept: the next sync asks again
  if (!botIds) {
    botIds = Promise.resolve().then(() => sb().from('profiles').select('id').eq('is_bot', true))
      .then((r) => { if (r.error) throw r.error; return (r.data || []).map((x) => x.id); })
      .catch(() => { botIds = null; return []; });
  }
  return botIds;
}
// onSync(ids): everyone online now (user ids), me and the helper bot included.
export function presence({ onSync } = {}) {
  const me = myId();
  const r = joinRoom('chat:presence', 'presence');
  let stopped = false, seen = false;
  const emit = async () => {
    seen = true;
    const ids = new Set(Object.keys((r.ch && !r.dead && r.ch.presenceState()) || {}));
    if (me) ids.add(me);
    for (const b of await bots()) ids.add(b); // the bot never sleeps
    if (!stopped && onSync) { try { onSync([...ids]); } catch (e) { console.error(e); } }
  };
  r.onSync.add(emit);
  if (r.ready) emit();
  const fallback = setTimeout(() => { if (!seen) emit(); }, 1500); // a room that never answers still shows me + the bot
  return { stop() { if (stopped) return; stopped = true; clearTimeout(fallback); r.onSync.delete(emit); releaseRoom(r); } };
}

const TYPING_MS = 4000; // one ping keeps someone "typing" this long (the app pings at most every 2.5 s while they type)
// onTyping(fn): fn([{ id }]) with everyone typing now (not me), again with [] when they stop.
export function typing(target) {
  const r = joinRoom('chat:typing:' + tkey(target), 'typing');
  const fns = new Set();
  const people = new Map(); // user id -> expiry timer
  let stopped = false;
  const emit = () => { if (stopped) return; const list = [...people.keys()].map((id) => ({ id })); for (const fn of fns) { try { fn(list); } catch (e) { console.error(e); } } };
  const onMsg = (msg) => {
    const id = msg && msg.payload && msg.payload.user_id;
    if (stopped || typeof id !== 'string' || id === myId()) return;
    const had = people.has(id);
    clearTimeout(people.get(id));
    people.set(id, setTimeout(() => { people.delete(id); emit(); }, TYPING_MS));
    if (!had) emit();
  };
  r.onTyping.add(onMsg);
  return {
    ping() {
      const me = myId();
      if (stopped || !me || !r.ready || r.dead || !r.ch) return;
      r.ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: me } }).catch(() => {});
    },
    onTyping(fn) { if (typeof fn === 'function') fns.add(fn); },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const t of people.values()) clearTimeout(t);
      people.clear(); fns.clear();
      r.onTyping.delete(onMsg);
      releaseRoom(r);
    },
  };
}

// ---------- DMs ----------
export async function listDMs() {
  if (!myId()) return [];
  const rows = check(await sb().from('dms')
    .select('id, is_group, name, created_by, created_at, pair_key, dm_members(user_id, profile:profiles(*)), messages(*)')
    .order('id', { ascending: false, referencedTable: 'messages' }).limit(1, { referencedTable: 'messages' }));
  return (rows || []).map((d) => {
    const last = Array.isArray(d.messages) && d.messages.length ? { ...d.messages[0] } : null;
    if (last) { remember(last.id, 'd:' + d.id); if (last.deleted) { last.body = ''; last.attachments = []; } }
    const members = (d.dm_members || []).map((m) => m.profile || { id: m.user_id, username: 'someone' });
    return { id: d.id, is_group: d.is_group, name: d.name, created_by: d.created_by, created_at: d.created_at, pair_key: d.pair_key, members, last };
  });
}
export async function startDM(userId) { return check(await sb().rpc('start_dm', { other: userId })); }
export async function createGroup(userIds, name) {
  const clean = String(name ?? '').trim();
  return check(await sb().rpc('create_group', { members: [...new Set(userIds || [])], name: clean }));
}
export async function leaveDM(id) { check(await sb().rpc('leave_dm', { dm: id })); }
export async function addToGroup(id, userId) { check(await sb().rpc('add_to_group', { dm: id, member: userId })); }

// ---------- moderation ----------
export async function setMod(userId, on) { check(await sb().rpc('set_mod', { target: userId, on: !!on })); }
export async function timeout(userId, minutes) { check(await sb().rpc('timeout_user', { target: userId, minutes })); }
export async function setBan(userId, on) { check(await sb().rpc('set_ban', { target: userId, on: !!on })); }

export async function report(messageId, reason = '') {
  needMe();
  if (typeof reason !== 'string' || reason.length > 200) throw fail('not_allowed', 'reason');
  const r = await sb().from('reports').insert({ message_id: messageId, reason });
  if (r.error && String(r.error.code) === '23505') return; // reported before by this person: fine
  check(r);
}
export async function listReports() {
  await ownerOnly();
  const rows = check(await sb().from('reports').select('*, reporter_profile:profiles!reporter(*), message:messages(id, deleted)')
    .order('created_at', { ascending: false }).limit(300)) || [];
  const authorIds = [...new Set(rows.map((r) => r.snapshot && r.snapshot.author_id).filter(Boolean))];
  const authors = new Map();
  if (authorIds.length) for (const p of check(await sb().from('profiles').select('*').in('id', authorIds)) || []) authors.set(p.id, p);
  return rows.map((r) => {
    const { message, ...rest } = r;
    return { ...rest, author: authors.get(r.snapshot && r.snapshot.author_id) || null, message_deleted: !message || !!message.deleted };
  });
}
export async function resolveReport(id, resolved = true) {
  const rows = check(await sb().from('reports').update({ resolved: !!resolved }).eq('id', id).select('id'));
  if (!rows || !rows.length) throw fail('not_allowed');
}

export async function createChannel({ name, emoji = '💬', topic = '', ownerOnly = false } = {}) {
  const last = check(await sb().from('channels').select('position').order('position', { ascending: false }).limit(1));
  const position = last && last.length ? (last[0].position | 0) + 1 : 0;
  return check(await sb().from('channels').insert({ name, emoji, topic, owner_only: !!ownerOnly, position }).select().single());
}
export async function updateChannel(id, patch = {}) {
  const clean = {};
  for (const k of ['name', 'emoji', 'topic', 'owner_only']) if (k in patch) clean[k] = k === 'owner_only' ? !!patch[k] : patch[k];
  const row = check(await sb().from('channels').update(clean).eq('id', id).select().maybeSingle());
  if (!row) throw fail('not_allowed');
  return row;
}
export async function deleteChannel(id) {
  const rows = check(await sb().from('channels').delete().eq('id', id).select('id'));
  if (!rows || !rows.length) throw fail('not_allowed');
}
export async function moveChannel(id, position) {
  if (!Number.isInteger(position)) throw fail('not_allowed', 'position');
  const row = check(await sb().from('channels').update({ position }).eq('id', id).select().maybeSingle());
  if (!row) throw fail('not_allowed');
  return row;
}

// ---------- profiles ----------
export async function listMembers() {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const rows = check(await sb().from('profiles').select('*').order('username').range(from, from + 999)) || [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
export async function getProfile(id) {
  if (!id) return null;
  return check(await sb().from('profiles').select('*').eq('id', id).maybeSingle());
}
const likeSafe = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
export async function findProfiles(prefix) {
  const p = String(prefix ?? '').trim().replace(/^@/, '').toLowerCase().slice(0, 32);
  if (!p) return check(await sb().from('profiles').select('*').order('username').limit(20)) || [];
  const pat = likeSafe(p) + '%';
  const [a, b] = await Promise.all([
    sb().from('profiles').select('*').ilike('username', pat).order('username').limit(20),
    sb().from('profiles').select('*').ilike('display_name', pat).order('username').limit(20),
  ]);
  const seen = new Map();
  for (const row of [...(check(a) || []), ...(check(b) || [])]) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()].sort((x, y) => String(x.username).localeCompare(String(y.username))).slice(0, 20);
}

const USER_COLS = ['display_name', 'pronouns', 'about', 'status_emoji', 'status_text', 'avatar_path', 'banner_path', 'banner_color', 'name_color',
  'dm_policy', 'theme_a', 'theme_b', 'name_color2', 'name_font', 'name_fill', 'name_glow', 'frame', 'effect'];
// One update per Save with the changed columns only (10 per minute). Banned members can't (RLS: 0 rows -> not_allowed).
// A new avatar/banner path deletes the previous file afterwards (each folder holds at most 2).
export async function updateProfile(patch = {}) {
  const me = needMe();
  for (const k of Object.keys(patch)) if (!USER_COLS.includes(k)) throw fail('not_allowed', k);
  const cur = check(await sb().from('profiles').select('*').eq('id', me).maybeSingle());
  if (!cur || cur.banned) throw fail('not_allowed');
  const changed = {};
  for (const [k, v] of Object.entries(patch)) if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(v ?? null)) changed[k] = v;
  if (!Object.keys(changed).length) return cur;
  const rows = check(await sb().from('profiles').update(changed).eq('id', me).select());
  if (!rows || !rows.length) {
    const now = check(await sb().from('profiles').select('*').eq('id', me).maybeSingle());
    if (!now || now.banned) throw fail('not_allowed');
    return now;
  }
  const old = [];
  for (const k of ['avatar_path', 'banner_path']) if (k in changed && cur[k] && cur[k] !== changed[k]) old.push(cur[k]);
  if (old.length) await sb().storage.from('public-media').remove(old); // best effort: a leftover goes on the next upload (strays)
  return rows[0];
}

async function uploadPicture(file, kind) {
  const me = needMe();
  const plan = planUpload({ type: file && file.type, size: file && file.size }, kind);
  if (!plan.ok) throw Object.assign(fail('bad_file'), { reason: plan.reason });
  let blob;
  try { blob = plan.mode === 'reencode' ? await reencoder.fn(file, plan) : file; } catch (e) { throw Object.assign(fail('bad_file', undefined, e), { reason: (e && e.message) || 'That picture can’t be used' }); }
  const col = kind === 'avatar' ? 'avatar_path' : 'banner_path';
  const dir = (kind === 'avatar' ? 'avatars' : 'banners') + '/' + me;
  const store = sb().storage.from('public-media');
  const clearStrays = async () => {
    const cur = check(await sb().from('profiles').select(col + ', banned').eq('id', me).maybeSingle());
    if (!cur || cur.banned) throw fail('not_allowed');
    const files = check(await store.list(dir, { limit: 100 })) || [];
    const strays = files.map((f) => dir + '/' + f.name).filter((p) => p !== cur[col] && !p.endsWith('/.emptyFolderPlaceholder'));
    if (strays.length) check(await store.remove(strays));
  };
  await clearStrays();
  const path = dir + '/' + uuid() + '.' + extOf(blob.type);
  let r = await store.upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  if (r.error && toChatError(r.error).code === 'folder_full') { await clearStrays(); r = await store.upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' }); }
  check(r);
  return { path, bytes: blob.size, type: blob.type };
}
export const uploadAvatar = (file) => uploadPicture(file, 'avatar');
export const uploadBanner = (file) => uploadPicture(file, 'banner');

export async function listBlocks() {
  const me = myId();
  if (!me) return [];
  return (check(await sb().from('blocks').select('blocked').eq('blocker', me)) || []).map((r) => r.blocked);
}
export async function block(userId, on = true) {
  const me = needMe();
  if (!userId || userId === me) throw fail('not_allowed');
  if (on) {
    const r = await sb().from('blocks').insert({ blocked: userId });
    if (r.error && String(r.error.code) === '23505') return;
    check(r);
  } else {
    check(await sb().from('blocks').delete().eq('blocker', me).eq('blocked', userId));
  }
}

// Public pictures by URL; DM pictures through a 1 h signed URL (members, and the owner on a reported one).
const signed = new Map(); // '<my id>|<path>' -> { url, until } (per account: a shared computer can switch accounts)
export async function mediaUrl(a) {
  if (!a || !a.path) throw fail('not_allowed');
  if (a.bucket === 'dm-media') {
    const key = myId() + '|' + a.path;
    const hit = signed.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const d = check(await sb().storage.from('dm-media').createSignedUrl(a.path, 3600));
    const url = d && d.signedUrl;
    if (!url) throw fail('not_allowed');
    signed.set(key, { url, until: Date.now() + 50 * 60e3 });
    if (signed.size > 500) signed.delete(signed.keys().next().value);
    return url;
  }
  return sb().storage.from(a.bucket || 'public-media').getPublicUrl(a.path).data.publicUrl;
}

// ---------- custom emoji (staff manage, everyone uses; at most 50) ----------
const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
export async function listEmoji() { return check(await sb().from('emoji').select('*').order('name')) || []; }
export async function uploadEmoji(name, file) {
  needMe();
  if (!EMOJI_NAME.test(String(name || ''))) throw fail('not_allowed', 'name');
  const plan = planUpload({ type: file && file.type, size: file && file.size }, 'emoji');
  if (!plan.ok) throw Object.assign(fail('bad_file'), { reason: plan.reason });
  let blob;
  try { blob = plan.mode === 'reencode' ? await reencoder.fn(file, plan) : file; } catch (e) { throw Object.assign(fail('bad_file', undefined, e), { reason: (e && e.message) || 'That picture can’t be used' }); }
  const path = 'emoji/' + name + '.' + extOf(blob.type);
  const store = sb().storage.from('public-media');
  const put = () => store.upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  let up = await put();
  if (up.error && toChatError(up.error).code === '23505') {
    // a file by that name but no emoji row: left over from a delete whose file removal failed, or an insert that got no
    // answer and wasn't stored. Clear it and upload again; a real emoji of that name is "already taken".
    if (check(await sb().from('emoji').select('name').eq('name', name).maybeSingle())) throw fail('23505');
    await store.remove([path]);
    up = await put();
  }
  check(up);
  const r = await sb().from('emoji').insert({ name, path }).select().single();
  if (r.error) {
    const e = r.status === 0 ? fail('network', undefined, r.error) : toChatError(r.error);
    // the file goes only when the row was certainly refused: without an answer the row may be stored
    if (e.code === 'emoji_full' || e.code === '23505' || e.code === 'not_allowed') await store.remove([path]);
    throw e;
  }
  return r.data;
}
export async function deleteEmoji(name) {
  const rows = check(await sb().from('emoji').delete().eq('name', name).select('path'));
  if (!rows || !rows.length) throw fail('not_allowed');
  // best effort: a file left behind is cleared by the next upload of that name (above)
  await sb().storage.from('public-media').remove(rows.map((r) => r.path));
}

// ---------- friends ----------
export async function listFriends() {
  const me = myId();
  if (!me) return [];
  const rows = check(await sb().from('friends').select('a, b, status, requested_by, created_at, pa:profiles!a(*), pb:profiles!b(*)')) || [];
  return rows.map((f) => {
    const other = f.a === me ? f.b : f.a;
    const profile = (f.a === me ? f.pb : f.pa) || { id: other, username: 'someone' };
    return { other, profile, status: f.status, requested_by: f.requested_by, incoming: f.status === 'pending' && f.requested_by !== me, created_at: f.created_at };
  });
}
export async function friendRequest(username) { return check(await sb().rpc('friend_request', { username: String(username ?? '') })); }
export async function friendRespond(userId, accept) {
  if (userId == null || accept == null) throw fail('not_allowed');
  check(await sb().rpc('friend_respond', { other: userId, accept: !!accept }));
}
export async function friendRemove(userId) { check(await sb().rpc('friend_remove', { other: userId })); }

// ---------- Hallpass: FAQ, settings, usage ----------
export async function listFaq() { return check(await sb().from('faq').select('*').order('position').order('id')) || []; }
function checkFaq(r) {
  const bad = (f) => { throw fail('not_allowed', f); };
  if (!r.question.trim() || [...r.question].length > 120) bad('question');
  if (!r.answer.trim() || [...r.answer].length > 1000) bad('answer');
  const k = r.keywords;
  if (!Array.isArray(k) || k.length > 30 || k.some((w) => typeof w !== 'string' || !w.length || [...w].length > 40)) bad('keywords');
}
export async function saveFaq(item = {}) {
  const row = { question: String(item.question || '').trim(), answer: String(item.answer || '').trim(), keywords: item.keywords == null ? [] : item.keywords };
  checkFaq(row);
  if (Number.isFinite(item.position)) row.position = item.position;
  if (item.id != null) {
    const got = check(await sb().from('faq').update(row).eq('id', item.id).select().maybeSingle());
    if (!got) throw fail('not_allowed');
    return got;
  }
  if (row.position == null) {
    const last = check(await sb().from('faq').select('position').order('position', { ascending: false }).limit(1));
    row.position = last && last.length ? (last[0].position | 0) + 1 : 1;
  }
  return check(await sb().from('faq').insert(row).select().single());
}
export async function deleteFaq(id) {
  const rows = check(await sb().from('faq').delete().eq('id', id).select('id'));
  if (!rows || !rows.length) throw fail('not_allowed');
}
export async function getBotSettings() {
  const row = check(await sb().from('bot_settings').select('id, ai_on').eq('id', 1).maybeSingle());
  return { id: 1, ai_on: !!(row && row.ai_on) };
}
export async function getOwnerBotSettings() {
  const rows = check(await sb().rpc('get_bot_settings'));
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw fail('not_allowed');
  return row;
}
export async function setBotSettings(patch = {}) {
  const clean = {};
  if ('ai_on' in patch) { if (typeof patch.ai_on !== 'boolean') throw fail('not_allowed', 'ai_on'); clean.ai_on = patch.ai_on; }
  if ('extra_instructions' in patch) {
    if (typeof patch.extra_instructions !== 'string' || [...patch.extra_instructions].length > 1000) throw fail('not_allowed', 'extra_instructions');
    clean.extra_instructions = patch.extra_instructions;
  }
  if (Object.keys(clean).length) {
    // only id / ai_on / updated_at are readable by members, so ask for id back (0 rows = not the owner)
    const rows = check(await sb().from('bot_settings').update(clean).eq('id', 1).select('id'));
    if (!rows || !rows.length) throw fail('not_allowed');
  }
  return getOwnerBotSettings();
}
export async function botUsage() {
  await ownerOnly();
  const day = new Date().toISOString().slice(0, 10);
  return check(await sb().from('bot_usage').select('*').eq('day', day).order('count', { ascending: false })) || [];
}

// Pure helpers, exported for the repo's unit tests (tests/chat-data.test.mjs).
export const _internals = { toChatError, imageSize, present, likeSafe, checkField };
