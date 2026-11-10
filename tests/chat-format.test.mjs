import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, renderTokens, isSafeHref, mentionsMe } from '../fp/chat/format.js';
import { badge, tabTitle } from '../fp/chat/unread.js';

const ctx = { me: 'saj', users: new Set(['saj', 'jo']), emoji: new Map([['pog', 'https://x.supabase.co/storage/v1/object/public/emoji/pog.webp']]) };
const P = (s, c = ctx) => parseMessage(s, c);

test('markup is plain text', () => {
  assert.deepEqual(P('<script>alert(1)</script>'), [{ t: 'text', v: '<script>alert(1)</script>' }]);
});
test('unsafe schemes never become links', () => {
  for (const s of ['[x](javascript:alert(1))', 'javascript:alert(1)', 'data:text/html,<b>hi</b>', 'vbscript:x', 'file:///etc/passwd']) {
    const toks = P(s);
    assert.ok(toks.every(k => k.t === 'text'), s);
    assert.equal(toks.map(k => k.v).join(''), s);
  }
});
test('http(s) URL -> link', () => {
  assert.deepEqual(P('https://a.b/c?d=1'), [{ t: 'link', href: 'https://a.b/c?d=1', v: 'https://a.b/c?d=1' }]);
  assert.deepEqual(P('see https://a.b/c.'), [{ t: 'text', v: 'see ' }, { t: 'link', href: 'https://a.b/c', v: 'https://a.b/c' }, { t: 'text', v: '.' }]);
});
test('bold, italic, code, spoiler', () => {
  assert.deepEqual(P('**b**'), [{ t: 'b', kids: [{ t: 'text', v: 'b' }] }]);
  assert.deepEqual(P('*i*'), [{ t: 'i', kids: [{ t: 'text', v: 'i' }] }]);
  assert.deepEqual(P('`a **b**`'), [{ t: 'code', v: 'a **b**' }]);
  assert.deepEqual(P('||boo||'), [{ t: 'spoiler', kids: [{ t: 'text', v: 'boo' }] }]);
});
test('**bold *it*** nests', () => {
  assert.deepEqual(P('**bold *it***'), [{ t: 'b', kids: [{ t: 'text', v: 'bold ' }, { t: 'i', kids: [{ t: 'text', v: 'it' }] }] }]);
});
test('unclosed ** stays text', () => {
  assert.deepEqual(P('**oops'), [{ t: 'text', v: '**oops' }]);
  assert.deepEqual(P('a ||x'), [{ t: 'text', v: 'a ||x' }]);
  assert.deepEqual(P('`x'), [{ t: 'text', v: '`x' }]);
});
test('mentions', () => {
  assert.deepEqual(P('@saj'), [{ t: 'mention', user: 'saj', me: true }]);
  assert.deepEqual(P('hi @jo!'), [{ t: 'text', v: 'hi ' }, { t: 'mention', user: 'jo', me: false }, { t: 'text', v: '!' }]);
  assert.deepEqual(P('@nobody'), [{ t: 'text', v: '@nobody' }]);
  assert.deepEqual(P('@everyone'), [{ t: 'everyone' }]);
  assert.deepEqual(P('a@saj'), [{ t: 'text', v: 'a@saj' }]);
});
test('emoji', () => {
  assert.deepEqual(P(':pog:'), [{ t: 'emoji', name: 'pog', src: ctx.emoji.get('pog') }]);
  assert.deepEqual(P(':nope:'), [{ t: 'text', v: ':nope:' }]);
});
test('newline -> br', () => {
  assert.deepEqual(P('a\nb'), [{ t: 'text', v: 'a' }, { t: 'br' }, { t: 'text', v: 'b' }]);
});
test('2000-char bodies parse fast, even when nasty', () => {
  for (const body of ['hello **x** '.repeat(167).slice(0, 2000), '*'.repeat(2000), '**a '.repeat(500), '||'.repeat(1000), '@'.repeat(2000), ':a:'.repeat(600)]) {
    const t0 = performance.now();
    P(body);
    assert.ok(performance.now() - t0 < 50, body.slice(0, 10));
  }
});
test('isSafeHref / mentionsMe', () => {
  assert.equal(isSafeHref('https://a.b'), true);
  assert.equal(isSafeHref('http://a.b/x'), true);
  for (const s of ['javascript:alert(1)', 'data:text/html,x', '//a.b', 'a.b', '', ' https://a.b', 'https://a b']) assert.equal(isSafeHref(s), false, s);
  assert.equal(isSafeHref(null), false);
  assert.equal(mentionsMe('hey @Saj', 'saj'), true);
  assert.equal(mentionsMe('hey @sajj', 'saj'), false);
  assert.equal(mentionsMe('a@saj', 'saj'), false);
  assert.equal(mentionsMe('@everyone', 'saj'), true);
  assert.equal(mentionsMe('nothing', 'saj'), false);
});

