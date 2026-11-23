// Hivewise app: screens, input, animation, sound. Rules and the solver live in Rust (engine.js).
import { loadEngine, splitLevels, PIECE, STATUS } from './engine.js';
import { drawCell, drawTarget, drawBee, drawWasp, drawFlower } from './art.js';
import { createMeadow, seasonFor, SEASONS } from './meadow.js';
import { createStage } from './stage.js';

const $ = (s) => document.querySelector(s);
const SQ3 = Math.sqrt(3);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- save data
const SAVE_KEY = 'hivewise.v1';
const save = (() => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
})();
save.stars ||= [];
save.sound ??= true;
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } };

// ---------------------------------------------------------------- sound (tiny synth, no files)
const sfx = (() => {
  let ac = null;
  const ctx = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, { type = 'sine', vol = 0.18, slide = 0, delay = 0, vib = 0 } = {}) {
    if (!save.sound) return;
    const a = ctx(), t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    if (vib) {
      const l = a.createOscillator(), lg = a.createGain();
      l.frequency.value = vib; lg.gain.value = freq * 0.06; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];
  return {
    unlock() { if (save.sound) ctx().resume?.(); },
    tap() { tone(660, 0.07, { vol: 0.1 }); },
    buzz() { tone(210, 0.32, { type: 'sawtooth', vol: 0.05, vib: 32, slide: 60 }); },
    land() { tone(330, 0.12, { vol: 0.14, slide: -120 }); },
    flip(k) { tone(SCALE[Math.min(k, SCALE.length - 1)], 0.18, { type: 'triangle', vol: 0.12 }); },
    wasp() { tone(150, 0.35, { type: 'square', vol: 0.04, vib: 45, slide: 90 }); },
    sting(k) { tone(220 - k * 12, 0.16, { type: 'square', vol: 0.06, slide: -60 }); },
    win() { [0, 2, 4, 5, 7].forEach((n, k) => tone(SCALE[n] / 2 * 2, 0.3, { type: 'triangle', vol: 0.12, delay: k * 0.09 })); },
    sad() { tone(330, 0.3, { type: 'triangle', vol: 0.1, slide: -100 }); tone(247, 0.4, { type: 'triangle', vol: 0.1, slide: -80, delay: 0.2 }); },
    nope() { tone(140, 0.1, { type: 'square', vol: 0.04 }); },
    squelch() { tone(180, 0.18, { vol: 0.14, slide: -110 }); tone(420, 0.08, { type: 'triangle', vol: 0.06, delay: 0.06 }); },
    pour() { for (let k = 0; k < 7; k++) tone(260 + k * 40 + Math.random() * 30, 0.12, { vol: 0.07, slide: 80, delay: 0.12 + k * 0.1 }); },
  };
})();
const buzzPhone = (ms) => {
  // phones only allow vibration after the player has touched the page
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
};

// ---------------------------------------------------------------- boot
const E = await loadEngine();
const LEVELS = splitLevels(await (await fetch('./levels.txt')).text());

// ---------------------------------------------------------------- screens
const screens = ['title', 'map', 'game'];
let screen = 'title';
function show(name, push = true) {
  for (const s of screens) $('#' + s).classList.toggle('hidden', s !== name);
  if (push && name !== 'title') history.pushState({ screen: name }, '');
  screen = name;
  if (name === 'map') buildMap();
  if (name === 'game') resize();
}
addEventListener('popstate', () => {
  hideSheet();
  if (screen === 'game') show('map', false);
  else if (screen === 'map') show('title', false);
});
$('#btn-play').onclick = () => {
  sfx.unlock(); sfx.tap();
  // iPhones ask before sharing tilt; the meadow uses it for parallax
  try { globalThis.DeviceOrientationEvent?.requestPermission?.().catch(() => {}); } catch { /* not needed elsewhere */ }
  show('map');
};
$('#map-back').onclick = () => history.back();
$('#game-back').onclick = () => history.back();
const syncSoundBtn = () => { $('#btn-sound').textContent = save.sound ? '♪' : '×'; $('#btn-sound').style.opacity = save.sound ? 1 : 0.5; };
$('#btn-sound').onclick = () => { save.sound = !save.sound; persist(); syncSoundBtn(); sfx.tap(); };
syncSoundBtn();

