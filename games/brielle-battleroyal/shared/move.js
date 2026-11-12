// How a body moves: walking, sprinting, crouching, jumping, swimming, skydiving and gliding.
// Your own player runs this in your browser (so it feels instant); bots run it on whoever hosts the match.
import { BODY, MAP, FALL } from './rules.js';

/** A fresh body. mode: 'ground' | 'sky' | 'glide' | 'swim' */
export function newBody(x, y, z, mode = 'ground') {
  return { x, y, z, vx: 0, vy: 0, vz: 0, mode, onGround: false, crouch: false, peak: y, landed: 0, swim: false };
}

/**
 * Moves body b for dt seconds. inp = { mx, mz (wanted move in the camera frame, -1..1: mz -1 = forward), yaw, pitch,
 * jump, sprint, crouch, ads }. Sets b.landed to a fall height (metres) on the step it lands from a long drop.
 */
export function stepBody(world, b, inp, dt) {
  b.landed = 0;
  let left = Math.min(dt, 0.1);
  while (left > 1e-4) {
    const h = Math.min(left, 1 / 60);
    sub(world, b, inp, h);
    left -= h;
  }
}

function sub(world, b, inp, dt) {
  const R = BODY.R;
  const sin = Math.sin(inp.yaw), cos = Math.cos(inp.yaw);
  // wanted direction in the world: forward = (-sin, -cos), right = (cos, -sin); mz -1 = forward, mx +1 = right
  let wx = (-sin) * (-inp.mz) + cos * inp.mx;
  let wz = (-cos) * (-inp.mz) - sin * inp.mx;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  if (b.mode === 'sky' || b.mode === 'glide') {
    const sky = b.mode === 'sky';
    const side = sky ? BODY.SKY_SIDE : BODY.GLIDE_SIDE;
    const dive = sky && inp.pitch < -0.55 && inp.mz < 0;
    const fall = sky ? (dive ? BODY.SKY_DIVE : BODY.SKY_FALL) : BODY.GLIDE_FALL;
    const a = sky ? 14 : 9;
    b.vx += (wx * side * (dive ? 1.25 : 1) - b.vx) * Math.min(1, a * dt / side);
    b.vz += (wz * side * (dive ? 1.25 : 1) - b.vz) * Math.min(1, a * dt / side);
    b.vy += (-fall - b.vy) * Math.min(1, 3 * dt);
    b.crouch = false;
  } else if (b.mode === 'swim') {
    const sp = BODY.SWIM;
    b.vx += (wx * sp - b.vx) * Math.min(1, 8 * dt);
    b.vz += (wz * sp - b.vz) * Math.min(1, 8 * dt);
    b.vy = 0;
    b.crouch = false;
  } else {
    b.crouch = !!inp.crouch && b.onGround;
    let sp = b.crouch ? BODY.CROUCH : (inp.sprint && inp.mz < -0.3 && !inp.ads ? BODY.SPRINT : BODY.WALK);
    if (inp.ads) sp *= BODY.ADS_MUL;
    const a = b.onGround ? 70 : 14;
    const tx = wx * sp, tz = wz * sp;
    const dvx = tx - b.vx, dvz = tz - b.vz, dl = Math.hypot(dvx, dvz), mx = a * dt;
    if (dl <= mx) { b.vx = tx; b.vz = tz; } else { b.vx += (dvx / dl) * mx; b.vz += (dvz / dl) * mx; }
    if (inp.jump && b.onGround) { b.vy = BODY.JUMP; b.onGround = false; }
    b.vy -= BODY.G * dt;
    if (b.vy < -60) b.vy = -60;
  }

  const H = b.crouch ? BODY.CROUCH_H : BODY.H;
  // horizontal, one axis at a time, stepping up small ledges
  for (const axis of [0, 1]) {
    const d = (axis === 0 ? b.vx : b.vz) * dt;
    if (!d) continue;
    const nx = axis === 0 ? b.x + d : b.x, nz = axis === 1 ? b.z + d : b.z;
    const top = world.hit(nx - R, b.y + 0.04, nz - R, nx + R, b.y + H, nz + R);
    if (top === null) { b.x = nx; b.z = nz; continue; }
    const canStep = (b.mode === 'ground' || b.mode === 'swim') && top - b.y <= (b.mode === 'swim' ? 2.5 : BODY.STEP) && world.hit(nx - R, top + 0.02, nz - R, nx + R, top + H, nz + R) === null;
    if (canStep) { b.x = nx; b.z = nz; b.y = top; continue; }
    if (axis === 0) b.vx = 0; else b.vz = 0;
  }
  const lim = MAP.EDGE;
  if (b.x < -lim) { b.x = -lim; b.vx = 0; } if (b.x > lim) { b.x = lim; b.vx = 0; }
  if (b.z < -lim) { b.z = -lim; b.vz = 0; } if (b.z > lim) { b.z = lim; b.vz = 0; }

  // vertical
  const g = world.ground(b.x, b.z, R * 0.92, b.y + BODY.STEP * (b.onGround ? 1 : 0.5));
  if (b.mode === 'swim') {
    if (g > BODY.SWIM_Y - 0.05) { b.mode = 'ground'; b.y = Math.max(b.y, g); }
    else { b.y = BODY.SWIM_Y; b.onGround = false; if (inp.jump) { /* tread water */ } }
    return;
  }
  let ny = b.y + b.vy * dt;
  if (b.vy > 0) {
    const c = world.ceiling(b.x, b.z, R * 0.9, b.y + H - 0.01, ny + H + 0.01);
    if (c < Infinity) { ny = c - H; b.vy = 0; }
  }
  if (b.mode === 'ground' && b.onGround && b.vy <= 0 && g < b.y && b.y - g < 0.45) ny = g; // stick to slopes/stairs going down
  if (ny <= g) {
    if (b.mode !== 'ground') b.mode = 'ground';
    if (!b.onGround) { const drop = b.peak - g; if (drop > FALL.SAFE) b.landed = drop; }
    ny = g; b.vy = 0; b.onGround = true; b.peak = g;
  } else {
    b.onGround = false;
    if (b.mode === 'ground' && ny > b.peak) b.peak = ny;
    if (b.mode === 'sky' && ny - g < BODY.GLIDE_AT) b.mode = 'glide';
    if (b.mode !== 'ground') b.peak = ny;   // skydivers and gliders don't take fall damage
  }
  b.y = ny;
  if (b.onGround) b.peak = b.y;
  // into deep water: swim
  if (b.y < BODY.SWIM_Y + 0.05 && g < BODY.SWIM_Y - 0.1 && b.mode === 'ground') { b.mode = 'swim'; b.y = BODY.SWIM_Y; b.vy = 0; b.onGround = false; b.peak = b.y; }
}
