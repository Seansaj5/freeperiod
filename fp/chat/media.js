// Upload planning (pure) and re-encoding (browser canvas).
const MB = 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_INPUT = 25 * MB; // a static picture bigger than this is not worth decoding in a phone's memory
// GIFs go as-is up to gif MB; static pictures are re-encoded to WebP inside maxW x maxH (cover = crop to fill).
const KINDS = {
  chat: { gif: 8, maxW: 1600, maxH: 1600, fit: 'inside' },
  avatar: { gif: 4, maxW: 512, maxH: 512, fit: 'cover' },
  banner: { gif: 6, maxW: 1500, maxH: 600, fit: 'inside' },
  emoji: { gif: 1, maxW: 128, maxH: 128, fit: 'inside' },
};
export const CHAT_PICTURE_MAX = 5 * MB; // re-encoded chat pictures must end up at or under this

export function planUpload({ type, size } = {}, kind) {
  const k = KINDS[kind];
  if (!k) return { ok: false, reason: 'Unknown upload kind' };
  if (!TYPES.includes(type)) return { ok: false, reason: 'Only PNG, JPEG, WebP or GIF pictures' };
  if (!(typeof size === 'number' && size > 0 && isFinite(size))) return { ok: false, reason: 'That file looks empty' };
  if (type === 'image/gif') {
    if (size > k.gif * MB) return { ok: false, reason: 'That GIF is too big (max ' + k.gif + ' MB)' };
    return { ok: true, mode: 'asis', maxW: k.maxW, maxH: k.maxH };
  }
  if (size > MAX_INPUT) return { ok: false, reason: 'That picture is too big (max 25 MB)' };
  return { ok: true, mode: 'reencode', maxW: k.maxW, maxH: k.maxH, fit: k.fit };
}

function canvasFor(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = globalThis.document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toBlob(c, quality) {
  const opts = { type: 'image/webp', quality };
  if (typeof c.convertToBlob === 'function') return c.convertToBlob(opts);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not encode the picture'))), opts.type, quality));
}

export async function reencode(file, plan) {
  if (!plan || plan.mode !== 'reencode') return file;
  const bmp = await createImageBitmap(file);
  try {
    const sw = bmp.width, sh = bmp.height;
    let cw, ch, sx = 0, sy = 0, sWidth = sw, sHeight = sh;
    if (plan.fit === 'cover') {
      cw = ch = Math.min(plan.maxW, sw, sh);
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sWidth = sHeight = side;
    } else {
      const scale = Math.min(1, plan.maxW / sw, plan.maxH / sh);
      cw = Math.max(1, Math.round(sw * scale)); ch = Math.max(1, Math.round(sh * scale));
    }
    const c = canvasFor(cw, ch);
    c.getContext('2d').drawImage(bmp, sx, sy, sWidth, sHeight, 0, 0, cw, ch);
    let blob = await toBlob(c, 0.86);
    for (const q of [0.7, 0.5]) { // keep chat pictures under the cap
      if (blob.size <= CHAT_PICTURE_MAX) break;
      blob = await toBlob(c, q);
    }
    return blob;
  } finally {
    if (typeof bmp.close === 'function') bmp.close();
  }
}
