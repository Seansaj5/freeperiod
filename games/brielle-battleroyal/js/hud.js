// The on-screen game UI: health/shield, hotbar, materials, ammo, crosshair, minimap + big map, storm timer, kill feed.
import { heightAt, waterDist } from '../shared/map.js';
import { WEAPONS, HEALS, RARITY, AMMO, BUILD, STORM, MAP } from '../shared/rules.js';
import { itemName, isGun } from '../shared/items.js';
import { groundColor } from './scene.js';

const $ = (id) => document.getElementById(id);
const MAP_PX = 640;               // the prerendered map image
const SCALE = MAP_PX / (MAP.HALF * 2 + 80);   // px per metre
const toPx = (x) => (x + MAP.HALF + 40) * SCALE;

// small icons for the hotbar (inline SVG, drawn from simple shapes)
const ICON = {
  pickaxe: '<path d="M6 26 L22 10" stroke="#c8a070" stroke-width="3"/><path d="M12 6 Q22 2 28 12 L24 12 Q20 7 12 9 Z" fill="#cfd6de"/>',
  pistol: '<path d="M5 12h20v5H14l-1 9H8l1-9H5z" fill="currentColor"/>',
  smg: '<path d="M3 12h24v5h-8l-1 4h-3l-1-4h-3l-1 9H6l1-9H3z" fill="currentColor"/>',
  ar: '<path d="M1 13h29v4h-9l-2 4h-3v-4h-4l-1 8H7l1-8H1z" fill="currentColor"/>',
  pump: '<path d="M1 13h30v3H16v3h-6l-1 6H4l2-9H1z" fill="currentColor"/><rect x="18" y="16" width="7" height="3" fill="currentColor"/>',
  tac: '<path d="M2 12h28v4H17v3h-5l-1 7H6l2-10H2z" fill="currentColor"/>',
  sniper: '<path d="M0 14h31v3H15l-3 3H8l-1 5H3l1-8H0z" fill="currentColor"/><rect x="11" y="9" width="10" height="3" rx="1.5" fill="currentColor"/>',
  rocket: '<rect x="2" y="11" width="28" height="7" rx="3" fill="currentColor"/><path d="M13 18h4v7h-4z" fill="currentColor"/>',
  grenade: '<ellipse cx="16" cy="18" rx="8" ry="6" fill="#e2552f"/><path d="M8 18h-5M24 18h5" stroke="#e2552f" stroke-width="3"/><rect x="14" y="9" width="4" height="4" fill="#555"/>',
  bandage: '<rect x="6" y="10" width="20" height="12" rx="3" fill="#f3efe6"/><rect x="6" y="14" width="20" height="4" fill="#e04848"/>',
  medkit: '<rect x="5" y="8" width="22" height="17" rx="3" fill="#f3efe6"/><path d="M14 11h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#e04848"/>',
  seaglass: '<path d="M12 5h8v4l3 4v12a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V13l3-4z" fill="#5ad1ff"/>',
  jug: '<path d="M10 5h12v4l4 4v14H6V13l4-4z" fill="#3f8cff"/><rect x="12" y="15" width="8" height="6" fill="#bfe0ff"/>',
  slush: '<path d="M9 13h14l-2 15H11z" fill="#fff"/><path d="M8 13a8 7 0 0 1 16 0z" fill="#ff3d8b"/><path d="M19 3l-2 9" stroke="#ffd23d" stroke-width="2"/>',
};
const svg = (k) => `<svg viewBox="0 0 32 32" width="40" height="40">${ICON[k] || ''}</svg>`;

export class Hud {
  constructor(map) {
    this.map = map;
    this.mapImg = this.renderMap();
    this.feed = [];
    this.hotbar = $('hotbar');
    this.hotSig = '';
    this.mini = $('mini'); this.miniG = this.mini.getContext('2d');
    this.big = $('bigmap'); this.bigG = this.big.getContext('2d');
    this.marker = null;
    this.dmgNums = [];
    this.lastTxt = {};
  }

