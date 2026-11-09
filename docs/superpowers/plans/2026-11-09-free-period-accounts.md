# Free Period Accounts + Live Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free Period gets Bing Ball accounts (with the login handed into the Bing Ball frame), cloud saves, a suggest bar + owner inbox, live status, previews, recents/favorites/play time, profile + leaderboard, and a polished look with gameplay posters.

**Architecture:** Bing Ball's server stays the only backend: new suggestion categories and `/api/fp*` routes in `server/accounts.js`, a postMessage bridge in its client. The hub (static, GitHub Pages) moves to ES modules under `fp/` with pure, Node-tested logic (`fp/sync.js`) and thin UI modules.

**Tech Stack:** vanilla HTML/CSS/JS (ES modules, no build) for the hub; Node/Express + Vite client for Bing Ball; `node --test`; puppeteer-core + installed Chrome for e2e and capture; ffmpeg for webm.

**Spec:** `docs/superpowers/specs/2026-11-09-free-period-accounts-design.md`

## Global Constraints
- Never edit `games/` or `lib/` in free-period (another session owns them); commit with explicit paths only.
- Bing Ball: `git fetch` first; work on branch `fp-accounts` in worktree `~/Projects/bing-ball-fp` (node_modules symlinked from the main checkout); the build number is taken at merge time (next free one after origin/main), with a `shared/version.js` comment + `client/src/ui/updates.js` entry.
- API base `https://bing-ball.onrender.com`; test override `?api=` (sessionStorage `fp.api`). Hub test port 5178; isolated Bing Ball test server port 3100 with `DATA_DIR=<scratchpad>/bbdata OWNER_USERNAMES=test_owner`.
- `FP_ORIGINS` = `https://seansaj5.github.io`, `http://localhost:5178`.
- Keys: `fp.token`, `fp.meta`, `fp.sync.<id>`, `closecall.v1`. Save data <= 16 KB string, <= 6 games/account; `/fp/save` body limit 24 KB.
- Category keys: `fp-site` "Free Period", `fp-bingball` "Bing Ball (site)", `fp-closecall` "Close Call", `fp-newgame` "New game idea".
- Look: lime `#c6ff3d` / cyan `#3de0ff` on near-black, Bungee + Outfit (self-hosted), no `backdrop-filter` on scrolling cards, phone width 360 px works with no sideways scroll.
- Test scripts that delete folders hardcode a scratchpad path and refuse anything holding `.git` or `package.json`.

## Review Focus
1. Render asleep (30-60 s) when the hub opens: status says "Waking up", the leaderboard shows a placeholder, login waits with a spinner; nothing errors, guests can still play. -> Task 7 test "never-answering fetch -> waking".
2. Dead token (expired, or evicted by the 8-session cap): `/api/me` 401 -> hub signs out quietly and never hands that token to the frame. -> Task 5 test "401 clears session".
3. Close Call played outside the hub, then the hub opened: local changed -> push; fresh device (no local, cloud present) -> pull before the frame loads. -> Task 4 decideSync tests + Task 10 e2e.
4. localStorage throws (Safari blocked storage): hub renders as a guest with no exceptions. -> Task 5 test "storage throws".
5. Frame holds an older login than the hub: the hub's token wins on hello; logging out inside the frame logs the hub out. -> Task 10 e2e.

---

### Task 1: Bing Ball: site suggestion categories

**Files:**
- Modify: `shared/suggestions.js` (after `REQUEST_CATEGORIES`)
- Test: `<scratchpad>/bbtest/fp.test.mjs` (HTTP tests against the isolated server; extended in Task 2)

**Interfaces:**
- Produces: `export const SITE_CATEGORIES = [{ key, label }]` (the four keys above); `ALL_CATEGORIES = [...SUGGEST_CATEGORIES, ...REQUEST_CATEGORIES, ...SITE_CATEGORIES]`; `SUGGEST_CATEGORIES` unchanged.

