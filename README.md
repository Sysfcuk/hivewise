# Hivewise

**Bees vs wasps on a floating honeycomb. Spread your hive, take theirs.**

▶ **[Play on your phone](https://sysfcuk.github.io/hivewise/)**: open it in Chrome or Safari and use "Add to Home Screen" to install it.

Hivewise is a head-to-head hex strategy game for phones, in full 3D. The rules and the computer
opponent are written in Rust and compiled to WebAssembly; the 3D world is Three.js (WebGL). There
is no build step for the web side and nothing to install beyond Rust.

## Play

```powershell
.\build.ps1          # tests, then the WASM build
python serve.py      # http://localhost:8130
```

On a phone on the same Wi-Fi, open `http://<your-pc's-ip>:8130`.

## Rules

- Bees and wasps take turns; bees go first. Tap one of your pieces, then a glowing cell.
- **Buzz** (green ring, next door): your piece hops over and leaves a copy behind.
- **Fly** (teal ring, two cells away): it flies there and leaves its old cell empty.
- Every enemy piece **touching the cell you land on** switches to your side.
- If the side to move can't move, the game ends and every empty cell goes to the other side.
  The game also ends when the board is full or one side is wiped out. **Most cells wins.**

Play the computer (Easy, Medium, Hard or Expert, as bees or wasps) or a friend on the same phone.
There are four boards: **Classic** (three gaps in the middle), **Quick** (small and fast), **Open**
(no gaps) and **Flower** (six gaps like petals). Undo is free, and Hint asks the AI for a good move.

## How it's built

| Part | What it does |
| --- | --- |
| `src/core.rs` | Rules, boards, and the AI: alpha-beta search with iterative deepening and a node budget per difficulty. Positions are two `u128` bitmasks, so they're cheap to copy. |
| `src/lib.rs` | The WebAssembly interface: plain `extern "C"` functions and one `i32` output buffer. No wasm-bindgen. |
| `src/bin/selfplay.rs` | Plays the difficulty levels against each other on every board, to check each is stronger than the one below and fast enough. |
| `web/engine.js` | Loads `hivewise.wasm`, wraps the exports, and runs the AI in a Web Worker (`ai.worker.js`) so the animation never stutters while it thinks. |
| `web/scene.js` | The 3D world: a floating wax-and-rock island over a meadow, sky, sun and shadows, and every animation (flights, flips, end-of-game fill, celebrations). Cells, bodies, wings and rings are instanced meshes, so the whole board is a handful of draw calls. |
| `web/world.js` | Everything around the board: floating islands (one with the bees' straw hive, one with a tree holding the wasps' paper nest), flowers on the rim, trees and a pond on the meadow below, light shafts and drifting pollen. |
| `web/swarm.js` | A flock of little bees (boids: separation, alignment, cohesion) that loops around the board, sweeps over big captures and circles the winners. |
| `web/models.js` | The bee and wasp, built from primitives in code with their stripes and faces baked into vertex colours. |
| `web/main.js` | Screens, turns, input, undo, hints, sound (a tiny synth, no audio files) and saved settings. |
| `web/vendor/three/` | Three.js r170, the few modules the game uses. |

Tap during an animation to fast-forward it. Drag to turn and tilt the board, pinch or scroll to zoom
out and see the world around it. The title screen plays a live game between two AIs on a random board.

### Graphics

- **Fuzzy bees:** shell-texturing fur, with each bee's body repeated in a few slightly larger layers
  that a shader cuts into strands, sparser towards the tips. Wasps are glossy, with a clear coat.
- **Iridescent wings:** thin-film interference (soap-bubble colours) on every wing.
- **Swarm:** boids flocking, kept off the playing area so pieces stay clear.
- **Tilt-shift:** a two-pass blur above and below the board gives it the look of a photographed
  miniature. If frames run slow on a phone, the game turns the blur off and lowers the resolution.

### Testing

`.\build.ps1 -SelfPlay` also runs the AI benchmark. While `serve.py` is running, the page can save
full-resolution screenshots of the 3D canvas to `shots/`: in the console,
`hivewise.view.snapshot().then((b) => fetch('/__shot?name=x.png', { method: 'POST', body: b }))`.
