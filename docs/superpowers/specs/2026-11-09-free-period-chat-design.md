# Free Period chat: one server for everyone, DMs, overlay, Nitro-style profiles (design, 2026-11-09)

Sean's ask: a chat/messages area like Discord. One big server everyone is in once they make an account, a group chat with no
word filter, private DMs, works as an overlay while playing Bing Ball and the other games, profile customization "like Nitro",
and owner powers for Sean (announcements, rules). Builds on the Free Period accounts work
(`2026-11-09-free-period-accounts-design.md`): Free Period accounts are Bing Ball accounts; Sean's owner account is `Saj`.

## Decisions (Sean, 2026-11-09)
- Overlay: on Free Period's play page, for every game (not inside Bing Ball's own site).
- Profile pictures: uploaded (not picked). Pictures + GIFs in chats too.
- DMs: anyone can DM anyone; everyone has Block and a "DMs from friends only" setting; group DMs up to 10.
- Nitro-style extras: free for everyone.
- Backend: a hosted database. Firebase's free plan has no file storage any more (pay-as-you-go plan needed), so **Supabase**
  (free, no card: 500 MB database, 1 GB files, ~200 people online at once; pauses after 7 days with no use).
- No word filter. Moderation is people, not a filter: owner + mods delete, time out, ban; everyone can block and report.
- Sean approved the design ("I give you permission to do all of it") and will do the account/setup steps himself.

## 1. Architecture
- Supabase project `free-period-chat` (live) and `free-period-chat-test` (tests), both Sean's, region East US.
- Database (Postgres) holds profiles, channels, messages, DMs, reactions, reads, friends, blocks, reports, emoji. Every table has
  row-level security (default deny). Live updates: Supabase Realtime (Postgres changes for messages/reactions, Presence for online
  + typing). Files: Supabase Storage.
- The hub talks to Supabase directly with the public key (`supabase-js` v2, vendored as one self-hosted ES module
  `fp/vendor/supabase.js`, pinned version, built with esbuild; nothing loads from a CDN at school).
- Config `fp/chat/config.js`: live project URL + public key on github.io; the test project on localhost.

