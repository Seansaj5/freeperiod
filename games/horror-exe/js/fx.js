// Screen effects: a post-process pass for static, color splitting, tearing, red tint and flashes,
// plus the jumpscare overlay and random whispers.
import * as THREE from 'three';
import { drawScareFace } from './rig.js';
import { damp } from '../shared/util.js';

export const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, aberr: { value: 0.002 }, noise: { value: 0.03 }, tear: { value: 0 },
    pixel: { value: 0 }, red: { value: 0 }, vignette: { value: 0.3 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 0, 0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, aberr, noise, tear, pixel, red, vignette, flash; uniform vec3 flashColor; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float band = floor(uv.y * 28.0);
      float tf = floor(time * 18.0);
      if (rand(vec2(band, tf)) < tear) uv.x += (rand(vec2(band, tf + 3.0)) - 0.5) * 0.12 * (0.4 + tear);
      if (pixel > 0.0) { float b = 0.012 + pixel * 0.05; vec2 bl = floor(uv / b); if (rand(bl + tf) < pixel * 0.6) uv = (bl + 0.5) * b; }
      vec2 dir = (uv - 0.5) * aberr * 3.0 + vec2(aberr, 0.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
      float n = rand(uv * vec2(733.0, 411.0) + fract(time * 7.13));
      col += (n - 0.5) * noise * 0.9;
      col = mix(col, vec3(n * 0.7), noise * noise * 0.6);
      col *= 0.95 + 0.05 * sin(vUv.y * 900.0 + time * 6.0);
      col = mix(col, col * vec3(1.45, 0.45, 0.45), red);
      float v = smoothstep(0.95, 0.25, length(vUv - 0.5) * (1.0 + vignette));
      col *= mix(1.0, v, 0.9);
      col = mix(col, flashColor, flash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const WHISPERS = ['BEHIND YOU', "DON'T STOP RUNNING", 'IT SEES YOU', 'STAY', 'YOU CAN\'T HIDE HERE', 'WHY ARE YOU STILL HERE', 'NOT FAST ENOUGH', 'LOOK UP', 'COME BACK', 'I FOUND YOU'];

export class Fx {
  constructor(pass) {
    this.u = pass.uniforms;
    this.terror = 0; this.base = { noise: 0.03, aberr: 0.0015, red: 0.08, vignette: 0.35 };
    this.kick = { noise: 0, aberr: 0, tear: 0, pixel: 0, flash: 0 };
    this.time = 0; this.whisperT = 18;
    this.scare = document.getElementById('scare');
    this.whisper = document.getElementById('whisper');
    this.scareCanvas = this.scare.querySelector('canvas');
    this.exeView = false;
  }

  /** kind: 'hit', 'down', 'static', 'glitch', 'flash', 'shard', 'exits', 'escape' */
  pulse(kind, k = 1) {
    const K = this.kick, u = this.u;
    switch (kind) {
      case 'hit': K.flash = 0.55 * k; u.flashColor.value.setRGB(0.6, 0, 0); K.noise = 0.5; K.aberr = 0.02; K.tear = 0.5; break;
      case 'down': K.flash = 0.8; u.flashColor.value.setRGB(0.4, 0, 0); K.noise = 0.8; K.tear = 0.8; K.pixel = 0.6; break;
      case 'static': K.noise = Math.max(K.noise, 0.4 * k); K.tear = Math.max(K.tear, 0.3 * k); break;
      case 'glitch': K.tear = 0.7 * k; K.pixel = 0.5 * k; K.aberr = 0.02 * k; break;
      case 'shard': K.flash = 0.18; u.flashColor.value.setRGB(0.6, 0.95, 1); break;
      case 'exits': K.flash = 0.5; u.flashColor.value.setRGB(1, 1, 1); K.aberr = 0.015; break;
      case 'escape': K.flash = 0.9; u.flashColor.value.setRGB(1, 1, 1); break;
      case 'sense': K.flash = 0.35; u.flashColor.value.setRGB(0.5, 0, 0.05); K.aberr = 0.03; K.tear = 0.4; break;
    }
  }

  jumpscare() {
    const c = this.scareCanvas;
    c.width = innerWidth; c.height = innerHeight;
    drawScareFace(c.getContext('2d'), c.width, c.height);
    this.scare.classList.remove('on'); void this.scare.offsetWidth; this.scare.classList.add('on');
    this.pulse('down');
    clearTimeout(this.scareTimer);
    this.scareTimer = setTimeout(() => this.scare.classList.remove('on'), 750);
  }

  say(text) {
    const w = this.whisper;
    w.textContent = text || WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
    w.style.left = 15 + Math.random() * 55 + '%'; w.style.top = 20 + Math.random() * 50 + '%';
    w.classList.remove('on'); void w.offsetWidth; w.classList.add('on');
  }

  /** terror: 0 (calm) .. 1 (EXE right on you). playing: whispers only during rounds. */
  update(dt, terror, playing) {
    this.time += dt;
    this.terror = damp(this.terror, terror, 4, dt);
    const T = this.terror, K = this.kick, u = this.u, b = this.base;
    for (const k in K) K[k] = Math.max(0, K[k] - dt * (k === 'flash' ? 2.2 : 1.6));
    const flick = Math.random() < T * 0.08 ? 1 : 0;
    u.time.value = this.time;
    u.noise.value = b.noise + T * 0.16 + K.noise + flick * 0.2;
    u.aberr.value = b.aberr + T * 0.006 + K.aberr;
    u.tear.value = T * 0.12 + K.tear + flick * 0.3;
    u.pixel.value = K.pixel + (T > 0.75 ? (T - 0.75) * 0.6 : 0);
    u.red.value = (this.exeView ? 0.2 : b.red) + T * 0.35;
    u.vignette.value = b.vignette + T * 0.9;
    u.flash.value = Math.min(1, K.flash);
    if (playing) {
      this.whisperT -= dt * (1 + T * 3);
      if (this.whisperT <= 0) { this.whisperT = 20 + Math.random() * 25; this.say(); this.pulse('static', 0.6); }
    }
  }
}
