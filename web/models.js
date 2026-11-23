// 3D bees and wasps, built from primitives in code (no model files). Each body is merged into a
// single geometry with its colours baked into the vertices (stripes, eyes, cheeks), so a whole
// side can be drawn with one InstancedMesh: a few draw calls for the entire board, even on phones.
// Wings are separate instanced meshes so they can flap.
//
// Pieces face +X and stand on y = 0; one cell is about 1 unit across.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const col = (hex) => new THREE.Color(hex);

/** Give every vertex of a geometry a colour, either fixed or from a function of its position. */
function paint(geo, color) {
  const pos = geo.attributes.position, c = new Float32Array(pos.count * 3), tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i);
    const k = typeof color === 'function' ? color(tmp) : color;
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** A primitive, placed: scale, rotate, then move. Normalised to position/normal/color only. */
function part(geo, color, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] } = {}) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  geo.scale(...s);
  geo.rotateX(r[0]); geo.rotateY(r[1]); geo.rotateZ(r[2]);
  geo.translate(...p);
  return paint(geo, color);
}

function finish(parts) {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ bee
const BEE_YELLOW = col('#ffc21a'), BEE_DARK = col('#3a2210'), WHITE = col('#ffffff'), CHEEK = col('#ff8a8a');

/** Bee stripes by position along the body: dark bands, a dark tail tip, a yellow face. */
function beeStripe(v) {
  const x = v.x / 0.42; // -1 tail .. +1 face
  if (x > 0.42) return BEE_YELLOW;
  if (x < -0.78) return BEE_DARK;
  return Math.sin((x + 1) * Math.PI * 2.1) > 0.25 ? BEE_DARK : BEE_YELLOW;
}
const BEE_BODY = { s: [1.24, 0.98, 1], p: [0, 0.42, 0] };

export function beeBody() {
  // round body, bands across it: dark where the stripe function says so, yellow face at the front
  const body = part(new THREE.SphereGeometry(0.34, 40, 24), beeStripe, BEE_BODY);
  const parts = [body];
  for (const z of [-0.12, 0.12]) {
    parts.push(part(new THREE.SphereGeometry(0.075, 16, 12), BEE_DARK, { s: [0.8, 1.15, 1], p: [0.385, 0.5, z] }));          // eye
    parts.push(part(new THREE.SphereGeometry(0.026, 8, 6), WHITE, { p: [0.43, 0.535, z + (z > 0 ? -0.01 : 0.01)] }));      // shine
    parts.push(part(new THREE.SphereGeometry(0.05, 10, 8), CHEEK, { s: [0.4, 0.7, 1], p: [0.39, 0.38, z * 1.75] }));       // cheek
    // antenna: a slim stalk and a ball
    const stalk = new THREE.CylinderGeometry(0.012, 0.016, 0.26, 6);
    parts.push(part(stalk, BEE_DARK, { r: [z * 2.2, 0, -0.55], p: [0.3, 0.82, z * 1.3] }));
    parts.push(part(new THREE.SphereGeometry(0.035, 10, 8), BEE_DARK, { p: [0.38, 0.93, z * 1.75] }));
  }
  // smile
  parts.push(part(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), BEE_DARK, { r: [0, Math.PI / 2, Math.PI], p: [0.42, 0.42, 0] }));
  // stinger
  parts.push(part(new THREE.ConeGeometry(0.05, 0.14, 10), BEE_DARK, { r: [0, 0, Math.PI / 2], p: [-0.46, 0.4, 0] }));
  // little legs
  for (const x of [-0.12, 0.05, 0.2]) for (const z of [-0.16, 0.16]) {
    parts.push(part(new THREE.CapsuleGeometry(0.022, 0.1, 3, 6), BEE_DARK, { r: [z > 0 ? 0.35 : -0.35, 0, 0], p: [x, 0.1, z] }));
  }
  return finish(parts);
}

/**
 * Fur, by shell texturing: the body is repeated `layers` times, each copy marked with how far out
 * it sits (aLayer 0..1). A shader pushes each shell out along the normal and cuts it into strands
 * with a noise test that gets stricter further out, so the outer shells are sparse tips: fuzz.
 * aMask fades the fur off the face so the eyes stay clear.
 */
export function beeFur(layers = 6) {
  const shells = [];
  for (let k = 1; k <= layers; k++) {
    const g = part(new THREE.SphereGeometry(0.34, 28, 16), beeStripe, BEE_BODY);
    const n = g.attributes.position.count;
    const layer = new Float32Array(n).fill(k / layers), mask = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = g.attributes.position.getX(i);
      mask[i] = x < 0.24 ? 1 : Math.max(0, 1 - (x - 0.24) / 0.08); // no fur on the face
    }
    g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
    shells.push(g);
  }
  return finish(shells);
}

