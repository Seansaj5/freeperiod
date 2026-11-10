// Upload planning (pure) and re-encoding (browser canvas).
const MB = 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_INPUT = 25 * MB; // a static picture bigger than this is not worth decoding in a phone's memory
// GIFs go as-is up to gif MB; static pictures are re-encoded (WebP, or PNG/JPEG where WebP can't be made) inside
// maxW x maxH (cover = crop to fill).
const KINDS = {
  chat: { gif: 8, maxW: 1600, maxH: 1600, fit: 'inside' },
  avatar: { gif: 4, maxW: 512, maxH: 512, fit: 'cover' },
  banner: { gif: 6, maxW: 1500, maxH: 600, fit: 'inside' },
  emoji: { gif: 1, maxW: 128, maxH: 128, fit: 'inside' },
};
export const CHAT_PICTURE_MAX = 5 * MB; // re-encoded chat pictures must end up at or under this
const BUCKET_MAX = 8 * MB;               // the storage bucket's own cap, the limit for avatars, banners and emoji

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
  return { ok: true, mode: 'reencode', maxW: k.maxW, maxH: k.maxH, fit: k.fit, kind, cap: kind === 'chat' ? CHAT_PICTURE_MAX : BUCKET_MAX };
}

function canvasFor(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = globalThis.document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toBlob(c, type, quality) {
  const opts = quality == null ? { type } : { type, quality };
  if (typeof c.convertToBlob === 'function') return c.convertToBlob(opts);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not encode the picture'))), type, quality));
}

// Output formats, best first. WebP is smallest, but Safari (and some older browsers) can't encode it: a canvas asked
// for WebP hands back PNG there. Then PNG (keeps transparency; fine for small pictures) and JPEG (photos) are used.
// The storage buckets accept all three.
const FORMATS = [
  { type: 'image/webp', qualities: [0.86, 0.7] },
  { type: 'image/png', qualities: [null] },
  { type: 'image/jpeg', qualities: [0.86, 0.7], opaque: true },
];

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
    const cap = plan.cap || CHAT_PICTURE_MAX;
    let encoded = false; // did the browser ever hand back a format we asked for?
    const skip = new Set(); // formats this browser can't encode (it answered with another type)
    for (const scale of [1, 0.75, 0.56, 0.42]) {
      const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
      for (const f of FORMATS) {
        if (skip.has(f.type)) continue;
        if (f.type !== 'image/webp' && !skip.has('image/webp')) continue; // PNG/JPEG only where WebP can't be made
        const c = canvasFor(w, h);
        const g = c.getContext('2d');
        if (f.opaque && g.fillRect) { g.fillStyle = '#10141c'; g.fillRect(0, 0, w, h); } // JPEG has no transparency
        g.drawImage(bmp, sx, sy, sWidth, sHeight, 0, 0, w, h);
        for (const q of f.qualities) {
          let blob = null;
          try { blob = await toBlob(c, f.type, q); } catch { blob = null; } // some browsers reject a type instead
          if (!blob || blob.type !== f.type) { skip.add(f.type); break; }
          encoded = true;
          if (blob.size <= cap) return blob;
        }
      }
    }
    throw new Error(encoded ? 'That picture is too big' : "This browser can't convert pictures. Try a GIF, or another browser.");
  } finally {
    if (typeof bmp.close === 'function') bmp.close();
  }
}