## 2. Login: Bing Ball account -> chat session (no second login)
- Supabase public sign-up is turned OFF. Chat users exist only because the Bing Ball server creates them.
- New Bing Ball route `POST /api/chat/session` (Bearer = the Bing Ball session, rate limited per account):
  1. Find or create the Supabase auth user for this account (admin API, plain `fetch`, no new server dependency): email
     `<username lowercase>@users.freeperiod.example` (reserved domain, never mailed), `email_confirm: true`,
     `app_metadata: { username, role }` (role from the Bing Ball account: owner -> `owner`, admin -> `mod`, else `member`).
     Updates app_metadata when the role changed. Keeps the Supabase user id on the Bing Ball user (`user.chatId`).
  2. Upserts the profile row's server-owned fields: `username`, `role`, `game_stats` (Bing Ball level/rank tier from the account;
     Close Call cash/cars and horror.exe wins/escapes parsed from the account's Free Period cloud saves) — trusted, not
     user-editable.
  3. Generates a magic-link token (admin `generate_link`, not emailed) and returns `{ tokenHash }`.
  The hub calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` and gets a Supabase session that refreshes itself, so
  chat keeps working while the Bing Ball server naps. A new device / a new login needs Bing Ball awake once ("Waking up chat…",
  75 s like login).
- Hub logout and account switch call `supabase.auth.signOut()`; a hub login as another user replaces the chat session.
- Render env for Bing Ball: `SUPABASE_URL` (in render.yaml) and `SUPABASE_SERVICE_KEY` (secret, `sync: false`, pasted by Sean in
  Render's Environment tab). Without them the route answers 503 and the hub shows "Chat is coming soon" (no errors).
- Owner = any account whose Bing Ball role is owner (Saj). Mods: Bing Ball admins, plus anyone Sean makes a mod in chat.

## 3. The server
- Seed channels: 📢 announcements and 📜 rules (owner-only posting; everyone reads and reacts), 💬 general, 🎮 bing-ball,
  🚗 close-call, 👹 horror-exe. Owner adds, renames, reorders, deletes channels, sets topic and owner-only.
- Everyone with an account is a member (a profile row = membership). Guests (not signed in) can read announcements + rules.
- Messages: text up to 2000 chars, no word filter; markdown-lite (bold, italic, code, spoilers, links: http(s) only, open in a new
  tab); emoji; reactions; replies; edit/delete own (soft delete: "message deleted"); @username mentions; `@everyone` owner only;
  pictures (re-encoded to WebP, max 1600 px, <= 5 MB) and GIFs (as is, <= 8 MB); pins (owner/mods).
- Live: new messages, edits, deletes and reactions appear instantly; who's online; "X is typing…"; unread dots and @mention
  badges per channel/DM (and in the browser tab title).
- Owner tools: pin, delete any message, time out (10 min / 1 h / 1 day), ban from chat (owner only), make/unmake mods, manage
  channels, see reports. Mods: delete, time out, pin. Crown badge for the owner, shield for mods.
- Limits (inside the free plan): 5 messages per 5 s per person (database trigger); muted/banned can't post (policy); when chat files
  pass 850 MB the oldest chat/DM pictures are deleted down to 700 MB (profile pictures, banners and emoji are kept; their messages
  show "picture expired") — run by the Bing Ball server at most every 6 h while it is awake.

## 4. DMs and friends
- Click a name -> profile card -> Message. 1:1 DMs and group DMs (up to 10 people, a name, members can leave).
- Starting a DM checks (in a database function): neither side blocks the other, the other side's DM setting
  (`everyone` | `friends`), neither is banned.
- Friends: send / accept / decline / remove; a Friends list on the Messages page with online status.
- Block: they can't DM you or add you to groups; their messages in channels are hidden for you ("Blocked message — show").
- Report a message: a copy goes to the owner's Reports view (in the hub's owner Inbox sheet, new "Reports" tab).
- DM text and DM pictures are readable only by the DM's members (DM pictures in a private bucket with signed links). Honest note
  for Sean (not shown in the UI as a promise): as the Supabase project owner he can technically see all data in the dashboard.

## 5. Profiles (Nitro-style, free for everyone)
- Basics: display name (<= 32), pronouns (<= 40), About Me (<= 300), custom status (emoji + <= 80 chars).
- Pictures: profile picture (static re-encoded to 512 px WebP, or animated GIF <= 4 MB, plays), banner (1500x600 image/GIF or a
  color), profile theme (two-color gradient on the card).
- Flair: name color; name style (6 self-hosted fonts: Bungee, Outfit, Press Start 2P, Orbitron, Creepster, Pacifico — all open-licensed; solid or two-color gradient;
  optional glow); 20 avatar frames and 10 profile effects, all drawn in code (SVG/CSS/canvas, animated, no outside art, no
  pink/purple-dominant defaults); badges: Owner, Mod, Early Member (joined chat before 2026-12-01), Bing Ball rank tier.
- Game stats on the card (server-written `game_stats`): Bing Ball level + rank, Close Call cash + cars, horror.exe wins + escapes.
- Custom server emoji: owner/mods upload up to 50 (`:name:`), everyone uses them anywhere.
- Profile editor with a live preview of the card. Profile card popout on clicking any name or avatar.

## 6. Where it shows up (hub)
- `chat.html` (Messages page): left rail (server icon, DMs, Friends), channel list, messages, member list with online status,
  composer (emoji picker, attach, reply). Same lime/cyan Free Period look; phone: one panel at a time with a back button.
- Overlay on `play.html`: a chat button in the top bar (unread badge) slides a 380 px panel over the right side (full width on
  phones); the game keeps running; typing in the panel never reaches the game; Esc or the button closes it; small pop-ups for DMs
  and @mentions while playing.
- Home header: Messages button with an unread count (signed in).
- Rendering never uses innerHTML for user text; links only http(s) with `rel="noopener noreferrer"`; images only from our Supabase
  storage URLs.

## 7. Failure modes (what a person sees)
- Bing Ball asleep at first chat sign-in: "Waking up chat…" (up to 75 s), then it works.
- Supabase paused (7 days idle): "Chat is asleep" banner; the owner sees how to wake it (dashboard -> Restore).
- Offline / Supabase unreachable: "Reconnecting…" bar, messages queue as "sending" and retry; nothing is lost silently.
- Chat not set up (no env): "Chat is coming soon", no errors.
- Rate limited / muted / banned: a clear line in the composer ("Slow down", "You're timed out for 9 min", "You're banned from chat").
- Upload too big / wrong type: message before upload.

## 8. Setup (in order)
1. Sean: Supabase account (GitHub), two projects, `npx supabase login` in Claude's terminal.
2. Claude: schema + policies + buckets + seed channels as SQL migrations in the Bing Ball repo (`supabase/migrations/`), applied to
   the test project, then live, with the CLI/Management API under Sean's login (fallback: Sean pastes one SQL file into the SQL
   editor). Auth settings: sign-up off. The test project's secret key is fetched for local tests only (never committed).
3. Sean: paste the live project's secret key into Bing Ball's Render Environment tab as `SUPABASE_SERVICE_KEY` (Claude gives
   click-by-click steps; Claude never sees the live key).

## Testing
- Policy tests: a Node script against the TEST project with server-created users (owner, mod, member, muted, banned, blocked,
  friends-only) asserting every allow/deny (post in owner-only channel, read others' DMs, start a DM through a block, edit someone
  else's message, set own role, upload into another user's folder, @everyone as member, rate limit).
- Hub unit tests (`node --test tests/`): markdown-lite renderer (no HTML injection), mention/emoji parsing, unread math, image
  size planning, profile style validation.
- Bing Ball route test (bbtest) for `/api/chat/session` against a local fake Supabase admin API.
- End-to-end (headless Chrome, localhost hub + isolated Bing Ball + TEST project): two people chat live, picture + GIF, reaction,
  reply, edit/delete, DM + group DM, block, friends-only DM refused, owner announcement + mute + ban + mod, report reaches Reports,
  overlay over each game with typing not reaching the game, phone 360 px, no console errors.

## Shipping
Two phases, each shipped when done (Bing Ball first, then the hub, Sean already said go):
- Phase 1: login bridge, server + channels, messages (pictures/GIFs, reactions, replies, edit/delete, mentions), live/unreads,
  owner + mod tools, DMs + group DMs, block + report, Messages page, overlay, basic profile (picture, banner, about, status,
  name color, display name, pronouns).
- Phase 2: Nitro-style extras (theme gradient, name fonts/gradient/glow, frames, effects, badges, game stats on the card), custom
  emoji, friends + friends-only DMs.
