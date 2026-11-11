# Free Period chat: Discord round (categories, voice, Discord look) — design

Date: 2026-11-10. Builds on the live chat (spec `2026-11-09-free-period-chat-design.md`; live hub b29605c+, live DB at 0011,
0012 owner-friends written and tested, waiting for Sean's OK to apply LIVE).

## What Sean asked for

- "make the discord thing a lot more like discord and has seperate dividers for each channels, and if you can voice
  channels if not thats ok"
- Picked **"Discord gray + lime"**: Discord's dark gray panels and spacing, Free Period lime for highlights, unread dots
  and buttons. Approved the sidebar mockup: `▾ INFORMATION  +` headers, `# general` rows (no emoji tile), voice rows
  `🔊 Lounge` with people under them (green ring = talking), a "Voice Connected" bar, and a bottom panel
  `(avatar) Saj  🎤 🎧 ⚙`.
- "Make the server background theme look cooler, this is only for the server not dms tho".
- Already done separately (not in this round): #homework-help, #game-suggestions, #suggestions + Hallpass pinned guides
  and FAQ; profile card button fix; 0012 owner auto-friends.

## Scope

1. **Categories** (Discord's collapsible dividers) — database + sidebar + owner management.
2. **Voice channels** — peer-to-peer audio (WebRTC mesh) with Supabase Realtime for presence and signaling.
3. **Discord look** — Discord gray + lime restyle of the chat page and overlay, Discord-style member list sections and
   bottom user panel (mic / headphones / settings).
4. **Cooler server background** — animated, server view only; DMs stay plain gray.

Out of scope: threads, message search, video/screen share, text chat inside voice channels, TURN relay (needs an account
Sean would make; added later only if school Wi-Fi blocks direct connections).

## 1. Categories

**Data (migration `0013_categories_voice.sql`, bing-ball repo `supabase/migrations`, never edit 0001-0012):**

- `public.categories (id bigint identity pk, name text not null (1-24 chars, no control chars), position int not null
  default 0, created_at timestamptz default now())`.
- `channels.category_id bigint null references categories(id) on delete set null`.
- `channels.kind text not null default 'text' check (kind in ('text','voice'))`. Kind is fixed after creation
  (an update that changes kind is refused) so a voice channel never holds messages.
- RLS: categories readable by anon and authenticated (names are public); insert/update/delete owner only (same rule as
  channels). Categories join the `supabase_realtime` publication (DELETE events reveal only an id).
- Seed (idempotent, by channel name): INFORMATION (0): announcements, rules · HANGOUT (1): general, homework-help, help ·
  GAMES (2): bing-ball, close-call, horror-exe · SUGGESTIONS (3): game-suggestions, suggestions · VOICE (4): new voice
  channels `lounge`, `gaming`, `study-hall` (emoji 🔊, topics "Hang out and talk", "Talk while you play",
  "Quiet homework help"). Channel positions are re-numbered inside each category in the order above.
- Stored names are as typed ("Information"); the sidebar shows them upper-case via CSS.

**Sidebar:** channels with no category come first with no header (Discord does this). Each category: header with a
chevron, upper-case name, and (owner only, on hover/focus) a `+` that opens "new channel" with that category chosen.
Clicking the header collapses/expands it; collapsed ids are remembered per device in `localStorage['fp.chat.cats']`
(try/catch, works without storage). A collapsed category still shows the open channel and any voice channel that has
people in it (Discord's rule). Categories with no channel the viewer can see are hidden (guests see only INFORMATION).
Rows follow the approved mockup: `#` glyph + name, lock for owner-only, unread = white bold + lime pip, mention count
badge. Voice rows: speaker glyph + display name (`study-hall` → "Study Hall"), then one indented row per person in it.

**Owner management (the existing Channels sheet, `openChannelManager` in `views/mod.js`):** create / rename / delete
categories (deleting moves its channels to "no category"), move a category up/down, move a channel up/down inside its
category or to another category, and the "new channel" form gains Category and Type (Text / Voice).

## 2. Voice channels

**How it works:** full mesh WebRTC audio, at most **8 people per voice channel** (the 9th sees "Lounge is full").
Audio goes browser-to-browser (never through our servers, never recorded). STUN: `stun:stun.l.google.com:19302` and
`stun:stun1.l.google.com:19302`; no TURN in this round.

- **Presence (who is in which voice channel):** one private Realtime channel `chat:voice` for the whole server, presence
  key = user id, payload `{ ch: <voice channel id>, mute: bool, deaf: bool }`. Every signed-in member subscribes so the
  sidebar shows people under voice channels even when not in voice.
- **Signaling:** private broadcast channel `chat:voice:<channel id>` per voice channel, events `offer` / `answer` / `bye`,
  payload `{ from, to, sdp }`. ICE is not trickled: each side waits for gathering to finish (cap 2 s) and sends one SDP
  with candidates inside, so a pair costs 2 messages. **The member with the smaller user id makes the offer** (no
  glare). Peers come and go by presence: a new id in my channel's presence → connect; gone → close.
- **Realtime policies (0013):** `chat:voice` and `chat:voice:<id>` are allowed for receive and send only when
  `public.can_post()` (signed in, member, not banned, not timed out) and, for `chat:voice:<id>`, the channel exists with
  kind `voice`. Same known limit as 0007: presence payloads are what the client sends (cosmetic).
- **Staff disconnect:** `public.voice_kick(target uuid, channel bigint)` (owner and mods; same who-may-moderate-whom rule
  as the existing mod tools — the owner can't be kicked) inserts `voice_kicks (target, channel_id, until = now()+60s,
  by, created_at)`; rate limited through `rate_take`. `voice_kicks` is readable by members and in the Realtime
  publication. The target's client leaves and can't rejoin that channel until `until`; every other client drops and
  refuses that peer until then. Bans and time-outs also end voice (can_post false → the client leaves; the policy refuses
  rejoining).
- **Client (`fp/chat/voice.js`, a module-level singleton, not tied to the chat app's pause):** join (mic permission
  asked inside the click, so Safari/iOS can play audio), leave, switch channel (leave then join), mute, deafen (= mute
  all remote audio + mute self, like Discord), speaking detection (AnalyserNode level with a 250 ms hold) for me and each
  peer → green ring, per-peer state `connecting / connected / unreachable` (ICE failed → "can't reach" on their row),
  `pagehide` sends `bye`. Pure logic (offerer rule, roster from presence, capacity, display names, speaking hold) lives in
  `fp/chat/voicelogic.js` for unit tests.
- **Errors shown in plain words:** mic blocked ("Allow the microphone to join voice"), no mic, channel full, kicked
  ("A mod disconnected you from voice"), timed out/banned, connection lost.
- **Where it works:** the Messages page and the in-game chat overlay. Closing the overlay keeps voice on (its Realtime
  channels are separate from the app's paused ones, so the socket stays open); the overlay button shows a green
  speaker dot while connected. Leaving the page hangs up (browser limit). Guests never see voice channels.

**UI:** "Voice Connected" bar above the bottom panel (channel name, signal state, disconnect button); the bottom panel
gets mic and headphones toggles (work before joining too, like Discord) next to settings. Staff get "Disconnect from
voice" on a voice occupant's row menu and on the profile card's mod menu while that person is in voice.

## 3. Discord look (gray + lime)

- Tokens (chat page + overlay): rail `#1e1f22`, sidebar `#2b2d31`, chat `#313338`, bottom panel `#232428`, header
  shadow `0 1px 0 rgba(4,4,5,.2), 0 1.5px 0 rgba(6,6,7,.05), 0 2px 0 rgba(4,4,5,.05)`, text `#dbdee1`, muted `#949ba4`,
  hover `rgba(78,80,88,.3)`, selected `rgba(78,80,88,.6)`. Lime (`--lime`) for selected pip, unread dots, primary
  buttons, links and focus rings. Mention count badges red `#f23f43` (Discord's ping signal).
- Type: Outfit everywhere in the chat; Bungee only for the server name in the sidebar header. Channel header:
  `#` + name (Outfit 700 16px) | topic (muted), then the existing actions.
- Rows 32-34 px, 6 px radius, 8 px side padding; messages keep their structure, restyled with the tokens (hover
  background on message rows, Discord spacing).
- **Members list:** sections like Discord — OWNER, MODS, BOTS (only online people in role sections), then ONLINE and
  OFFLINE (`OWNER — 1`). DMs keep their flat list.
- The rest of Free Period (home, games) keeps its look; profile flair/frames/effects keep working on the new colors.

## 4. Cooler server background (server only)

Behind the **server** message pane and sidebar header: a slow animated aurora (lime, cyan and violet light at low
opacity drifting over the gray) plus a faint dotted grid and a soft vignette, CSS only (transform/opacity animations on
pseudo-elements, no blur filters on scrolling content, so phones stay smooth). Message text keeps ≥ 4.5:1 contrast
(a dark scrim under the list where needed). `prefers-reduced-motion` → still image. **DMs and the friends page stay
plain Discord gray.** The overlay uses the same server background, dimmer.

## Testing

- PGlite policy tests for 0013 (categories RLS, kind fixed, messages refused in voice channels, voice_kick rules,
  realtime.messages policies for the voice topics) + a real TEST-project suite (`categories-voice.real.test.mjs`).
- Unit tests (`node --test tests/`): voicelogic (offerer, roster, capacity, kick window, names, speaking hold) and
  category grouping (`fp/chat/catlogic.js`: no-category first, order, collapsed rule, guest filtering).
- e2e (scratchpad harness, local Bing Ball + hub on TEST): categories render and collapse persists; owner creates a
  category, moves a channel, creates a voice channel; two headless Chromes with fake media
  (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`) join Lounge, see each other under it, reach
  `connected` with inbound audio bytes > 0, mute shows on both, staff disconnect works, the overlay keeps voice when
  closed; DMs have the plain background; screenshots at 1440 and 390.
- Live apply of 0012 + 0013 needs Sean's explicit OK (the classifier refuses it otherwise).
