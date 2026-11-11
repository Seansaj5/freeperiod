// Runs in <head> before the first paint (a plain script, not a module): puts the saved accent, theme and effects switch on
// <html> (and the theme's color on <meta name="theme-color">) so the page never flashes lime/neon first. fp/theme.js owns
// the lists and the picker; keep these patterns in step with ACCENTS, the READY themes in THEMES, and THEME_COLORS there
// (tests/hub-bits and tests/theme check them). A theme that is not ready yet is not in the pattern: it shows neon.
try {
  var fpAccent = localStorage.getItem('fp.accent');
  if (/^(lime|cyan|pink|orange|violet)$/.test(fpAccent || '')) document.documentElement.setAttribute('data-accent', fpAccent);
} catch (e) { /* storage blocked: the theme's accent */ }
try {
  var fpTheme = localStorage.getItem('fp.theme');
  var fpFx = localStorage.getItem('fp.fx');
  var fpT = /^(aero|space|minimal)$/.test(fpTheme || '') ? fpTheme : 'neon';
  var fpTC = { neon: '#05070c', aero: '#16335e', space: '#000000', minimal: '#0d0d0f' };
  document.documentElement.setAttribute('data-theme', fpT);
  document.documentElement.setAttribute('data-fx', fpFx === 'on' || (fpFx !== 'off' && fpT !== 'minimal') ? 'on' : 'off');
  var fpMeta = document.querySelector('meta[name="theme-color"]');
  if (fpMeta) fpMeta.setAttribute('content', fpTC[fpT]);
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'neon');
  document.documentElement.setAttribute('data-fx', 'on');
}
