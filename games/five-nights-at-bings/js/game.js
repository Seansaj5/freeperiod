// Five Nights at Bing's: the night itself. Rules live here; drawing is in art.js, sound in audio.js, words in lines.js.
import * as S3 from './scene3d.js';
import { staticFx, feedFx } from './fx.js';
import * as Au from './audio.js';
import { CALLS, VOICE, NAMES, TIPS } from './lines.js';

const W = 1280, H = 720, HOUR = 48;
const $ = id => document.getElementById(id);
const cv = $('cv'), c = cv.getContext('2d');
const SS = Math.min(1.5, window.devicePixelRatio || 1);
cv.width = W * SS; cv.height = H * SS;
const PX = "'Press Start 2P'";

// ---------- save ----------
const KEY = 'fnab.v1';
const save = { tickets: 0, perks: {}, night: 1, beat5: false, beat6: false, sound: true, subs: true, custom: { bing: 10, dylan: 10, gavin: 10, sal: 10, box: 10, tok: 10 } };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh save */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }

// How hard each character is on each night (0 = asleep, 20 = relentless).
const NIGHTS = [
  { bing: 0, dylan: 3, gavin: 2, sal: 0, box: 3, tok: 0 },
  { bing: 2, dylan: 5, gavin: 4, sal: 5, box: 6, tok: 0 },
  { bing: 4, dylan: 7, gavin: 6, sal: 8, box: 9, tok: 4 },
  { bing: 7, dylan: 10, gavin: 9, sal: 11, box: 12, tok: 7 },
  { bing: 10, dylan: 13, gavin: 12, sal: 14, box: 15, tok: 10 },
  { bing: 14, dylan: 16, gavin: 15, sal: 17, box: 18, tok: 14 },
];
const CAMS = [
  { id: 'stage', n: 1, name: 'SHOW STAGE', r: [138, 8, 134, 46] },
  { id: 'arcade', n: 2, name: 'ARCADE FLOOR', r: [118, 60, 174, 58] },
  { id: 'bar', n: 3, name: 'THE BAR', r: [16, 60, 96, 58] },
  { id: 'prize', n: 4, name: 'PRIZE CORNER', r: [298, 60, 96, 58] },
  { id: 'storage', n: 5, name: 'STORAGE', r: [16, 124, 96, 52] },
  { id: 'kitchen', n: 6, name: 'KITCHEN', r: [298, 124, 96, 52] },
  { id: 'whall', n: 7, name: 'WEST HALL', r: [118, 124, 40, 124] },
  { id: 'ehall', n: 8, name: 'EAST HALL', r: [252, 124, 40, 124] },
  { id: 'vent', n: 9, name: 'VENT', r: [164, 124, 82, 26] },
];
const PATH = { dylan: ['stage', 'arcade', 'storage', 'H', 'D'], gavin: ['stage', 'arcade', 'kitchen', 'H', 'D'], bing: ['stage', 'arcade', 'prize', 'H', 'D'] };
const rate = lvl => lvl > 0 ? 0.5 + lvl * 0.13 : 0;
const sideName = s => s === 'L' ? 'left' : 'right';

let mode = 'menu', g = null, sc = null, intro = 0, dawn = 0, paused = false, T = 0, regions = [], held = null;
const keys = {};

// ---------- captions ----------
const subs = $('subs'); const mainSub = document.createElement('div'); mainSub.hidden = true; subs.appendChild(mainSub);
function setMain(who, s) {
  mainSub.hidden = !s; mainSub.textContent = '';
  if (!s) return;
  if (who) { const b = document.createElement('span'); b.className = 'who'; b.textContent = who + ': '; mainSub.appendChild(b); }
  mainSub.appendChild(document.createTextNode(s));
}
function cue(s, cls = '', who = '', dur = 4) {
  const d = document.createElement('div'); d.className = 'cue ' + cls;
  if (who) { const b = document.createElement('span'); b.className = 'who'; b.textContent = who + ': '; d.appendChild(b); }
  d.appendChild(document.createTextNode(s));
  subs.insertBefore(d, mainSub);
  while (subs.children.length > 4) subs.firstChild.remove();
  setTimeout(() => d.remove(), dur * 1000);
}
function clearSubs() { setMain(); while (subs.children.length > 1) subs.firstChild.remove(); }
function voice(who, key) {
  const arr = VOICE[who][key], i = Math.random() * arr.length | 0, s = arr[i];
  cue('"' + s + '"', 'bot', NAMES[who], 4.5);
  Au.sfx.growl();
  if (!g.call) Au.playClip(`${who}_${key}_${i}`, null, () => Au.speak(s, { pitch: who === 'benton' ? 1.5 : 0.1, rate: 0.8 }));
}

