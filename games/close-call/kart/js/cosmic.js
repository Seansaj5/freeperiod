// Starlight Spectrum's look: a rainbow road of light floating in deep space. The road, its edge lights, the rails and
// the glow hanging under the road are shaders that shimmer and pulse; round it a gas giant inside the spiral, rainbow
// arches over the road, floating crystals, stardust, shooting stars, a ringed planet, a sun and a galaxy far off.
// (The sky itself is drawn once into a cube map by main.js: spaceSky() below.)
import * as THREE from 'three';

const HUE = 'vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }';
const HASH = 'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }';
const VS = `varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = (body, extra = '') => `uniform float uTime; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
${HUE}
${HASH}
${extra}
void main() {
${body}
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softDot = () => canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });

/** Build the cosmic track's meshes into track.group. */
export function buildCosmic(t, env) {
  const N = t.N, G = t.group, W = t.W, EL = t.EL, ER = t.ER, CURB = t.curb, hi = t.hi;
  const mats = [];
  const shader = (fs, o = {}, uniforms = {}) => {
    const m = new THREE.ShaderMaterial(Object.assign({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }, uniforms]), vertexShader: VS, fragmentShader: fs, fog: true }, o));
    mats.push(m);
    return m;
  };
  t.anim.push((time) => { for (const m of mats) m.uniforms.uTime.value = time; });

  // ---- the rainbow road: seven lanes of colour drifting round the lap, a wave of light running forward, chevrons,
  // glitter, bright edges. Visible from below too (it is a ribbon of light).
  const road = shader(frag(`
    float u = vUv.x, v = vUv.y, lanes = 7.0, b = u * lanes, f = fract(b);
    vec3 col = hue(fract((floor(b) + 0.5) / lanes * 0.84 - v * 0.0022 + uTime * 0.035));
    col = mix(col, vec3(1.0), 0.1) * (0.62 + 0.38 * smoothstep(0.0, 0.16, f) * smoothstep(1.0, 0.84, f));
    float seam = smoothstep(0.035, 0.0, min(f, 1.0 - f)) * step(0.5, b) * step(b, lanes - 0.5);
    col += vec3(0.7, 0.75, 0.9) * seam * (0.55 + 0.45 * sin(v * 0.6 - uTime * 9.0));   // glowing seams between the lanes
    float wave = fract(v * 0.028 - uTime * 0.75);
    col *= 0.72 + 0.55 * smoothstep(0.82, 1.0, wave);
    float chev = fract(v * 0.15 + abs(u - 0.5) * 0.9 - uTime * 0.55);
    col += vec3(0.22) * smoothstep(0.88, 1.0, chev) * smoothstep(0.45, 0.15, abs(u - 0.5));
    float s = hash(floor(vW.xz * 2.5));
    col += vec3(1.4) * step(0.989, s) * (0.5 + 0.5 * sin(uTime * 5.0 + s * 60.0));
    col += vec3(1.5, 1.4, 1.2) * (smoothstep(0.03, 0.0, u) + smoothstep(0.97, 1.0, u));
    gl_FragColor = vec4(col * 0.8, 1.0);`), { side: THREE.DoubleSide });
  t.ribbon((i) => -W[i], (i) => W[i], road, 1);

  // ---- edge lights: gold and white dashes racing along
  const edge = shader(frag(`
    float d = fract(vUv.y * 0.35 - uTime * 1.6);
    vec3 c = mix(vec3(1.25, 0.85, 0.25), vec3(1.35, 1.3, 1.2), step(0.5, d));
    gl_FragColor = vec4(c * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.y)), 1.0);`), { side: THREE.DoubleSide });
  t.ribbon((i) => -W[i] - CURB, (i) => -W[i], edge, 1);
  t.ribbon((i) => W[i], (i) => W[i] + CURB, edge, 1);
  const RL = t.RL, RR = t.RR;
  // the last strip out to the edge: a white line under the rails; red warning chevrons where there is no rail
  const line = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.2), side: THREE.DoubleSide });
  t.ribbon((i) => -EL[i], (i) => -W[i] - CURB, line, 1, 0, 1, 0, 0, true, true, (i) => RL[i]);
  t.ribbon((i) => W[i] + CURB, (i) => ER[i], line, 1, 0, 1, 0, 0, true, true, (i) => RR[i]);
  const warn = shader(frag(`
    gl_FragColor = vec4(vec3(1.7, 0.32, 0.22) * (0.7 + 0.3 * sin(uTime * 6.0 - vUv.y * 0.3)), 1.0);`), { side: THREE.DoubleSide });
  t.ribbon((i) => -EL[i], (i) => -W[i] - CURB, warn, 1, 0, 1, 0, 0, true, true, (i) => !RL[i]);
  t.ribbon((i) => W[i] + CURB, (i) => ER[i], warn, 1, 0, 1, 0, 0, true, true, (i) => !RR[i]);

  // ---- rails: see-through energy fences where there are rails; a bright line along the top
  const fence = shader(frag(`
    float y = vUv.x;
    vec3 c = hue(fract(vUv.y * 0.004 + uTime * 0.05)) * 0.8 + 0.35;
    float a = 0.12 + 0.9 * smoothstep(0.8, 1.0, y) + 0.35 * smoothstep(0.2, 0.0, y);
    a *= 0.8 + 0.2 * sin(vUv.y * 1.5 - uTime * 7.0);
    gl_FragColor = vec4(c * a * 1.3, 1.0);`), { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  // a vertical strip: u = 0 at the road, 1 at the top (`ribbon` with both edges at the same offset, different heights)
  t.ribbon((i) => -EL[i], (i) => -EL[i], fence, 1, 0, 1, -0.05, 1.1, true, false, (i) => RL[i]);
  t.ribbon((i) => ER[i], (i) => ER[i], fence, 1, 0, 1, -0.05, 1.1, true, false, (i) => RR[i]);

  // ---- light hanging under the road, so it floats like a ribbon
  const under = shader(frag(`
    float y = vUv.x;
    vec3 c = hue(fract(vUv.y * 0.003 - uTime * 0.03)) * 0.7 + 0.15;
    gl_FragColor = vec4(c * pow(clamp(1.0 - y, 0.0, 1.0), 2.2) * 0.55, 1.0);`), { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  t.ribbon((i) => -EL[i], (i) => -EL[i], under, 1, 0, 1, -0.1, -6, true, true);
  t.ribbon((i) => ER[i], (i) => ER[i], under, 1, 0, 1, -0.1, -6, true, true);
  const belly = new THREE.MeshBasicMaterial({ color: 0x0a0c1c, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  t.ribbon((i) => -EL[i], (i) => ER[i], belly, 1, 0, 1, -0.35, -0.35, true, true);

  t.buildRamps(); t.buildPads(); t.buildGate();

  // ---- rainbow arches over the road
  const arch = shader(frag(`
    float r = length(vW - uC) ;
    float k = clamp((r - uR0) / (uR1 - uR0), 0.0, 1.0);
    vec3 c = hue(fract(0.83 - k * 0.83 + uTime * 0.02)) * 1.25;
    float a = smoothstep(0.0, 0.08, k) * smoothstep(1.0, 0.92, k);
    gl_FragColor = vec4(c * a * (0.85 + 0.15 * sin(uTime * 4.0 - k * 9.0)), 1.0);`, 'uniform vec3 uC; uniform float uR0, uR1;'), { side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }, { uC: { value: new THREE.Vector3() }, uR0: { value: 0 }, uR1: { value: 1 } });
  const nArch = 9;
  for (let j = 0; j < nArch; j++) {
    const k = t.w(Math.round(((j + 0.35) / nArch) * N));
    if (t.GAP[k] || t.GAP[t.w(k + 10)] || t.GAP[t.w(k - 10)]) continue;
    const r0 = Math.max(EL[k], ER[k]) + 2.5, r1 = r0 + 3.2, p = t.point(k, 0);
    const m = arch.clone(); mats.push(m);
    m.uniforms.uC.value.set(p.x, p.y - 1.5, p.z); m.uniforms.uR0.value = r0; m.uniforms.uR1.value = r1;
    const g = new THREE.RingGeometry(r0, r1, 64, 1, 0, Math.PI);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(p.x, p.y - 1.5, p.z); mesh.rotation.y = t.heading(k);
    G.add(mesh);
  }

  // ---- the gas giant inside the spiral (if there is one: the centre of the tightest long loop)
  let cx = 0, cz = 0; for (let k = 0; k < N; k++) { cx += t.X[k]; cz += t.Z[k]; } cx /= N; cz /= N;
  const pc = t.def.planet;
  if (pc) {
    const pm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.45, 0.3, -0.84) } },
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uSun; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main(){
          float lat = vUv.y, lon = vUv.x;
          float w = sin(lat * 38.0 + sin(lon * 18.0 + uTime * 0.06 + lat * 9.0) * 0.9 + sin(lat * 11.0) * 2.0);
          vec3 c = mix(vec3(0.95, 0.55, 0.28), vec3(0.18, 0.5, 0.72), 0.5 + 0.5 * w);
          c = mix(c, vec3(0.98, 0.92, 0.8), smoothstep(0.55, 1.0, sin(lat * 85.0 + w * 2.0)) * 0.35);
          vec2 sp = vec2((lon - 0.3) * 3.0, (lat - 0.42) * 7.0); c = mix(c, vec3(0.85, 0.3, 0.2), smoothstep(0.5, 0.2, length(sp)) * 0.8);
          vec3 n = normalize(vN);
          float l = max(0.06, dot(n, normalize(uSun))) * 1.25 + 0.08;
          float rim = pow(clamp(1.0 - dot(n, normalize(cameraPosition - vW)), 0.0, 1.0), 3.0);
          gl_FragColor = vec4(c * l + vec3(0.35, 0.65, 1.0) * rim * 0.9, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(pc[3], 64, 40), pm);
    planet.position.set(pc[0], pc[1], pc[2]); planet.rotation.z = 0.25;
    G.add(planet);
    t.anim.push((time) => { pm.uniforms.uTime.value = time; planet.rotation.y = time * 0.02; });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(pc[3] * 1.12, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vW; void main(){ float f = pow(clamp(-dot(normalize(vN), normalize(cameraPosition - vW)), 0.0, 1.0), 2.0); gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * f * 0.9, 1.0); }',
    }));
    halo.position.copy(planet.position); G.add(halo);
  }

  // ---- floating crystals (instanced), turning slowly, each its own colour
  const R = rng(91), list = [];
  for (let tries = 0; list.length < (hi ? 70 : 36) && tries < 900; tries++) {
    const k = Math.floor(R() * N), side = R() < 0.5 ? -1 : 1, dist = 14 + R() * 80;
    const d = side * (W[k] + dist), x = t.X[k] - t.TZ[k] * d, z = t.Z[k] + t.TX[k] * d;
    if (pc && Math.hypot(x - pc[0], z - pc[2]) < pc[3] + 12) continue;
    let ok = true;
    for (let j = 0; j < N; j += 4) { const dx = x - t.X[j], dz = z - t.Z[j]; if (dx * dx + dz * dz < Math.pow(W[j] + 9, 2) && Math.abs(t.Y[k] - t.Y[j]) < 40) { ok = false; break; } }
    if (ok) list.push({ x, z, y: t.Y[k] + (R() - 0.35) * 45, s: 1.5 + R() * 4.5, h: R(), spin: (R() - 0.5) * 0.8, tilt: (R() - 0.5) * 0.8 });
  }
  const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(0.8, 2.0, 0.8);
  const crys = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.2, envMap: env, envMapIntensity: 1.6, transparent: true, opacity: 0.88, flatShading: true }), list.length);
  const core = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.45, 0).scale(1, 2, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
  const col = new THREE.Color();
  list.forEach((c, i) => { col.setHSL(c.h, 0.75, 0.62); crys.setColorAt(i, col); col.setHSL(c.h, 1, 0.6).multiplyScalar(2.2); core.setColorAt(i, col); });
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const place = (time) => {
    list.forEach((c, i) => {
      Q.setFromEuler(E.set(c.tilt, time * c.spin, 0)); P.set(c.x, c.y + Math.sin(time * 0.6 + c.h * 9) * 1.2, c.z);
      M4.compose(P, Q, S.setScalar(c.s)); crys.setMatrixAt(i, M4); core.setMatrixAt(i, M4);
    });
    crys.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
  };
  place(0);
  G.add(crys, core);
  let lastPlace = -1;
  t.anim.push((time) => { if (time - lastPlace > (hi ? 0.033 : 0.1)) { lastPlace = time; place(time); } });

  // ---- stardust: specks all round the track for a sense of speed and depth
  const nDust = hi ? 4500 : 1600, dp = new Float32Array(nDust * 3), dc = new Float32Array(nDust * 3);
  for (let i = 0; i < nDust; i++) {
    const k = Math.floor(R() * N), a = R() * Math.PI * 2, r = 25 + Math.pow(R(), 0.6) * 380;
    dp[i * 3] = t.X[k] + Math.cos(a) * r; dp[i * 3 + 1] = t.Y[k] + (R() - 0.5) * 260; dp[i * 3 + 2] = t.Z[k] + Math.sin(a) * r;
    col.setHSL(R(), 0.6, 0.75); dc[i * 3] = col.r; dc[i * 3 + 1] = col.g; dc[i * 3 + 2] = col.b;
  }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  const dot = softDot();
  G.add(new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.4, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));

  // ---- far away: the sun, a ringed planet, a galaxy
  const far = (dir, dist) => new THREE.Vector3(...dir).normalize().multiplyScalar(dist).add(new THREE.Vector3(cx, 40, cz));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2.2), fog: false }));
  sun.position.copy(far([0.45, 0.3, -0.84], 2200)); G.add(sun);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(1.4, 1.1, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.copy(sun.position); glow.scale.setScalar(800); G.add(glow);
  const rp = far([-0.62, 0.22, 0.75], 1900);
  const ringed = new THREE.Mesh(new THREE.SphereGeometry(230, 48, 32), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0.45, 0.3, -0.84) } },
    vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec2 vUv; void main(){ float b = sin(vUv.y * 60.0) * 0.5 + 0.5; vec3 c = mix(vec3(0.55, 0.42, 0.75), vec3(0.85, 0.75, 0.6), b); float l = max(0.04, dot(normalize(vN), normalize(uSun))); gl_FragColor = vec4(c * l * 1.2, 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  ringed.position.copy(rp); G.add(ringed);
  const ringTex = canvasTex(256, 4, (x, w, h) => { const R2 = rng(5); for (let i = 0; i < w; i++) { const a = 0.15 + R2() * 0.7 * (Math.sin(i * 0.15) * 0.3 + 0.7); x.fillStyle = `rgba(${200 + R2() * 55},${180 + R2() * 50},${150 + R2() * 60},${a})`; x.fillRect(i, 0, 1, h); } });
  const rg = new THREE.RingGeometry(300, 560, 96, 1);
  { const uv = rg.attributes.uv, p = rg.attributes.position; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - 300) / 260, 0.5); } }
  const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.position.copy(rp); ring.rotation.set(-1.25, 0.3, 0.2); G.add(ring);
  const galaxy = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshBasicMaterial({ map: galaxyTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  galaxy.position.copy(far([0.2, 0.55, 0.8], 2300)); galaxy.lookAt(cx, 40, cz); galaxy.rotateZ(0.6); G.add(galaxy);

  // ---- shooting stars streaking across the far sky
  const streakTex = canvasTex(256, 8, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(200,230,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const streaks = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 2.2), mat), m2 = new THREE.Mesh(m.geometry, mat);
    m2.rotation.x = Math.PI / 2; m.add(m2); m.visible = false; // two crossed planes, so it never shows edge-on
    G.add(m); streaks.push({ m, life: 0, wait: R() * 5, v: new THREE.Vector3() });
  }
  let lastT = 0;
  const X1 = new THREE.Vector3(1, 0, 0);
  t.anim.push((time) => {
    const dt = Math.min(0.1, Math.max(0, time - lastT)); lastT = time;
    for (const s of streaks) {
      s.life -= dt;
      if (s.life > 0) { s.m.position.addScaledVector(s.v, dt); continue; }
      s.m.visible = false;
      if (s.life < -s.wait) { // a new one somewhere high up, heading down and across
        const a = R() * Math.PI * 2, d = 900 + R() * 700;
        s.m.position.set(cx + Math.cos(a) * d, 250 + R() * 500, cz + Math.sin(a) * d);
        s.v.set(R() - 0.5, -0.2 - R() * 0.3, R() - 0.5).normalize().multiplyScalar(600 + R() * 500);
        s.m.quaternion.setFromUnitVectors(X1, s.v.clone().normalize());
        s.life = 0.6 + R() * 0.8; s.wait = 1.5 + R() * 5; s.m.visible = true;
      }
    }
  });

  // ---- a faint glow far below, so looking over the edge has depth
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(70,40,140,0.55)'); g.addColorStop(0.5, 'rgba(20,40,110,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, -320, cz); G.add(floor);
}

