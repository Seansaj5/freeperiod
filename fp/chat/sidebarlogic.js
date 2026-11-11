// Pure sidebar logic (no DOM): categories + channels grouping, collapsed-state storage, voice labels, member sections.
const byPosId = (a, b) => ((a.position | 0) - (b.position | 0)) || (a.id - b.id);
const KEY = 'fp.chat.cats';

// -> [{ category: Category|null, collapsed, channels }]: uncategorized first (no header), then categories by position.
export function groupSidebar({ channels = [], categories = [], collapsed = new Set(), current = null, roster = new Map(), guest = false, showEmpty = false } = {}) {
  const cats = [...categories].sort(byPosId);
  const known = new Set(cats.map((c) => c.id));
  const buckets = new Map();
  for (const c of [...channels].sort(byPosId)) {
    const k = c.category_id != null && known.has(c.category_id) ? c.category_id : null;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  const out = [];
  const loose = buckets.get(null) || [];
  if (loose.length) out.push({ category: null, collapsed: false, channels: loose });
  for (const category of cats) {
    const all = buckets.get(category.id) || [];
    if (!all.length && (guest || !showEmpty)) continue;
    const isCollapsed = collapsed.has(category.id);
    const shown = isCollapsed
      ? all.filter((c) => c.id === current || (c.kind === 'voice' && (roster.get(c.id) || []).length > 0))
      : all;
    out.push({ category, collapsed: isCollapsed, channels: shown });
  }
  return out;
}

export function readCollapsed(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY));
    return new Set(Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : []);
  } catch { return new Set(); }
}
export function writeCollapsed(storage, set) {
  try { storage.setItem(KEY, JSON.stringify([...set])); } catch { /* storage blocked or full: not worth failing over */ }
}

export const voiceLabel = (name) => String(name ?? '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const TITLES = { owner: 'Owner', mods: 'Mods', bots: 'Bots', online: 'Online', offline: 'Offline' };
export function memberSections(profiles = [], onlineIds = new Set()) {
  const groups = { owner: [], mods: [], bots: [], online: [], offline: [] };
  for (const p of profiles) {
    const k = !onlineIds.has(p.id) ? 'offline' : p.is_bot === true ? 'bots' : p.role === 'owner' ? 'owner' : p.role === 'mod' ? 'mods' : 'online';
    groups[k].push(p);
  }
  const label = (p) => String(p.name || p.username || '').toLowerCase();
  return Object.keys(groups).filter((k) => groups[k].length)
    .map((key) => ({ key, title: TITLES[key], people: groups[key].sort((a, b) => label(a).localeCompare(label(b))) }));
}