// ---------- a night ----------
function mk(id, lvl, every, side) { return { id, lvl, every, timer: every, pos: 0, side, arr: 0, in: false, leaned: false }; }
function startNight(n, custom) {
  const L = custom || NIGHTS[n - 1];
  g = {
    night: n, custom: !!custom, t: 0, hour: 0, power: save.perks.battery ? 115 : 100, usage: 1,
    doorL: false, doorR: false, dl: 0, dr: 0, lightL: false, lightR: false, seal: false, sv: 0,
    mon: false, monT: 0, cam: 'stage', glitch: 0, pan: 0.5, panT: 0.5,
    perk: { ...save.perks }, lureCd: 0, cranking: false, crankA: 0, crankTick: 0, cranked: false, pouring: false,
    bots: { dylan: mk('dylan', L.dylan, 4.9, 'L'), gavin: mk('gavin', L.gavin, 5.3, 'R'), bing: mk('bing', L.bing, 6.1, 'L') },
    tok: { lvl: L.tok, st: 0, timer: 5.6, arr: 0, in: false },
    sal: { lvl: L.sal, state: 'bar', thirst: 100, side: 'L', t: 0, T: 5 },
    box: { lvl: L.box, v: 100, wake: -1, windA: 0, tick: 0 },
    intruder: null, scareAt: 0, out: null, call: null, called: false, acting: false,
  };
  save.perks = {}; persist();
  mode = 'intro'; intro = 0; paused = false; sc = null;
  clearSubs(); show(null); $('top').classList.add('on');
  Au.init(); Au.suspend(false);
  if (!custom && CALLS[n]) Au.preload(CALLS[n].map((_, i) => `c${n}_${i}`));
}
function loc(b) { const p = PATH[b.id][b.pos]; return p === 'H' ? (b.side === 'L' ? 'whall' : 'ehall') : p === 'D' ? 'door' + b.side : p; }
function atDoor(side) {
  for (const k in g.bots) { const b = g.bots[k]; if (!b.in && loc(b) === 'door' + side) return b.id; }
  const s = g.sal; if (s.state === 'run' && s.side === side && s.t < s.T * 0.45) return 'sal';
  return null;
}
function inRoom(room) {
  const r = [];
  for (const k in g.bots) { const b = g.bots[k]; if (!b.in && loc(b) === room) r.push(b.id); }
  const s = g.sal;
  if (room === 'bar' && s.state === 'bar') r.push('sal');
  if (s.state === 'run' && s.t >= s.T * 0.45 && room === (s.side === 'L' ? 'whall' : 'ehall')) r.push('sal');
  return r;
}
function enter(id) { g.intruder = id; g.scareAt = g.t + (g.mon ? 9 : 1.6); }

function botStep(b) {
  if (b.in || b.lvl <= 0 || Math.random() * 20 >= b.lvl) return;
  if (b.pos === 4) {
    if (g.t - b.arr < 3.5) return;
    if (g['door' + b.side]) { b.pos = 1; b.leaned = false; Au.sfx.step(b.side, 2); cue(`[footsteps walk away from the ${sideName(b.side)} door]`); }
    else { b.in = true; enter(b.id); }
    return;
  }
  if (b.id === 'bing' && g.mon && !g.glitch && g.cam === loc(b)) return; // Bing freezes while you watch him
  if (b.id === 'bing' && b.pos === 2) b.side = Math.random() < 0.5 ? 'L' : 'R';
  if (b.pos === 3 && atDoor(b.side)) return;
  b.pos++; b.arr = g.t;
  if (b.id === 'dylan' && g.mon) { g.glitch = 1.2; Au.sfx.glitch(); cue('[camera signal lost]'); }
  if (b.id === 'bing') { Au.sfx.laugh(); cue('[a deep laugh echoes through the building]'); }
  if (b.id === 'gavin' && b.pos === 2) { Au.sfx.vent(); cue('[pots clatter in the kitchen]'); }
  if (b.pos === 3) { Au.sfx.step(b.side); cue(`[footsteps in the ${b.side === 'L' ? 'west' : 'east'} hall]`); }
  if (Math.random() < 0.22) voice(b.id, 'move');
}
function tokStep() {
  const k = g.tok;
  if (k.in || k.lvl <= 0 || Math.random() * 20 >= k.lvl) return;
  if (k.st === 3) {
    if (g.t - k.arr < 3.5) return;
    if (g.seal) { k.st = 0; Au.sfx.coins(8); cue('[coins scatter back down the vent]'); }
    else { k.in = true; enter('tokens'); }
    return;
  }
  k.st++; k.arr = g.t;
  if (k.st >= 2) { Au.sfx.coins(); cue(k.st === 3 ? '[coins rattle right above you]' : '[coins rattle in the vent]'); if (k.st === 2 && Math.random() < 0.4) voice('tokens', 'move'); }
}

