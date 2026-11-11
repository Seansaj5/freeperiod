# Chat Discord Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Free Period chat look and work like Discord: collapsible channel categories, voice channels, the Discord gray + lime look, and a cooler animated background for the server only.

**Architecture:** One new migration (0013) adds categories, channel kinds, voice kicks and Realtime policies for voice topics. The hub gets a pure sidebar logic module, a pure voice logic module, and a voice engine singleton: a WebRTC mesh signaled over private Supabase Realtime channels. The sidebar, channel manager, members list and overlay are reworked on top, then restyled.

**Tech Stack:** Postgres/Supabase (RLS, SECURITY DEFINER, Realtime presence + broadcast), vanilla ES modules (static GitHub Pages hub, no build, no new npm deps), WebRTC, node:test, PGlite, puppeteer-core.

**Spec:** `/Users/sean_0/Projects/free-period-chat/docs/superpowers/specs/2026-11-10-chat-discord-round-design.md`

## Global Constraints

- Hub work: worktree `/Users/sean_0/Projects/free-period-chat`, branch `chat`. Database work: worktree `/Users/sean_0/Projects/bing-ball-chat`, branch `chat`. Never touch `/Users/sean_0/Projects/free-period` or `/Users/sean_0/Projects/bing-ball`: other sessions work there.
- Migrations 0001-0012 are applied somewhere and are never edited. All DB changes go in `supabase/migrations/0013_categories_voice.sql`, idempotent (safe to re-apply). After 0013, never re-run 0011 or earlier rate_take migrations (they would drop the `voice_kick` kind).
- Never touch the LIVE project (`sazaigcsheegwgpogegq`). Tests use PGlite and the TEST project (`buigcdsxebwjlckfrbbb`) via `<scratchpad>/chattest/env.test` and `apply.mjs` without `--live`. Never print keys or tokens. Scratchpad = `/private/tmp/claude-501/-Users-sean-0/a25218ce-cf79-484d-b307-aedad648254a/scratchpad`.
- Hub: no new dependencies, no build step. `node --test tests/` from the hub root stays green (247 before this plan).
- Every SECURITY DEFINER function pins `set search_path = public`, revokes execute from `public, anon` and grants only what clients need.
- Exact copy: category seed names `Information`, `Hangout`, `Games`, `Suggestions`, `Voice`. Voice channels `lounge` / `gaming` / `study-hall`, emoji `🔊`, topics `Hang out and talk` / `Talk while you play` / `Quiet homework help`. Error texts are in Task 3's `VOICE_ERRORS`.
- Voice: max **8** per channel, STUN `stun:stun.l.google.com:19302` and `stun:stun1.l.google.com:19302`, no TURN, ICE wait cap **2000 ms**, speaking hold **250 ms**, kick window **60 s**.
- Colors (spec §3): rail `#1e1f22`, sidebar `#2b2d31`, chat `#313338`, panel `#232428`, text `#dbdee1`, muted `#949ba4`, hover `rgba(78,80,88,.3)`, selected `rgba(78,80,88,.6)`, mention badge `#f23f43`, lime `var(--lime)` for highlights.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The school network blocks peer-to-peer** (ICE fails): that peer's row shows "can't reach", the rest of voice keeps working, and there is one retry (no endless renegotiation). Owned by Task 3 (fake-RTC test `ice failure marks the peer unreachable and retries once`).
2. **Same account joins voice in two tabs:** the newest join wins and the older tab leaves with reason `moved`, so presence never shows the person twice. Owned by Task 3 (`rosterFromPresence keeps the newest session` and `supersededBy`).
3. **The owner deletes a voice channel while people are in it:** their clients leave with reason `gone`, and the sidebar ignores roster entries for missing channels. Owned by Task 2 (`groupSidebar ignores roster for unknown channels`) and Task 3 (`channelGone leaves`).
4. **Mic denied or missing** (Safari/iPhone): a clear error, status back to `idle`, and joining again works. Owned by Task 3 (`mic denied → error mic, idle; retry works`).
5. **A category is deleted while it has channels:** they move to "no category" at the top, and a stale collapsed id is harmless. Owned by Task 1 (DB `on delete set null` test) and Task 2 (`category_id pointing to a missing category counts as uncategorized`).