function unlockedUpTo() {
  let k = 0;
  while (k < LEVELS.length && save.stars[k] > 0) k++;
  return k; // the first unsolved level is playable
}

function buildMap() {
  const comb = $('#comb');
  comb.innerHTML = '';
  const open = unlockedUpTo();
  let total = 0;
  // honeycomb: rows of 3 and 2 alternate, so each row nests into the one above
  let row = null, left = 0, wide = false;
  LEVELS.forEach((lv, k) => {
    if (!left) { wide = !wide; left = wide ? 3 : 2; row = document.createElement('div'); row.className = 'comb-row'; comb.appendChild(row); }
    left--;
    const st = save.stars[k] || 0;
    total += st;
    const b = document.createElement('button');
    b.className = 'lv' + (k > open ? ' locked' : '') + (k === open ? ' next' : '') + (st ? ' done' : '') + (st === 3 ? ' gold' : '');
    b.innerHTML = `<b>${k > open ? '🔒' : k + 1}</b><small>${lv.name}</small><span class="st">${[1, 2, 3].map((n) => `<i class="${n <= st ? 'on' : ''}">★</i>`).join('')}</span>`;
    if (k <= open) b.onclick = () => { sfx.tap(); startLevel(k); };
    row.appendChild(b);
  });
  $('#star-total').textContent = `★ ${total}/${LEVELS.length * 3}`;
  const pct = Math.round(total / (LEVELS.length * 3) * 100);
  $('#hive-pct').textContent = pct + '%';
  requestAnimationFrame(() => { $('#hive-meter .bar i').style.width = pct + '%'; });
  placeMapBee();
}
// a little bee hovers by the next level to play
const mapBee = $('#map-bee'), mapBeeCtx = mapBee.getContext('2d');
function placeMapBee() {
  const next = $('#comb .lv.next') || $('#comb .lv:last-child');
  if (!next) return;
  requestAnimationFrame(() => {
    // perch beside the next cell, on whichever side has room
    const r = next.getBoundingClientRect(), m = $('#map').getBoundingClientRect();
    const right = r.right - m.left + 64 <= m.width;
    mapBee.style.left = `${right ? r.right - m.left - 14 : r.left - m.left - 50}px`;
    mapBee.style.top = `${r.top - m.top + r.height * 0.18}px`;
  });
}
function drawMapBee(t) {
  mapBeeCtx.setTransform(1, 0, 0, 1, 0, 0);
  mapBeeCtx.clearRect(0, 0, mapBee.width, mapBee.height);
  mapBeeCtx.translate(64 + Math.sin(t * 1.7) * 14, 58 + Math.sin(t * 3.4) * 8);
  mapBeeCtx.scale(Math.cos(t * 1.7) >= 0 ? 1 : -1, 1);
  drawBee(mapBeeCtx, 64, t, { flap: 1, blink: (t % 3.2) < 0.12 });
}

// ---------------------------------------------------------------- game state
let cur = 0;               // level index
let cellsN = 0, W = 0, H = 0;
let cellInfo = [];         // { exists, honey }
let vis = [];              // what is drawn on each cell: { type, scale, seed, squash, face }
let flyers = [];           // pieces in flight
let parts = [];            // particles
let ghosts = [];           // short-lived echoes: a flower blooming open, a wasp shrinking away
let popups = [];           // "+3" labels
let sel = -1, targets = [], hint = null, preview = null;
let busy = false;
let speed = 1;             // animation speed; tapping during a move fast-forwards it
let boardId = 0;
let R = 30, centers = [];  // layout (css px)
const board = $('#board');
// WebGL (PixiJS) when available, plain Canvas 2D otherwise
let stage = null, g = null;
try { if (new URLSearchParams(location.search).has('canvas')) throw new Error('forced'); stage = await createStage(board); } catch (err) { console.warn('WebGL unavailable, using Canvas 2D', err); g = board.getContext('2d'); }

