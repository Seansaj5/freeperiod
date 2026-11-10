// Safe localStorage wrapper: never throws (private mode, blocked storage, quota).
function ls() { try { return globalThis.localStorage || null; } catch { return null; } }

export function get(k) { try { const s = ls(); return s ? s.getItem(k) : null; } catch { return null; } }
export function set(k, v) { try { const s = ls(); if (!s) return false; s.setItem(k, String(v)); return true; } catch { return false; } }
export function del(k) { try { const s = ls(); if (s) s.removeItem(k); } catch { /* ignore */ } }
export function json(k, fallback = null) {
  const raw = get(k);
  if (raw == null) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}
export function setJson(k, v) { return set(k, JSON.stringify(v)); }