function powerOut() {
  g.out = { t: 0, stage: 0, next: 5 + Math.random() * 7 };
  g.doorL = g.doorR = g.lightL = g.lightR = g.seal = g.mon = false; endCall();
  Au.stopLoops(); Au.sfx.powerDown(); cue('[the power dies. the doors slide open.]', '', '', 6);
}
function scare(who, why) {
  mode = 'scare'; sc = { who, why: why || who, t: 0 };
  Au.hush(); Au.stopLoops(); Au.sfx.scare(); clearSubs(); cue('[SCREECH]', 'bot', '', 1.3);
}
function endCall() { if (g.call) { g.call = null; Au.hush(); setMain(); } }
function updateCall(dt) {
  const k = g.call; if (!k) return;
  if (k.ring > 0) { k.ring -= dt; return; }
  k.t += dt;
  const doneLine = k.i < 0 || (k.speech ? ((k.spoken && k.t > 0.6) || k.t > k.est * 1.6 + 4) : k.t >= k.est);
  if (!doneLine) return;
  if (k.t < k.est * 0.5 && k.i >= 0) return; // sound was switched off mid-line: still give time to read
  k.i++;
  if (k.i >= k.lines.length) { g.call = null; setMain(); cue('[call ended]', '', '', 2); return; }
  const s = k.lines[k.i], evil = g.night === 5;
  setMain(evil ? '???' : 'PHONE GUY', s);
  k.t = 0; k.est = s.length * 0.062 + 1; k.spoken = false; k.speech = Au.canPlay();
  const end = () => { k.spoken = true; };
  if (k.speech) Au.playClip(`c${g.night}_${k.i}`, end, () => Au.speak(s, evil ? { pitch: 0.1, rate: 0.7 } : { pitch: 0.95, rate: 1.05 }, end));
}

function update(dt) {
  g.t += dt;
  const hour = Math.floor(g.t / HOUR);
  if (hour >= 6) { mode = 'dawn'; dawn = 0; Au.hush(); Au.stopLoops(); Au.sfx.chime(); clearSubs(); cue('[bells chime. 6 AM.]', '', '', 5); return; }
  if (hour !== g.hour) {
    g.hour = hour;
    const B = g.bots, up = b => { if (b.lvl > 0) b.lvl++; };
    if (hour === 2) up(B.dylan);
    if (hour === 3) { up(B.dylan); up(B.gavin); up(B.bing); if (!g.custom && g.night === 1) B.bing.lvl = 1; }
    if (hour === 4) { up(B.dylan); up(B.gavin); up(B.bing); up(g.tok); }
  }
  // doors, shutter, monitor slide; view pan
  const ease = (v, to, sp) => v + Math.sign(to - v) * Math.min(Math.abs(to - v), sp * dt);
  g.dl = ease(g.dl, g.doorL ? 1 : 0, 7); g.dr = ease(g.dr, g.doorR ? 1 : 0, 7); g.sv = ease(g.sv, g.seal ? 1 : 0, 6);
  g.monT = ease(g.monT, g.mon ? 1 : 0, 6);
  g.pan += (g.panT - g.pan) * Math.min(1, dt * 7);
  if (g.glitch > 0) g.glitch = Math.max(0, g.glitch - dt);

  // phone call
  if (!g.called && g.t > 1.5 && !g.custom && CALLS[g.night]) { g.called = true; g.call = { lines: CALLS[g.night], i: -1, t: 0, est: 0, ring: 2.6 }; Au.sfx.ring(); setMain('', '[phone ringing]'); }
  updateCall(dt);

  // the hand crank: free power, but it is loud
  g.cranking = !g.mon && (held === 'crank' || !!keys.g);
  const loud = g.cranking && !g.out ? 1.7 : 1;
  if (g.cranking) { g.crankA += dt * 10; g.crankTick -= dt; if (g.crankTick <= 0) { g.crankTick = 0.16; Au.sfx.crank(); } if (!g.crankCue || g.t - g.crankCue > 6) cue('[the crank grinds loudly]', '', '', 2.5); g.crankCue = g.t; }
  if (g.lureCd > 0) g.lureCd -= dt;
  // the music box and Benton
  const bx = g.box, onCam = id => g.mon && g.cam === id && !g.glitch;
  g.acting = !!((held === 'act' || keys.f) && g.mon);
  if (bx.wake < 0) {
    const winding = g.acting && onCam('prize');
    if (winding) { bx.v = Math.min(100, bx.v + 30 * dt); bx.windA += dt * 9; bx.tick -= dt; if (bx.tick <= 0) { bx.tick = 0.13; Au.sfx.blip(); } }
    else bx.v = Math.max(0, bx.v - rate(bx.lvl) * (g.perk.oil ? 0.75 : 1) * (loud > 1 ? 1.6 : 1) * dt);
    Au.musicBox(dt, bx.v, g.mon && g.cam === 'prize');
    if (bx.v <= 0 && bx.lvl > 0) {
      bx.wake = 15; bx.sec = 15; Au.sfx.wake(); cue('[the music box winds down and stops]', '', '', 5);
      voice('benton', 'wake'); setTimeout(() => { if (mode === 'play' && g.box === bx) voice('benton', 'play'); }, 2600);
    }
  } else {
    bx.wake -= dt;
    if (Math.ceil(bx.wake) < bx.sec) { bx.sec = Math.ceil(bx.wake); Au.sfx.tick(); }
    if (bx.wake <= 0) return scare('benton');
  }

  if (g.out) {
    const o = g.out; o.t += dt;
    if (o.t > o.next) {
      o.stage++;
      if (o.stage === 1) { Au.sfx.jingle(); cue('[a slow jingle plays in the dark]', '', '', 5); voice('bing', 'out'); o.next = o.t + 6 + Math.random() * 7; }
      else if (o.stage === 2) { cue('[silence]', '', '', 2); o.next = o.t + 2 + Math.random() * 3; }
      else return scare('bing', 'power');
    }
    if (g.cranking) {
      if (g.cranked) { if (!o.told) { o.told = true; cue('[the crank spins freely. the breaker is dead.]', '', '', 5); } }
      else { o.charge = (o.charge || 0) + dt; if (o.charge >= 6) { g.out = null; g.power = 7; g.cranked = true; Au.sfx.click(); cue('[the generator catches. the lights come back on.]', '', '', 5); } }
    }
    return;
  }

  // Sal and his bottle
  const s = g.sal;
  let pouring = false;
  if (s.state === 'bar' && s.lvl > 0) {
    pouring = g.acting && onCam('bar');
    if (pouring) { const was = s.thirst; s.thirst = Math.min(100, s.thirst + 30 * dt); if (was < 100 && s.thirst >= 100 && Math.random() < 0.5) voice('sal', 'pour'); }
    else s.thirst = Math.max(0, s.thirst - rate(s.lvl) * (g.perk.keg ? 0.75 : 1) * dt);
    if (s.thirst <= 0) {
      s.state = 'run'; s.side = Math.random() < 0.5 ? 'L' : 'R'; s.T = s.t = Math.max(3.4, 6 - s.lvl * 0.14);
      Au.sfx.smash(); cue('[glass smashes at the bar]'); voice('sal', 'leave');
      setTimeout(() => { if (mode === 'play' && g.sal === s && s.state === 'run') { Au.sfx.step(s.side, 5); cue(`[fast, stumbling footsteps on the ${sideName(s.side)} side]`); } }, 900);
    }
  } else if (s.state === 'run') {
    s.t -= dt;
    if (s.t <= 0) {
      if (g['door' + s.side]) { Au.sfx.bang(s.side, 3); cue(`[three hard bangs on the ${sideName(s.side)} door]`); g.power = Math.max(0, g.power - 4); s.state = 'bar'; s.thirst = 65; voice('sal', 'back'); }
      else return scare('sal');
    }
  }
  g.pouring = pouring; Au.loop('pour', pouring, 0.12);

  // walkers
  for (const k in g.bots) { const b = g.bots[k]; b.timer -= dt * loud; if (b.timer <= 0) { b.timer = b.every; botStep(b); } }
  g.tok.timer -= dt * loud; if (g.tok.timer <= 0) { g.tok.timer = 5.6; tokStep(); }
  const gv = g.bots.gavin, lean = !gv.in && gv.pos === 4 && g.doorR;
  if (lean && !gv.leaned) { gv.leaned = true; Au.sfx.bang('R', 2); cue('[something heavy leans on the right door]'); }

  // someone got in
  if (g.intruder && g.t >= g.scareAt) return scare(g.intruder);

  // power
  g.usage = 1 + g.doorL + g.doorR + (g.lightL || g.lightR) + g.mon + g.seal + pouring;
  g.power -= (0.085 + 0.105 * (g.usage - 1) + (lean ? 0.1 : 0) - (g.cranking ? 0.65 : 0)) * dt;
  g.power = Math.min(g.power, 115);
  if (g.power <= 0) { g.power = 0; powerOut(); return; }
  Au.loop('hum', true, 0.035); Au.loop('static', g.mon, g.glitch ? 0.16 : 0.04); Au.loop('buzz', g.lightL || g.lightR, 0.12);
}

