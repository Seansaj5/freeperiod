# Free Period

Games made by us, for us. Live at https://seansaj5.github.io/freeperiod/

## Add a game
1. Put its poster in `assets/<id>.jpg` (16:9, 1280x720). Optional: `assets/<id>-hero.jpg` (1920x820) for the featured
   banner and `assets/<id>.webm` (6-8 s, 640x360, VP9, no audio, under 1.2 MB) for the card's hover preview.
2. Copy the Bing Ball entry in `games.js` and change the fields (the comments at the top explain each one).
3. Push to `main`. GitHub Pages updates in about a minute.

A game can be anything with a URL that allows being shown in a frame: a GitHub Pages site, a Render server, or a folder inside this repo (for example `games/my-game/index.html`, then `url: 'games/my-game/'`).

## Games
- **Bing Ball** runs on its own Render server (bing-ball.onrender.com) and is shown in a frame.
- **Close Call** lives in `games/close-call/` (static, served by GitHub Pages). Its multiplayer server is
  `games/close-call/server/`, deployed to Render by `render.yaml` (service `freeperiod-closecall`).
  Test locally: `node games/close-call/server/index.js` (port 8787) and open
  `games/close-call/?server=ws://localhost:8787`.
  Maps (Night City, Sunset Coast, Red Canyon) and lane modes are defined in `js/maps.js`; map scenery is
  `js/scenery.js`. Sounds are real CC0 recordings from Freesound in `games/close-call/sfx/`
  (credits in `sfx/CREDITS.md`; `sfx.json` lists the engine loops by RPM, the loops and the one-shots).

- **horror.exe** lives in `games/horror-exe/`: survivors vs EXE across five zones in two worlds (normal and corrupted,
  swapped through rift portals), with zone tasks and a disguising EXE. The round rules,
  map and bots are in `games/horror-exe/shared/` and run in the browser for solo games and on the server
  (`games/horror-exe/server/`, Render service `freeperiod-horror`) for online rooms.
  Test locally: `node games/horror-exe/server/index.js` (port 8790) and open `games/horror-exe/?server=ws://localhost:8790`.
  Rule tests: `node --test games/horror-exe/test/`. Bot-only balance check: `node games/horror-exe/test/sim.mjs 40`.
  Accounts: the game reads the Free Period sign-in (`fp.token`/`fp.user`, same site), so your name is your account name.
  Online, the server checks the token with the Bing Ball server (`/api/me`, override with `ACCOUNTS_API`) and guests
  can't use the owner names (`OWNER_USERNAMES`, default Saj, Sean_0, Sean0). The owner (role `owner`) has everything
  unlocked, a gold name with an OWNER badge, and ADMIN.EXE (`` ` `` in a game, the pause menu, or Admin in the lobby):
  start/end the round, pick the next EXE, kick, announce, god mode, super speed, fly, no cooldowns, teleport, finish
  the tasks, change the clock, switch worlds. Test with a fake account server: `?api=http://localhost:PORT` (localhost only).
  Look: the pixel-art title screen (Dreamy Hills turning into horror.exe) is drawn in `js/title.js`; in game the 3D view
  renders at about 400 lines with a dithered 16-bit color pass (`RetroShader` in `js/fx.js`, Settings → Look switches it off).
  The pixel font is Press Start 2P (SIL Open Font License, `games/horror-exe/fonts/OFL.txt`).
  Boot: index.html shows a fake console with the real loading bar (`window.__boot`), `js/boot.js` ends it with a fake crash;
  add `?boot=0` to skip it (the headless tests do). Glitch.exe's TV face is three ChatGPT-made frames in `img/`
  (`drawGlitchFrame` in `js/rig.js`). Monster trails (afterimages, drips, voxels) are pooled per rig and aged by `tickRigFx`.

Shared libraries for games go in `lib/` (Three.js r170 is there, plus the post-processing addons it needs for bloom in `lib/addons/`, mapped as `three/addons/`).

## Files
- `index.html` + `fp/home.js`: the home page (featured banner with live server status, Jump back in, Tell Sean bar,
  game grid with favorites / play time / hover previews, ranked leaderboard, search with `/`)
- `play.html`: plays one game full-window in a frame, with Reload / New tab / Fullscreen
- `games.js`: the list of games (a plain script that sets `window.GAMES`)
- `fp/`: the hub's modules. `api.js` (Bing Ball server calls, `?api=` test override), `store.js` (safe localStorage),
  `session.js` (log in / out), `meta.js` (favorites, recent, play time), `saves.js` + `sync.js` (cloud saves),
  `status.js` (live server status), `ui.js` (elements, sheets, toasts), `account-ui.js`, `profile.js`, `inbox.js`, `suggest.js`
- `style.css` (page look), `ui.css` (account chip, sheets, suggest bar, toasts), `assets/`: pictures, fonts
  (Bungee + Outfit, both SIL Open Font License)
- `tests/`: `node --test tests/`
- `tools/posters/`: makes each game's card poster, banner poster and hover preview from real gameplay (see its README)

Accounts are Bing Ball accounts: the hub talks to `https://bing-ball.onrender.com/api/*`. To test against a local
Bing Ball server, open the hub with `?api=http://localhost:3100` (kept for the tab's session).
