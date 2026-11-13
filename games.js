// Every game on Free Period. To add one, copy an entry, change the fields, and drop its pictures in assets/.
//   id        short name used in the link: play.html?g=<id>
//   url       where the game runs (it opens inside Free Period in a frame)
//   thumb     card poster, 16:9 (assets/<id>.jpg, 1280x720); tools/posters/ makes all three pictures from real gameplay
//   hero      optional wide poster for the featured banner (assets/<id>-hero.jpg, 1920x820); falls back to thumb
//   preview   optional hover video for the card (assets/<id>.webm: 6-8 s, 640x360, VP9, no audio, under 1.2 MB);
//             plays after 250 ms of hover; on phones the card most in view plays (not with Data Saver); never with reduced motion;
//             a missing file just doesn't play
//   previewMp4  the same clip as H.264 (assets/<id>.mp4, under 1.2 MB) for Safari and iPhones; the card tries webm, then this
//   tags      shown on the card and used by the filter chips
//   controls  one line shown under the title on the play page
//   accent    the card's glow color
//   wakes     true if the game itself runs on a free server that naps when idle (Render): it shows "Waking up" while it wakes,
//             and the play page explains the wait. Without it the game plays on its own (its server is extra, like multiplayer)
//   wake      optional URL to poke when the home page opens, so a napping server is awake by Play (games with `status`
//             don't need it: the status check wakes them)
//   status    optional live status: { health, version } URLs. health = the server answers (and {players} if it is JSON),
//             version = JSON {version, build}. Polled every 45 s while the page is visible.
//             Without it a solo game's card says "Solo ready" (Close Call and horror.exe have none: their own servers are not
//             deployed, so the hub does not probe them).
//   saveKey   optional localStorage key the game saves to: signed in, Free Period syncs it to the account (cloud save)
//   beta      true shows a Beta badge (the game is playable but unfinished)
//   apiGame   true for a game served by the Free Period API server (Bing Ball): its url and status URLs follow the
//             ?api= test override (https://bing-ball.onrender.com is swapped for the override)
//   joins     true if the game can go straight into a room from its URL (?join=<CODE>) and tells the hub which room it is
//             in (postMessage { type: 'fp:room', room }): a friend's Join button on the home page then joins that room.
//             Without it, Join just opens the game
//   orientation  optional 'landscape': the game plays sideways, so a phone held upright gets a "Rotate your phone" card
//             over it on the play page (with Play anyway). Leave it out for a game that works upright
//   featured  the big banner at the top of the home page (only one)
//   added     date it went up (NEW badge for two weeks)
window.GAMES = [
  {
    id: 'bing-ball',
    title: 'Bing Ball',
    tagline: '3D multiplayer soccer with Flow states and ranked.',
    url: 'https://bing-ball.onrender.com',
    thumb: 'assets/bing-ball.jpg',
    hero: 'assets/bing-ball-hero.jpg',
    preview: 'assets/bing-ball.webm',
    previewMp4: 'assets/bing-ball.mp4',
    tags: ['3D', 'Multiplayer', 'Sports'],
    controls: 'WASD move · click shoot · right-click pass · F dash · G Flow',
    accent: '#c6ff3d',
    orientation: 'landscape',      // the pitch view and the HUD (score, minimap, six-move bar) need the width
    wakes: true,
    apiGame: true,
    status: { health: 'https://bing-ball.onrender.com/health', version: 'https://bing-ball.onrender.com/api/status' },
    featured: true,
    added: '2026-11-06',
  },
  {
    id: 'close-call',
    title: 'Close Call',
    tagline: 'Weave through traffic in a neon city, along a sunset coast and through a red canyon. Near misses build combos, combos buy supercars.',
    url: 'games/close-call/',
    thumb: 'assets/close-call.jpg',
    hero: 'assets/close-call-hero.jpg',
    preview: 'assets/close-call.webm',
    previewMp4: 'assets/close-call.mp4',
    tags: ['3D', 'Multiplayer', 'Racing'],
    controls: 'W/S gas & brake · A/D steer · Shift nitro · C camera · H manual (Q/E shift) · Esc pause',
    accent: '#ffb020',
    orientation: 'landscape',      // upright, the touch pedals overlap (steer / brake / nitro); Karts too
    beta: true,
    saveKey: 'closecall.v1',
    joins: true,
    added: '2026-11-07',
  },
  {
    id: 'horror-exe',
    title: 'horror.exe',
    tagline: 'Five zones, two worlds, and one friend who might be EXE. Finish the zone tasks, cross into the corrupted world and escape.',
    url: 'games/horror-exe/',
    thumb: 'assets/horror-exe.jpg',
    preview: 'assets/horror-exe.webm',
    previewMp4: 'assets/horror-exe.mp4',
    tags: ['3D', 'Multiplayer', 'Horror'],
    controls: 'WASD move · Shift sprint · Space jump · E R Q abilities · F hide · EXE: click + E R Q F moves, G disguise, V awaken · Esc pause',
    accent: '#ff2a3a',
    orientation: 'landscape',      // first person: stick + five buttons laid out sideways; the title art crops upright
    saveKey: 'horrorexe.v1',
    joins: true,
    added: '2026-11-09',
  },
  {
    id: 'five-nights-at-bings',
    title: "Five Nights at Bing's",
    tagline: "Night guard at Bing's Arcade & Grill. Watch the cameras, shut the doors, keep Sal's bottle full and never let the music box stop.",
    url: 'games/five-nights-at-bings/',
    thumb: 'assets/five-nights-at-bings.jpg',
    preview: 'assets/five-nights-at-bings.webm',
    previewMp4: 'assets/five-nights-at-bings.mp4',
    tags: ['3D', 'Horror', 'Solo'],
    controls: 'A/D doors · Q/E lights · W vent · Space cameras · 1-9 camera · hold F wind / pour · hold G crank · L lure · M sound · C captions',
    accent: '#9dff3a',
    orientation: 'landscape',      // the 16:9 office (the game itself also asks to turn the phone)
    saveKey: 'fnab.v1',
    added: '2026-11-10',
  },
  {
    id: 'brielle-battleroyal',
    title: 'Brielle Battleroyal',
    tagline: '20 drop from the Shore Blimp over Brielle, NJ. Loot Union Landing, build and edit, and outlast the Nor\'easter. Last one standing wins.',
    url: 'games/brielle-battleroyal/',
    thumb: 'assets/brielle-battleroyal.jpg',
    preview: 'assets/brielle-battleroyal.webm',
    previewMp4: 'assets/brielle-battleroyal.mp4',
    tags: ['3D', 'Multiplayer', 'Battle Royale'],
    controls: 'WASD move · click shoot · right-click aim · Q/Z/X/V build · G edit · E loot · 1-5 items · F pickaxe · M map',
    accent: '#ffd23d',
    orientation: 'landscape',      // third-person shooter HUD + touch buttons need the width
    beta: true,
    saveKey: 'brielle.v1',
    joins: true,
    added: '2026-11-11',
  },
];
