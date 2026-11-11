// What's new: recent updates across Free Period and the games, newest first. To add one, put a line at the TOP:
//   id     short unique name, never reused (it is how "seen" is remembered)
//   date   YYYY-MM-DD (the day it went up)
//   game   'free-period' or a games.js id (its accent and poster dress the line)
//   title  a few words; text: one short sentence; href: optional link (a page or play.html?g=<id>)
// "New" marks lines this device has not seen yet (fp.whatsnew.seen). A first visit marks at most the 5 newest lines of
// the last 3 days.
import * as store from './store.js';

export const WHATS_NEW = Object.freeze([
  { id: 'fnab-withered', date: '2026-11-11', game: 'five-nights-at-bings', title: "Five Nights at Bing's: they got worse", text: 'Withered robots: torn fur, bare metal, black eyes, extra teeth. Some walk right up to the camera.', href: 'play.html?g=five-nights-at-bings' },
  { id: 'fnab-map', date: '2026-11-11', game: 'five-nights-at-bings', title: "Five Nights at Bing's: a real building", text: 'Real furniture and kitchen gear in every room, photo-real walls and floors, furrier robots and a floor-plan camera map.', href: 'play.html?g=five-nights-at-bings' },
  { id: 'fnab-models', date: '2026-11-11', game: 'five-nights-at-bings', title: "Five Nights at Bing's: new models", text: 'Rebuilt animatronics with eyes that follow you, detailed rooms, real shadows and a lens. Benton lives in the music box.', href: 'play.html?g=five-nights-at-bings' },
  { id: 'fnab-3d', date: '2026-11-10', game: 'five-nights-at-bings', title: "Five Nights at Bing's goes 3D", text: 'A real 3D office and cameras, recorded voices, a hand crank, sound lures and a Prize Counter.', href: 'play.html?g=five-nights-at-bings' },
  { id: 'fnab-launch', date: '2026-11-10', game: 'five-nights-at-bings', title: "Five Nights at Bing's is out", text: 'Survive the night shift with Bing, Sal, Dylan, Gavin and Benton in the music box. Fully captioned.', href: 'play.html?g=five-nights-at-bings' },
  { id: 'fp-trophies', date: '2026-11-10', game: 'free-period', title: 'Trophies, profiles and themes', text: 'Earn 22 trophies, show off a player card, and pick your accent color from the account menu.', href: 'trophies.html' },
  { id: 'fp-leaderboards', date: '2026-11-10', game: 'free-period', title: 'Leaderboards', text: 'Every top player in one place, game by game.', href: 'leaderboards.html' },
  { id: 'bb-b71', date: '2026-11-10', game: 'bing-ball', title: 'Bing Ball 5.1.1 build 71', text: 'Daily streaks live on your account: check-ins, streak badges and flair you earn.', href: 'play.html?g=bing-ball' },
  { id: 'fp-friends-now', date: '2026-11-10', game: 'free-period', title: 'Friends playing now', text: 'See which friends are in a game and jump straight into their room.' },
  { id: 'chat-symbiote', date: '2026-11-10', game: 'free-period', title: 'Symbiote flair', text: 'Living black goo for your chat name, avatar frame and profile.', href: 'chat.html' },
  { id: 'fp-streaks', date: '2026-11-10', game: 'free-period', title: 'Daily streaks', text: 'Open Free Period every day to grow your streak: badges at 3, 7, 14 and 30 days, plus flair you earn.' },
  { id: 'chat-commands', date: '2026-11-10', game: 'free-period', title: 'Slash commands', text: 'Type / in chat for commands, @ to ping someone.', href: 'chat.html' },
  { id: 'cc-two-lives', date: '2026-11-10', game: 'close-call', title: 'Close Call: two lives', text: 'Crash twice and your car blows up. 1.5x cash for the brave.', href: 'play.html?g=close-call' },
  { id: 'chat-live', date: '2026-11-10', game: 'free-period', title: 'Messages', text: 'Chat is here: channels for every game, DMs, pictures, GIFs and profiles with flair.', href: 'chat.html' },
  { id: 'hx-round5', date: '2026-11-10', game: 'horror-exe', title: 'horror.exe gets creepier', text: 'A hedgehog-demon EXE, Glitch.exe on the TV and a boot screen that crashes.', href: 'play.html?g=horror-exe' },
  { id: 'fp-accounts', date: '2026-11-09', game: 'free-period', title: 'Accounts and cloud saves', text: 'Your Bing Ball account works here: favorites, play time and saves follow you.' },
  { id: 'hx-launch', date: '2026-11-09', game: 'horror-exe', title: 'horror.exe is out', text: 'Survivors vs EXE across five zones in two worlds.', href: 'play.html?g=horror-exe' },
]);

const KEY = 'fp.whatsnew.seen';
const DAY = 864e5;
export const FIRST_VISIT_DAYS = 3;
export const FIRST_VISIT_MAX = 5;

/** The day a line went up, as a time (noon UTC, so it is the same date everywhere in the US). NaN when unreadable. */
export const dayTime = (date) => (/^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Date.parse(date + 'T12:00:00Z') : NaN);

/**
 * Ids of the lines that count as new (the list is newest first). seen: the stored list of ids (null = never visited:
 * the newest FIRST_VISIT_MAX lines of the last FIRST_VISIT_DAYS days). Pure: tested.
 */
export function newIds(list, seen, now = Date.now()) {
  const out = new Set();
  const known = Array.isArray(seen) ? new Set(seen.filter((x) => typeof x === 'string')) : null;
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item.id !== 'string') continue;
    if (known) { if (!known.has(item.id)) out.add(item.id); }
    else if (out.size < FIRST_VISIT_MAX && now - dayTime(item.date) <= FIRST_VISIT_DAYS * DAY) out.add(item.id);
  }
  return out;
}
/** What to store after a visit: every id in the list (old ids that left the list are dropped). Pure: tested. */
export const seenAfter = (list) => (Array.isArray(list) ? list.map((x) => x && x.id).filter((x) => typeof x === 'string') : []);

export function readSeen() { const v = store.json(KEY, null); return Array.isArray(v) ? v : null; }
export function markSeen(list = WHATS_NEW) { store.setJson(KEY, seenAfter(list)); }

/** "Today", "Yesterday", "Nov 8". */
export function dayLabel(date, now = Date.now()) {
  const t = dayTime(date);
  if (!Number.isFinite(t)) return '';
  const fmt = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (fmt(now) === date) return 'Today';
  if (fmt(now - DAY) === date) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
