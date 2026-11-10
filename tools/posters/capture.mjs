#!/usr/bin/env node
// Free Period poster kit: real gameplay shots, made into card posters, banner posters and hover previews.
//
//   node tools/posters/capture.mjs shoot   <game> [--out DIR]               bursts of stills + an 8 s clip (headless Chrome, real GPU)
//   node tools/posters/capture.mjs poster  <game> --card FILE --hero FILE   assets/<game>.jpg (1280x720) + assets/<game>-hero.jpg (1920x820)
//                                          [--card-cfg JSON] [--hero-cfg JSON]   (layout tweaks over LOOK below, e.g. '{"focus":[0.6,0.5]}')
//   node tools/posters/capture.mjs preview <game> [--out DIR]               assets/<game>.webm from the clip (640x360 VP9, no audio)
//
// <game>: bing-ball, close-call or horror-exe. DIR (default $POSTERS_OUT or <tmp>/fp-posters) gets <game>/card-*.jpg,
// <game>/hero-*.jpg and <game>/clip/. Look at the bursts, pick a card frame and a hero frame, then run `poster`.
// Needs puppeteer-core (not a dependency of this repo): `npm i puppeteer-core` in any scratch folder and pass
// PUPPETEER_DIR=<that folder>. Google Chrome must be installed; ffmpeg (with libvpx-vp9) for `preview`. See README.md.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the games
// Each game: url(base), prepare(page) before it loads, ready(page) to set the shot up (hooks on window.__poster),
// stills(page, burst) for the poster bursts, clip: the 8 s preview's timeline, poster: the card's lettering.
const GAMES = {
  'bing-ball': {
    // Practice (offline, in the browser) in the Blue Lock Facility, no bots, Nagi's Fake Volley (move 1) under a camera
    // placed by Game.camOverride; staff tools in practice are the game's own (shared/commands.js).
    url: () => process.env.BB_URL || 'https://bing-ball.onrender.com/',
    async ready(page) {
      const play = await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /let.?s play/i.test(b.textContent)), { timeout: 90000 }).catch(() => null);
      if (play) await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.offsetParent && /let.?s play/i.test(b.textContent)).click());
      await sleep(800);
      await page.evaluate(() => { document.getElementById('bot-count').value = '0'; document.getElementById('arena-select').value = 'facility'; document.getElementById('btn-practice').click(); });
      await page.waitForFunction(() => window.__bb?.game?.local && window.__bb.conn, { timeout: 60000 });
      await sleep(9000);      // the kickoff countdown: moves are locked until it ends
      await page.evaluate(async () => {
        const g = window.__bb.game;
        const cmd = (c, ...a) => new Promise((r) => window.__bb.conn.emit('staff:cmd', { cmd: c, args: a.map(String), quiet: true }, r));
        g.renderer.domElement.classList.add('poster-main');
        const st = document.createElement('style');
        st.textContent = 'body { visibility: hidden !important; } canvas.poster-main { visibility: visible !important; }';
        document.head.append(st);
        let cam = null;
        g.camOverride = (c, v) => {
          if (!cam) return false;
          const yaw = g.prediction.state.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
          c.up.set(0, 1, 0);
          c.position.set(v.x + fx * cam.f + rx * cam.r, v.y + cam.h, v.z + fz * cam.f + rz * cam.r);
          c.lookAt(v.x, v.y + cam.lh, v.z);
          if (c.fov !== cam.fov) { c.fov = cam.fov; c.updateProjectionMatrix(); }
          return true;
        };
        const tagsOff = () => { for (const v of [g.local, ...(g.views?.values?.() || [])]) v?.mesh?.setTagsAllowed?.(false); };
        window.__poster = {
          cmd,
          // a fresh take: camera, player on the centre spot with the ball, name tags off
          async take(c) { cam = c; await cmd('tp', 0, 0); await cmd('ball'); tagsOff(); },
        };
        await cmd('bots', 'clear'); await cmd('bots', 'all', 'off');
        await cmd('style', 'bb2nagi', ''); await cmd('nocd', '', 'on'); await cmd('god', '', 'on');
      });
    },
    cams: [
      { f: 4.5, r: 5, h: 0.4, lh: 1.3, fov: 54 },        // front three-quarter, low: the strike comes at the lens
      { f: 3.6, r: 4.2, h: 0.35, lh: 1.3, fov: 58 },
      { f: 2, r: 6.5, h: 0.5, lh: 1.3, fov: 52 },        // side: the afterimages and the ball's arc
      { f: -2.5, r: 6.5, h: 0.6, lh: 1.4, fov: 52 },     // from behind his shoulder
    ],
    async stills(page, shoot) {
      for (const [i, cam] of this.cams.entries()) {
        await page.evaluate((c) => window.__poster.take(c), cam);
        await sleep(600);
        await page.keyboard.press('Digit1');
        await shoot(`c${i}`, 1.7, 2);      // the flick, the afterimages and the strike (about 1.3 s after the key)
        await sleep(1500);
      }
    },
    clip: [
      // four Fake Volleys from four angles (each is about 1.9 s; the strike lands about 1.2 s after the key)
      { at: 0, run: (p) => p.evaluate(() => window.__poster.take({ f: 2, r: 6.5, h: 0.5, lh: 1.4, fov: 52 })) },
      { at: 0.3, key: 'Digit1' },
      { at: 2.15, run: (p) => p.evaluate(() => window.__poster.take({ f: 4.5, r: 5, h: 0.4, lh: 1.4, fov: 54 })) },
      { at: 2.45, key: 'Digit1' },
      { at: 4.3, run: (p) => p.evaluate(() => window.__poster.take({ f: -2.5, r: 6.5, h: 0.6, lh: 1.5, fov: 52 })) },
      { at: 4.6, key: 'Digit1' },
      { at: 6.45, run: (p) => p.evaluate(() => window.__poster.take({ f: 3.6, r: -4.6, h: 0.35, lh: 1.4, fov: 56 })) },
      { at: 6.75, key: 'Digit1' },
    ],
    poster: {
      title: ['BING', '~BALL'], tag: '3D soccer · anime moves', accent: '#c6ff3d', accent2: '#3de0ff',
    },
  },

  'close-call': {
    // A solo run in the Spectre (orange) with nitro, an autopilot weaving through the traffic, and a low chase camera laid
    // over the game's (World.follow runs after the game's camera, just before the frame is drawn). Each take is staged:
    // the car is put just behind two cars driving side by side and threads between them (traffic is a pure function of
    // the seed and the clock, js/traffic.js, so where they will be is known).
    url: (base) => `${base}/games/close-call/`,
    async prepare(page) {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('closecall.v1', JSON.stringify({ cash: 0, owned: ['pocket', 'spectre'], car: 'spectre', paint: { spectre: 0xff7a1a }, best: 0, total: 0, name: '', settings: { quality: 'high', vol: 0, units: 'kmh', density: 1.35 } }));
      });
    },
    async ready(page) {
      await page.waitForFunction(() => window.__cc, { timeout: 30000 });
      await sleep(1000);
      await page.evaluate(async () => {
        const cc = window.__cc, w = cc.world, sim = cc.sim;
        const { trafficNear } = await import(new URL('js/traffic.js', location.href).href);
        const st = document.createElement('style');
        st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
        document.head.append(st);
        const P = {}, Q = {}, LC = (i) => -7.5 + 3.75 * (i + 0.5);
        let cam = null, camD = null, last = performance.now(), clock = 0;
        const follow = w.follow.bind(w);
        w.follow = (c) => {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (cam && cc.mode === 'play') {
            camD = camD == null ? sim.d : camD + (sim.d - camD) * (1 - Math.exp(-dt * 4));
            w.road.toWorld(sim.s - cam.back, camD + cam.side, P);
            c.position.set(P.x, cam.h, P.z);
            w.road.toWorld(sim.s + cam.ahead, camD + (cam.lookSide || 0), Q);
            c.lookAt(Q.x, cam.lh, Q.z);
            if (c.fov !== cam.fov) { c.fov = cam.fov; c.updateProjectionMatrix(); }
          }
          follow(c);
        };
        // the world clock (traffic is a pure function of it): read from the game's own call
        const update = w.updateTraffic.bind(w);
        w.updateTraffic = (t, ...rest) => { clock = t; return update(t, ...rest); };
        // no crashes: a crash blinks the car for 1.6 s and stops it (the autopilot below still steers round the traffic)
        const step = sim.step.bind(sim);
        sim.step = (dt, inp, road, traffic) => step(dt, inp, road, traffic, 0);
        // autopilot: gas and nitro held (braking over 260 km/h), the middle lanes preferred, moving over only when that lane is
        // clear well ahead and alongside
        const keys = {};
        const key = (code, on) => { if (!!keys[code] === on) return; keys[code] = on; dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code })); };
        let target = 1, holdUntil = 0;
        const pilot = () => {
          if (cc.mode === 'play') {
            sim.nitro = 1;
            key('KeyW', true); key('ShiftLeft', true);
            const ahead = [1e9, 1e9, 1e9, 1e9], beside = [false, false, false, false];
            for (let i = 0; i < w.trafficCount; i++) {
              const c = w.traffic[i], ds = c.s - sim.s;
              if (ds > -c.hl - 3 && ds < ahead[c.lane]) ahead[c.lane] = ds;
              if (ds > -c.hl - 10 && ds < c.hl + 45) beside[c.lane] = true;
            }
            const room = (L) => ahead[L] - (L === 0 || L === 3 ? 40 : 0);
            if (performance.now() > holdUntil && ahead[target] < 120) {
              let best = target;
              for (const L of [target - 1, target + 1]) if (L >= 0 && L <= 3 && !beside[L] && room(L) > room(best) + 15) best = L;
              target = best;
            }
            // brake for a car ahead in this lane or the one being moved into (at 45 m/s closing, 75 m is about what it takes)
            const cur = Math.max(0, Math.min(3, Math.round((sim.d + 5.625) / 3.75)));
            key('KeyS', sim.v > 72 || (Math.min(ahead[target], ahead[cur]) < 75 && sim.v > 30));
            const e = LC(target) - sim.d;
            key('KeyD', e > 0.3); key('KeyA', e < -0.3);
          }
          requestAnimationFrame(pilot);
        };
        pilot();
        // THREAD THE NEEDLE: find two cars side by side with a free lane between them (up to 60 km up the road, at the clock
        // `inT` seconds from now), and put the car `inT` seconds behind them in that lane at 260 km/h
        const stage = (inT = 1.6) => {
          const v = 72, list = [], s0 = sim.s + 300, t1 = clock + inT;
          const n = trafficNear(w.seed, w.density, t1, s0, s0 + 60000, list);
          const lanes = [[], [], [], []];
          for (let i = 0; i < n; i++) lanes[list[i].lane].push(list[i]);
          for (const l of lanes) l.sort((a, b) => a.s - b.s);
          // is lane L empty between s0 and s1? (binary search for the first car past s0)
          const clear = (L, a0, a1) => { const l = lanes[L]; let lo = 0, hi = l.length; while (lo < hi) { const m = (lo + hi) >> 1; if (l[m].s < a0) lo = m + 1; else hi = m; } return lo >= l.length || l[lo].s > a1; };
          let best = null;
          // the lane between them clear for the run-up (the car closes about 45 m/s on it) and, best, 2.5 s past them
          for (const past of [115, 50]) {
            for (const La of [0, 1]) for (const a of lanes[La]) for (const b of lanes[La + 2]) {
              if (Math.abs(a.s - b.s) > 5) continue;
              const L = La + 1, mid = (a.s + b.s) / 2;
              if (!clear(L, mid - 90, mid + past)) continue;
              const big = a.hl + b.hl;      // a truck or a bus in the pair looks best
              if (!best || big > best.big) best = { mid, L, big };
            }
            if (best) break;
          }
          console.log(`stage: ${n} cars ahead, ${best ? `pair at +${Math.round(best.mid - sim.s)} m, lane ${best.L}` : 'no pair'}`);
          if (!best) return false;
          sim.reset(best.mid - v * inT - 1.5, LC(best.L), v);
          sim.nitro = 1; target = best.L; holdUntil = performance.now() + inT * 1000 + 900; camD = null;
          return true;
        };
        window.__poster = { take(c) { cam = c; }, stage };
        cc.startSolo();
      });
      await sleep(5000);
    },
    cams: [
      // (lookSide aims left of the car so it sits right of centre, where the posters want it)
      { back: 6.5, side: -0.6, h: 0.55, ahead: 12, lh: 0.9, fov: 50, lookSide: -2.5 },     // low behind: nitro in the lens, traffic either side
      { back: 5.2, side: -2.3, h: 0.7, ahead: 10, lh: 0.65, fov: 54 },                     // rear three-quarter from the left
      { back: 4.6, side: -1.8, h: 0.45, ahead: 9, lh: 0.75, fov: 58, lookSide: -0.6 },     // closer and lower
    ],
    async stills(page, shoot) {
      for (const [i, cam] of this.cams.entries()) for (const k of [0, 1]) {
        await page.evaluate((c) => { window.__poster.take(c); window.__poster.stage(1.6); }, cam);
        await shoot(`c${i}${'ab'[k]}`, 2.2, 3);      // the run-up and the pass between the two
      }
    },
    clip: [
      { at: 0, run: (p) => p.evaluate(() => { window.__poster.take({ back: 6.5, side: -0.6, h: 0.55, ahead: 12, lh: 0.9, fov: 50, lookSide: -1.2 }); window.__poster.stage(1.8); }) },
      { at: 4.2, run: (p) => p.evaluate(() => { window.__poster.take({ back: 5.8, side: 0, h: 0.5, ahead: 12, lh: 0.85, fov: 52, lookSide: 0.9 }); window.__poster.stage(1.8); }) },
    ],
    poster: {
      title: ['CLOSE', '~CALL'], tag: 'Midnight traffic · near misses', accent: '#ffb020', accent2: '#3de0ff',
    },
  },

  'horror-exe': {
    // A staged shot in the game's own engine: its rigs (js/rig.js, the same module the game loaded), its world and its
    // post-processing, posed through the window.__hxFreeze hook (main.js calls it instead of the title screen's update).
    // EXE stands in front of the eclipse so it rings his head; the survivors run from him; a light rides with the camera
    // like the match's lantern. Original characters only.
    url: (base) => `${base}/games/horror-exe/`,
    async prepare(page) {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('horrorexe.v1', JSON.stringify({ settings: { quality: 'high', vol: 0, sens: 1, invert: false } }));
      });
    },
    async ready(page) {
      await page.waitForFunction(() => window.__hx && window.__hxGround, { timeout: 30000 });
      await sleep(1200);
      await page.evaluate(async () => {
        const st = document.createElement('style');
        st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }';
        document.head.append(st);
        const { Rig } = await import(new URL('js/rig.js', location.href).href);
        const hx = window.__hx, scene = hx.world.scene, cam = hx.camera, ground = window.__hxGround;
        const ours = (r) => { r.root.userData.poster = true; scene.add(r.root); return r; };
        const surv = ours(new Rig({ role: 'surv', char: 'bolt', look: { skin: '#f2c79a', shirt: '#3a7bff', style: 'tee', pattern: 'bolt', pants: '#2b2f3a', face: 'worried', hat: 'spiky', hatColor: '#3a2416' } }));
        const surv2 = ours(new Rig({ role: 'surv', char: 'mira', look: { skin: '#c98e62', shirt: '#ffd23d', style: 'hoodie', pattern: 'star', pants: '#3a2f4a', face: 'worried', hat: 'long', hatColor: '#1d1410' } }));
        const exe = ours(new Rig({ role: 'exe', variant: 'exe' }));
        // the title screen's lurker (an EXE rig that was there first) stays out of the shot
        for (const o of scene.children) {
          if (!o.isGroup || o.userData.poster) continue;
          let eyes = false; o.traverse((c) => { if (c.isSprite && c.material.color?.getHex() === 0xff1010) eyes = true; });
          if (eyes) o.visible = false;
        }
        const lantern = scene.children.find((o) => o.isPointLight);
        // directions on the ground: SD points at the eclipse (world.js SUN_DIR); az rotates it (degrees, + = right on screen)
        const SD = { x: -0.42, z: -0.86 }; { const l = Math.hypot(SD.x, SD.z); SD.x /= l; SD.z /= l; }
        const rot = (deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return { x: SD.x * c - SD.z * s, z: SD.x * s + SD.z * c }; };
        let shot = null, t = 0;
        // shot: { x, z: camera spot; ch: camera height; look: [az, pitch]; fov; speed: m/s everybody runs away from the eclipse
        //   (the camera dollies back with them); s, s2, e: [az, dist, legSpeed, turn] for Bolt, Mira and EXE (null: not in it);
        //   atk, lunge: EXE's pose; eMove; lantern: [dx, dy, dz, intensity, distance] }
        window.__hxFreeze = (dt) => {
          if (!shot) return;
          t += dt;
          const mv = (shot.speed || 0) * t + (shot.mv0 || 0);
          const ox = shot.x - SD.x * mv, oz = shot.z - SD.z * mv;
          const put = (r, p, pose = {}) => {
            if (!p) { r.root.visible = false; return; }
            const d = rot(p[0]), x = ox + d.x * p[1], z = oz + d.z * p[1];
            r.root.visible = true;
            r.root.position.set(x, ground(x, z), z);
            r.root.rotation.y = Math.atan2(-SD.x, -SD.z) + ((p[3] || 0) * Math.PI) / 180;
            r.update(dt, { speed: p[2] ?? 10, sprint: true, atk: pose.atk ?? -1, lunge: !!pose.lunge });
          };
          put(surv, shot.s); put(surv2, shot.s2);
          // eMove: [from, to, seconds]: EXE walks in from `from` m to `to` m
          if (shot.eMove) { const [from, to, secs] = shot.eMove, k = Math.min(1, t / secs); shot.e[1] = from + (to - from) * k; }
          put(exe, shot.e, { atk: shot.atk, lunge: shot.lunge });
          const gy = ground(ox, oz), ld = rot(shot.look[0]), pitch = (shot.look[1] * Math.PI) / 180;
          cam.position.set(ox, gy + shot.ch, oz);
          cam.lookAt(ox + ld.x * 10, gy + shot.ch + Math.tan(pitch) * 10, oz + ld.z * 10);
          if (cam.fov !== shot.fov) { cam.fov = shot.fov; cam.updateProjectionMatrix(); }
          if (lantern && shot.lantern) {
            const [lx, ly, lz, li, ldist] = shot.lantern;
            lantern.position.set(cam.position.x + lx, cam.position.y + ly, cam.position.z + lz); lantern.intensity = li; lantern.distance = ldist;
          }
          hx.fx.update(dt, shot.terror ?? 0.4, false);
        };
        window.__poster = {
          take(s) { shot = { ...s, e: s.e && [...s.e] }; t = 0; },
        };
      });
    },
    shots: [
      { x: -6, z: 30, ch: 0.45, look: [-10, 12], fov: 46, e: [0, 7, 4], atk: 0.15, s: [22, 5.4, 10, -35], s2: null, lantern: [0, 1.5, 0, 18, 30] },
      { x: -6, z: 30, ch: 0.45, look: [-6, 12], fov: 48, e: [0, 7, 4], atk: 0.15, s: [20, 6, 10, -30], s2: [-24, 12, 10, 25], lantern: [0, 1.5, 0, 18, 30] },
      { x: -6, z: 30, ch: 0.4, look: [-10, 12], fov: 46, e: [0, 6.6, 4], lunge: true, s: [24, 5, 10, -40], s2: null, lantern: [0, 1.5, 0, 18, 30] },
    ],
    async stills(page, shoot) {
      for (const [i, s] of this.shots.entries()) {
        await page.evaluate((s) => window.__poster.take(s), s);
        await shoot(`c${i}`, 0.8, 8);
      }
    },
    clip: [
      // the chase: everybody runs at the camera, which dollies back with them along a path clear of every prop (checked
      // against shared/map.js); EXE's head stays in the eclipse
      { at: 0, run: (p) => p.evaluate(() => window.__poster.take({ x: -8, z: 26, speed: 5.5, ch: 0.5, look: [-8, 11], fov: 48, e: [0, 7.4, 7], atk: 0.12, s: [18, 5, 9, -10], s2: [-20, 9, 9, 15], lantern: [0, 1.5, 0, 18, 30] })) },
      // the catch: the camera stops, Bolt runs past it and EXE walks right up to the lens
      { at: 4.3, run: (p) => p.evaluate(() => window.__poster.take({ x: -6, z: 30, speed: 0, ch: 0.45, look: [-6, 12], fov: 46, e: [0, 9, 6], eMove: [9, 3.7, 4], atk: 0.12, s: [26, 4.2, 10, -45], s2: null, lantern: [0, 1.5, 0, 18, 30] })) },
    ],
    poster: {
      title: ['HORROR', '~.EXE'], tag: "Find the shards · don't get caught", accent: '#ff2a3a', accent2: '#ff9a3d', glitch: true,
    },
  },
};