---

### Task 1: Migration 0013 (categories, channel kinds, voice kicks, voice Realtime policies)

**Files:**
- Create: `/Users/sean_0/Projects/bing-ball-chat/supabase/migrations/0013_categories_voice.sql`
- Test: `<scratchpad>/chattest/pglite/voice.test.mjs` (pattern: `pglite/badges.test.mjs`, harness `pglite/harness.mjs`, run with `CHAT_MIGRATIONS=/Users/sean_0/Projects/bing-ball-chat/supabase/migrations`)
- Test: `<scratchpad>/chattest/categories-voice.real.test.mjs` (pattern: `badges.real.test.mjs`, users `v<hex>_<n>`, deleted after)

**Interfaces:**
- Produces (SQL): table `public.categories(id bigint identity pk, name text, position int, created_at)`; `channels.category_id bigint null → categories(id) on delete set null`; `channels.kind text default 'text' check in ('text','voice')`; `public.is_voice_channel(id bigint) returns boolean`; table `public.voice_kicks(id, target uuid, channel_id bigint, by uuid, until timestamptz, created_at)`; RPC `public.voice_kick(target uuid, channel bigint) returns void`; rate kind `voice_kick` (30 per minute); Realtime topics `chat:voice` (presence) and `chat:voice:<voice channel id>` (broadcast).
- Refusal codes are the existing ones: `not_allowed`, `slow_down`.

- [ ] **Step 1: Write the failing PGlite tests** (`voice.test.mjs`, one `describe('0013')`):
  - `seed`: categories are `Information, Hangout, Games, Suggestions, Voice` at positions 0-4. Channel→category matches the spec's seed, but only for channel names that exist: the PGlite seed lacks homework-help/game-suggestions/suggestions, so the test inserts them first. `lounge`, `gaming` and `study-hall` exist with kind `voice`, emoji `🔊` and the spec topics. Positions are 0.. inside each category in seed order.
  - `re-apply is idempotent`: applying 0013 twice leaves 5 categories and 3 voice channels, and every channel's category unchanged.
  - `categories RLS`: anon and member can `select`. A member's insert/update/delete is refused (permission denied or 0 rows). The owner's work.
  - `delete category sets channels uncategorized`: the owner deletes `Games`, and `bing-ball.category_id is null`.
  - `kind is fixed`: the owner's `update channels set kind='voice' where name='general'` raises `not_allowed`.
  - `no messages in voice channels`: a member's insert into `lounge` raises `not_allowed`, and so does the service role's.
  - `voice_kick rules`:
    - a member gets `not_allowed`;
    - a mod kicking a member creates 1 row with `until` within `now()+60s ± 5s`;
    - a mod kicking a mod, anyone kicking the owner, kicking yourself, and a text channel id all give `not_allowed`;
    - the 31st kick in a minute by one caller gives `slow_down`.
  - `voice_kicks RLS`: a member can select rows, and a member's direct insert/update/delete is refused.
  - `rate kinds kept`: `rate_hits_kind_check` allows every 0011 kind plus `voice_kick`.

- [ ] **Step 2: Run them and see them fail**
  Run: `cd <scratchpad>/chattest/pglite && CHAT_MIGRATIONS=/Users/sean_0/Projects/bing-ball-chat/supabase/migrations node --test voice.test.mjs`
  Expected: FAIL (no categories table).

