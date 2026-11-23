//! Hivewise rules, level format and solver. Pure Rust, shared by the WASM build and the native verifier.
//!
//! Rules
//! - Bees move to an empty cell one step away (the bee *buzzes* there and leaves a copy behind)
//!   or two steps away (the bee *flies* there; no copy).
//! - Wherever a bee lands, every flower and wasp touching that cell turns into a bee.
//! - A piece standing on honey is stuck: it can't move, but it can still be turned.
//! - After each bee move the wasps answer, predictably: of all wasp moves, they make the one that
//!   turns the most bees and flowers into wasps (buzzing beats flying on a tie, then the lowest cell
//!   number). If no wasp move would take anything, the wasps rest.
//! - Win: no flowers and no wasps left. Every level has a nectar budget (moves).
//!
//! Board: up to 128 cells, rows in "odd-r" layout (odd rows shifted half a cell right),
//! stored as u128 bitmasks so the solver can hash and copy states cheaply.

use std::collections::HashMap;

pub type Mask = u128;
pub const MAX_CELLS: usize = 128;

#[inline]
pub fn bit(i: usize) -> Mask { 1u128 << i }

pub fn cells(mut m: Mask) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if m == 0 { return None; }
        let i = m.trailing_zeros() as usize;
        m &= m - 1;
        Some(i)
    })
}

#[derive(Clone, Debug)]
pub struct Board {
    pub w: usize,
    pub h: usize,
    pub valid: Mask,
    pub honey: Mask,
    pub ring1: Vec<Mask>,
    pub ring2: Vec<Mask>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct State {
    pub bees: Mask,
    pub flowers: Mask,
    pub wasps: Mask,
}

impl State {
    pub fn occupied(&self) -> Mask { self.bees | self.flowers | self.wasps }
    pub fn targets_left(&self) -> u32 { (self.flowers | self.wasps).count_ones() }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Move { pub from: u8, pub to: u8, pub clone: bool }

#[derive(Clone, Debug, Default)]
pub struct Outcome {
    pub bee: Option<Move>,
    pub flips: Vec<u8>,
    pub wasp: Option<Move>,
    pub wasp_flips: Vec<u8>,
}

fn cube(i: usize, w: usize) -> (i32, i32, i32) {
    let (c, r) = ((i % w) as i32, (i / w) as i32);
    let x = c - (r - (r & 1)) / 2;
    let z = r;
    (x, -x - z, z)
}

pub fn hex_dist(a: usize, b: usize, w: usize) -> i32 {
    let (ax, ay, az) = cube(a, w);
    let (bx, by, bz) = cube(b, w);
    (ax - bx).abs().max((ay - by).abs()).max((az - bz).abs())
}

impl Board {
    pub fn new(w: usize, h: usize, valid: Mask, honey: Mask) -> Board {
        let n = w * h;
        let mut ring1 = vec![0; n];
        let mut ring2 = vec![0; n];
        for a in cells(valid) {
            for b in cells(valid) {
                match hex_dist(a, b, w) {
                    1 => ring1[a] |= bit(b),
                    2 => ring2[a] |= bit(b),
                    _ => {}
                }
            }
        }
        Board { w, h, valid, honey, ring1, ring2 }
    }

    pub fn empty(&self, s: &State) -> Mask { self.valid & !s.occupied() }

    /// Bee moves. Buzzes to the same cell all give the same position, so each target appears once.
    pub fn bee_moves(&self, s: &State) -> Vec<Move> {
        let empty = self.empty(s);
        let mut out = Vec::new();
        let mut buzzed: Mask = 0;
        for f in cells(s.bees & !self.honey) {
            for t in cells(self.ring1[f] & empty & !buzzed) {
                out.push(Move { from: f as u8, to: t as u8, clone: true });
                buzzed |= bit(t);
            }
            for t in cells(self.ring2[f] & empty) {
                out.push(Move { from: f as u8, to: t as u8, clone: false });
            }
        }
        out
    }