// ---------- controls ----------
function door(side) { if (g.out || g.mon) return; g['door' + side] = !g['door' + side]; Au.sfx.door(side); }
function light(side) { if (g.out || g.mon) return; const k = 'light' + side, v = !g[k]; g.lightL = g.lightR = false; g[k] = v; Au.sfx.click(); }
function seal() { if (g.out || g.mon) return; g.seal = !g.seal; Au.sfx.vent(); }
function monitor() {
  if (g.out) return;
  g.mon = !g.mon; Au.sfx.flip(); g.lightL = g.lightR = false;
  if (!g.mon && g.intruder) g.scareAt = Math.min(g.scareAt, g.t + 0.45);
}
const LURE = { stage: 1, arcade: 1, storage: 1, kitchen: 1, prize: 1 };
function lure() {
  if (!g.mon || g.out || g.lureCd > 0 || !LURE[g.cam]) return;
  g.lureCd = 16; Au.sfx.lure(); cue(`[a jingle plays in ${CAMS.find(k => k.id === g.cam).name.toLowerCase()}]`);
  if (g.box.wake < 0 && g.box.lvl > 0) g.box.v = Math.max(1, g.box.v - 8);
  let moved = false;
  for (const k in g.bots) { const b = g.bots[k], j = PATH[k].indexOf(g.cam), d = b.pos - j; if (b.in || j < 0 || d < 1 || d > 2) continue; if (Math.random() < (d === 1 ? 0.8 : 0.45)) { b.pos = j; b.arr = g.t; b.leaned = false; moved = true; } }
  const night = g; setTimeout(() => { if (mode === 'play' && g === night) cue(moved ? '[footsteps head toward the sound]' : '[nothing answers the jingle]'); }, 1100);
}
function horn() {
  if (!g.perk.horn || g.out) return;
  g.perk.horn = false; Au.sfx.horn(); cue('[AIR HORN BLAST]', '', '', 3);
  for (const k in g.bots) { const b = g.bots[k]; if (!b.in && b.pos === 4) { b.pos = 1; b.leaned = false; } }
  if (g.sal.state === 'run') { g.sal.state = 'bar'; g.sal.thirst = 50; }
  if (!g.tok.in) g.tok.st = 0;
  if (g.box.wake < 0 && g.box.lvl > 0) g.box.v = Math.max(1, g.box.v - 20);
}
function setCam(id) { if (g.cam !== id) { g.cam = id; Au.sfx.blip(); g.glitch = Math.max(g.glitch, 0.12); } }
function press(id) {
  if (mode !== 'play' || paused) return;
  if (id === 'doorL') door('L'); else if (id === 'doorR') door('R');
  else if (id === 'lightL') light('L'); else if (id === 'lightR') light('R');
  else if (id === 'seal') seal(); else if (id === 'mon') monitor();
  else if (id === 'mute') { endCall(); cue('[call muted]', '', '', 2); }
  else if (id === 'lure') lure(); else if (id === 'horn') horn();
  else if (id.startsWith('cam:')) setCam(id.slice(4));
}
function pt(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
let drag = null;
cv.addEventListener('pointerdown', e => {
  Au.init();
  const [x, y] = pt(e);
  for (let i = regions.length - 1; i >= 0; i--) { const r = regions[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { held = r.id; press(r.id); cv.setPointerCapture(e.pointerId); return; } }
  if (e.pointerType !== 'mouse') drag = { x, pan: g ? g.panT : 0 };
});
cv.addEventListener('pointermove', e => {
  if (mode !== 'play' || !g || g.mon) return;
  const [x] = pt(e);
  if (e.pointerType === 'mouse') g.panT = Math.max(0, Math.min(1, (x - 240) / (W - 480)));
  else if (drag) g.panT = Math.max(0, Math.min(1, drag.pan - (x - drag.x) / 600));
});
const up = () => { held = null; drag = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') return toggleSound();
  if (k === 'c') return toggleSubs();
  if (k === 'escape' && (mode === 'play' || mode === 'intro')) return pause(!paused);
  if (mode !== 'play' || paused || e.repeat) { if (k === ' ') e.preventDefault(); return; }
  Au.init();
  if (k === 'f') keys.f = true; else if (k === 'g') keys.g = true; else if (k === 'l') lure(); else if (k === 'h') horn();
  else if (k === ' ' || k === 's') { e.preventDefault(); monitor(); }
  else if (k === 'a') door('L'); else if (k === 'd') door('R');
  else if (k === 'q') light('L'); else if (k === 'e') light('R');
  else if (k === 'w') seal();
  else if (k === 'arrowleft') g.panT = 0; else if (k === 'arrowright') g.panT = 1;
  else if (k >= '1' && k <= '9' && g.mon) setCam(CAMS[+k - 1].id);
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'f' || k === 'g') keys[k] = false; });
addEventListener('blur', () => { keys.f = keys.g = false; held = null; if (mode === 'play' && !paused && !window.__fnabNoPause) pause(true); });