  /** Top-down picture of the island (terrain, water, roads, roofs). */
  renderMap() {
    const c = document.createElement('canvas'); c.width = c.height = MAP_PX;
    const g = c.getContext('2d');
    const img = g.createImageData(MAP_PX, MAP_PX);
    const col = { r: 0, g: 0, b: 0, setRGB(r, gg, b) { this.r = r; this.g = gg; this.b = b; return this; }, lerp(o, t) { this.r += (o.r - this.r) * t; this.g += (o.g - this.g) * t; this.b += (o.b - this.b) * t; return this; }, multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; } };
    for (let py = 0; py < MAP_PX; py++) for (let px = 0; px < MAP_PX; px++) {
      const x = px / SCALE - MAP.HALF - 40, z = py / SCALE - MAP.HALF - 40;
      const i = (py * MAP_PX + px) * 4;
      if (heightAt(x, z) < -0.05) { const d = Math.min(1, waterDist(x, z) / 30); img.data[i] = 40 - d * 20; img.data[i + 1] = 140 - d * 40; img.data[i + 2] = 175 - d * 20; }
      else { groundColor(x, z, col); img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; }
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (const r of this.map.roads) { g.strokeStyle = '#4a4d55'; g.lineWidth = Math.max(2, r.w * SCALE); g.beginPath(); g.moveTo(toPx(r.x0), toPx(r.z0)); g.lineTo(toPx(r.x1), toPx(r.z1)); g.stroke(); }
    for (const c2 of this.map.circles) { g.strokeStyle = '#4a4d55'; g.lineWidth = c2.w * SCALE; g.beginPath(); g.arc(toPx(c2.x), toPx(c2.z), c2.r * SCALE, 0, 7); g.stroke(); }
    g.setLineDash([2, 2]);
    for (const r of this.map.rails) { g.strokeStyle = '#6b5a4a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(toPx(r.x0), toPx(r.z0)); g.lineTo(toPx(r.x1), toPx(r.z1)); g.stroke(); }
    g.setLineDash([]);
    for (const b of this.map.boxes) {
      if (b.y1 - b.y0 < 2 || b.x1 - b.x0 < 0.6 && b.z1 - b.z0 < 0.6) continue;
      g.fillStyle = 'rgba(70,70,80,0.55)';
      g.fillRect(toPx(b.x0), toPx(b.z0), Math.max(0.6, (b.x1 - b.x0) * SCALE), Math.max(0.6, (b.z1 - b.z0) * SCALE));
    }
    for (const s of this.map.slopes) { if (s.x1 - s.x0 < 3) continue; g.fillStyle = 'rgba(120,60,50,0.6)'; g.fillRect(toPx(s.x0), toPx(s.z0), (s.x1 - s.x0) * SCALE, (s.z1 - s.z0) * SCALE); }
    return c;
  }

  text(id, v) { if (this.lastTxt[id] !== v) { this.lastTxt[id] = v; $(id).textContent = v; } }

  /** me: the private state; st: { slot, build, piece, mat, ads, kind } */
  update(g) {
    const me = g.me;
    if (!me) return;
    // bars
    $('hpFill').style.width = Math.max(0, me.hp) + '%';
    $('shFill').style.width = Math.max(0, me.sh) + '%';
    this.text('hpNum', String(Math.max(0, Math.round(me.hp))));
    this.text('shNum', String(Math.round(me.sh)));
    $('shRow').classList.toggle('empty', me.sh <= 0);
    // materials
    for (let i = 0; i < 3; i++) { this.text('mat' + i, String(me.mats[i])); $('matBox' + i).classList.toggle('sel', g.mat === i); }
    // hotbar
    const sig = JSON.stringify([me.inv, g.slot, g.buildMode]);
    if (sig !== this.hotSig) {
      this.hotSig = sig;
      let html = `<div class="slot pick${g.slot === 0 && !g.buildMode ? ' sel' : ''}" data-s="0">${svg('pickaxe')}<kbd>F</kbd></div>`;
      for (let i = 0; i < 5; i++) {
        const it = me.inv[i];
        const r = it ? RARITY[it.r] : null;
        const n = it ? (isGun(it.k) ? it.mag : it.n || '') : '';
        html += `<div class="slot${g.slot === i + 1 && !g.buildMode ? ' sel' : ''}${it ? '' : ' empty'}" data-s="${i + 1}" style="${r ? `--rc:${r.color}` : ''}">${it ? svg(it.k) : ''}<b>${n}</b><kbd>${i + 1}</kbd></div>`;
      }
      this.hotbar.innerHTML = html;
    }
    // held item name + ammo
    const it = g.slot > 0 ? me.inv[g.slot - 1] : null;
    if (g.buildMode) { this.text('heldName', ['Wall', 'Floor', 'Ramp', 'Cone'][['wall', 'floor', 'ramp', 'cone'].indexOf(g.piece)] + ' · ' + BUILD.MATS[g.mat]); this.text('ammoNum', ''); }
    else if (it) {
      this.text('heldName', `${itemName(it)}`);
      $('heldName').style.color = RARITY[it.r].color;
      if (isGun(it.k)) this.text('ammoNum', `${it.mag} | ${me.ammo[WEAPONS[it.k].ammo]}`);
      else this.text('ammoNum', `x${it.n}`);
    } else { this.text('heldName', g.slot === 0 ? 'Harvesting Tool' : ''); $('heldName').style.color = ''; this.text('ammoNum', ''); }
    // reserve ammo list
    this.text('ammoList', Object.keys(AMMO).filter((k) => me.ammo[k] > 0).map((k) => `${AMMO[k].name.replace(' Ammo', '')} ${me.ammo[k]}`).join('  ·  '));
    $('buildBar').classList.toggle('hidden', !g.buildMode);
    if (g.buildMode) for (const p of ['wall', 'floor', 'ramp', 'cone']) $('bp-' + p).classList.toggle('sel', g.piece === p);
    // progress ring (reload / heal)
    const busy = g.busy;
    $('ring').classList.toggle('hidden', !busy);
    if (busy) { const f = Math.max(0, Math.min(1, 1 - busy.left / busy.total)); $('ringFill').style.strokeDashoffset = String(126 * (1 - f)); this.text('ringTxt', busy.label); }
    // top right
    this.text('aliveNum', String(g.alive));
    this.text('killNum', String(me.kills));
    const s = g.storm;
    if (s) {
      const left = Math.max(0, Math.ceil(s.left));
      const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
      let label = 'Nor\'easter forming';
      if (s.state === 'wait') label = `Storm closes in ${mm}:${ss}`;
      else if (s.state === 'shrink') label = `Storm closing ${mm}:${ss}`;
      else if (s.state === 'done') label = 'Final storm';
      if (g.phase === 'warmup') label = `Blimp leaves in ${Math.max(0, Math.ceil(g.warmLeft))}`;
      if (g.phase === 'blimp') label = g.inBlimp ? 'Press Space to jump' : g.flying ? 'Skydiving' : 'Storm forms when the blimp leaves';
      this.text('stormTxt', label);
    }
    // interact prompt
    $('prompt').classList.toggle('hidden', !g.prompt);
    if (g.prompt) { this.text('promptTxt', g.prompt.text); $('promptTxt').style.color = g.prompt.color || ''; }
    // aim info (piece health)
    $('pieceHp').classList.toggle('hidden', !g.aimPiece);
    if (g.aimPiece) { $('pieceHpFill').style.width = Math.max(0, Math.min(100, (g.aimPiece.hp / g.aimPiece.max) * 100)) + '%'; this.text('pieceHpTxt', `${Math.round(g.aimPiece.hp)} / ${g.aimPiece.max}`); }
    // crosshair style
    const ch = $('cross');
    const kind = g.buildMode ? 'build' : it && WEAPONS[it.k] && WEAPONS[it.k].pellets > 1 ? 'shotgun' : it && isGun(it.k) ? 'gun' : 'dot';
    ch.className = 'cross ' + kind;
    ch.style.setProperty('--spread', Math.round(10 + g.spreadPx) + 'px');
    $('scope').classList.toggle('hidden', !g.scoped);
    $('stormEdge').classList.toggle('on', g.inStorm);
    // damage numbers
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.t -= g.dt;
      if (d.t <= 0) { d.el.remove(); this.dmgNums.splice(i, 1); continue; }
      const p = g.project(d.x, d.y + (1 - d.t) * 0.8, d.z);
      if (!p) { d.el.style.display = 'none'; continue; }
      d.el.style.display = '';
      d.el.style.transform = `translate(${p[0]}px, ${p[1]}px) scale(${0.8 + d.t * 0.4})`;
      d.el.style.opacity = String(Math.min(1, d.t * 2));
    }
  }

