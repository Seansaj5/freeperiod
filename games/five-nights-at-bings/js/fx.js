// TV static for the camera feeds and menus, drawn on the 2D overlay canvas.
const noiseCv = [];
function makeNoise() {
  for (let k = 0; k < 4; k++) { const n = document.createElement('canvas'); n.width = n.height = 256; const x = n.getContext('2d'), im = x.createImageData(256, 256); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0); noiseCv.push(n); }
}
export function staticFx(c, a, t) {
  if (!noiseCv.length) makeNoise();
  c.save(); c.globalAlpha = a; c.imageSmoothingEnabled = false;
  c.drawImage(noiseCv[(t * 30 | 0) % 4], 0, 0, 256, 144, 0, 0, 1280, 720);
  c.restore();
}
// Extra snow over a camera feed while its signal is lost (the lens shader does the rest).
export function feedFx(c, t, glitch) { if (glitch) staticFx(c, 0.45, t); }
