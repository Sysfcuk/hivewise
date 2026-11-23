// Bridge to the Rust core (hivewise.wasm). All game rules live in Rust; this file only moves
// numbers across the boundary. See src/lib.rs for the exported functions.

export const PIECE = { NONE: 0, BEE: 1, FLOWER: 2, WASP: 3 };
export const STATUS = { PLAYING: 0, WON: 1, STUCK: 2, OUT: 3 };

export async function loadEngine(url = './hivewise.wasm') {
  const res = await fetch(url);
  const { instance } = WebAssembly.instantiateStreaming && res.headers.get('content-type')?.includes('wasm')
    ? await WebAssembly.instantiateStreaming(res, {})
    : await WebAssembly.instantiate(await res.arrayBuffer(), {});
  const x = instance.exports;
  const mem = () => x.memory.buffer;
  const out = (n) => Array.from(new Int32Array(mem(), x.hw_out(), Math.max(0, n)));
  const enc = new TextEncoder();

  return {
    /** Load one level block. Returns false if the text is not a valid level. */
    load(text) {
      const bytes = enc.encode(text);
      const ptr = x.hw_alloc(bytes.length);
      new Uint8Array(mem(), ptr, bytes.length).set(bytes);
      return x.hw_load(bytes.length) === 0;
    },
    get w() { return x.hw_w(); },
    get h() { return x.hw_h(); },
    get par() { return x.hw_par(); },
    get nectar() { return x.hw_nectar(); },
    get moves() { return x.hw_moves(); },
    get status() { return x.hw_status(); },
    /** { exists, honey } */
    cell(i) { const f = x.hw_cell(i); return { exists: !!(f & 1), honey: !!(f & 2) }; },
    piece(i) { return x.hw_piece(i); },
    /** [{ to, fly }] */
    targets(from) { return out(x.hw_targets(from)).map((v) => ({ to: v & 255, fly: !!(v >> 8) })); },
    /** Play a move; returns what happened, in order, for the animation (or null if illegal). */
    play(from, to) { return decode(x.hw_play(from, to)); },
    /** What play() would return, without changing anything. */
    preview(from, to) { return decode(x.hw_preview(from, to)); },
    undo() { return !!x.hw_undo(); },
    restart() { x.hw_restart(); },
    /** Best next move, or null. The solver runs in Rust; budget is in search nodes. */
    hint(budget = 3_000_000) { const v = x.hw_hint(budget); return v < 0 ? null : { from: v >> 8, to: v & 255 }; },
  };

  function decode(n) {
      if (n < 0) return null;
      const v = out(n);
      let k = 0;
      const bee = { from: v[k++], to: v[k++], buzz: !!v[k++] };
      const flips = v.slice(k + 1, k + 1 + v[k]); k += 1 + v[k];
      let wasp = null, waspFlips = [];
      if (v[k++]) {
        wasp = { from: v[k++], to: v[k++], buzz: !!v[k++] };
        waspFlips = v.slice(k + 1, k + 1 + v[k]);
      }
      return { bee, flips, wasp, waspFlips };
  }
}

/** Split levels.txt into blocks with their names (the Rust side does the real parsing). */
export function splitLevels(text) {
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('=')) blocks.push({ name: line.slice(1).trim(), tips: [], text: '' });
    const b = blocks[blocks.length - 1];
    if (!b) continue;
    b.text += line + '\n';
    if (line.startsWith('>')) b.tips.push(line.slice(1).trim());
  }
  return blocks;
}
