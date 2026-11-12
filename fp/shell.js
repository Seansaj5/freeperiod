// What every hub page shares: the accent and theme (+ the palette and sound buttons), the header (account chip, Messages in the nav, the clock, the glass that firms
// up on scroll, the Trophies dot), the ambient background, scroll reveal, and on pages other than home a search box that opens the home
// page filtered (./?q=...).
import { applyAccent, applyTheme, getSounds, setSounds, onPrefs } from './theme.js';
import { h } from './ui.js';
import { icon } from './icons.js';
import { openThemeSheet } from './theme-sheet.js';
import { mountAccount } from './account-ui.js';
import { mountChatButton } from './chat/button.js';
import { startAmbient } from './ambient.js';
import { startReveal } from './motion.js';

const $ = (id) => document.getElementById(id);

export function moodOf(d) {
  const hr = d.getHours(), weekend = d.getDay() === 0 || d.getDay() === 6;
  return weekend ? 'weekend mode' : hr < 7 ? 'way too early' : hr < 15 ? 'free period' : hr < 18 ? 'after school' : hr < 23 ? 'game night' : 'go to sleep';
}
function tick() {
  const d = new Date(), t = $('time'), m = $('mood');
  if (t) t.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (m) m.textContent = moodOf(d);
}

/** The palette button (opens the Themes sheet) and the speaker button (sounds on/off), left of the account chip. */
function mountThemeButtons() {
  const slot = $('account');
  if (!slot || !slot.parentNode || document.querySelector('.fp-hdr-tools')) return;
  const themeBtn = h('button', { type: 'button', class: 'fp-theme-btn', 'aria-label': 'Themes', title: 'Themes', onclick: openThemeSheet }, icon('palette'));
  const sfxBtn = h('button', { type: 'button', class: 'fp-sfx-btn', 'aria-label': 'Sounds', title: 'Sounds', 'aria-pressed': 'true', onclick: () => setSounds(!getSounds()) },
    icon('speaker', 'ic-on'), icon('speakerOff', 'ic-off'));
  const sync = () => sfxBtn.setAttribute('aria-pressed', String(getSounds()));
  sync();
  onPrefs(sync);
  slot.parentNode.insertBefore(h('div', { class: 'fp-hdr-tools' }, themeBtn, sfxBtn), slot);
}

/** search: 'home' (the page filters its own grid) or 'link' (Enter opens ./?q=). */
export function mountShell({ search = 'link' } = {}) {
  applyAccent();
  applyTheme();
  mountThemeButtons();
  mountAccount($('account'));
  mountChatButton($('chat-btn')); // stays hidden (and loads nothing) until chat is set up
  tick();
  setInterval(tick, 15000);
  const header = document.querySelector('.top');
  const onScroll = () => header && header.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const box = $('q');
  if (box && search === 'link') {
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); location.href = './' + (box.value.trim() ? '?q=' + encodeURIComponent(box.value.trim()) : ''); }
      if (e.key === 'Escape') { box.value = ''; box.blur(); }
    });
    addEventListener('keydown', (e) => {
      const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('.fp-backdrop')) { e.preventDefault(); box.focus(); }
    });
  }
  // scroll reveal ([data-reveal]): armed once the page script has drawn its first content (a microtask: no paint in between)
  queueMicrotask(() => { try { startReveal(); } catch { /* everything just stays visible */ } });
  // the background waits for the page's first paint: it never competes with the poster loading
  const start = () => startAmbient();
  if (document.readyState === 'complete') setTimeout(start, 300); else addEventListener('load', () => setTimeout(start, 300), { once: true });
}

/** The amber dot on the Trophies link (a trophy unlocked since the Trophies page was last opened). */
export function setTrophyDot(on) {
  document.querySelectorAll('[data-trophy-dot]').forEach((el) => { el.hidden = !on; });
}
