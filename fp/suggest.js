// "Tell Sean" bar: suggestion box with an about-picker.
import * as session from './session.js';
import { call, WAKE_TIMEOUT } from './api.js';
import { h, toast, errText } from './ui.js';

export const ABOUT = [['Free Period', 'fp-site'], ['Bing Ball', 'fp-bingball'], ['Close Call', 'fp-closecall'], ['horror.exe', 'fp-horrorexe'], ['New game idea', 'fp-newgame']];
const MIN = 4, MAX = 500;

export function mountSuggest(el) {
  let category = ABOUT[0][1];
  const picker = h('div', { class: 'fp-about', role: 'group', 'aria-label': 'What is it about?' });
  const text = h('textarea', { id: 'fp-suggest-text', rows: '2', maxlength: String(MAX), placeholder: 'A bug, an idea, a game you want...' });
  const count = h('span', { class: 'fp-count', 'aria-live': 'off' });
  const msg = h('p', { class: 'fp-err', role: 'alert' });
  const send = h('button', { type: 'submit', class: 'fp-btn' }, 'Send');
  const hint = h('p', { class: 'fp-note' });

  function drawPicker() {
    picker.replaceChildren(...ABOUT.map(([label, key]) =>
      h('button', { type: 'button', class: 'fp-pick' + (key === category ? ' on' : ''), 'aria-pressed': key === category ? 'true' : 'false',
        onclick: () => { category = key; drawPicker(); } }, label)));
  }
  function update() {
    const n = text.value.trim().length;
    count.textContent = `${n}/${MAX}`;
    count.classList.toggle('bad', n > 0 && n < MIN);
    send.disabled = n < MIN || n > MAX;
  }
  function drawHint() {
    hint.textContent = session.getUser() ? '' : 'Log in to send more than a few.';
  }

  const form = h('form', { class: 'fp-suggest', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const t = text.value.trim();
    if (t.length < MIN || t.length > MAX) return;
    msg.textContent = '';
    send.disabled = true;
    send.textContent = 'Sending...';
    try {
      await call('/api/suggest', { body: { category, text: t }, auth: true, timeout: WAKE_TIMEOUT });
      text.value = '';
      toast('Sent to Sean');
    } catch (ex) {
      msg.textContent = errText(ex);
    } finally {
      send.textContent = 'Send';
      update();
    }
  } },
    h('label', { for: 'fp-suggest-text', class: 'fp-suggest-title' }, 'Tell Sean'),
    picker, text,
    h('div', { class: 'fp-suggest-row' }, count, send),
    msg, hint);

  el.append(form);
  text.addEventListener('input', update);
  session.onChange(drawHint);
  drawPicker(); drawHint(); update();
}
