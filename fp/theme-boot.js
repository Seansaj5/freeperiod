// Runs in <head> before the first paint (a plain script, not a module): puts the saved accent on <html> so the page never
// flashes lime first. fp/theme.js owns the list and the picker; keep this pattern in step with ACCENTS there.
try {
  var fpAccent = localStorage.getItem('fp.accent');
  if (/^(cyan|pink|orange|violet)$/.test(fpAccent || '')) document.documentElement.setAttribute('data-accent', fpAccent);
} catch (e) { /* storage blocked: lime */ }
