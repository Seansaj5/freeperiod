// Hallpass FAQ matcher: free, instant, no network. matchFaq(question, faq) -> { item, score } | null.
// Score (0..1) = coverage * (0.5 + 0.5 * keywordStrength):
//   coverage        = share of the asker's meaningful words found in the entry's question or keywords
//   keywordStrength = min(1, matched keyword phrases / 2)
export const FAQ_THRESHOLD = 0.5;

const STOP = new Set(('a an the i me my we you your it its is are was were am be been do does did can could would should will how what why when where who which to of in on at for with and or but if so up out about this that these those there here please hi hello hey just get got has have had not no yes any some').split(' '));

function tokens(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(stem);
}
function stem(w) { return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w; }
function has(hay, needle) { // needle (token list) appears contiguously in hay
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let k = 0;
    while (k < needle.length && hay[i + k] === needle[k]) k++;
    if (k === needle.length) return true;
  }
  return false;
}

export function matchFaq(question, faq) {
  if (typeof question !== 'string' || !Array.isArray(faq)) return null;
  const q = tokens(question.slice(0, 500));
  const words = [...new Set(q.filter(w => !STOP.has(w)))];
  if (!words.length) return null;
  let best = null;
  for (const item of faq) {
    if (!item || typeof item.question !== 'string') continue;
    const kws = (Array.isArray(item.keywords) ? item.keywords : []).map(tokens).filter(t => t.length);
    const vocab = new Set([...tokens(item.question), ...kws.flat()]);
    const covered = words.filter(w => vocab.has(w)).length / words.length;
    const hits = kws.filter(k => has(q, k)).length;
    const score = covered * (0.5 + 0.5 * Math.min(1, hits / 2));
    if (score >= FAQ_THRESHOLD && (!best || score > best.score || (score === best.score && (item.position || 0) < (best.item.position || 0)))) best = { item, score };
  }
  return best;
}