    /// Every legal destination for one bee (used by the UI).
    pub fn targets_from(&self, s: &State, from: usize) -> Vec<Move> {
        if s.bees & bit(from) == 0 || self.honey & bit(from) != 0 { return vec![]; }
        let empty = self.empty(s);
        let mut out: Vec<Move> = cells(self.ring1[from] & empty).map(|t| Move { from: from as u8, to: t as u8, clone: true }).collect();
        out.extend(cells(self.ring2[from] & empty).map(|t| Move { from: from as u8, to: t as u8, clone: false }));
        out
    }

    pub fn is_legal(&self, s: &State, m: Move) -> bool {
        let (f, t) = (m.from as usize, m.to as usize);
        if f >= MAX_CELLS || t >= MAX_CELLS { return false; }
        if s.bees & bit(f) == 0 || self.honey & bit(f) != 0 || self.empty(s) & bit(t) == 0 { return false; }
        let d = hex_dist(f, t, self.w);
        d == 1 || d == 2
    }

    fn apply_bee(&self, s: &State, m: Move) -> (State, Mask) {
        let (f, t) = (m.from as usize, m.to as usize);
        let mut n = *s;
        if hex_dist(f, t, self.w) == 2 { n.bees &= !bit(f); }
        n.bees |= bit(t);
        let flips = self.ring1[t] & (n.flowers | n.wasps);
        n.bees |= flips;
        n.flowers &= !flips;
        n.wasps &= !flips;
        (n, flips)
    }

    /// The wasps' reply, or None when they rest.
    pub fn wasp_move(&self, s: &State) -> Option<(Move, Mask)> {
        let empty = self.empty(s);
        let prey = s.bees | s.flowers;
        let mut best: Option<(u32, Move, Mask)> = None;
        for f in cells(s.wasps & !self.honey) {
            for (ring, clone) in [(self.ring1[f], true), (self.ring2[f], false)] {
                for t in cells(ring & empty) {
                    let flips = self.ring1[t] & prey;
                    let n = flips.count_ones();
                    if n == 0 { continue; }
                    let score = n * 2 + clone as u32;
                    if best.map_or(true, |(b, _, _)| score > b) {
                        best = Some((score, Move { from: f as u8, to: t as u8, clone }, flips));
                    }
                }
            }
        }
        best.map(|(_, m, flips)| (m, flips))
    }

    fn apply_wasp(&self, s: &State, m: Move, flips: Mask) -> State {
        let mut n = *s;
        if !m.clone { n.wasps &= !bit(m.from as usize); }
        n.wasps |= bit(m.to as usize) | flips;
        n.bees &= !flips;
        n.flowers &= !flips;
        n
    }

    /// One full turn: the bee move, then the wasps' answer.
    pub fn play(&self, s: &State, m: Move) -> (State, Outcome) {
        let (mut n, flips) = self.apply_bee(s, m);
        let mut out = Outcome { bee: Some(m), flips: cells(flips).map(|c| c as u8).collect(), ..Default::default() };
        if n.wasps != 0 && n.flowers | n.wasps != 0 {
            if let Some((wm, wf)) = self.wasp_move(&n) {
                n = self.apply_wasp(&n, wm, wf);
                out.wasp = Some(wm);
                out.wasp_flips = cells(wf).map(|c| c as u8).collect();
            }
        }
        (n, out)
    }