/** A spiral galaxy, drawn dot by dot. */
function galaxyTex() {
  return canvasTex(512, 512, (x, w) => {
    const R = rng(77), c = w / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,240,220,0.9)'); g.addColorStop(0.12, 'rgba(255,200,170,0.35)'); g.addColorStop(0.5, 'rgba(80,90,200,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 9000; i++) {
      const arm = i % 2, t = Math.pow(R(), 0.7), a = t * 9 + arm * Math.PI + (R() - 0.5) * 0.7, r = t * c * 0.95;
      const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r * 0.55;
      const hcol = t < 0.25 ? `255,${200 + R() * 55},${170 + R() * 60}` : R() < 0.5 ? `150,${170 + R() * 60},255` : `255,${150 + R() * 80},${200 + R() * 55}`;
      x.fillStyle = `rgba(${hcol},${0.15 + R() * 0.35})`; x.fillRect(px, py, 1 + R() * 1.6, 1 + R() * 1.6);
    }
  });
}

/** The deep-space sky (for a cube map): nebula clouds, a milky band, stars of three sizes. Output is linear. */
export function spaceSky(r = 50) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vP);
        vec3 c = vec3(0.004, 0.005, 0.016);
        float bd = dot(d, normalize(vec3(0.35, 0.85, 0.3))) * 3.0, band = exp(-bd * bd);
        float n = fbm(d * 2.6), m = fbm(d * 5.0 + 11.0), q = fbm(d * 9.0 - 3.0);
        vec3 neb = mix(vec3(0.02, 0.16, 0.34), vec3(0.24, 0.06, 0.34), smoothstep(0.4, 0.7, m));
        neb = mix(neb, vec3(0.6, 0.26, 0.08), smoothstep(0.6, 0.82, n) * 0.55);
        neb = mix(neb, vec3(0.05, 0.4, 0.36), smoothstep(0.62, 0.8, q) * 0.4);
        c += neb * pow(max(n, 0.0), 2.2) * (0.5 + band * 1.6) * 1.6;
        c += vec3(0.5, 0.55, 0.75) * band * pow(max(q, 0.0), 3.0) * 0.25;
        for (int i = 0; i < 3; i++) {
          float sc = 140.0 + float(i) * 150.0; vec3 cell = floor(d * sc); float r = h3(cell + float(i) * 17.0);
          if (r > 0.993 - band * 0.006) { vec3 cp = normalize((cell + 0.5) / sc); float dd = length(d - cp) * sc;
            vec3 sc2 = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), fract(r * 91.0));
            c += sc2 * smoothstep(0.55, 0.0, dd) * (2.2 - float(i) * 0.6); }
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
}
