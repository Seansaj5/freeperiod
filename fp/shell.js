// What every hub page shares: the accent, the header (account chip, Messages in the nav, the clock, the glass that firms
// up on scroll, the Trophies dot), the ambient background, and on pages other than home a search box that opens the home
// page filtered (./?q=...).
import { applyAccent } from './theme.js';
import { mountAccount } from './account-ui.js';
import { mountChatButton } from './chat/button.js';
import { startAmbient } from './ambient.js';

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

/** search: 'home' (the page filters its own grid) or 'link' (Enter opens ./?q=). */
export function mountShell({ search = 'link' } = {}) {
  applyAccent();
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
  // the background waits for the page's first paint: it never competes with the poster loading
  const start = () => startAmbient();
  if (document.readyState === 'complete') setTimeout(start, 300); else addEventListener('load', () => setTimeout(start, 300), { once: true });
}

/** The amber dot on the Trophies link (a trophy unlocked since the Trophies page was last opened). */
export function setTrophyDot(on) {
  document.querySelectorAll('[data-trophy-dot]').forEach((el) => { el.hidden = !on; });
}
