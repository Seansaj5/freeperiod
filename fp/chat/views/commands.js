// Slash commands in the message box: the card Hallpass shows with each result (drawn here, never stored or sent: only
// the person who typed the command sees it), and the runner that turns a typed command into data.js calls. What a
// command may do is the database's call: a refusal comes back as its chatError line on the card. Only /ask, /shrug,
// /tableflip and /unflip post a message.
import { h } from '../../ui.js';
import * as data from '../data.js';
import { parseLine, parseArgs, visibleCommands, timeoutLabel, shrugText, askText, TABLEFLIP, UNFLIP } from '../commands.js';
import { checkProfile } from '../perms.js';
import { icon, avatar, nameOf } from './common.js';

const errText = (e) => { if (e && e.shown) return e.shown; try { return data.chatError(e) || 'Something went wrong'; } catch { return 'Something went wrong'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUSY_AFTER_MS = 300;

/**
 * The result card above the message box. cx: { bot() -> Hallpass profile | null }.
 * show({ ok: true|false|null (null = working), cmd, text, lines: [command] }) replaces the card; setKey(k) clears it when
 * the open conversation changes.
 */
export function mountCommandCard(el, cx) {
  el.classList.add('cx-cmdout');
  el.hidden = true;
  let key = null;
  let card = null;
  let seq = 0;

  function row(c) {
    return h('div', { class: 'cx-cmdcard-row', role: 'listitem' },
      h('code', { class: 'cx-cmdcard-name', text: '/' + c.name }),
      c.hint ? h('span', { class: 'cx-cmdcard-hint', text: c.hint }) : null,
      h('small', { text: c.desc }));
  }
  function draw() {
    if (!card) { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false;
    const b = cx.bot();
    const pic = b ? avatar(b, { size: 30 }) : h('span', { class: 'cx-av cx-help-bot', style: '--av:30px', 'aria-hidden': 'true' }, icon('sparkle'));
    const state = card.ok == null ? 'busy' : card.ok ? 'good' : 'bad';
    const mark = card.ok == null ? h('i', { class: 'cx-spin' }) : h('span', { text: card.ok ? '✅' : '❌' });
    el.replaceChildren(h('div', { class: 'cx-help-card cx-cmdcard ' + state, role: 'status', 'aria-live': 'polite', dataset: { cmd: card.cmd || '', ok: state } },
      h('div', { class: 'cx-hc-head' }, pic,
        h('div', { class: 'cx-hc-who' }, h('b', { text: (b && (b.display_name || b.username)) || 'Hallpass' }), h('span', { class: 'cx-role bot', text: 'BOT' })),
        h('span', { class: 'cx-hc-only', title: 'Only you can see this' }, icon('lock'), h('span', { text: 'Only you can see this' })),
        h('button', { type: 'button', class: 'cx-iconbtn sm cx-hc-x', 'aria-label': 'Dismiss', title: 'Dismiss', onclick: () => api.clear() }, icon('x'))),
      card.cmd ? h('p', { class: 'cx-hc-q' }, h('span', { text: 'You used ' }), '/' + card.cmd) : null,
      h('p', { class: 'cx-hc-a cx-cmdcard-text' }, h('span', { class: 'cx-cmdcard-mark', 'aria-hidden': 'true' }, mark), h('span', { class: 'cx-cmdcard-msg', text: card.text || '' })),
      card.lines && card.lines.length ? h('div', { class: 'cx-cmdcard-list', role: 'list' }, ...card.lines.map(row)) : null));
  }
  const api = {
    el,
    show(c) { seq++; card = c; draw(); return seq; },
    /** A working line, shown only if the command is still running after a moment (no flash for quick ones). */
    busy(cmd, text) {
      const mine = ++seq;
      setTimeout(() => { if (seq === mine) { card = { ok: null, cmd, text }; draw(); } }, BUSY_AFTER_MS);
      return mine;
    },
    progress(cmd, text) { seq++; card = { ok: null, cmd, text }; draw(); },
    clear() { seq++; card = null; draw(); },
    setKey(k) { if (k !== key) { key = k; api.clear(); } },
    get current() { return card; },
  };
  return api;
}

/**
 * Starts a typed command. Returns what the message box should do right away: 'keep' (leave the text: unknown command or
 * a usage problem, the card says why), 'text' (clear the text: the command is running) or 'sent' (it posted a message:
 * clear text, reply and pictures like a send).
 * extra: { reply, replyTo, files } from the box. cx: see app.js (role, where, findUser, card, post, startDM, openCard,
 * setBlocked, mergeProfile, patchProfile, loadFriends, openReports, afterAI).
 */
export function startCommand(text, extra, cx) {
  const line = parseLine(text);
  if (line.kind === 'text') return 'keep';
  const where = cx.where() || {};
  const ctx = { dm: !!where.dm };
  if (line.kind === 'unknown') { cx.card.show({ ok: false, cmd: line.name, text: 'Unknown command. Type / to see them all.' }); return 'keep'; }
  const { cmd } = line;
  const args = parseArgs(cmd, line.rest);
  if (!args.ok) { cx.card.show({ ok: false, cmd: cmd.name, text: args.error }); return 'keep'; }
  if (cmd.channelOnly && !where.channel) { cx.card.show({ ok: false, cmd: cmd.name, text: '/' + cmd.name + ' only works in a channel' }); return 'keep'; }
  if (cmd.posts) {
    const v = args.values;
    const body = cmd.name === 'shrug' ? shrugText(v.text) : cmd.name === 'tableflip' ? TABLEFLIP : cmd.name === 'unflip' ? UNFLIP : askText(v.question);
    const ok = cx.post(body, extra || {});
    if (ok === false) { cx.card.show({ ok: false, cmd: cmd.name, text: 'Couldn’t send that' }); return 'keep'; }
    cx.card.clear();
    return 'sent';
  }
  const run = HANDLERS[cmd.name];
  cx.card.busy(cmd.name, 'Working on it…');
  const progress = (t) => cx.card.progress(cmd.name, t);
  Promise.resolve().then(() => run(args.values, cx, { ctx, where, progress }))
    .then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, text: errText(e) }))
    .then((r) => cx.card.show({ cmd: cmd.name, ...r }));
  return 'text';
}

