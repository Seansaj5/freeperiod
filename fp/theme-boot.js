// Runs in <head> before the first paint (a plain script, not a module): puts the saved accent, theme and effects switch on
// <html> so the page never flashes lime/neon first. fp/theme.js owns the lists and the picker; keep these patterns in step
// with ACCENTS and THEMES there (tests/hub-bits and tests/theme check both).
try {
  var fpAccent = localStorage.getItem('fp.accent');
  if (/^(cyan|pink|orange|violet)$/.test(fpAccent || '')) document.documentElement.setAttribute('data-accent', fpAccent);
} catch (e) { /* storage blocked: lime */ }
try {
  var fpTheme = localStorage.getItem('fp.theme');
  var fpFx = localStorage.getItem('fp.fx');
  var fpT = /^(aero|space|minimal)$/.test(fpTheme || '') ? fpTheme : 'neon';
  document.documentElement.setAttribute('data-theme', fpT);
  document.documentElement.setAttribute('data-fx', fpFx === 'on' || (fpFx !== 'off' && fpT !== 'minimal') ? 'on' : 'off');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'neon');
  document.documentElement.setAttribute('data-fx', 'on');
}
