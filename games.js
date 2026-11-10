// Every game on Free Period. To add one, copy an entry, change the fields, and drop its pictures in assets/.
//   id        short name used in the link: play.html?g=<id>
//   url       where the game runs (it opens inside Free Period in a frame)
//   thumb     card poster, 16:9 (assets/<id>.jpg, 1280x720); tools/posters/ makes all three pictures from real gameplay
//   hero      optional wide poster for the featured banner (assets/<id>-hero.jpg, 1920x820); falls back to thumb
//   preview   optional hover video for the card (assets/<id>.webm: 6-8 s, 640x360, VP9, no audio, under 1.2 MB);
//             plays after 250 ms of hover, never on touch screens or with reduced motion; a missing file just doesn't play
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
//   featured  the big banner at the top of the home page (only one)
//   added     date it went up (NEW badge for two weeks)
window.GAMES = [
  {
    id: 'bing-ball',
    title: 'Bing Ball',
    tagline: '3D multiplayer soccer with anime-style moves, Flow states and ranked.',
    url: 'https://bing-ball.onrender.com',
    thumb: 'assets/bing-ball.jpg',
    hero: 'assets/bing-ball-hero.jpg',
    preview: 'assets/bing-ball.webm',
    tags: ['3D', 'Multiplayer', 'Sports'],
    controls: 'WASD move · click shoot · right-click pass · F dash · G Flow',
    accent: '#c6ff3d',
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
    tags: ['3D', 'Multiplayer', 'Racing'],
    controls: 'W/S gas & brake · A/D steer · Shift nitro · C camera · Esc pause',
    accent: '#ffb020',
    beta: true,
    saveKey: 'closecall.v1',
    added: '2026-11-07',
  },
  {
    id: 'horror-exe',
    title: 'horror.exe',
    tagline: 'Five zones, two worlds, and one friend who might be EXE. Finish the zone tasks, cross into the corrupted world and escape.',
    url: 'games/horror-exe/',
    thumb: 'assets/horror-exe.jpg',
    tags: ['3D', 'Multiplayer', 'Horror'],
    controls: 'WASD move · Shift sprint · Space jump · E power · EXE: click attack, Q sense, F disguise · Esc pause',
    accent: '#ff2a3a',
    saveKey: 'horrorexe.v1',
    added: '2026-11-09',
  },
];
