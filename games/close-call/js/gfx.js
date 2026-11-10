// Small graphics helpers shared by world.js and scenery.js.
import * as THREE from 'three';

export const CHUNK = 160; // metres of road per chunk
export const NCH = 8; // chunks alive at once: 1 behind, 7 ahead
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * An instanced mesh split into NCH ring slots (one per live chunk), each holding up to `per` copies.
 * add() places one copy in a slot; clear() hides a slot's copies.
 */
export class Pool {
  constructor(parent, geo, mat, per, colors = false) {
    this.per = per;
    this.m = new THREE.InstancedMesh(geo, mat, per * NCH);
    this.m.frustumCulled = false;
    if (colors) this.m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(per * NCH * 3).fill(1), 3);
    for (let i = 0; i < per * NCH; i++) this.m.setMatrixAt(i, ZERO);
    this.used = new Int32Array(NCH);
    parent.add(this.m);
    this._M = new THREE.Matrix4(); this._Q = new THREE.Quaternion(); this._E = new THREE.Euler(0, 0, 0, 'YXZ'); this._V = new THREE.Vector3(); this._S = new THREE.Vector3(); this._C = new THREE.Color();
  }
  clear(slot) { for (let j = 0; j < this.per; j++) this.m.setMatrixAt(slot * this.per + j, ZERO); this.used[slot] = 0; this.m.instanceMatrix.needsUpdate = true; }
  add(slot, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, color = null) {
    if (this.used[slot] >= this.per) return;
    const i = slot * this.per + this.used[slot]++;
    this._Q.setFromEuler(this._E.set(rx, ry, 0));
    this._M.compose(this._V.set(x, y, z), this._Q, this._S.set(sx, sy, sz));
    this.m.setMatrixAt(i, this._M);
    if (color != null && this.m.instanceColor) { this.m.setColorAt(i, this._C.set(color)); this.m.instanceColor.needsUpdate = true; }
    this.m.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.m.parent?.remove(this.m); this.m.geometry.dispose(); this.m.dispose(); }
}

export function triMesh(tris, mat) {
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Merge simple geometries (position + normal, optional colour per part). */
export function mergeGeos(list, colors = null) {
  const pos = [], nor = [], col = [];
  list.forEach((g, i) => {
    if (g.index) g = g.toNonIndexed();
    const p = g.getAttribute('position').array;
    pos.push(...p); nor.push(...g.getAttribute('normal').array);
    if (colors) { const c = new THREE.Color(colors[i]); for (let k = 0; k < p.length / 3; k++) col.push(c.r, c.g, c.b); }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (colors) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function radialTexture(inner) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
