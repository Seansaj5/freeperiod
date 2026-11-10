// Avatar frames: 20 animated decorations drawn in code (SVG + CSS animations in flair.css). No outside art.
// mountFrame(el, id) puts the frame over an avatar element (any size; drawn for 40 px and 128 px), returns { el, stop() }.
// The frame box is the avatar box grown 15% on every side; inside each SVG the avatar is the circle (50,50) r 50.
// Animations run only on transform/opacity of whole layers where possible (cheap on Chromebooks), pause off-screen
// (one shared IntersectionObserver) and stay still with prefers-reduced-motion (each frame's still pose is its base style).
import { FRAMES } from './flair.js';

const C = 50;
const n2 = (v) => Math.round(v * 100) / 100;
const rad = (deg) => (deg * Math.PI) / 180;
const P = (r, deg) => [n2(C + r * Math.cos(rad(deg))), n2(C + r * Math.sin(rad(deg)))];
const pt = (p) => `${p[0]} ${p[1]}`;
// stroke widths scale up a little on small avatars (--k is 1, or 1.5 under 64 px)
const sw = (w) => `stroke-width:calc(var(--k) * ${w}px)`;
const ring = (r, stroke, w, extra = '') => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" style="${sw(w)}" ${extra}/>`;
const arc = (r, a0, a1) => {
  const p0 = P(r, a0), p1 = P(r, a1);
  return `M${pt(p0)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${pt(p1)}`;
};
// a closed ring whose radius follows fn(deg)
const polar = (fn, steps = 180) => {
  let d = '';
  for (let i = 0; i <= steps; i++) { const a = (i * 360) / steps; d += (i ? 'L' : 'M') + pt(P(fn(a), a)); }
  return d + 'Z';
};
// four-point glint centered at (x, y): long points R, waist r
const glint = (x, y, R, r = R * 0.2) => `M${n2(x)} ${n2(y - R)}Q${n2(x + r)} ${n2(y - r)} ${n2(x + R)} ${n2(y)}Q${n2(x + r)} ${n2(y + r)} ${n2(x)} ${n2(y + R)}` +
  `Q${n2(x - r)} ${n2(y + r)} ${n2(x - R)} ${n2(y)}Q${n2(x - r)} ${n2(y - r)} ${n2(x)} ${n2(y - R)}Z`;
// tiny seeded random so every frame is drawn the same way each time
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// soft neon tube: wide faint, medium, core, hot center
const neon = (d, color, w, core = '#ffffff') => `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".12" stroke-linecap="round" style="${sw(w * 4.5)}"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".32" stroke-linecap="round" style="${sw(w * 2.2)}"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-linecap="round" style="${sw(w)}"/>` +
  `<path d="${d}" fill="none" stroke="${core}" stroke-opacity=".75" stroke-linecap="round" style="${sw(w * 0.38)}"/>`;
const circlePath = (r) => `M${50 - r} 50a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
// a trail of arc pieces fading toward a0 (head at a1)
const trail = (r, a0, a1, color, w, pieces = 10) => {
  let s = '';
  const step = (a1 - a0) / pieces;
  for (let i = 0; i < pieces; i++) {
    s += `<path d="${arc(r, a0 + i * step, a0 + (i + 1) * step + step * 0.15)}" fill="none" stroke="${color}" stroke-opacity="${n2(((i + 1) / pieces) ** 1.6)}" stroke-linecap="butt" style="${sw(w)}"/>`;
  }
  return s;
};

const L = (cls, body, defs = '') =>
  `<svg class="fl ${cls}" viewBox="-15 -15 130 130" aria-hidden="true" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

const LIME = '#c6ff3d', CYAN = '#3de0ff';

