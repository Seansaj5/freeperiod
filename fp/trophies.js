// Free Period trophies: the list and the rules (pure: no DOM, no storage; tested in tests/trophies.test.mjs).
// Each rule reads `facts` (gathered by fp/trophy-data.js from data the hub already has) and returns { have, need }.
// A fact that is null is unknown (logged out, Bing Ball asleep, chat off): its trophies stay as they were.
//   src  where the facts come from: 'local' (this device: play time, favorites, saves), 'account' (signed in),
//        'streak' (the daily streak), 'bb' (the Bing Ball career card), 'chat' (a chat profile)
//   tier bronze / silver / gold: the medal's color

const HOUR = 3600;
const count = (o) => Object.values(o || {}).filter((v) => Number(v) > 0).length;
// play time counts only games on the list (an old id in the stored meta is not a game any more)
const listed = (f) => Object.entries(f.play || {}).filter(([id]) => !Array.isArray(f.games) || f.games.includes(id)).map(([, v]) => (Number(v) > 0 ? Number(v) : 0));
const sum = (f) => listed(f).reduce((a, v) => a + v, 0);
const n0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const at = (facts, test) => (facts.times || []).some((t) => Number.isFinite(t) && t > 0 && test(new Date(t)));

/** Games played (any play time or a "recent" entry), counted only for games on the list. */
export function playedGames(facts) {
  const ids = new Set(facts.games || []);
  const out = new Set();
  for (const [id, s] of Object.entries(facts.play || {})) if (ids.has(id) && Number(s) > 0) out.add(id);
  for (const [id, t] of Object.entries(facts.recent || {})) if (ids.has(id) && Number(t) > 0) out.add(id);
  return out;
}

