// Adapter for AbdeldjalilChougui/arabic-normalize (Rust crate, used directly rather than
// through its Python bindings, which need pyo3 and maturin).
// Built by tools/compare/run.mjs into a throwaway crate that depends on the clone by path.
// Protocol: see tools/compare/README.md (one tab-separated request per line on stdin).
//
// Mapping of nass levels to this crate's Config:
//   clean  -> Config::none() + tatweel + bidi_marks
//   search -> Config::default() (diacritics, tatweel, alef, bidi_marks)
//             + alef_maqsura + persian + Digits::Western; ta_marbuta and hamza stay off
//   loose  -> Config::search() (everything on, including ta_marbuta and hamza)
//   honorifics: "strip"  -> unsupported (no such option)
// Search: the crate has no find/contains function (only normalize, tokenize and
// search_terms, which stems), so every search case is unsupported.

use arabic_normalize::{Builder, Config, Digits, Normalizer};
use std::io::{self, BufRead, Write};

fn unhex(s: &str) -> String {
    let bytes: Vec<u8> = (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("hex"))
        .collect();
    String::from_utf8(bytes).expect("utf8")
}

fn hex(s: &str) -> String {
    s.bytes().map(|b| format!("{:02x}", b)).collect()
}

fn main() {
    let clean = Builder::from_config(Config::none()).tatweel(true).bidi_marks(true).build();
    let search = Normalizer::builder()
        .alef_maqsura(true)
        .persian(true)
        .digits(Digits::Western)
        .build();
    let loose = Normalizer::search();

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    for line in stdin.lock().lines() {
        let line = line.expect("stdin");
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split('\t').collect();
        match f[0] {
            "N" => {
                let (id, level, honorifics, input) = (f[1], f[2], f[3], f[4]);
                if honorifics == "strip" {
                    writeln!(out, "{id}\tU\tno option to remove written honorific phrases").unwrap();
                    continue;
                }
                let n = match level {
                    "clean" => &clean,
                    "search" => &search,
                    "loose" => &loose,
                    other => panic!("unknown level {other}"),
                };
                writeln!(out, "{id}\tN\t{}", hex(&n.normalize(&unhex(input)))).unwrap();
            }
            "S" => {
                writeln!(out, "{}\tU\tno search or find function", f[1]).unwrap();
            }
            other => panic!("unknown request {other}"),
        }
    }
}