async function person(cx, name) {
  const p = await cx.findUser(name);
  if (!p) throw { shown: 'No one called @' + name };
  return p;
}

const HANDLERS = {
  help(_v, cx, { ctx }) {
    return { text: 'Commands you can use' + (ctx.dm ? ' in a DM' : '') + '. Type / and pick one, or keep typing to filter.', lines: visibleCommands(cx.role(), ctx) };
  },
  async dm({ user }, cx) {
    const p = await person(cx, user);
    await cx.startDM(p);
    return { text: 'Opened your DM with ' + nameOf(p) + '.' };
  },
  async profile({ user }, cx) {
    const p = await person(cx, user);
    cx.openCard(p);
    return { text: 'Opened ' + nameOf(p) + '’s profile.' };
  },
  async friend({ user }, cx) {
    const p = await person(cx, user);
    let res;
    try { res = await data.friendRequest(p.username); } catch (e) { throw { shown: e && e.code === 'not_allowed' ? 'You can’t add ' + nameOf(p) + ' as a friend' : errText(e) }; }
    cx.loadFriends();
    return { text: res === 'accepted' ? 'You and ' + nameOf(p) + ' are friends now.' : 'Friend request sent to ' + nameOf(p) + '.' };
  },
  async block({ user }, cx) {
    const p = await person(cx, user);
    await data.block(p.id, true);
    cx.setBlocked(p.id, true);
    return { text: 'Blocked ' + nameOf(p) + '. Their messages are hidden and they can’t DM you.' };
  },
  async unblock({ user }, cx) {
    const p = await person(cx, user);
    await data.block(p.id, false);
    cx.setBlocked(p.id, false);
    return { text: 'Unblocked ' + nameOf(p) + '.' };
  },
  async status({ text }, cx) {
    const patch = text ? { status_text: text } : { status_text: null, status_emoji: null };
    const bad = checkProfile(patch);
    if (bad.length) throw { shown: 'Statuses are up to 80 characters' };
    cx.mergeProfile(await data.updateProfile(patch));
    return { text: text ? 'Your status is now “' + text + '”.' : 'Your status is cleared.' };
  },
  async nick({ name }, cx) {
    const patch = { display_name: name || null };
    const bad = checkProfile(patch);
    if (bad.length) throw { shown: bad[0].field === 'display_name' && /hidden/.test(bad[0].message) ? bad[0].message : 'Display names are up to 32 characters' };
    cx.mergeProfile(await data.updateProfile(patch));
    return { text: name ? 'Your display name is now ' + name + '.' : 'Your display name is cleared. People see your @username.' };
  },
  async timeout({ user, minutes, reason }, cx) {
    const p = await person(cx, user);
    await data.timeout(p.id, minutes.minutes);
    cx.patchProfile(p.id, { muted_until: new Date(Date.now() + minutes.minutes * 60e3).toISOString(), muted_by: cx.role() === 'owner' ? 'owner' : 'mod' });
    return { text: nameOf(p) + ' is timed out for ' + timeoutLabel(minutes.minutes) + '.'
      + (minutes.adjusted ? ' (Time-outs are 10 minutes, 1 hour or 1 day.)' : '') + (reason ? ' Reason: ' + reason : '') };
  },
  async untimeout({ user }, cx) {
    const p = await person(cx, user);
    await data.timeout(p.id, 0);
    cx.patchProfile(p.id, { muted_until: null, muted_by: null });
    return { text: nameOf(p) + ' can post again.' };
  },
  async ban({ user, reason }, cx) {
    const p = await person(cx, user);
    await data.setBan(p.id, true);
    cx.patchProfile(p.id, { banned: true });
    return { text: nameOf(p) + ' is banned from chat. They can still read.' + (reason ? ' Reason: ' + reason : '') };
  },
  async unban({ user }, cx) {
    const p = await person(cx, user);
    await data.setBan(p.id, false);
    cx.patchProfile(p.id, { banned: false });
    return { text: nameOf(p) + ' can chat again.' };
  },
  async mod({ user }, cx) {
    const p = await person(cx, user);
    await data.setMod(p.id, true);
    cx.patchProfile(p.id, { is_mod: true, mod_revoked: false });
    return { text: nameOf(p) + ' is a mod now.' };
  },
  async unmod({ user }, cx) {
    const p = await person(cx, user);
    await data.setMod(p.id, false);
    cx.patchProfile(p.id, { is_mod: false, mod_revoked: true });
    return { text: nameOf(p) + ' is no longer a mod.' };
  },
  async ai({ on }, cx) {
    const want = on === 'on';
    await data.setBotSettings({ ai_on: want });
    cx.afterAI();
    return { text: want ? 'Hallpass AI is on. Questions the FAQ can’t answer go to Hallpass AI.' : 'Hallpass AI is off. Hallpass only answers from the FAQ.' };
  },
  async reports(_v, cx) {
    const rows = await data.listReports(); // the owner's alone: anyone else gets the refusal here
    const open = (Array.isArray(rows) ? rows : []).filter((r) => !r.resolved).length;
    await cx.openReports();
    return { text: 'Opened Reports: ' + (open ? open + ' open.' : 'nothing open.') };
  },
  // The newest N messages of this channel, one delete at a time. A message the database won't let you delete (a mod and
  // Sean's posts) is skipped; "slow down" waits and tries again twice; anything else stops and says how far it got.
  async purge({ count }, cx, { where, progress }) {
    const rows = await data.loadMessages(where, { limit: 100 });
    const pick = (Array.isArray(rows) ? rows : []).filter((m) => m && m.id != null && !m.deleted).slice(-count).reverse();
    if (!pick.length) return { text: 'There’s nothing to delete here.' };
    let done = 0, refused = 0, why = '';
    const plural = (n) => n + ' message' + (n === 1 ? '' : 's');
    for (const m of pick) {
      progress('Deleting… ' + done + ' of ' + pick.length);
      for (let tries = 0; ; tries++) {
        try { await data.deleteMessage(m.id); done++; break; }
        catch (e) {
          const code = e && e.code;
          if (code === 'slow_down' && tries < 2) { await sleep(2500); continue; }
          if (code === 'not_allowed') { refused++; why = why || errText(e); break; }
          throw { shown: (done ? 'Stopped after deleting ' + done + ' of ' + plural(pick.length) : 'Couldn’t delete anything') + ': ' + errText(e) };
        }
      }
    }
    if (!done) throw { shown: 'Couldn’t delete ' + (pick.length === 1 ? 'that message' : 'those messages') + ': ' + why };
    return { text: refused ? 'Deleted ' + done + ' of ' + plural(pick.length) + '. ' + refused + ' couldn’t be deleted: ' + why : 'Deleted ' + plural(done) + '.' };
  },
};