- [ ] **Step 1: Write the failing test** `suggest accepts fp-newgame`: `POST /api/suggest {category:'fp-newgame', text:'a racing game with boats'}` -> `ok:true`, `suggestion.category === 'fp-newgame'`; owner `GET /api/suggestions?category=fp-newgame` lists it; import `shared/suggestions.js` and assert `SUGGEST_CATEGORIES.every(c => !c.key.startsWith('fp-'))`.
- [ ] **Step 2: Run** `node --test <scratchpad>/bbtest/fp.test.mjs` (starts the server itself on 3100) -> FAIL "Pick what your suggestion is about".
- [ ] **Step 3: Implement** `SITE_CATEGORIES` and add it to `ALL_CATEGORIES`.
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `git add shared/suggestions.js && git commit -m "Free Period suggestion categories"`.

### Task 2: Bing Ball: `/api/fp*` routes

**Files:**
- Modify: `server/accounts.js` (Accounts methods near the suggestion methods; routes after `/api/suggestion`; body-size switch in `accountRoutes`)
- Test: `<scratchpad>/bbtest/fp.test.mjs`

**Interfaces:**
- Produces (HTTP, Bearer token required, 401 otherwise):
  - `GET /api/fp` -> `{ ok, meta: { favs: string[], recent: {id: ms}, play: {id: s}, at: ms }, saves: { [id]: { at, size } } }`
  - `POST /api/fp/meta {favs, recent, play}` -> `{ ok, meta }` (sanitized, `at` = server now)
  - `GET /api/fp/save?game=id` -> `{ ok, save: { data, at } | null }`
  - `POST /api/fp/save {game, data}` -> `{ ok, at }`
- Accounts methods: `fpView(username)`, `setFpMeta(username, raw)`, `fpSave(username, game)`, `putFpSave(username, game, data)`; data in `user.fp`.
- Limits: id `^[a-z0-9-]{2,24}$`; favs <= 24; recent/play <= 24 entries; play clamped 0..1e7; data string <= 16384 chars; 7th distinct game -> 400 "Too many game saves"; rate limit 60/min per account.

- [ ] **Step 1: Write failing tests**: `fp needs a session` (401 without token); `meta round trip` (favs `['bing-ball']`, junk ids dropped, `play['bing-ball']: -5` -> 0); `save round trip` (put `'{"cash":5}'`, get returns same data and `at` <= now); `save too big` (16385 chars -> 400); `seventh game refused`; `bad game id` (`'../x'` -> 400).
- [ ] **Step 2: Run** -> FAIL (404s).
- [ ] **Step 3: Implement** methods + routes; `/fp/save` uses a 24 KB json parser; every write `await this.save()` like `addSuggestion`.
- [ ] **Step 4: Run** -> all PASS; also `node --check server/accounts.js`.
- [ ] **Step 5: Commit** `git add server/accounts.js && git commit -m "Free Period account data: meta and game saves"`.

### Task 3: Bing Ball: frame bridge in the client

**Files:**
- Modify: `client/src/net/account.js` (new export at the end; called once from where `resume()` is called at boot)

**Interfaces:**
- Produces: `export function initFrameBridge()`; messages: child->parent `{type:'fp:hello'}` (targetOrigin `'*'`, no data), parent->child `{type:'fp:token', token: string|null}`, child->parent `{type:'fp:session', token: string|null, user: {username, role}|null}` (targetOrigin = the verified hub origin).
- Behavior: no-op unless `window.parent !== window`. Accept only `event.source === parent && FP_ORIGINS.includes(event.origin)`. Token equal to the current one -> ignore. New token -> `token = t; resume()` (401 -> stays guest, posts session null). `null` -> clear locally (no `/api/logout`: the hub already did). `onAccountChange` -> post session if a hub origin is known and the token differs from the last one sent/received.

- [ ] **Step 1: Implement** as above (unit-testing needs a DOM; covered by Task 10 e2e).
- [ ] **Step 2: Build** `npm run build` in the worktree -> succeeds, `grep -c "fp:hello" client/dist/assets/*.js` >= 1.
- [ ] **Step 3: Commit** `git add client/src/net/account.js <boot file> && git commit -m "Free Period frame bridge: share the login with the hub"`.

### Task 4: Hub: sync logic (pure)

**Files:**
- Create: `fp/sync.js`; Test: `tests/sync.test.mjs`

**Interfaces:**
- Produces: `hashString(s: string): string` (FNV-1a 32-bit hex; `''` for null); `decideSync({ localRaw, cloud: {data, at}|null, record: {hash, at}|null }): 'pull'|'push'|'none'`; `mergeMeta(a, b): meta` (favs from the newer `at`, recent/play max per id, `at` = max); `cleanMeta(raw): meta` (same limits as Task 2).