- [ ] **Step 3: Write `0013_categories_voice.sql`**
  - Header comment in the style of 0011: what, why, and the re-run warning.
  - Policies `categories_select` (anon, authenticated: `true`), plus `categories_insert_owner`, `categories_update_owner` and `categories_delete_owner` (`public.my_role() = 'owner'`). Grants mirror `channels`.
  - Trigger `channels_kind_fixed` (BEFORE UPDATE): `new.kind is distinct from old.kind` raises `not_allowed`.
  - Trigger `messages_a0_not_voice` (BEFORE INSERT on messages, all roles): a voice channel raises `not_allowed`.
  - `voice_kick`:
    - follows `timeout_user`'s who-may-moderate-whom rule (lines 859-866 of 0001);
    - the channel must satisfy `is_voice_channel`;
    - calls `public.rate_take('voice_kick')`, and false raises `slow_down`;
    - deletes kicks older than 1 day;
    - inserts with `until = now() + interval '60 seconds'`.
  - Re-create `rate_take` with 0011's body plus `elsif what = 'voice_kick' then lim := 30; win := interval '1 minute';`.
  - Re-create the two 0007 `realtime.messages` policies with the same clauses, adding:
    `or ((select realtime.topic()) = 'chat:voice' and public.can_post())`
    `or ((select realtime.topic()) ~ '^chat:voice:[0-9]{1,18}$' and public.can_post() and public.is_voice_channel(substr((select realtime.topic()), 12)::bigint))`
  - Add `categories` and `voice_kicks` to `supabase_realtime`, guarded like 0007's emoji block.
  - Seed with `on conflict do nothing` / `where not exists` so it's re-applicable. Assign categories only where `category_id is null`.

- [ ] **Step 4: Run the PGlite tests and the old suites**
  Run the Step 2 command, then the existing suites in `pglite/` (`node --test *.test.mjs` with the same env).
  Expected: all pass. The old suites stay green.

- [ ] **Step 5: Apply to TEST and add the real-project tests** (`categories-voice.real.test.mjs`)
  Apply with `cd <scratchpad>/chattest && node apply.mjs buigcdsxebwjlckfrbbb /Users/sean_0/Projects/bing-ball-chat/supabase/migrations/0013_categories_voice.sql`. The tests:
  - `member joins chat:voice presence and tracks`: SUBSCRIBED, and a second member sees the tracked `{ch, mute, deaf}`.
  - `voice topic for a voice channel works, for a text channel is refused`: `chat:voice:<lounge id>` gets SUBSCRIBED and a broadcast is received by the other member. `chat:voice:<general id>` gets CHANNEL_ERROR (unauthorized).
  - `timed-out member is refused voice topics`.
  - `guest (anon) is refused chat:voice`.
  - `voice_kick through supabase-js` (mod → member) returns OK, and the row is visible to the target.

  Run: `node --test categories-voice.real.test.mjs policies.real.test.mjs ownerfriends.real.test.mjs`
  Expected: all pass (policies 94/94).

- [ ] **Step 6: Commit** (bing-ball-chat, branch `chat`): `git add supabase/migrations/0013_categories_voice.sql && git commit -m "Chat: 0013 categories, voice channels (kind), voice kicks, voice Realtime topics"`. The test files live in the scratchpad (not committed).

---

### Task 2: Data layer + pure sidebar logic

**Files:**
- Modify: `fp/chat/data.js` (categories CRUD, channel create/move with category + kind, voice kick, server subscription for `categories` and `voice_kicks`)
- Create: `fp/chat/sidebarlogic.js` (pure, no DOM)
- Test: `tests/sidebarlogic.test.mjs` (hub, node:test)
- Test: extend `<scratchpad>/chattest/data.test.mjs` (real TEST, through data.js like the hub)

**Interfaces:**
- Produces (data.js):
  - `listCategories(): Promise<{id, name, position}[]>`, ordered by position, then id;
  - `createCategory({ name }): Promise<Category>` (position = max + 1);
  - `updateCategory(id, { name }): Promise<Category>`;
  - `deleteCategory(id): Promise<void>`;
  - `moveCategory(id, position): Promise<Category>`;
  - `createChannel({ name, emoji, topic, ownerOnly, categoryId = null, kind = 'text' })`: the existing function plus two fields;
  - `moveChannel(id, position, categoryId)`: when `categoryId` is not `undefined`, it also sets `category_id` (null allowed);
  - `updateChannel(id, patch)` also accepts `category_id`;
  - `voiceKick(userId, channelId): Promise<void>` (rpc `voice_kick`);
  - `listVoiceKicks(): Promise<{target, channel_id, until}[]>` (only `until > now`);
  - `subscribeServer(handlers)` gains `category(ev)` (the same `ev` shape as the existing `channel` handler) and `voiceKick(row)` (INSERT on `voice_kicks`).
