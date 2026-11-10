// Who may do what in chat, and the profile / channel / group text rules, mirrored from the database (0001-0003 and the
// security-review fixes) so the UI only offers what will work and explains limits before a save. Pure: runs in node tests.
// The database still decides; these only shape the menus and the forms.
import { validFlair, isHex } from './flair.js';

/** 'owner' | 'mod' | 'member' | '' (no profile), from server-written columns like profile_role(): a banned account is
 *  never a mod, and the owner can demote a Bing Ball admin (mod_revoked). */
export function roleOfProfile(p) {
  if (!p || !p.id) return '';
  if (p.role === 'owner') return 'owner';
  if (p.banned) return 'member';
  if ((p.role === 'mod' && !p.mod_revoked) || p.is_mod === true) return 'mod';
  return 'member';
}
export const isStaffRole = (r) => r === 'owner' || r === 'mod';
export const timedOut = (p, now = Date.now()) => !!(p && p.muted_until && Date.parse(p.muted_until) > now);

// ---------- messages ----------
const live = (m) => m && m.id != null && !m.deleted && !m.pending && !m.failed;
/** Staff pin / unpin a channel message. Mods may pin Sean's posts but never unpin them. */
export function canPin(me, m, author) {
  const r = roleOfProfile(me);
  if (!live(m) || m.channel_id == null || !isStaffRole(r)) return false;
  if (m.pinned && r !== 'owner' && author && author.id !== me.id && author.role === 'owner') return false;
  return true;
}
/** Staff delete someone else's channel message. Mods never delete Sean's posts. (Own messages: the author's own Delete.) */
export function canStaffDelete(me, m, author) {
  const r = roleOfProfile(me);
  if (!live(m) || m.channel_id == null || !isStaffRole(r) || m.author_id === me.id) return false;
  if (r !== 'owner' && author && author.role === 'owner') return false;
  return true;
}
/** Everyone with a profile may report someone else's message (channels and DMs). */
export function canReport(me, m) {
  return !!(me && me.id) && live(m) && m.author_id !== me.id;
}

// ---------- members ----------
/** What the member menu offers `me` for `target`: { timeout, clear, ban, mod } (false = hidden). */
export function memberActions(me, target, now = Date.now()) {
  const r = roleOfProfile(me);
  const none = { timeout: false, clear: false, ban: false, mod: false };
  if (!isStaffRole(r) || !target || !target.id || target.id === me.id || target.role === 'owner') return none;
  const tr = roleOfProfile(target);
  const ownerMute = target.muted_by === 'owner' && timedOut(target, now);
  const modMayTouch = r === 'owner' || (tr !== 'mod' && !ownerMute);
  return {
    timeout: modMayTouch,
    clear: modMayTouch && timedOut(target, now),
    ban: r === 'owner',
    mod: r === 'owner',
  };
}
export const TIMEOUTS = Object.freeze([[10, '10 minutes'], [60, '1 hour'], [1440, '1 day']]);

// ---------- channels ----------
export const CHANNEL_NAME = /^[a-z0-9-]{1,24}$/;
/** What a typed name becomes: lowercase, spaces to dashes, nothing else outside [a-z0-9-], at most 24. */
export function channelName(input) {
  return String(input || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 24);
}
const CONTROL = /[\u0000-\u001f\u007f]/;
const SNEAKY = /[​-‏⁠﻿‪-‮⁦-⁩]/; // zero-width and bidi overrides (lookalike names)
const len = (s) => [...String(s)].length;
/** Channel form errors: [{ field, message }]. names = the other channels' names. */
export function checkChannel({ name, emoji, topic }, names = []) {
  const out = [];
  if (!CHANNEL_NAME.test(name || '')) out.push({ field: 'name', message: 'Use 1-24 lowercase letters, numbers or dashes' });
  else if (names.includes(name)) out.push({ field: 'name', message: 'There’s already a #' + name });
  if (!emoji || /\s/.test(emoji) || CONTROL.test(emoji) || emoji.length > 40) out.push({ field: 'emoji', message: 'Pick one emoji' });
  if (len(topic || '') > 120 || CONTROL.test(topic || '')) out.push({ field: 'topic', message: 'Topics are up to 120 characters' });
  return out;
}

// ---------- profiles ----------
export const LIMITS = Object.freeze({ display_name: 32, pronouns: 40, about: 300, status_emoji: 16, status_text: 80, report: 200, group_name: 40, group: 10 });
/** Profile patch errors: [{ field, message }] (basics + flair). Mirrors the profiles checks. */
export function checkProfile(patch) {
  const out = [];
  const bad = (field, message) => out.push({ field, message });
  const p = patch || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(p, k) && p[k] != null;
  if (has('display_name')) {
    if (len(p.display_name) > LIMITS.display_name) bad('display_name', 'Up to 32 characters');
    else if (CONTROL.test(p.display_name) || SNEAKY.test(p.display_name)) bad('display_name', 'That name has hidden characters in it');
  }
  if (has('pronouns') && (len(p.pronouns) > LIMITS.pronouns || CONTROL.test(p.pronouns))) bad('pronouns', 'Up to 40 characters');
  if (has('about') && len(p.about) > LIMITS.about) bad('about', 'Up to 300 characters');
  if (has('status_emoji') && (len(p.status_emoji) > LIMITS.status_emoji || /[\s\u0000-\u001fA-Za-z0-9]/.test(p.status_emoji))) bad('status_emoji', 'Pick one emoji');
  if (has('status_text') && (len(p.status_text) > LIMITS.status_text || CONTROL.test(p.status_text))) bad('status_text', 'Up to 80 characters');
  if (has('banner_color') && !isHex(p.banner_color)) bad('banner_color', 'Colors look like #12ab3f');
  if (has('dm_policy') && !['everyone', 'friends'].includes(p.dm_policy)) bad('dm_policy', 'Pick everyone or friends only');
  for (const e of validFlair(Object.fromEntries(Object.entries(p).filter(([k]) => ['name_color', 'name_color2', 'theme_a', 'theme_b', 'name_font', 'name_fill', 'name_glow', 'frame', 'effect'].includes(k)))).errors) out.push(e);
  return out;
}
/** The editable profile columns (the column grant), in one place. */
export const PROFILE_FIELDS = Object.freeze(['display_name', 'pronouns', 'about', 'status_emoji', 'status_text', 'avatar_path', 'banner_path', 'banner_color',
  'name_color', 'theme_a', 'theme_b', 'name_color2', 'name_font', 'name_fill', 'name_glow', 'frame', 'effect', 'dm_policy']);
/** Only what changed (empty strings count as null): one updateProfile call per Save (profile updates are rate limited). */
export function profileDiff(orig, draft) {
  const norm = (v) => (v === '' || v === undefined ? null : v);
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(draft || {}, k)) continue;
    if (norm((orig || {})[k]) !== norm(draft[k])) out[k] = norm(draft[k]);
  }
  if ('name_fill' in out && out.name_fill === null) out.name_fill = 'solid';
  if ('name_glow' in out) out.name_glow = !!out.name_glow;
  return out;
}
/** Group name: optional, up to 40, no control / lookalike characters. */
export function groupNameError(name) {
  const n = String(name || '').trim();
  if (len(n) > LIMITS.group_name) return 'Group names are up to 40 characters';
  if (CONTROL.test(n) || SNEAKY.test(n)) return 'That name has hidden characters in it';
  return '';
}
