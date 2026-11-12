// Phones and iPads: the on-screen keyboard, and whether there is a Fullscreen API at all.
// The on-screen keyboard: iOS Safari never shrinks the page for it (it slides over the bottom), so a
// chat box at the bottom would hide behind it. While a keyboard is up, <html> gets the class fp-kb-up and three CSS
// variables from window.visualViewport (the part of the page you can see):
//   --fp-vvh    the visible height        --fp-kb    how much the keyboard covers at the bottom of the layout
//   --fp-vvtop  how far iOS scrolled the visible part down
// chat.css (the Messages page) and fp/chat/overlay.css (the play-page chat sheet) size themselves with these.

/** px of the layout viewport hidden below what you can see (0 when nothing is). */
export function keyboardInset({ layoutHeight, vvHeight, vvTop = 0, vvScale = 1 }) {
  // pinch-zoomed in: the visual viewport is small because of the zoom, not because a keyboard covers it
  if (Math.abs((Number(vvScale) || 1) - 1) > 0.01) return 0;
  const h = Math.round(Number(layoutHeight) - Number(vvHeight) - Number(vvTop));
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** True when this browser can put an element in fullscreen (desktop, Android, iPad). iPhone Safari: no (video only). */
export function hasFullscreenApi(doc, el) {
  const enabled = !!doc && (doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true);
  return !!(enabled && el && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'));
}

/** Below this the "keyboard" is just a browser bar sliding in and out. */
export const KEYBOARD_MIN = 120;

let stop = null;
/** Starts following the visual viewport (once per page; later calls share the first). Returns a stop function. */
export function trackKeyboard() {
  if (stop) return stop;
  const vv = globalThis.visualViewport, doc = globalThis.document;
  if (!vv || !doc) return () => {};
  const root = doc.documentElement;
  let raf = 0, up = false;
  const update = () => {
    raf = 0;
    const kb = keyboardInset({ layoutHeight: root.clientHeight, vvHeight: vv.height, vvTop: vv.offsetTop, vvScale: vv.scale });
    if (kb >= KEYBOARD_MIN) {
      root.style.setProperty('--fp-kb', kb + 'px');
      root.style.setProperty('--fp-vvh', Math.round(vv.height) + 'px');
      root.style.setProperty('--fp-vvtop', Math.round(vv.offsetTop) + 'px');
      if (!up) { up = true; root.classList.add('fp-kb-up'); }
    } else if (up) {
      up = false;
      root.classList.remove('fp-kb-up');
      for (const k of ['--fp-kb', '--fp-vvh', '--fp-vvtop']) root.style.removeProperty(k);
    }
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', on);
  vv.addEventListener('scroll', on);
  update();
  stop = () => {
    vv.removeEventListener('resize', on);
    vv.removeEventListener('scroll', on);
    if (raf) cancelAnimationFrame(raf);
    root.classList.remove('fp-kb-up');
    for (const k of ['--fp-kb', '--fp-vvh', '--fp-vvtop']) root.style.removeProperty(k);
    stop = null;
  };
  return stop;
}
