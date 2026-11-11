// Messages page entry (chat.html): header account chip + the chat app.
// chat.html?c=<channel id>&m=<message id> or ?dm=<dm id> opens that conversation (links from the owner Inbox's Reports).
import * as session from '../session.js';
import { mountAccount } from '../account-ui.js';
import { mountChatApp } from './app.js';
import { trackKeyboard } from '../viewport.js';

trackKeyboard(); // phones: the page shrinks to what the on-screen keyboard leaves, so the message box stays in view
mountAccount(document.getElementById('account'));
const app = mountChatApp(document.getElementById('chat'), { compact: false });
session.resume();

const q = new URLSearchParams(location.search);
const num = (v) => (/^\d{1,18}$/.test(v || '') ? Number(v) : null);
if (num(q.get('c')) != null) app.open({ channel: num(q.get('c')), message: num(q.get('m')) ?? undefined });
else if (/^[0-9a-f-]{36}$/i.test(q.get('dm') || '')) app.open({ dm: q.get('dm') });
// The owner Inbox (opened on this page) asks to show a reported message.
addEventListener('fp:chat-open', (e) => { if (e.detail) app.open(e.detail); });