- Produces (sidebarlogic.js):
  - `groupSidebar({ channels, categories, collapsed, current, roster, guest, showEmpty }) → Array<{ category: Category|null, collapsed: boolean, channels: Channel[] }>`:
    - `collapsed: Set<number>`;
    - `roster: Map<channelId, Array<{id}>>`;
    - `showEmpty: boolean`: the owner sees categories with no channels.
  - `readCollapsed(storage) → Set<number>` and `writeCollapsed(storage, set)`: key `fp.chat.cats`, every access in try/catch, a broken or missing storage gives an empty Set.
  - `voiceLabel(name) → string`: `study-hall` → `Study Hall`.
  - `memberSections(profiles, onlineIds: Set<string>) → Array<{ key, title, people }>`:
    - keys `owner|mods|bots|online|offline` with titles `Owner|Mods|Bots|Online|Offline`;
    - empty sections are left out;
    - offline people of any role go in `offline`;
    - people are sorted by `name || username`, case-insensitive.

- [ ] **Step 1: Write failing unit tests** (`tests/sidebarlogic.test.mjs`):
  - `uncategorized channels come first with category null`;
  - `categories by position then id; channels by position then id`;
  - `collapsed category keeps only the current channel and voice channels with people`;
  - `guest: categories without visible channels are omitted`;
  - `showEmpty keeps empty categories for the owner`;
  - `category_id pointing to a missing category counts as uncategorized`;
  - `groupSidebar ignores roster for unknown channels`;
  - `readCollapsed/writeCollapsed round trip; throwing storage → empty Set, no throw`;
  - `voiceLabel`: `('lounge') → 'Lounge'`, `('study-hall') → 'Study Hall'`;
  - `memberSections`:
    - online owner → owner;
    - online mod → mods;
    - online bot → bots;
    - offline mod → offline;
    - sorted;
    - empty sections are omitted.

- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/sidebarlogic.test.mjs`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `fp/chat/sidebarlogic.js`** with the signatures above.

- [ ] **Step 4: Extend `data.js` and the real data tests.** Use the existing `check()` / `checkField` patterns. Add `category_id`, `kind` and `categories` to the field whitelist. In `data.test.mjs` (against TEST with 0013), add:
  - `owner creates, renames, moves, deletes a category; member refused`;
  - `createChannel with categoryId + kind voice`;
  - `moveChannel into another category`;
  - `voiceKick mod→member; listVoiceKicks shows it`;
  - `subscribeServer category + voiceKick events arrive`.

- [ ] **Step 5: Run everything.** Run: `node --test tests/` (hub) and `cd <scratchpad>/chattest && node --test data.test.mjs`. Expected: all pass.

- [ ] **Step 6: Commit** (hub, `chat`): `fp/chat/data.js fp/chat/sidebarlogic.js tests/sidebarlogic.test.mjs`.

---

### Task 3: Voice engine (pure logic + WebRTC mesh singleton)

**Files:**
- Create: `fp/chat/voicelogic.js` (pure)
- Create: `fp/chat/voice.js` (singleton engine; no DOM except hidden `<audio>` elements appended to `document.body`)
- Modify: `fp/chat/data.js`: add `voiceChannel(topic, { presenceKey, onSync, onBroadcast, onStatus })`, a thin private-channel wrapper (`config: { private: true, broadcast: { self: false }, presence: { key } }`) returning `{ track(payload), untrack(), send(event, payload), presenceState(), stop() }`. Export the existing `myId()` if it isn't exported.
- Test: `tests/voicelogic.test.mjs` and `tests/voice.test.mjs` (fake RTC + fake channels, injected)

**Interfaces:**
- Consumes: Task 1 topics; Task 2 `voiceKick`, `listVoiceKicks`, `subscribeServer({ voiceKick })`.
- Produces (voicelogic.js):
  - `VOICE_MAX = 8`, `ICE_WAIT_MS = 2000`, `SPEAK_HOLD_MS = 250`, `KICK_MS = 60000`;
  - `VOICE_ERRORS = { mic: 'Allow the microphone to join voice', nomic: 'No microphone found', full: '{name} is full (8 people)', kicked: 'A mod disconnected you from voice', blocked: 'You can’t join voice while timed out or banned', lost: 'Voice connection lost', moved: 'You joined voice in another tab', gone: 'That voice channel was deleted' }`;
  - `isOfferer(myId, peerId) → boolean` (`myId < peerId`);
  - `rosterFromPresence(state) → Map<number, Array<{ id, mute, deaf, sess, at }>>`:
    - the input is the shape of supabase `presenceState()`;
    - it keeps each user's newest meta by `at`;
    - entries without a valid integer `ch` are dropped;
    - each list is sorted by `at`.
  - `supersededBy(myId, mySess, myAt, state) → boolean`: true when my id has a newer session in presence.
  - `canJoin({ roster, channelId, myId, kicks, now }) → { ok: true } | { ok: false, reason: 'full' | 'kicked' }`;
  - `peerDiff(current: Set, wanted: Set) → { add: string[], drop: string[] }`;
  - `speakingStep(prev: { speaking, lastLoud }, level: number, now: number, threshold = 0.04) → { speaking, lastLoud }`.
- Produces (voice.js), `export const voice`:
  - `voice.watch() → stop()`: ref-counted subscription to `chat:voice` presence, for sidebar occupants;
  - `voice.roster() → Map` (from `rosterFromPresence`);
  - `voice.state() → { status: 'idle'|'joining'|'connected'|'error', channelId, mute, deaf, error: keyof VOICE_ERRORS | null, peers: Map<id, { state: 'connecting'|'connected'|'unreachable', speaking }>, meSpeaking }`;
  - `voice.onChange(fn) → unsubscribe` (fires on roster or state change);
  - `voice.join({ id, name })` and `voice.leave(reason?)`;
  - `voice.setMute(bool)` and `voice.setDeaf(bool)`: these work while idle too, and the setting is applied on join;
  - `voice.channelGone(id)`;
  - `voice._inject({ RTCPeerConnection, getUserMedia, AudioContext, channelFactory, now })` for tests.

- [ ] **Step 1: Write failing tests**
  - `voicelogic.test.mjs`:
    - `isOfferer`;
    - `rosterFromPresence keeps the newest session`, drops a bad `ch`, sorts by `at`;
    - `supersededBy`;
    - `canJoin full at 8 (me not counted twice) and kicked within 60 s`;
    - `peerDiff`;
    - `speakingStep holds 250 ms after the last loud frame`.
  - `voice.test.mjs`, with fakes:
    - `join tracks presence {ch, mute, deaf, sess, at} and offers only to bigger ids`;
    - `answer path: an offer addressed to me is answered once`;
    - `ignores signals addressed to someone else`;
    - `ice failure marks the peer unreachable and retries once`;
    - `mic denied → error mic, idle; retry works` (NotAllowedError);
    - `NotFoundError → nomic`;
    - `kick of me leaves with kicked; kick of a peer drops that peer and refuses it until until`;
    - `channelGone leaves`;
    - `superseded session leaves with moved`;
    - `deafen mutes remote audio and self`;
    - `leave sends bye, closes peers, stops tracks, untracks`;
    - `9th joiner gets full`.

- [ ] **Step 2: Run them and see them fail.** Run: `node --test tests/voicelogic.test.mjs tests/voice.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement `voicelogic.js`, `data.js voiceChannel`, then `voice.js`**
  - Signaling payloads: `{ from, to, sdp, sess }`.
  - Before sending the local description, wait for `iceGatheringState === 'complete'` or `ICE_WAIT_MS`.
  - Remote audio goes to `<audio autoplay playsinline>`, created during `join` (a user gesture).
  - `pagehide` sends `bye`.
  - The engine's Realtime channels are separate from the chat app's, so the app's `pauseLive` (app.js:925) never touches them.
  - A `connectionState === 'failed'` triggers one `restartIce` renegotiation by the offerer, then `unreachable`.