    pub fn won(&self, s: &State) -> bool { s.flowers == 0 && s.wasps == 0 }
}

// ---------------------------------------------------------------- levels

#[derive(Clone, Debug)]
pub struct Level {
    pub name: String,
    pub tip: String,
    pub par: Option<u32>,
    pub board: Board,
    pub start: State,
}

/// One level block:
/// ```text
/// = First Flight
/// > Tap your bee, then a glowing cell.
/// par 1
/// | B . F
/// |  . . .
/// ```
/// Cells: `-` no cell, `.` empty, `o` honey, `B` bee, `F` flower, `W` wasp.
/// Append `o` to a piece (`Bo`, `Fo`, `Wo`) to put it on honey. Odd rows sit half a cell right.
pub fn parse_level(text: &str) -> Result<Level, String> {
    let mut name = String::new();
    let mut tip = String::new();
    let mut par = None;
    let mut rows: Vec<Vec<String>> = Vec::new();
    for line in text.lines() {
        let l = line.trim_end();
        if let Some(r) = l.strip_prefix('=') { name = r.trim().to_string(); }
        else if let Some(r) = l.strip_prefix('>') { if !tip.is_empty() { tip.push(' '); } tip.push_str(r.trim()); }
        else if let Some(r) = l.trim_start().strip_prefix("par ") { par = r.trim().parse().ok(); }
        else if let Some(r) = l.trim_start().strip_prefix('|') { rows.push(r.split_whitespace().map(String::from).collect()); }
    }
    if rows.is_empty() { return Err(format!("level '{name}' has no rows")); }
    let h = rows.len();
    let w = rows.iter().map(|r| r.len()).max().unwrap();
    if w * h > MAX_CELLS { return Err(format!("level '{name}' is too big ({w}x{h})")); }
    let (mut valid, mut honey) = (0, 0);
    let mut s = State::default();
    for (r, row) in rows.iter().enumerate() {
        for (c, tok) in row.iter().enumerate() {
            let i = r * w + c;
            let (piece, on_honey) = match tok.as_str() {
                "-" => continue,
                "." => (None, false),
                "o" => (None, true),
                t => {
                    let p = t.chars().next().unwrap();
                    if !matches!(p, 'B' | 'F' | 'W') || (t.len() > 1 && &t[1..] != "o") {
                        return Err(format!("level '{name}': unknown cell '{t}'"));
                    }
                    (Some(p), t.len() > 1)
                }
            };
            valid |= bit(i);
            if on_honey { honey |= bit(i); }
            match piece {
                Some('B') => s.bees |= bit(i),
                Some('F') => s.flowers |= bit(i),
                Some('W') => s.wasps |= bit(i),
                _ => {}
            }
        }
    }
    Ok(Level { name, tip, par, board: Board::new(w, h, valid, honey), start: s })
}

/// Split a levels file into level blocks (each starts with a `=` line).
pub fn split_levels(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        if line.starts_with('=') { out.push(String::new()); }
        if let Some(b) = out.last_mut() { b.push_str(line); b.push('\n'); }
    }
    out
}

// ---------------------------------------------------------------- solver

pub struct Solver<'a> {
    board: &'a Board,
    seen: HashMap<State, u8>,
    pub nodes: u64,
    budget: u64,
}

impl<'a> Solver<'a> {
    pub fn new(board: &'a Board, budget: u64) -> Self { Solver { board, seen: HashMap::new(), nodes: 0, budget } }

    /// Shortest winning line up to `max_depth` moves (iterative deepening).
    /// Returns Err(()) when the node budget runs out before an answer is known.
    pub fn solve(&mut self, start: &State, max_depth: u32) -> Result<Option<Vec<Move>>, ()> {
        if self.board.won(start) { return Ok(Some(vec![])); }
        for depth in 1..=max_depth {
            self.seen.clear();
            let mut line = Vec::new();
            if self.dfs(start, depth, &mut line)? { return Ok(Some(line)); }
        }
        Ok(None)
    }

    fn dfs(&mut self, s: &State, depth: u32, line: &mut Vec<Move>) -> Result<bool, ()> {
        self.nodes += 1;
        if self.nodes > self.budget { return Err(()); }
        // each move turns at most six neighbours
        if s.targets_left() > 6 * depth { return Ok(false); }
        if let Some(&d) = self.seen.get(s) { if d as u32 >= depth { return Ok(false); } }
        let mut moves: Vec<(i32, Move, State)> = self.board.bee_moves(s).into_iter().map(|m| {
            let (n, _) = self.board.play(s, m);
            let gain = s.targets_left() as i32 - n.targets_left() as i32;
            (gain * 2 + m.clone as i32, m, n)
        }).collect();
        moves.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, m, n) in moves {
            if n.bees == 0 { continue; }
            line.push(m);
            if self.board.won(&n) { return Ok(true); }
            if depth > 1 && self.dfs(&n, depth - 1, line)? { return Ok(true); }
            line.pop();
        }
        self.seen.insert(*s, depth as u8);
        Ok(false)
    }
}

// ---------------------------------------------------------------- game session

