// The liquid glass transition: a glossy wave of water rises up and fills the screen (bubbles, light ripples on
// the bottom, a bright meniscus line), holds while the next scene loads, then drains away with a splash.
// One WebGL canvas with one full-screen shader; it only draws while it is on screen.
//   const liq = new Liquid();  await liq.fill();  ...load...  await liq.drain();
// Pages that start covered call liq.cover() first (the page's CSS cover hides the gap before this runs).

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uT, uLevel, uSlosh, uRip, uDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float caustic(vec2 p, float t){
  // three warped sine layers; the thin bright ridges where they line up look like light on a pool floor
  vec2 q = p;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + t * (0.6 + fi * 0.2) + fi), cos(q.x * 1.5 - t * (0.5 + fi * 0.15) + fi * 2.0)) * 0.55;
    c += abs(sin(q.x + q.y * 0.6));
  }
  return pow(1.0 - c / 3.0, 5.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 P = vec2(uv.x * asp, uv.y);
  float t = uT;
  // the surface: a few travelling waves, taller while it moves (uSlosh), plus a tilt that swings as it pours in
  float x = P.x;
  float w = 0.034 * sin(x * 5.2 + t * 3.1) + 0.021 * sin(x * 11.0 - t * 4.6) + 0.011 * sin(x * 23.0 + t * 7.4) + 0.006 * sin(x * 41.0 - t * 9.0);
  float tilt = (uv.x - 0.5) * 0.09 * sin(t * 2.3) * uSlosh;
  // the splash ring from the middle when it starts draining
  float rd = length((uv - vec2(0.5, 0.55)) * vec2(asp, 1.0));
  float ring = uRip > 0.0 ? exp(-pow((rd - uRip * 1.25) * 9.0, 2.0)) * (1.0 - smoothstep(0.4, 1.1, uRip)) : 0.0;
  float surf = uLevel + w * (0.35 + uSlosh) + tilt + ring * 0.05 * uDir;
  float d = uv.y - surf; // > 0 above the water
  vec4 col = vec4(0.0);
  if (d < 0.0) {
    float depth = -d;
    // body colour: bright teal just under the surface, deep blue lower down
    vec3 shallow = vec3(0.16, 0.78, 0.98), deep = vec3(0.012, 0.07, 0.2);
    vec3 c = mix(shallow, deep, smoothstep(0.0, 0.55, depth));
    c = mix(c, vec3(0.0, 0.03, 0.1), smoothstep(0.5, 1.2, depth) * 0.7);
    // light from the surface: caustic net, brighter near the top
    vec2 cp = P * 7.0 + vec2(0.0, t * 0.25);
    float cs = caustic(cp, t * 1.3);
    c += vec3(0.55, 0.95, 1.0) * cs * (0.5 * exp(-depth * 2.2) + 0.1);
    // god rays slanting down
    float ray = pow(max(0.0, sin(P.x * 9.0 + P.y * 3.0 + t * 0.4) * sin(P.x * 4.3 - t * 0.27)), 6.0);
    c += vec3(0.4, 0.85, 1.0) * ray * exp(-depth * 1.6) * 0.22;
    // bubbles: two layers of grid cells, one bubble per cell, rising and wobbling
    for (int l = 0; l < 2; l++) {
      float fl = float(l), sc = 9.0 + fl * 7.0, sp = 0.35 + fl * 0.25;
      vec2 g = vec2(P.x * sc, P.y * sc * 0.7 - t * sp * sc * 0.7);
      vec2 id = floor(g), f = fract(g) - 0.5;
      float r = h21(id + fl * 17.0);
      if (r > 0.55) {
        vec2 o = vec2(sin(t * 2.0 + r * 30.0) * 0.18, (h21(id + 3.1) - 0.5) * 0.5);
        float rad = 0.07 + 0.13 * h21(id + 7.7);
        float bd = length(f - o);
        float rim = smoothstep(rad, rad - 0.035, bd) - smoothstep(rad - 0.035, rad - 0.08, bd);
        float spec = smoothstep(0.045, 0.0, length(f - o - vec2(-0.35, 0.35) * rad));
        float fade = smoothstep(0.0, 0.08, depth) * (1.0 - fl * 0.35);
        c += (vec3(0.75, 0.97, 1.0) * rim * 0.6 + vec3(1.0) * spec * 0.9) * fade;
      }
    }
    // the glass look: a bright meniscus line on the surface, a softer band just under it, and fresnel
    // streaks that slide sideways
    float men = exp(-depth * 260.0);
    c += vec3(1.0) * men * 0.95;
    c += vec3(0.6, 0.95, 1.0) * exp(-pow((depth - 0.022) * 70.0, 2.0)) * 0.35;
    float streak = smoothstep(0.92, 1.0, sin(P.x * 2.2 - t * 0.9 + depth * 14.0)) * exp(-depth * 4.0);
    c += vec3(0.85, 1.0, 1.0) * streak * 0.35;
    c += vec3(0.5, 0.9, 1.0) * ring * 0.45;
    // a lens edge round the screen, like looking through a thick sheet of glass
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = pow(max(e.x, e.y), 10.0);
    c = mix(c, c * 0.55 + vec3(0.25, 0.6, 0.8) * 0.25, edge);
    float a = 0.94 - 0.12 * exp(-depth * 18.0);
    col = vec4(c * a, a);
  } else {
    // spray: droplets thrown just above a moving surface
    float band = exp(-d * 18.0) * uSlosh;
    if (band > 0.02) {
      vec2 g = vec2(P.x * 38.0, (uv.y - surf) * 38.0 - t * 4.0);
      vec2 id = floor(g), f = fract(g) - 0.5;
      float r = h21(id);
      float dot1 = smoothstep(0.16, 0.05, length(f - (vec2(h21(id + 1.3), h21(id + 2.9)) - 0.5) * 0.5));
      float a = dot1 * step(0.86, r) * band;
      col = vec4(vec3(0.8, 0.97, 1.0) * a, a);
    }
  }
  gl_FragColor = col;
}`;

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class Liquid {
  constructor(z = 60) {
    const c = (this.canvas = document.createElement('canvas'));
    c.style.cssText = `position:fixed;inset:0;width:100%;height:100%;z-index:${z};pointer-events:none;display:none`;
    document.body.appendChild(c);
    const gl = (this.gl = c.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false }));
    this.level = -0.2; this.slosh = 0; this.rip = 0; this.dir = 1;
    this.t0 = performance.now();
    this.raf = 0;
    if (!gl) return; // no WebGL: fill()/drain() just wait, the page still works
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = (this.prog = gl.createProgram());
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.gl = null; return; }
    gl.useProgram(pr);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uRes', 'uT', 'uLevel', 'uSlosh', 'uRip', 'uDir']) this.u[n] = gl.getUniformLocation(pr, n);
    this.resize = () => {
      const k = Math.min(devicePixelRatio || 1, 1.25) * 0.75; // a soft picture is fine for water, and it keeps phones fast
      c.width = Math.max(2, Math.round(innerWidth * k)); c.height = Math.max(2, Math.round(innerHeight * k));
      gl.viewport(0, 0, c.width, c.height);
    };
    this.resize();
    addEventListener('resize', this.resize);
  }

  get busy() { return !!this.anim; }

  _draw() {
    const gl = this.gl;
    if (!gl) return;
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uT, (performance.now() - this.t0) / 1000);
    gl.uniform1f(this.u.uLevel, this.level);
    gl.uniform1f(this.u.uSlosh, this.slosh);
    gl.uniform1f(this.u.uRip, this.rip);
    gl.uniform1f(this.u.uDir, this.dir);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _loop() {
    if (this.raf) return;
    const tick = () => {
      this.raf = 0;
      const now = performance.now();
      if (this.anim) {
        const a = this.anim, k = Math.min(1, (now - a.t0) / a.ms);
        a.step(k);
        if (k >= 1) { this.anim = null; a.done(); }
      }
      this._draw();
      if (this.level <= -0.19 && !this.anim) { this.canvas.style.display = 'none'; return; }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  _run(ms, step) {
    this.canvas.style.display = 'block';
    this.canvas.style.pointerEvents = 'auto'; // nothing underneath can be clicked mid-transition
    return new Promise((done) => {
      if (this.anim) this.anim.done();
      this.anim = { t0: performance.now(), ms, step, done };
      this._loop();
    });
  }

  /** Start fully covered (a page that was entered through the water). */
  cover() {
    this.level = 1.2; this.slosh = 0.15; this.rip = 0;
    this.canvas.style.display = 'block'; this.canvas.style.pointerEvents = 'auto';
    this._loop();
  }

  /** The water rises and fills the screen. */
  fill(ms = 950) {
    this.dir = 1; this.rip = 0;
    return this._run(ms, (k) => {
      this.level = -0.2 + ease(k) * 1.42;
      this.slosh = Math.sin(Math.min(1, k * 1.1) * Math.PI) * 0.9 + (1 - k) * 0.2 + 0.12;
    });
  }

  /** A splash ring, then the water drains down and away. */
  async drain(ms = 1150) {
    this.dir = -1;
    await this._run(Math.round(ms * 0.32), (k) => { this.rip = k * 0.55; this.slosh = 0.15 + k * 0.5; });
    await this._run(ms, (k) => {
      this.rip = 0.55 + k * 0.6;
      this.level = 1.22 - ease(k) * 1.45;
      this.slosh = 0.65 * (1 - k) + Math.sin(k * Math.PI) * 0.35;
    });
    this.level = -0.2; this.canvas.style.pointerEvents = 'none';
  }
}

/** Before leaving a page through the water: the next page starts covered. */
export function markLiquid() { try { sessionStorage.setItem('cc.liq', String(Date.now())); } catch { /* private mode */ } }
/** True (once) when this page was entered through the water a moment ago. */
export function cameThroughLiquid() {
  try {
    const v = Number(sessionStorage.getItem('cc.liq') || 0);
    sessionStorage.removeItem('cc.liq');
    return Date.now() - v < 15000;
  } catch { return false; }
}