// ---------------------------------------------------------------- composition (poster.html settings per game)
// Framing (zoom, focus, subject: where the action is in the frame) fits the frames picked for the posters in the repo,
// named on each line; another frame wants its own (--card-cfg / --hero-cfg override any of these). Copy sits at the left,
// above the card's live-status pill; the banner has no copy (the home page writes the title over its left side).
const COPY = { copy: { left: 0.05, bottom: 0.3 }, titleSize: 132, tagSize: 30 };
const LOOK = {
  'bing-ball': {
    // card + hero: card-c0-039.jpg (the Fake Volley, the ball up on his foot, its arc and his afterimages behind him)
    card: { ...COPY, grade: 'contrast(1.1) saturate(1.18) brightness(1.03)', zoom: 1.25, focus: [0, 0.65], subject: [0.53, 0.64],
      speed: { amount: 0.025, keep: 0.3 }, vignette: 0.6, scrim: { side: 'left', a: 0.72, reach: 0.62 },
      shade: [{ color: 'rgba(20, 60, 140, 0.55)', at: 'all' }],
      light: [{ color: 'rgba(61, 224, 255, 0.3)', at: 'subject', r: 0.3 }, { color: 'rgba(198, 255, 61, 0.2)', at: [0.06, 0.95], r: 0.45 }] },
    hero: { grade: 'contrast(1.1) saturate(1.18) brightness(1.03)', zoom: 1, focus: [0.5, 1], subject: [0.53, 0.64],
      speed: { amount: 0.02, keep: 0.25 }, vignette: 0.45, shade: [{ color: 'rgba(20, 60, 140, 0.55)', at: 'all' }],
      light: [{ color: 'rgba(61, 224, 255, 0.3)', at: 'subject', r: 0.22 }] },
  },
  'close-call': {
    // card + hero: hero-c0a-030.jpg (threading between a sedan and a box truck on nitro)
    card: { ...COPY, grade: 'contrast(1.12) saturate(1.2) brightness(1.04) hue-rotate(-8deg)', zoom: 1.12, focus: [0.6, 0.35], subject: [0.64, 0.5],
      speed: { amount: 0.035, keep: 0.34 }, vignette: 0.62, scrim: { side: 'left', a: 0.7, reach: 0.6 },
      shade: [{ color: 'rgba(0, 70, 110, 0.6)', at: 'all' }],
      light: [{ color: 'rgba(255, 176, 32, 0.25)', at: 'subject', r: 0.28 }, { color: 'rgba(61, 224, 255, 0.16)', at: [0.62, 0.85], r: 0.25 }] },
    hero: { grade: 'contrast(1.12) saturate(1.2) brightness(1.04) hue-rotate(-8deg)', zoom: 1, focus: [0.5, 0.5], subject: [0.64, 0.5],
      speed: { amount: 0.03, keep: 0.26 }, vignette: 0.45, shade: [{ color: 'rgba(0, 70, 110, 0.6)', at: 'all' }],
      light: [{ color: 'rgba(255, 176, 32, 0.22)', at: 'subject', r: 0.2 }] },
  },
  'horror-exe': {
    // card: card-c1-003.jpg, hero: hero-c1-003.jpg (EXE in the eclipse, Bolt running from him)
    card: { ...COPY, titleSize: 118, tagSize: 26, grade: 'contrast(1.18) saturate(1.1) brightness(1.18)', zoom: 1.08, focus: [0.62, 0.45], subject: [0.5, 0.3],
      vignette: 0.7, scrim: { side: 'left', a: 0.75, reach: 0.58 }, grain: 0.12,
      shade: [{ color: 'rgba(255, 90, 40, 0.35)', at: 'subject', r: 0.3 }], light: [{ color: 'rgba(255, 60, 30, 0.28)', at: 'subject', r: 0.18 }] },
    hero: { grade: 'contrast(1.18) saturate(1.1) brightness(1.18)', zoom: 1.02, focus: [0.6, 0.42], subject: [0.55, 0.32], vignette: 0.55, grain: 0.1,
      shade: [{ color: 'rgba(255, 90, 40, 0.35)', at: 'subject', r: 0.22 }], light: [{ color: 'rgba(255, 60, 30, 0.25)', at: 'subject', r: 0.14 }] },
  },
};