pub struct Game {
    pub level: Level,
    pub state: State,
    pub history: Vec<State>,
    pub nectar: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status { Playing = 0, Won = 1, Stuck = 2, OutOfNectar = 3 }

impl Game {
    pub fn new(level: Level) -> Game {
        let nectar = level.par.map_or(99, |p| p + 3);
        Game { state: level.start, level, history: vec![], nectar }
    }
    pub fn moves(&self) -> u32 { self.history.len() as u32 }
    pub fn status(&self) -> Status {
        let b = &self.level.board;
        if b.won(&self.state) { return Status::Won; }
        if self.state.bees == 0 || b.bee_moves(&self.state).is_empty() { return Status::Stuck; }
        if self.moves() >= self.nectar { return Status::OutOfNectar; }
        Status::Playing
    }
    pub fn play(&mut self, m: Move) -> Option<Outcome> {
        if self.status() != Status::Playing || !self.level.board.is_legal(&self.state, m) { return None; }
        let (n, out) = self.level.board.play(&self.state, m);
        self.history.push(self.state);
        self.state = n;
        Some(out)
    }
    /// What a move would do (including the wasps' reply) without playing it.
    pub fn preview(&self, m: Move) -> Option<Outcome> {
        if self.status() != Status::Playing || !self.level.board.is_legal(&self.state, m) { return None; }
        Some(self.level.board.play(&self.state, m).1)
    }
    pub fn undo(&mut self) -> bool {
        match self.history.pop() { Some(s) => { self.state = s; true } None => false }
    }
    pub fn restart(&mut self) { self.state = self.level.start; self.history.clear(); }
    pub fn hint(&self, budget: u64) -> Option<Move> {
        let left = self.nectar.saturating_sub(self.moves()).max(1);
        let mut solver = Solver::new(&self.level.board, budget);
        match solver.solve(&self.state, left.min(12)) {
            Ok(Some(line)) => line.first().copied(),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buzz_clones_and_turns_flowers() {
        let l = parse_level("= t\n| B . F\n").unwrap();
        let mut g = Game::new(l);
        let out = g.play(Move { from: 0, to: 1, clone: true }).unwrap();
        assert_eq!(out.flips, vec![2]);
        assert_eq!(g.state.bees.count_ones(), 3);
        assert_eq!(g.status(), Status::Won);
    }

    #[test]
    fn fly_moves_without_copy() {
        let l = parse_level("= t\n| B . . F\n").unwrap();
        let mut g = Game::new(l);
        g.play(Move { from: 0, to: 2, clone: false }).unwrap();
        assert_eq!(g.state.bees, bit(2) | bit(3));
    }

    #[test]
    fn honey_sticks() {
        let l = parse_level("= t\n| Bo . F\n").unwrap();
        let g = Game::new(l);
        assert!(g.level.board.bee_moves(&g.state).is_empty());
        assert_eq!(g.status(), Status::Stuck);
    }

    #[test]
    fn wasps_strike_when_they_can() {
        // bee at 0, wasp at 4: after the bee buzzes to 1, the wasp buzzes to 2 and takes it back
        let l = parse_level("= t\n| B . . . W\n").unwrap();
        let b = &l.board;
        let (n, out) = b.play(&l.start, Move { from: 0, to: 1, clone: true });
        let wm = out.wasp.expect("wasp should strike");
        assert_eq!(wm.to, 2);
        assert!(n.wasps & bit(1) != 0);
    }

    #[test]
    fn odd_rows_are_offset() {
        // row 0 col 0 touches row 1 col 0 and (odd-r) row 1 col 0 only; row 1 col 0 touches row 0 col 0 and col 1
        let l = parse_level("= t\n| . . .\n|  . . .\n").unwrap();
        assert_eq!(hex_dist(0, 3, 3), 1);
        assert_eq!(hex_dist(1, 3, 3), 1);
        assert_eq!(hex_dist(2, 3, 3), 2);
        assert_eq!(l.board.ring1[3].count_ones(), 3);
    }

    #[test]
    fn solver_finds_shortest() {
        let l = parse_level("= t\n| B . F . . F\n").unwrap();
        let mut s = Solver::new(&l.board, 1_000_000);
        let line = s.solve(&l.start, 6).unwrap().unwrap();
        assert_eq!(line.len(), 2);
    }
}
