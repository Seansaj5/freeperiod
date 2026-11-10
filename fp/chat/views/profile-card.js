// Profile card: banner (picture or color), avatar with its frame, styled name, @username, pronouns, badges, status,
// About me, member since, game stats, and the profile effect over the card. mountCard() is shared by the popout (any
// name or avatar) and the editor's live preview. Text only through textContent; pictures only through mediaSrc.
import { h } from '../../ui.js';
import { cardTheme, isHex, badgeInfo } from '../flair.js';
import { mountEffect } from '../effects.js';
import { roleOfProfile, timedOut, isStaffRole } from '../perms.js';
import { icon, avatar, stopFrames, nameEl, nameOf, badgePills, mediaSrc, timeoutLeft, finePointer } from './common.js';

const fmtMoney = (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + n);
const num = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function statsEl(p) {
  const g = p && p.game_stats;
  if (!g || typeof g !== 'object' || !(g.bb || g.cc || g.hx || g.streak || g.bestStreak)) return null;
  const bb = g.bb || {}, cc = g.cc || {}, hx = g.hx || {};
  const tier = typeof bb.tier === 'string' && bb.tier && bb.tier.toLowerCase() !== 'rookie' ? badgeInfo('bb:' + bb.tier) : null;
  const tile = (cls, ic, game, big, small, color) => h('div', { class: 'cx-pc-stat ' + cls },
    h('span', { class: 'cx-pc-stat-ic', 'aria-hidden': 'true' }, icon(ic)),
    h('span', { class: 'cx-pc-stat-game', text: game }),
    h('b', { text: big, style: color ? '--tc:' + color : null }), h('small', { text: small }));
  const sk = num(g.streak), skBest = Math.max(sk, num(g.bestStreak));
  return h('section', { class: 'cx-pc-sec' }, h('h4', { text: 'Game stats' }),
    h('div', { class: 'cx-pc-stats' },
      skBest ? h('div', { class: 'cx-pc-stat streak' },
        h('span', { class: 'cx-pc-stat-ic', 'aria-hidden': 'true', text: '\u{1F525}' }),
        h('span', { class: 'cx-pc-stat-game', text: 'Daily streak' }),
        h('b', { text: sk + (sk === 1 ? ' day' : ' days'), style: '--tc:#ff7a3d' }), h('small', { text: 'Best ' + skBest })) : null,
      tile('bb', 'trophy', 'Bing Ball', 'Level ' + num(bb.level), tier ? tier.label : 'Unranked', tier && tier.color),
      tile('cc', 'car', 'Close Call', fmtMoney(num(cc.cash)), plural(num(cc.cars), 'car', 'cars')),
      tile('hx', 'ghost', 'horror.exe', plural(num(hx.wins), 'win', 'wins'), plural(num(hx.escapes), 'escape', 'escapes'))));
}

/**
 * Builds a profile card in `el`. opts: { online, viewer (my profile, for the moderation line), localAvatar, localBanner
 * (blob: URLs of the person's own picked files, editor only), actions: () => Node|null, effectSeed }
 * @returns {{ el, update(profile, opts?), stop() }}
 */