function startLevel(k) {
  cur = k;
  const lv = LEVELS[k];
  if (!E.load(lv.text)) { alert('Could not load level ' + (k + 1)); return; }
  W = E.w; H = E.h; cellsN = W * H;
  cellInfo = Array.from({ length: cellsN }, (_, i) => E.cell(i));
  vis = Array.from({ length: cellsN }, (_, i) => ({ type: E.piece(i), scale: 0, seed: (i * 7 + k * 3) % 4, squash: 0, face: 1, glow: 0, born: performance.now() + i * 25 }));
  flyers = []; parts = []; ghosts = []; popups = []; sel = -1; targets = []; hint = null; preview = null; busy = false; speed = 1;
  boardId++;
  $('#lvl-title b').textContent = `${k + 1}. ${lv.name}`;
  meadow.setSeason(seasonFor(k));
  hideSheet();
  if (screen !== 'game') show('game'); else resize();
  updateHud();
  const tip = $('#tip');
  if (lv.tips.length) { tip.textContent = lv.tips.join(' '); tip.classList.remove('off'); } else tip.classList.add('off');
}

function syncVis() {
  for (let i = 0; i < cellsN; i++) {
    const p = E.piece(i);
    if (vis[i].type !== p) { vis[i].type = p; vis[i].scale = 1; }
  }
}

function updateHud() {
  const par = E.par, nectar = E.nectar, used = E.moves;
  $('#lvl-title span').textContent = `${SEASONS[seasonFor(cur)].name} · Par ${par} · ${Math.max(0, nectar - used)} nectar left`;
  const n = $('#nectar');
  n.innerHTML = '';
  for (let k = 0; k < nectar; k++) {
    const d = document.createElement('i');
    if (k < par) d.className = 'par';
    if (k < used) d.classList.add('used');
    n.appendChild(d);
  }
  $('#btn-undo').disabled = used === 0 || busy;
}

// ---------------------------------------------------------------- layout
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const rect = board.parentElement.getBoundingClientRect();
  if (stage) stage.resize(rect.width, rect.height);
  else {
    board.width = Math.round(rect.width * dpr);
    board.height = Math.round(rect.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  drawBg();
  if (!cellsN) return;
  // unit-radius centres, then fit the bounding box of real cells
  const raw = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < cellsN; i++) {
    const c = i % W, r = Math.floor(i / W);
    const x = SQ3 * (c + 0.5 * (r & 1)), y = 1.5 * r;
    raw.push([x, y]);
    if (!cellInfo[i].exists) continue;
    minX = Math.min(minX, x - SQ3 / 2); maxX = Math.max(maxX, x + SQ3 / 2);
    minY = Math.min(minY, y - 1); maxY = Math.max(maxY, y + 1);
  }
  const pad = 10, tipSpace = $('#tip').classList.contains('off') ? 0 : $('#tip').offsetHeight + 8;
  const aw = rect.width - pad * 2, ah = rect.height - pad * 2 - tipSpace;
  R = Math.min(aw / (maxX - minX), ah / (maxY - minY), 64);
  const ox = pad + (aw - (maxX - minX) * R) / 2 - minX * R;
  const oy = pad + tipSpace + (ah - (maxY - minY) * R) / 2 - minY * R;
  centers = raw.map(([x, y]) => [ox + x * R, oy + y * R]);
}
addEventListener('resize', () => { if (screen === 'game') resize(); else drawBg(); });

