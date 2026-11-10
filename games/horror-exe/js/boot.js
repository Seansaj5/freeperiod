// The end of the boot screen. index.html shows the fake console and the real loading bar while the code
// downloads; once main.js has everything ready, the "cartridge" crashes for a moment, a face flickers through
// the error window, then it recovers and the cheerful title appears like nothing happened.
import { drawGlitchFrame, GLITCH_FACES } from './rig.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolves once the boot screen is gone. Clicking or pressing a key skips the crash. */
export async function finishBoot() {
  const B = window.__boot;
  if (!B || B.finished) { window.__bootDone = true; return; }
  B.set(1, 'READY');
  let skipped = false;
  const skip = () => { skipped = true; };
  $('boot').addEventListener('pointerdown', skip);
  addEventListener('keydown', skip, { once: true });
  // let the log and the bar finish
  while (!skipped && (!B.linesDone || B.shown < 0.999)) await wait(40);
  if (!skipped) {
    $('bootLog').textContent += '\nCHECKSUM ............ ';
    await wait(420);
    $('bootLog').insertAdjacentHTML('beforeend', '<span class="bad">FAILED</span>\n');
    await wait(260);
  }
  if (!skipped) {
    $('bootErr').classList.remove('hidden');
    const face = $('bootFace'), g = face.getContext('2d');
    face.width = 240; face.height = Math.max(120, Math.round((240 * innerHeight) / Math.max(1, innerWidth)));
    const flash = async (frame, ms) => {
      drawGlitchFrame(g, GLITCH_FACES[frame], performance.now() / 1000, 0.9);
      face.classList.add('on'); $('bootErr').classList.add('shake');
      await wait(ms);
      face.classList.remove('on'); $('bootErr').classList.remove('shake');
    };
    await wait(500);
    if (!skipped) await flash(2, 90);
    await wait(380);
    if (!skipped) await flash(1, 60);
    for (let i = 0; i < 12 && !skipped; i++) await wait(50);
  }
  // recovered: a white flash and the title
  $('bootErr').classList.add('hidden');
  B.finished = true; window.__bootDone = true;
  $('boot').classList.add('gone');
  setTimeout(() => { $('boot').style.display = 'none'; }, 500);
}
