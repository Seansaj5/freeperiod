// Pure voice logic (no DOM, no network), shared by the voice engine (voice.js) and its unit tests.
// Presence on chat:voice is keyed by user id; each tab in voice tracks one meta { ch, mute, deaf, sess, at }
// (sess: a random id per join, at: when that join started, ISO).
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

const ms = (t) => (typeof t === 'number' ? t : Date.parse(t));
const validCh = (ch) => Number.isSafeInteger(ch) && ch > 0;
const validMeta = (m) => !!m && typeof m === 'object' && validCh(m.ch) && Number.isFinite(ms(m.at));
// newer by at; the same at on two tabs: the bigger sess (so both tabs agree on which one is newer)
const newer = (a, b) => ms(a.at) > ms(b.at) || (ms(a.at) === ms(b.at) && String(a.sess) > String(b.sess));
const byAtThenId = (a, b) => (ms(a.at) - ms(b.at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// supabase presenceState() ({ [user id]: [meta, ...] }) -> Map<channel id, [{ id, mute, deaf, sess, at }]>, first joined
// first. Metas with no valid channel id (a positive integer) or no readable at are dropped; then each user counts once,
// with their newest meta.
export function rosterFromPresence(state) {
  const out = new Map();
  for (const [id, metas] of Object.entries(state && typeof state === 'object' ? state : {})) {
    let best = null;
    for (const m of Array.isArray(metas) ? metas : []) if (validMeta(m) && (!best || newer(m, best))) best = m;
    if (!best) continue;
    if (!out.has(best.ch)) out.set(best.ch, []);
    out.get(best.ch).push({ id, mute: !!best.mute, deaf: !!best.deaf, sess: String(best.sess ?? ''), at: best.at });
  }
  for (const list of out.values()) list.sort(byAtThenId);
  return out;
}

// Is there a newer voice session of mine (another tab) in presence? Then this one hands over.
export function supersededBy(myId, mySess, myAt, state) {
  const metas = state && typeof state === 'object' && Array.isArray(state[myId]) ? state[myId] : [];
  const mine = { sess: mySess, at: myAt };
  return metas.some((m) => validMeta(m) && m.sess !== mySess && newer(m, mine));
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
