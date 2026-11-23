//! WebAssembly surface for Hivewise. No wasm-bindgen: a handful of plain exported functions,
//! one input byte buffer (level text in) and one i32 buffer (results out). See web/engine.js.

pub mod core;

use crate::core::{bit, Game, Move, Status};
use std::cell::RefCell;

thread_local! {
    static GAME: RefCell<Option<Game>> = const { RefCell::new(None) };
    static INBUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUT: RefCell<Vec<i32>> = const { RefCell::new(Vec::new()) };
}

fn with_game<R>(dflt: R, f: impl FnOnce(&mut Game) -> R) -> R {
    GAME.with(|g| g.borrow_mut().as_mut().map_or(dflt, f))
}

fn set_out(v: Vec<i32>) -> i32 {
    let n = v.len() as i32;
    OUT.with(|o| *o.borrow_mut() = v);
    n
}

/// Reserve `len` bytes for the caller to write level text into; returns where.
#[no_mangle]
pub extern "C" fn hw_alloc(len: usize) -> *mut u8 {
    INBUF.with(|b| { let mut b = b.borrow_mut(); b.clear(); b.resize(len, 0); b.as_mut_ptr() })
}

/// Pointer to the latest results (i32s). Re-read after every call: the buffer may move.
#[no_mangle]
pub extern "C" fn hw_out() -> *const i32 { OUT.with(|o| o.borrow().as_ptr()) }

/// Load one level from the input buffer. 0 = ok, -1 = bad level.
#[no_mangle]
pub extern "C" fn hw_load(len: usize) -> i32 {
    let text = INBUF.with(|b| String::from_utf8_lossy(&b.borrow()[..len]).into_owned());
    match core::parse_level(&text) {
        Ok(l) => { GAME.with(|g| *g.borrow_mut() = Some(Game::new(l))); 0 }
        Err(_) => -1,
    }
}

#[no_mangle] pub extern "C" fn hw_w() -> i32 { with_game(0, |g| g.level.board.w as i32) }
#[no_mangle] pub extern "C" fn hw_h() -> i32 { with_game(0, |g| g.level.board.h as i32) }
#[no_mangle] pub extern "C" fn hw_par() -> i32 { with_game(0, |g| g.level.par.unwrap_or(0) as i32) }
#[no_mangle] pub extern "C" fn hw_nectar() -> i32 { with_game(0, |g| g.nectar as i32) }
#[no_mangle] pub extern "C" fn hw_moves() -> i32 { with_game(0, |g| g.moves() as i32) }
#[no_mangle] pub extern "C" fn hw_status() -> i32 { with_game(0, |g| g.status() as i32) }

/// Cell flags: 1 = exists, 2 = honey.
#[no_mangle]
pub extern "C" fn hw_cell(i: usize) -> i32 {
    with_game(0, |g| {
        let b = &g.level.board;
        if i >= 128 { return 0; }
        (b.valid & bit(i) != 0) as i32 | (((b.honey & bit(i) != 0) as i32) << 1)
    })
}

/// What stands on a cell: 0 nothing, 1 bee, 2 flower, 3 wasp.
#[no_mangle]
pub extern "C" fn hw_piece(i: usize) -> i32 {
    with_game(0, |g| {
        if i >= 128 { return 0; }
        let s = &g.state;
        if s.bees & bit(i) != 0 { 1 } else if s.flowers & bit(i) != 0 { 2 } else if s.wasps & bit(i) != 0 { 3 } else { 0 }
    })
}

/// Legal destinations for the bee on `from`. Out: one i32 per target, `to | fly << 8`.
#[no_mangle]
pub extern "C" fn hw_targets(from: usize) -> i32 {
    let v = with_game(vec![], |g| {
        if g.status() != Status::Playing { return vec![]; }
        g.level.board.targets_from(&g.state, from).iter().map(|m| m.to as i32 | ((!m.clone as i32) << 8)).collect()
    });
    set_out(v)
}

/// Play a bee move. Returns the number of i32s written, or -1 if illegal. Out:
/// `[from, to, buzz, nflips, ...flips, wasp?, wfrom, wto, wbuzz, nwflips, ...wflips]`
#[no_mangle]
pub extern "C" fn hw_play(from: usize, to: usize) -> i32 {
    let res = with_game(None, |g| {
        let clone = core::hex_dist(from, to, g.level.board.w) == 1;
        g.play(Move { from: from as u8, to: to as u8, clone })
    });
    write_outcome(res)
}

/// Same as hw_play, but only predicts: nothing changes. Used for the wasp warnings.
#[no_mangle]
pub extern "C" fn hw_preview(from: usize, to: usize) -> i32 {
    let res = with_game(None, |g| {
        let clone = core::hex_dist(from, to, g.level.board.w) == 1;
        g.preview(Move { from: from as u8, to: to as u8, clone })
    });
    write_outcome(res)
}

fn write_outcome(res: Option<core::Outcome>) -> i32 {
    let Some(o) = res else { return -1 };
    let m = o.bee.unwrap();
    let mut v = vec![m.from as i32, m.to as i32, m.clone as i32, o.flips.len() as i32];
    v.extend(o.flips.iter().map(|&c| c as i32));
    match o.wasp {
        Some(w) => {
            v.extend([1, w.from as i32, w.to as i32, w.clone as i32, o.wasp_flips.len() as i32]);
            v.extend(o.wasp_flips.iter().map(|&c| c as i32));
        }
        None => v.push(0),
    }
    set_out(v)
}

#[no_mangle] pub extern "C" fn hw_undo() -> i32 { with_game(0, |g| g.undo() as i32) }
#[no_mangle] pub extern "C" fn hw_restart() { with_game((), |g| g.restart()) }

/// Best next move from here: `from << 8 | to`, or -1 if none was found within `budget` nodes.
#[no_mangle]
pub extern "C" fn hw_hint(budget: u32) -> i32 {
    with_game(-1, |g| g.hint(budget as u64).map_or(-1, |m| (m.from as i32) << 8 | m.to as i32))
}
