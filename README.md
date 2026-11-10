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

- **horror.exe** lives in `games/horror-exe/`: survivors vs EXE in a cheerful zone gone wrong. The round rules,
  map and bots are in `games/horror-exe/shared/` and run in the browser for solo games and on the server
  (`games/horror-exe/server/`, Render service `freeperiod-horror`) for online rooms.
  Test locally: `node games/horror-exe/server/index.js` (port 8790) and open `games/horror-exe/?server=ws://localhost:8790`.
  Rule tests: `node --test games/horror-exe/test/`. Bot-only balance check: `node games/horror-exe/test/sim.mjs 40`.

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