export function mountCard(el, profile, opts = {}) {
  el.classList.add('cx-pc');
  const banner = h('div', { class: 'cx-pc-banner' });
  const avBox = h('div', { class: 'cx-pc-av' });
  const pills = h('div', { class: 'cx-pc-badges' });
  const body = h('div', { class: 'cx-pc-body' });
  el.replaceChildren(banner, h('div', { class: 'cx-pc-top' }, avBox, pills), body);
  let p = profile || {}, o = opts;
  let bannerKey = null, avKey = null, fx = null, fxId = null;

  function drawBanner() {
    const color = isHex(p.banner_color) ? p.banner_color : null;
    const key = (o.localBanner || p.banner_path || '') + '|' + (color || '') + '|' + (cardTheme(p) || '');
    if (key === bannerKey) return;
    bannerKey = key;
    banner.replaceChildren();
    banner.style.background = color || '';
    banner.classList.toggle('has-color', !!color);
    const put = (src) => { const img = h('img', { alt: '', src, decoding: 'async' }); img.addEventListener('error', () => img.remove()); banner.append(img); };
    if (o.localBanner && o.localBanner.startsWith('blob:')) put(o.localBanner);
    else if (p.banner_path) mediaSrc({ bucket: 'public-media', path: p.banner_path }).then((src) => { if (src && bannerKey === key) put(src); });
  }
  function drawAvatar() {
    const key = (o.localAvatar || p.avatar_path || '') + '|' + (p.frame || '') + '|' + !!o.online + '|' + nameOf(p) + '|' + p.id;
    if (key === avKey) return;
    avKey = key;
    stopFrames(avBox);
    avBox.replaceChildren(avatar(p, { size: 92, status: o.online == null ? null : o.online ? 'online' : 'offline', frame: 'auto', localSrc: o.localAvatar || '' }));
  }
  function drawEffect() {
    const id = p.effect || null;
    if (id === fxId) return;
    fxId = id;
    if (fx) { fx.stop(); fx = null; }
    if (id) fx = mountEffect(el, id, o.effectSeed != null ? { seed: o.effectSeed } : {});
  }
  function draw() {
    const theme = cardTheme(p);
    el.classList.toggle('themed', !!theme);
    el.style.setProperty('--pc-theme', theme || 'none');
    el.style.setProperty('--pc-ring', isHex(p.theme_a) ? p.theme_a : isHex(p.theme_b) ? p.theme_b : '#0f1522');
    el.dataset.uid = p.id || '';
    drawBanner(); drawAvatar(); drawEffect();
    pills.replaceChildren(...badgePills(p));
    const kids = [];
    const nm = nameEl(p, 'h3', 'cx-pc-name');
    kids.push(h('div', { class: 'cx-pc-names' }, nm,
      h('p', { class: 'cx-pc-user' }, h('span', { text: '@' + (p.username || '') }), p.pronouns ? h('span', { class: 'cx-pc-pro', text: p.pronouns }) : null)));
    if (p.status_text || p.status_emoji) kids.push(h('p', { class: 'cx-pc-status' }, p.status_emoji ? h('span', { class: 'cx-pc-status-e', text: p.status_emoji }) : null, h('span', { text: p.status_text || '' })));
    const viewer = o.viewer || null;
    const self = viewer && viewer.id === p.id;
    if (viewer && (self || isStaffRole(roleOfProfile(viewer)))) {
      if (p.banned) kids.push(h('p', { class: 'cx-pc-mod bad' }, icon('block'), h('span', { text: self ? 'You’re banned from chat. You can still read.' : 'Banned from chat' })));
      else if (timedOut(p)) kids.push(h('p', { class: 'cx-pc-mod' }, icon('clock'), h('span', { text: (self ? 'You’re timed out' : 'Timed out') + ' · ' + timeoutLeft(p.muted_until) + ' min left' + (!self && p.muted_by === 'owner' ? ' (set by Sean)' : '') })));
    }
    const secs = [];
    if (p.about) secs.push(h('section', { class: 'cx-pc-sec' }, h('h4', { text: 'About me' }), h('p', { class: 'cx-pc-about', text: p.about })));
    const joined = Date.parse(p.joined_at || '');
    if (Number.isFinite(joined)) secs.push(h('section', { class: 'cx-pc-sec' }, h('h4', { text: 'Member since' }),
      h('p', { class: 'cx-pc-since' }, icon('sparkle'), h('span', { text: new Date(joined).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) }))));
    const st = statsEl(p);
    if (st) secs.push(st);
    kids.push(h('div', { class: 'cx-pc-panel' }, ...secs));
    const acts = o.actions ? o.actions() : null;
    if (acts) kids.push(acts);
    body.replaceChildren(...kids);
  }
  draw();
  return {
    el,
    update(next, more) { p = next || p; if (more) o = { ...o, ...more }; draw(); },
    stop() { stopFrames(avBox); if (fx) fx.stop(); fx = null; fxId = null; },
  };
}

// ---------- the popout ----------
let open = null;
export function closeProfileCard() { if (open) open.close(); }

/**
 * Opens the card next to `anchor` (a bottom sheet on phones). cx: { me(), myId(), profile(id), online(), isBlocked(id),
 * isStaff(), message(profile) -> Promise, block(profile, on) -> Promise, editProfile(), memberMenu(anchor, profile) -> bool,
 * friendState(id) -> 'none' | 'friends' | 'out' | 'in' (asked me), friend(profile, 'add' | 'accept' | 'remove') -> Promise }
 */
