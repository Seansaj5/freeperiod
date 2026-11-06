(() => {
  const games = window.GAMES || [];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const playLink = (g) => `play.html?g=${encodeURIComponent(g.id)}`;
  const playIcon = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 1.8v12.4a.8.8 0 0 0 1.2.7l10.4-6.2a.8.8 0 0 0 0-1.4L4.2 1.1A.8.8 0 0 0 3 1.8z"/></svg>';
  const tagsHtml = (g) => `<div class="tags">${g.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
  const isNew = (g) => g.added && Date.now() - new Date(g.added).getTime() < 14 * 864e5;

  // Free servers (Render) nap after ~15 idle minutes. Poke them now so they are awake by the time someone clicks Play.
  games.filter((g) => g.wakes).forEach((g) => fetch(g.url, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}));

  // ---------- featured banner ----------
  const hero = games.find((g) => g.featured) || games[0];
  if (hero) {
    $('hero').outerHTML = `
      <a class="hero" href="${playLink(hero)}">
        <div class="hero-art" style="background-image:url('${esc(hero.hero || hero.thumb)}')"></div>
        <div class="hero-copy">
          <div class="eyebrow">Featured</div>
          <h1>${esc(hero.title)}</h1>
          <p>${esc(hero.tagline)}</p>
          ${tagsHtml(hero)}
          <div class="hero-actions">
            <span class="btn-play">${playIcon} Play now</span>
            ${hero.wakes ? '<span class="hint">First load can take up to a minute while the server wakes up.</span>' : ''}
          </div>
        </div>
      </a>`;
  }

  // ---------- filter chips ----------
  const allTags = [...new Set(games.flatMap((g) => g.tags))];
  let tag = 'All';
  $('chips').innerHTML = ['All', ...allTags].map((t) => `<button class="chip${t === tag ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    tag = b.dataset.tag;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    render();
  });

  // ---------- grid ----------
  const soonCard = `
    <div class="card soon">
      <svg class="flask" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/></svg>
      <strong>Next game in the lab</strong>
      <span>More games are being built. Got an idea? Tell Sean.</span>
    </div>`;

  function render() {
    const q = $('q').value.trim().toLowerCase();
    const list = games.filter((g) => (tag === 'All' || g.tags.includes(tag)) &&
      (!q || [g.title, g.tagline, ...g.tags].join(' ').toLowerCase().includes(q)));
    $('grid').innerHTML = list.map((g) => `
      <a class="card" href="${playLink(g)}" style="--accent:${esc(g.accent || '#c6ff3d')}">
        <div class="thumb">
          <img src="${esc(g.thumb)}" alt="" loading="lazy" />
          ${isNew(g) ? '<span class="new">NEW</span>' : ''}
          <span class="go">${playIcon}</span>
        </div>
        <div class="card-body">
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.tagline)}</p>
          ${tagsHtml(g)}
        </div>
      </a>`).join('') + (!q && tag === 'All' ? soonCard : '');
    $('empty').style.display = list.length || (!q && tag === 'All') ? 'none' : 'block';
    $('count').textContent = list.length;
  }
  $('q').addEventListener('input', render);
  render();
  $('foot-count').textContent = `${games.length} game${games.length === 1 ? '' : 's'} and counting`;

  // "/" jumps to search
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); }
    if (e.key === 'Escape' && document.activeElement === $('q')) { $('q').value = ''; render(); $('q').blur(); }
  });

  // ---------- clock ----------
  function tick() {
    const d = new Date();
    $('time').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const h = d.getHours();
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    $('mood').textContent = weekend ? 'weekend mode'
      : h < 7 ? 'way too early' : h < 15 ? 'free period' : h < 18 ? 'after school' : h < 23 ? 'game night' : 'go to sleep';
  }
  tick();
  setInterval(tick, 15000);
})();
