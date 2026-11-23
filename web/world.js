// The world around the board: little floating islands drifting nearby (one with the bees' straw
// hive, one with a tree holding the wasps' paper nest), flowers along the board's grassy rim,
// trees and a pond on the meadow below, soft light shafts and drifting pollen.
// Everything is built in code; repeated things (flowers, trees) are instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const rand = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // repeatable layout

function colorize(geo, color) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = typeof color === 'function' ? color(geo.attributes.position, i) : c; a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const place = (geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] } = {}) => { geo.scale(...s); geo.rotateX(r[0]); geo.rotateY(r[1]); geo.rotateZ(r[2]); geo.translate(...p); return geo; };
const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...opts });

/** A rocky floating island with a grassy top, about `r` wide; top surface at y = 0. */
function islandGeo(r) {
  const rock = new THREE.CylinderGeometry(r, r * 0.12, r * 1.6, 9, 3);
  const p = rock.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > r * 0.79) continue;
    const j = 0.85 + rand() * 0.3;
    p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j);
  }
  rock.translate(0, -r * 0.8 - 0.05, 0);
  const grass = new THREE.CylinderGeometry(r * 1.04, r * 1.0, 0.18, 12, 1);
  grass.translate(0, 0.02, 0);
  return mergeGeometries([colorize(rock, '#8a5c38'), colorize(grass, '#78c35a')]);
}

/** A woven straw beehive (a skep): a dome of stacked rings with a dark doorway. */
function skepGeo() {
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const u = k / 40, y = u * 1.5;
    const r = 0.85 * Math.sqrt(Math.max(0, 1 - u * u * 0.96)) * (1 + 0.04 * Math.cos(u * 40 * Math.PI)); // ridges of coiled straw
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  const dome = colorize(new THREE.LatheGeometry(pts, 28), (pos, i) => {
    const y = pos.getY(i);
    return new THREE.Color(Math.cos(y / 1.5 * 40 * Math.PI) > 0 ? '#e0ad4e' : '#c58d33');
  });
  const door = colorize(place(new THREE.CircleGeometry(0.16, 16, 0, Math.PI), { p: [0, 0.03, 0.84] }), '#2b1a0a');
  const board = colorize(place(new THREE.BoxGeometry(0.5, 0.05, 0.25), { p: [0, 0.02, 0.92] }), '#9b6a3a');
  return mergeGeometries([dome, door, board]);
}

/** A grey paper wasp nest: a banded teardrop with a dark opening underneath. */
function nestGeo() {
  const pts = [];
  for (let k = 0; k <= 30; k++) {
    const u = k / 30, y = -u * 1.3;
    const r = 0.55 * Math.sin(Math.min(1, u * 1.05) * Math.PI) ** 0.8 + 0.02;
    pts.push(new THREE.Vector2(r, y));
  }
  const body = colorize(new THREE.LatheGeometry(pts.reverse(), 24), (pos, i) => new THREE.Color(Math.sin(pos.getY(i) * 26) > 0.2 ? '#b9b0a2' : '#968c7f'));
  const hole = colorize(place(new THREE.CircleGeometry(0.12, 12), { r: [Math.PI / 2, 0, 0], p: [0, -1.21, 0] }), '#1d140c');
  return mergeGeometries([body, hole]);
}

/** A round, low-poly tree. */
function treeGeo(h = 2.2) {
  const trunk = colorize(place(new THREE.CylinderGeometry(0.12, 0.18, h, 7), { p: [0, h / 2, 0] }), '#7a4e2a');
  const leaves = [];
  for (const [x, y, z, r] of [[0, h + 0.3, 0, 0.9], [0.5, h - 0.05, 0.2, 0.6], [-0.45, h + 0.05, -0.25, 0.65], [0.1, h + 0.75, -0.1, 0.55]]) {
    leaves.push(colorize(place(new THREE.IcosahedronGeometry(r, 1), { p: [x, y, z] }), new THREE.Color('#5aa843').offsetHSL(0, 0, (rand() - 0.5) * 0.08)));
  }
  return mergeGeometries([trunk, ...leaves]);
}

function honeyPotGeo() {
  const pts = [[0.0, 0], [0.3, 0.02], [0.38, 0.2], [0.36, 0.42], [0.26, 0.52], [0.24, 0.6], [0.3, 0.62], [0.3, 0.68], [0.0, 0.68]].map(([x, y]) => new THREE.Vector2(x, y));
  const jar = colorize(new THREE.LatheGeometry(pts, 20), (pos, i) => new THREE.Color(pos.getY(i) > 0.58 ? '#e8d3a8' : '#e08a12'));
  const drip = colorize(place(new THREE.CapsuleGeometry(0.05, 0.2, 3, 8), { p: [0.33, 0.45, 0] }), '#ffb020');
  return mergeGeometries([jar, drip]);
}

