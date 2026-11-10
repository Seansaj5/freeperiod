// Messages page entry (chat.html): header account chip + the chat app.
import * as session from '../session.js';
import { mountAccount } from '../account-ui.js';
import { mountChatApp } from './app.js';

mountAccount(document.getElementById('account'));
mountChatApp(document.getElementById('chat'), { compact: false });
session.resume();
