// Pure helpers for the message feed (no DOM): client ids, matching a server row to the temp it came from,
// which unsent messages survive an account change, and the 500-message window per conversation.
export const CAP = 500;

const HEX = '0123456789abcdef';
// A fresh id for one send. The server echoes it back on the row (`client_id`, unique per author) so a row can be matched to its temp.
export function newClientId(cryptoObj = globalThis.crypto) {
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else { const r = Math.floor(Math.random() * 16); out += HEX[i === 19 ? (r & 3) | 8 : r]; }
  }
  return out;
}

// The temp a server row came from: same client_id, nothing else (two identical or picture-only messages are different sends).
export function matchTemp(temps, row) {
  const id = row && row.client_id;
  if (!id) return null;
  return temps.find((t) => t.client_id === id) || null;
}

// After a restart: unsent messages of the signed-in account stay, anyone else's are dropped.
export function splitPending(temps, uid) {
  const keep = [], drop = [];
  for (const t of temps) (uid && t.author_id === uid ? keep : drop).push(t);
  return { keep, drop };
}

// msgs sorted oldest -> newest. Over max: drop the oldest, or the newest when the reader is up in the history.
export function capWindow(msgs, max, trimNewest) {
  const over = msgs.length - max;
  if (over <= 0) return { keep: msgs, dropped: [] };
  return trimNewest ? { keep: msgs.slice(0, max), dropped: msgs.slice(max) } : { keep: msgs.slice(over), dropped: msgs.slice(0, over) };
}