  damageNumber(x, y, z, n, shield, head) {
    const el = document.createElement('div');
    el.className = 'dmgnum' + (shield ? ' sh' : '') + (head ? ' hs' : '');
    el.textContent = String(n);
    $('dmgLayer').appendChild(el);
    this.dmgNums.push({ el, x, y, z, t: 1 });
  }

  hitmarker(head, kill) {
    const h = $('hitm');
    h.className = 'hitm on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    clearTimeout(this._hm); this._hm = setTimeout(() => { h.className = 'hitm'; }, 160);
  }

  hurtFrom(angle) {
    const el = document.createElement('div');
    el.className = 'hurt';
    el.style.transform = `rotate(${angle}rad)`;
    $('hurtLayer').appendChild(el);
    setTimeout(() => el.remove(), 900);
    $('vignette').classList.add('on'); clearTimeout(this._vg); this._vg = setTimeout(() => $('vignette').classList.remove('on'), 300);
  }

  addFeed(html) {
    const el = document.createElement('div');
    el.className = 'feedrow';
    el.innerHTML = html;
    $('feed').prepend(el);
    while ($('feed').children.length > 6) $('feed').lastChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 6000);
  }

  announce(big, small = '', ms = 2600) {
    $('annBig').textContent = big; $('annSmall').textContent = small;
    const a = $('ann'); a.classList.remove('on'); void a.offsetWidth; a.classList.add('on');
    clearTimeout(this._an); this._an = setTimeout(() => a.classList.remove('on'), ms);
  }

  drawMinimap(g) {
    const c = this.mini, x = this.miniG, W = c.width, H = c.height;
    const view = 180;  // metres across
    const sc = W / view;
    const px = g.camX, pz = g.camZ;
    x.save();
    x.fillStyle = '#2a7f9a'; x.fillRect(0, 0, W, H);
    const s0 = SCALE;
    x.drawImage(this.mapImg, toPx(px - view / 2), toPx(pz - view / 2), view * s0, view * s0, 0, 0, W, H);
    const sx = (wx) => (wx - px) * sc + W / 2, sz = (wz) => (wz - pz) * sc + H / 2;
    this.drawStorm(x, g, sx, sz, sc, W, H);
    if (this.marker) { x.fillStyle = '#ffd23d'; x.beginPath(); x.arc(sx(this.marker.x), sz(this.marker.z), 5, 0, 7); x.fill(); }
    // you
    x.translate(W / 2, H / 2); x.rotate(-g.yaw);
    x.fillStyle = '#fff'; x.strokeStyle = '#1b2440'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -9); x.lineTo(6, 7); x.lineTo(0, 3); x.lineTo(-6, 7); x.closePath(); x.fill(); x.stroke();
    x.restore();
    // north
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W / 2 - 8, 2, 16, 14); x.fillStyle = '#fff'; x.font = '700 11px Outfit'; x.textAlign = 'center'; x.fillText('N', W / 2, 13);
    const poi = this.map.poiAt(px, pz);
    this.text('poiName', poi ? poi.name : '');
  }

  drawStorm(x, g, sx, sz, sc, W, H) {
    const s = g.storm; if (!s) return;
    x.save();
    // tint outside the current circle
    x.fillStyle = 'rgba(70,60,170,0.42)';
    x.beginPath(); x.rect(0, 0, W, H); x.arc(sx(s.x), sz(s.z), Math.max(0, s.r * sc), 0, Math.PI * 2, true); x.fill('evenodd');
    x.strokeStyle = '#8f7bff'; x.lineWidth = 2; x.beginPath(); x.arc(sx(s.x), sz(s.z), Math.max(0, s.r * sc), 0, 7); x.stroke();
    if (s.nr !== undefined && s.state !== 'done') { x.strokeStyle = '#ffffff'; x.setLineDash([5, 4]); x.lineWidth = 2; x.beginPath(); x.arc(sx(s.nx), sz(s.nz), Math.max(0, s.nr * sc), 0, 7); x.stroke(); x.setLineDash([]); }
    x.restore();
  }

  drawBig(g) {
    const c = this.big, x = this.bigG;
    const S = Math.min(innerWidth, innerHeight) * 0.86;
    if (c.width !== Math.round(S)) { c.width = c.height = Math.round(S); }
    const W = c.width, sc = W / (MAP.HALF * 2 + 80);
    x.drawImage(this.mapImg, 0, 0, W, W);
    const sx = (wx) => (wx + MAP.HALF + 40) * sc, sz = sx;
    if (g.blimpPath && (g.phase === 'warmup' || g.phase === 'blimp')) {
      x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.setLineDash([10, 8]);
      x.beginPath(); x.moveTo(sx(g.blimpPath.x0), sz(g.blimpPath.z0)); x.lineTo(sx(g.blimpPath.x1), sz(g.blimpPath.z1)); x.stroke(); x.setLineDash([]);
    }
    this.drawStorm(x, g, sx, sz, sc, W, W);
    x.font = '800 ' + Math.max(10, Math.round(W / 60)) + 'px Outfit, sans-serif'; x.textAlign = 'center';
    for (const p of this.map.pois) {
      x.fillStyle = 'rgba(0,0,0,0.55)'; const tw = x.measureText(p.name).width + 10; x.fillRect(sx(p.x) - tw / 2, sz(p.z) - 11, tw, 16);
      x.fillStyle = p.big ? '#fff' : '#d8e6ff'; x.fillText(p.name, sx(p.x), sz(p.z) + 1);
    }
    if (this.marker) { x.fillStyle = '#ffd23d'; x.beginPath(); x.arc(sx(this.marker.x), sz(this.marker.z), 7, 0, 7); x.fill(); }
    x.save(); x.translate(sx(g.camX), sz(g.camZ)); x.rotate(-g.yaw);
    x.fillStyle = '#ffd23d'; x.strokeStyle = '#1b2440'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -12); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fill(); x.stroke(); x.restore();
    return { W, sc };
  }

  bigToWorld(ev) {
    const r = this.big.getBoundingClientRect();
    const W = r.width, sc = W / (MAP.HALF * 2 + 80);
    return { x: (ev.clientX - r.left) / sc - MAP.HALF - 40, z: (ev.clientY - r.top) / sc - MAP.HALF - 40 };
  }
}
