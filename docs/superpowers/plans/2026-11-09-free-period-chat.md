# Free Period Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Discord-like chat on Free Period (one server for every account, owner-only announcements/rules, DMs and group DMs, pictures/GIFs, an overlay on every game, Nitro-style profiles) on Supabase, signed in through the existing Bing Ball accounts.

**Architecture:** Supabase (Postgres + row-level security, Realtime, Storage) holds all chat data; the static hub talks to it directly with the public key through a vendored `supabase-js`. The Bing Ball server is the only thing that creates chat users: `POST /api/chat/session` turns a Bing Ball session into a Supabase magic-link token the hub verifies, so chat keeps working while Bing Ball naps. Schema lives as SQL migrations in the Bing Ball repo.

**Tech Stack:** Supabase (Postgres 15+, RLS, Realtime, Storage), `@supabase/supabase-js` v2 (vendored single ES module), vanilla ES modules/CSS (hub), Node/Express (Bing Ball), node:test, puppeteer-core + installed Chrome.

**Spec:** `docs/superpowers/specs/2026-11-09-free-period-chat-design.md` (free-period repo). Builds on `2026-11-09-free-period-accounts-design.md`.

## Global Constraints

- Starts after the accounts work is live. Worktrees from origin/main after that ship: hub `~/Projects/free-period-chat` (branch `chat`), Bing Ball `~/Projects/bing-ball-chat` (branch `chat`, node_modules symlinked from the main checkout). `git fetch` first in Bing Ball (other sessions push).
- Never edit `games/` or `lib/` in free-period (another session owns them); commit with explicit paths only.
- No word filter anywhere in chat (Sean's call). Moderation = owner/mods + block + report.
- Supabase projects: `free-period-chat` (live), `free-period-chat-test` (tests). Hub config picks the test project on `localhost`/`127.0.0.1`, live elsewhere. Tests never write to the live project; nothing writes to https://bing-ball.onrender.com except the ship tasks.
- Secrets: the live secret (service) key exists only in Render env `SUPABASE_SERVICE_KEY`, pasted by Sean; the test project's secret key lives only in a scratchpad env file. Never in either repo or the hub. Supabase sign-up is OFF.
- Chat user email: `<bing ball username lowercased>@users.freeperiod.example`. app_metadata `{ username, role }`, role: Bing Ball owner -> `owner`, admin -> `mod`, else `member`.
- Limits: message body <= 2000 chars; display name <= 32; pronouns <= 40; about <= 300; status text <= 80; channel name `^[a-z0-9-]{1,24}$`, topic <= 120; group DM <= 10 members, name <= 40; report reason <= 200; <= 4 attachments per message; 5 messages per 5 s per person; time-outs 10, 60, 1440 minutes.
- Files (types image/png, image/jpeg, image/webp, image/gif; bucket cap 8 MB): chat pictures re-encoded to WebP max 1600 px and <= 5 MB, chat GIFs as-is <= 8 MB; avatar static -> 512x512 WebP, avatar GIF <= 4 MB; banner static -> max 1500x600 WebP, banner GIF <= 6 MB; emoji static -> 128 px WebP, GIF <= 1 MB.
- Media budget: when chat + DM pictures exceed 850 MB, delete oldest down to 700 MB (never avatars/banners/emoji); at most every 6 h.
- Chat session request timeout 75 000 ms ("Waking up chat…").
- Seed channels (position order): `announcements` 📢 owner-only, `rules` 📜 owner-only, `general` 💬, `bing-ball` 🎮, `close-call` 🚗, `horror-exe` 👹. "Owner-only" channels: owner and mods post; everyone reads/reacts; guests can read them.
- Rendering: never innerHTML for user/server text; links only `http:`/`https:` with `target="_blank" rel="noopener noreferrer"`; images only from the configured Supabase storage origin.
- Look: lime `#c6ff3d` / cyan `#3de0ff` on near-black, Bungee + Outfit (self-hosted), no `backdrop-filter` on scrolling elements, 360 px phone width with no sideways scroll, no pink/purple-dominant defaults.
- Phase 2 flair values: fonts `bungee, outfit, press-start, orbitron, creepster, pacifico`; frames `neon-ring, pulse, orbit, flame, frost, circuit, glitch, halo, thorns, sparkle, wave, hex, crown, lightning, pixel, vortex, stars, shield, drip, eclipse`; effects `sparkles, snow, embers, glitch, stars, bubbles, lightning, confetti, matrix, aurora`; Early Member = joined chat before 2026-12-01; custom emoji <= 50, name `^[a-z0-9_]{2,32}$`.
- Test scripts that delete folders hardcode a scratchpad path and refuse anything holding `.git` or `package.json`. Stop servers by port/PID, never `pkill -f`.

## Review Focus

1. Bing Ball asleep at a device's first chat sign-in -> "Waking up chat…" for up to 75 s, then chat works; never an error screen (Task 4 test).
2. A message containing HTML, `<script>`, `javascript:`/`data:` links or a fake storage-looking URL renders as plain text; only http(s) links become links (Task 5 test).
3. Blocked / friends-only / banned people trying to DM or post are refused by the database with a clear line in the UI, not just hidden by the client (Task 1 policy tests, Task 9/17 e2e).
4. Hub logout or switching accounts on one device signs chat out; the next account never sees the previous account's DMs or unreads (Task 4 test, Task 12 e2e).
5. Supabase paused or unreachable -> "Chat is asleep" / "Reconnecting…"; a message sent meanwhile shows "sending" and is retried or marked failed with Retry, never silently dropped (Task 6 test, Task 7 UI).

---

## Phase 1

### Task 1: Chat schema and policies (Bing Ball repo, test project)

**Files:**
- Create: `supabase/migrations/0001_chat.sql` (bing-ball-chat)
- Create: `<scratchpad>/chattest/apply.mjs`, `<scratchpad>/chattest/env.test` (test URL + keys, never committed), `<scratchpad>/chattest/policies.test.mjs`

**Interfaces:**
- Produces tables: `profiles(id uuid pk -> auth.users, username text unique (lowercase), name text, role text ('owner'|'mod'|'member'), is_mod bool, muted_until timestamptz, banned bool, display_name, pronouns, about, status_emoji, status_text, avatar_path, banner_path, banner_color, name_color, dm_policy ('everyone'|'friends'), game_stats jsonb, joined_at, updated_at)`; `channels(id bigint, name, emoji, topic, position int, owner_only bool, created_at)`; `messages(id bigint, channel_id null, dm_id null, author_id, body, reply_to, attachments jsonb, mentions_everyone, pinned, edited_at, deleted, created_at)` with exactly one of channel_id/dm_id; `reactions(message_id, user_id, emoji)`; `dms(id uuid, is_group, name, created_by, created_at)`; `dm_members(dm_id, user_id, joined_at)`; `blocks(blocker, blocked)`; `reads(user_id, target ('c:<id>'|'d:<uuid>'), last_read_at)`; `reports(id, message_id, reporter, reason, snapshot jsonb, resolved, created_at)`.
- Produces SQL functions (all `security definer`, `search_path = public`): `my_role() -> text`, `is_staff() -> bool`, `can_post() -> bool`, `start_dm(other uuid) -> uuid`, `create_group(members uuid[], name text) -> uuid`, `leave_dm(dm uuid)`, `add_to_group(dm uuid, member uuid)`, `set_mod(target uuid, on bool)`, `timeout_user(target uuid, minutes int)` (minutes in 0,10,60,1440; 0 clears), `set_ban(target uuid, on bool)`, `unread_counts() -> table(target text, unread int, mentions int)` (capped 99, own and blocked authors excluded), `chat_media_usage() -> table(bucket text, name text, size bigint, created_at timestamptz)` (service role only), `expire_media(paths text[])` (service role only).
- Produces error codes raised as exception messages: `slow_down`, `muted`, `banned`, `everyone_owner_only`, `owner_only_channel`, `dm_refused`, `group_full`, `not_allowed`.

- [ ] **Step 1: Write the policy tests** (`policies.test.mjs`, node:test, supabase-js with the test project; users made with the admin API + `generate_link` + `verifyOtp`; roles via app_metadata): member posts in general -> ok; member posts in announcements -> `owner_only_channel`; mod posts in announcements -> ok; owner posts `@everyone` -> ok, member -> `everyone_owner_only`; 6th message within 5 s -> `slow_down`; timed-out member -> `muted`; banned -> `banned`; member edits another's message -> denied; author edit sets `edited_at`; mod delete -> `deleted=true`, body `''`; member updates own `role`/`is_mod`/`game_stats`/`username` -> denied; member updates own `about` -> ok; anon reads announcements -> ok, reads general -> none; outsider selects a DM's messages -> none; `start_dm` through a block either way -> `dm_refused`; `start_dm` twice returns the same id; group with 11 members -> `group_full`; `unread_counts` after 3 messages -> 3, after `reads` upsert -> 0, `@me` counted in mentions; report insert by a viewer -> snapshot filled, select by member -> none, by owner -> visible; `set_mod` by mod -> `not_allowed`, by owner -> ok.
- [ ] **Step 2: Run** `node --test <scratchpad>/chattest/policies.test.mjs` against an empty test project. Expected: FAIL (tables missing).
- [ ] **Step 3: Write `0001_chat.sql`**: tables + checks (limits from Global Constraints), RLS enabled on every table with default deny, column-level `grant update (display_name, pronouns, about, status_emoji, status_text, avatar_path, banner_path, banner_color, name_color, dm_policy)` on profiles to `authenticated` (all other profile columns server/RPC-only), `messages` BEFORE INSERT trigger (rate limit, mute/ban, owner-only channel, `@everyone`, sets `mentions_everyone`) and BEFORE UPDATE trigger (author may change body -> sets edited_at; author or staff may set deleted -> clears body/attachments; staff may set pinned; nothing else), reports snapshot trigger, the functions above, seed channels, `alter publication supabase_realtime add table messages, reactions, channels, profiles, dm_members`. Owner = `auth.jwt()->'app_metadata'->>'role' = 'owner'`; mod = app_metadata role `mod` or `profiles.is_mod`.
- [ ] **Step 4: Apply** with `apply.mjs <project-ref> <sql-file>`: Supabase Management API `POST /v1/projects/{ref}/database/query` with Sean's CLI access token (keychain item `Supabase CLI`, else `~/.supabase/access-token`); also `PATCH /v1/projects/{ref}/config/auth` `{ "disable_signup": true }`; fetch the test project's keys (`GET /v1/projects/{ref}/api-keys`) into `env.test`. If no token is readable, stop and report NEEDS_CONTEXT (the controller asks Sean).
- [ ] **Step 5: Run the policy tests.** Expected: all PASS.
- [ ] **Step 6: Commit** `supabase/migrations/0001_chat.sql`: "Chat: Supabase schema and row-level security".

### Task 2: Storage buckets and policies

**Files:** Create `supabase/migrations/0002_storage.sql`; extend `<scratchpad>/chattest/policies.test.mjs`.

**Interfaces:**
- Produces buckets: `public-media` (public, 8 MB, the four image types) with paths `avatars/<uid>/<uuid>.<ext>`, `banners/<uid>/<uuid>.<ext>`, `chat/<channel_id>/<uid>/<uuid>.<ext>`, `emoji/<name>.<ext>` (Phase 2); `dm-media` (private, same limits) with `<dm_id>/<uid>/<uuid>.<ext>`.

- [ ] **Step 1: Tests:** member uploads to own `avatars/<uid>/` -> ok, to another uid -> denied; banned member uploads to `chat/` -> denied; DM member reads `dm-media/<dm>/…` via signed URL -> ok, outsider -> denied; `text/html` upload -> rejected by the bucket; delete own -> ok, mod deletes another's chat picture -> ok.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Write `0002_storage.sql`** (bucket rows + `storage.objects` policies using `storage.foldername(name)`, `can_post()`, `is_staff()`, dm membership). **Step 4: Apply to test, run, expect PASS.**
- [ ] **Step 5: Commit** "Chat: storage buckets and policies".

### Task 3: `/api/chat/session` and media cleanup (Bing Ball server)

**Files:** Create `server/chat.js`; modify `server/accounts.js` (route next to the `/api/fp` routes, ~line 1963), `render.yaml` (env); test `<scratchpad>/bbtest/chat.test.mjs` with a local fake Supabase (admin users, generate_link, PostgREST upsert/RPC, storage delete).

**Interfaces:**
- Produces `createChat({ url, serviceKey, fetchImpl = fetch }) -> { enabled: boolean, session(user): Promise<{ tokenHash: string }>, cleanup(): Promise<{ deleted: number, bytes: number }> }`, `chatRole(bbRole: string) -> 'owner'|'mod'|'member'`, `chatEmail(username: string) -> string`, `gameStats(user) -> { bb: { level, tier }, cc: { cash, cars }, hx: { wins, escapes } }` (Close Call from `user.fp.saves['close-call']` JSON: `cash`, `owned.length`; horror.exe from `user.fp.saves['horror-exe']` JSON: `stats.wins`, `stats.escapes`; missing -> 0).
- Route `POST /api/chat/session` (Bearer, `fpWho` rate limit) -> `{ tokenHash }`; 503 `{ error: 'Chat is not set up' }` when `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset.
- Stores `user.chatId` (Supabase user id).

- [ ] **Step 1: Tests:** first call creates the auth user with `email_confirm: true` and app_metadata `{username, role}` and stores chatId; second call reuses it (no create); role change -> admin update; profile upsert carries `username` (lowercase), `name`, `role`, `game_stats`; response has `tokenHash` from `generate_link` `properties.hashed_token`; env unset -> 503; owner -> `owner`, admin -> `mod`; cleanup with usage 900 MB deletes oldest chat/dm objects to <= 700 MB, never `avatars/`, `banners/`, `emoji/`, then calls `expire_media`; usage 800 MB -> deletes nothing.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** (plain `fetch` to `/auth/v1/admin/users`, `/auth/v1/admin/generate_link`, `/rest/v1/profiles?on_conflict=id`, `/rest/v1/rpc/...`, `/storage/v1/object/{bucket}` DELETE; headers `apikey` + `Authorization: Bearer <serviceKey>`). Cleanup: `setInterval(6 h).unref()` plus once 60 s after boot, only when enabled. `render.yaml`: `SUPABASE_URL` value = live project URL, `SUPABASE_SERVICE_KEY` `sync: false`.
- [ ] **Step 4: Run, expect PASS. Step 5: Commit** server/chat.js, server/accounts.js, render.yaml: "Chat: session route and media cleanup".

### Task 4: Hub chat client and session bridge

**Files:** Create `fp/vendor/supabase.js` (esbuild bundle of a pinned `@supabase/supabase-js@2` version, header comment with version + rebuild command), `fp/chat/config.js`, `fp/chat/client.js`; test `tests/chat-client.test.mjs` (fakes for session, api call and supabase auth).

**Interfaces:**
- Consumes: `fp/session.js` `getToken/getUser/onChange`, `fp/api.js` `call(path, { body, auth, timeout })`.
- Produces `CHAT = { url, key }` (config.js; test project on localhost/127.0.0.1); `getChat() -> SupabaseClient | null`; `chatState() -> 'off'|'guest'|'waking'|'ready'|'asleep'|'error'`; `onChatState(fn) -> unsubscribe`; `ensureChatSession() -> Promise<string>` (state); `chatEmail(username)` (same rule as the server); `me() -> { id, username } | null`.

- [ ] **Step 1: Tests:** guest -> `guest`, no network; signed in with no Supabase session -> POST `/api/chat/session` with timeout 75000 and state `waking` until it answers, then `verifyOtp({ token_hash, type: 'email' })` -> `ready`; a Supabase session for another email -> `signOut()` first; hub `onChange` to logged out -> `signOut()` + `guest`; route 503 -> `off`; Supabase answering "project paused" (HTTP 540 or 503 from the project URL) -> `asleep`; two quick `ensureChatSession()` calls share one request.
- [ ] **Step 2-4: fail, implement, pass. Step 5: Commit** "Chat: hub client and session bridge".

### Task 5: Message formatting and pure helpers

**Files:** Create `fp/chat/format.js`, `fp/chat/unread.js`, `fp/chat/media.js`; tests `tests/chat-format.test.mjs`, `tests/chat-media.test.mjs`.

**Interfaces:**
- `parseMessage(body: string, ctx: { me: string, users: Set<string>, emoji: Map<string,string> }) -> Token[]`; Token = `{t:'text',v}` | `{t:'b',kids}` | `{t:'i',kids}` | `{t:'code',v}` | `{t:'spoiler',kids}` | `{t:'link',href,v}` | `{t:'mention',user,me}` | `{t:'everyone'}` | `{t:'emoji',name,src}` | `{t:'br'}`. Syntax: `**b**`, `*i*`, `` `code` ``, `||spoiler||`, bare http(s) URLs, `@name` (only names in `users`), `@everyone`, `:name:` (only names in `emoji`).
- `renderTokens(tokens, doc = document) -> DocumentFragment` (createElement/textContent only).
- `isSafeHref(s) -> boolean`; `mentionsMe(body, me) -> boolean`.
- `badge(count: {unread, mentions}) -> { dot: boolean, text: string }` ("99+" cap); `tabTitle(base, totalMentions) -> string` ("(3) Free Period").
- `planUpload({ type, size, width, height }, kind: 'chat'|'avatar'|'banner'|'emoji') -> { ok: true, mode: 'reencode'|'asis', maxW, maxH } | { ok: false, reason }` (limits from Global Constraints); `reencode(file, plan) -> Promise<Blob>` (browser canvas -> image/webp quality 0.86).

- [ ] **Step 1: Tests** (exact cases): `<script>alert(1)</script>` -> one text token with that string; `[x](javascript:alert(1))` and `javascript:alert(1)` -> text; `data:text/html,...` -> text; `https://a.b/c?d=1` -> link; `**bold *it***` nests; unclosed `**` stays text; `@saj` with `users` has `saj` -> mention `me:true` when me=`saj`; `@nobody` -> text; `:pog:` with emoji map -> emoji; `\n` -> br; 2000-char body parses in < 50 ms. planUpload: 6 MB png chat -> reencode 1600; 9 MB gif chat -> `{ok:false}`; 3 MB gif avatar -> asis; 5 MB gif avatar -> `{ok:false}`; `text/html` -> `{ok:false}`; badge(150 mentions) -> `99+`.
- [ ] **Step 2-4: fail, implement, pass. Step 5: Commit** "Chat: message formatting, unread and upload helpers".

### Task 6: Chat data layer

**Files:** Create `fp/chat/data.js`; integration test `<scratchpad>/chattest/data.test.mjs` (node 22 against the TEST project, two signed-in clients).

**Interfaces:**
- Consumes: `getChat()`, `me()` (Task 4); `planUpload/reencode` (Task 5); SQL from Tasks 1-2.
- Produces: `listChannels()`; `loadMessages(target: { channel?: number, dm?: string }, { before?: number, limit = 50 })` -> messages with `author` profile; `sendMessage(target, { body, replyTo?, files? }) -> Promise<Message>` (uploads first; returns a pending local message `{ pending: true, tempId }` through `onPending` before the insert resolves); `retrySend(tempId)`; `editMessage(id, body)`; `deleteMessage(id)`; `react(id, emoji, on)`; `pin(id, on)`; `markRead(target)`; `unreadCounts()`; `subscribe(target, { insert, update, react }) -> unsubscribe`; `presence({ onSync }) -> { stop }`; `typing(target) -> { ping(), onTyping(fn), stop() }`; `listDMs()`; `startDM(userId)`; `createGroup(userIds, name)`; `leaveDM(id)`; `addToGroup(id, userId)`; `setMod(userId, on)`; `timeout(userId, minutes)`; `setBan(userId, on)`; `report(messageId, reason)`; `listReports()`; `resolveReport(id)`; `createChannel({ name, emoji, topic, ownerOnly })`; `updateChannel(id, patch)`; `deleteChannel(id)`; `moveChannel(id, position)`; `getProfile(id)`; `findProfiles(prefix)`; `updateProfile(patch)`; `uploadAvatar(file)`; `uploadBanner(file)`; `block(userId, on)`; `listBlocks()`; `mediaUrl(attachment) -> Promise<string>` (public URL or 1 h signed URL for dm-media); `chatError(e) -> string` (maps the Task 1 codes to: "Slow down a little", "You're timed out for N min", "You're banned from chat", "Only Sean can ping everyone", "Only Sean and mods post here", "They aren't taking DMs from you", "Groups hold up to 10 people", "You can't do that").

- [ ] **Step 1: Integration tests:** A sends in general, B's `subscribe` insert fires within 3 s; edit/delete/react arrive as updates; `loadMessages` pages with `before`; picture upload -> attachment with `path` under `chat/<channel>/<uid>/`; DM between A and B readable by both, by C not; `unreadCounts` for B after A's 2 messages = 2; `chatError` on a 6th quick send = "Slow down a little"; send while the network is down (fake fetch rejecting) -> pending then `failed`, `retrySend` succeeds after it is back.
- [ ] **Step 2-4: fail, implement, pass. Step 5: Commit** "Chat: data layer".

### Task 7: Messages page (channels, messages, composer, live)

**Files:** Create `chat.html`, `chat.css`, `fp/chat/page.js` (entry), `fp/chat/views/rail.js`, `views/channels.js`, `views/messages.js`, `views/composer.js`, `views/members.js`, `views/emoji-picker.js` (built-in emoji list `fp/chat/emoji-data.js`, ~400 common emoji, no network); modify `index.html` header (Messages button slot `#chat-btn`), `fp/home.js` (mount button).

**Interfaces:**
- Consumes Tasks 4-6. Produces `mountChatButton(el)` (`fp/chat/button.js`: icon + unread count, link to `chat.html`, hidden when chat is `off`) and `mountChatApp(root, { compact: boolean })` (`fp/chat/app.js`, used by the page and by the Task 10 overlay).

- [ ] **Step 1: Build** the Discord-like layout in the Free Period look: rail (server icon, DMs entry), channel list (emoji, name, unread dot, mention badge, owner-only lock), message list (grouped by author within 5 min, avatar, name in name color, time, reply preview, reactions row with counts + add, pictures inline with lightbox, "message deleted", "(edited)", pinned marker, "Blocked message — show"), composer (text, emoji picker, attach up to 4 with previews and planUpload errors, reply chip, Enter sends, Shift+Enter newline, typing ping), member list (online first via presence, owner crown, mod shield), banners for `waking` ("Waking up chat…"), `asleep` ("Chat is asleep"), reconnecting ("Reconnecting…"), `guest` (read announcements/rules + "Log in to chat"), `off` ("Chat is coming soon"); pending/failed messages with Retry; unread title via `tabTitle`; phone: one panel at a time with back button; loads older messages on scroll-up.
- [ ] **Step 2: Check** in headless Chrome against the test project (localhost hub): two contexts chat live; screenshots at 1440x900 and 390x844 into `<scratchpad>/shots/chat-*.png`; 360 px no sideways scroll; zero console errors from page code.
- [ ] **Step 3: Commit** "Chat: Messages page".

### Task 8: Owner and mod tools

**Files:** Create `fp/chat/views/mod.js` (message menu actions, member menu actions, channel manager sheet, reports tab); modify `fp/inbox.js` (owner Inbox gets a "Reports" tab reading `listReports()`), `views/messages.js`, `views/members.js`, `views/channels.js`.

- [ ] **Step 1: Build:** message menu — pin (staff), delete any (staff), report (everyone, reason <= 200); member menu — time out 10 min / 1 h / 1 day / clear (staff), ban/unban (owner), make/unmake mod (owner); channel manager (owner): add (name rule, emoji, topic, owner-only), rename, topic, reorder (up/down), delete with confirm; Reports tab: snapshot, open in chat, resolve; composer shows the `muted`/`banned` line.
- [ ] **Step 2: Check** in headless Chrome (owner + member contexts on the test project): owner posts in announcements, member can't (composer explains); owner times out member -> member sees the line; owner bans -> member can't post; mod deletes; report appears in the owner Inbox Reports tab. **Step 3: Commit** "Chat: owner and mod tools".

### Task 9: DMs, group DMs, block, profile card, basic profile editor

**Files:** Create `fp/chat/views/dms.js`, `views/profile-card.js`, `views/profile-editor.js`; modify `views/rail.js`, `views/messages.js`.

- [ ] **Step 1: Build:** DM list (avatars, names, unread, last message), new DM (search via `findProfiles`), new group (pick up to 9 others + name), leave group, add to group; profile card popout on name/avatar click (avatar, banner or color, display name, @username, pronouns, about, status, role badge, Message / Block buttons); basic editor sheet with live card preview: display name, pronouns, about, status emoji + text, name color, avatar upload (planUpload `avatar`), banner upload or color; block list in the editor with unblock; DM refusals show `chatError` text.
- [ ] **Step 2: Check** in headless Chrome (three contexts): A DMs B live; A makes a group with B and C; B blocks A -> A's new DM attempt shows "They aren't taking DMs from you", A's channel messages show as "Blocked message — show" for B; avatar GIF animates on the card; editor limits enforced. **Step 3: Commit** "Chat: DMs, profile card and editor".

### Task 10: Overlay on the play page

**Files:** Create `fp/chat/overlay.js`, `fp/chat/toast.js`; modify `fp/play.js` (mount in the top bar), `play.html` (button slot), `chat.css` (overlay rules).

**Interfaces:** `mountChatOverlay(bar: HTMLElement) -> { open(), close(), toggle() }` (uses `mountChatApp(panel, { compact: true })`, lazy-loaded on first open); `chatToast({ title, body, onClick })`.

- [ ] **Step 1: Build:** chat button with unread badge in the play bar; 380 px panel over the right side (100% width under 600 px), game keeps running; Esc / button closes; while the panel's input has focus no key reaches the frame (focus is in the parent page; verify); pop-ups for new DMs and @mentions while closed (max one every 3 s, click opens that conversation); hidden when chat is `off`.
- [ ] **Step 2: Check** in headless Chrome over Bing Ball (local), Close Call and horror.exe: open, send, close; typing "wasd" in the panel does not move the game (game's own input state unchanged); toast appears for a DM from a second context. **Step 3: Commit** "Chat: overlay on every game".

### Task 11: Phase 1 end-to-end test

**Files:** Create `<scratchpad>/e2e/chat.e2e.mjs` (not in the repos).

- [ ] **Step 1:** isolated Bing Ball (bing-ball-chat build, port 3100, `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` from `env.test`, `OWNER_USERNAMES=test_owner`, `ALLOW_OWNER_SIGNUP=1`, fresh DATA_DIR) + hub (chat worktree) on `http://localhost:5178` `?api=http://localhost:3100`.
- [ ] **Step 2: Scenarios** (assert; screenshot on failure): all of Tasks 7-10 checks in one run, plus Review Focus 1 (Bing Ball held asleep 20 s at first chat sign-in -> "Waking up chat…" then ready), 4 (owner logs out, member logs in on the same context -> no owner DMs visible, unreads reset), 5 (block Supabase requests for 10 s -> "Reconnecting…", a message sent meanwhile ends delivered or failed with Retry), guest reads announcements, 360 px, zero console errors from page code.
- [ ] **Step 3:** stop servers by port; delete the test users it created.

### Task 12: Ship Phase 1

- [ ] **Step 1: Live project:** apply `0001_chat.sql` + `0002_storage.sql` with `apply.mjs <live-ref>`; auth `disable_signup: true`; verify tables exist (read-only query).
- [ ] **Step 2: Sean's step:** give click-by-click steps to copy the live project's secret key (Supabase dashboard -> Project Settings -> API Keys) into Render (https://dashboard.render.com/web/srv-dane8a3m8hqs73b1fqo0/env -> Add Environment Variable -> `SUPABASE_SERVICE_KEY`) and wait for "done". Claude never sees the live key.
- [ ] **Step 3: Bing Ball:** `git fetch`, rebase `chat` on origin/main, next free build number, `shared/version.js` comment + `client/src/ui/updates.js` entry ("CHAT: Free Period has chat now — one server for everyone, DMs and pictures. Open it from any game."), `npm run build`, push main; verify live read-only: `/api/status` build, `/api/chat/session` without a token -> 401.
- [ ] **Step 4: Hub:** pull --rebase, merge `chat`, push main; verify live as a guest (announcements readable, no console errors) and with a test account Sean approves (or Sean's own check).
- [ ] **Step 5:** remove worktrees only after Phase 2 (they are reused); update memory notes; stop every server/Chrome.

## Phase 2

### Task 13: Flair, friends and emoji schema

**Files:** Create `supabase/migrations/0003_flair.sql`; extend `policies.test.mjs`.

**Interfaces:** profiles gain `theme_a`, `theme_b`, `name_color2` (hex `^#[0-9a-f]{6}$`), `name_font` (one of the fonts), `name_fill` (`solid`|`gradient`), `name_glow` bool, `frame` (one of the frames or null), `effect` (one of the effects or null) — all in the column grant; `friends(a uuid, b uuid, status 'pending'|'accepted', requested_by, created_at)` (a < b) with `friend_request(username text)`, `friend_respond(other uuid, accept bool)`, `friend_remove(other uuid)`; `start_dm`/`create_group` honor `dm_policy = 'friends'`; `emoji(name pk, path, created_by, created_at)` (<= 50 by trigger, staff insert/delete, everyone select); storage `emoji/` staff-only.
- [ ] Tests: bad font/frame/effect/hex -> rejected; friends-only user refuses a DM from a non-friend (`dm_refused`), accepts from a friend; 51st emoji -> rejected; member emoji insert -> denied. Fail -> write -> apply to test -> pass -> commit "Chat: flair, friends and emoji schema".

### Task 14: Nitro-style profile flair (visuals)

**Files:** Create `fp/chat/flair.js` (`FONTS`, `FRAMES`, `EFFECTS` id lists from Global Constraints, `validFlair(patch) -> { ok, errors }`, `nameStyle(profile) -> { fontFamily, color, backgroundImage?, textShadow? }`, `badgesFor(profile) -> string[]` in order owner, mod, early, bb tier), `fp/chat/frames.js` (20 animated SVG/CSS frames), `fp/chat/effects.js` (10 canvas/CSS overlays, paused off-screen and with reduced motion), fonts in `assets/fonts/` (4 new woff2, OFL, with license files); test `tests/chat-flair.test.mjs` (validFlair, nameStyle, badgesFor incl. Early Member cutoff 2026-12-01).
- [ ] Tests first; then editor sections (theme gradient, name font/fill/second color/glow, frame picker with live previews, effect picker) and the card/message rendering of name styles, frames, effects, badges, game stats (`game_stats`); screenshots of every frame and effect into `<scratchpad>/shots/flair-*.png`; commit "Chat: Nitro-style profile flair".

### Task 15: Custom emoji and friends UI

**Files:** Create `fp/chat/views/emoji-admin.js`, `views/friends.js`; modify `format.js` ctx wiring, `views/emoji-picker.js`, `views/rail.js`, `views/profile-card.js` (Add friend), `views/profile-editor.js` (DM setting).
- [ ] Build: staff emoji manager (upload with planUpload `emoji`, name rule, delete, 50 cap shown); picker "Server" tab; `:name:` renders everywhere; Friends page (online, all, pending in/out, add by username, accept/decline/remove); DM setting (everyone / friends only). Check in headless Chrome (owner + two members); commit "Chat: custom emoji and friends".

### Task 16: Phase 2 end-to-end and ship

- [ ] Extend `chat.e2e.mjs`: flair saves and renders for another viewer; emoji upload + use; friend request flow; friends-only DM refused then allowed after accepting. Run all (Phase 1 + 2) scenarios.
- [ ] Ship like Task 12 (apply `0003_flair.sql` to live first; Bing Ball unchanged unless needed; hub push; live check); remove worktrees; update memory notes; stop everything.

## Phase 3: Helper bot "Hallpass" (spec section 9)

### Task 17: Bot schema, FAQ and hub FAQ answers

**Files:** Create `supabase/migrations/0004_bot.sql` (bing-ball-chat); `fp/chat/faq.js` (`matchFaq(question: string, faq: Faq[]) -> { item: Faq, score: number } | null`, threshold 0.5, keyword + word-overlap score), `fp/chat/views/help.js` (quick-pick buttons, asker-only answer card, "Ask Hallpass AI instead"); owner FAQ editor + AI switch in `views/mod.js`; test `tests/chat-faq.test.mjs`; extend `policies.test.mjs`.

**Interfaces:** `profiles.is_bot` (server-only column); bot profile `hallpass` created by the migration through the admin API step in `apply.mjs`; `faq(id, question <= 120, answer <= 1000, keywords text[], position)` (everyone reads, owner writes); `bot_settings(id = 1, ai_on bool, extra_instructions <= 1000)` (everyone reads ai_on, owner writes); `bot_usage(day date, user_id, count)` (service role only); channel `help` 🤖 added after `horror-exe`; `start_dm` allows DMing the bot regardless of its dm_policy.
- [ ] Tests first: matchFaq ("how do i log in" -> the login entry; "my close call cars are gone" -> the saves entry; "what is 2+2" -> null); policies (member edits faq -> denied; owner -> ok; member reads bot_usage -> none). Seed ~15 FAQ entries (spec section 9 topics; answers short, accurate to the live site). Build the help views. Commit "Chat: Hallpass FAQ".

### Task 18: Hallpass Edge Function (Claude)

**Files:** Create `supabase/functions/hallpass/index.ts` (Deno; `npm:@anthropic-ai/sdk` pinned), `supabase/functions/hallpass/prompt.ts` (builds the stable system prompt from game info + FAQ + extra instructions, deterministic order), database webhook in `supabase/migrations/0005_bot_webhook.sql`; test `<scratchpad>/chattest/hallpass.test.mjs` (function served locally with `supabase functions serve` or invoked with a fake Anthropic client via an injected `createClient` seam).

- [ ] Behavior: ignore bot-authored messages and anything outside `help` / bot DMs / `@hallpass`; FAQ match first (same algorithm as `fp/chat/faq.js`, shared copy with a comment) -> post the canned answer; else if `ai_on` and `ANTHROPIC_API_KEY` set and caps allow (10/person/hour, 200/day) -> `client.beta.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }], messages })`, check `stop_reason` (refusal -> friendly "I can't help with that one"), post the text reply as the bot (reply_to the question); key missing -> "AI answers aren't on yet"; cap hit -> "I've answered a lot today — try the questions above or ask again tomorrow"; Anthropic error -> "I'm having trouble, try again in a bit" (typed SDK errors, no string matching). Log usage tokens (incl. `cache_read_input_tokens`) to `bot_usage`.
- [ ] Tests with the fake client: canned path makes no Claude call; caps; refusal; missing key; system prompt byte-identical across two questions (cache-safe). Deploy to the TEST project (`supabase functions deploy hallpass --project-ref <test>`); one real end-to-end question only if a test key is available (otherwise fake). Commit "Chat: Hallpass answers with Claude".

### Task 19: Phase 3 end-to-end and ship

- [ ] e2e: quick-pick answer appears instantly for the asker only; typed FAQ question answered; non-FAQ question with AI off -> "AI answers aren't on yet"; owner edits an FAQ entry and toggles AI; bot DM works for a member who has friends-only DMs.
- [ ] Ship: apply 0004/0005 and deploy the function to live; give Sean click-by-click steps for the Anthropic Console account, a monthly spend limit, the API key, and adding it in Supabase -> Edge Functions -> Secrets as `ANTHROPIC_API_KEY` (Claude never sees it); hub push; live check (FAQ answer as a guest-visible demo in `help`, AI reply after Sean adds the key).