- [ ] **Step 1: Write failing tests**: pull when local null and cloud present; pull when local unchanged since record and `cloud.at > record.at`; push when local hash != record hash (even if cloud newer: local wins); none when both match; push when no record and no cloud; `mergeMeta` keeps max play time and newer favs; `cleanMeta` drops `'../x'`.
- [ ] **Step 2: Run** `node --test tests/` -> FAIL (module missing).
- [ ] **Step 3: Implement** `fp/sync.js`.
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `git add fp/sync.js tests/sync.test.mjs && git commit -m "Hub: save sync and meta merge logic"`.

### Task 5: Hub: API, session, saves, meta

**Files:**
- Create: `fp/store.js` (safe localStorage: `get/set/del/json`), `fp/api.js`, `fp/session.js`, `fp/saves.js`, `fp/meta.js`; Test: `tests/session.test.mjs` (fake `fetch` + fake storage injected)

**Interfaces:**
- `api.js`: `API_BASE`, `call(path, {body, auth, timeout=20000}) -> data` (throws `Error` with `.status`; `.waking = true` on timeout/network).
- `session.js`: `getUser()`, `getToken()`, `onChange(fn)`, `login(u,p)`, `register(u,p)`, `logout()`, `resume()`, `adopt(token, user)` (from the frame; no-op if equal).
- `saves.js`: `syncGame(game) -> 'pull'|'push'|'none'`, `syncAll(games)`, `watch(game)` (storage events, 4 s debounce, `pagehide` keepalive).
- `meta.js`: `getMeta()`, `touchRecent(id)`, `addPlay(id, secs)`, `toggleFav(id) -> bool`, `pullMerge()` (on login), uploads debounced 3 s when signed in.

- [ ] **Step 1: Write failing tests**: `401 clears session` (resume with a token, fetch -> 401 -> `getUser() === null`, `fp.token` removed); `network error keeps token`; `storage throws` (store getters throw -> `getUser()` null, no exception from `resume()`); `adopt same token is a no-op` (onChange not called).
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** the five modules.
- [ ] **Step 4: Run** `node --test tests/` -> PASS.
- [ ] **Step 5: Commit** these files.

### Task 6: Hub: account chip, sheets, suggest bar, inbox

**Files:**
- Create: `fp/ui.js` (sheet open/close, toasts, `h()` element helper), `fp/account-ui.js`, `fp/suggest.js`, `fp/inbox.js`, `fp/profile.js`

**Interfaces:**
- Consumes: Task 5 modules; `window.GAMES`.
- `account-ui.js`: `mountAccount(el)` (chip: Log in / name + role badge; menu: Profile, Inbox (owner), Log out; sheet with Log in / Sign up tabs; errors from the server shown as is).
- `suggest.js`: `mountSuggest(el)`: input (4-500 chars, live count), about-picker (Free Period / Bing Ball / Close Call / New game idea -> the four keys), Send; success toast "Sent to Sean"; server error text shown.
- `inbox.js`: `openInbox()`: list newest first, filter chips Site / All, Done/Undo/Delete per row.
- `profile.js`: `openProfile()`: Bing Ball (level + XP bar, coins, styles count, streak, ranked r/tier from `/api/leaderboard?mode=1v1` `me` if present), Close Call (cash, cars, best from `closecall.v1`), play time per game.

- [ ] **Step 1: Implement** (DOM; covered by Task 10 e2e).
- [ ] **Step 2: Check** `node --check` on each file; commit.

### Task 7: Hub: home page features + restyle

**Files:**
- Modify: `index.html`, `style.css`, `games.js` (new fields), `README.md`
- Replace: `app.js` -> `fp/home.js` (module; `app.js` deleted)
- Create: `fp/status.js`