const meadow = createMeadow($('#bg'));
let bgT = 0, bgDt = 0;
function drawBg() { meadow.draw(bgT, bgDt); }

// ---------------------------------------------------------------- input
function cellAt(x, y) {
  let best = -1, bd = R * 0.95;
  for (let i = 0; i < cellsN; i++) {
    if (!cellInfo[i].exists) continue;
    const d = Math.hypot(centers[i][0] - x, centers[i][1] - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
let downCell = -1, pressing = false;
const cellFromEvent = (e) => { const r = board.getBoundingClientRect(); return cellAt(e.clientX - r.left, e.clientY - r.top); };
// Hovering (mouse) or pressing and holding (touch) on a target shows how the wasps would answer.
function previewAt(c) {
  const t = sel >= 0 && targets.find((t) => t.to === c);
  if (!t) { preview = null; return; }
  if (preview?.bee.to !== c) preview = E.preview(sel, c);
}
board.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  downCell = cellFromEvent(e);
  pressing = true;
  $('#tip').classList.add('off');
  if (busy) { speed = 4; return; }        // tap during a move: fast-forward it
  if (sel >= 0 && targets.some((t) => t.to === downCell)) { previewAt(downCell); return; } // commits on release
  if (downCell >= 0 && E.piece(downCell) === PIECE.BEE) select(downCell);
});
board.addEventListener('pointermove', (e) => {
  if (busy || sel < 0) return;
  if (e.pointerType !== 'mouse' && !pressing) return;
  previewAt(cellFromEvent(e));
});
const endPress = () => { pressing = false; };
board.addEventListener('pointercancel', () => { endPress(); preview = null; });
board.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') preview = null; });
board.addEventListener('pointerup', (e) => {
  endPress();
  if (busy) return;
  const c = cellFromEvent(e);
  if (sel >= 0 && targets.some((t) => t.to === c)) return move(sel, c);
  if (e.pointerType !== 'mouse') preview = null;   // slid off a target: cancelled
  if (c === downCell && c >= 0 && E.piece(c) !== PIECE.BEE && sel >= 0) { sel = -1; targets = []; hint = null; }
});

function select(i) {
  if (cellInfo[i].honey) { sfx.nope(); vis[i].squash = 0.6; toastStuck(); return; }
  sel = i;
  preview = null;
  // each target knows whether the wasps would grab something after it (the red "!" badge)
  targets = E.targets(i).map((t) => ({ ...t, warn: E.preview(i, t.to)?.waspFlips.length || 0 }));
  if (hint && hint.from !== i) hint = null;
  vis[i].squash = 0.5;
  sfx.tap(); buzzPhone(8);
  if (!targets.length) sfx.nope();
}
function toastStuck() {
  const tip = $('#tip');
  tip.textContent = 'That bee is stuck in honey. It can still be pollinated, but it can\'t move.';
  tip.classList.remove('off');
  setTimeout(() => tip.classList.add('off'), 2200);
}

// ---------------------------------------------------------------- moves & animation
// A pause that respects fast-forward. Measured in real time, so it also finishes in a background tab.
const wait = (ms) => new Promise((resolve) => {
  let left = reduceMotion ? ms * 0.3 : ms, last = performance.now();
  const tick = () => {
    const now = performance.now();
    left -= (now - last) * speed; last = now;
    if (left <= 0) resolve(); else setTimeout(tick, 16);
  };
  tick();
});
function flyTo(type, from, to, buzz) {
  const [x0, y0] = centers[from], [x1, y1] = centers[to];
  const dur = reduceMotion ? 120 : buzz ? 260 : 340;
  return new Promise((resolve) => {
    // advanced by stepFlyers(); the timer is a safety net for when frames stop (background tab)
    let finished = false;
    const f = { type, x0, y0, x1, y1, el: 0, u: 0, last: performance.now(), dur, arc: buzz ? R * 0.5 : R * 1.1, face: x1 >= x0 ? 1 : -1 };
    f.done = () => { if (finished) return; finished = true; const k = flyers.indexOf(f); if (k >= 0) flyers.splice(k, 1); resolve(); };
    flyers.push(f);
    setTimeout(f.done, dur + 250);
  });
}
function stepFlyers(now) {
  for (const f of [...flyers]) {
    f.el += (now - f.last) * speed; f.last = now;
    f.u = Math.min(1, f.el / f.dur);
    if (f.u >= 1) f.done();
  }
}
const hex2num = (c) => parseInt(c.slice(1), 16);
function burst(i, colors, n = 14, { petals = false, up = 1 } = {}) {
  const [x, y] = centers[i];
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random()) * R * 3.2;
    const color = colors[k % colors.length];
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R * 1.5 * up, life: 0, max: 0.6 + Math.random() * 0.4,
      size: R * (0.06 + Math.random() * 0.07) * (petals ? 1.6 : 1), color, tint: hex2num(color), petal: petals && k % 2 === 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  }
}
function stepParts(dt) {
  for (let k = parts.length - 1; k >= 0; k--) {
    const p = parts[k];
    p.life += dt;
    if (p.life > p.max) { parts.splice(k, 1); continue; }
    p.vx *= 1 - dt * 2.5; p.vy = p.vy * (1 - dt * 2.5) + R * (p.petal ? 3 : 6) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
  }
}
const PETAL_COLORS = [['#ff7aa2', '#ffd1df'], ['#9b7bff', '#e0d6ff'], ['#ff8a3d', '#ffd6b8'], ['#4fb3ff', '#cfeaff']];