export const TROPHIES = Object.freeze([
  // ---- Free Period ----
  { id: 'first-game', group: 'Free Period', title: 'First Game', desc: 'Play any game on Free Period.', icon: 'play', tier: 'bronze', src: 'local',
    rule: (f) => ({ have: Math.min(1, playedGames(f).size), need: 1 }) },
  { id: 'try-all', group: 'Free Period', title: (f) => `Try All ${Math.max(1, (f.games || []).length)}`, desc: 'Play every game on Free Period.', icon: 'games', tier: 'silver', src: 'local',
    rule: (f) => ({ have: playedGames(f).size, need: Math.max(1, (f.games || []).length) }) },
  { id: 'hour-1', group: 'Free Period', title: 'Warmed Up', desc: 'Play for 1 hour in total.', icon: 'clock', tier: 'bronze', src: 'local', unit: 'time',
    rule: (f) => ({ have: sum(f), need: HOUR }) },
  { id: 'hours-10', group: 'Free Period', title: '10 Hours Played', desc: 'Play for 10 hours in total.', icon: 'clock', tier: 'gold', src: 'local', unit: 'time',
    rule: (f) => ({ have: sum(f), need: 10 * HOUR }) },
  { id: 'main-game', group: 'Free Period', title: 'Main Character', desc: 'Play one game for 3 hours.', icon: 'crown', tier: 'silver', src: 'local', unit: 'time',
    rule: (f) => ({ have: Math.max(0, ...listed(f)), need: 3 * HOUR }) },
  { id: 'favorite', group: 'Free Period', title: 'Star Struck', desc: 'Favorite a game.', icon: 'star', tier: 'bronze', src: 'local',
    rule: (f) => ({ have: Math.min(1, (f.favs || []).length), need: 1 }) },
  { id: 'night-owl', group: 'Free Period', title: 'Night Owl', desc: 'Play after 9 pm.', icon: 'moon', tier: 'bronze', src: 'local',
    rule: (f) => ({ have: at(f, (d) => d.getHours() >= 21 || d.getHours() < 4) ? 1 : 0, need: 1 }) },
  { id: 'early-bird', group: 'Free Period', title: 'Early Bird', desc: 'Play before 7 am.', icon: 'sunrise', tier: 'silver', src: 'local',
    rule: (f) => ({ have: at(f, (d) => d.getHours() >= 4 && d.getHours() < 7) ? 1 : 0, need: 1 }) },
  { id: 'weekend', group: 'Free Period', title: 'Weekend Mode', desc: 'Play on a Saturday or Sunday.', icon: 'calendar', tier: 'bronze', src: 'local',
    rule: (f) => ({ have: at(f, (d) => d.getDay() === 0 || d.getDay() === 6) ? 1 : 0, need: 1 }) },
  { id: 'signed-in', group: 'Free Period', title: 'Official', desc: 'Log in to a Free Period account.', icon: 'key', tier: 'bronze', src: 'account',
    rule: (f) => (f.signedIn == null ? null : { have: f.signedIn ? 1 : 0, need: 1 }) },
  { id: 'streak-3', group: 'Free Period', title: 'On a Roll', desc: 'Reach a 3-day streak.', icon: 'flame', tier: 'bronze', src: 'streak', unit: 'days',
    rule: (f) => (f.streak ? { have: Math.max(n0(f.streak.days), n0(f.streak.best)), need: 3 } : null) },
  { id: 'streak-7', group: 'Free Period', title: '7-Day Streak', desc: 'Reach a 7-day streak.', icon: 'flame', tier: 'silver', src: 'streak', unit: 'days',
    rule: (f) => (f.streak ? { have: Math.max(n0(f.streak.days), n0(f.streak.best)), need: 7 } : null) },
  { id: 'streak-30', group: 'Free Period', title: 'Unstoppable', desc: 'Reach a 30-day streak.', icon: 'flame', tier: 'gold', src: 'streak', unit: 'days',
    rule: (f) => (f.streak ? { have: Math.max(n0(f.streak.days), n0(f.streak.best)), need: 30 } : null) },
  { id: 'chatterbox', group: 'Free Period', title: 'Chatterbox', desc: 'Join chat in Messages and get a chat profile.', icon: 'chat', tier: 'bronze', src: 'chat',
    rule: (f) => (f.chat == null ? null : { have: f.chat ? 1 : 0, need: 1 }) },
  // ---- Bing Ball (the public career card) ----
  { id: 'bb-win', group: 'Bing Ball', game: 'bing-ball', title: 'First Win', desc: 'Win a Bing Ball match.', icon: 'ball', tier: 'bronze', src: 'bb',
    rule: (f) => (f.bb ? { have: Math.min(1, n0(f.bb.wins)), need: 1 } : null) },
  { id: 'bb-goals', group: 'Bing Ball', game: 'bing-ball', title: 'Sharpshooter', desc: 'Score 50 goals in Bing Ball.', icon: 'target', tier: 'silver', src: 'bb',
    rule: (f) => (f.bb ? { have: n0(f.bb.goals), need: 50 } : null) },
  { id: 'bb-mvp', group: 'Bing Ball', game: 'bing-ball', title: 'MVP', desc: 'Be the MVP of a Bing Ball match.', icon: 'medal', tier: 'silver', src: 'bb',
    rule: (f) => (f.bb ? { have: Math.min(1, n0(f.bb.mvps)), need: 1 } : null) },
  { id: 'bb-level', group: 'Bing Ball', game: 'bing-ball', title: 'Level 10', desc: 'Reach level 10 in Bing Ball.', icon: 'bolt', tier: 'gold', src: 'bb',
    rule: (f) => (f.bb ? { have: n0(f.bb.level), need: 10 } : null) },
  // ---- Close Call (this device's save) ----
  { id: 'cc-speed', group: 'Close Call', game: 'close-call', title: 'Speed Demon', desc: 'Bank a 25,000-point run in Close Call.', icon: 'bolt', tier: 'silver', src: 'local',
    rule: (f) => ({ have: f.cc ? n0(f.cc.best) : 0, need: 25000 }) },
  { id: 'cc-garage', group: 'Close Call', game: 'close-call', title: 'Garage Goals', desc: 'Own 5 cars in Close Call.', icon: 'car', tier: 'gold', src: 'local',
    rule: (f) => ({ have: f.cc ? n0(f.cc.cars) : 0, need: 5 }) },
  // ---- horror.exe (this device's save) ----
  { id: 'hx-survivor', group: 'horror.exe', game: 'horror-exe', title: 'Survivor', desc: 'Win a round of horror.exe.', icon: 'ghost', tier: 'bronze', src: 'local',
    rule: (f) => ({ have: f.hx ? Math.min(1, n0(f.hx.wins)) : 0, need: 1 }) },
  { id: 'hx-escape', group: 'horror.exe', game: 'horror-exe', title: 'Escape Artist', desc: 'Escape 5 times in horror.exe.', icon: 'door', tier: 'silver', src: 'local',
    rule: (f) => ({ have: f.hx ? n0(f.hx.escapes) : 0, need: 5 }) },
].map(Object.freeze));

