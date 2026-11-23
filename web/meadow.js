// The living meadow behind the board: a season per chapter, layered hills that shift with the
// phone's tilt (or the mouse), sun rays, and something drifting in the air: pollen, blossom,
// falling leaves or fireflies. Static layers are cached, so a frame only paints what moves.
// The board never moves; only this background does.
import { hexPath } from './art.js';

const TAU = Math.PI * 2;

export const SEASONS = [
  { name: 'Spring', sky: ['#fff7e0', '#ffe9b0', '#fbd98a'], far: '#cfe7a8', near: '#a8d58a', front: '#86c06c', bloom: ['#ffb3c8', '#ffd1df', '#ffffff'], air: 'blossom', ray: 'rgba(255,255,240,.32)' },
  { name: 'Summer', sky: ['#fff4c9', '#ffe28f', '#f7c95a'], far: '#c4e09a', near: '#95cc6f', front: '#6fb354', bloom: ['#ff8a3d', '#ffcf33', '#9b7bff'], air: 'pollen', ray: 'rgba(255,250,210,.38)' },
  { name: 'Autumn', sky: ['#fff1dc', '#ffd8a6', '#f3b170'], far: '#e3c48a', near: '#d39b5a', front: '#b97a3c', bloom: ['#e8743b', '#c94f2a', '#f2a93b'], air: 'leaves', ray: 'rgba(255,236,200,.3)' },
  { name: 'Evening', sky: ['#ffd9b8', '#e7a7a9', '#8d74a8'], far: '#9f8fb3', near: '#7a6f9e', front: '#5d567f', bloom: ['#ffe9a8', '#ffd1df', '#cfeaff'], air: 'fireflies', ray: 'rgba(255,220,190,.22)' },
];

export const seasonFor = (level) => (level < 4 ? 0 : level < 8 ? 1 : level < 11 ? 2 : 3);