async function move(from, to) {
  const res = E.play(from, to);
  if (!res) return;
  busy = true; sel = -1; targets = []; hint = null; preview = null; speed = 1;
  const id = boardId, gone = () => id !== boardId; // the player left this level mid-move
  updateHud();
  // the bee
  const { bee } = res;
  if (!bee.buzz) vis[from].type = PIECE.NONE;
  sfx.buzz(); buzzPhone(10);
  await flyTo(PIECE.BEE, from, to, bee.buzz);
  if (gone()) return;
  vis[to] = { ...vis[to], type: PIECE.BEE, scale: 1, squash: 1, face: centers[to][0] >= centers[from][0] ? 1 : -1 };
  lastLanding = to;
  sfx.land();
  if (cellInfo[to].honey) honeyDrip(to);
  await turnCells(res.flips, PIECE.BEE, to);
  if (gone()) return;
  // a big capture: the whole hive cheers
  if (res.flips.length >= 3) cheerAll(performance.now(), 40);
  // the wasps answer
  if (res.wasp) {
    await wait(140);
    if (gone()) return;
    const w = res.wasp;
    if (!w.buzz) vis[w.from].type = PIECE.NONE;
    sfx.wasp();
    await flyTo(PIECE.WASP, w.from, w.to, w.buzz);
    if (gone()) return;
    vis[w.to] = { ...vis[w.to], type: PIECE.WASP, scale: 1, squash: 1 };
    await turnCells(res.waspFlips, PIECE.WASP, w.to);
    if (gone()) return;
    // bees near the strike get a fright
    const now = performance.now();
    for (let i = 0; i < cellsN; i++) {
      if (vis[i].type === PIECE.BEE && Math.hypot(centers[i][0] - centers[w.to][0], centers[i][1] - centers[w.to][1]) < R * 3.6) vis[i].shock = now + Math.random() * 80;
    }
  }
  syncVis();
  busy = false;
  speed = 1;
  updateHud();
  checkEnd();
}