function mushroomGeo() {
  const stem = colorize(place(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 8), { p: [0, 0.14, 0] }), '#f4ead6');
  const cap = colorize(place(new THREE.SphereGeometry(0.2, 12, 8, 0, TAU, 0, Math.PI / 2), { s: [1, 0.7, 1], p: [0, 0.26, 0] }), (pos, i) => new THREE.Color(((i * 7) % 23) < 2 ? '#ffffff' : '#e8452c'));
  return mergeGeometries([stem, cap]);
}

const FLOWER_COLORS = ['#ff7aa2', '#ffffff', '#ffd23f', '#9b7bff', '#ff8a3d', '#ff5d8f'];

export function createWorld(scene, { mobile = false } = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const mat = vcMat();
  const strawMat = vcMat({ roughness: 0.95 });
  const glossy = vcMat({ roughness: 0.25 });

  // ---------------------------------------------------------- flowers (two instanced meshes: stems, heads)
  const stemGeo = colorize(place(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 4), { p: [0, 0.15, 0] }), '#4f9a3c');
  const headGeo = (() => {
    const parts = [];
    for (let k = 0; k < 5; k++) parts.push(colorize(place(new THREE.SphereGeometry(0.06, 6, 4), { s: [1, 0.35, 0.6], p: [Math.cos(k / 5 * TAU) * 0.07, 0.3, Math.sin(k / 5 * TAU) * 0.07] }), '#ffffff'));
    parts.push(colorize(place(new THREE.SphereGeometry(0.035, 6, 4), { p: [0, 0.31, 0] }), '#ffd23f'));
    return mergeGeometries(parts);
  })();
  const FLOWERS = mobile ? 90 : 160;
  const stems = new THREE.InstancedMesh(stemGeo, mat, FLOWERS), heads = new THREE.InstancedMesh(headGeo, vcMat({ roughness: 0.6 }), FLOWERS);
  root.add(stems, heads);
  let flowerN = 0;
  const flowerAt = (parent, x, y, z, s = 1) => {
    if (flowerN >= FLOWERS) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * TAU, (rand() - 0.5) * 0.3)), new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s));
    if (parent) m.premultiply(parent.matrixWorld);
    stems.setMatrixAt(flowerN, m); heads.setMatrixAt(flowerN, m);
    heads.setColorAt(flowerN, new THREE.Color(FLOWER_COLORS[(rand() * FLOWER_COLORS.length) | 0]));
    flowerN++;
  };

  // ---------------------------------------------------------- floating islands
  const floaters = [];
  function floater(r, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const m = new THREE.Mesh(islandGeo(r), mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    g.userData = { y0: y, phase: rand() * TAU, spin: (rand() - 0.5) * 0.04, flowers: [] };
    root.add(g);
    floaters.push(g);
    return g;
  }

  // the meadow far below: trees and a pond
  const TREES = mobile ? 26 : 48;
  const trees = new THREE.InstancedMesh(treeGeo(), mat, TREES);
  for (let k = 0; k < TREES; k++) {
    const a = rand() * TAU, d = 24 + rand() * 50, s = 0.8 + rand() * 0.9;
    trees.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, -9, Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * TAU), new THREE.Vector3(s, s, s)));
  }
  trees.castShadow = true;
  root.add(trees);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(5, 40), new THREE.MeshStandardMaterial({ color: '#79c3e6', roughness: 0.05, metalness: 0.15, envMapIntensity: 1.4 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(-9, -8.97, 6); pond.scale.set(1.4, 1, 1);
  root.add(pond);
  const pondRim = new THREE.Mesh(new THREE.RingGeometry(4.9, 5.4, 40), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 1 }));
  pondRim.rotation.x = -Math.PI / 2; pondRim.position.set(-9, -8.96, 6); pondRim.scale.set(1.4, 1, 1);
  root.add(pondRim);

  // ---------------------------------------------------------- light shafts and pollen
  const shaftTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,248,220,0)'); gr.addColorStop(0.25, 'rgba(255,248,220,.55)'); gr.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const side = g.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shafts = [];
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  for (let k = 0; k < (mobile ? 4 : 6); k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + rand() * 1.8, 26), shaftMat.clone());
    m.userData.phase = rand() * TAU;
    shafts.push(m); root.add(m);
  }
  const POLLEN = mobile ? 140 : 260;
  const pollenGeo = new THREE.BufferGeometry();
  const pp = new Float32Array(POLLEN * 3), pSeed = new Float32Array(POLLEN);
  for (let k = 0; k < POLLEN; k++) { pp[k * 3] = (rand() - 0.5) * 22; pp[k * 3 + 1] = rand() * 9 - 2; pp[k * 3 + 2] = (rand() - 0.5) * 22; pSeed[k] = rand() * TAU; }
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const pollen = new THREE.Points(pollenGeo, new THREE.PointsMaterial({ size: 0.09, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe9a0', toneMapped: false }));
  pollen.frustumCulled = false;
  root.add(pollen);

  let skep = null, nest = null;
  const skepPos = new THREE.Vector3(), nestPos = new THREE.Vector3();

  /** Lay everything out around a board of radius maxR (world units). Called per board. */
  function setBoardRadius(maxR, boardFlowers) {
    for (const f of floaters) root.remove(f);
    floaters.length = 0;
    flowerN = 0;
    const R = maxR + 1.4;
    // the bees' island (with the skep) and the wasps' island (a tree with the nest) face each other
    const bees = floater(1.6, -(R + 3.2), -0.9, -2.0);
    const sk = new THREE.Mesh(skepGeo(), strawMat); sk.position.set(0, 0.1, 0); sk.rotation.y = 0.9; sk.castShadow = true; bees.add(sk); skep = sk;
    const pot = new THREE.Mesh(honeyPotGeo(), glossy); pot.position.set(0.95, 0.1, 0.5); pot.castShadow = true; bees.add(pot);
    const wasps = floater(1.5, R + 3.0, -0.4, 1.4);
    const tree = new THREE.Mesh(treeGeo(1.9), mat); tree.position.set(-0.2, 0.1, -0.2); tree.castShadow = true; wasps.add(tree);
    const branch = new THREE.Mesh(colorize(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6), '#7a4e2a'), mat);
    branch.position.set(0.45, 1.75, 0.1); branch.rotation.z = -1.15; wasps.add(branch);
    const ns = new THREE.Mesh(nestGeo(), mat); ns.position.set(0.95, 1.95, 0.1); ns.castShadow = true; wasps.add(ns); nest = ns;
    // a few more islands for depth
    const extras = [[1.1, -(R + 1.0), -3.2, R + 2.6], [0.9, R + 1.5, -2.6, -(R + 1.8)], [1.3, 1.5, -4.2, R + 4.6], [0.8, -2.0, -2.0, -(R + 4.2)], [1.0, -(R + 5.5), -5.5, R + 1.0]];
    for (const [r, x, y, z] of extras.slice(0, mobile ? 3 : 5)) {
      const f = floater(r, x, y, z);
      if (rand() > 0.5) { const t = new THREE.Mesh(treeGeo(1.2 + rand()), mat); t.scale.setScalar(0.6); t.castShadow = true; f.add(t); }
      else for (let k = 0; k < 3; k++) { const mu = new THREE.Mesh(mushroomGeo(), mat); mu.position.set((rand() - 0.5) * r, 0.1, (rand() - 0.5) * r); mu.scale.setScalar(0.8 + rand() * 0.8); f.add(mu); }
    }
    root.updateMatrixWorld(true);
    // flowers: around the board's grassy rim, and dotted over the islands
    for (let k = 0; k < (mobile ? 46 : 80); k++) {
      const a = rand() * TAU, d = boardFlowers + 0.1 + rand() * 0.35;
      flowerAt(null, Math.cos(a) * d, -1.02, Math.sin(a) * d, 0.9 + rand() * 0.5);
    }
    for (const f of floaters) {
      const r = f.children[0].geometry.boundingSphere ? 1 : 1;
      for (let k = 0; k < 7; k++) { const a = rand() * TAU, d = rand() * 1.2 * r; f.userData.flowers.push(flowerN); flowerAt(f, Math.cos(a) * d, 0.1, Math.sin(a) * d, 1.1); }
    }
    stems.count = heads.count = flowerN;
    stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    skep.getWorldPosition(skepPos); nest.getWorldPosition(nestPos);
    // light shafts lean in from the sun's side, around the board
    shafts.forEach((m, k) => {
      const a = -0.5 + k * 0.55;
      m.position.set(Math.cos(a) * (R * 0.9) + 2, 6, Math.sin(a) * (R * 0.9) - 3);
      m.rotation.set(0, a + Math.PI / 2, -0.38);
    });
  }

  // floating islands bob and turn; flowers on them ride along
  const fm = new THREE.Matrix4();
  function update(t, dt) {
    for (const f of floaters) {
      const u = f.userData;
      const prev = f.matrixWorld.clone();
      f.position.y = u.y0 + Math.sin(t * 0.35 + u.phase) * 0.18;
      f.rotation.y += u.spin * dt;
      f.updateMatrixWorld(true);
      if (u.flowers.length) {
        const delta = fm.copy(f.matrixWorld).multiply(prev.invert());
        for (const i of u.flowers) { stems.getMatrixAt(i, prev); prev.premultiply(delta); stems.setMatrixAt(i, prev); heads.setMatrixAt(i, prev); }
      }
    }
    stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    for (const m of shafts) m.material.opacity = 0.35 + 0.25 * Math.sin(t * 0.3 + m.userData.phase);
    const p = pollenGeo.attributes.position;
    for (let k = 0; k < POLLEN; k++) {
      let y = p.getY(k) + dt * 0.18;
      if (y > 7) y = -2;
      p.setY(k, y);
      p.setX(k, p.getX(k) + Math.sin(t * 0.5 + pSeed[k]) * dt * 0.15);
    }
    p.needsUpdate = true;
    if (nest) nest.rotation.z = Math.sin(t * 0.9) * 0.05; // the nest sways on its branch
    skep?.getWorldPosition(skepPos);
  }

  return { setBoardRadius, update, skepPos, nestPos };
}