// ---------- drawing ----------
function tx(s, x, y, size, col, align = 'left', font = PX) { c.font = `${size}px ${font}, monospace`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y); }
function box(x, y, w, h, col, r = 8) { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function R(id, x, y, w, h) { regions.push({ id, x, y, w, h }); }

function sceneState() {
  const where = {}, s = g.sal;
  for (const k in g.bots) where[k] = g.bots[k].in ? null : loc(g.bots[k]);
  return {
    dl: g.dl, dr: g.dr, sv: g.sv, doorL: g.doorL, doorR: g.doorR, lightL: g.lightL, lightR: g.lightR, seal: g.seal, where,
    sal: { at: s.state === 'run' ? s.side : 'bar', k: 1 - s.t / s.T, thirst: s.thirst }, pour: g.pouring,
    awake: g.box.wake >= 0, windA: g.box.windA, tok: g.tok.in ? 0 : g.tok.st, out: !!g.out, eyes: !!g.out && g.out.stage === 1,
    call: !!g.call, intruder: !!g.intruder, crankA: g.crankA, clock: g.t / (HOUR * 6),
  };
}
const yaw = () => (0.5 - g.pan) * 2 * S3.YAW;
function drawCam() {
  const id = g.cam, cam = CAMS.find(k => k.id === id), s = g.sal, bx = g.box, blink = Math.sin(T * 8) > 0;
  feedFx(c, T, g.glitch > 0);
  if (g.glitch > 0.15) tx('SIGNAL LOST', 640, 340, 30, '#fff', 'center');
  tx(`CAM ${cam.n}  ${cam.name}`, 30, 100, 18, '#e8f5e8');
  if (blink) { c.fillStyle = '#ff3b2f'; c.beginPath(); c.arc(40, 136, 8, 0, 7); c.fill(); } tx('REC', 58, 137, 14, '#e8f5e8');
  // map: a floor plan of the building; each room is a button
  const mx = 850, my = 400;
  box(mx, my, 410, 262, 'rgba(0,0,0,.62)', 12);
  c.lineWidth = 2;
  for (const k of CAMS) {
    const [rx, ry, rw, rh] = k.r, on = k.id === id, warn = (k.id === 'bar' && s.lvl > 0 && (s.thirst < 30 || s.state === 'run')) || (k.id === 'prize' && bx.v < 30);
    c.fillStyle = on ? '#9dff3a' : warn && blink ? '#ff3b2f' : 'rgba(26,40,34,.95)'; c.fillRect(mx + rx, my + ry, rw, rh);
    c.strokeStyle = on ? '#eaffc8' : 'rgba(160,255,200,.55)'; c.strokeRect(mx + rx + 1, my + ry + 1, rw - 2, rh - 2);
    tx(`CAM${k.n}`, mx + rx + rw / 2, my + ry + rh / 2 + 1, rw < 50 ? 8 : 10, on ? '#07140a' : '#cfe8d4', 'center');
    if (warn) tx('!', mx + rx + rw - 8, my + ry + 10, 14, '#ffd23a', 'center');
    R('cam:' + k.id, mx + rx, my + ry, rw, rh);
  }
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(mx + 164, my + 196, 82, 52); c.strokeStyle = '#fff'; c.strokeRect(mx + 165, my + 197, 80, 50); tx('YOU', mx + 205, my + 223, 10, '#fff', 'center');
  c.fillStyle = '#e23d3d'; c.fillRect(mx + 158, my + 214, 6, 18); c.fillRect(mx + 246, my + 214, 6, 18);
  // the two jobs you do from the cameras
  const job = id === 'bar' && s.lvl > 0 ? { label: "SAL'S BOTTLE", v: s.thirst, btn: 'HOLD TO POUR', col: '#ffb020', ok: s.state === 'bar' }
    : id === 'prize' ? { label: 'MUSIC BOX', v: bx.v, btn: 'HOLD TO WIND', col: '#3ad7ff', ok: bx.wake < 0 } : null;
  if (job) {
    box(40, 500, 320, 150, 'rgba(0,0,0,.6)', 12);
    tx(job.label, 56, 522, 13, '#fff');
    box(56, 538, 288, 20, '#111', 4); box(56, 538, 288 * job.v / 100, 20, job.v < 30 ? (blink ? '#ff3b2f' : '#7a1a14') : job.col, 4);
    if (job.ok) { box(56, 570, 288, 66, g.acting ? job.col : 'rgba(40,60,50,.95)', 10); tx(job.btn, 200, 596, 14, g.acting ? '#111' : '#fff', 'center'); tx('or hold F', 200, 620, 9, g.acting ? '#111' : '#9ab', 'center'); R('act', 46, 560, 308, 86); }
    else tx(id === 'bar' ? 'HE IS COMING' : 'BENTON IS AWAKE', 200, 602, 15, blink ? '#ff3b2f' : '#fff', 'center');
  }
  if (LURE[id]) { const rdy = g.lureCd <= 0; box(40, 444, 320, 46, rdy ? 'rgba(40,60,50,.95)' : 'rgba(0,0,0,.6)', 10); tx(rdy ? 'PLAY SOUND (L)' : `RECHARGING ${Math.ceil(g.lureCd)}`, 200, 468, 12, rdy ? '#fff' : '#889', 'center'); R('lure', 36, 438, 328, 58); }
}

function drawPlay() {
  subs.classList.toggle('cam', g.mon);
  const o = g.out, onCam = g.monT >= 0.5;
  S3.render(onCam ? { type: 'cam', id: g.cam, glitch: g.glitch > 0 } : { type: 'office', yaw: yaw() }, sceneState(), T);
  c.clearRect(0, 0, W, H);
  if (onCam) { if (g.monT >= 1) drawCam(); else { const keep = regions; regions = []; drawCam(); regions = keep; } }
  else {
    if (!g.mon) for (const b of S3.buttons()) { if (o && b.id !== 'crank') continue; R(b.id, b.x, b.y, b.w, b.h); }
    if (o) { tx(g.cranked ? 'The breaker is dead.' : 'Generator dead. Hold the CRANK (G) to try a restart.', 640, H - 60, 13, '#cfd6d0', 'center'); if (o.charge && !g.cranked) { box(440, H - 40, 400, 16, '#111', 4); box(440, H - 40, 400 * Math.min(1, o.charge / 6), 16, '#e8b923', 4); } R('crank', 340, H - 90, 600, 90); }
  }
  const fade = 1 - Math.abs(g.monT - 0.5) * 2;
  if (g.monT > 0 && g.monT < 1) { c.fillStyle = `rgba(0,0,0,${fade * 0.9})`; c.fillRect(0, 0, W, H); staticFx(c, fade * 0.5, T); }
  // HUD
  const h = g.hour === 0 ? 12 : g.hour;
  tx(`${h} AM`, W - 24, 40, 30, '#fff', 'right'); tx(g.custom ? 'Custom Night' : `Night ${g.night}`, W - 24, 78, 13, '#cfd6d0', 'right');
  if (!o) {
    tx(`Power: ${Math.ceil(g.power)}%`, 24, H - 62, 16, g.power < 15 ? '#ff3b2f' : '#fff');
    tx('Usage:', 24, H - 30, 12, '#cfd6d0');
    for (let i = 0; i < g.usage; i++) box(110 + i * 20, H - 42, 14, 24, ['#3ddc5a', '#3ddc5a', '#ffd23a', '#ff8a1e', '#ff3b2f', '#ff3b2f', '#ff3b2f'][i], 2);
    box(390, H - 50, 500, 40, g.mon ? 'rgba(157,255,58,.22)' : 'rgba(255,255,255,.13)', 8);
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2; c.beginPath(); c.roundRect(390, H - 50, 500, 40, 8); c.stroke();
    tx(g.mon ? 'v  CLOSE CAMERAS  v' : '^  CAMERAS (SPACE)  ^', 640, H - 29, 12, '#fff', 'center');
    R('mon', 380, H - 62, 520, 62);
  }
  if (g.perk.horn && !o) { box(20, 204, 190, 40, 'rgba(120,20,10,.75)', 8); tx('AIR HORN (H)', 115, 225, 11, '#fff', 'center'); R('horn', 14, 198, 202, 52); }
  if (g.cranking && !o) tx('CRANKING  +POWER  (LOUD)', 640, H - 80, 12, '#e8b923', 'center');
  if (g.call) { box(20, 150, 190, 40, 'rgba(0,0,0,.6)', 8); tx('MUTE CALL', 115, 171, 12, '#fff', 'center'); R('mute', 14, 144, 202, 52); }
  if (g.box.wake >= 0) { const w = Math.sin(T * 12) > 0; box(380, 20, 520, 64, 'rgba(120,0,0,.75)', 10); tx(`BENTON IS AWAKE  0:${String(Math.ceil(g.box.wake)).padStart(2, '0')}`, 640, 53, 20, w ? '#fff' : '#ffb0a8', 'center'); }
}

function frame(now) {
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000); frame.last = now; T += dt;
  c.setTransform(SS, 0, 0, SS, 0, 0);
  regions = [];
  if (mode === 'menu' || mode === 'cert') { S3.render({ type: 'title' }, null, T); c.clearRect(0, 0, W, H); const gr = c.createLinearGradient(0, 0, 800, 0); gr.addColorStop(0, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  else if (mode === 'intro') {
    if (!paused) intro += dt;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    tx('12:00 AM', 640, 320, 44, '#fff', 'center'); tx(g.custom ? 'Custom Night' : g.night === 6 ? 'Night 6: Overtime' : `Night ${g.night}`, 640, 390, 24, '#cfd6d0', 'center');
    staticFx(c, 0.08, T);
    if (intro > 2.6) mode = 'play';
  } else if (mode === 'play') { if (!paused) update(dt); if (mode === 'play') drawPlay(); }
  else if (mode === 'scare') { sc.t += dt; S3.render({ type: 'scare', who: sc.who, t: sc.t, yaw: yaw() }, sceneState(), T); c.clearRect(0, 0, W, H); if (sc.t > 1.35) gameOver(); }
  else if (mode === 'over') { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); staticFx(c, 0.22, T); }
  else if (mode === 'dawn') {
    dawn += dt; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const k = Math.max(0, Math.min(1, (dawn - 1.2) / 0.8));
    c.save(); c.beginPath(); c.rect(0, 280, W, 120); c.clip(); tx('5', 560, 340 - k * 120, 80, '#fff', 'center'); tx('6', 560, 460 - k * 120, 80, '#fff', 'center'); c.restore(); tx('AM', 720, 340, 80, '#fff', 'center');
    if (dawn > 2.2) for (let i = 0; i < 60; i++) { c.fillStyle = ['#e23d3d', '#ffd23a', '#3ad7ff', '#9dff3a'][i % 4]; c.fillRect((i * 173.3) % W, ((dawn - 2.2) * (140 + (i * 37) % 160) + i * 53) % H, 10, 16); }
    if (dawn > 5.5) nightWon();
  }
  requestAnimationFrame(frame);
}

// ---------- screens ----------
function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }
function gameOver() {
  mode = 'over'; clearSubs();
  $('o-who').textContent = sc.why === 'power' ? 'The lights went out. Bing was waiting.' : sc.who === 'benton' ? 'Benton woke up.' : `${NAMES[sc.who]} got into the office.`;
  $('o-tip').textContent = TIPS[sc.why];
  show('over');
}
function nightWon() {
  const n = g.night;
  if (g.custom) return cert('Custom Night Cleared', 'Sean survived a night he built himself. Management is impressed, and a little worried.');
  const won = 10 + n * 5 + Math.floor(Math.max(0, g.power) / 4); save.tickets += won;
  if (n < 5) { save.night = Math.max(save.night, n + 1); persist(); return openShop(n + 1, `Night ${n} survived: +${won} tickets.`); }
  if (n === 5) { save.beat5 = true; save.night = 5; persist(); return cert('Employee of the Week', 'Awarded to SEAN for five nights at Bing\'s Arcade & Grill without being escorted off the premises. Night 6 and Custom Night are now open.'); }
  save.beat6 = true; persist(); cert('Promoted to Day Shift', 'SEAN worked the overtime shift nobody else would. He never has to see Bing after dark again. Probably.');
}
const ITEMS = [['battery', 'Spare Battery', 'start the shift with 115% power', 25], ['oil', 'Slow Spring', 'the music box unwinds 25% slower', 25], ['keg', 'Big Bottle', "Sal's bottle lasts 25% longer", 20], ['horn', 'Air Horn', 'press H once to blast everyone away from your doors', 30]];
let shopNight = 1;
function openShop(n, note) {
  shopNight = n; mode = 'menu'; g = null; clearSubs(); subs.classList.remove('cam'); $('top').classList.remove('on');
  const host = $('s-rows'); host.textContent = '';
  $('s-tix').textContent = `${note ? note + ' ' : ''}You have ${save.tickets} tickets.`;
  $('s-go').textContent = `Start Night ${n}`;
  for (const [k, name, desc, cost] of ITEMS) {
    const b = document.createElement('button'); b.className = 'mb'; const own = save.perks[k];
    b.textContent = own ? `[READY] ${name} (click to return)` : `${name} - ${cost} tickets`;
    const sm = document.createElement('small'); sm.textContent = '  ' + desc; b.appendChild(sm);
    b.addEventListener('click', () => { if (own) { delete save.perks[k]; save.tickets += cost; } else if (save.tickets >= cost) { save.perks[k] = true; save.tickets -= cost; } else return; persist(); openShop(n, ''); });
    host.appendChild(b);
  }
  show('shop');
}
function cert(title, body) { mode = 'cert'; $('w-title').textContent = title; $('w-text').textContent = body; show('win'); $('top').classList.remove('on'); }
function menu() {
  mode = 'menu'; g = null; paused = false; Au.suspend(false); Au.hush(); Au.stopLoops();
  clearSubs(); subs.classList.remove('cam'); $('top').classList.remove('on');
  $('m-night').textContent = `Night ${save.night}`; $('m-tix').textContent = `${save.tickets} tickets`;
  $('m-six').hidden = !save.beat5; $('m-custom').hidden = !save.beat5;
  show('menu'); labels();
}
function pause(v) {
  paused = v; show(v ? 'pause' : null);
  if ('speechSynthesis' in window) v ? speechSynthesis.pause() : speechSynthesis.resume();
  if (v) Au.stopLoops();
  Au.suspend(v);
}
function labels() {
  $('m-sound').textContent = `Sound: ${save.sound ? 'ON' : 'OFF'}`; $('m-subs').textContent = `Captions: ${save.subs ? 'ON' : 'OFF'}`;
  $('t-sound').classList.toggle('off', !save.sound); $('t-subs').classList.toggle('off', !save.subs);
  subs.classList.toggle('hide', !save.subs);
}
function toggleSound() { save.sound = !save.sound; Au.setOn(save.sound); persist(); labels(); }
function toggleSubs() { save.subs = !save.subs; persist(); labels(); }

