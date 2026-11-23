// WebGL board renderer (PixiJS). main.js owns the game model and the animation clock; this file
// only draws it. The art comes from art.js, painted once per board size into textures, so it is
// sharp on any screen and cheap to draw every frame.
//
// Layers, back to front: cells · territory glow · targets · shadows · pieces · ghosts · flyers ·
// particles · badges · popups.
import { Application, Container, Sprite, Texture, Graphics, Text, Filter, GlProgram } from './vendor/pixi.min.mjs';
import { drawCell, drawBee, drawWasp, drawFlower, hexPath } from './art.js';

const TAU = Math.PI * 2;
const BEE = 1, FLOWER = 2, WASP = 3;
const FRAMES = 6; // wing-flap frames

// Honey: a slow wobble, a broad sheen sliding across, and pin-point glints. Runs once over the
// whole honey layer (honey cells plus the honey poured in when you win).
const HONEY_VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }`;
const HONEY_FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uScale;
void main(void) {
  vec2 fc = gl_FragCoord.xy / uScale;
  vec2 wob = vec2(sin(fc.y * 0.09 + uTime * 1.7), cos(fc.x * 0.1 + uTime * 1.3)) * 0.0022;
  vec4 c = texture(uTexture, vTextureCoord + wob);
  float band = smoothstep(0.82, 1.0, sin((fc.x * 0.7 + fc.y) * 0.035 - uTime * 1.2));
  float glint = pow(max(0.0, sin(fc.x * 0.21 + uTime * 1.9) * sin(fc.y * 0.17 - uTime * 1.5)), 14.0);
  c.rgb += (band * 0.3 + glint * 0.55) * c.a * vec3(1.0, 0.95, 0.78);
  finalColor = c;
}`;

