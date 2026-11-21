//! Dev tool: answers a batch of JSON requests, like packages/dart/tool/cli.dart, so that
//! tools/*.mjs can compare this crate with the oracle and the other packages.
//! Offsets in responses are UTF-16 code units, the unit of the shared vectors.
//!
//! Usage: cargo run --release --all-features --example cli < requests.json > responses.json
//! Request: {"op": "normalize"|"map"|"findAll"|"nameKey"|"splitIsnad", ...}
use nass::isnad::split_isnad;
use nass::*;
use serde_json::{json, Value};
use std::io::{Read, Write};

fn level(r: &Value) -> Level {
    match r["level"].as_str().unwrap_or("search") {
        "clean" => Level::Clean,
        "loose" => Level::Loose,
        _ => Level::Search,
    }
}
fn honorifics(r: &Value) -> Honorifics {
    match r["honorifics"].as_str().unwrap_or("keep") {
        "strip" => Honorifics::Strip,
        _ => Honorifics::Keep,
    }
}

/// Byte offsets of `text` -> UTF-16 offsets, as a lookup table (index = byte offset).
fn utf16_table(text: &str) -> Vec<usize> {
    let mut t = vec![0; text.len() + 1];
    let mut u = 0;
    for (b, ch) in text.char_indices() {
        t[b] = u;
        u += ch.len_utf16();
    }
    t[text.len()] = u;
    t
}

fn handle(r: &Value) -> Value {
    let opts = Options {
        level: level(r),
        honorifics: honorifics(r),
    };
    let text = r["text"].as_str().unwrap_or("");
    match r["op"].as_str().unwrap_or("") {
        "normalize" => json!(normalize(text, &opts)),
        "map" => {
            let m = normalize_with_map(text, &opts);
            let u = utf16_table(text);
            let (mut start, mut end) = (Vec::new(), Vec::new());
            for (b, ch) in m.text.char_indices() {
                for _ in 0..ch.len_utf16() {
                    start.push(u[m.start[b] as usize]);
                    end.push(u[m.end[b] as usize]);
                }
            }
            json!({"text": m.text, "start": start, "end": end})
        }
        "findAll" => {
            let hay = r["haystack"].as_str().unwrap_or("");
            let so = SearchOptions {
                level: opts.level,
                honorifics: opts.honorifics,
                match_mode: match r["matchMode"].as_str().unwrap_or("phrase") {
                    "allWords" => MatchMode::AllWords,
                    "anyWord" => MatchMode::AnyWord,
                    _ => MatchMode::Phrase,
                },
                whole_word: r["wholeWord"].as_bool().unwrap_or(false),
            };
            let u = utf16_table(hay);
            let ms: Vec<Value> = find_all(hay, r["needle"].as_str().unwrap_or(""), &so)
                .into_iter()
                .map(|m| json!({"start": u[m.start], "end": u[m.end], "text": m.text}))
                .collect();
            json!(ms)
        }
        "nameKey" => json!(name_key(text)),
        "splitIsnad" => {
            let s = split_isnad(text);
            let ns: Vec<Value> = s
                .narrators
                .iter()
                .map(|n| json!({"name": n.name, "form": n.form}))
                .collect();
            json!({"isnad": s.isnad, "matn": s.matn, "confidence": s.confidence, "narrators": ns})
        }
        op => panic!("unknown op {op}"),
    }
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let reqs: Vec<Value> = serde_json::from_str(&input).expect("JSON array of requests");
    let out: Vec<Value> = reqs.iter().map(handle).collect();
    let mut stdout = std::io::stdout().lock();
    stdout
        .write_all(serde_json::to_string(&out).expect("json").as_bytes())
        .expect("stdout");
}