const on = (id, fn) => $(id).addEventListener('click', e => { Au.init(); e.currentTarget.blur(); fn(); });
on('m-new', () => { save.night = 1; persist(); startNight(1); });
on('m-cont', () => startNight(save.night));
on('m-six', () => startNight(6));
on('m-shop', () => openShop(save.night)); on('s-go', () => startNight(shopNight)); on('s-back', menu);
on('m-help', () => show('help')); on('h-back', () => show('menu'));
on('m-sound', toggleSound); on('m-subs', toggleSubs); on('t-sound', toggleSound); on('t-subs', toggleSubs);
on('t-pause', () => { if (mode === 'play' || mode === 'intro') pause(!paused); });
on('p-resume', () => pause(false)); on('p-quit', menu);
on('o-retry', () => startNight(g.night, g.custom ? save.custom : null)); on('o-menu', menu); on('w-ok', menu);
const CROWS = [['bing', 'Bing'], ['dylan', 'Dylan'], ['gavin', 'Gavin'], ['sal', 'Sal'], ['box', 'Benton'], ['tok', 'Mr. Tokens']];
function buildCustom() {
  const host = $('c-rows'); host.textContent = '';
  for (const [k, name] of CROWS) {
    const l = document.createElement('label'), a = document.createElement('span'), r = document.createElement('input'), v = document.createElement('span');
    a.textContent = name; r.type = 'range'; r.min = 0; r.max = 20; r.value = save.custom[k]; v.textContent = r.value;
    r.addEventListener('input', () => { save.custom[k] = +r.value; v.textContent = r.value; });
    l.append(a, r, v); host.appendChild(l);
  }
}
on('m-custom', () => { buildCustom(); show('custom'); });
on('c-max', () => { for (const [k] of CROWS) save.custom[k] = 20; buildCustom(); });
on('c-back', () => { persist(); show('menu'); });
on('c-go', () => { persist(); startNight(7, { ...save.custom }); });

Au.setOn(save.sound);
menu();
(document.fonts ? document.fonts.load('40px Bungee').catch(() => {}) : Promise.resolve()).then(() => {
  try { S3.init($('gl')); requestAnimationFrame(frame); }
  catch (e) { console.error(e); $('m-night').textContent = '3D graphics could not start on this device'; }
});

// Test hook: lets a script start nights and fast-forward time.
window.__fnab = {
  get g() { return g; }, get sc() { return sc; }, get mode() { return mode; }, save, startNight, press, menu,
  ff(sec) { let n = 0; while (n < sec && mode === 'play') { update(0.05); n += 0.05; } return mode; },
  play() { if (mode === 'intro') mode = 'play'; }, hold(v) { keys.f = v; }, crank(v) { keys.g = v; }, lure, horn, openShop,
};
