# Hivewise

**Spread your hive. Pollinate the meadow. Outwit the wasps.**

▶ **[Play on your phone](https://sysfcuk.github.io/hivewise/)**: open it in Chrome or Safari and use "Add to Home Screen" to install it.

Hivewise is a honeycomb puzzle game for phones. The rules are written in Rust and compiled to
WebAssembly; a thin JavaScript layer handles touch, drawing and sound. There is no build step for the
web side and no dependencies to install beyond Rust.

## Play

```powershell
.\build.ps1          # tests, level check, WASM build
python serve.py      # http://localhost:8130
```

On a phone on the same Wi-Fi, open `http://<your-pc's-ip>:8130`. It installs as an app (PWA) once
it's served over HTTPS, for example from GitHub Pages.

## Rules

- **Buzz:** tap a bee, then a glowing cell next to it. The bee hops there and leaves a copy behind.
- **Fly:** cells two steps away glow with a dashed ring. Flying moves the bee without a copy.
- **Pollinate:** wherever a bee lands, every flower (and wasp) touching that cell joins your hive.
- **Honey:** a bee on a golden honey cell is stuck for good. It can still be won over, but it can't move.
- **Wasps** answer every move, predictably: they make whichever move grabs the most bees and
  flowers (a buzz beats a fly on a tie). If no move would grab anything, they rest.
- **Win** by leaving no flowers and no wasps. Each move costs a drop of nectar; match the level's
  par for three stars. Undo is free, and Hint asks the solver for the best next move.

## How it's built

| Part | What it does |
| --- | --- |
| `src/core.rs` | Rules, level parser, iterative-deepening solver. The board is a set of `u128` bitmasks (up to 128 cells), so positions are cheap to copy and hash. |
| `src/lib.rs` | The WebAssembly interface: plain `extern "C"` functions, one byte buffer in, one `i32` buffer out. No wasm-bindgen. |
| `src/bin/verify.rs` | Solves every level, reports its shortest solution and (with `--write`) stores it as the par. |
| `web/levels.txt` | The levels, as text (format at the top of the file). |
| `web/engine.js` | Loads `hivewise.wasm` and wraps the exports. |
| `web/main.js` | Screens, input, the animation clock, sound, saved progress. Also a Canvas 2D board renderer used when WebGL isn't available (or with `?canvas` in the URL). |
| `web/stage.js` | The WebGL board renderer (PixiJS, vendored in `web/vendor/`): territory glow, flight shadows, the capture chain, wasp warnings. |
| `web/meadow.js` | The animated background: seasons, parallax hills, sun rays, drifting blossom, leaves or fireflies. |
| `web/art.js` | All the art (cells, bees, flowers, wasps, meadow), drawn in code and painted into textures at the screen's resolution. |

### Graphics that help you play

- **Territory glow:** cells your hive owns glow warm honey, and wasp ground glows faintly red, so the board's balance reads at a glance.
- **Flight shadows:** a flying bee's shadow shrinks with height. Buzzes skim low and flights arc high, so the two moves look different.
- **Capture chain:** flowers bloom open into bees with a burst of petals, notes climb with each one, and a "+N" rises from where you landed.
- **Wasp warnings:** a red **!** marks any move the wasps can punish. Press and hold it (or hover with a mouse) to see the wasp's strike line and the bees it would take; slide off to cancel.
- **Honey and wax:** a WebGL shader gives honey slow ripples, a sliding sheen and glints; wax cells glow softly in the middle. A bee that lands in honey sinks in with a splash.
- **Reactions:** bees turn to look at the bee you pick up, cheer with little hops after a big capture, and flinch after a wasp strike. Badly outnumbered wasps sulk.
- **Winning:** honey pours into every cell your hive owns, rippling out from your last landing, while petals drift down.
- **The meadow:** each chapter has its own season (spring blossom, summer pollen, autumn leaves, evening fireflies). The hills shift with the phone's tilt (or the mouse); the board never moves.
- **The hive map:** solved levels fill with honey, three-star levels shimmer, a meter shows how full your hive is, and a bee waits by the next level.
- **Never in the way:** tap during an animation to fast-forward it. "Reduce motion" on the phone shortens every animation.

### Making levels

Edit `web/levels.txt`, then run `.\build.ps1 -WritePar`. The verifier fails the build if any level
can't be solved, and writes each level's par (its shortest solution).

```text
= Level name
> A tip shown when the level starts.
| - F . -        -  no cell    .  empty    o  honey
|  B . F         B  bee        F  flower   W  wasp     (Bo, Fo, Wo: on honey)
| - F . -        odd rows sit half a cell to the right
```
