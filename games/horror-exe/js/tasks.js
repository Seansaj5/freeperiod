// Task minigames (like a crew game's task panels): walk up to a task, press F (USE on touch), and a little
// 16-bit window opens. You can't move while it's open, so EXE can sneak up on you: getting hit closes it.
// One game per zone task:
//   shards  CATCH THE SPARK   stop the spinning spark inside the gold zone, 3 times
//   valves  TURN THE VALVE    spin the wheel round and round (drag in circles, or tap A and D)
//   panels  REWIRE            join each wire on the left to the same color on the right
//   bells   BELL ORDER        watch the bells ring, then ring them back in the same order
//   core    CHIP THE ICE      smash the cracks to free the fire core
// The server only accepts a finish after the minigame's shortest possible time (rules.js TASK_MIN).
const $ = (id) => document.getElementById(id);
const W = 320, H = 200;
const TITLES = { shards: 'SHARD.EXE', valves: 'VALVE.EXE', panels: 'REWIRE.EXE', bells: 'BELLS.EXE', core: 'ICE.EXE' };
const NAMES = { shards: 'CATCH THE SPARK', valves: 'TURN THE VALVE', panels: 'REWIRE THE PANEL', bells: 'BELL ORDER', core: 'CHIP THE ICE' };
const WIRE = ['#ff3b5c', '#3aa8ff', '#ffd23d', '#57e05a'];
const BELL = ['#ff6a3d', '#ffd23d', '#8af06a', '#6ac8ff'];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

function px(g, text, x, y, size = 8, color = '#fff', align = 'center') {
  g.font = `${size}px 'Press Start 2P', monospace`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = '#000'; g.fillText(text, x + 1, y + 1); g.fillStyle = color; g.fillText(text, x, y);
}

/**
 * Opens a task window. opts: { fast (Pip's Turbo: shorter), play(sound, vol), onDone(), onCancel(), corrupted }.
 * Returns the minigame: { task: true, kind, tick(), close(why) }.
 */
export function openTask(kind, opts = {}) {
  const el = $('task'), cv = $('taskCv'), g = cv.getContext('2d');
  const play = opts.play || (() => {});
  cv.width = W; cv.height = H;
  $('taskWin').dataset.title = TITLES[kind] || 'TASK.EXE';
  $('taskName').textContent = NAMES[kind] || 'TASK';
  el.classList.remove('hidden', 'ok', 'bad'); el.classList.toggle('w1', !!opts.corrupted);
  const m = { task: true, kind, done: false, t0: performance.now() / 1000, prog: 0 };
  const now = () => performance.now() / 1000 - m.t0;
  const hint = (s) => { $('taskHint').textContent = s; };
  const bar = (k) => { m.prog = k; $('taskBar').style.width = `${Math.round(k * 100)}%`; };
  bar(0);
  let ptr = null; // { x, y, down } in canvas pixels
  const toCv = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };

  const game = GAMES[kind](g, { fast: !!opts.fast, play, hint, bar, now, win: () => finish() });
  const finish = () => {
    if (m.done) return;
    m.done = true; bar(1);
    el.classList.add('ok'); play('task');
    setTimeout(() => { cleanup(); opts.onDone && opts.onDone(); }, 380);
  };
  const onDown = (e) => { e.preventDefault(); ptr = { ...toCv(e), down: true }; cv.setPointerCapture?.(e.pointerId); if (!m.done) game.down && game.down(ptr); };
  const onMove = (e) => { const p = toCv(e); ptr = { ...p, down: ptr ? ptr.down : false }; if (!m.done && game.move) game.move(ptr); };
  const onUp = (e) => { if (ptr) ptr.down = false; if (!m.done && game.up) game.up(ptr || toCv(e)); };
  const onKey = (e) => {
    if (e.repeat && e.code !== 'KeyA' && e.code !== 'KeyD') return;
    if (e.code === 'Escape' || e.code === 'KeyF') { e.preventDefault(); e.stopPropagation(); m.close('cancel'); return; }
    if (!m.done && game.key && game.key(e.code)) { e.preventDefault(); e.stopPropagation(); }
  };
  const onX = () => m.close('cancel');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('keydown', onKey, true);
  $('taskX').addEventListener('click', onX);
  function cleanup() {
    el.classList.add('hidden');
    cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp); removeEventListener('keydown', onKey, true);
    $('taskX').removeEventListener('click', onX);
  }
  m.tick = () => {
    if (m.closed) return;
    const t = now();
    g.imageSmoothingEnabled = false;
    game.draw(t, ptr);
    if (m.done) { g.fillStyle = 'rgba(40, 255, 120, 0.18)'; g.fillRect(0, 0, W, H); px(g, 'TASK DONE!', W / 2, H / 2, 14, '#7dffb0'); }
  };
  /** why: 'cancel' (closed it), 'hit' / 'left' / 'done' (someone else finished it) / 'gone' (round over). */
  m.close = (why = 'cancel') => {
    if (m.closed) return;
    m.closed = true;
    if (why === 'hit' || why === 'left') { el.classList.add('bad'); play('denied'); setTimeout(cleanup, 260); } else cleanup();
    if (!m.done && opts.onCancel) opts.onCancel(why);
    m.done = true;
  };
  m.win = () => finish(); // test hook
  m.tick();
  return m;
}