export function openProfileCard(profile, anchor, cx) {
  if (open && open.uid === profile.id && open.anchor === anchor) { open.close(); return null; }
  closeProfileCard();
  const sheet = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
  const wrap = h('div', { class: 'cx-pop' + (sheet ? ' sheet' : ''), role: 'dialog', 'aria-label': nameOf(profile) + '’s profile', tabindex: '-1' });
  const scrim = h('div', { class: 'cx-pop-scrim' + (sheet ? ' dark' : ''), onclick: () => close() });
  const cardEl = h('div');
  const errEl = h('p', { class: 'cx-pc-err', role: 'alert' });
  let p = cx.profile(profile.id) || profile;
  let busy = false;

  // Add friend / Request sent (tap to cancel) / Accept / Friends (tap twice to remove). Hidden when blocked or the page has no friends.
  function friendBtn() {
    if (!cx.friendState || cx.isBlocked(p.id) || p.is_bot || p.banned) return null;
    const s = cx.friendState(p.id);
    const label = { none: 'Add friend', out: 'Request sent', in: 'Accept request', friends: 'Friends' }[s];
    const b = h('button', { type: 'button', class: 'cx-btn ghost cx-pc-friend ' + s, title: s === 'out' ? 'Tap to cancel the request' : s === 'friends' ? 'Tap twice to remove this friend' : label }, icon(s === 'friends' ? 'check' : 'userPlus'), label);
    let armed = 0;
    b.addEventListener('click', async () => {
      if (busy) return;
      if (s === 'friends' && !armed) { b.lastChild.textContent = 'Tap again to remove'; armed = setTimeout(() => { armed = 0; b.lastChild.textContent = label; }, 3500); return; }
      clearTimeout(armed); armed = 0;
      busy = true; errEl.textContent = '';
      try { await cx.friend(p, s === 'none' ? 'add' : s === 'in' ? 'accept' : 'remove'); card.update(p); }
      catch (e) { errEl.textContent = (e && e.shown) || 'Couldn’t do that'; }
      finally { busy = false; }
    });
    return b;
  }
  function actions() {
    const me = cx.me();
    const box = h('div', { class: 'cx-pc-actions' });
    if (!me) return null;
    if (me.id === p.id) {
      box.append(h('button', { type: 'button', class: 'cx-btn', onclick: () => { close(); cx.editProfile(); } }, icon('edit'), 'Edit profile'));
      return h('div', {}, box, errEl);
    }
    const blocked = cx.isBlocked(p.id);
    const msg = h('button', { type: 'button', class: 'cx-btn cx-pc-msg', disabled: blocked }, icon('chat'), 'Message');
    msg.addEventListener('click', async () => {
      if (busy) return;
      busy = true; errEl.textContent = ''; msg.disabled = true;
      try { await cx.message(p); close(); }
      catch (e) { errEl.textContent = (e && e.shown) || 'Couldn’t open a DM'; msg.disabled = false; }
      finally { busy = false; }
    });
    const blk = h('button', { type: 'button', class: 'cx-btn ghost cx-pc-block' + (blocked ? ' on' : ''), title: blocked ? 'Unblock' : 'Block' }, icon('block'), blocked ? 'Unblock' : 'Block');
    blk.addEventListener('click', async () => {
      if (busy) return;
      busy = true; errEl.textContent = '';
      try { await cx.block(p, !blocked); card.update(p); }
      catch (e) { errEl.textContent = (e && e.shown) || 'Couldn’t do that'; }
      finally { busy = false; }
    });
    box.append(msg, friendBtn(), blk);
    if (cx.isStaff()) {
      const mod = h('button', { type: 'button', class: 'cx-iconbtn cx-pc-mod-btn', title: 'Moderate', 'aria-label': 'Moderate ' + nameOf(p), 'aria-haspopup': 'menu' }, icon('dots'));
      mod.addEventListener('click', () => { if (!cx.memberMenu(mod, p)) errEl.textContent = 'There’s nothing you can change for ' + nameOf(p) + '.'; });
      box.append(mod);
    }
    const note = blocked ? h('p', { class: 'cx-pc-note', text: 'You blocked them. Their messages are hidden and they can’t DM you.' }) : null;
    return h('div', {}, box, note, errEl);
  }
  const card = mountCard(cardEl, p, { online: cx.online().has(p.id), viewer: cx.me(), actions });
  wrap.append(cardEl);
  if (sheet) wrap.prepend(h('button', { type: 'button', class: 'cx-iconbtn cx-pop-x', 'aria-label': 'Close', onclick: () => close() }, icon('x')));

  function place() {
    if (sheet) return;
    const r = anchor.getBoundingClientRect();
    const W = wrap.offsetWidth, H = wrap.offsetHeight;
    let left = r.right + 12;
    if (left + W > innerWidth - 10) left = r.left - W - 12;
    if (left < 10) left = Math.max(10, Math.min(innerWidth - W - 10, r.left));
    const top = Math.max(10, Math.min(innerHeight - H - 10, r.top - 30));
    wrap.style.left = left + 'px'; wrap.style.top = top + 'px';
  }
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.fp-backdrop, .cx-menu, .cx-picker')) { e.preventDefault(); close(); } };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    card.stop();
    wrap.remove(); scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    if (open && open.wrap === wrap) open = null;
    if (anchor && anchor.focus && document.contains(anchor)) anchor.focus({ preventScroll: true });
  }
  const onResize = () => { if (!sheet) place(); };
  document.body.append(scrim, wrap);
  place();
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', onResize);
  if (finePointer()) wrap.focus({ preventScroll: true });
  open = { wrap, anchor, uid: p.id, close, refresh(next) { p = next; card.update(p, { online: cx.online().has(p.id), viewer: cx.me() }); } };
  return open;
}
/** Live profile change (realtime): an open card for that person redraws. */
export function refreshProfileCard(profile) { if (open && profile && open.uid === profile.id) open.refresh(profile); }