**Interfaces:**
- `games.js` new fields: `preview` (webm path), `saveKey`, `status: { health, version }` (URLs), `beta: true`, `apiGame: true` (Bing Ball: its `url`, `status` and frame origin follow the `?api=` override).
- `status.js`: `watchStatus(game, cb)` -> cb `{state:'online'|'waking'|'offline', players?, version?}`; poll 45 s while visible; `state:'waking'` after 6 s without an answer.
- Home: hero (poster, live status, Play / favorite), Jump back in row (recent, hidden when empty), suggest bar, grid (status pill, Beta badge, star, play time, hover preview after 250 ms; not on `(hover: none)` or reduced motion), leaderboard panel (mode tabs = `RANKED_KEYS` from shared/modes.js, read via `/api/leaderboard?mode=`), lab card, footer. `syncAll(GAMES)` on load when signed in.

- [ ] **Step 1: Write failing test** `tests/status.test.mjs`: fake fetch that never resolves -> cb gets `waking` within 6 s (fake timers); `/health` `{players:3}` + `/api/status` `{version:'5.1.1',build:62}` -> `{state:'online', players:3, version:'5.1.1 b62'}`.
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement** `status.js`, then home + CSS. **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** these files (`git rm app.js`).

### Task 8: Hub: play page

**Files:**
- Modify: `play.html` (inline script -> `fp/play.js` module)

**Interfaces:**
- Consumes: `session`, `saves`, `meta`, `status`.
- Behavior: before creating the frame, `await syncGame(game)` when signed in (max 4 s, then go on); answer `fp:hello` from the game's origin with `fp:token`; adopt `fp:session`; `touchRecent` on open; play time counts in 15 s steps while visible; `watch(game)` for `saveKey` games; keep Reload / New tab / Fullscreen and the waking loader.

- [ ] **Step 1: Implement**; **Step 2:** `node --check fp/play.js`; commit.

### Task 9: Posters and previews

**Files:**
- Create: `tools/posters/capture.mjs` (headless Chrome, real GPU flags `--use-angle=metal --enable-gpu`; Bing Ball practice with a move's VFX on screen; Close Call driving at speed past traffic via `window.__cc`), `tools/posters/poster.html` (1280x720 / 1920x820 template: action shot, grade, vignette, Bungee title with glow, tag line), `tools/posters/README.md`
- Output: `assets/bing-ball.jpg`, `assets/bing-ball-hero.jpg`, `assets/bing-ball.webm`, `assets/close-call.jpg`, `assets/close-call-hero.jpg`, `assets/close-call.webm`

- [ ] **Step 1:** capture stills + 8 s frame sequences; **Step 2:** compose posters; ffmpeg `-c:v libvpx-vp9 -b:v 900k -an -vf scale=640:360` webm; **Step 3:** check sizes (jpg < 350 KB, webm < 1.2 MB) and look at every image; commit.

### Task 10: End-to-end test (local)

**Files:**
- Create: `<scratchpad>/e2e/hub.e2e.mjs` (not in the repo)

- [ ] **Step 1:** start the isolated Bing Ball server (worktree build, 3100) and the hub (5178); run with `?api=http://localhost:3100`. Games list points Bing Ball at `http://localhost:3100` via the same override.
- [ ] **Step 2: Scenarios** (each asserts, screenshot on failure): sign up `fp_tester` on the hub -> chip shows it; open Bing Ball -> frame's account is `fp_tester` (frame localStorage `bingball.token` equals hub token); frame holding an older login -> replaced by the hub's; log out in the frame -> hub chip shows Log in; suggestion as guest -> `test_owner` sees it in the hub Inbox, marks done; Close Call: write `closecall.v1` cash 777 signed in, sync, clear storage (new profile), sign in -> local `closecall.v1` has cash 777 before the frame loads; favorite + recent + play time survive a reload; preview video plays on hover; status pill online with players; 360 px wide has no sideways scroll; zero console errors.
- [ ] **Step 3:** stop servers by port.

### Task 11: Ship

- [ ] **Step 1: Bing Ball**: `git fetch`; rebase `fp-accounts` on origin/main; next build N; `shared/version.js` comment + `updates.js` entry ("FREE PERIOD: your account works on Free Period..."); build; push main; wait for Render; live checks: `/api/status` build N, OPTIONS from github.io, `/api/fp` 401 without a token.
- [ ] **Step 2: Hub**: `git pull --rebase`; push main with only this plan's files; wait for Pages; live check as guest + test account sign-in + Bing Ball frame handoff; console clean.
- [ ] **Step 3:** remove the worktree; update memory notes (free-period, bing-ball); stop every server and Chrome.
