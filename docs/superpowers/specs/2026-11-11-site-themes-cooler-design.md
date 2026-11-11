# Free Period: site themes + "1000 times cooler" — design

Date: 2026-11-11. Hub = Seansaj5/freeperiod (static GitHub Pages, vanilla ES modules, no build, no new dependencies).

## What Sean asked for

"Make the website its self everything 1000 times cooler, 3 new themes, frutiger areo and other a new one thats more
minimalistic". His picks:
- Frutiger Aero → **Night Aero** (dark glossy Aero: deep blue night sky, aqua glass panels, shiny gel buttons, soft
  stars and light swooshes — same taste as his workout app's "Night Aero"; he rejected bright Aero there).
- Third theme → **Deep Space** (black-hole void like his Safari start page: black, glowing star dust, a slowly turning
  galaxy). Sean dislikes pink/purple in this kind of scene: use black, white, ice blue and a gold/amber accretion glow.
- Minimal → a clean, quiet theme. Sean prefers dark: **dark minimal**.
- "Cooler": all four — animated home + page transitions, live game card previews, sounds + cursor effects, and every
  page matching the theme (home, leaderboards, trophies, profiles, play page, chat header).

## Themes

- Four themes: `neon` (today's look, stays the default), `aero` ("Night Aero"), `space` ("Deep Space"), `minimal`
  ("Minimal"). Stored per device in `localStorage['fp.theme']`, applied as `data-theme` on `<html>` before first paint by
  the existing `fp/theme-boot.js` (extended; it already does this for `fp.accent`). `fp/theme.js` owns the list
  (`THEMES`), `getTheme/setTheme/applyTheme/onTheme`, and keeps the boot regex in step (a unit test enforces it).
- Accents keep working in every theme (`data-accent`); each theme defines its own default accent when none is chosen:
  neon lime `#c6ff3d`, aero aqua `#4fd8ff`, space amber `#ffb84a`, minimal white-ish `#e8e8ea` with lime focus rings.
- Picker: a palette button in the shared header (guests too) opens a "Themes" sheet with four live mini previews,
  the accent row, and two switches: **Sounds** and **Effects** (cursor trail + animated backgrounds). The account
  card's existing accent row stays and links to the sheet.
- Each theme is a token set (`themes.css`: backgrounds, panels, borders, text, muted, radius, shadows, fonts, button
  style) plus theme-specific decoration rules. Pages restyle through tokens; only decorations get per-theme selectors.
  - **Neon:** unchanged look (regression-free default).
  - **Night Aero:** deep blue gradient sky (#04122b → #0a2f5c), aqua glass panels drawn with gradients + glossy top
    highlight (no `backdrop-filter`/`filter: blur` on scrolling content: phones stutter), gel buttons (rounded, top
    shine, inner glow), soft floating bubbles + light swoosh + twinkling stars in the ambient background, font Nunito.
  - **Deep Space:** pure black, layered parallax star dust, a slowly turning galaxy/black-hole disk (ice-blue core,
    amber accretion ring) behind the hero, panels as thin glowing outlines on near-black, font Space Grotesk.
  - **Minimal:** near-black `#0d0d0f`, hairline `#26262b` borders, no glow, no ambient background, flat buttons, more
    whitespace, smaller radius (8 px), Inter. Effects default off in Minimal.
- Chat: the chat page header/shell follows the theme; the chat app keeps its Discord gray layout, but its accent follows
  the theme accent and the server-only animated background takes the theme's palette (aero: aqua light + bubbles,
  space: star dust, minimal: plain, neon: today's aurora). DMs stay plain.
- Games themselves (inside `games/*`) are not themed.

## Cooler, site-wide

1. **Page transitions:** cross-document View Transitions (`@view-transition { navigation: auto }`): the header stays
   put, content cross-fades/slides; a clicked game card's poster morphs into the play page header
   (`view-transition-name`). Browsers without support just navigate normally.
2. **Scroll reveal:** sections and cards fade/slide in once as they enter the viewport (IntersectionObserver,
   `[data-reveal]`), staggered for card grids.
3. **Animated home hero:** pointer parallax on the hero layers (poster, title, glow), an animated title shimmer, and a
   theme-specific hero backdrop (neon grid glow, aero bubbles + swoosh, space galaxy, minimal none).
4. **Live game previews:** every game gets a 6-8 s muted preview clip (WebM VP9 + MP4 H.264 fallback for Safari/iPhone,
   640×360, each < 1.2 MB), recorded from real gameplay/attract screens with the existing `tools/posters` capture tooling
   (+ ffmpeg). Desktop: plays on hover/focus (existing `wirePreview`, extended to `<source>` fallbacks). Phones: the one
   card most in view plays automatically, others pause; never when `saveData` is on or reduced motion is set. Missing
   today: horror.exe and Five Nights at Bing's previews, MP4 fallbacks for all.
5. **Sounds:** tiny Web Audio synth sounds (no audio files): soft tick on hovering game cards/nav, pop on click,
   whoosh on page transition, chime on toggles. Each theme has its own timbre (neon synth blip, aero glassy bubble,
   space soft shimmer, minimal quiet click). Low volume (≈0.12), only after the first user gesture (autoplay rules), a
   mute switch in the header persisted in `localStorage['fp.sfx']`. Default on.
6. **Cursor trail:** a pointer-events-none canvas trail styled per theme (neon sparks, aero bubbles, space star dust,
   minimal: off). Only for fine pointers (mouse), never with reduced motion, off when Effects is off; paused when the tab
   is hidden; DPR capped at 1.5.
7. **Ambient backgrounds** per theme (extend `fp/ambient.js`): one canvas per page at most, paused when hidden, fewer
   particles on phones, still frame with reduced motion.

## Constraints

- No new runtime dependencies or build step. Fonts from Google Fonts only (Nunito, Space Grotesk, Inter).
- Performance: no `backdrop-filter`/`filter: blur` on scrolling content; animations on transform/opacity; one ambient
  canvas + one cursor canvas max; both pause on `visibilitychange`.
- Accessibility: every theme keeps body text ≥ 4.5:1 and large text ≥ 3:1 (measured); focus rings visible in every
  theme; `prefers-reduced-motion` stops parallax, reveal motion, trails and ambient animation; sounds never play
  without a gesture and are mutable.
- Today's neon theme must look the same as now (screenshot comparison).
- Other sessions push games to the same repo: merge `origin/main` before every push.

## Testing

- Unit (`node --test tests/`): theme list/clean/get/set/apply + boot-snippet regex in sync with `THEMES`; sfx (mute
  persistence, no throw without Web Audio, no sound before a gesture); preview picker (which card plays on phones);
  reveal/parallax helpers where pure.
- Screenshots: 4 themes × (home, leaderboards, trophies, profile, play, chat) × 1440 and 390, plus the theme sheet;
  contrast measured per theme; zero console errors; neon before/after comparison.
- Existing e2e harnesses (`<scratchpad>/e2e/hub.e2e.mjs`, `chat.e2e.mjs`) still pass.