// The capture chain: each flower blooms open and bursts into a bee, notes climb, and a "+N" rises.
async function turnCells(list, to, at) {
  if (!list.length) return;
  popups.push({ i: at, label: (to === PIECE.BEE ? '+' : '−') + list.length, color: to === PIECE.BEE ? '#f59e0b' : '#e8322b', t0: performance.now() });
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    const was = vis[i].type;
    if (to === PIECE.BEE && was === PIECE.FLOWER) {
      ghosts.push({ i, kind: PIECE.FLOWER, seed: vis[i].seed, t0: performance.now(), dur: 300 / speed });
      burst(i, [...PETAL_COLORS[vis[i].seed % 4], '#ffcf33'], 16, { petals: true });
    } else if (to === PIECE.BEE) {
      ghosts.push({ i, kind: PIECE.WASP, t0: performance.now(), dur: 300 / speed });
      burst(i, ['#ffb000', '#1d120a', '#fff']);
    } else burst(i, ['#ff9d00', '#c0151b', '#1d120a']);
    vis[i] = { ...vis[i], type: to, scale: 0.2, squash: 0.8, glow: 0 };
    if (to === PIECE.BEE) sfx.flip(k); else sfx.sting(k);
    buzzPhone(6);
    await wait(55);
    if (!vis[list[k + 1]] && k + 1 < list.length) return; // level changed
  }
  await wait(50);
}


let lastLanding = 0;
function cheerAll(start, stagger) {
  let k = 0;
  for (let i = 0; i < cellsN; i++) if (vis[i].type === PIECE.BEE) vis[i].cheer = start + (k++ % 7) * stagger;
}
// A bee that lands in honey sinks in a little and the honey splashes and drips.
function honeyDrip(i) {
  vis[i].squash = 1.6;
  const [x, y] = centers[i];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = R * (1.2 + Math.random() * 1.6);
    parts.push({ x: x + (Math.random() - 0.5) * R * 0.6, y: y + R * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.7 + Math.random() * 0.3,
      size: R * (0.07 + Math.random() * 0.06), color: k % 3 ? '#ffa600' : '#ffd36b', tint: k % 3 ? 0xffa600 : 0xffd36b, rot: 0, spin: 0 });
  }
  sfx.squelch();
}
// Petals drift down over the board when you win.
function confetti(n = 60) {
  const rect = board.getBoundingClientRect();
  for (let k = 0; k < n; k++) {
    const pal = PETAL_COLORS[k % 4], color = pal[k % 2];
    parts.push({ x: Math.random() * rect.width, y: -R * (0.5 + Math.random() * 3), vx: (Math.random() - 0.5) * R * 2, vy: R * (2 + Math.random() * 3),
      life: 0, max: 1.8 + Math.random() * 1.2, size: R * (0.1 + Math.random() * 0.08), color, tint: hex2num(color), petal: true, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8 });
  }
}
// The win: honey pours into every cell the hive owns, rippling out from the winning landing.
function winSequence() {
  const now = performance.now();
  const [lx, ly] = centers[lastLanding];
  let latest = now;
  for (let i = 0; i < cellsN; i++) {
    if (vis[i].type !== PIECE.BEE) continue;
    const d = Math.hypot(centers[i][0] - lx, centers[i][1] - ly) / R;
    vis[i].fillAt = now + 120 + d * 75;
    vis[i].cheer = vis[i].fillAt + 120;
    latest = Math.max(latest, vis[i].fillAt);
  }
  sfx.pour();
  setTimeout(() => confetti(), 250);
  return latest - now + 450; // when the pour has finished
}

function starsFor(moves, par) { return moves <= par ? 3 : moves <= par + 1 ? 2 : 1; }