export function createMeadow(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, season = SEASONS[0], cache = null;
  let tilt = { x: 0, y: 0 }, want = { x: 0, y: 0 };

  // tilt: device orientation where available, otherwise the mouse (gently)
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    want.x = Math.max(-1, Math.min(1, e.gamma / 25));
    want.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    want.x = (e.clientX / innerWidth - 0.5) * 1.2;
    want.y = (e.clientY / innerHeight - 0.5) * 1.2;
  }, { passive: true });

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    cache = null;
  }

  // sky + faint honeycomb, painted once per size and season
  function buildCache() {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, season.sky[0]); gr.addColorStop(0.6, season.sky[1]); gr.addColorStop(1, season.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = 34, dx = Math.sqrt(3) * r, dy = 1.5 * r;
    g.strokeStyle = 'rgba(200,140,30,.07)'; g.lineWidth = 2;
    for (let row = -1; row * dy < h + r; row++) {
      for (let col = -1; col * dx < w + r; col++) {
        g.save(); g.translate(col * dx + (row & 1) * dx / 2, row * dy); hexPath(g, r, 0.1); g.stroke(); g.restore();
      }
    }
    cache = c;
  }

  function hill(base, amp, freq, phase, color, ox, oy) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, h + 10);
    for (let x = -40; x <= w + 40; x += 16) {
      ctx.lineTo(x + ox, h * base + oy + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.7) * amp * 0.35);
    }
    ctx.lineTo(w + 40, h + 10);
    ctx.fill();
  }

  function flowersRow(ox, oy, t) {
    // a fringe of little flowers along the bottom edge, nearest layer
    const n = Math.ceil(w / 34) + 2;
    for (let k = 0; k < n; k++) {
      const x = k * 34 - 20 + ox + ((k * 13) % 9);
      const y = h - 12 - ((k * 7) % 11) + oy;
      const sway = Math.sin(t * 1.4 + k) * 2;
      ctx.strokeStyle = season.front; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, h + 4); ctx.quadraticCurveTo(x + sway, y + 10, x + sway, y); ctx.stroke();
      ctx.fillStyle = season.bloom[k % season.bloom.length];
      for (let p = 0; p < 5; p++) {
        const a = TAU * p / 5 + k;
        ctx.beginPath(); ctx.arc(x + sway + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(x + sway, y, 2.2, 0, TAU); ctx.fill();
    }
  }

  function rays(t, ox, oy) {
    ctx.save();
    ctx.translate(w * 0.12 + ox * 0.5, -h * 0.08 + oy * 0.5);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      const a = 0.35 + k * 0.17 + Math.sin(t * 0.15 + k) * 0.03;
      const len = h * 1.25, wdt = 0.035 + (k % 3) * 0.018;
      ctx.fillStyle = season.ray;
      ctx.globalAlpha = 0.22 + 0.2 * Math.sin(t * 0.4 + k * 1.3);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - wdt) * len, Math.sin(a - wdt) * len);
      ctx.lineTo(Math.cos(a + wdt) * len, Math.sin(a + wdt) * len);
      ctx.fill();
    }
    ctx.restore();
  }

  function air(t, ox, oy) {
    const n = season.air === 'fireflies' ? 22 : 30;
    for (let k = 0; k < n; k++) {
      const depth = 0.4 + (k % 4) * 0.2;
      const px = ox * depth * 2, py = oy * depth * 2;
      if (season.air === 'leaves' || season.air === 'blossom') {
        const fall = season.air === 'leaves' ? 26 : 16;
        const x = ((k * 97.3 + Math.sin(t * 0.6 + k) * 40 + t * 10) % (w + 60)) - 30 + px;
        const y = ((k * 61.7 + t * fall * depth) % (h + 40)) - 20 + py;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1 + k % 3) + k);
        ctx.fillStyle = season.bloom[k % season.bloom.length];
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        if (season.air === 'leaves') { ctx.ellipse(0, 0, 6 * depth + 2, 3 * depth + 1.5, 0, 0, TAU); }
        else { ctx.ellipse(0, 0, 3.5 * depth + 1.5, 2.2 * depth + 1, 0, 0, TAU); }
        ctx.fill(); ctx.restore();
      } else if (season.air === 'fireflies') {
        const x = (k * 97.3 % w) + Math.sin(t * 0.5 + k) * 30 + px;
        const y = (k * 61.7 % (h * 0.9)) + Math.cos(t * 0.4 + k * 2) * 24 + py;
        const glow = Math.max(0, Math.sin(t * (1.2 + (k % 5) * 0.3) + k * 3));
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gr.addColorStop(0, `rgba(255,250,170,${0.9 * glow})`); gr.addColorStop(1, 'rgba(255,250,170,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
      } else {
        const x = ((k * 97.3 + t * (8 + (k % 5) * 3)) % (w + 40)) - 20 + px;
        const y = (k * 61.7 % h) + Math.sin(t * 0.7 + k) * 14 + py;
        ctx.fillStyle = `rgba(255,190,40,${0.25 + (k % 3) * 0.12})`;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + (k % 3), 0, TAU); ctx.fill();
      }
    }
  }

  resize();
  addEventListener('resize', resize);

  return {
    setSeason(k) { if (SEASONS[k] !== season) { season = SEASONS[k]; cache = null; } },
    get season() { return season; },
    draw(t, dt) {
      tilt.x += (want.x - tilt.x) * Math.min(1, dt * 3);
      tilt.y += (want.y - tilt.y) * Math.min(1, dt * 3);
      if (!cache) buildCache();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(cache, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tx = tilt.x, ty = tilt.y;
      rays(t, -tx * 10, -ty * 6);
      hill(0.8, 18, 0.006, 0.5, season.far, -tx * 6, -ty * 3);
      hill(0.87, 14, 0.009, 2.1, season.near, -tx * 14, -ty * 6);
      hill(0.94, 9, 0.013, 4.0, season.front, -tx * 22, -ty * 9);
      air(t, -tx * 12, -ty * 8);
      flowersRow(-tx * 30, -ty * 10, t);
    },
  };
}