/** Turn a standard material into a fur-shell material (see beeFur). */
export function furMaterial(length = 0.05) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFurLen = { value: length };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nattribute float aMask;\nuniform float uFurLen;\nvarying float vLayer;\nvarying float vMask;\nvarying vec3 vFurP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP = position;\nvLayer = aLayer;\nvMask = aMask;\ntransformed += normalize(objectNormal) * aLayer * uFurLen;\ntransformed.y -= aLayer * aLayer * uFurLen * 0.25;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLayer;\nvarying float vMask;\nvarying vec3 vFurP;\nfloat furHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat strand = furHash(floor(vFurP * 150.0));\nif (vMask < 0.5 || strand < vLayer * 0.9 + 0.05) discard;\ndiffuseColor.rgb *= mix(0.72, 1.18, vLayer);');
  };
  m.customProgramCacheKey = () => 'bee-fur';
  return m;
}

// ------------------------------------------------------------------ wasp
const WASP_YELLOW = col('#ffb300'), WASP_DARK = col('#17100a'), WASP_HEAD = col('#ff7a12'), WASP_EYE = col('#d4141c');

export function waspBody() {
  const parts = [];
  // pointed abdomen with bold stripes
  const abd = new THREE.SphereGeometry(0.2, 36, 20);
  abd.scale(1.7, 1, 1);
  const p = abd.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x < -0.15) { const k = 1 - Math.min(1, (-0.15 - x) / 0.2) * 0.55; p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); } }
  parts.push(part(abd, (v) => {
    const x = v.x / 0.34;
    if (x < -0.82) return WASP_DARK;
    return Math.sin((x + 1) * Math.PI * 2.6) > 0.1 ? WASP_DARK : WASP_YELLOW;
  }, { p: [-0.24, 0.4, 0], r: [0, 0, 0.12] }));
  parts.push(part(new THREE.ConeGeometry(0.035, 0.16, 8), WASP_DARK, { r: [0, 0, Math.PI / 2 + 0.1], p: [-0.62, 0.35, 0] }));     // sting
  parts.push(part(new THREE.SphereGeometry(0.06, 10, 8), WASP_DARK, { p: [0.0, 0.45, 0] }));                                     // waist
  parts.push(part(new THREE.SphereGeometry(0.15, 24, 16), (v) => (v.y > 0.53 ? WASP_DARK : WASP_YELLOW), { s: [1.1, 0.95, 0.95], p: [0.12, 0.47, 0] })); // thorax
  parts.push(part(new THREE.SphereGeometry(0.15, 24, 16), WASP_HEAD, { s: [0.95, 1, 1.05], p: [0.36, 0.52, 0] }));               // head
  for (const z of [-0.08, 0.08]) {
    parts.push(part(new THREE.SphereGeometry(0.07, 14, 10), WASP_EYE, { s: [0.7, 1.1, 0.8], p: [0.44, 0.55, z * 1.2] }));        // eye
    parts.push(part(new THREE.SphereGeometry(0.02, 8, 6), WHITE, { p: [0.49, 0.585, z * 1.25] }));
    // angry brow, slanting down towards the middle
    parts.push(part(new THREE.BoxGeometry(0.04, 0.025, 0.11), WASP_DARK, { r: [z > 0 ? 0.45 : -0.45, 0, 0], p: [0.47, 0.64, z * 1.15] }));
    // bent antenna
    parts.push(part(new THREE.CylinderGeometry(0.01, 0.013, 0.2, 5), WASP_DARK, { r: [z * 3, 0, -0.35], p: [0.42, 0.74, z * 1.3] }));
    parts.push(part(new THREE.CylinderGeometry(0.009, 0.01, 0.14, 5), WASP_DARK, { r: [z * 3, 0, -1.3], p: [0.53, 0.84, z * 1.9] }));
  }
  parts.push(part(new THREE.BoxGeometry(0.02, 0.02, 0.1), WASP_DARK, { p: [0.5, 0.45, 0] }));                                     // mandibles
  for (const x of [-0.02, 0.1, 0.2]) for (const z of [-0.12, 0.12]) {
    parts.push(part(new THREE.CapsuleGeometry(0.016, 0.16, 3, 6), WASP_DARK, { r: [z > 0 ? 0.6 : -0.6, 0, x * 2], p: [x, 0.2, z * 1.1] }));
  }
  return finish(parts);
}

// ------------------------------------------------------------------ wings
/** One wing in the XY plane, hinged at the origin and pointing up (+Y). The scene swings it out
 *  sideways about the X axis (the body's length) to flap. */
export function wingGeometry(kind) {
  const len = kind === 'wasp' ? 0.36 : 0.32, wid = kind === 'wasp' ? 0.1 : 0.16;
  const shape = new THREE.Shape();
  shape.absellipse(0, len / 2, wid, len / 2, 0, Math.PI * 2);
  return new THREE.ShapeGeometry(shape, 24);
}

/** Where wings attach (local to the piece), which way they swing (+1 towards +Z), and how far they lean back. */
export const WING_MOUNTS = {
  bee: [{ p: [-0.04, 0.7, 0.07], side: 1, tilt: 0.45 }, { p: [-0.04, 0.7, -0.07], side: -1, tilt: 0.45 }],
  wasp: [{ p: [0.08, 0.58, 0.06], side: 1, tilt: 0.95 }, { p: [0.08, 0.58, -0.06], side: -1, tilt: 0.95 }],
};