// ------------------------------------------------------------------ the five games
const GAMES = {
  /** Stop the spark in the gold zone. A miss knocks your progress back one. */
  shards(g, k) {
    const need = k.fast ? 2 : 3;
    let hits = 0, ang = Math.random() * TAU, spd = 3.2, zone = Math.random() * TAU, zw = 0.75, flash = 0, flashOk = false, lock = 0, last = 0;
    k.hint(`Click or press SPACE when the spark is in the gold zone · ${need} times`);
    const stop = () => {
      const t = k.now(); if (t < lock) return;
      const d = Math.abs(((wrap(ang - zone) + Math.PI) % TAU) - Math.PI);
      if (d < zw / 2) {
        hits++; flash = t; flashOk = true; k.play('qtehit'); k.bar(hits / need);
        if (hits >= need) { k.play('shard'); k.win(); return; }
        zone = wrap(zone + Math.PI * (0.6 + Math.random() * 0.8)); spd *= 1.22; zw *= 0.88; lock = t + 0.25;
      } else { hits = Math.max(0, hits - 1); flash = t; flashOk = false; k.play('miss'); k.bar(hits / need); lock = t + 0.45; }
    };
    return {
      down: stop,
      key: (c) => { if (c === 'Space' || c === 'KeyE' || c === 'Enter') { stop(); return true; } return false; },
      draw(t) {
        const dt = Math.min(0.05, t - last); last = t;
        if (t >= lock) ang = wrap(ang + spd * dt);
        g.fillStyle = '#0b1830'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? '#1d3a66' : '#2c5b9a'; g.fillRect((i * 53) % W, (i * 37 + Math.floor(t * 8)) % H, 2, 2); }
        const cx = W / 2, cy = H / 2 + 4, R = 70;
        g.lineWidth = 10; g.strokeStyle = '#13294d'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
        g.strokeStyle = '#ffd23d'; g.beginPath(); g.arc(cx, cy, R, zone - zw / 2, zone + zw / 2); g.stroke();
        g.lineWidth = 2; g.strokeStyle = '#fff6b0'; g.beginPath(); g.arc(cx, cy, R + 7, zone - zw / 2, zone + zw / 2); g.stroke();
        // the shard in the middle grows with each catch
        const s = 22 + hits * 6, glow = 0.5 + 0.5 * Math.sin(t * 5);
        g.fillStyle = `rgba(127, 240, 255, ${0.15 + glow * 0.15})`; g.beginPath(); g.arc(cx, cy, s + 14, 0, TAU); g.fill();
        g.fillStyle = '#7ff0ff'; g.beginPath(); g.moveTo(cx, cy - s * 1.3); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx, cy + s * 1.3); g.lineTo(cx - s * 0.7, cy); g.closePath(); g.fill();
        g.fillStyle = '#e8ffff'; g.beginPath(); g.moveTo(cx, cy - s * 1.3); g.lineTo(cx + s * 0.25, cy); g.lineTo(cx, cy + s * 0.5); g.closePath(); g.fill();
        // the spark
        const sx = cx + Math.cos(ang) * R, sy = cy + Math.sin(ang) * R;
        for (let i = 1; i < 6; i++) { const a = ang - i * 0.07 * Math.sign(spd); g.fillStyle = `rgba(255, 255, 255, ${0.5 - i * 0.08})`; g.fillRect(cx + Math.cos(a) * R - 3, cy + Math.sin(a) * R - 3, 6, 6); }
        g.fillStyle = '#fff'; g.fillRect(sx - 5, sy - 5, 10, 10); g.fillStyle = '#7ff0ff'; g.fillRect(sx - 2, sy - 2, 4, 4);
        for (let i = 0; i < need; i++) { g.fillStyle = i < hits ? '#7ff0ff' : '#203a60'; g.fillRect(cx - need * 9 + i * 18 + 2, 12, 14, 8); }
        if (t - flash < 0.3) { g.fillStyle = flashOk ? 'rgba(127,240,255,0.25)' : 'rgba(255,40,60,0.3)'; g.fillRect(0, 0, W, H); }
      },
    };
  },

  /** Spin the wheel: drag around it (either way) or tap A and D one after the other. */
  valves(g, k) {
    const need = (k.fast ? 1.25 : 2.2) * TAU;
    let turned = 0, ang = 0, prevA = null, lastKey = '', last = 0, steam = [], push = 0;
    const cx = 120, cy = 104, R = 62;
    k.hint('Drag around the wheel to turn it (or tap A and D, one after the other)');
    const add = (d) => {
      const before = Math.floor(turned / (TAU / 6));
      turned = Math.min(need, turned + Math.abs(d)); ang += Math.abs(d); push = 1;
      if (Math.floor(turned / (TAU / 6)) !== before) k.play('valve', 0.5);
      k.bar(turned / need);
      if (turned >= need) { k.play('steam'); k.win(); }
    };
    return {
      down(p) { prevA = Math.atan2(p.y - cy, p.x - cx); },
      move(p) {
        if (!p.down) { prevA = null; return; }
        const a = Math.atan2(p.y - cy, p.x - cx);
        if (prevA !== null && Math.hypot(p.x - cx, p.y - cy) > 14) { let d = a - prevA; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; if (Math.abs(d) < 1.2) add(d); }
        prevA = a;
      },
      up() { prevA = null; },
      key(c) {
        if (c === 'KeyA' || c === 'KeyD' || c === 'ArrowLeft' || c === 'ArrowRight') { const s = c === 'KeyA' || c === 'ArrowLeft' ? 'L' : 'R'; if (s !== lastKey) add(0.42); lastKey = s; return true; }
        return false;
      },
      draw(t) {
        const dt = Math.min(0.05, t - last); last = t; push = Math.max(0, push - dt * 3);
        g.fillStyle = '#10200c'; g.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 8) { g.fillStyle = y % 16 ? '#14280f' : '#182f12'; g.fillRect(0, y, W, 4); }
        // pipe
        g.fillStyle = '#4c5a46'; g.fillRect(0, cy - 12, W, 24); g.fillStyle = '#6b7a62'; g.fillRect(0, cy - 12, W, 4);
        g.fillStyle = '#39452f'; for (let x = 20; x < W; x += 60) g.fillRect(x, cy - 16, 8, 32);
        // wheel
        g.save(); g.translate(cx, cy); g.rotate(ang);
        g.lineWidth = 12; g.strokeStyle = '#c92a2a'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
        g.lineWidth = 3; g.strokeStyle = '#ff6b5e'; g.beginPath(); g.arc(0, 0, R + 3, -2.6, -1.2); g.stroke();
        g.fillStyle = '#a61e1e'; for (let i = 0; i < 6; i++) { g.save(); g.rotate((i * TAU) / 6); g.fillRect(-4, 0, 8, R - 4); g.restore(); }
        for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; g.fillStyle = '#ff8a7a'; g.fillRect(Math.cos(a) * R - 4, Math.sin(a) * R - 4, 8, 8); }
        g.fillStyle = '#ddd'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); g.fillStyle = '#888'; g.fillRect(-4, -4, 8, 8);
        g.restore();
        // pressure gauge drops as it turns
        const gx = 262, gy = 66, k01 = turned / need;
        g.fillStyle = '#e8e2c8'; g.beginPath(); g.arc(gx, gy, 32, 0, TAU); g.fill(); g.lineWidth = 4; g.strokeStyle = '#333'; g.stroke();
        g.lineWidth = 6; g.strokeStyle = '#e03030'; g.beginPath(); g.arc(gx, gy, 24, -0.4, 0.75); g.stroke(); g.strokeStyle = '#3ac040'; g.beginPath(); g.arc(gx, gy, 24, Math.PI + 0.4, Math.PI + 1.6); g.stroke();
        const na = 0.6 - k01 * 2.6 + Math.sin(t * 30) * 0.04 * (1 - k01);
        g.lineWidth = 3; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(na) * 26, gy + Math.sin(na) * 26); g.stroke();
        px(g, k01 > 0.95 ? 'SAFE' : 'PRESSURE', gx, gy + 46, 7, k01 > 0.95 ? '#7dff7d' : '#ff8a7a');
        // goo steam from the pipe while it's turning
        if (push > 0.5 && Math.random() < 0.5) steam.push({ x: 300, y: cy - 10, vx: -10 - Math.random() * 20, vy: -20 - Math.random() * 20, life: 1 });
        steam = steam.filter((s) => (s.life -= dt) > 0);
        for (const s of steam) { s.x += s.vx * dt; s.y += s.vy * dt; g.fillStyle = `rgba(160, 255, 90, ${s.life * 0.5})`; g.fillRect(s.x, s.y, 6, 6); }
        g.fillStyle = '#203a18'; g.fillRect(16, H - 22, 200, 10); g.fillStyle = '#9dff5a'; g.fillRect(16, H - 22, 200 * k01, 10);
        px(g, `${Math.floor(k01 * 100)}%`, 232, H - 17, 7, '#c8ffb0', 'left');
      },
    };
  },

  /** Join each colored wire on the left to its color on the right (drag, or click one end then the other). */
  panels(g, k) {
    const n = k.fast ? 3 : 4;
    const cols = shuffle(WIRE.slice()).slice(0, n), right = shuffle(cols.map((_, i) => i));
    const yAt = (i) => 40 + i * (130 / (n - 1 || 1));
    const L = cols.map((c, i) => ({ c, x: 34, y: yAt(i), done: false }));
    const R = right.map((ci, i) => ({ ci, x: W - 34, y: yAt(i) }));
    let drag = -1, pick = -1, sparks = [], last = 0;
    k.hint('Drag each wire to the same color (or click one end, then the other)');
    const near = (list, p) => list.findIndex((o) => Math.hypot(o.x - p.x, o.y - p.y) < 20);
    const tryJoin = (li, p) => {
      const ri = near(R, p);
      if (ri < 0) return false;
      if (R[ri].ci === li && !L[li].done) {
        L[li].done = true; k.play('panel');
        for (let i = 0; i < 10; i++) sparks.push({ x: R[ri].x, y: R[ri].y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.7) * 120, life: 0.5 });
        const got = L.filter((w) => w.done).length; k.bar(got / n);
        if (got >= n) k.win();
        return true;
      }
      k.play('miss'); return true;
    };
    return {
      down(p) {
        const li = near(L, p);
        if (li >= 0 && !L[li].done) { drag = li; pick = li; return; }
        if (pick >= 0 && tryJoin(pick, p)) { pick = -1; }
      },
      up(p) { if (drag >= 0) { if (Math.hypot(p.x - L[drag].x, p.y - L[drag].y) > 24 && tryJoin(drag, p)) pick = -1; drag = -1; } },
      key(c) {
        const d = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[c];
        if (d === undefined || d >= n) return false;
        if (pick < 0) { if (!L[d].done) pick = d; } else { tryJoin(pick, R[d]); pick = -1; }
        return true;
      },
      draw(t, ptr) {
        const dt = Math.min(0.05, t - last); last = t;
        g.fillStyle = '#12051f'; g.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 16) { g.fillStyle = '#1d0a33'; g.fillRect(x, 0, 1, H); }
        for (let y = 0; y < H; y += 16) { g.fillStyle = '#1d0a33'; g.fillRect(0, y, W, 1); }
        g.fillStyle = '#2b1048'; g.fillRect(0, 0, 50, H); g.fillRect(W - 50, 0, 50, H);
        const wire = (x0, y0, x1, y1, c, w = 7) => {
          g.lineCap = 'round'; g.lineWidth = w + 4; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1); g.stroke();
          g.lineWidth = w; g.strokeStyle = c; g.stroke(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke();
        };
        L.forEach((w, i) => { if (w.done) { const r = R.find((o) => o.ci === i); wire(w.x, w.y, r.x, r.y, w.c); } });
        if (drag >= 0 && ptr) wire(L[drag].x, L[drag].y, ptr.x, ptr.y, L[drag].c);
        else if (pick >= 0 && ptr) { g.setLineDash([4, 4]); g.lineWidth = 2; g.strokeStyle = L[pick].c; g.beginPath(); g.moveTo(L[pick].x, L[pick].y); g.lineTo(ptr.x, ptr.y); g.stroke(); g.setLineDash([]); }
        L.forEach((w, i) => {
          g.fillStyle = '#444'; g.fillRect(4, w.y - 9, 26, 18); g.fillStyle = w.c; g.fillRect(8, w.y - 6, 18, 12);
          g.fillStyle = pick === i || drag === i ? '#fff' : w.c; g.fillRect(w.x - 7, w.y - 7, 14, 14);
          px(g, String(i + 1), 17, w.y, 7, '#000');
        });
        R.forEach((r, i) => {
          const c = cols[r.ci], lit = L[r.ci].done, blink = lit || Math.sin(t * 6 + i) > 0;
          g.fillStyle = '#444'; g.fillRect(W - 30, r.y - 9, 26, 18); g.fillStyle = blink ? c : '#222'; g.fillRect(W - 26, r.y - 6, 18, 12);
          g.fillStyle = '#111'; g.fillRect(r.x - 7, r.y - 7, 14, 14); g.fillStyle = c; g.fillRect(r.x - 4, r.y - 4, 8, 8);
          px(g, String(i + 1), W - 17, r.y, 7, '#000');
        });
        sparks = sparks.filter((s) => (s.life -= dt) > 0);
        for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; g.fillStyle = '#fff6a0'; g.fillRect(s.x, s.y, 3, 3); }
        px(g, 'NEON JACKPOT · CIRCUIT B', W / 2, 14, 7, '#ff8af0');
      },
    };
  },

  /** Watch, then ring the bells back in order (click them or press 1-4). A mistake plays a new tune. */
  bells(g, k) {
    const len = k.fast ? 3 : 4, n = 4;
    let seq = [], step = 0, show = 0, showT = 0, lit = -1, litT = 0, wrong = -9;
    const bx = (i) => 52 + i * 72, by = 112;
    const newTune = (t) => { seq = Array.from({ length: len }, () => Math.floor(Math.random() * n)); step = 0; show = 0; showT = t + 0.7; };
    newTune(0);
    k.hint('Watch the bells, then ring them in the same order (click them or press 1-4)');
    const ring = (i) => {
      const t = k.now();
      if (show < seq.length) return; // still showing the tune
      lit = i; litT = t; k.play('tone' + i);
      if (seq[step] === i) { step++; k.bar(step / len); if (step >= len) k.win(); }
      else { wrong = t; k.play('denied'); k.bar(0); newTune(t + 0.4); }
    };
    return {
      down(p) { for (let i = 0; i < n; i++) if (Math.abs(p.x - bx(i)) < 30 && Math.abs(p.y - by) < 44) ring(i); },
      key(c) { const d = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[c]; if (d === undefined) return false; ring(d); return true; },
      draw(t) {
        if (show < seq.length && t >= showT) { lit = seq[show]; litT = t; k.play('tone' + seq[show]); show++; showT = t + 0.62; }
        g.fillStyle = '#1a0606'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(255, ${80 + (i % 3) * 40}, 30, ${0.3 + 0.2 * Math.sin(t * 3 + i)})`; g.fillRect((i * 41) % W, H - ((t * 30 + i * 23) % H), 2, 3); }
        g.fillStyle = '#3a1410'; g.fillRect(20, 50, W - 40, 8);
        for (let i = 0; i < n; i++) {
          const on = lit === i && t - litT < 0.4, sw = on ? Math.sin((t - litT) * 30) * 0.25 : 0;
          g.save(); g.translate(bx(i), 58); g.rotate(sw);
          g.fillStyle = '#5a2a1a'; g.fillRect(-2, 0, 4, 18);
          g.fillStyle = on ? '#fff' : BELL[i];
          g.beginPath(); g.moveTo(-14, 22); g.quadraticCurveTo(-16, 56, -30, 74); g.lineTo(30, 74); g.quadraticCurveTo(16, 56, 14, 22); g.closePath(); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-30, 68, 60, 6);
          g.fillStyle = '#2a1008'; g.fillRect(-4, 74, 8, 8);
          g.restore();
          if (on) { g.strokeStyle = BELL[i]; g.lineWidth = 2; for (let r = 0; r < 2; r++) { g.beginPath(); g.arc(bx(i), 100, 30 + (t - litT) * 80 + r * 10, -2.6, -0.5); g.stroke(); } }
          px(g, String(i + 1), bx(i), 168, 9, '#ffcf9a');
        }
        const msg = t - wrong < 1 ? 'WRONG BELL · LISTEN AGAIN' : show < seq.length ? 'LISTEN…' : 'YOUR TURN';
        px(g, msg, W / 2, 20, 8, t - wrong < 1 ? '#ff5a5a' : '#ffd8a0');
        for (let i = 0; i < len; i++) { g.fillStyle = i < step ? '#ffd23d' : '#4a1c12'; g.fillRect(W / 2 - len * 8 + i * 16 + 2, 32, 12, 6); }
      },
    };
  },

  /** Smash the glowing cracks before they freeze over (click them, or mash SPACE for slower chips). */
  core(g, k) {
    const need = k.fast ? 4 : 6;
    let hits = 0, crack = null, nextAt = 0.3, chips = [], last = 0, shake = 0, mash = 0;
    k.hint('Click the glowing cracks to chip the ice (or mash SPACE)');
    const spawn = (t) => { crack = { x: 110 + Math.random() * 100, y: 50 + Math.random() * 100, at: t, life: 1.25 - hits * 0.05 }; };
    const chip = (x, y) => {
      hits++; shake = 0.15; k.play('punch', 0.5); k.bar(hits / need);
      for (let i = 0; i < 12; i++) chips.push({ x, y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 160, life: 0.7 });
      crack = null; nextAt = k.now() + 0.2;
      if (hits >= need) { k.play('core'); k.win(); }
    };
    return {
      down(p) { if (crack && Math.hypot(p.x - crack.x, p.y - crack.y) < 22) chip(crack.x, crack.y); else k.play('miss', 0.4); },
      key(c) { if (c !== 'Space' && c !== 'KeyE') return false; mash++; k.play('click'); if (mash >= 3) { mash = 0; chip(160, 100); } return true; },
      draw(t) {
        const dt = Math.min(0.05, t - last); last = t; shake = Math.max(0, shake - dt);
        if (!crack && t >= nextAt && hits < need) spawn(t);
        if (crack && t - crack.at > crack.life) { crack = null; nextAt = t + 0.25; }
        g.save(); g.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
        g.fillStyle = '#081420'; g.fillRect(-10, -10, W + 20, H + 20);
        for (let i = 0; i < 30; i++) { g.fillStyle = '#cfefff'; g.fillRect((i * 61 + t * 20 * (1 + (i % 3))) % W, (i * 29 + t * 40) % H, 2, 2); }
        // the fire core inside the ice: shows through more as the ice breaks
        const k01 = hits / need, cx = 160, cy = 100;
        g.fillStyle = `rgba(255, 120, 30, ${0.25 + k01 * 0.5})`; g.beginPath(); g.arc(cx, cy, 30 + k01 * 10 + Math.sin(t * 8) * 3, 0, TAU); g.fill();
        g.fillStyle = '#ffb03a'; g.beginPath(); g.arc(cx, cy, 18, 0, TAU); g.fill(); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(cx - 4, cy - 4, 7, 0, TAU); g.fill();
        g.fillStyle = `rgba(170, 225, 255, ${0.85 - k01 * 0.6})`;
        g.beginPath(); g.moveTo(cx - 70, cy - 60); g.lineTo(cx + 60, cy - 72); g.lineTo(cx + 78, cy + 50); g.lineTo(cx - 20, cy + 76); g.lineTo(cx - 80, cy + 30); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
        for (let i = 0; i < hits; i++) { const a = i * 1.7; g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 50); g.lineTo(cx + Math.cos(a + 0.3) * 75, cy + Math.sin(a + 0.3) * 62); g.stroke(); }
        if (crack) {
          const life = 1 - (t - crack.at) / crack.life, pulse = 0.6 + 0.4 * Math.sin(t * 20);
          g.fillStyle = `rgba(255, 200, 80, ${0.35 * pulse})`; g.beginPath(); g.arc(crack.x, crack.y, 22, 0, TAU); g.fill();
          g.strokeStyle = '#ffe08a'; g.lineWidth = 3; g.beginPath(); g.moveTo(crack.x - 12, crack.y - 8); g.lineTo(crack.x - 2, crack.y + 2); g.lineTo(crack.x + 4, crack.y - 6); g.lineTo(crack.x + 13, crack.y + 9); g.stroke();
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(crack.x, crack.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * life); g.stroke();
        }
        chips = chips.filter((c) => (c.life -= dt) > 0);
        for (const c of chips) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 400 * dt; g.fillStyle = '#e6f7ff'; g.fillRect(c.x, c.y, 4, 4); }
        g.restore();
        for (let i = 0; i < need; i++) { g.fillStyle = i < hits ? '#ffb03a' : '#1c3550'; g.fillRect(W / 2 - need * 8 + i * 16 + 2, 12, 12, 7); }
      },
    };
  },
};