function checkEnd() {
  const s = E.status;
  if (s === STATUS.PLAYING) return;
  if (s === STATUS.WON) {
    const st = starsFor(E.moves, E.par);
    const first = !(save.stars[cur] > 0);
    save.stars[cur] = Math.max(save.stars[cur] || 0, st);
    persist();
    sfx.win(); buzzPhone([20, 40, 20]);
    const pour = Math.min(1500, winSequence());
    const last = cur === LEVELS.length - 1;
    setTimeout(() => showSheet({
      title: st === 3 ? 'Perfect!' : st === 2 ? 'Lovely!' : 'Done!',
      stars: st,
      text: `Pollinated in ${E.moves} move${E.moves === 1 ? '' : 's'} (par ${E.par}).` + (st < 3 ? ' Can you match par?' : first ? '' : ''),
      buttons: [['Replay', () => startLevel(cur)], last ? ['All levels', () => { hideSheet(); history.back(); }] : ['Next', () => startLevel(cur + 1), true]],
    }), Math.max(650, pour));
  } else {
    sfx.sad(); buzzPhone(40);
    setTimeout(() => showSheet({
      title: s === STATUS.OUT ? 'Out of nectar' : 'No moves left',
      text: s === STATUS.OUT ? 'Your bees are tired. Try a shorter route.' : 'None of your bees can move.',
      buttons: [['Undo', () => { hideSheet(); undo(); }], ['Try again', () => startLevel(cur), true]],
    }), 500);
  }
}

function showSheet({ title, stars = null, text, buttons }) {
  const sh = $('#sheet');
  sh.querySelector('h3').textContent = title;
  sh.querySelector('.stars').innerHTML = stars == null ? '' : [1, 2, 3].map((n) => `<i class="${n <= stars ? 'on' : ''}">★</i>`).join('');
  sh.querySelector('p').textContent = text;
  const row = sh.querySelector('.row');
  row.innerHTML = '';
  for (const [label, fn, go] of buttons) {
    const b = document.createElement('button');
    b.textContent = label; if (go) b.className = 'go';
    b.onclick = () => { sfx.tap(); fn(); };
    row.appendChild(b);
  }
  sh.classList.remove('hidden');
}
function hideSheet() { $('#sheet').classList.add('hidden'); }

function undo() {
  if (busy || !E.undo()) return;
  sel = -1; targets = []; hint = null; flyers = [];
  syncVis();
  for (const v of vis) v.scale = 1;
  sfx.tap();
  updateHud();
}
$('#btn-undo').onclick = undo;
$('#btn-restart').onclick = () => { if (!busy) { sfx.tap(); startLevel(cur); } };
$('#btn-hint').onclick = () => {
  if (busy || E.status !== STATUS.PLAYING) return;
  sfx.tap();
  const h = E.hint();
  const tip = $('#tip');
  if (!h) {
    tip.textContent = 'No winning line from here within your nectar. Try undo or restart.';
    tip.classList.remove('off');
    setTimeout(() => tip.classList.add('off'), 2600);
    return;
  }
  select(h.from);
  hint = h;
};

// ---------------------------------------------------------------- render loop
let last = performance.now(), frameNo = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  bgT += dt; bgDt += dt;
  // the meadow runs at half rate: it's soft and slow, and phones have batteries
  if ((frameNo++ & 1) === 0 || screen !== 'game') { drawBg(); bgDt = 0; }
  if (screen === 'title') drawTitleBee(t);
  if (screen === 'map') drawMapBee(t);
  if (screen === 'game' && cellsN) {
    stepFlyers(now);
    stepParts(dt);
    ghosts = ghosts.filter((gh) => now - gh.t0 < gh.dur);
    popups = popups.filter((p) => !p.dead);
    if (stage) {
      let bees = 0, wasps = 0;
      for (const v of vis) { if (v.type === PIECE.BEE) bees++; else if (v.type === PIECE.WASP) wasps++; }
      const sulk = !busy && wasps > 0 && bees >= wasps * 3;
      stage.render({ R, centers, cellsN, cellInfo, vis, flyers, parts, ghosts, popups, sel, targets, hint, preview, sulk, t, dt, now, boardId });
    } else drawBoard(t, dt, now);
  }
  requestAnimationFrame(frame);
}

