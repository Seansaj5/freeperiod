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
// The look of a security feed: static, scan lines, a rolling bar, dark corners.
export function feedFx(c, t, glitch) {
  staticFx(c, glitch ? 0.95 : 0.06, t);
  c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < 720; y += 4) c.fillRect(0, y, 1280, 1);
  c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, (t * 90) % 900 - 90, 1280, 70);
  const g = c.createRadialGradient(640, 340, 250, 640, 360, 820); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)'); c.fillStyle = g; c.fillRect(0, 0, 1280, 720);
  c.fillStyle = 'rgba(40,90,70,.08)'; c.fillRect(0, 0, 1280, 720);
}
