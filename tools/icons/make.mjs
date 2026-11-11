#!/usr/bin/env node
// Free Period app icons (Add to Home Screen / install): the header's bell logo on the Neon background, drawn as SVG and
// rendered to PNG by headless Chrome. Writes assets/icons/:
//   icon-192.png, icon-512.png   "any": a rounded tile with see-through corners
//   maskable-512.png             full bleed; the bell sits inside the middle 80% circle (Android crops to any shape)
//   apple-touch-icon.png (180)   full bleed, no transparency (iOS rounds the corners itself)
// Needs puppeteer-core (not a dependency of this repo): `npm i puppeteer-core` in any scratch folder and pass
// PUPPETEER_DIR=<that folder>. Google Chrome must be installed (CHROME=<path> to override).
//   PUPPETEER_DIR=/path/to/scratch node tools/icons/make.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/icons');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!process.env.PUPPETEER_DIR) { console.error('Set PUPPETEER_DIR to a folder with puppeteer-core installed.'); process.exit(1); }
const pp = createRequire(path.join(path.resolve(process.env.PUPPETEER_DIR), 'node_modules/'))('puppeteer-core');

// The bell from the header logo (index.html .logo svg, 64x64 box): lime bell, cyan dot. Its ink spans about x 15.5-53,
// y 9.5-52.5, so (34.25, 31) is its middle.
const BELL = `<g fill="none" stroke="#c6ff3d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 42h28l-3.5-5V27a10.5 10.5 0 0 0-21 0v10z"/><path d="M28 48a4.5 4.5 0 0 0 8 0"/><path d="M32 12v4"/></g>
  <circle cx="47" cy="17" r="6" fill="#3de0ff"/>`;
const BG = '#05070c';
function svg({ size, scale, radius }) {
  const art = `translate(32 32) scale(${scale}) translate(-34.25 -31)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="sky" cx="50%" cy="22%" r="85%"><stop offset="0" stop-color="#132036"/><stop offset="0.55" stop-color="#0a1220"/><stop offset="1" stop-color="${BG}"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#c6ff3d" stop-opacity="0.2"/><stop offset="1" stop-color="#c6ff3d" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <clipPath id="tile"><rect width="64" height="64" rx="${radius}"/></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="64" height="64" fill="url(#sky)"/>
    <circle cx="32" cy="32" r="${26 * scale}" fill="url(#halo)"/>
    <g transform="${art}" opacity="0.55" filter="url(#glow)">${BELL}</g>
    <g transform="${art}">${BELL}</g>
  </g>
</svg>`;
}
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.92, radius: 14, transparent: true },
  { file: 'icon-512.png', size: 512, scale: 0.92, radius: 14, transparent: true },
  { file: 'maskable-512.png', size: 512, scale: 0.7, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.86, radius: 0 },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await pp.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const ic of ICONS) {
    await page.setViewport({ width: ic.size, height: ic.size, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${ic.transparent ? 'transparent' : BG}">${svg(ic)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, ic.file), clip: { x: 0, y: 0, width: ic.size, height: ic.size }, omitBackground: !!ic.transparent });
    console.log('wrote assets/icons/' + ic.file);
  }
} finally {
  await browser.close();
}
