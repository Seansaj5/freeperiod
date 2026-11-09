# Free Period: accounts, suggestions, live hub, new look (design, 2026-11-09)

Sean's ask: keep the Free Period layout but make it look much better (especially thumbnails), add cool features,
a suggest bar that reaches his account, and Free Period accounts that connect to his games (Bing Ball: log in once,
everything is there). Close Call is unfinished (show it as Beta); the next game is not up (keep the "lab" card).
Another session is editing `games/` and `lib/` at the same time: this work does not touch either.

## Decisions (Sean, 2026-11-09)
- Thumbnails: gameplay posters (real action shots + title lettering), not AI art.
- Features: hover video previews, live status + players, continue + favorites + play time, profile + leaderboard.

## 1. Accounts = Bing Ball accounts
No second account system. The hub calls `https://bing-ball.onrender.com/api/*` (CORS already allows
`https://seansaj5.github.io`, checked live). New hub module `account.js`:
- `login / register / logout / me` against `/api/login|register|logout|me`; token in `localStorage['fp.token']`.
- API base: `https://bing-ball.onrender.com`, overridable for tests with `?api=` (stored in sessionStorage).
- UI: an account chip top right (Log in / Sign up sheet; signed in: name, role badge, menu: Profile, Inbox (owner only), Log out).

**Token hand-off into the Bing Ball frame** (its storage is partitioned under github.io, so it cannot see the hub's token):
- Bing Ball client (`client/src/net/account.js`): when framed, posts `{type:'fp:hello'}` to the parent. It accepts
  `{type:'fp:token', token}` only from `FP_ORIGINS` = `https://seansaj5.github.io` (+ `http://localhost:5178` for tests);
  a new token replaces its own and is checked with `/api/me` (bad token = stays a guest); `token:null` = log out locally.
- When the account changes inside the game (log in/out there), it posts `{type:'fp:session', token, user}` to the parent,
  targetOrigin = the verified hub origin only. The hub adopts it. Equal tokens are ignored on both sides (no ping-pong).
- `play.html` answers hello with the token, targetOrigin `https://bing-ball.onrender.com` (or the test API origin).

## 2. Free Period data on the account (Bing Ball server)
`user.fp = { meta: { favs[], recent{id:at}, play{id:seconds}, at }, saves: { <gameId>: { data, at } } }`. New routes in
`server/accounts.js` (all need a session, rate limited per account):
- `GET /api/fp` -> `{ meta, saves: { id: { at, size } } }`
- `POST /api/fp/meta` `{ favs, recent, play }` -> sanitized (ids `^[a-z0-9-]{2,24}$`, <= 24 each, numbers clamped).
- `GET /api/fp/save?game=` -> `{ save: { data, at } | null }`
- `POST /api/fp/save` `{ game, data }` -> data is a string <= 16 KB, at most 6 games per account; `at` = server time.
Body limit for `/fp/save` 24 KB; everything else stays 2 KB.

**Cloud saves, hub side only** (Close Call's code is untouched): `games.js` gets `saveKey: 'closecall.v1'`. Same origin, so
the hub reads/writes that localStorage key itself. Sync record `fp.sync.<id> = { hash, at }` per device:
- local unchanged since last sync and cloud newer -> write cloud to local (before the game frame loads).
- local changed since last sync -> upload (local wins a conflict: it is the device being played).
- runs on every hub page load when signed in, on `storage` events from the game frame (debounced 4 s), and on `pagehide` (keepalive).
Meta (recent/favs/play time) lives in `localStorage['fp.meta']`; signed in, it merges with the account's copy
(favs: newer `at` wins; recent and play time: max per game) and uploads, debounced.

## 3. Suggest bar -> Sean's inbox
`shared/suggestions.js` gets `SITE_CATEGORIES` (`fp-site` Free Period, `fp-bingball` Bing Ball, `fp-closecall` Close Call,
`fp-newgame` New game idea), added to `ALL_CATEGORIES` (so `isCategory` accepts them and the admin panel filter lists them)
but NOT to `SUGGEST_CATEGORIES` (the in-game picker is unchanged). The hub's bar posts to `/api/suggest` with the session if
any (existing limits: 3/h guest, 6/h account, 8/h per address; text 4-500 chars, word filter on the server).
Owner signed in on the hub -> Inbox sheet: `GET /api/suggestions` (all, filter chips Site/All), done / undone / delete via
`POST /api/suggestion` (`action: done|undone|delete`, already on the server).

## 4. Hub features
- **Live status**: Bing Ball card/banner: `/health` players + `/api/status` version/build -> "Online · 3 playing · 5.1.1 b62",
  or "Waking up" while it fails/slow. Polled every 45 s while the tab is visible. Close Call: "Beta" + "Solo ready"
  (+ players if its server's `/health` answers with CORS; it is fine if it does not).
- **Hover previews**: `preview: 'assets/<id>.webm'` (6-8 s, 640x360, VP9, no audio, < 1.2 MB), `preload="none"`, plays on
  hover/focus after 250 ms, hidden on touch devices and with prefers-reduced-motion.
- **Jump back in / favorites / play time**: row of recent games (hidden when empty), a star on each card, "x h y m played"
  on cards and profile. Play time counts on `play.html` while the tab is visible.
- **Profile sheet**: Bing Ball (level, XP bar, coins, styles owned, streak, ranked rating/tier if any) from `/api/profile` +
  `/api/leaderboard`, Close Call (cash, cars owned, best run) from its local save, play time per game.
- **Leaderboard**: home page panel, Bing Ball ranked top 10 with mode tabs (`/api/leaderboard?mode=`).

## 5. Look
Same layout, colors (lime/cyan on near-black) and fonts. Upgrades: layered sky (soft aurora glows + graph grid + slow light
sweep, no heavy blur on scrolling parts), glass header, bigger featured banner with poster art + live status, cards with
accent glow, light tilt on hover and the preview video, nicer "lab" card, sheets (login, profile, inbox) in the same glass
style, sound-free, phone layout kept. Posters: `tools/posters/` = capture scripts (headless Chrome, real GPU) +
`poster.html` template (action shot, color grade, Bungee title with glow, small tag line) -> `assets/<id>.jpg` 1280x720,
`assets/<id>-hero.jpg` 1920x820, `assets/<id>.webm`.

## Testing
- Bing Ball: Node test for the fp routes + suggestion categories (`npm test` pattern of the repo), isolated server
  `PORT=3100 DATA_DIR=<scratch> OWNER_USERNAMES=test_owner node server/index.js`.
- Hub: local static server on 5178 + headless Chrome with `?api=http://localhost:3100`: sign up, open Bing Ball in the frame
  and see it signed in, log out in the frame -> hub logged out, suggestion -> owner inbox, Close Call save restore on a fresh
  profile, previews, status, phone width, no console errors.
- After deploy: live check of both sites as a guest + a test account.

## Shipping
Bing Ball first (it must be live before the hub uses it): git fetch, next free build number, version + update log line,
push main. Then the hub: commit only these files, push main. The hub degrades gracefully if the Bing Ball routes are missing.
