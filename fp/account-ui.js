// Header account chip: Log in / name + role badge, menu, and the Log in / Sign up sheet.
import * as session from './session.js';
import { h, openSheet, toast, errText } from './ui.js';
import { openProfile } from './profile.js';
import { openInbox } from './inbox.js';

export function openAuthSheet(startTab = 'login') {
  let tab = startTab;
  const sheet = openSheet({ title: 'Free Period account' });
  const tabs = h('div', { class: 'fp-tabs', role: 'tablist' });
  const form = h('form', { class: 'fp-form', novalidate: true });
  sheet.body.append(
    h('p', { class: 'fp-note', text: 'Your Bing Ball account works here too, and it keeps your favorites, play time and saves.' }),
    tabs, form);

  function draw() {
    tabs.replaceChildren(...[['login', 'Log in'], ['signup', 'Sign up']].map(([k, label]) =>
      h('button', { type: 'button', role: 'tab', class: 'fp-tab' + (tab === k ? ' on' : ''), 'aria-selected': tab === k ? 'true' : 'false',
        onclick: () => { tab = k; draw(); sheet.focus(); } }, label)));
    const user = h('input', { id: 'fp-user', name: 'username', autocomplete: 'username', required: true, maxlength: '24', autocapitalize: 'none', spellcheck: 'false' });
    const pass = h('input', { id: 'fp-pass', name: 'password', type: 'password', required: true, autocomplete: tab === 'login' ? 'current-password' : 'new-password' });
    const err = h('p', { class: 'fp-err', role: 'alert' });
    const go = h('button', { type: 'submit', class: 'fp-btn' }, tab === 'login' ? 'Log in' : 'Create account');
    form.replaceChildren(
      h('label', { for: 'fp-user' }, 'Username'), user,
      h('label', { for: 'fp-pass' }, 'Password'), pass,
      err, go);
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!user.value.trim() || !pass.value) { err.textContent = 'Enter a username and password.'; return; }
      go.disabled = true;
      go.textContent = 'One moment...';
      try {
        const fn = tab === 'login' ? session.login : session.register;
        const u = await fn(user.value.trim(), pass.value);
        sheet.close();
        toast('Hi ' + u.username);
      } catch (ex) {
        err.textContent = errText(ex);
        go.disabled = false;
        go.textContent = tab === 'login' ? 'Log in' : 'Create account';
      }
    };
  }
  draw();
  sheet.focus();
}

export function mountAccount(el) {
  let menuOpen = false;
  const root = h('div', { class: 'fp-account' });
  el.append(root);

  function closeMenu() { menuOpen = false; render(); }
  function render() {
    const user = session.getUser();
    if (!user) {
      root.replaceChildren(h('button', { type: 'button', class: 'fp-chip', onclick: () => openAuthSheet('login') }, 'Log in'));
      return;
    }
    const btn = h('button', { type: 'button', class: 'fp-chip on', 'aria-haspopup': 'menu', 'aria-expanded': menuOpen ? 'true' : 'false',
      onclick: () => { menuOpen = !menuOpen; render(); if (menuOpen) { const f = root.querySelector('[role=menuitem]'); if (f) f.focus(); } } },
      h('span', { class: 'fp-name', text: user.username }),
      user.role && user.role !== 'player' ? h('span', { class: 'fp-badge ' + user.role, text: user.role }) : null);
    const items = [
      h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); openProfile(); } }, 'Profile'),
      user.role === 'owner' ? h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); openInbox(); } }, 'Inbox') : null,
      h('button', { type: 'button', role: 'menuitem', onclick: async () => { closeMenu(); await session.logout(); toast('Logged out'); } }, 'Log out'),
    ];
    root.replaceChildren(btn, menuOpen ? h('div', { class: 'fp-menu', role: 'menu' }, items) : null);
  }
  root.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') { closeMenu(); root.querySelector('.fp-chip').focus(); return; }
    const mi = [...root.querySelectorAll('[role=menuitem]')], i = mi.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); mi[(i + 1) % mi.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); mi[(i - 1 + mi.length) % mi.length].focus(); }
  });
  document.addEventListener('click', (e) => { if (menuOpen && !root.contains(e.target)) closeMenu(); });
  session.onChange(() => { menuOpen = false; render(); });
  render();
}