// Tiny DOM fake: only what renderTokens may use (createElement, createTextNode, createDocumentFragment, textContent).
function fakeDoc() {
  const mk = (tag) => ({ tag, attrs: {}, kids: [], className: '', set textContent(v) { this.kids = [{ text: String(v) }]; }, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); return c; }, addEventListener() {} });
  return { createElement: mk, createTextNode: (v) => ({ text: String(v) }), createDocumentFragment: () => mk('#frag') };
}
const html = (n) => n.text !== undefined ? n.text : n.tag === '#frag' ? n.kids.map(html).join('') : '<' + n.tag + Object.entries(n.attrs).map(([k, v]) => ` ${k}=${v}`).join('') + (n.className ? ' .' + n.className : '') + '>' + n.kids.map(html).join('') + '</' + n.tag + '>';
test('renderTokens builds elements, links are safe, text is never markup', () => {
  const d = fakeDoc();
  const f = renderTokens(parseMessage('<b>x</b> **y** https://a.b @saj :pog:', ctx), d, { storageOrigin: 'https://x.supabase.co' });
  const out = f.kids.map(html).join('');
  assert.ok(out.includes('<b>x</b>'));            // literal text, not an element
  assert.match(out, /<strong>y<\/strong>/);
  assert.match(out, /<a href=https:\/\/a\.b target=_blank rel=noopener noreferrer>/);
  assert.match(out, /<img /);
  assert.ok(f.kids[0].text !== undefined && f.kids[0].text.startsWith('<b>'));
});
test('emoji must come from the storage origin + public path, else :name: text', () => {
  const o = { storageOrigin: 'https://x.supabase.co' };
  const one = (src, opts = o) => renderTokens([{ t: 'emoji', name: 'e', src }], fakeDoc(), opts).kids.map(html).join('');
  assert.match(one('https://x.supabase.co/storage/v1/object/public/emoji/e.webp'), /<img /);
  for (const src of ['https://evil.example/storage/v1/object/public/e.webp', 'https://x.supabase.co/other/e.webp', 'https://x.supabase.co.evil.com/storage/v1/object/public/e.webp', 'http://x.supabase.co/storage/v1/object/public/e.webp']) assert.equal(one(src), ':e:', src);
  assert.equal(one('https://x.supabase.co/storage/v1/object/public/emoji/e.webp', {}), ':e:'); // no configured origin -> never an image
});
test('mentions match any case in the users set', () => {
  const c = { me: 'Saj', users: new Set(['Saj', 'JO']), emoji: new Map() };
  assert.deepEqual(parseMessage('@saj @jo', c).filter(k => k.t === 'mention').map(k => k.me), [true, false]);
});
test('renderTokens refuses an unsafe link token and non-http emoji src', () => {
  const d = fakeDoc();
  const f = renderTokens([{ t: 'link', href: 'javascript:alert(1)', v: 'x' }, { t: 'emoji', name: 'e', src: 'javascript:1' }], d);
  const out = f.kids.map(html).join('');
  assert.ok(!out.includes('<a') && !out.includes('<img'));
});

test('badge and tabTitle', () => {
  assert.deepEqual(badge({ unread: 0, mentions: 0 }), { dot: false, text: '' });
  assert.deepEqual(badge({ unread: 4, mentions: 0 }), { dot: true, text: '' });
  assert.deepEqual(badge({ unread: 4, mentions: 3 }), { dot: true, text: '3' });
  assert.equal(badge({ unread: 200, mentions: 150 }).text, '99+');
  assert.equal(tabTitle('Free Period', 3), '(3) Free Period');
  assert.equal(tabTitle('Free Period', 0), 'Free Period');
  assert.equal(tabTitle('Free Period', 250), '(99+) Free Period');
});