// Each builder returns the frame's markup (a stack of <svg> layers). '@@' becomes a unique id prefix per mount.
const BUILD = {
  'neon-ring'() {
    return L('l1', neon(circlePath(54), LIME, 2.2, '#f6ffe0') + neon(circlePath(50.6), CYAN, 1.1, '#e6fbff')) +
      L('l2', trail(54, -175, -92, '#f4ffd2', 2.6, 12) + `<circle cx="${P(54, -90)[0]}" cy="${P(54, -90)[1]}" r="6.5" fill="${LIME}" opacity=".22"/>` +
        `<circle cx="${P(54, -90)[0]}" cy="${P(54, -90)[1]}" r="2.6" fill="#ffffff"/>`) +
      L('l3', `<path d="${arc(50.6, 20, 44)}" fill="none" stroke="#e6fbff" stroke-linecap="round" style="${sw(1.5)}"/>` +
        `<path d="${arc(50.6, 200, 224)}" fill="none" stroke="#e6fbff" stroke-linecap="round" style="${sw(1.5)}"/>`);
  },

  pulse() {
    // a heartbeat trace built into the ring at the top
    const beat = [[-128, 53], [-104, 53], [-99, 49.5], [-95, 53], [-91, 63.5], [-87, 44], [-83, 55.5], [-80, 53], [-52, 53]];
    let d = `M${pt(P(53, -52))}A53 53 0 1 1 ${pt(P(53, -128))}`;
    for (const [a, r] of beat) d += 'L' + pt(P(r, a));
    const wave = (c) => `<circle cx="50" cy="50" r="53" fill="none" stroke="${c}" style="${sw(1.8)}"/>`;
    return L('l2', wave('#ff5a36')) + L('l3', wave('#ffb020')) +
      L('l1', neon(d, '#ff3b30', 2, '#ffe2d6').replaceAll('stroke-linecap="round"', 'stroke-linecap="round" stroke-linejoin="round"'));
  },

  orbit() {
    const slate = '#b4c3e6';
    const pl = P(62, -90), moon = P(56.5, 30), sat = P(62, 90);
    return L('l1', ring(51, CYAN, 1.3, 'stroke-opacity=".95"') +
        ring(56.5, slate, 1.1, 'stroke-opacity=".9" stroke-dasharray="2 2.6"') + ring(62, slate, 1, 'stroke-opacity=".8" stroke-dasharray="1 3"')) +
      L('l2', trail(62, -155, -95, CYAN, 1.7, 10) +
        `<circle cx="${pl[0]}" cy="${pl[1]}" r="7.5" fill="${CYAN}" opacity=".18"/>` +
        `<circle cx="${pl[0]}" cy="${pl[1]}" r="4.6" fill="url(#@@pl)"/>` +
        `<ellipse cx="${pl[0]}" cy="${pl[1]}" rx="8" ry="2.3" fill="none" stroke="#ffd36b" transform="rotate(-18 ${pl[0]} ${pl[1]})" style="${sw(1)}"/>` +
        `<path d="M${pl[0] - 4.5} ${pl[1] - 0.2}a4.6 4.6 0 0 0 9 0" fill="url(#@@pl)" transform="rotate(-18 ${pl[0]} ${pl[1]})"/>` +
        trail(62, 45, 86, '#ffb020', 1.1, 6) + `<circle cx="${sat[0]}" cy="${sat[1]}" r="2" fill="#ffc34d"/>`,
      `<radialGradient id="@@pl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8fdff"/><stop offset=".45" stop-color="${CYAN}"/><stop offset="1" stop-color="#0d6c96"/></radialGradient>`) +
      L('l3', trail(56.5, 78, 34, LIME, 1.5, 8) + `<circle cx="${moon[0]}" cy="${moon[1]}" r="5" fill="${LIME}" opacity=".2"/>` +
        `<circle cx="${moon[0]}" cy="${moon[1]}" r="2.7" fill="${LIME}"/><circle cx="${moon[0] - 0.8}" cy="${moon[1] - 0.8}" r=".9" fill="#f4ffd6"/>`);
  },

  flame() {
    const rnd = seeded(7);
    const tongues = (count, offset, base, vary, up, width, fill, opacity) => {
      let s = '';
      for (let i = 0; i < count; i++) {
        const a = offset + (i * 360) / count;
        const ux = Math.cos(rad(a)), uy = Math.sin(rad(a));
        const upness = Math.max(0, -uy);
        let dx = ux, dy = uy - 0.6; // flames lean upward
        const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        const len = base + rnd() * vary + up * upness;
        const nx = -dy, ny = dx;
        const bx = C + ux * 47, by = C + uy * 47;
        const curl = (rnd() - 0.5) * width * 0.7;
        const tx = bx + dx * len + nx * curl, ty = by + dy * len + ny * curl;
        const w = width / 2;
        s += `<path d="M${n2(bx + nx * w)} ${n2(by + ny * w)}Q${n2(bx + nx * w * 1.25 + dx * len * 0.55)} ${n2(by + ny * w * 1.25 + dy * len * 0.55)} ${n2(tx)} ${n2(ty)}` +
          `Q${n2(bx - nx * w * 1.25 + dx * len * 0.55)} ${n2(by - ny * w * 1.25 + dy * len * 0.55)} ${n2(bx - nx * w)} ${n2(by - ny * w)}Z"/>`;
      }
      return `<g fill="${fill}" fill-opacity="${opacity}">${s}</g>`;
    };
    let embers = '', embers2 = '';
    for (const [x, y, r] of [[30, 2, 1.1], [44, -8, 0.8], [61, -4, 1.2], [73, 6, 0.9], [52, -12, 0.7]]) embers += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    for (const [x, y, r] of [[36, -3, 0.9], [57, -9, 1], [67, 0, 0.8], [24, 10, 0.8]]) embers2 += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
    return L('l1', tongues(22, 4, 8, 5, 8, 11, '#ff3d1a', 0.92)) +
      L('l2', tongues(22, 12, 5, 4, 6, 9, '#ff8c1a', 0.95)) +
      L('l3', tongues(26, 0, 2.5, 3, 4, 6.5, '#ffd84a', 1) + ring(50, '#ff6a1a', 6, 'stroke-opacity=".3"') + ring(50, '#ffb347', 2.2)) +
      L('l4 d', `<g fill="#ffd36b">${embers}</g>`) + L('l5 d', `<g fill="#ff9a3d">${embers2}</g>`);
  },

  frost() {
    const rnd = seeded(11);
    let shards = '';
    for (let i = 0; i < 30; i++) {
      const a = i * 12 + (rnd() - 0.5) * 5;
      const hang = Math.sin(rad(a)) > 0.45; // the bottom grows icicles
      const [bx, by] = P(53, a);
      let dx = Math.cos(rad(a)), dy = Math.sin(rad(a));
      if (hang) { dx *= 0.25; dy = 1; const m = Math.hypot(dx, dy); dx /= m; dy /= m; }
      const len = hang ? 5 + rnd() * 7 : 2 + rnd() * 4.5;
      const w = hang ? 1.6 : 1.3, nx = -dy, ny = dx;
      shards += `<path d="M${n2(bx + nx * w)} ${n2(by + ny * w)}L${n2(bx + dx * len)} ${n2(by + dy * len)}L${n2(bx - nx * w)} ${n2(by - ny * w)}Z"/>`;
    }
    const flake = (x, y, s) => {
      let d = '';
      for (let k = 0; k < 6; k++) {
        const a = k * 60 - 90, c = Math.cos(rad(a)), si = Math.sin(rad(a));
        d += `M${n2(x)} ${n2(y)}l${n2(c * s)} ${n2(si * s)}`;
        const bx = x + c * s * 0.6, by = y + si * s * 0.6;
        for (const t of [-45, 45]) d += `M${n2(bx)} ${n2(by)}l${n2(Math.cos(rad(a + t)) * s * 0.35)} ${n2(Math.sin(rad(a + t)) * s * 0.35)}`;
      }
      return `<path d="${d}" fill="none" stroke="#ffffff" stroke-linecap="round" style="${sw(0.8)}"/>`;
    };
    const f1 = P(59, -128), f2 = P(59.5, -52), f3 = P(58, 8);
    const g1 = P(57, -98), g2 = P(55, 38), g3 = P(58, 196);
    return L('l1', ring(52, '#bdf0ff', 9, 'stroke-opacity=".18"') + ring(52, 'url(#@@ice)', 4.2) + ring(49.9, '#ffffff', 0.6, 'stroke-opacity=".7"') +
        `<g fill="#e3f8ff" stroke="#8fdcff" stroke-linejoin="round" style="${sw(0.4)}">${shards}</g>`,
      `<linearGradient id="@@ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#a9e9ff"/><stop offset="1" stop-color="#4fbfff"/></linearGradient>`) +
      L('l2', `<path d="${arc(52, -150, -118)}" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-opacity=".9" style="${sw(2.2)}"/>`) +
      L('l3 d', flake(f1[0], f1[1], 5.5) + flake(f2[0], f2[1], 4.8) + flake(f3[0], f3[1], 4)) +
      L('l4', [g1, g2, g3].map(([x, y], i) => `<path class="tw fb" style="animation-delay:${-i * 0.9}s" d="${glint(x, y, 4.2 - i * 0.6)}" fill="#ffffff"/>`).join(''));
  },

  circuit() {
    const gold = '#ffc54d', pcb = '#0f3b2a', edge = '#2bd47e';
    const rnd = seeded(5);
    let traces = '', pads = '', lit = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 8, turn = (i % 2 ? 1 : -1) * (6 + rnd() * 5);
      const far = i % 3 === 0 ? 64 : 59.5;
      const p0 = P(51.5, a), p1 = P(55, a), p2 = P(55.6, a + turn), p3 = P(far - 1.6, a + turn), pad = P(far, a + turn);
      traces += `M${pt(p0)}L${pt(p1)}L${pt(p2)}L${pt(p3)}`;
      pads += `<circle cx="${pad[0]}" cy="${pad[1]}" r="1.6"/>`;
      lit += `<circle class="bl" style="animation-delay:${n2(-i * 0.21)}s" cx="${pad[0]}" cy="${pad[1]}" r="1"/>`;
    }
    const chip = (a) => {
      const [x, y] = P(55.2, a);
      let pins = '';
      for (const px of [-2.2, 0, 2.2]) pins += `<path d="M${px} -2.4v-1.3M${px} 2.4v1.3"/>`;
      return `<g transform="translate(${x} ${y}) rotate(${a + 90})"><g stroke="#9fb0c4" style="${sw(0.6)}">${pins}</g>` +
        `<rect x="-3.6" y="-2.4" width="7.2" height="4.8" rx=".6" fill="#151a21" stroke="#9fb0c4" style="${sw(0.5)}"/><circle cx="-2.3" cy="-1.1" r=".5" fill="#9fb0c4"/></g>`;
    };
    const data = [0, 120, 240].map((a) => trail(55, a - 22, a, CYAN, 1.6, 7)).join('');
    return L('l1', ring(55, pcb, 9) + ring(50.9, edge, 0.8, 'stroke-opacity=".85"') + ring(59.4, edge, 0.6, 'stroke-opacity=".55"') +
        `<path d="${traces}" fill="none" stroke="${gold}" stroke-linejoin="round" style="${sw(1)}"/>` +
        `<g fill="${pcb}" stroke="${gold}" style="${sw(0.8)}">${pads}</g>` + chip(-45) + chip(135)) +
      L('l2', data) + L('l3', `<g fill="${CYAN}">${lit}</g>`);
  },

  glitch() {
    const base = (c) => `<circle cx="50" cy="50" r="53" fill="none" stroke="${c}" stroke-dasharray="74 5 96 3.5 52 7 92 3.5" style="${sw(2.4)}"/>` +
      `<path d="${arc(57.5, 18, 46)}" fill="none" stroke="${c}" style="${sw(2.4)}"/><path d="${arc(48.8, 198, 222)}" fill="none" stroke="${c}" style="${sw(2)}"/>`;
    const bars = [[66, 10, 26, 2.2, '#ffffff'], [-9, 74, 15, 1.7, CYAN], [98, 38, 13, 1.5, '#ff3b3b'], [26, 104, 22, 1.9, LIME], [6, 20, 9, 1.4, '#ffffff'], [84, 88, 11, 1.4, CYAN]];
    const blocks = [[101, 58, 3], [-6, 46, 2.4], [70, -4, 2.2], [14, 96, 2.6]];
    return L('l2', base('#ff3b3b')) + L('l3', base(CYAN)) + L('l1', base('#f2f8ff')) +
      L('l4', bars.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('') +
        blocks.map(([x, y, s]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#f2f8ff"/>`).join(''));
  },

  halo() {
    const back = `M19 -6A31 7.5 0 0 1 81 -6`, front = `M19 -6A31 7.5 0 0 0 81 -6`;
    let sparks = '';
    for (const [x, y, s, i] of [[11, -9, 3.4, 0], [90, -13, 2.6, 1], [80, 6, 2, 2]]) {
      sparks += `<path class="tw fb" style="animation-delay:${-i * 0.7}s" d="${glint(x, y, s)}" fill="#fff8dc"/>`;
    }
    return L('l1', `<ellipse cx="50" cy="8" rx="34" ry="14" fill="url(#@@hl)"/>` + ring(51.4, 'url(#@@hr)', 1.4),
      `<radialGradient id="@@hl"><stop offset="0" stop-color="#fff3c4" stop-opacity=".32"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="@@hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".6" stop-color="#ffe08a" stop-opacity=".55"/><stop offset="1" stop-color="#ffe08a" stop-opacity=".15"/></linearGradient>`) +
      L('l2', `<ellipse cx="50" cy="-6" rx="42" ry="14" fill="url(#@@hg)"/>` +
        `<path d="${back}" fill="none" stroke="#c99530" style="${sw(3.2)}"/>` +
        `<path d="${front}" fill="none" stroke="#fff3b8" stroke-opacity=".3" stroke-linecap="round" style="${sw(9)}"/>` +
        `<path d="${front}" fill="none" stroke="url(#@@hf)" stroke-linecap="round" style="${sw(4.8)}"/>` +
        `<path d="M30 -0.6A31 7.5 0 0 0 64 0.6" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-opacity=".95" style="${sw(1.1)}"/>`,
      `<radialGradient id="@@hg"><stop offset="0" stop-color="#fff6d6" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d6" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="@@hf" x1="0" x2="1"><stop offset="0" stop-color="#ffcf4a"/><stop offset=".5" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffcf4a"/></linearGradient>`) +
      L('l3 d', sparks);
  },

  thorns() {
    const vineA = polar((a) => 54 + 2.6 * Math.sin(rad(6 * a))), vineB = polar((a) => 54 + 2.6 * Math.sin(rad(6 * a + 180)));
    let thorns = '';
    const thorn = (a, r, out, len) => {
      const [x, y] = P(r, a), ux = Math.cos(rad(a)) * out, uy = Math.sin(rad(a)) * out, nx = -uy, ny = ux;
      return `M${n2(x + nx * 1.3)} ${n2(y + ny * 1.3)}Q${n2(x + ux * len * 0.5 + nx * 0.2)} ${n2(y + uy * len * 0.5 + ny * 0.2)} ${n2(x + ux * len + nx * 0.9)} ${n2(y + uy * len + ny * 0.9)}` +
        `Q${n2(x + ux * len * 0.3 - nx * 0.4)} ${n2(y + uy * len * 0.3 - ny * 0.4)} ${n2(x - nx * 1.3)} ${n2(y - ny * 1.3)}Z`;
    };
    for (let k = 0; k < 6; k++) {
      thorns += thorn(15 + k * 60, 56.4, 1, 5.2) + thorn(45 + k * 60, 56.4, 1, 4.6) + thorn(30 + k * 60, 51.8, -1, 2.6);
    }
    const leaf = (a, s, flip) => {
      const [x, y] = P(56, a);
      return `<g transform="translate(${x} ${y}) rotate(${a + (flip ? 140 : 40)}) scale(${s})"><path d="M0 0Q4 -3.4 9 0Q4 3.4 0 0Z" fill="#6fcf4a"/>` +
        `<path d="M.6 0H8" stroke="#2f7a2f" style="${sw(0.5)}"/></g>`;
    };
    const berries = [[-62, 57.5], [112, 58], [196, 57]].map(([a, r]) => {
      const [x, y] = P(r, a);
      return `<circle cx="${x}" cy="${y}" r="2.1" fill="#e8322a"/><circle cx="${n2(x - 0.6)}" cy="${n2(y - 0.7)}" r=".6" fill="#ffd6c9"/>`;
    }).join('');
    return L('l1', `<path d="${vineB}" fill="none" stroke="#174a25" style="${sw(3.4)}"/><path d="${vineB}" fill="none" stroke="#3f8f45" style="${sw(1.2)}"/>` +
        `<path d="${vineA}" fill="none" stroke="#1d5a2c" style="${sw(3.4)}"/><path d="${vineA}" fill="none" stroke="#5cb84f" style="${sw(1.2)}"/>` +
        `<path d="${thorns}" fill="#c8dc8c"/>` + berries) +
      L('l2 d', leaf(-100, 1, false) + leaf(-20, 0.85, true) + leaf(70, 0.9, false) + leaf(150, 1, true) + leaf(232, 0.8, false));
  },

  sparkle() {
    // two clusters (top right, bottom left) and two loners; each glint has a soft glow behind it
    const items = [[-58, 58.5, 10, '#ffffff'], [-31, 62.5, 5, '#ffe58a'], [-82, 62.5, 3.6, '#a6f4ff'], [128, 58.5, 8.5, '#ffe58a'],
      [153, 62, 4.6, '#ffffff'], [104, 62.5, 3.2, '#a6f4ff'], [22, 59.5, 5.2, '#a6f4ff'], [214, 60, 4.6, '#ffffff']];
    const stars = items.map(([a, r, s, c], i) => {
      const [x, y] = P(r, a);
      return `<g class="sp fb${s < 4 ? ' d' : ''}" style="animation-delay:${n2(-i * 0.37)}s"><circle cx="${x}" cy="${y}" r="${n2(s * 0.85)}" fill="url(#@@sglow)"/>` +
        `<path d="${glint(x, y, s, s * 0.17)}" fill="${c}"/></g>`;
    }).join('');
    return L('l1', ring(52, 'url(#@@sg)', 6, 'stroke-opacity=".22"') + ring(52, 'url(#@@sg)', 1.9) +
        `<circle class="d" cx="50" cy="50" r="56.5" fill="none" stroke="#fff6d6" stroke-opacity=".55" stroke-linecap="round" stroke-dasharray="0 4.437" style="${sw(1.1)}"/>`,
      `<linearGradient id="@@sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ffe58a"/><stop offset="1" stop-color="#a6f4ff"/></linearGradient>`) +
      L('l2', stars, `<radialGradient id="@@sglow"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`);
  },

  wave() {
    const a = polar((t) => 55.5 + 2.6 * Math.sin(rad(7 * t))), b = polar((t) => 55.5 + 2.6 * Math.sin(rad(7 * t + 180)));
    const foam = polar((t) => 60.5 + 1.6 * Math.sin(rad(5 * t)));
    let drops = '';
    for (let k = 0; k < 7; k += 2) { const [x, y] = P(59.2, k * (360 / 7) + 360 / 28); drops += `<circle cx="${x}" cy="${y}" r="1"/>`; }
    return L('l1', ring(50.8, '#1fb6ff', 1, 'stroke-opacity=".55"')) +
      L('l2', `<path d="${a}" fill="none" stroke="${CYAN}" stroke-opacity=".2" style="${sw(5.5)}"/><path d="${a}" fill="none" stroke="${CYAN}" style="${sw(2.2)}"/>` +
        `<g class="d" fill="#c9f6ff">${drops}</g>`) +
      L('l3', `<path d="${b}" fill="none" stroke="#2ef2d0" stroke-opacity=".9" style="${sw(1.6)}"/>`) +
      L('l4 d', `<path d="${foam}" fill="none" stroke="#c9f6ff" stroke-opacity=".5" stroke-dasharray="7 4" style="${sw(0.8)}"/>`);
  },

  hex() {
    const hexPath = (R, rot, cx = 50, cy = 50) => {
      let d = '';
      for (let k = 0; k < 6; k++) { const a = rad(rot + k * 60); d += (k ? 'L' : 'M') + `${n2(cx + R * Math.cos(a))} ${n2(cy + R * Math.sin(a))}`; }
      return d + 'Z';
    };
    let cells = '', nodes = '';
    for (let k = 0; k < 6; k++) {
      const [x, y] = P(61, -90 + k * 60), [x2, y2] = P(58.6, -60 + k * 60);
      cells += `<path class="cl" style="animation-delay:${n2(-k * 0.4)}s" d="${hexPath(3.3, -90, x, y)}"/>`;
      cells += `<path class="cl" style="animation-delay:${n2(-k * 0.4 - 0.2)}s" d="${hexPath(2.4, 0, x2, y2)}"/>`;
      nodes += `<circle cx="${x}" cy="${y}" r="1"/>`;
    }
    return L('l1', ring(51, LIME, 0.9, 'stroke-opacity=".4"')) +
      L('l2', neon(hexPath(61, -90), LIME, 1.7, '#f4ffd8').replaceAll('stroke-linecap="round"', 'stroke-linejoin="round"') +
        `<path d="${hexPath(58.6, 0)}" fill="none" stroke="${CYAN}" stroke-opacity=".75" stroke-linejoin="round" style="${sw(0.9)}"/>` +
        `<g fill="${LIME}" fill-opacity=".18" stroke="${LIME}" style="${sw(0.6)}">${cells}</g><g fill="#ffffff">${nodes}</g>`);
  },

  crown() {
    const body = 'M27 6L24.5 -9.5L35.5 -1.5L39.8 -13.5L45.8 -2.6L50 -18L54.2 -2.6L60.2 -13.5L64.5 -1.5L75.5 -9.5L73 6Q50 10.5 27 6Z';
    const band = 'M26.4 1Q50 6 73.6 1L73 6Q50 10.5 27 6Z';
    const tips = [[24.5, -9.5, 2], [39.8, -13.5, 2.1], [50, -18, 2.5], [60.2, -13.5, 2.1], [75.5, -9.5, 2]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff1a0" stroke="#7a4b00" style="${sw(0.6)}"/>`).join('');
    const gem = (x, y, rx, ry, c) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" stroke="#7a4b00" style="${sw(0.5)}"/><circle cx="${n2(x - rx * 0.35)}" cy="${n2(y - ry * 0.35)}" r="${n2(rx * 0.3)}" fill="#ffffff" opacity=".85"/>`;
    let beads = '';
    for (const a of [20, 55, 90, 125, 160]) { const [x, y] = P(51.6, a); beads += `<circle cx="${x}" cy="${y}" r="1.5"/>`; }
    return L('l1', ring(51.6, 'url(#@@rg)', 2.2) + `<g class="d" fill="#ffe38a" stroke="#9a6a10" style="${sw(0.4)}">${beads}</g>`,
      `<linearGradient id="@@rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f2b92a"/><stop offset="1" stop-color="#b87a10"/></linearGradient>`) +
      L('l2', `<g transform="rotate(-7 50 0)"><path d="${body}" fill="url(#@@cg)" stroke="#7a4b00" stroke-linejoin="round" style="${sw(0.8)}"/>` +
        `<path d="${band}" fill="#d8961a" fill-opacity=".55"/>` +
        `<g clip-path="url(#@@cc)"><g class="sh"><rect x="4" y="-24" width="5" height="40" fill="#ffffff" opacity=".6" transform="skewX(-20)"/></g></g>` +
        tips + gem(50, 5.2, 2.8, 2.2, CYAN) + gem(38.5, 4, 1.7, 1.5, LIME) + gem(61.5, 4, 1.7, 1.5, '#ff4d3d') +
        `<path d="M29.5 -4.5L31 2.6" stroke="#fff7cc" stroke-linecap="round" opacity=".8" style="${sw(0.9)}"/></g>`,
      `<linearGradient id="@@cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset=".55" stop-color="#ffcf33"/><stop offset="1" stop-color="#e09412"/></linearGradient>` +
        `<clipPath id="@@cc"><path d="${body}"/></clipPath>`);
  },

  lightning() {
    const rnd = seeded(23);
    // a jagged arc hugging the ring: zig-zags in and out with uneven steps, plus one fork flicking outward
    const bolt = (a0, a1) => {
      const steps = 8, span = a1 - a0;
      let d = `M${pt(P(52, a0))}`, branch = '';
      for (let i = 1; i <= steps; i++) {
        const a = a0 + (span * (i + (i < steps ? (rnd() - 0.5) * 0.7 : 0))) / steps;
        const r = i === steps ? 52 : 55.5 + (i % 2 ? 1 : -1) * (1.6 + rnd() * 3.4);
        d += `L${pt(P(r, a))}`;
        if (i === 3) {
          const s = span / steps;
          branch = `M${pt(P(r, a))}L${pt(P(r + 3.2, a + s * 0.5))}L${pt(P(r + 2.2, a + s * 0.9))}L${pt(P(r + 6.5, a + s * 1.5))}`;
        }
      }
      return d + branch;
    };
    const bw = (w) => `stroke-width:calc(var(--k) * var(--bk, 1) * ${w}px)`; // --bk thickens the bolts further at chat size
    const draw = (d) => `<path d="${d}" fill="none" stroke="#2f8cff" stroke-opacity=".45" stroke-linejoin="round" stroke-linecap="round" style="${bw(3.4)}"/>` +
      `<path d="${d}" fill="none" stroke="#dff6ff" stroke-linejoin="round" stroke-linecap="round" style="${bw(1.1)}"/>`;
    return L('l1', ring(52, '#4db8ff', 5, 'stroke-opacity=".22"') + ring(52, '#4db8ff', 1.4) + ring(50.6, '#bfe9ff', 0.5, 'stroke-opacity=".7"')) +
      L('l2', draw(bolt(-160, -70) + bolt(30, 110))) + L('l3', draw(bolt(-60, 15) + bolt(150, 235))) + L('l4', draw(bolt(-15, 60) + bolt(105, 185)));
  },

  pixel() {
    const cs = 5, hues = ['#ff4d3d', '#ff9a2e', '#ffe14d', '#c6ff3d', '#3de0ff', '#3d8bff'], dark = ['#b82d22', '#c26a14', '#c9a91c', '#79b81a', '#1d9fbf', '#2559b8'];
    const segs = Array.from({ length: 12 }, () => '');
    let cells = '';
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const x = -15 + i * cs, y = -15 + j * cs, cx = x + cs / 2, cy = y + cs / 2;
        const d = Math.hypot(cx - C, cy - C);
        if (d < 51 || d > 60) continue;
        const ang = (Math.atan2(cy - C, cx - C) * 180) / Math.PI + 90; // 0 at the top
        const k = Math.floor((((ang % 360) + 360) % 360) / 60);
        cells += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" fill="${d > 56 ? dark[k] : hues[k]}"/>`;
        if (d < 56) segs[Math.floor((((ang % 360) + 360) % 360) / 30)] += `<rect x="${x + 1}" y="${y + 1}" width="${cs - 2}" height="${cs - 2}"/>`;
      }
    }
    const plus = (x, y, i) => `<path class="pb" style="animation-delay:${-i * 0.35}s" d="M${x} ${y - 3.75}h2.5v2.5h2.5v2.5h-2.5v2.5h-2.5v-2.5h-2.5v-2.5h2.5Z" transform="translate(-1.25 0)"/>`;
    return L('l1', ring(53.2, '#070a12', 5.4) + `<g shape-rendering="crispEdges">${cells}</g>`) +
      L('l2', `<g fill="#ffffff" shape-rendering="crispEdges">${segs.map((s, i) => `<g class="ch" style="animation-delay:${n2(i * 0.1)}s">${s}</g>`).join('')}</g>`) +
      L('l3 d', `<g fill="#ffffff" shape-rendering="crispEdges">${plus(-6, -6, 0) + plus(106, -4, 1) + plus(104, 104, 2) + plus(-4, 106, 3)}</g>`);
  },

  vortex() {
    // crescent arms: thin at both ends, widest in the middle; colored by distance from the center (bright inside)
    const arm = (a0, r0, r1, sweep, w) => {
      const pts = 22, outer = [], inner = [];
      for (let i = 0; i <= pts; i++) {
        const t = i / pts, r = r0 + (r1 - r0) * t, a = a0 + sweep * t, half = (w * Math.sin(Math.PI * t) ** 0.7) / 2 + 0.04;
        outer.push(pt(P(r + half, a))); inner.push(pt(P(r - half, a)));
      }
      return `M${outer.join('L')}L${inner.reverse().join('L')}Z`;
    };
    let inner = '', outer = '';
    for (let k = 0; k < 6; k++) inner += `<path d="${arm(k * 60, 50.2, 64.5, 150, 4.6)}"/>`;
    for (let k = 0; k < 8; k++) outer += `<path d="${arm(k * 45 + 22, 52, 64, 95, 1.7)}" fill="${k % 2 ? LIME : '#9ff3ff'}" fill-opacity=".55"/>`;
    return L('l1', ring(52.4, '#03101c', 5) + ring(50.6, CYAN, 0.9)) + L('l3 d', outer) +
      L('l2', `<g fill="url(#@@vx)">${inner}</g>`,
        `<radialGradient id="@@vx" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="65"><stop offset=".76" stop-color="#f2feff"/>` +
          `<stop offset=".84" stop-color="${CYAN}"/><stop offset=".93" stop-color="#2b7bff" stop-opacity=".85"/><stop offset="1" stop-color="#2b7bff" stop-opacity="0"/></radialGradient>`);
  },

  stars() {
    const rnd = seeded(31);
    const groups = ['', '', ''];
    for (let i = 0; i < 30; i++) {
      const a = rnd() * 360, r = 52 + rnd() * 8, s = 0.4 + rnd() * 0.65;
      const [x, y] = P(r, a);
      groups[i % 3] += `<circle cx="${x}" cy="${y}" r="${n2(s)}" fill="${['#ffffff', '#fff3c4', '#cfe6ff'][i % 3]}"/>`;
    }
    const big = [[-160, 56], [-20, 57], [60, 55.5], [130, 57.5]].map(([a, r], i) => { const [x, y] = P(r, a); return `<path class="tw fb" style="animation-delay:${-i * 0.6}s" d="${glint(x, y, 2.6)}" fill="#ffffff"/>`; }).join('');
    const [mx, my] = P(56.5, -48);
    const moon = `<circle cx="${mx}" cy="${my}" r="7.5" fill="#fff1b0" opacity=".16"/>` +
      `<path d="M${n2(mx + 1.4)} ${n2(my - 4.3)}A4.5 4.5 0 1 0 ${n2(mx + 4.1)} ${n2(my + 1.9)}A3.6 3.6 0 1 1 ${n2(mx + 1.4)} ${n2(my - 4.3)}Z" fill="#fff1b0"/>`;
    return L('l1', ring(56, 'url(#@@sky)', 11) + ring(50.6, '#5b7fd6', 0.5, 'stroke-opacity=".6"') + ring(61.5, '#5b7fd6', 0.5, 'stroke-opacity=".45"'),
      `<radialGradient id="@@sky" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="62"><stop offset=".81" stop-color="#172c66"/><stop offset=".9" stop-color="#0e1d47"/><stop offset="1" stop-color="#081230"/></radialGradient>`) +
      L('l2', `<g class="t1">${groups[0]}</g><g class="t2">${groups[1]}</g><g class="t3">${groups[2]}</g>${big}`) +
      L('l4', `<path d="${arc(56, -205, -170)}" fill="none" stroke="url(#@@ss)" stroke-linecap="round" style="${sw(1.2)}"/><circle cx="${P(56, -170)[0]}" cy="${P(56, -170)[1]}" r="1.3" fill="#ffffff"/>`,
        `<linearGradient id="@@ss" gradientUnits="userSpaceOnUse" x1="${P(56, -205)[0]}" y1="${P(56, -205)[1]}" x2="${P(56, -170)[0]}" y2="${P(56, -170)[1]}"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`) +
      L('l3', moon);
  },

  shield() {
    const shape = 'M-7 -3Q50 -16 107 -3L107 50Q107 92 50 113Q-7 92 -7 50Z';
    const body = shape + circlePath(50.5);
    const rivets = [[1.5, 4], [98.5, 4], [-2.2, 58], [102.2, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="url(#@@rv)"/>`).join('');
    return L('l1', `<path d="${body}" fill="url(#@@sf)" fill-rule="evenodd"/>` +
        `<path d="${shape}" fill="none" stroke="url(#@@se)" stroke-linejoin="round" style="${sw(3.2)}"/>` +
        `<path d="${shape}" fill="none" stroke="${LIME}" stroke-linejoin="round" transform="translate(50 52) scale(.92) translate(-50 -52)" style="${sw(1)}"/>` +
        ring(51.3, '#c9d4e6', 1.5) + `<g class="d">${rivets}</g>` + `<path d="M50 100.5L53.5 105L50 109.5L46.5 105Z" fill="${LIME}"/>`,
      `<linearGradient id="@@sf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c374d"/><stop offset="1" stop-color="#101622"/></linearGradient>` +
        `<linearGradient id="@@se" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f6fc"/><stop offset=".5" stop-color="#97a5bd"/><stop offset="1" stop-color="#5d6880"/></linearGradient>` +
        `<radialGradient id="@@rv" cx=".35" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#7a879e"/></radialGradient>`) +
      L('l2', `<g clip-path="url(#@@sc)"><g class="sh"><rect x="-40" y="-20" width="14" height="140" fill="#ffffff" opacity=".22" transform="skewX(-18)"/></g></g>`,
        `<clipPath id="@@sc"><path d="${body}" clip-rule="evenodd"/></clipPath>`);
  },

  drip() {
    const slime = '#9be22d', edge = '#4c8a10';
    const drips = [[25, 9, 3.4], [55, 10.5, 3.8], [93, 11, 4.2], [127, 10, 3.6], [160, 7.5, 3.2]].map(([a, len, w], i) => {
      const [x, y] = P(51.5, a), h = w / 2;
      return `<g class="dr" style="animation-delay:${n2(-i * 0.7)}s"><path d="M${n2(x - h)} ${n2(y - 2)}L${n2(x - h)} ${n2(y + len)}A${h} ${h} 0 0 0 ${n2(x + h)} ${n2(y + len)}L${n2(x + h)} ${n2(y - 2)}Z" fill="${slime}"/>` +
        `<circle cx="${x}" cy="${n2(y + len - 0.4)}" r="${n2(h * 1.28)}" fill="${slime}"/>` +
        `<path d="M${n2(x - h * 0.45)} ${n2(y + 1)}V${n2(y + len - 1.5)}" stroke="#e8ffb0" stroke-linecap="round" opacity=".75" style="${sw(0.7)}"/></g>`;
    }).join('');
    const blobs = [[-150, 3.4], [-118, 2.8], [-76, 3.6], [-38, 3]].map(([a, r]) => { const [x, y] = P(53.2, a); return `<circle cx="${x}" cy="${y}" r="${r}"/>`; }).join('');
    const drop = (a, len, i) => { const [x, y] = P(51.5, a); return `<path class="fall" style="animation-delay:${-i * 1.1}s" d="M${x} ${n2(y + len + 3)}q1.6 2.6 0 3.6q-1.6 -1 0 -3.6Z" fill="${slime}"/>`; };
    return L('l1', ring(52, edge, 6.6) + ring(52, slime, 5) + `<g fill="${slime}">${blobs}</g>` + drips +
        `<path d="${arc(53.4, -165, -112)}" fill="none" stroke="#efffc4" stroke-linecap="round" style="${sw(1.2)}"/>` +
        `<path d="${arc(53.4, -70, -44)}" fill="none" stroke="#efffc4" stroke-linecap="round" style="${sw(1)}"/>` + ring(49.4, edge, 0.8)) +
      L('l2 d', drop(55, 10.5, 0) + drop(127, 10, 1));
  },

  eclipse() {
    const rnd = seeded(41);
    let raysA = '', raysB = '';
    for (let i = 0; i < 40; i++) {
      const a = i * 9 + rnd() * 5, r1 = 56 + rnd() * 8.5;
      raysA += `<path d="M${pt(P(51.5, a))}L${pt(P(r1, a))}" style="${sw(0.5 + rnd() * 0.7)}" stroke-opacity="${n2(0.45 + rnd() * 0.5)}"/>`;
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 20 + rnd() * 10, r1 = 58 + rnd() * 6.5, bend = (rnd() - 0.5) * 9;
      raysB += `<path d="M${pt(P(51.5, a))}Q${pt(P((51.5 + r1) / 2, a + bend))} ${pt(P(r1, a + bend * 1.6))}" style="${sw(0.4 + rnd() * 0.5)}"/>`;
    }
    const [dx, dy] = P(51, -38);
    return L('l1', `<circle cx="50" cy="50" r="64" fill="url(#@@cor)"/>` + ring(50.4, '#020306', 0.9),
      `<radialGradient id="@@cor" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="64"><stop offset=".77" stop-color="#fffaf0" stop-opacity="0"/>` +
        `<stop offset=".79" stop-color="#fffaf0" stop-opacity=".95"/><stop offset=".85" stop-color="#ffd36b" stop-opacity=".45"/><stop offset="1" stop-color="#ff9a1a" stop-opacity="0"/></radialGradient>`) +
      L('l2', `<g fill="none" stroke="url(#@@ray)" stroke-linecap="round">${raysA}</g>`,
        `<radialGradient id="@@ray" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="65"><stop offset=".78" stop-color="#fffaf0"/><stop offset=".9" stop-color="#ffd36b" stop-opacity=".7"/><stop offset="1" stop-color="#ff9a1a" stop-opacity="0"/></radialGradient>`) +
      L('l3 d', `<g fill="none" stroke="url(#@@ray2)" stroke-linecap="round" stroke-opacity=".7">${raysB}</g>`,
        `<radialGradient id="@@ray2" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="65"><stop offset=".78" stop-color="#fff4d6"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`) +
      L('l4', `<circle cx="${dx}" cy="${dy}" r="6" fill="#fff6d0" opacity=".35"/><path class="dm fb" d="${glint(dx, dy, 8, 1.1)}" fill="#ffffff"/><circle cx="${dx}" cy="${dy}" r="2.2" fill="#ffffff"/>`);
  },
};

const markup = new Map();
let uid = 0;
let io = null;

function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.target.isConnected && e.target._fpStop) { e.target._fpStop(); continue; } // removed from the page: let go of it
      e.target.classList.toggle('is-off', !e.isIntersecting);
    }
  }, { rootMargin: '64px' });
  return io;
}

