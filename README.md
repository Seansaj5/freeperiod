# Free Period

Games made by us, for us. Live at https://seansaj5.github.io/freeperiod/

## Add a game
1. Put a 16:9 picture in `assets/` (960x540 is plenty).
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
  Look: the pixel-art title screen (Dreamy Hills turning into horror.exe) is drawn in `js/title.js`; in game the 3D view
  renders at about 400 lines with a dithered 16-bit color pass (`RetroShader` in `js/fx.js`, Settings → Look switches it off).
  The pixel font is Press Start 2P (SIL Open Font License, `games/horror-exe/fonts/OFL.txt`).

Shared libraries for games go in `lib/` (Three.js r170 is there, plus the post-processing addons it needs for bloom in `lib/addons/`, mapped as `three/addons/`).

## Files
- `index.html` + `app.js`: the home page (featured banner, search, tag filters, game grid)
- `play.html`: plays one game full-window in a frame, with Reload / New tab / Fullscreen
- `games.js`: the list of games
- `style.css`, `assets/`: looks, pictures, fonts (Bungee + Outfit, both SIL Open Font License)
