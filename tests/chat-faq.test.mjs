import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFaq, isRealQuestion } from '../fp/chat/faq.js';

// Fixture only: the real entries are seeded by the migration.
const FAQ = [
  { id: 1, question: 'How do I log in?', answer: 'Use your Bing Ball account.', keywords: ['login', 'log in', 'sign in', 'account', 'password'], position: 1 },
  { id: 2, question: 'My Close Call cars are gone', answer: 'Saves live in the browser; log in to sync.', keywords: ['close call', 'cars', 'save', 'saves', 'gone', 'lost', 'progress'], position: 2 },
  { id: 3, question: 'Bing Ball says waking up', answer: 'The server naps; wait about a minute.', keywords: ['waking', 'bing ball', 'loading', 'slow'], position: 3 },
  { id: 4, question: 'How do I report someone?', answer: 'Use the report button on a message.', keywords: ['report', 'block', 'harass', 'mean'], position: 4 },
];

test('matches the login entry', () => {
  const r = matchFaq('how do i log in', FAQ);
  assert.equal(r.item.id, 1);
  assert.ok(r.score >= 0.5 && r.score <= 1);
});
test('matches the saves entry', () => {
  assert.equal(matchFaq('my close call cars are gone', FAQ).item.id, 2);
  assert.equal(matchFaq('I lost my saves', FAQ).item.id, 2);
});
test('unrelated questions give null', () => {
  assert.equal(matchFaq('what is 2+2', FAQ), null);
  assert.equal(matchFaq('', FAQ), null);
  assert.equal(matchFaq('   ', FAQ), null);
  assert.equal(matchFaq('how do i', FAQ), null); // only stop words
});
test('bad input never throws', () => {
  assert.equal(matchFaq(null, FAQ), null);
  assert.equal(matchFaq('login', null), null);
  assert.equal(matchFaq('login', []), null);
  assert.equal(matchFaq('login', [{ id: 9 }, null]), null);
});
test('punctuation and case are ignored; the best entry wins', () => {
  assert.equal(matchFaq('HOW DO I REPORT SOMEONE?!', FAQ).item.id, 4);
  assert.equal(matchFaq('Why is bing ball waking up so slow', FAQ).item.id, 3);
});

test('isRealQuestion mirrors the server gate', () => {
  for (const t of ['hi', 'lol', 'thanks so much', 'ok', '12345 678 90', '', null]) assert.equal(isRealQuestion(t), false, String(t));
  for (const t of ['how do i get more cars', 'what is 2+2']) assert.equal(isRealQuestion(t), true, t);
});
