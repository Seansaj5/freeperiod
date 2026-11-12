// Which game card should play its preview on a phone: the one most in view (at least 60% visible); the first wins a tie.
export function pickInView(cards) {
  let best = null, bestRatio = 0.6 - 1e-9;
  for (const c of cards || []) if (c && c.ratio > bestRatio) { best = c.id; bestRatio = c.ratio; }
  return best;
}