// ---------------------------------------------------------------- plumbing
function args() {
  const [cmd, game, ...rest] = process.argv.slice(2);
  const o = { cmd, game };
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) o[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') ? true : rest[++i];
  o.out = path.resolve(o.out || process.env.POSTERS_OUT || path.join(os.tmpdir(), 'fp-posters'));
  return o;
}

async function puppeteer() {
  for (const base of [process.env.PUPPETEER_DIR, process.cwd(), ROOT].filter(Boolean)) {
    try {
      const file = createRequire(path.join(path.resolve(base), 'x.js')).resolve('puppeteer-core');
      return (await import(pathToFileURL(file).href)).default;
    } catch { /* next */ }
  }
  throw new Error('puppeteer-core not found. `npm i puppeteer-core` in a scratch folder and run with PUPPETEER_DIR=<that folder>.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
/** The repo, served on 127.0.0.1 at a free port (the games load ES modules, so file:// will not do). */
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* 404 below */ }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

async function browser(w, h, dpr) {
  const pptr = await puppeteer();
  const b = await pptr.launch({
    executablePath: CHROME, headless: true, defaultViewport: { width: w, height: h, deviceScaleFactor: dpr },
    // the real GPU (SwiftShader looks and runs far worse); muted; no gesture needed for audio
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${w},${h}`],
  });
  const pid = b.process()?.pid;
  const kill = () => { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } };
  process.once('exit', kill);
  // (browser.close() can hang with recent Chrome: give it 3 s, then kill the process we started)
  return { b, close: async () => { await Promise.race([b.close().catch(() => {}), sleep(3000)]); kill(); } };
}

/** Runs the CDP screencast (JPEG frames as the page draws them) for `seconds` while `timeline` runs. */
async function screencast(page, seconds, timeline = [], quality = 92) {
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const vp = page.viewport();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1, maxWidth: Math.round(vp.width * vp.deviceScaleFactor), maxHeight: Math.round(vp.height * vp.deviceScaleFactor) });
  const t0 = Date.now();
  await Promise.all(timeline.map(async (s) => {
    await sleep(s.at * 1000);
    if (s.key) await page.keyboard.press(s.key);
    if (s.run) await s.run(page);
  }));
  await sleep(Math.max(0, seconds * 1000 - (Date.now() - t0)));
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  await cdp.detach().catch(() => {});
  return frames;
}

/** Records the page for `seconds` while `timeline` runs; writes clip/NNNNN.jpg + clip.ffconcat (each frame's real duration). */
async function record(page, dir, seconds, timeline) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d+\.jpg$|\.ffconcat$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const frames = await screencast(page, seconds, timeline);
  let list = 'ffconcat version 1.0\n';
  frames.forEach((f, i) => {
    const name = String(i).padStart(5, '0') + '.jpg';
    fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1];
    list += `file '${name}'\nduration ${(next ? next.t - f.t : 1 / 30).toFixed(4)}\n`;
  });
  if (frames.length) list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(dir, 'clip.ffconcat'), list);
  const span = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;
  return { frames: frames.length, seconds: span, fps: frames.length / Math.max(span, 1e-3) };
}

async function openGame(id, w, h, dpr) {
  const g = GAMES[id];
  const srv = await serve();
  const br = await browser(w, h, dpr);
  const page = await br.b.newPage();
  page.on('pageerror', (e) => console.log(`  [${id}] page error: ${e.message}`));
  if (process.env.POSTERS_DEBUG) page.on('console', (m) => console.log(`  [${id}] ${m.text()}`));
  if (g.prepare) await g.prepare(page);
  await page.goto(g.url(srv.base), { waitUntil: 'load', timeout: 120000 });
  await page.bringToFront();      // (background tabs get no animation frames)
  await g.ready(page);
  return { page, close: async () => { await br.close(); srv.close(); } };
}

// ---------------------------------------------------------------- commands
async function shoot(id, out) {
  const g = GAMES[id], dir = path.join(out, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^(card|hero)-.*\.(jpg|png)$/.test(f)) fs.unlinkSync(path.join(dir, f));
  // card (1280x720) and hero (1920x820) bursts, rendered at 1.5x so the posters are downscaled, not upscaled
  const sizes = [['card', 1280, 720], ['hero', 1280, 547]];
  const { page, close } = await openGame(id, 1280, 720, 1.5);
  try {
    for (const [kind, w, h] of sizes) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1.5 });
      await sleep(700);
      // a burst: `seconds` of screencast, every `every`-th frame kept (JPEG 95)
      const burst = async (tag, seconds, every = 1) => {
        const frames = await screencast(page, seconds, [], 95);
        frames.filter((f, i) => i % every === 0).forEach((f, i) => fs.writeFileSync(path.join(dir, `${kind}-${tag}-${String(i).padStart(3, '0')}.jpg`), Buffer.from(f.data, 'base64')));
      };
      await g.stills(page, burst);
      console.log(`  ${id}: ${kind} bursts in ${dir}`);
    }
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await sleep(700);
    const r = await record(page, path.join(dir, 'clip'), 8.6, g.clip);
    console.log(`  ${id}: clip ${r.frames} frames, ${r.seconds.toFixed(2)} s, ${r.fps.toFixed(1)} fps`);
  } finally { await close(); }
}

async function poster(id, o) {
  if (!o.card || !o.hero) throw new Error('poster needs --card FILE and --hero FILE (frames from `shoot`)');
  const g = GAMES[id], look = LOOK[id];
  const srv = await serve();
  const br = await browser(1280, 720, 1);
  try {
    const page = await br.b.newPage();
    await page.goto(`${srv.base}/tools/posters/poster.html`, { waitUntil: 'load' });
    const jobs = [
      { file: `assets/${id}.jpg`, w: 1280, h: 720, src: o.card, cfg: { ...g.poster, ...look.card, ...JSON.parse(o['card-cfg'] || '{}') } },
      // the banner has no lettering: the home page sets the game's title over it
      { file: `assets/${id}-hero.jpg`, w: 1920, h: 820, src: o.hero, cfg: { ...look.hero, accent: g.poster.accent, accent2: g.poster.accent2, title: null, ...JSON.parse(o['hero-cfg'] || '{}') } },
    ];
    for (const j of jobs) {
      await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 });
      const src = `data:image/${/\.png$/i.test(j.src) ? 'png' : 'jpeg'};base64,` + fs.readFileSync(path.resolve(j.src)).toString('base64');
      await page.evaluate((cfg) => window.renderPoster(cfg), { ...j.cfg, w: j.w, h: j.h, src });
      const target = path.join(ROOT, j.file);
      // as good a JPEG as fits under 340 KB
      for (let q = 90; q >= 60; q -= 4) {
        await page.screenshot({ path: target, type: 'jpeg', quality: q, clip: { x: 0, y: 0, width: j.w, height: j.h } });
        if (fs.statSync(target).size < 340 * 1024) break;
      }
      console.log(`  ${j.file}: ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);
    }
  } finally { await br.close(); srv.close(); }
}

