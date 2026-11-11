// Pure voice logic (no DOM, no network), shared by the voice engine (voice.js) and its unit tests.
// Presence on chat:voice is keyed by user id; each tab in voice tracks one meta { ch, mute, deaf, sess, at }. Presence is
// whatever a client sends (any key, any sess, any at), so the engine trusts it only through the registry: the
// voice_sessions table (0013), one row per person { user_id, sess, channel_id, at } written by the server (voice_join)
// with the server's time. A presence entry counts only when its key, sess and ch match that person's row, and people
// are ordered by the row's `at`.
export const VOICE_MAX = 8;        // people per voice channel (full mesh)
export const ICE_WAIT_MS = 2000;   // longest wait for ICE gathering before an SDP is sent anyway
export const SPEAK_HOLD_MS = 250;  // "speaking" stays on this long after the last loud frame
export const KICK_MS = 60000;      // a staff disconnect keeps someone out of that channel this long

// {name} = the channel's display name (sidebarlogic voiceLabel)
export const VOICE_ERRORS = Object.freeze({
  mic: 'Allow the microphone to join voice',
  nomic: 'No microphone found',
  full: '{name} is full (8 people)',
  kicked: 'A mod disconnected you from voice',
  blocked: 'You can’t join voice while timed out or banned',
  lost: 'Voice connection lost',
  moved: 'You joined voice in another tab',
  gone: 'That voice channel was deleted',
});

// The smaller user id makes the offer, so a pair never offers at the same time.
export const isOfferer = (myId, peerId) => String(myId) < String(peerId);

// ISO text (Postgres sends microseconds: trimmed to milliseconds, which every engine parses) or ms -> ms
export const timeMs = (t) => (typeof t === 'number' ? t : Date.parse(typeof t === 'string' ? t.replace(/(\.\d{3})\d+/, '$1') : t));
const ms = timeMs;
const validCh = (ch) => Number.isSafeInteger(ch) && ch > 0;
// newer by at; the same at: the bigger sess (so every client agrees which one is newer)
const newer = (a, b) => ms(a.at) > ms(b.at) || (ms(a.at) === ms(b.at) && String(a.sess) > String(b.sess));
const byAtThenId = (a, b) => (ms(a.at) - ms(b.at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// A voice_sessions row (database or Realtime) -> { id, sess, ch, at (ms) }, or null when it is not a readable session.
export function sessionRow(r) {
  if (!r || typeof r !== 'object' || typeof r.user_id !== 'string' || !r.user_id || typeof r.sess !== 'string' || !r.sess) return null;
  const ch = Number(r.channel_id), at = ms(r.at);
  return validCh(ch) && Number.isFinite(at) ? { id: r.user_id, sess: r.sess, ch, at } : null;
}

// One registry change ({ type: 'insert' | 'update' | 'delete', row }) applied to reg (Map<user id, sessionRow>). A row
// older than the one already there is a late event of a replaced session: ignored. Returns true when reg changed.
export function applySession(reg, ev) {
  if (!(reg instanceof Map) || !ev || !ev.row) return false;
  if (ev.type === 'delete') return typeof ev.row.user_id === 'string' && reg.delete(ev.row.user_id);
  const s = sessionRow(ev.row);
  if (!s) return false;
  const prev = reg.get(s.id);
  if (prev && (s.at < prev.at || (prev.at === s.at && prev.sess === s.sess && prev.ch === s.ch))) return false;
  reg.set(s.id, s);
  return true;
}

// supabase presenceState() ({ [key]: [meta, ...] }) + the registry -> Map<channel id, [{ id, mute, deaf, sess, at }]>,
// first joined first (registry at, then id). Only verified entries: the key has a registry row and one of its metas
// carries that row's sess and ch (a meta under someone else's key, an old sess or another channel counts for nothing).
// sess and at come from the row; mute / deaf from the meta.
export function rosterFromPresence(state, registry) {
  const out = new Map();
  if (!(registry instanceof Map) || !state || typeof state !== 'object') return out;
  for (const [id, metas] of Object.entries(state)) {
    const row = registry.get(id);
    if (!row) continue;
    const m = (Array.isArray(metas) ? metas : []).find((x) => !!x && typeof x === 'object' && x.sess === row.sess && x.ch === row.ch);
    if (!m) continue;
    if (!out.has(row.ch)) out.set(row.ch, []);
    out.get(row.ch).push({ id, mute: !!m.mute, deaf: !!m.deaf, sess: row.sess, at: row.at });
  }
  for (const list of out.values()) list.sort(byAtThenId);
  return out;
}

// Has a newer voice session of mine (another tab) replaced this one in the registry? Then this one hands over.
export function supersededBy(myId, mySess, myAt, registry) {
  const row = registry instanceof Map ? registry.get(myId) : null;
  return !!row && row.sess !== mySess && newer(row, { sess: mySess, at: myAt });
}

// kicks: [{ target, channel_id, until }] (until: ISO or ms). Me already in the room (another tab) is not counted.
export function canJoin({ roster, channelId, myId, kicks = [], now = Date.now() } = {}) {
  const ch = Number(channelId);
  for (const k of Array.isArray(kicks) ? kicks : []) {
    if (k && k.target === myId && Number(k.channel_id) === ch && ms(k.until) > now) return { ok: false, reason: 'kicked' };
  }
  const others = ((roster && roster.get(ch)) || []).filter((p) => p.id !== myId).length;
  return others >= VOICE_MAX ? { ok: false, reason: 'full' } : { ok: true };
}

export function peerDiff(current, wanted) {
  return { add: [...wanted].filter((id) => !current.has(id)), drop: [...current].filter((id) => !wanted.has(id)) };
}

// One analyser frame: level = RMS of the samples (0..1).
export function speakingStep(prev, level, now, threshold = 0.04) {
  const before = prev && Number.isFinite(prev.lastLoud) ? prev.lastLoud : -Infinity;
  const lastLoud = level >= threshold ? now : before;
  return { speaking: now - lastLoud < SPEAK_HOLD_MS, lastLoud };
}
