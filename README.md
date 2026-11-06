# Free Period

Games made by us, for us. Live at https://seansaj5.github.io/freeperiod/

## Add a game
1. Put a 16:9 picture in `assets/` (960x540 is plenty).
2. Copy the Bing Ball entry in `games.js` and change the fields (the comments at the top explain each one).
3. Push to `main`. GitHub Pages updates in about a minute.

A game can be anything with a URL that allows being shown in a frame: a GitHub Pages site, a Render server, or a folder inside this repo (for example `games/my-game/index.html`, then `url: 'games/my-game/'`).

## Files
- `index.html` + `app.js`: the home page (featured banner, search, tag filters, game grid)
- `play.html`: plays one game full-window in a frame, with Reload / New tab / Fullscreen
- `games.js`: the list of games
- `style.css`, `assets/`: looks, pictures, fonts (Bungee + Outfit, both SIL Open Font License)
