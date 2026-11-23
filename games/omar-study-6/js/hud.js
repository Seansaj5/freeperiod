// Everything drawn over the game: money, heat, minimap, the phone, shops and the little heist tasks.
import { getCity, landSd } from '../shared/city.js';
import { WEAPONS, VEHICLES, OUTFITS, fmtCash, ARMOR_PRICE } from '../shared/rules.js';
import { HEISTS, HEIST } from '../shared/heists.js';

const $ = (id) => document.getElementById(id);
const X0 = -800, Z0 = -620, MW = 1500, MH = 1200;
const BLOCK = { midtown: '#333b49', downtown: '#2b3444', strip: '#4a4538', hills: '#34493a', industrial: '#34373d', docks: '#30343b', park: '#2f6a3a' };
const ICON = { safehouse: ['H', '#ffffff'], guns: ['G', '#ffb53d'], respray: ['S', '#55b6ff'], store: ['$', '#7dea8d'], dealer: ['C', '#2bd4c4'], hospital: ['+', '#ff6b6b'], police: ['P', '#6aa5ff'], heist: ['!', '#ffd23d'], casino: ['*', '#e0b23a'] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function baseMap() {
  const C = getCity(), c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const g = c.getContext('2d'); g.fillStyle = '#12304e'; g.fillRect(0, 0, MW, MH);
  g.translate(-X0, -Z0);
  g.beginPath();
  for (let k = 0; k <= 240; k++) { const a = (k / 240) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let lo = 300, hi = 1000; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (landSd(-55 + dx * m, -20 + dz * m) < 0) lo = m; else hi = m; } g[k ? 'lineTo' : 'moveTo'](-55 + dx * lo, -20 + dz * lo); }
  g.fillStyle = '#b9a878'; g.fill();
  for (const q of C.grounds) if (q.k === 'grass' || q.k === 'concrete') { g.fillStyle = q.k === 'grass' ? '#3f7a45' : '#4a4e56'; g.fillRect(q.x0, q.z0, q.x1 - q.x0, q.z1 - q.z0); }
  for (const s of C.slabs) { g.fillStyle = BLOCK[s.di] || '#333b49'; g.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0); }
  g.fillStyle = '#8791a1';
  for (const r of C.roads) g.fillRect(r.x0 - 0.5, r.z0 - 0.5, r.x1 - r.x0 + 1, r.z1 - r.z0 + 1);
  for (const x of C.cross) g.fillRect(x.x - x.w / 2, x.z - x.d / 2, x.w, x.d);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (const p of C.pois) g.fillRect(p.rect[0], p.rect[1], p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]);
  return c;
}

export class Hud {
  constructor(G) {
    this.G = G; this.base = baseMap(); this.mm = $('mm').getContext('2d'); this.toastT = 0; this.bigT = 0; this.feedN = 0; this.cashShown = -1; this.open = null; this.page = 'jobs'; this.task = null; this.popT = 0;
    this.city = getCity(); this.mapOpen = false;
    for (const id of ['phone', 'shop']) $(id).addEventListener('click', (e) => { if (e.target.dataset.close !== undefined || e.target === $(id)) this.close(); });
    $('ph-body').addEventListener('click', (e) => this.click(e)); $('sh-body').addEventListener('click', (e) => this.click(e)); $('ph-body').addEventListener('input', (e) => this.input(e));
    $('ph-tabs').addEventListener('click', (e) => { const p = e.target.dataset.p; if (p) { this.page = p; G.sfx.ui(); this.phone(); } });
  }

