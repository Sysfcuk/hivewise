// Storybook art, drawn procedurally on Canvas 2D: wax cells, honey, bees, flowers, wasps.
// Every function draws centred on (0, 0) at size r (the hex radius); callers translate/scale.

const TAU = Math.PI * 2;

export function hexPath(ctx, r, round = 0.18) {
  // pointy-top hexagon with softly rounded corners
  const pts = [];
  for (let k = 0; k < 6; k++) { const a = TAU * k / 6 - Math.PI / 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const [x0, y0] = pts[(k + 5) % 6], [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % 6];
    const ax = x1 + (x0 - x1) * round, ay = y1 + (y0 - y1) * round;
    const bx = x1 + (x2 - x1) * round, by = y1 + (y2 - y1) * round;
    if (k === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(x1, y1, bx, by);
  }
  ctx.closePath();
}

/** An empty wax cell (or honey, when honey = true). */
export function drawCell(ctx, r, { honey = false, glow = 0, t = 0 } = {}) {
  // rim
  hexPath(ctx, r * 0.97);
  ctx.fillStyle = honey ? '#c97a06' : '#e2a93a';
  ctx.fill();
  // inner well
  hexPath(ctx, r * 0.84);
  const g = ctx.createLinearGradient(0, -r, 0, r);
  if (honey) { g.addColorStop(0, '#ffb300'); g.addColorStop(1, '#ff8c00'); }
  else { g.addColorStop(0, '#fff1c4'); g.addColorStop(1, '#f9d979'); }
  ctx.fillStyle = g;
  ctx.fill();
  if (!honey) {
    // wax is a little translucent: light pools softly in the middle of each cell
    const sss = ctx.createRadialGradient(0, r * 0.1, 0, 0, r * 0.1, r * 0.8);
    sss.addColorStop(0, 'rgba(255,252,235,.75)'); sss.addColorStop(0.6, 'rgba(255,240,190,.2)'); sss.addColorStop(1, 'rgba(255,240,190,0)');
    hexPath(ctx, r * 0.84); ctx.fillStyle = sss; ctx.fill();
  }
  if (honey) {
    // glossy honey: a highlight and a slow drip shimmer
    ctx.save();
    hexPath(ctx, r * 0.84); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(-r * 0.28, -r * 0.38, r * 0.3, r * 0.12, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,.35)';
    const y = ((t * 0.25) % 1) * r * 2 - r;
    ctx.beginPath(); ctx.ellipse(r * 0.25, y, r * 0.08, r * 0.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  } else {
    // little inner shadow at the top for depth
    ctx.save(); hexPath(ctx, r * 0.84); ctx.clip();
    ctx.strokeStyle = 'rgba(160,100,20,.18)'; ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(0, r * 0.4, r * 1.25, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    ctx.restore();
  }
  if (glow > 0) {
    hexPath(ctx, r * 0.86);
    ctx.lineWidth = r * 0.12;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * glow})`;
    ctx.stroke();
  }
}

/** Target marker: buzz (solid) or fly (dashed). */
export function drawTarget(ctx, r, fly, t, hot = false) {
  const pulse = 1 + Math.sin(t * 6) * 0.06;
  ctx.save();
  if (hot) {
    // the hinted cell: a gold halo and a bobbing arrow
    ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + Math.sin(t * 7) * 0.06), 0, TAU);
    ctx.lineWidth = r * 0.12; ctx.strokeStyle = 'rgba(255,160,0,.9)'; ctx.stroke();
    const y = -r * 0.95 - Math.abs(Math.sin(t * 5)) * r * 0.25;
    ctx.fillStyle = '#ff8a00'; ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.moveTo(0, y + r * 0.32); ctx.lineTo(-r * 0.22, y); ctx.lineTo(-r * 0.08, y); ctx.lineTo(-r * 0.08, y - r * 0.24);
    ctx.lineTo(r * 0.08, y - r * 0.24); ctx.lineTo(r * 0.08, y); ctx.lineTo(r * 0.22, y); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, TAU);
  if (fly) { ctx.setLineDash([r * 0.12, r * 0.09]); ctx.lineDashOffset = -t * r * 0.6; }
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = fly ? '#2f9e6a' : '#39b54a';
  ctx.stroke();
  ctx.setLineDash([]);
  if (!fly || hot) { ctx.fillStyle = hot ? 'rgba(57,181,74,.55)' : 'rgba(57,181,74,.25)'; ctx.fill(); }
  ctx.restore();
}

function stripeBody(ctx, rx, ry, base, stripe, n, lean = 0) {
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, lean, 0, TAU);
  ctx.fillStyle = base; ctx.fill();
  ctx.clip();
  ctx.fillStyle = stripe;
  for (let k = 0; k < n; k++) {
    const x = -rx + (rx * 2) * (k + 0.75) / (n + 0.5);
    ctx.fillRect(x - rx * 0.13, -ry * 1.2, rx * 0.26, ry * 2.4);
  }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, lean, 0, TAU);
  ctx.lineWidth = Math.max(1.5, rx * 0.08); ctx.strokeStyle = 'rgba(74,44,15,.85)'; ctx.stroke();
}

/** A round, friendly bee facing right. t drives the wing flap; mood: 'happy' | 'wow'. */
export function drawBee(ctx, r, t, { flap = 1, mood = 'happy', blink = false } = {}) {
  const s = r * 0.64;
  const w = Math.sin(t * 38) * 0.5 * flap;
  // wings (behind)
  ctx.save();
  ctx.fillStyle = 'rgba(230,248,255,.85)'; ctx.strokeStyle = 'rgba(120,170,200,.7)'; ctx.lineWidth = Math.max(1, s * 0.06);
  for (const [dx, a] of [[-0.15, -0.9 + w], [0.15, -0.45 + w * 0.8]]) {
    ctx.save(); ctx.translate(s * dx, -s * 0.45); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.42, s * 0.3, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // stinger
  ctx.fillStyle = '#4a2c0f';
  ctx.beginPath(); ctx.moveTo(-s * 0.92, -s * 0.05); ctx.lineTo(-s * 1.18, s * 0.04); ctx.lineTo(-s * 0.9, s * 0.13); ctx.fill();
  stripeBody(ctx, s * 0.95, s * 0.72, '#ffc928', '#3b2410', 2);
  // cheek + face
  ctx.fillStyle = 'rgba(255,120,120,.45)';
  ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.3, s * 0.15, s * 0.1, 0, 0, TAU); ctx.fill();
  const ex = s * 0.5, ey = -s * 0.08;
  ctx.fillStyle = '#2a1608';
  if (blink) { ctx.fillRect(ex - s * 0.12, ey, s * 0.24, s * 0.05); }
  else {
    ctx.beginPath(); ctx.ellipse(ex, ey, s * 0.12, s * (mood === 'wow' ? 0.17 : 0.15), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + s * 0.04, ey - s * 0.06, s * 0.045, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#2a1608'; ctx.lineWidth = Math.max(1.2, s * 0.07); ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'wow') ctx.arc(s * 0.74, s * 0.2, s * 0.07, 0, TAU);
  else ctx.arc(s * 0.7, s * 0.12, s * 0.13, 0.3, Math.PI - 0.6);
  ctx.stroke();
  // antennae
  ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.6); ctx.quadraticCurveTo(s * 0.7, -s * 1.05, s * 0.95, -s * 1.0); ctx.stroke();
  ctx.fillStyle = '#2a1608'; ctx.beginPath(); ctx.arc(s * 0.97, -s * 1.0, s * 0.08, 0, TAU); ctx.fill();
}

/** An angular, grumpy wasp facing left. */
export function drawWasp(ctx, r, t, { flap = 1 } = {}) {
  const s = r * 0.64;
  const w = Math.sin(t * 44) * 0.5 * flap;
  ctx.save(); ctx.scale(-1, 1); // faces left: back towards the hive
  ctx.fillStyle = 'rgba(235,235,255,.75)'; ctx.strokeStyle = 'rgba(90,90,120,.7)'; ctx.lineWidth = Math.max(1, s * 0.06);
  for (const [dx, a] of [[-0.25, -1.0 + w], [0.05, -0.55 + w * 0.8]]) {
    ctx.save(); ctx.translate(s * dx, -s * 0.38); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.2, s * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // abdomen (pointed), waist, head
  ctx.save(); ctx.translate(-s * 0.38, s * 0.06);
  ctx.beginPath(); ctx.moveTo(s * 0.35, 0); ctx.quadraticCurveTo(0, -s * 0.62, -s * 0.72, 0); ctx.quadraticCurveTo(0, s * 0.62, s * 0.35, 0);
  ctx.fillStyle = '#ffb000'; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = '#1d120a';
  for (const x of [-0.5, -0.22, 0.06]) ctx.fillRect(s * x - s * 0.07, -s, s * 0.14, s * 2);
  ctx.restore();
  ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.strokeStyle = '#1d120a'; ctx.stroke();
  ctx.fillStyle = '#1d120a'; ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.06); ctx.lineTo(-s * 1.0, 0); ctx.lineTo(-s * 0.7, s * 0.06); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1d120a'; ctx.beginPath(); ctx.ellipse(s * 0.05, 0, s * 0.12, s * 0.1, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.45, -s * 0.05, s * 0.38, s * 0.34, 0, 0, TAU);
  ctx.fillStyle = '#ff9d00'; ctx.fill(); ctx.stroke();
  // angry eye + brow
  ctx.fillStyle = '#c0151b'; ctx.beginPath(); ctx.ellipse(s * 0.58, -s * 0.08, s * 0.13, s * 0.11, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d120a'; ctx.beginPath(); ctx.arc(s * 0.62, -s * 0.07, s * 0.05, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1d120a'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, s * 0.09);
  ctx.beginPath(); ctx.moveTo(s * 0.38, -s * 0.28); ctx.lineTo(s * 0.74, -s * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.55, s * 0.17); ctx.lineTo(s * 0.72, s * 0.12); ctx.stroke();
  // antenna
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.36); ctx.lineTo(s * 0.75, -s * 0.8); ctx.lineTo(s * 0.95, -s * 0.72); ctx.stroke();
  ctx.restore();
}

const PETALS = [['#ff7aa2', '#ffd1df'], ['#9b7bff', '#e0d6ff'], ['#ff8a3d', '#ffd6b8'], ['#4fb3ff', '#cfeaff']];

/** A flower; `seed` picks its colour, `sway` is the breeze. */
export function drawFlower(ctx, r, t, seed = 0) {
  const s = r * 0.64;
  const [c0, c1] = PETALS[seed % PETALS.length];
  ctx.save();
  ctx.rotate(Math.sin(t * 1.6 + seed) * 0.08);
  ctx.strokeStyle = '#3f8f3f'; ctx.lineWidth = Math.max(2, s * 0.14); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s * 0.2); ctx.quadraticCurveTo(s * 0.1, s * 0.7, 0, s * 1.0); ctx.stroke();
  ctx.fillStyle = '#5fb35f';
  ctx.beginPath(); ctx.ellipse(s * 0.25, s * 0.72, s * 0.24, s * 0.1, -0.5, 0, TAU); ctx.fill();
  const n = 6;
  for (let k = 0; k < n; k++) {
    ctx.save(); ctx.rotate(TAU * k / n + seed);
    const g = ctx.createLinearGradient(0, 0, 0, -s * 0.85);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.24, s * 0.42, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, TAU);
  ctx.fillStyle = '#ffcf33'; ctx.fill();
  ctx.fillStyle = '#e09b00';
  for (let k = 0; k < 5; k++) { const a = TAU * k / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.13, Math.sin(a) * s * 0.13, s * 0.04, 0, TAU); ctx.fill(); }
  ctx.restore();
}

/** Soft meadow background with drifting pollen, painted into its own canvas. */
export function drawMeadow(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff6d6'); g.addColorStop(0.65, '#ffe8a3'); g.addColorStop(1, '#f9d27a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // faint honeycomb pattern
  const r = 34, dx = Math.sqrt(3) * r, dy = 1.5 * r;
  ctx.strokeStyle = 'rgba(217,154,30,.09)'; ctx.lineWidth = 2;
  for (let row = -1; row * dy < h + r; row++) {
    for (let col = -1; col * dx < w + r; col++) {
      ctx.save(); ctx.translate(col * dx + (row & 1) * dx / 2, row * dy); hexPath(ctx, r, 0.1); ctx.stroke(); ctx.restore();
    }
  }
  // hills
  ctx.fillStyle = 'rgba(120,190,90,.25)';
  ctx.beginPath(); ctx.moveTo(0, h); ctx.quadraticCurveTo(w * 0.25, h * 0.86, w * 0.55, h * 0.95); ctx.quadraticCurveTo(w * 0.8, h * 1.02, w, h * 0.9); ctx.lineTo(w, h); ctx.fill();
  // pollen motes
  for (let k = 0; k < 26; k++) {
    const x = ((k * 97.3 + t * (8 + k % 5 * 3)) % (w + 40)) - 20;
    const y = (k * 61.7 % h) + Math.sin(t * 0.7 + k) * 14;
    ctx.fillStyle = `rgba(255,190,40,${0.25 + (k % 3) * 0.12})`;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + (k % 3), 0, TAU); ctx.fill();
  }
}