/**
 * Puts frame `id` over the avatar element `el` (replacing any frame it had). null / unknown id just removes the frame.
 * opts.size: avatar size in px (default: measured); opts.motion: 'auto' (default), 'hover' (still until the avatar is
 * hovered or the frame has .is-hot) or 'off' (always still).
 * @returns {{ el: HTMLElement|null, stop(): void }}
 */
export function mountFrame(el, id, opts = {}) {
  const old = el.querySelector(':scope > .fp-frame');
  if (old && old._fpStop) old._fpStop();
  if (!FRAMES.includes(id)) { el.classList.remove('fp-has-frame'); return { el: null, stop() {} }; }
  if (!markup.has(id)) markup.set(id, BUILD[id]());
  const root = document.createElement('span');
  root.className = 'fp-frame';
  root.dataset.frame = id;
  root.setAttribute('aria-hidden', 'true');
  const size = Number(opts.size) || el.clientWidth || 128;
  if (size < 64) root.classList.add('is-sm');
  if (opts.motion === 'hover') root.classList.add('is-hover');
  if (opts.motion === 'off') root.classList.add('is-still');
  // constant, code-built SVG (never user text); ids made unique so several copies can share a page
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.get(id).replaceAll('@@', `fpf${++uid}-`);
  root.append(tpl.content);
  el.classList.add('fp-has-frame');
  el.append(root);
  const obs = observer();
  if (obs) obs.observe(root);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (obs) obs.unobserve(root);
    root.remove();
    if (!el.querySelector(':scope > .fp-frame')) el.classList.remove('fp-has-frame');
  };
  root._fpStop = stop;
  return { el: root, stop };
}