export async function createStage(canvas) {
  const app = new Application();
  await app.init({
    canvas, backgroundAlpha: 0, antialias: true, autoDensity: true, autoStart: false, sharedTicker: false,
    resolution: Math.min(devicePixelRatio || 1, 3), width: canvas.clientWidth || 300, height: canvas.clientHeight || 300,
    preference: 'webgl',
  });
  app.ticker?.stop();

  const L = {};
  for (const name of ['cells', 'honey', 'glow', 'targets', 'shadows', 'pieces', 'ghosts', 'flyers', 'parts', 'badges', 'popups']) {
    L[name] = new Container();
    app.stage.addChild(L[name]);
  }
  let honeyFilter = null;
  try {
    honeyFilter = new Filter({
      glProgram: new GlProgram({ vertex: HONEY_VERT, fragment: HONEY_FRAG, name: 'honey' }),
      resources: { honeyUniforms: { uTime: { value: 0, type: 'f32' }, uScale: { value: 1, type: 'f32' } } },
    });
    L.honey.filters = [honeyFilter];
  } catch (err) { console.warn('honey shader off', err); }
  const line = new Graphics();
  L.badges.addChild(line);

  let tex = null, res = 1, builtR = 0;
  let cellSpr = [], glowSpr = [], shadowSpr = [], pieceSpr = [], fillSpr = [];
  const pools = { target: [], halo: [], arrow: [], badge: [], ghost: [], flyer: [], flyShadow: [], part: [] };

  // ------------------------------------------------------------ textures
  function paint(sizeR, R, fn) {
    const px = Math.ceil(sizeR * R * res);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.scale(res, res);
    g.translate(px / res / 2, px / res / 2);
    fn(g, R);
    return Texture.from(c);
  }

  function buildTextures(R) {
    if (tex) for (const v of Object.values(tex)) (Array.isArray(v) ? v : [v]).forEach((t) => t.destroy(true));
    res = app.renderer.resolution;
    const flapT = (k) => (k / FRAMES) * (TAU / 38);
    tex = {
      cell: paint(2.1, R, (g, r) => drawCell(g, r)),
      honey: paint(2.1, R, (g, r) => drawCell(g, r, { honey: true, t: 0 })),
      glow: paint(2.2, R, (g, r) => {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.05);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); hexPath(g, r * 0.9); g.clip(); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
      }),
      shadow: paint(1.4, R, (g, r) => {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
        gr.addColorStop(0, 'rgba(90,50,10,.55)'); gr.addColorStop(1, 'rgba(90,50,10,0)');
        g.fillStyle = gr; g.scale(1, 0.42); g.beginPath(); g.arc(0, 0, r * 0.6, 0, TAU); g.fill();
      }),
      buzz: paint(1.2, R, (g, r) => {
        g.beginPath(); g.arc(0, 0, r * 0.38, 0, TAU);
        g.fillStyle = 'rgba(57,181,74,.25)'; g.fill();
        g.lineWidth = r * 0.1; g.strokeStyle = '#39b54a'; g.stroke();
      }),
      fly: paint(1.2, R, (g, r) => {
        g.beginPath(); g.arc(0, 0, r * 0.38, 0, TAU);
        g.setLineDash([r * 0.12, r * 0.09]); g.lineWidth = r * 0.1; g.strokeStyle = '#2f9e6a'; g.stroke();
      }),
      halo: paint(1.6, R, (g, r) => {
        g.beginPath(); g.arc(0, 0, r * 0.58, 0, TAU); g.lineWidth = r * 0.12; g.strokeStyle = 'rgba(255,160,0,.95)'; g.stroke();
      }),
      arrow: paint(0.8, R, (g, r) => {
        const y = -r * 0.1;
        g.fillStyle = '#ff8a00'; g.strokeStyle = '#fff'; g.lineWidth = r * 0.06; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(0, y + r * 0.3); g.lineTo(-r * 0.22, y); g.lineTo(-r * 0.08, y); g.lineTo(-r * 0.08, y - r * 0.22);
        g.lineTo(r * 0.08, y - r * 0.22); g.lineTo(r * 0.08, y); g.lineTo(r * 0.22, y); g.closePath(); g.stroke(); g.fill();
      }),
      badge: paint(0.7, R, (g, r) => {
        g.beginPath(); g.arc(0, 0, r * 0.26, 0, TAU); g.fillStyle = '#e8322b'; g.fill();
        g.lineWidth = r * 0.05; g.strokeStyle = '#fff'; g.stroke();
        g.fillStyle = '#fff'; g.font = `700 ${r * 0.36}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('!', 0, r * 0.02);
      }),
      dot: paint(0.3, R, (g, r) => { g.beginPath(); g.arc(0, 0, r * 0.12, 0, TAU); g.fillStyle = '#fff'; g.fill(); }),
      petal: paint(0.4, R, (g, r) => { g.beginPath(); g.ellipse(0, 0, r * 0.08, r * 0.16, 0, 0, TAU); g.fillStyle = '#fff'; g.fill(); }),
      bee: Array.from({ length: FRAMES }, (_, k) => paint(3, R, (g, r) => drawBee(g, r, flapT(k), { flap: 1 }))),
      beeWow: Array.from({ length: FRAMES }, (_, k) => paint(3, R, (g, r) => drawBee(g, r, flapT(k), { flap: 1, mood: 'wow' }))),
      beeBlink: paint(3, R, (g, r) => drawBee(g, r, 0, { flap: 0, blink: true })),
      wasp: Array.from({ length: FRAMES }, (_, k) => paint(3, R, (g, r) => drawWasp(g, r, (k / FRAMES) * (TAU / 44), { flap: 1 }))),
      flower: Array.from({ length: 4 }, (_, k) => paint(3, R, (g, r) => drawFlower(g, r, 0, k))),
    };
    builtR = R;
  }

  // ------------------------------------------------------------ helpers
  const S = (t) => { const s = new Sprite(t); s.anchor.set(0.5); return s; };
  function take(pool, layer, texture) {
    let s = pool.free?.pop();
    if (!s) { s = S(texture); layer.addChild(s); }
    s.texture = texture; s.visible = true; s.alpha = 1; s.rotation = 0; s.tint = 0xffffff;
    (pool.used ||= []).push(s);
    return s;
  }
  function releaseAll() {
    for (const pool of Object.values(pools)) {
      pool.free ||= [];
      for (const s of pool.used || []) { s.visible = false; pool.free.push(s); }
      pool.used = [];
    }
  }
  const k1 = () => 1 / res; // textures are painted at device resolution

  function setBoard(scene) {
    for (const arr of [cellSpr, glowSpr, shadowSpr, pieceSpr, fillSpr]) arr.forEach((s) => s?.destroy());
    cellSpr = []; glowSpr = []; shadowSpr = []; pieceSpr = []; fillSpr = [];
    for (const name of Object.keys(pools)) pools[name] = { free: [], used: [] };
    for (const name of ['targets', 'ghosts', 'flyers', 'parts', 'badges', 'popups']) {
      for (const c of [...L[name].children]) if (c !== line) c.destroy();
    }
    buildTextures(scene.R);
    for (let i = 0; i < scene.cellsN; i++) {
      if (!scene.cellInfo[i].exists) continue;
      const honey = scene.cellInfo[i].honey;
      cellSpr[i] = (honey ? L.honey : L.cells).addChild(S(honey ? tex.honey : tex.cell));
      const fl = L.honey.addChild(S(tex.honey)); fl.visible = false; fillSpr[i] = fl;
      const gl = L.glow.addChild(S(tex.glow)); gl.blendMode = 'add'; gl.alpha = 0; glowSpr[i] = gl;
      shadowSpr[i] = L.shadows.addChild(S(tex.shadow));
      pieceSpr[i] = L.pieces.addChild(S(tex.bee[0]));
    }
  }

  // ------------------------------------------------------------ frame
  function render(sc) {
    const { R, centers, vis, t, now } = sc;
    if (!tex || sc.boardId !== render.boardId || Math.abs(builtR - R) > 0.5) { setBoard(sc); render.boardId = sc.boardId; }
    releaseAll();
    const kr = k1();
    const lost = new Set(sc.preview?.waspFlips || []);
    const flapFrame = (speed, off = 0) => Math.floor((t * speed + off) * FRAMES) % FRAMES;

    for (let i = 0; i < sc.cellsN; i++) {
      const cs = cellSpr[i];
      if (!cs) continue;
      const v = vis[i];
      const appear = Math.min(1, Math.max(0, (now - v.born) / 300));
      const [x, y] = centers[i];
      cs.position.set(x, y); cs.scale.set(appear * kr); cs.alpha = appear;
      cs.tint = i === sc.sel ? 0xfffbe8 : 0xffffff;

      // the win: honey pours into every cell the hive owns, rippling out from the last landing
      const fs = fillSpr[i];
      const fill = v.fillAt ? Math.min(1, Math.max(0, (now - v.fillAt) / 380)) : 0;
      fs.visible = fill > 0;
      if (fs.visible) {
        const e = 1 - Math.pow(1 - fill, 3);
        fs.position.set(x, y + (1 - e) * R * 0.35); fs.scale.set((0.55 + 0.45 * e) * kr, e * kr); fs.alpha = 0.92 * e;
      }

      // territory glow: warm honey for your hive, a faint red for wasp ground
      const gl = glowSpr[i];
      const want = v.type === BEE ? 1 : v.type === WASP ? 1 : 0;
      v.glow += (want - v.glow) * Math.min(1, sc.dt * 5);
      gl.position.set(x, y); gl.scale.set(kr);
      gl.tint = v.type === WASP ? 0xff4b3a : 0xffb21e;
      gl.alpha = v.glow * (v.type === WASP ? 0.32 : 0.6) * (0.88 + 0.12 * Math.sin(t * 2 + i * 0.7)) * appear;

      // piece
      const ps = pieceSpr[i], sh = shadowSpr[i];
      if (!v.type || now < v.born) { ps.visible = false; sh.visible = false; continue; }
      ps.visible = sh.visible = true;
      v.scale += (1 - v.scale) * Math.min(1, sc.dt * 12);
      v.squash = Math.max(0, v.squash - sc.dt * 3);
      const sq = Math.sin(v.squash * Math.PI) * 0.25;
      // reactions, all after a move (never while you're aiming):
      // cheer = two happy hops after a big capture; shock = a startled shiver after a wasp strike;
      // wasps sulk (droop, slow wings) once they're badly outnumbered
      const cheer = v.cheer && now > v.cheer && now - v.cheer < 760 ? (now - v.cheer) / 760 : -1;
      const shock = v.shock && now > v.shock && now - v.shock < 650 ? (now - v.shock) / 650 : -1;
      const lift = i === sc.sel ? R * 0.14 : 0;
      const hop = cheer >= 0 ? Math.abs(Math.sin(cheer * Math.PI * 2)) * R * 0.32 * (1 - cheer * 0.5) : 0;
      const bob = v.type === FLOWER ? 0 : Math.sin(t * 3 + i) * R * 0.05;
      const shake = lost.has(i) || shock >= 0 ? Math.sin(t * 46 + i) * R * (shock >= 0 ? 0.06 * (1 - shock) : 0.045) : 0;
      const sulk = v.type === WASP && sc.sulk;
      // bees turn to look at the bee you've picked up
      let face = v.face || 1;
      if (v.type === BEE && sc.sel >= 0 && i !== sc.sel) face = centers[sc.sel][0] >= x ? 1 : -1;
      if (v.type === BEE) {
        const blink = ((t + i * 1.3) % 4) < 0.12;
        const excited = i === sc.sel || lost.has(i) || cheer >= 0 || shock >= 0;
        ps.texture = excited ? tex.beeWow[flapFrame(cheer >= 0 ? 14 : 9, i)] : blink ? tex.beeBlink : tex.bee[flapFrame(2.2, i * 0.37)];
      } else if (v.type === WASP) ps.texture = tex.wasp[flapFrame(sc.preview?.wasp?.from === i ? 10 : sulk ? 0.8 : 2.6, i * 0.29)];
      else ps.texture = tex.flower[v.seed % 4];
      ps.position.set(x + shake, y + bob - lift - hop - (v.type === FLOWER ? R * 0.15 : 0) + (sulk ? R * 0.05 : 0));
      ps.rotation = v.type === FLOWER ? Math.sin(t * 1.6 + v.seed) * 0.08 : sulk ? 0.22 * face : cheer >= 0 ? Math.sin(cheer * TAU * 2) * 0.12 : 0;
      ps.scale.set(v.scale * (1 + sq) * face * kr, v.scale * (1 - sq) * kr);
      ps.tint = lost.has(i) ? 0xffd0d0 : sulk ? 0xd9cfc4 : 0xffffff;
      sh.position.set(x, y + R * 0.42);
      const hs = 1 - (lift + hop) / (R * 0.6);
      sh.scale.set(v.scale * hs * kr * (v.type === FLOWER ? 0.6 : 1), v.scale * hs * kr);
      sh.alpha = v.type === FLOWER ? 0.35 : 0.55 * hs;
    }

    // targets, warnings and the hint
    for (const tg of sc.targets) {
      const [x, y] = centers[tg.to];
      const pulse = 1 + Math.sin(t * 6) * 0.06;
      const s = take(pools.target, L.targets, tg.fly ? tex.fly : tex.buzz);
      s.position.set(x, y); s.scale.set(pulse * kr); s.rotation = tg.fly ? t * 0.8 : 0;
      if (sc.preview && sc.preview.bee.to === tg.to) s.scale.set(1.18 * kr);
      if (tg.warn) {
        const b = take(pools.badge, L.badges, tex.badge);
        b.position.set(x + R * 0.42, y - R * 0.42);
        b.scale.set(kr * (1 + Math.sin(t * 8) * 0.08));
      }
      if (sc.hint && sc.hint.to === tg.to) {
        const h = take(pools.halo, L.targets, tex.halo);
        h.position.set(x, y); h.scale.set(kr * (1 + Math.sin(t * 7) * 0.08));
        const a = take(pools.arrow, L.badges, tex.arrow);
        a.position.set(x, y - R * 0.95 - Math.abs(Math.sin(t * 5)) * R * 0.25); a.scale.set(kr);
      }
    }

    // the wasps' predicted strike: a dashed red line and a ring where it lands
    line.clear();
    const pw = sc.preview?.wasp;
    if (pw) {
      const [x0, y0] = centers[pw.from], [x1, y1] = centers[pw.to];
      const n = 9, dx = (x1 - x0) / n, dy = (y1 - y0) / n, off = (t * 2) % 1;
      for (let k = 0; k < n; k += 1) {
        const a = (k + off) / n, b = Math.min(1, (k + off + 0.55) / n);
        line.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
      }
      line.stroke({ width: Math.max(2, R * 0.08), color: 0xe8322b, alpha: 0.85, cap: 'round' });
      line.circle(x1, y1, R * 0.42).stroke({ width: Math.max(2, R * 0.07), color: 0xe8322b, alpha: 0.6 + 0.3 * Math.sin(t * 9) });
      void dx; void dy;
    }

    // ghosts: a flower blooming open as it turns, a wasp shrinking away
    for (const gh of sc.ghosts) {
      const u = Math.min(1, (now - gh.t0) / gh.dur);
      const [x, y] = centers[gh.i];
      const s = take(pools.ghost, L.ghosts, gh.kind === FLOWER ? tex.flower[gh.seed % 4] : tex.wasp[0]);
      if (gh.kind === FLOWER) { s.position.set(x, y - R * 0.15); s.scale.set((1 + u * 0.7) * kr); s.rotation = u * 0.8; s.alpha = 1 - u; }
      else { s.position.set(x, y); s.scale.set((1 - u) * kr); s.rotation = u * 5; s.alpha = 1 - u * 0.5; }
    }

    // flyers, with a shadow that shows how high they are
    for (const f of sc.flyers) {
      const u = f.u ?? 0;
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const gx = f.x0 + (f.x1 - f.x0) * e, gy = f.y0 + (f.y1 - f.y0) * e;
      const h = Math.sin(Math.PI * u) * f.arc;
      const sh = take(pools.flyShadow, L.shadows, tex.shadow);
      const hs = 1 - Math.min(0.65, h / (R * 1.8));
      sh.position.set(gx, gy + R * 0.42); sh.scale.set(hs * kr); sh.alpha = 0.6 * hs;
      const s = take(pools.flyer, L.flyers, f.type === BEE ? tex.beeWow[flapFrame(14)] : tex.wasp[flapFrame(16)]);
      s.position.set(gx, gy - h);
      s.scale.set(f.face * 1.12 * kr, 1.12 * kr);
      s.rotation = Math.sin(Math.PI * u) * -0.25 * f.face;
    }

    // particles
    for (const p of sc.parts) {
      const s = take(pools.part, L.parts, p.petal ? tex.petal : tex.dot);
      s.position.set(p.x, p.y);
      const sz = p.size / (R * 0.12);
      s.scale.set(sz * kr);
      s.rotation = p.rot || 0;
      s.tint = p.tint;
      s.alpha = 1 - p.life / p.max;
    }

    // "+3" popups
    for (const pop of sc.popups) {
      if (!pop.text) {
        pop.text = new Text({ text: pop.label, style: { fontFamily: 'Fredoka, sans-serif', fontWeight: '700', fontSize: Math.round(R * 0.62), fill: pop.color, stroke: { color: '#ffffff', width: Math.max(3, R * 0.12) } }, resolution: res });
        pop.text.anchor.set(0.5);
        L.popups.addChild(pop.text);
      }
      const u = Math.min(1, (now - pop.t0) / 900);
      const [x, y] = centers[pop.i];
      pop.text.position.set(x, y - R * 0.6 - u * R * 0.9);
      const pop1 = u < 0.15 ? u / 0.15 : 1;
      pop.text.scale.set(0.6 + pop1 * 0.5 - (u > 0.15 ? (u - 0.15) * 0.15 : 0));
      pop.text.alpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      if (u >= 1) { pop.text.destroy(); pop.dead = true; }
    }

    if (honeyFilter) {
      const u = honeyFilter.resources.honeyUniforms.uniforms;
      u.uTime = t; u.uScale = res;
    }
    app.render();
  }

  return {
    kind: 'webgl',
    resize(w, h) { app.renderer.resize(w, h); },
    render,
    destroy() { app.destroy(); },
  };
}
