# Site Themes + Cooler Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three whole-site themes to Free Period, Night Aero, Deep Space and Minimal, beside today's Neon. Then make the site feel far livelier: transitions, scroll reveal, an animated hero, live game previews everywhere, sounds and a cursor trail.

**Architecture:** `data-theme` on `<html>`, set before first paint by `fp/theme-boot.js`. `fp/theme.js` owns the theme list and the per-device prefs. A new `themes.css` holds the token sets and per-theme decorations. Effects are small focused modules wired by `fp/shell.js`: ambient modes, `fp/sfx.js` and `fp/cursor.js`. Pages restyle through tokens.

**Tech Stack:** vanilla ES modules, CSS custom properties, View Transitions, IntersectionObserver, Web Audio, Canvas 2D, node:test, puppeteer-core, ffmpeg.

**Spec:** `/Users/sean_0/Projects/free-period-chat/docs/superpowers/specs/2026-11-11-site-themes-cooler-design.md`

## Global Constraints

- Work in worktree `/Users/sean_0/Projects/free-period-chat`, branch `chat`. Never touch `/Users/sean_0/Projects/free-period` or `/Users/sean_0/Projects/bing-ball`. Never touch the LIVE Supabase project. Never print keys.
- No new runtime dependencies, no build step. Fonts come from Google Fonts only: Nunito (aero), Space Grotesk (space), Inter (minimal).
- Theme ids and names: `neon` "Neon" (default), `aero` "Night Aero", `space` "Deep Space", `minimal` "Minimal".
- Storage keys:
  - `fp.theme`
  - `fp.accent` (existing)
  - `fp.sfx` (`'on'|'off'`, default on)
  - `fp.fx` (`'on'|'off'`; when unset: on, except off for minimal)
- Default accents when none is chosen: neon `#c6ff3d`, aero `#4fd8ff`, space `#ffb84a`, minimal `#e8e8ea`.
- Deep Space uses no pink or purple: black, white, ice blue, and amber/gold.
- Performance: no `backdrop-filter`/`filter: blur` on scrolling content. Animate transform/opacity only. At most one ambient canvas plus one cursor canvas, both paused on `visibilitychange`. DPR capped at 1.5.
- Accessibility:
  - body text ≥ 4.5:1 and large text ≥ 3:1 in every theme (measured);
  - visible focus rings;
  - `prefers-reduced-motion` stops parallax, reveal motion, trails and ambient animation;
  - sounds only after a user gesture, and they can be muted.
- Neon must look the same as today (screenshot comparison).
- `node --test tests/` stays green (310 before this plan).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Scratchpad: `/private/tmp/claude-501/-Users-sean-0/a25218ce-cf79-484d-b307-aedad648254a/scratchpad`. Screenshots go to `<scratchpad>/shots/themes-*.png`. Local hub: any static server on 5178, e.g. `<scratchpad>/e2e/hubserve.mjs`. Puppeteer from `<scratchpad>/pp/node_modules`, with Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## Review Focus

1. **Theme switch while a page is open:** everything, including the ambient canvas, cursor trail, sounds and chat accent, switches live with no reload and no leftover canvas. Owned by Task 1 (`onTheme` listeners restart effects) and Task 7.
2. **Storage blocked** (private mode): the site renders Neon, the picker still works for the session, and nothing throws. Owned by Task 1 test `blocked storage`.
3. **Phones:** no cursor canvas on touch, at most one preview playing, no horizontal scroll at 390 px in any theme. Owned by Task 6 (`pickInView` test) and Task 8 screenshots.
4. **Sounds before a gesture or with Web Audio missing:** silent, no console errors. Owned by Task 7 test.
5. **Safari without View Transitions:** links work normally, no errors. Owned by Task 5 (feature-guarded) and the Task 8 WebKit spot check.

---

### Task 1: Theme core, picker, prefs