// Canvas 2D fallback for devices without WebGL: the same board, without the extra effects.
function drawBoard(t, dt, now) {
  const rect = board.getBoundingClientRect();
  g.clearRect(0, 0, rect.width, rect.height);
  const tset = new Map(targets.map((x) => [x.to, x]));
  // cells
  for (let i = 0; i < cellsN; i++) {
    if (!cellInfo[i].exists) continue;
    const [x, y] = centers[i];
    const appear = Math.min(1, Math.max(0, (now - vis[i].born) / 300));
    if (appear <= 0) continue;
    g.save(); g.translate(x, y); g.scale(appear, appear);
    drawCell(g, R, { honey: cellInfo[i].honey, glow: i === sel ? 1 : hint && hint.from === i ? 0.5 + 0.5 * Math.sin(t * 8) : 0, t });
    g.restore();
  }
  // targets
  for (const [to, m] of tset) {
    const [x, y] = centers[to];
    g.save(); g.translate(x, y);
    drawTarget(g, R, m.fly, t, hint && hint.to === to);
    g.restore();
  }
  // pieces
  for (let i = 0; i < cellsN; i++) {
    const v = vis[i];
    if (!v.type || !cellInfo[i].exists) continue;
    if (now < v.born) continue;
    v.scale += (1 - v.scale) * Math.min(1, dt * 12);
    v.squash = Math.max(0, v.squash - dt * 3);
    const sq = Math.sin(v.squash * Math.PI) * 0.25;
    const [x, y] = centers[i];
    const bob = v.type === PIECE.FLOWER ? 0 : Math.sin(t * 3 + i) * R * 0.05;
    g.save();
    g.translate(x, y + bob - (v.type === PIECE.FLOWER ? R * 0.15 : 0));
    g.scale(v.scale * (1 + sq) * (v.face || 1), v.scale * (1 - sq));
    if (i === sel) g.translate(0, -R * 0.12);
    if (v.type === PIECE.BEE) drawBee(g, R, t + i, { flap: i === sel ? 1 : 0.25, mood: i === sel ? 'wow' : 'happy', blink: ((t + i * 1.3) % 4) < 0.12 });
    else if (v.type === PIECE.WASP) drawWasp(g, R, t + i, { flap: 0.35 });
    else drawFlower(g, R, t, v.seed);
    g.restore();
  }
  // flyers
  for (let k = flyers.length - 1; k >= 0; k--) {
    const f = flyers[k];
    const u = f.u;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(Math.PI * u) * f.arc;
    g.save(); g.translate(x, y);
    g.scale(f.face * 1.12, 1.12);
    g.rotate(Math.sin(Math.PI * u) * -0.25);
    if (f.type === PIECE.BEE) drawBee(g, R, t * 1.6, { flap: 1, mood: 'wow' });
    else drawWasp(g, R, t * 1.6, { flap: 1 });
    g.restore();
  }
  // particles
  for (const p of parts) {
    g.globalAlpha = 1 - p.life / p.max;
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

const tb = $('#title-bee'), tbc = tb.getContext('2d');
function drawTitleBee(t) {
  tbc.setTransform(1, 0, 0, 1, 0, 0);
  tbc.clearRect(0, 0, tb.width, tb.height);
  tbc.translate(tb.width / 2 + Math.sin(t * 1.3) * 30, tb.height / 2 + Math.sin(t * 2.6) * 14);
  tbc.rotate(Math.sin(t * 1.3 + 1) * 0.12);
  drawBee(tbc, 170, t, { flap: 1, blink: (t % 3.5) < 0.12 });
}

requestAnimationFrame(frame);
drawBg();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('./sw.js').catch(() => {});
window.hivewise = { E, LEVELS, startLevel, move, select, get busy() { return busy; }, get renderer() { return stage ? 'webgl' : 'canvas2d'; },
  setPreview(from, to) { select(from); preview = E.preview(from, to); } }; // for testing in the console