function preview(id, out) {
  const dir = path.join(out, id, 'clip'), list = path.join(dir, 'clip.ffconcat');
  if (!fs.existsSync(list)) throw new Error(`no clip in ${dir}: run shoot first`);
  const target = path.join(ROOT, `assets/${id}.webm`), log = path.join(dir, 'vp9');
  // a touch of grade (contrast, saturation, vignette) so the preview matches the poster it plays over
  const vf = 'fps=30,scale=640:360:flags=lanczos,eq=contrast=1.06:saturation=1.12,vignette=angle=PI/5';
  const common = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-t', '8', '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '900k', '-an', '-pix_fmt', 'yuv420p', '-row-mt', '1', '-g', '240', '-passlogfile', log];
  for (const [pass, dest] of [['1', '/dev/null'], ['2', target]]) {
    const r = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-loglevel', 'error', ...common, '-pass', pass, '-deadline', 'good', '-cpu-used', pass === '1' ? '4' : '1', ...(pass === '1' ? ['-f', 'webm'] : []), dest], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('ffmpeg failed');
  }
  for (const f of fs.readdirSync(dir)) if (f.startsWith('vp9')) fs.unlinkSync(path.join(dir, f));
  console.log(`  assets/${id}.webm: ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);
}

const o = args();
if (!['shoot', 'poster', 'preview'].includes(o.cmd) || !GAMES[o.game]) {
  console.log(`usage: node tools/posters/capture.mjs <shoot|poster|preview> <${Object.keys(GAMES).join('|')}> [--out DIR] [--card FILE --hero FILE]`);
  process.exit(1);
}
try {
  if (o.cmd === 'shoot') await shoot(o.game, o.out);
  if (o.cmd === 'poster') await poster(o.game, o);
  if (o.cmd === 'preview') preview(o.game, o.out);
} catch (e) { console.error(e.message); process.exitCode = 1; }
process.exit();
