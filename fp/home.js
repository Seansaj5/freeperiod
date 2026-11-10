// Home page entry: account chip + suggest bar (the next task wires the rest).
import * as session from './session.js';
import { mountAccount } from './account-ui.js';
import { mountSuggest } from './suggest.js';

mountAccount(document.getElementById('account'));
mountSuggest(document.getElementById('suggest'));
session.resume();
