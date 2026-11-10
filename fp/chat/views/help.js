// Hallpass in the help channel and in a DM with the bot: quick-pick question buttons, and an answer card that only the
// asker sees (it's drawn here, never stored or sent). Typing a question matches the FAQ first (free, instant); when nothing
// matches, AI answers come from the server only when the owner has switched them on.
import { h } from '../../ui.js';
import { matchFaq, isRealQuestion } from '../faq.js';
import { icon, avatar } from './common.js';

const REFETCH_MS = 30_000; // typed questions use the cached FAQ + ai_on; refetch at most this often
const FIRST = 6; // buttons shown before "More questions"

/**
 * cx: { faq() -> FAQ rows, aiOn() -> bool, refresh() -> Promise<{ faq, aiOn }>, bot() -> Hallpass profile | null, askAI(question) }
 * @returns {{ el, setTarget(key|null), ask(text) -> Promise<'card'|'send'|'post'|'gone'>, pick(item), clear() }}
 */
export function mountHelp(el, cx) {
  el.classList.add('cx-help');
  el.hidden = true;
  let key = null;
  let card = null;     // { question, answer, kind: 'faq' | 'none' }
  let showAll = false;
  let seq = 0;
  let fetchedAt = 0;
  let loading = null; // the refresh setTarget started, until it settles: a question typed meanwhile waits for it

  const botAvatar = () => { const b = cx.bot(); return b ? avatar(b, { size: 30, frame: false }) : h('span', { class: 'cx-av cx-help-bot', style: '--av:30px', 'aria-hidden': 'true' }, icon('sparkle')); };

  function drawCard() {
    if (!card) return null;
    const ai = cx.aiOn();
    const kids = [
      h('div', { class: 'cx-hc-head' }, botAvatar(), h('div', { class: 'cx-hc-who' }, h('b', { text: (cx.bot() && (cx.bot().display_name || cx.bot().username)) || 'Hallpass' }), h('span', { class: 'cx-role bot', text: 'BOT' })),
        h('span', { class: 'cx-hc-only', title: 'Only you can see this answer' }, icon('lock'), 'Only you'),
        h('button', { type: 'button', class: 'cx-iconbtn sm cx-hc-x', 'aria-label': 'Close answer', title: 'Close', onclick: () => { card = null; draw(); } }, icon('x'))),
      card.question ? h('p', { class: 'cx-hc-q' }, h('span', { text: 'You asked: ' }), card.question) : null,
    ];
    if (card.kind === 'faq') kids.push(h('p', { class: 'cx-hc-a', text: card.answer }));
    else kids.push(h('p', { class: 'cx-hc-a' }, h('b', { text: 'AI answers aren’t on yet. ' }), 'I only know the questions below for now. Pick one, or put your idea in the Tell Sean box on the home page.'));
    const acts = [];
    if (ai && card.question) acts.push(h('button', { type: 'button', class: 'cx-btn ghost cx-hc-ai', onclick: () => { const q = card.question; card = null; draw(); cx.askAI(q); } }, icon('sparkle'), 'Ask Hallpass AI instead'));
    acts.push(h('button', { type: 'button', class: 'cx-btn ghost cx-hc-ok', onclick: () => { card = null; draw(); } }, card.kind === 'faq' ? 'Got it' : 'Close'));
    kids.push(h('div', { class: 'cx-hc-acts' }, ...acts));
    return h('div', { class: 'cx-help-card', role: 'region', 'aria-label': 'Answer from Hallpass, only you can see it' }, ...kids);
  }
  function drawPicks() {
    const faq = cx.faq();
    if (!faq.length) return null;
    const list = showAll ? faq : faq.slice(0, FIRST);
    return h('div', { class: 'cx-help-picks' },
      h('div', { class: 'cx-hp-title' }, icon('sparkle'), h('span', { text: 'Quick questions' }), h('span', { class: 'cx-hp-sub', text: cx.aiOn() ? 'or type your own' : 'tap one for an instant answer' })),
      h('div', { class: 'cx-hp-chips' + (showAll ? ' all' : ''), role: 'list' }, ...list.map((it) => h('button', { type: 'button', class: 'cx-hp-chip', role: 'listitem', dataset: { faq: String(it.id) }, onclick: () => api.pick(it) }, it.question)),
        faq.length > FIRST ? h('button', { type: 'button', class: 'cx-hp-chip more', 'aria-expanded': showAll ? 'true' : 'false', onclick: () => { showAll = !showAll; draw(); } }, showAll ? 'Fewer' : 'More questions (' + (faq.length - FIRST) + ')') : null));
  }
  function draw() {
    el.hidden = key == null;
    if (key == null) { el.replaceChildren(); return; }
    el.replaceChildren(...[drawCard(), drawPicks()].filter(Boolean));
  }
  const api = {
    el,
    // key: the conversation the helper is for ('c:7', 'd:<id>'), or null when the open conversation isn't a help one.
    setTarget(k) {
      const changed = k !== key;
      if (changed) { key = k; card = null; showAll = false; seq++; }
      draw();
      if (!k || !changed) return;
      const p = Promise.resolve().then(() => cx.refresh()).then(() => { fetchedAt = Date.now(); if (key === k) draw(); }, () => {});
      loading = p;
      p.finally(() => { if (loading === p) loading = null; });
    },
    redraw: draw,
    pick(item) { card = { question: item.question, answer: item.answer, kind: 'faq' }; draw(); const c = el.querySelector('.cx-help-card'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); },
    clear() { card = null; draw(); },
    // A typed question. 'card': answered or explained here (nothing is sent); 'send': the caller posts it for the AI;
    // 'post': chatter, not a question, so it is just a normal message (no bot card); 'gone': the conversation changed meanwhile.
    async ask(text) {
      const mine = seq;
      // Opening #help (or the Hallpass DM) reloads the FAQ and the AI switch: a question typed before that answer is back
      // would otherwise be matched against the old copy (up to 30 s old: an edited answer, AI just switched on).
      // (At most 4 s: a reload stuck on a bad connection must not hold the question back.)
      if (loading) { await Promise.race([loading, new Promise((r) => setTimeout(r, 4000))]); if (mine !== seq) return 'gone'; }
      let fresh = { faq: cx.faq(), aiOn: cx.aiOn() };
      if (Date.now() - fetchedAt >= REFETCH_MS) {
        fetchedAt = Date.now(); // set first so a failed or slow fetch still counts as the one try in this window
        try { fresh = await cx.refresh(); } catch { /* use what we have */ }
        if (mine !== seq) return 'gone';
      }
      const hit = matchFaq(text, fresh.faq);
      if (hit) { card = { question: text, answer: hit.item.answer, kind: 'faq' }; draw(); return 'card'; }
      if (!isRealQuestion(text)) return 'post';
      if (fresh.aiOn) return 'send';
      card = { question: text, answer: '', kind: 'none' };
      draw();
      return 'card';
    },
  };
  return api;
}
