//! Level verifier: solves every level in web/levels.txt, reports the shortest solution,
//! and (with --write) stores it as each level's `par` line.
//!
//!   cargo run --release --bin verify            check
//!   cargo run --release --bin verify -- --write  check and update pars

use hivewise::core::{parse_level, split_levels, Solver};
use std::fs;

fn main() {
    let path = "web/levels.txt";
    let write = std::env::args().any(|a| a == "--write");
    let text = fs::read_to_string(path).expect("read web/levels.txt");
    let mut out = String::new();
    let mut bad = 0;
    for (k, block) in split_levels(&text).iter().enumerate() {
        let lvl = match parse_level(block) {
            Ok(l) => l,
            Err(e) => { println!("{:>2}  ERROR {e}", k + 1); bad += 1; out.push_str(block); continue; }
        };
        let mut s = Solver::new(&lvl.board, 60_000_000);
        let t = std::time::Instant::now();
        let res = s.solve(&lvl.start, 14);
        let ms = t.elapsed().as_millis();
        let (par, note) = match &res {
            Ok(Some(line)) => (Some(line.len() as u32), line.iter().map(|m| format!("{}{}{}", m.from, if m.clone { "-" } else { "~" }, m.to)).collect::<Vec<_>>().join(" ")),
            Ok(None) => (None, "UNSOLVABLE within 14".into()),
            Err(()) => (None, "node budget exceeded".into()),
        };
        if par.is_none() { bad += 1; }
        let flag = match (par, lvl.par) { (Some(p), Some(q)) if p != q => " (par changed)", _ => "" };
        println!("{:>2}  {:<22} par {:>2}  {:>9} nodes {:>6} ms  {}{}", k + 1, lvl.name,
            par.map_or("?".into(), |p| p.to_string()), s.nodes, ms, note, flag);
        // rewrite the par line
        let mut b = String::new();
        let mut placed = false;
        for line in block.lines() {
            if line.trim_start().starts_with("par ") { continue; }
            if !placed && line.trim_start().starts_with('|') {
                if let Some(p) = par { b.push_str(&format!("par {p}\n")); }
                placed = true;
            }
            b.push_str(line);
            b.push('\n');
        }
        out.push_str(&b);
    }
    // keep anything before the first level (the file header)
    let header: String = text.lines().take_while(|l| !l.starts_with('=')).map(|l| format!("{l}\n")).collect();
    if write { fs::write(path, header + &out).expect("write levels"); println!("pars written to {path}"); }
    if bad > 0 { std::process::exit(1); }
}