- [ ] **Step 4: Run the tests.** Run: `node --test tests/`. Expected: all pass.

- [ ] **Step 5: Commit** (hub): `fp/chat/voicelogic.js fp/chat/voice.js fp/chat/data.js tests/voicelogic.test.mjs tests/voice.test.mjs`.

---

### Task 4: Sidebar categories + voice UI + channel manager + members sections + overlay indicator

**Files:**
- Modify: `fp/chat/views/channels.js` (render `groupSidebar` output, category headers with `aria-expanded`, owner `+` → `onAddChannel(categoryId)`, voice rows + occupant rows, bottom panel mic/headphones/settings)
- Create: `fp/chat/views/voicebar.js` (`mountVoiceBar(el, { onLeave }) → { render(state, channel) }`: "Voice Connected", channel name, a signal state built from peer states, disconnect)
- Modify: `fp/chat/views/mod.js` `openChannelManager` (categories: create/rename/delete/move; channels: move up/down, change category; the new-channel form gets Category and Type Text/Voice)
- Modify: `fp/chat/views/members.js` (server list uses `memberSections`; DMs keep the flat list)
- Modify: `fp/chat/app.js`:
  - load and subscribe categories;
  - `voice.watch()` while ready;
  - clicking a voice row → `voice.join`, and errors show `VOICE_ERRORS[...]` with `{name}` replaced by `voiceLabel(channel.name)`;
  - my profile turning banned/timed out → `voice.leave('blocked')`;
  - channel DELETE → `voice.channelGone(id)`;
  - staff "Disconnect from voice" on the member menu while that person is in voice → `voiceKick`.
- Modify: `fp/chat/overlay.js` (green speaker dot on the chat button while `voice.state().status === 'connected'`; closing the overlay never calls `voice.leave`)

**Interfaces:**
- Consumes: Task 2 `groupSidebar`, `readCollapsed`, `writeCollapsed`, `voiceLabel`, `memberSections`, category CRUD, `moveChannel`, `voiceKick`. Task 3 `voice`, `VOICE_ERRORS`.
- Produces: the DOM hooks the e2e uses (keep them stable):
  - `.cx-cat[data-cat="<id>"]` header button with `aria-expanded`;
  - `.cx-cat-add`;
  - `.cx-ch.voice[data-ch="<id>"]`;
  - `.cx-vc-user[data-user="<id>"]`, with the `.speaking` class;
  - `.cx-vbar` with `.cx-vbar-leave`;
  - `.cx-me-mic` and `.cx-me-deaf` with `aria-pressed`;
  - `.cx-mem-sec[data-sec="owner|mods|bots|online|offline"]`;
  - overlay `.fpco-voice`.

