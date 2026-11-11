// The Themes sheet: a live mini preview per ready theme (each drawn with its own theme's tokens), the accent row, and the Sounds and
// Effects switches. Opened by the palette button in the shared header (fp/shell.js) and by the account card's accent row.
import { h, openSheet } from './ui.js';
import { readyThemes, ACCENTS, getTheme, setTheme, themeAccent, getAccent, setAccent, getEffects, setEffects, getSounds, setSounds, onPrefs } from './theme.js';

let open = null;

function preview(t) {
  return h('span', { class: 'fp-tp', 'data-theme': t.id, 'aria-hidden': 'true' },
    h('span', { class: 'fp-tp-bar' }, h('i'), h('b')),
    h('span', { class: 'fp-tp-card' }, h('span', { text: 'Free Period' }), h('em')));
}

export function openThemeSheet() {
  if (open) { open.focus(); return open; }
  const grid = h('div', { class: 'fp-theme-grid', role: 'group', 'aria-label': 'Theme' }, readyThemes().map((t) =>
    h('button', { type: 'button', class: 'fp-theme-pick', 'data-theme-pick': t.id, 'aria-pressed': 'false', onclick: () => setTheme(t.id) },
      preview(t), h('span', { class: 'fp-theme-name', text: t.name }))));
  const swatches = h('div', { class: 'fp-swatches', role: 'radiogroup', 'aria-label': 'Accent color' }, [themeAccent(), ...ACCENTS].map((a) =>
    h('button', { type: 'button', class: 'fp-swatch', role: 'radio', 'aria-checked': 'false', 'aria-label': a.label, title: a.label,
      'data-accent-pick': a.id, style: `--sw:${a.color};--sw2:${a.second}`, onclick: () => setAccent(a.id) })));
  const sw = (cls, label, onToggle) => h('button', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': label,
    class: 'fp-switch ' + cls, onclick: onToggle });
  const sfx = sw('fp-pref-sfx', 'Sounds', () => setSounds(!getSounds()));
  const fx = sw('fp-pref-fx', 'Effects', () => setEffects(!getEffects()));
  const sheet = openSheet({ title: 'Themes', onClose: () => { off(); open = null; } });
  sheet.el.classList.add('fp-theme-sheet');
  sheet.body.append(
    grid,
    h('div', { class: 'fp-theme-sec' }, h('h3', { text: 'Accent' }), swatches),
    h('div', { class: 'fp-theme-sec' },
      h('div', { class: 'fp-pref' }, h('span', {}, 'Sounds', h('small', { text: 'Clicks and whooshes around the site' })), sfx),
      h('div', { class: 'fp-pref' }, h('span', {}, 'Effects', h('small', { text: 'Animated backgrounds and the cursor trail' })), fx)));
  function sync() {
    const t = getTheme(), a = getAccent(), ta = themeAccent(t);
    const tsw = swatches.querySelector('[data-accent-pick="theme"]');
    if (tsw) tsw.style.cssText = `--sw:${ta.color};--sw2:${ta.second}`;
    grid.querySelectorAll('[data-theme-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === t)));
    swatches.querySelectorAll('[data-accent-pick]').forEach((b) => {
      const on = b.dataset.accentPick === a;
      b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on);
    });
    sfx.setAttribute('aria-checked', String(getSounds()));
    fx.setAttribute('aria-checked', String(getEffects()));
  }
  const off = onPrefs(sync);
  sync();
  open = sheet;
  sheet.focus = () => { const f = sheet.el.querySelector('[data-theme-pick][aria-pressed="true"]'); (f || sheet.el).focus(); };
  sheet.focus();
  return sheet;
}
