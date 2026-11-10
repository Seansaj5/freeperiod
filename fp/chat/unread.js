// Unread/mention display helpers.
const cap = (n) => (n > 99 ? '99+' : String(n));

// Mentions show a number badge; plain unread is just a dot.
export function badge({ unread = 0, mentions = 0 } = {}) {
  if (mentions > 0) return { dot: true, text: cap(mentions) };
  if (unread > 0) return { dot: true, text: '' };
  return { dot: false, text: '' };
}

export function tabTitle(base, totalMentions) {
  return totalMentions > 0 ? '(' + cap(totalMentions) + ') ' + base : base;
}