- [ ] **Step 1: Write failing tests where logic is involved:** `tests/sidebarlogic.test.mjs` already covers grouping. Add `tests/voicebar.test.mjs` for `signalLabel(peers) → 'Connected' | 'Connecting…' | 'Can’t reach 1 person'`, exported from `views/voicebar.js`; keep it DOM-free.
- [ ] **Step 2: Implement the views and wiring** listed above. Keep the existing channel row behavior (unread, mentions, lock, aria labels).
- [ ] **Step 3: Verify in a browser.** Use the local hub on TEST (see `<scratchpad>/e2e/chat.e2e.mjs` for starting local Bing Ball 3100 + hub 5178) with a quick puppeteer script:
  - categories render and collapse persists after reload;
  - the owner `+` opens the form with that category;
  - two pages with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` join `lounge` and each shows the other under it.
- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 5: Commit** (hub).

---

### Task 5: Discord gray + lime restyle and the server-only background

**Files:**
- Modify: `chat.css`, `fp/chat/overlay.css` (tokens + rules), `fp/chat/views/*.js` only where class hooks are needed
- Test: screenshots under `<scratchpad>/shots/discord-*.png` at 1440×900 and 390×844

**Interfaces:**
- Consumes: Task 4 DOM hooks.
- Produces: the root class `.cx-app.server` on the server view and `.cx-app.dms` on DMs/friends. Use the existing root element and add the mode class in `app.js` if no such hook exists.

- [ ] **Step 1: Restyle with the Global Constraints colors**
  - Outfit everywhere in the chat; Bungee only for `.cx-srv-name`.
  - 32-34 px channel rows with a 6 px radius, `#` glyph rows, the Discord channel header (`#` + name 700 16px | muted topic).
  - Message row hover, red mention badges, lime pips/unread/buttons/links/focus.
  - Flair, frames and effects keep working: check the profile card, a symbiote frame and the Ember flair on the new background.
- [ ] **Step 2: Add the server background**, server view only:
  - `::before`/`::after` layers behind the message list and the sidebar header;
  - lime, cyan and violet radial gradients at ≤ 0.18 opacity, drifting with transform animations (≥ 20 s loops);
  - a faint dotted grid and a vignette;
  - a scrim so message text keeps ≥ 4.5:1 contrast;
  - no `filter: blur` or `backdrop-filter` on scrolling content;
  - `@media (prefers-reduced-motion: reduce)` stops the animation;
  - `.cx-app.dms` stays plain `#313338`;
  - the overlay uses the same background at half opacity.
- [ ] **Step 3: Screenshots and checks:**
  - server and DM views at both sizes;
  - a contrast check of message text over the brightest background point;
  - no console errors;
  - `node --test tests/` green.
- [ ] **Step 4: Commit** (hub).

---

### Task 6: e2e coverage of the round

**Files:**
- Modify: `<scratchpad>/e2e/chat.e2e.mjs` (selectors for the restyle and categories; keep all 297 existing checks meaningful)
- Create: `<scratchpad>/e2e/voice.e2e.mjs` (two or three Chrome pages with fake media)

- [ ] **Step 1: Update `chat.e2e.mjs`** for the new sidebar markup. Add checks:
  - categories in seed order;
  - collapse persists;
  - the owner creates a category, moves `bing-ball` into it, and creates a voice channel in it;
  - deleting the category moves `bing-ball` to the top;
  - members sections appear in the right order;
  - DMs have `.cx-app.dms` and no animated background.
- [ ] **Step 2: Write `voice.e2e.mjs`** with the scenario below; each item is one check:
  - member A and member B join `lounge`;
  - both show both occupants;
  - both `RTCPeerConnection.connectionState === 'connected'`, read via `voice._debug()` (Task 3 adds a test-only getter returning `{ peers: [{ id, state, bytesIn }] }`);
  - inbound audio `bytesReceived > 0` within 10 s;
  - A mutes, and B sees the muted icon on A;
  - a mod disconnects B: B shows the `kicked` error and can't rejoin for 60 s;
  - A closes the overlay on a play page and stays connected;
  - A leaves, and the roster empties.
- [ ] **Step 3: Run both suites.** Expected: all pass. Write the counts to the ledger.
- [ ] **Step 4: Nothing to commit in the repos** (the harness lives in the scratchpad). Record the run in the ledger.

---

## After the tasks (controller)

1. Final whole-branch review (most capable model), one fix round if needed.
2. Ask Sean for the LIVE apply of 0012 + 0013. The classifier refuses LIVE schema changes without his explicit OK.
3. After his OK:
   - run `liveroles.mjs`, apply 0012 then 0013 `--live`, and verify (categories seeded, voice channels exist, 0 tables without RLS, saj still owner);
   - merge origin/main into hub `chat`, run `node --test tests/`, `git push origin chat:main`;
   - push bing-ball `chat` to `origin chat`;
   - run the live smoke.
