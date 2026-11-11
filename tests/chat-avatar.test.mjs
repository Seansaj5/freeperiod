// avatar() (fp/chat/views/common.js): Hallpass and other bots without an uploaded picture get the bundled Hallpass art,
// resolved next to the module so chat.html, play.html and the home page all find it. A tiny fake document stands in for
// the DOM (avatar() only builds elements).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { avatar } from '../fp/chat/views/common.js';

function fakeDocument() {
  const make = (tag) => {
    const el = {
      nodeType: 1, tagName: String(tag).toUpperCase(), className: '', textContent: '', dataset: {}, style: {}, attrs: {}, children: [],
      classList: {
        add: (...c) => { el.className = [...new Set((el.className + ' ' + c.join(' ')).trim().split(/\s+/))].join(' '); },
        contains: (c) => el.className.split(/\s+/).includes(c),
      },
      setAttribute: (k, v) => { el.attrs[k] = String(v); },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      addEventListener: () => {},
      append: (...k) => { el.children.push(...k); },
      prepend: (...k) => { el.children.unshift(...k); },
      remove: () => {},
    };
    return el;
  };
  return { createElement: make, createElementNS: (_ns, tag) => make(tag), createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }) };
}
async function withDom(fn) {
  const had = globalThis.document;
  globalThis.document = fakeDocument();
  try { return await fn(); } finally { globalThis.document = had; }
}
const imgs = (el) => el.children.filter((k) => k && k.tagName === 'IMG');
const tick = () => new Promise((r) => setTimeout(r, 0));

test('a bot with no picture shows the bundled Hallpass art (an existing file next to the module)', () => withDom(async () => {
  const el = avatar({ id: 'bot-1', username: 'hallpass', is_bot: true, avatar_path: null });
  const list = imgs(el);
  assert.equal(list.length, 1, 'one picture');
  const src = list[0].getAttribute('src');
  assert.match(src, /\/fp\/chat\/img\/hallpass\.svg$/);
  assert.ok(fs.existsSync(fileURLToPath(src)), 'the file is in the repo: ' + src);
  assert.equal(list[0].getAttribute('alt'), '');
}));

test('a bot with an uploaded picture, or a person, never gets the Hallpass art', () => withDom(async () => {
  const withPic = avatar({ id: 'bot-2', username: 'helper', is_bot: true, avatar_path: 'bot-2/a.webp' });
  const person = avatar({ id: 'u-1', username: 'amy' });
  const notBot = avatar({ id: 'u-2', username: 'ben', is_bot: false });
  await tick(); await tick();
  for (const el of [withPic, person, notBot]) assert.ok(!imgs(el).some((i) => /hallpass\.svg$/.test(i.getAttribute('src'))));
  assert.equal(imgs(person).length, 0);
  assert.equal(imgs(notBot).length, 0);
}));

test('the profile editor preview (a blob: file) wins over the Hallpass art', () => withDom(async () => {
  const el = avatar({ id: 'bot-1', username: 'hallpass', is_bot: true }, { localSrc: 'blob:http://localhost/abc' });
  const list = imgs(el);
  assert.equal(list.length, 1);
  assert.equal(list[0].getAttribute('src'), 'blob:http://localhost/abc');
}));

test('no profile at all: initials only, no picture', () => withDom(async () => {
  assert.equal(imgs(avatar(null)).length, 0);
}));