export const titleOf = (t, facts = {}) => (typeof t.title === 'function' ? t.title(facts) : t.title);

/**
 * Every trophy with its progress: { ...trophy, title, have, need, pct (0-100), done, known }. `got` (ids already won,
 * from the record) keeps a trophy done even when today's facts say less (a save cleared, a fact unknown).
 */
export function evaluate(facts = {}, got = {}) {
  return TROPHIES.map((t) => {
    let r = null;
    try { r = t.rule(facts); } catch { r = null; }
    const known = !!r;
    const need = known ? Math.max(1, n0(r.need)) : 1;
    const have = known ? Math.min(need, n0(r.have)) : 0;
    const won = !!(got && got[t.id]);
    const done = won || (known && have >= need);
    return { ...t, title: titleOf(t, facts), have: done ? need : have, need, pct: done ? 100 : Math.floor((have / need) * 100), done, known: known || won };
  });
}

/**
 * Which sources the facts cover (a source with only unknown facts is not counted). `localReady: false` = this device's
 * favorites / play time are not in yet (a signed-in page before the account's cloud copy came down): not counted either,
 * so what arrives with it is not mistaken for something won just now.
 */
export function sourcesIn(facts = {}) {
  const out = new Set(facts.localReady === false ? [] : ['local']);
  if (facts.signedIn != null) out.add('account');
  if (facts.streak) out.add('streak');
  if (facts.bb) out.add('bb');
  if (facts.chat != null) out.add('chat');
  return out;
}

/**
 * Folds an evaluation into the account's record. record: { got: { id: time }, src: { source: 1 }, unseen } or null.
 * Returns { record, fresh, quiet }: fresh = ids won just now (celebrate each); quiet = ids found the first time a
 * source's facts were seen for this account (won before trophies existed or on another device: one summary, not a
 * toast each). Pure: tested.
 */
export function mergeRecord(record, results, facts = {}, now = Date.now()) {
  const rec = { got: { ...((record && record.got) || {}) }, src: { ...((record && record.src) || {}) }, unseen: n0(record && record.unseen) };
  const srcNow = sourcesIn(facts);
  const fresh = [], quiet = [];
  for (const t of results) {
    if (!t.done || rec.got[t.id]) continue;
    rec.got[t.id] = now;
    (rec.src[t.src] ? fresh : quiet).push(t.id);
  }
  for (const s of srcNow) rec.src[s] = 1;
  rec.unseen += fresh.length + quiet.length;
  return { record: rec, fresh, quiet };
}

/** "12m / 1h", "3 / 7 days", "18,400 / 25,000". */
export function progressText(t) {
  const fmtT = (s) => { const h = Math.floor(s / HOUR), m = Math.floor((s % HOUR) / 60); return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
  if (t.unit === 'time') return `${fmtT(t.have)} / ${fmtT(t.need)}`;
  const f = (v) => Math.floor(v).toLocaleString('en-US');
  return `${f(t.have)} / ${f(t.need)}${t.unit === 'days' ? ' days' : ''}`;
}