**Files:**
- Modify: `fp/theme.js`, `fp/theme-boot.js`, `fp/shell.js`, `fp/account-ui.js` (accent row links to the sheet), `ui.css` or `hub.css` (the header buttons), every hub page `index.html leaderboards.html trophies.html profile.html play.html chat.html` (link `themes.css` and fonts; chat.html also gets `theme-boot.js`)
- Create: `themes.css` (token sets for all four themes; neon = today's values), `fp/theme-sheet.js` (the Themes sheet)
- Test: `tests/theme.test.mjs`

**Interfaces:**
- Produces (`fp/theme.js`):
  - `THEMES` (frozen `[{id, name}]` in the order above) and `DEFAULT_THEME = 'neon'`;
  - `cleanTheme(id)`, `getTheme()`, `setTheme(id)`, `applyTheme(id = getTheme())` (sets `data-theme` and `data-fx`), `onTheme(fn) → unsubscribe`;
  - `getEffects() → boolean` (the `fp.fx` rule) and `setEffects(on)`;
  - `getSounds() → boolean` and `setSounds(on)`;
  - `onPrefs(fn) → unsubscribe` (fires on any of theme/accent/fx/sfx).
- Produces (DOM):
  - `html[data-theme]` and `html[data-fx="on|off"]`;
  - header buttons `.fp-theme-btn` and `.fp-sfx-btn` (`aria-pressed` = sounds on);
  - sheet `.fp-theme-sheet` with `[data-theme-pick="<id>"]` (`aria-pressed`) live mini previews, the accent row, and switches `.fp-pref-sfx` and `.fp-pref-fx`.
- Produces (`themes.css`): tokens every later task uses:
  - `--bg`, `--bg-2`, `--panel`, `--panel-2`, `--line`, `--line-2`;
  - `--text`, `--muted`, `--lime` (accent) and `--lime-rgb`, `--cyan`;
  - `--radius`, `--shadow`, `--font-ui`, `--font-display`, `--btn-bg`, `--btn-text`.

  `:root[data-theme="…"]` blocks override them. A `[data-accent]` combined with a theme overrides only the accent.

- [ ] **Step 1: Write failing tests** (`tests/theme.test.mjs`):
  - `THEMES order and names`;
  - `cleanTheme falls back to neon`;
  - `get/set round trip and onTheme fires`;
  - `blocked storage: getTheme() is neon, setTheme does not throw and applies for the session`;
  - `getEffects default: on for neon/aero/space, off for minimal; explicit fp.fx wins`;
  - `getSounds default on`;
  - `theme-boot.js regex accepts exactly the THEMES ids` (read the file text and compare to `THEMES`, the same way the accent list is checked).
- [ ] **Step 2: Run them and see them fail.** `node --test tests/theme.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Extend `fp/theme-boot.js` (plain script, try/catch) to set `data-theme` and `data-fx` before paint. Add the theme module functions, `themes.css` with all four token sets (aero/space/minimal values per the spec; decorations come in Tasks 2-4), the sheet, and the header buttons. Link `themes.css` and fonts on every page. The page itself must look identical in neon.
- [ ] **Step 4: Verify.** Run `node --test tests/`. Take neon before/after screenshots of home and leaderboards at 1440: they must look identical apart from the two new header buttons. Open the sheet and switch themes: `data-theme` changes live.
- [ ] **Step 5: Commit.**

### Task 2: Night Aero theme

**Files:** `themes.css` (aero decorations), `fp/ambient.js` (aero mode: twinkling stars, floating glossy bubbles, light swoosh), page CSS only where tokens can't reach, `chat.css` (aero palette for the server-only background).

**Interfaces:**
- Consumes: Task 1 tokens, `onTheme`, `getEffects`.
- Produces: `startAmbient()` picks its mode from `getTheme()`, restarts on `onPrefs`, and draws nothing when `getEffects()` is false.

- [ ] **Step 1: Style every hub page in aero** (home, leaderboards, trophies, profile, play, the chat page header):
  - deep blue gradient sky;
  - aqua glass panels made with layered gradients plus a glossy top highlight (no blur);
  - gel buttons (rounded, top shine, inner glow);
  - Nunito;
  - aqua accent.
- [ ] **Step 2: Add the ambient aero mode** and the chat server background palette for aero (aqua light plus bubbles). DMs stay plain.
- [ ] **Step 3: Verify.**
  - Screenshots of all pages at 1440 and 390 (`themes-aero-*`).
  - Contrast ≥ 4.5:1 for body text over the brightest panel point.
  - No console errors.
  - Reduced motion gives a still frame.
  - `node --test tests/` green.
- [ ] **Step 4: Commit.**

### Task 3: Deep Space theme

Same shape as Task 2, for `space`:
- pure black;
- layered parallax star dust;
- a slowly turning galaxy/black-hole disk (ice-blue core, amber accretion ring) behind the home hero;
- thin glowing outline panels on near-black;
- Space Grotesk and an amber accent.

The chat server background becomes star dust. **No pink or purple.** Verify the same way (`themes-space-*`), then commit.

### Task 4: Minimal theme

Same shape, for `minimal`:
- near-black `#0d0d0f`;
- hairline `#26262b` borders;
- no glow, no ambient background (the ambient draws nothing), flat buttons;
- 8 px radius, more whitespace;
- Inter, accent `#e8e8ea` with lime focus rings.

The chat server background is plain. Verify (`themes-minimal-*`), then commit.

### Task 5: Motion — transitions, reveal, hero

**Files:** `themes.css` or `hub.css` (view transitions, reveal styles), create `fp/motion.js` (reveal + hero parallax), `fp/home.js` (hero hooks, card `view-transition-name` on click), `play.html` / `fp/play.js` (matching `view-transition-name` on the play page header poster), `fp/shell.js` (start motion).

**Interfaces:**
- Produces:
  - `startReveal(root = document) → stop`: `[data-reveal]` elements get `.revealed` once in view; grids stagger through `--i`.
  - `startParallax(el) → stop`: pointer-driven CSS vars `--px`/`--py` in -1..1.

  Both are no-ops with reduced motion.

- [ ] **Step 1: Write failing tests** (`tests/motion.test.mjs`) with fakes for IntersectionObserver and matchMedia:
  - `reveal adds .revealed once and unobserves`;
  - `reduced motion reveals everything at once`;
  - `parallax clamps to -1..1 and is a no-op on reduced motion`.
- [ ] **Step 2: Implement.**
  - `@view-transition { navigation: auto }` with a header kept static and the content sliding and fading.
  - Clicked card poster ↔ play page header morph via a shared `view-transition-name` set right before navigation.
  - `[data-reveal]` on home sections, cards, leaderboard rows and trophies.
  - Hero: pointer parallax on poster, title and glow, a title shimmer, and a per-theme hero backdrop:
    - neon: grid glow;
    - aero: bubbles plus swoosh;
    - space: the galaxy from Task 3;
    - minimal: none.
- [ ] **Step 3: Verify.** `node --test tests/`. Take screenshots mid-transition if feasible. Check that a browser without View Transitions navigates normally (feature-guard every API). No console errors.
- [ ] **Step 4: Commit.**

### Task 6: Live game previews everywhere

**Files:**
- `assets/horror-exe.webm`, `assets/five-nights-at-bings.webm` (new), plus `assets/<id>.mp4` for all four games;
- `games.js` (`preview` stays the webm; add `previewMp4`);
- `fp/home.js` `wirePreview` (`<source>` webm then mp4) and a phone autoplay picker;
- `tools/posters/README.md` (mp4 step).

**Interfaces:**
- Produces: `pickInView(cards: Array<{ id, ratio }>) → id | null`, a pure function in `fp/home.js` or a small `fp/previews.js`. It returns the card with the largest visible ratio ≥ 0.6, or null.
- Phones (coarse pointer): the picked card plays; the others pause. Never when `navigator.connection?.saveData` is set or reduced motion is on.

- [ ] **Step 1: Test.** `tests/previews.test.mjs`: `pickInView` picks the largest ratio, needs ≥ 0.6, returns null on an empty list, and breaks ties by order.
- [ ] **Step 2: Record clips.**
  - Record the missing clips with `tools/posters/capture.mjs` (follow its README; `PUPPETEER_DIR=<scratchpad>/pp`, `POSTERS_OUT=<scratchpad>/posters`). The games are in this repo under `games/`; horror.exe and Five Nights at Bing's run solo locally.
  - Make 640×360, 6-8 s, no audio. WebM VP9 < 1.2 MB, and MP4 H.264 (`-profile:v main -pix_fmt yuv420p -movflags +faststart`) < 1.2 MB for all four games.
  - Pick a moment that shows the game well: action, not a menu.
- [ ] **Step 3: Implement** the `<source>` fallbacks and the phone autoplay.
- [ ] **Step 4: Verify.**
  - Desktop hover plays (puppeteer: `video.currentTime` advances).
  - A 390 px emulated touch device plays exactly one preview while scrolling.
  - Asset sizes are under budget.
  - `node --test tests/` is green.
- [ ] **Step 5: Commit** (assets included).

### Task 7: Sounds + cursor trail

**Files:** create `fp/sfx.js` and `fp/cursor.js`; modify `fp/shell.js` (arm sfx, start cursor, hook hover/click on `.card`, nav links and buttons with `data-sfx`).

**Interfaces:**
- `fp/sfx.js` produces:
  - `play(name)`: name is `'hover'|'click'|'whoosh'|'toggle'`; a no-op when muted, before a gesture, or without Web Audio;
  - `armSfx() → stop`: unlocks the AudioContext on the first pointerdown/keydown;
  - `_inject({ AudioContext, now })`.

  The timbre follows `getTheme()`: neon synth blip, aero glassy bubble, space soft shimmer, minimal quiet click. Master gain is 0.12, and hover is rate-limited to one per 80 ms.
- `fp/cursor.js` produces `startCursor() → stop`:
  - a pointer-events-none fixed canvas, fine pointers only;
  - off with reduced motion, `getEffects()` false, or minimal;
  - styles: neon sparks, aero bubbles, space star dust;
  - pauses when hidden, DPR ≤ 1.5, at most 60 particles;
  - restarts on `onPrefs`.
- The `whoosh` sound plays on internal link navigation, before the view transition.

- [ ] **Step 1: Write failing tests** (`tests/sfx.test.mjs`, `tests/cursor.test.mjs` with a fake canvas/matchMedia):
  - `silent before a gesture`;
  - `silent when muted`;
  - `no throw without AudioContext`;
  - `hover rate limit`;
  - `timbre switches with theme`;
  - `cursor not started on coarse pointer / reduced motion / effects off / minimal`;
  - `stop removes the canvas and listeners`.
- [ ] **Step 2: Implement and wire.**
- [ ] **Step 3: Verify.** `node --test tests/`. In the browser: the canvas exists only with a mouse and effects on, it is removed on switching to minimal, and there are no console errors.
- [ ] **Step 4: Commit.**

### Task 8: Theme-by-theme verification pass (no product edits)

**Files:** `<scratchpad>/e2e/themes.e2e.mjs` (new). Re-run `<scratchpad>/e2e/hub.e2e.mjs` and `chat.e2e.mjs`.

- [ ] **Step 1: Screenshots.** Cover 4 themes × (home, leaderboards, trophies, profile, play, chat) × 1440 and 390, plus the theme sheet.
- [ ] **Step 2: Assertions per theme:**
  - body-text contrast ≥ 4.5:1 (sample computed colors against rendered background pixels);
  - no horizontal scroll at 390;
  - zero console errors;
  - reduced motion leaves no running animations (`document.getAnimations()` empty or paused);
  - a theme switch removes the old ambient/cursor canvases.
- [ ] **Step 3: WebKit spot check.** Use Playwright WebKit (recipe in memory "Headless Chrome testing"; delete its cache after). Home in aero and space renders, links navigate, no errors.
- [ ] **Step 4: Re-run the existing harnesses.** `hub.e2e.mjs` and `chat.e2e.mjs` both pass. Product bugs found here are reported, not fixed: the controller routes them to the final fix wave.

## After the tasks (controller)

1. Final whole-branch review on the most capable model, then one fix wave and a scoped re-review.
2. Merge `origin/main`, run `node --test tests/`, `git push origin chat:main` (static site; no DB change), then do the live smoke.
