// Real-world props (CC0, from Poly Haven; see props/CREDITS.md). Each file is loaded once and copied wherever it is placed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const cache = {}, loader = new GLTFLoader(); let ENV = null;
export function setPropEnv(t) { ENV = t; }
// Put a prop in the scene. It appears when its file has loaded; nothing breaks if it never does.
export function prop(parent, id, x, y, z, ry = 0, s = 1, o = {}) {
  const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(o.rx || 0, ry, o.rz || 0); h.scale.setScalar(s); parent.add(h);
  cache[id] = cache[id] || loader.loadAsync(`props/${id}.glb`).then(g => {
    g.scene.traverse(m => { if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; const mt = m.material; mt.envMap = ENV; mt.envMapIntensity = 0.4; if (mt.map) mt.map.anisotropy = 4; if (o.tint) mt.color.multiplyScalar(o.tint); });
    return g.scene;
  });
  cache[id].then(src => h.add(src.clone(true))).catch(() => {});
  return h;
}
