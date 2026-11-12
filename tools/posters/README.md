# Posters and hover previews

Every game card on Free Period has three pictures, all made from real gameplay (no AI art):

| File | Size | Used for |
|---|---|---|
| `assets/<id>.jpg` | 1280x720, under 350 KB | the card poster: an action shot, colour grade, vignette, the title in Bungee with a glow, a small tag line |
| `assets/<id>-hero.jpg` | 1920x820, under 350 KB | the featured banner (no lettering: the home page writes the title over its left side) |
| `assets/<id>.webm` | 640x360, 8 s, VP9, no audio, under 1.2 MB | the card's hover preview (and the phone autoplay) |
| `assets/<id>.mp4` | the same clip, H.264 main, yuv420p, faststart, no audio, under 1.2 MB | the preview in Safari and on iPhones (`<source>` after the webm) |

`capture.mjs` plays each game in headless Chrome on the real GPU, stages the shot and records it; `poster.html` is the
layout the stills are composed in.

## What you need

- Google Chrome (`/Applications/Google Chrome.app`, or set `CHROME=<path to the binary>`)
- `puppeteer-core`, outside this repo (it has no package.json): `npm i puppeteer-core` in any scratch folder, then pass
  `PUPPETEER_DIR=<that folder>`
- `ffmpeg` with libvpx-vp9 for the previews (`FFMPEG=<path>` if it is not the one on your PATH)

## Making them

```sh
export PUPPETEER_DIR=~/scratch POSTERS_OUT=~/scratch/posters
node tools/posters/capture.mjs shoot bing-ball            # bursts of stills + an 8 s clip, in $POSTERS_OUT/bing-ball/
# look at the bursts (card-*.jpg are 16:9, hero-*.jpg are wide), pick a frame for each
node tools/posters/capture.mjs poster bing-ball --card $POSTERS_OUT/bing-ball/card-c0-039.jpg --hero $POSTERS_OUT/bing-ball/card-c0-039.jpg
node tools/posters/capture.mjs preview bing-ball          # assets/bing-ball.webm from the clip, then assets/bing-ball.mp4 from the webm
node tools/posters/capture.mjs mp4 bing-ball              # only the mp4, from the existing webm
```

Games: `bing-ball`, `close-call`, `horror-exe`, `five-nights-at-bings`. The webm is encoded in one pass on purpose: libvpx's two-pass files failed to decode in Chrome (PIPELINE_ERROR_DECODE). After a preview, open the page in Chrome and watch the card play. `poster` takes `--card-cfg '<json>'` / `--hero-cfg '<json>'` to adjust
the layout for a frame (any `renderPoster` setting in `poster.html`, e.g. `'{"focus":[0.6,0.5],"zoom":1.1}'`); the
defaults in `LOOK` in `capture.mjs` fit the frames named there. Look at every picture before committing, and check the
sizes (`ls -l assets`): `poster` lowers the JPEG quality until a poster fits under 340 KB.

## How each game is shot

- **Bing Ball** (live site, https://bing-ball.onrender.com, or `BB_URL=`): Practice (offline, runs in the browser) in the
  Blue Lock Facility with no bots, after the update log's "Let's play". The practice staff tools (the game's own
  `staff:cmd`, shared/commands.js) make the player Nagi with cooldowns off; each take puts him on the centre spot with the
  ball and presses 1 (Fake Volley: the flick, the afterimages, the volley). The camera is placed through
  `Game.camOverride`; name tags and the HUD are hidden.
- **Close Call** (`games/close-call/`, served from this repo): a solo run in an orange Spectre on high graphics with
  nitro held. An autopilot steers and brakes; collisions are off for the shot. Each take is staged: traffic is a pure
  function of the seed and the clock (`js/traffic.js`), so the script finds two cars side by side with a clear lane
  between them and puts the car just behind them, then it threads the needle. A low chase camera is laid over the
  game's (`World.follow`).
- **horror.exe** (`games/horror-exe/`): a staged scene in the game's own engine through `window.__hxFreeze` (the main
  loop calls it instead of the title screen): the game's own rigs (`js/rig.js`) for EXE and two survivors, its world,
  bloom and film grain. EXE stands in front of the eclipse so it rings his head; the survivors run from him. The clip's
  dolly runs along a path checked clear of every prop in `shared/map.js`. The characters are the game's originals.

Raw frames stay in `$POSTERS_OUT` (default `<tmp>/fp-posters`); only the finished pictures go in `assets/`.
- **Five Nights at Bing's** (`games/five-nights-at-bings/`): Night 1 started through the game's `window.__fnab` hook, past the
  "12:00 AM" intro, every animatronic's level at 0. The clip flips cameras (Show Stage, Arcade Floor, Prize Corner) and
  puts Bing, Dylan and Gavin where each camera sees them. The game's own HUD stays in the shot.