  // ------------------------------------------------------------------ small readouts
  me(m) {
    if (m.cash !== this.cashShown) { $('cash').textContent = fmtCash(m.cash); this.cashShown = m.cash; }
    $('hp').firstChild.style.width = m.hp + '%'; $('ar').firstChild.style.width = m.ar + '%';
    const h = $('heat'); [...h.querySelectorAll('i')].forEach((el, k) => el.classList.toggle('on', k < m.heat)); h.classList.toggle('hide', m.heat > 0 && m.esc > 0.08);
    this.objective(m.hs);
    if (this.open === 'phone') $('ph-cash').textContent = fmtCash(m.cash); if (this.open === 'shop') $('sh-cash').textContent = fmtCash(m.cash);
  }
  objective(hs) {
    const o = $('obj');
    if (!hs) { o.classList.add('hidden'); return; }
    o.classList.remove('hidden');
    const def = HEIST[hs.h];
    $('obj-h').textContent = def.name.toUpperCase();
    if (hs.st === 'lobby') { $('obj-t').textContent = ''; $('obj-b').textContent = `Waiting for crew: ${hs.crew.length} in, starts in ${Math.ceil(hs.wait)}s`; $('obj-u').style.width = '0%'; return; }
    $('obj-t').textContent = hs.take ? 'TAKE ' + fmtCash(hs.take) : `STEP ${hs.i + 1} OF ${hs.n}`;
    $('obj-b').textContent = hs.text; $('obj-u').style.width = Math.round(hs.prog * 100) + '%';
  }
  weapon(w, mag, reserve, reloading) { $('wpn-n').textContent = WEAPONS[w].name; $('wpn-a').textContent = WEAPONS[w].melee ? '' : reloading ? 'RELOADING' : `${mag} / ${reserve}`; }
  prompt(key, text, prog = -1) { const p = $('prompt'); if (!text) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); $('pr-k').textContent = key; $('pr-k').style.display = key ? '' : 'none'; $('pr-t').textContent = text; $('pr-i').style.display = prog >= 0 ? '' : 'none'; $('pr-u').style.width = Math.round(Math.max(0, prog) * 100) + '%'; }
  toast(text, secs = 3) { const t = $('toast'); t.textContent = text; t.style.opacity = 1; this.toastT = secs; }
  big(title, sub = '', cls = '', secs = 3.2) { const b = $('big'); b.className = cls; b.firstChild.textContent = title; b.lastChild.textContent = sub; b.style.opacity = 1; this.bigT = secs; }
  feed(text, c = '') { const f = $('feed'), d = document.createElement('div'); d.textContent = text; d.className = c; f.appendChild(d); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => d.remove(), 7000); }
  cashPop(n, why) { const p = $('cashpop'); p.textContent = (n > 0 ? '+' : '-') + fmtCash(Math.abs(n)) + (why ? '  ' + why : ''); p.style.color = n > 0 ? '#7dea8d' : '#ff8a8a'; p.style.opacity = 1; this.popT = 2.4; }
  hurt(a) { $('hurt').style.opacity = a; }
  fade(on) { $('fade').style.opacity = on ? 1 : 0; }
  zone(name, sub) { const z = $('zone'); z.innerHTML = esc(name) + '<small>' + esc(sub) + '</small>'; z.style.opacity = 1; clearTimeout(this.zt); this.zt = setTimeout(() => (z.style.opacity = 0), 3200); }
  speed(mph) { const s = $('speed'); if (mph === null) { s.classList.add('hidden'); return; } s.classList.remove('hidden'); $('spd').textContent = Math.round(mph); }
  invite(text) { const i = $('invite'); if (!text) return i.classList.add('hidden'); i.classList.remove('hidden'); i.innerHTML = text; }
  cross(mode, hit) { const c = $('cross'); c.style.display = mode === 'none' ? 'none' : ''; c.classList.toggle('dot', mode === 'dot'); c.classList.toggle('hit', !!hit); $('scope').classList.toggle('hidden', mode !== 'scope'); if (mode === 'scope') c.style.display = 'none'; }
  tick(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').style.opacity = 0;
    if (this.bigT > 0 && (this.bigT -= dt) <= 0) $('big').style.opacity = 0;
    if (this.popT > 0 && (this.popT -= dt) <= 0) $('cashpop').style.opacity = 0;
  }
  /** labels: [{ x, y, text, cls }] in screen pixels */
  names(list) {
    const n = $('names');
    while (n.children.length < list.length) n.appendChild(document.createElement('div'));
    [...n.children].forEach((el, k) => { const q = list[k]; el.style.display = q ? '' : 'none'; if (q) { el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; if (el.textContent !== q.text) el.textContent = q.text; el.className = q.cls || ''; } });
  }

  // ------------------------------------------------------------------ maps
  /** s: { x, z, yaw, pyaw, dots: [{ x, z, c, r }], target: { x, z } | null, cops: bool, t } */
  minimap(s) {
    const g = this.mm, S = 392, zoom = s.zoom || 1.5, th = s.yaw - Math.PI, co = Math.cos(th), si = Math.sin(th);
    g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.rect(0, 0, S, S); g.clip();
    g.translate(S / 2, S / 2); g.rotate(th); g.scale(zoom, zoom); g.drawImage(this.base, X0 - s.x, Z0 - s.z); g.restore();
    const put = (x, z, edge) => { const dx = (x - s.x) * zoom, dz = (z - s.z) * zoom; let px = dx * co - dz * si, py = dx * si + dz * co; const m = S / 2 - 14; let out = false; if (Math.abs(px) > m || Math.abs(py) > m) { if (!edge) return null; const k = m / Math.max(Math.abs(px), Math.abs(py)); px *= k; py *= k; out = true; } return [S / 2 + px, S / 2 + py, out]; };
    g.font = 'bold 20px Outfit, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.city.pois) { const ic = ICON[p.blip]; if (!ic) continue; const q = put(p.door[0], p.door[1], p.blip === 'safehouse'); if (!q) continue; g.fillStyle = 'rgba(8,13,22,0.85)'; g.beginPath(); g.arc(q[0], q[1], 13, 0, 7); g.fill(); g.fillStyle = ic[1]; g.fillText(ic[0], q[0], q[1] + 1); }
    for (const d of s.dots) { const q = put(d.x, d.z, d.edge); if (!q) continue; g.fillStyle = d.c; g.beginPath(); g.arc(q[0], q[1], d.r || 6, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.stroke(); }
    if (s.target) { const q = put(s.target.x, s.target.z, true), r = 10 + Math.sin(s.t * 5) * 2; g.fillStyle = '#ffd23d'; g.beginPath(); g.moveTo(q[0], q[1] - r); g.lineTo(q[0] + r, q[1]); g.lineTo(q[0], q[1] + r); g.lineTo(q[0] - r, q[1]); g.closePath(); g.fill(); g.strokeStyle = '#3a2a00'; g.lineWidth = 2; g.stroke(); }
    g.save(); g.translate(S / 2, S / 2); g.rotate(s.yaw - s.pyaw); g.fillStyle = '#fff'; g.strokeStyle = '#0d1420'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -15); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.stroke(); g.fill(); g.restore();
    if (s.cops) { g.strokeStyle = Math.floor(s.t * 4) % 2 ? 'rgba(255,60,60,0.9)' : 'rgba(60,110,255,0.9)'; g.lineWidth = 8; g.strokeRect(0, 0, S, S); }
  }
  bigMap(s) {
    const c = $('mapc'), k = Math.min((innerWidth * 0.94) / MW, (innerHeight * 0.86) / MH), dpr = Math.min(2, devicePixelRatio || 1);
    c.width = MW * k * dpr; c.height = MH * k * dpr; c.style.width = MW * k + 'px'; c.style.height = MH * k + 'px';
    const g = c.getContext('2d'), K = k * dpr; g.drawImage(this.base, 0, 0, c.width, c.height);
    const P = (x, z) => [(x - X0) * K, (z - Z0) * K];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.city.pois) { const ic = ICON[p.blip]; if (!ic) continue; const [x, y] = P(p.door[0], p.door[1]); g.fillStyle = 'rgba(8,13,22,0.88)'; g.beginPath(); g.arc(x, y, 11 * dpr, 0, 7); g.fill(); g.fillStyle = ic[1]; g.font = `bold ${15 * dpr}px Outfit, sans-serif`; g.fillText(ic[0], x, y + 1); g.font = `600 ${10 * dpr}px Outfit, sans-serif`; g.fillStyle = '#e8eef6'; g.fillText(p.name, x, y + 19 * dpr); }
    for (const d of s.dots) { const [x, y] = P(d.x, d.z); g.fillStyle = d.c; g.beginPath(); g.arc(x, y, 5 * dpr, 0, 7); g.fill(); if (d.name) { g.font = `600 ${10 * dpr}px Outfit, sans-serif`; g.fillText(d.name, x, y - 11 * dpr); } }
    if (s.target) { const [x, y] = P(s.target.x, s.target.z), r = 9 * dpr; g.fillStyle = '#ffd23d'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.fill(); }
    const [x, y] = P(s.x, s.z); g.save(); g.translate(x, y); g.rotate(Math.PI - s.pyaw); g.fillStyle = '#fff'; g.strokeStyle = '#0d1420'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(0, -11 * dpr); g.lineTo(8 * dpr, 9 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-8 * dpr, 9 * dpr); g.closePath(); g.stroke(); g.fill(); g.restore();
  }

  // ------------------------------------------------------------------ phone and shops
  show(id) { this.close(true); this.open = id; $(id).classList.remove('hidden'); this.G.unlock(); }
  close(quiet) { if (!this.open) return; $(this.open).classList.add('hidden'); this.open = null; if (!quiet) this.G.relock(); }
  phone(page) {
    const G = this.G; if (page) this.page = page;
    if (this.open !== 'phone') this.show('phone');
    const tabs = [['jobs', 'Heists'], ['cars', 'My cars'], ['city', 'City'], ['set', 'Settings']]; if (G.own) tabs.push(['own', 'Owner']);
    $('ph-tabs').innerHTML = tabs.map(([p, t]) => `<button data-p="${p}" class="${p === this.page ? 'on' : ''}">${t}</button>`).join('');
    $('ph-cash').textContent = fmtCash(G.me.cash);
    const me = G.me, hs = me.hs, done = new Set(G.save.done); let h = '';
    if (this.page === 'jobs') {
      if (hs && hs.st === 'lobby') h += `<div class="item done"><div class="t"><b>${esc(HEIST[hs.h].name)}</b><span>Crew: ${hs.crew.map((id) => esc(G.nameOf(id))).join(', ')}. Starts in ${Math.ceil(hs.wait)}s.</span></div>${hs.lead === G.id ? '<button data-a="go">Start now</button>' : ''}<button class="alt" data-a="quit">Leave</button></div>`;
      else if (hs) h += `<div class="item done"><div class="t"><b>${esc(HEIST[hs.h].name)}</b><span>${esc(hs.text)}</span></div><button class="alt" data-a="quit">Quit heist</button></div>`;
      for (const d of HEISTS) {
        const lock = d.need && !done.has(d.need) && !G.own, fin = done.has(d.id);
        h += `<div class="item ${lock ? 'lock' : fin ? 'done' : ''}"><div class="t"><b>${esc(d.name)}${fin ? ' (done)' : ''}</b><span>${esc(d.tier)}. ${esc(d.blurb)}${lock ? ' Finish ' + esc(HEIST[d.need].name) + ' first.' : ''}</span></div><div class="p">${fmtCash(d.pay)}</div>`;
        if (!hs && !lock) h += `<button data-a="solo" data-h="${d.id}">Solo</button>${G.online ? `<button class="alt" data-a="crew" data-h="${d.id}">Crew</button>` : ''}`;
        h += '</div>';
      }
      h += '<p class="note" style="margin: 10px 0 0">A crew splits the take evenly. Bring a gun: buy one at LOCK & LOAD (G on the map).</p>';
    } else if (this.page === 'cars') {
      const cars = me.cars || [];
      if (!cars.length) h += '<p class="note">You do not own a car yet. Any car on the street is yours to take with F, or buy one to keep at MOTOR ROW (C on the map).</p>';
      for (const k of cars) h += `<div class="item"><div class="t"><b>${esc(VEHICLES[k].name)}</b><span>Delivered to the nearest road.</span></div><button data-a="call" data-c="${k}">Bring it to me</button></div>`;
    } else if (this.page === 'city') {
      h += G.online ? `<div class="item"><div class="t"><b>City code: ${esc(G.code || '')}</b><span>Friends pick Play online, then Join with code.</span></div></div>` : '<p class="note">You are in a solo city. Pick Play online from the menu to share a city with friends.</p>';
      for (const [id, p] of G.names) h += `<div class="item"><div class="t"><b>${esc(p.name)}${id === G.id ? ' (you)' : ''}</b><span>${p.own ? 'Owner' : 'Player'}</span></div></div>`;
      if (G.online) h += `<div class="item"><div class="t"><b>Passive mode</b><span>Other players cannot hurt you, and you cannot hurt them. Turns off when you commit a crime.</span></div><button class="${me.pas ? '' : 'alt'}" data-a="passive">${me.pas ? 'On' : 'Off'}</button></div>`;
    } else if (this.page === 'set') {
      const s = G.save.set, seg = (k, opts) => `<div class="seg">${opts.map(([v, t]) => `<button data-a="set" data-k="${k}" data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
      h += `<div class="opt">Graphics ${seg('q', [['low', 'Fast'], ['med', 'Good'], ['high', 'Best']])}</div><div class="opt">Mouse speed <input type="range" data-k="sens" min="0.3" max="2.5" step="0.1" value="${s.sens}"></div><div class="opt">Volume <input type="range" data-k="vol" min="0" max="1" step="0.05" value="${s.vol}"></div><div class="opt">Car radio ${seg('mus', [[1, 'On'], [0, 'Off']])}</div>`;
    } else if (this.page === 'own') {
      const b = (t, c, n) => `<button class="pbtn alt" style="margin: 0 6px 6px 0" data-a="adm" data-c="${c}" data-n="${n ?? ''}">${t}</button>`;
      h += '<p class="note">Only your account sees this page.</p>' + b('+ $100,000', 'cash', 100000) + b('Clear heat', 'heat', 0) + b('Heat 3', 'heat', 3) + b('Heat 5', 'heat', 5) + b('Heal + armor', 'heal') + b('God mode', 'god') + b('All guns', 'guns') + b('Eclipse X', 'car', 10) + b('Zephyr GT', 'car', 9) + b('Noon', 'time', 0.5) + b('Night', 'time', 0.95);
    }
    $('ph-body').innerHTML = h;
  }
  shop(kind) {
    const G = this.G, me = G.me; this.kind = kind; if (this.open !== 'shop') this.show('shop');
    $('sh-cash').textContent = fmtCash(me.cash);
    let h = ''; const guns = new Set(me.guns), cars = new Set(me.cars);
    const bar = (v) => `<i class="stat"><u style="width:${Math.round(v * 100)}%"></u></i>`;
    if (kind === 'guns') {
      $('sh-title').textContent = 'LOCK & LOAD';
      for (let w = 1; w < WEAPONS.length; w++) {
        const W = WEAPONS[w], own = guns.has(w);
        h += `<div class="item ${own ? 'done' : ''}"><div class="t"><b>${esc(W.name)}</b><span>${W.melee ? 'Melee' : `Damage ${W.dmg}${W.pellets ? ' x ' + W.pellets : ''}, ${W.mag} rounds`}${own && !W.melee ? `. You have ${G.ammoOf(w)} rounds.` : ''}</span></div>`;
        h += own ? (W.melee ? '<div class="p">Owned</div>' : `<div class="p">${fmtCash(W.ammoPrice)}</div><button data-a="buy" data-it="a${w}">+${W.ammo} ammo</button>`) : `<div class="p">${fmtCash(W.price)}</div><button data-a="buy" data-it="w${w}" ${me.cash < W.price ? 'disabled' : ''}>Buy</button>`;
        h += '</div>';
      }
      h += `<div class="item"><div class="t"><b>Body armor</b><span>Soaks up most of the damage until it breaks.</span></div><div class="p">${fmtCash(ARMOR_PRICE)}</div><button data-a="buy" data-it="armor" ${me.ar >= 100 || me.cash < ARMOR_PRICE ? 'disabled' : ''}>${me.ar >= 100 ? 'Full' : 'Buy'}</button></div>`;
    } else if (kind === 'dealer') {
      $('sh-title').textContent = 'MOTOR ROW';
      VEHICLES.forEach((K, k) => { if (!K.price) return; const own = cars.has(k); h += `<div class="item ${own ? 'done' : ''}"><div class="t"><b>${esc(K.name)}</b><span>Speed ${bar(K.top / 80)} Pickup ${bar(K.acc / 17)} Grip ${bar(K.grip / 1.5)}</span></div><div class="p">${own ? 'Owned' : fmtCash(K.price)}</div>${own ? '' : `<button data-a="buy" data-it="c${k}" ${me.cash < K.price ? 'disabled' : ''}>Buy</button>`}</div>`; });
      h += '<p class="note" style="margin: 10px 0 0">Cars you buy are yours for good. Call one from your phone, or pick it up at the safehouse garage.</p>';
    } else if (kind === 'garage') {
      $('sh-title').textContent = 'GARAGE';
      if (!cars.size) h += '<p class="note">Empty. Buy a car at MOTOR ROW (C on the map) and it will wait for you here.</p>';
      for (const k of cars) h += `<div class="item"><div class="t"><b>${esc(VEHICLES[k].name)}</b></div><button data-a="garage" data-c="${k}">Bring it out</button></div>`;
    } else if (kind === 'outfit') {
      $('sh-title').textContent = 'WARDROBE';
      h += '<div class="fits">' + OUTFITS.map((o, k) => `<button class="fit ${G.save.look === k ? 'on' : ''}" data-a="look" data-n="${k}"><i style="background: linear-gradient(180deg, #${o.top.toString(16).padStart(6, '0')} 60%, #${o.legs.toString(16).padStart(6, '0')} 60%)"></i><span>${esc(o.name)}</span></button>`).join('') + '</div>';
    }
    $('sh-body').innerHTML = h;
  }
  click(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const G = this.G, d = b.dataset; G.sfx.ui();
    switch (d.a) {
      case 'solo': G.act({ k: 'heist', s: 'setup', h: d.h, solo: true }); this.close(); break;
      case 'crew': G.act({ k: 'heist', s: 'setup', h: d.h }); this.close(); break;
      case 'go': G.act({ k: 'heist', s: 'go' }); this.close(); break;
      case 'quit': G.act({ k: 'heist', s: 'quit' }); this.close(); break;
      case 'call': G.act({ k: 'garage', c: +d.c, call: 1 }); this.close(); break;
      case 'garage': G.act({ k: 'garage', c: +d.c }); this.close(); break;
      case 'passive': G.act({ k: 'passive' }); setTimeout(() => this.open === 'phone' && this.phone(), 250); break;
      case 'buy': G.act({ k: 'buy', it: d.it }); setTimeout(() => this.open === 'shop' && this.shop(this.kind), 250); break;
      case 'look': G.setLook(+d.n); this.shop('outfit'); break;
      case 'set': G.setting(d.k, isNaN(+d.v) ? d.v : +d.v); this.phone(); break;
      case 'adm': G.act({ k: 'admin', c: d.c, n: d.n === '' ? undefined : +d.n }); break;
    }
  }
  input(e) { const k = e.target.dataset.k; if (k) this.G.setting(k, +e.target.value); }

  // ------------------------------------------------------------------ heist tasks (small games)
  /** kind: 'crack' | 'hack' | 'drill'. Calls done() when solved or cancel() on Esc. */
  startTask(kind, done, cancel) {
    const G = this.G, cv = $('tk-cv'), g = cv.getContext('2d'), Wd = cv.width, Hd = cv.height;
    $('task').classList.remove('hidden'); G.unlock();
    $('tk-title').textContent = { crack: 'Crack the safe', hack: 'Hack the terminal', drill: 'Drill the vault' }[kind];
    $('tk-help').textContent = { crack: 'Press Space (or tap) when the needle is inside the gold zone. Three pins.', hack: 'Watch the arrows, then repeat them with the arrow keys or W A S D (or tap them).', drill: 'Hold Space (or hold your finger down) to drill. Let go before the bit overheats.' }[kind];
    const st = { t: 0, stage: 0, ang: 0, sp: 2.4, tgt: Math.random() * 6.28, wid: 0.75, flash: 0, bad: 0, seq: [], shown: 0, inp: [], phase: 'show', prog: 0, heat: 0, jam: 0, hold: false };
    const newSeq = () => { st.seq = Array.from({ length: 4 + st.stage }, () => Math.floor(Math.random() * 4)); st.inp = []; st.phase = 'show'; st.shown = 0; st.t = 0; };
    if (kind === 'hack') newSeq();
    let last = performance.now(), raf = 0, over = false;
    const finish = (ok) => { if (over) return; over = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); cv.onpointerdown = cv.onpointerup = null; $('task').classList.add('hidden'); this.task = null; G.relock(); ok ? done() : cancel(); };
    const press = (dir) => {
      if (kind === 'crack') { let d = (st.ang - st.tgt) % 6.283; if (d > 3.1416) d -= 6.283; if (d < -3.1416) d += 6.283; if (Math.abs(d) < st.wid / 2) { st.stage++; st.flash = 0.25; G.sfx.tick(true); if (st.stage >= 3) return finish(true); st.sp *= -1.35; st.wid *= 0.78; st.tgt = Math.random() * 6.28; } else { st.bad = 0.3; G.sfx.tick(false); st.tgt = Math.random() * 6.28; } }
      else if (kind === 'hack' && st.phase === 'in' && dir >= 0) { st.inp.push(dir); const k = st.inp.length - 1; if (st.seq[k] !== dir) { st.bad = 0.4; G.sfx.tick(false); newSeq(); } else { G.sfx.tick(true); if (st.inp.length === st.seq.length) { st.stage++; st.flash = 0.3; if (st.stage >= 2) return finish(true); newSeq(); } } }
    };
    const DIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    const kd = (e) => { e.preventDefault(); e.stopPropagation(); if (e.repeat) return; if (e.code === 'Escape') return finish(false); if (kind === 'drill') { if (e.code === 'Space' || e.code === 'KeyE') st.hold = true; } else if (kind === 'crack') { if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') press(-1); } else if (e.code in DIR) press(DIR[e.code]); };
    const ku = (e) => { e.stopPropagation(); if (e.code === 'Space' || e.code === 'KeyE') st.hold = false; };
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
    cv.onpointerdown = (e) => { if (kind === 'drill') st.hold = true; else if (kind === 'crack') press(-1); else { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; press(Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : y > 0 ? 2 : 0); } };
    cv.onpointerup = () => { st.hold = false; };
    const arrow = (cx, cy, dir, s, col) => { g.save(); g.translate(cx, cy); g.rotate((dir * Math.PI) / 2); g.fillStyle = col; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, s * 0.2); g.lineTo(s * 0.32, s * 0.2); g.lineTo(s * 0.32, s); g.lineTo(-s * 0.32, s); g.lineTo(-s * 0.32, s * 0.2); g.lineTo(-s * 0.8, s * 0.2); g.closePath(); g.fill(); g.restore(); };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt; st.flash = Math.max(0, st.flash - dt); st.bad = Math.max(0, st.bad - dt);
      g.fillStyle = st.bad > 0 ? '#3a1216' : st.flash > 0 ? '#12301c' : '#0b111c'; g.fillRect(0, 0, Wd, Hd);
      if (kind === 'crack') {
        st.ang = (st.ang + st.sp * dt + 6.283) % 6.283; const cx = Wd / 2, cy = Hd / 2 + 6, R = 120;
        g.lineWidth = 26; g.strokeStyle = '#263247'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
        g.strokeStyle = '#ffc247'; g.beginPath(); g.arc(cx, cy, R, st.tgt - st.wid / 2, st.tgt + st.wid / 2); g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(st.ang) * (R + 12), cy + Math.sin(st.ang) * (R + 12)); g.stroke();
        g.fillStyle = '#8b96a8'; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.fill();
        for (let k = 0; k < 3; k++) { g.fillStyle = k < st.stage ? '#7dea8d' : '#34405a'; g.beginPath(); g.arc(cx - 34 + k * 34, 30, 10, 0, 7); g.fill(); }
      } else if (kind === 'hack') {
        if (st.phase === 'show') { st.shown = Math.floor(st.t / 0.55); if (st.shown >= st.seq.length && st.t > st.seq.length * 0.55 + 0.2) st.phase = 'in'; }
        g.fillStyle = '#2ad4a0'; g.font = 'bold 18px monospace'; g.textAlign = 'center'; g.fillText(st.phase === 'show' ? 'WATCH' : 'REPEAT', Wd / 2, 40);
        const n = st.seq.length, gap = 74, x0 = Wd / 2 - ((n - 1) * gap) / 2;
        for (let k = 0; k < n; k++) { const lit = st.phase === 'show' ? k === st.shown && st.t % 0.55 < 0.42 : k < st.inp.length; g.fillStyle = '#16202f'; g.fillRect(x0 + k * gap - 30, 150, 60, 60); if (lit) arrow(x0 + k * gap, 180, st.seq[k], 22, st.phase === 'show' ? '#2ad4a0' : '#7dea8d'); }
        for (let k = 0; k < 2; k++) { g.fillStyle = k < st.stage ? '#7dea8d' : '#34405a'; g.beginPath(); g.arc(Wd / 2 - 17 + k * 34, 290, 10, 0, 7); g.fill(); }
      } else {
        if (st.jam > 0) { st.jam -= dt; st.heat = Math.max(0, st.heat - dt * 0.4); } else if (st.hold) { st.heat += dt / 3.4; st.prog += dt / 14; if (st.heat >= 1) { st.jam = 2.4; st.bad = 0.4; G.sfx.tick(false); } if (Math.floor(st.t * 14) !== Math.floor((st.t - dt) * 14)) G.sfx.step(); } else st.heat = Math.max(0, st.heat - dt / 1.3);
        if (st.prog >= 1) return finish(true);
        g.fillStyle = '#8b96a8'; g.beginPath(); g.arc(Wd / 2, 150, 92, 0, 7); g.fill(); g.fillStyle = '#5c6779'; g.beginPath(); g.arc(Wd / 2, 150, 70, 0, 7); g.fill();
        const sh = st.hold && st.jam <= 0 ? Math.sin(st.t * 80) * 3 : 0; g.fillStyle = st.jam > 0 ? '#ff5a4d' : '#d8dde6'; g.fillRect(Wd / 2 - 7 + sh, 150 - 7, 14 + st.prog * 60, 14);
        g.fillStyle = '#16202f'; g.fillRect(60, 280, Wd - 120, 18); g.fillStyle = '#ffc247'; g.fillRect(60, 280, (Wd - 120) * st.prog, 18);
        g.fillStyle = '#16202f'; g.fillRect(60, 316, Wd - 120, 12); g.fillStyle = st.heat > 0.75 ? '#ff5a4d' : '#55b6ff'; g.fillRect(60, 316, (Wd - 120) * Math.min(1, st.heat), 12);
        g.fillStyle = '#a9b6c8'; g.font = '600 13px Outfit, sans-serif'; g.textAlign = 'left'; g.fillText(st.jam > 0 ? 'JAMMED: let it cool' : 'Progress', 60, 272); g.fillText('Heat', 60, 346);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    this.task = { cancel: () => finish(false), st, press };
  }
}
