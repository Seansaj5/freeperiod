// Every game on Free Period. To add one, copy an entry, change the fields, and drop a 16:9 picture in assets/.
//   id        short name used in the link: play.html?g=<id>
//   url       where the game runs (it opens inside Free Period in a frame)
//   thumb     card picture, 16:9 (960x540 is plenty)
//   hero      optional wider-cropped picture for the featured banner (the art sits on the right half)
//   tags      shown on the card and used by the filter chips
//   controls  one line shown under the title on the play page
//   wakes     true if the game runs on a free server that naps when idle (Render): the play page explains the wait
//   wake      optional URL to poke when the home page opens (a game's multiplayer server on Render)
//   featured  the big banner at the top of the home page (only one)
window.GAMES = [
  {
    id: 'bing-ball',
    title: 'Bing Ball',
    tagline: '3D multiplayer soccer with anime-style moves, Flow states and ranked.',
    url: 'https://bing-ball.onrender.com',
    thumb: 'assets/bing-ball.jpg',
    hero: 'assets/bing-ball-hero.jpg',
    tags: ['3D', 'Multiplayer', 'Sports'],
    controls: 'WASD move · click shoot · right-click pass · F dash · G Flow',
    accent: '#c6ff3d',
    wakes: true,
    featured: true,
    added: '2026-11-06',
  },
  {
    id: 'close-call',
    title: 'Close Call',
    tagline: 'Weave through midnight highway traffic. Near misses build combos, combos buy cars.',
    url: 'games/close-call/',
    thumb: 'assets/close-call.jpg',
    tags: ['3D', 'Multiplayer', 'Racing'],
    controls: 'W/S gas & brake · A/D steer · Shift nitro · C camera · Esc pause',
    accent: '#ffb020',
    wake: 'https://freeperiod-closecall.onrender.com/health',
    added: '2026-11-07',
  },
  {
    id: 'horror-exe',
    title: 'horror.exe',
    tagline: 'A cheerful zone gone wrong. Absorb the shards, revive your friends and escape before EXE catches you.',
    url: 'games/horror-exe/',
    thumb: 'assets/horror-exe.jpg',
    tags: ['3D', 'Multiplayer', 'Horror'],
    controls: 'WASD move · Shift sprint · Space jump · E power · EXE: click attack, Q sense · Esc pause',
    accent: '#ff2a3a',
    wake: 'https://freeperiod-horror.onrender.com/health',
    added: '2026-11-09',
  },
];
