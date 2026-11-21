// Runs the shared test vectors in spec/vectors/ (the same files the Dart, TypeScript and
// PHP packages run). Vector offsets are UTF-16 code units (SPEC §0); this crate returns
// UTF-8 byte offsets, so the harness converts them here, not in the library.
use nass::*;
use serde_json::Value;
use std::path::PathBuf;

fn vectors(name: &str) -> Vec<Value> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../spec/vectors")
        .join(format!("{name}.json"));
    let doc: Value =
        serde_json::from_str(&std::fs::read_to_string(p).expect("vector file")).expect("json");
    doc["cases"].as_array().expect("cases").clone()
}

fn s<'a>(c: &'a Value, k: &str) -> &'a str {
    c[k].as_str()
        .unwrap_or_else(|| panic!("{}: missing {k}", c["id"]))
}

fn level_of(v: &Value) -> Level {
    match v.as_str().unwrap_or("search") {
        "clean" => Level::Clean,
        "loose" => Level::Loose,
        _ => Level::Search,
    }
}
fn honorifics_of(v: &Value) -> Honorifics {
    match v.as_str().unwrap_or("keep") {
        "strip" => Honorifics::Strip,
        _ => Honorifics::Keep,
    }
}

/// UTF-16 offset of every byte offset of `text` (index = byte offset, up to `text.len()`).
fn utf16_table(text: &str) -> Vec<usize> {
    let mut t = vec![usize::MAX; text.len() + 1];
    let mut u = 0;
    for (b, ch) in text.char_indices() {
        t[b] = u;
        u += ch.len_utf16();
    }
    t[text.len()] = u;
    t
}

/// Collects failures and reports them all at the end, with id, expected and actual values.
struct Report {
    file: &'static str,
    total: usize,
    failures: Vec<String>,
}
impl Report {
    fn new(file: &'static str) -> Self {
        Report {
            file,
            total: 0,
            failures: Vec::new(),
        }
    }
    fn check<T: PartialEq + std::fmt::Debug>(&mut self, id: &Value, expected: T, got: T) {
        if expected != got {
            self.failures.push(format!(
                "{id}\n    expected: {expected:?}\n    got:      {got:?}"
            ));
        }
    }
    fn finish(self) {
        let passed = self.total - self.failures.len();
        eprintln!("{}: {passed}/{} cases pass", self.file, self.total);
        assert!(
            self.failures.is_empty(),
            "{}: {} of {} cases fail:\n{}",
            self.file,
            self.failures.len(),
            self.total,
            self.failures.join("\n")
        );
    }
}

#[test]
fn normalize_vectors() {
    let mut r = Report::new("normalize.json");
    for c in vectors("normalize") {
        r.total += 1;
        let o = Options {
            level: level_of(&c["level"]),
            honorifics: honorifics_of(&c["options"]["honorifics"]),
        };
        let got = normalize(s(&c, "input"), &o);
        r.check(&c["id"], s(&c, "expected").to_string(), got.clone());
        let mut buf = String::from("stale");
        normalize_into(s(&c, "input"), &o, &mut buf);
        r.check(&c["id"], got, buf);
    }
    r.finish();
}

#[test]
fn offsets_vectors() {
    let mut r = Report::new("offsets.json");
    for c in vectors("offsets") {
        r.total += 1;
        let input = s(&c, "input");
        let m = normalize_with_map(input, &Options::level(level_of(&c["level"])));
        let u = utf16_table(input);
        let (mut start, mut end) = (Vec::new(), Vec::new());
        for (b, ch) in m.text.char_indices() {
            for _ in 0..ch.len_utf16() {
                start.push(u[m.start[b]] as u64);
                end.push(u[m.end[b]] as u64);
            }
        }
        let ints = |k: &str| -> Vec<u64> {
            c[k].as_array()
                .expect(k)
                .iter()
                .map(|x| x.as_u64().expect("int"))
                .collect()
        };
        r.check(&c["id"], s(&c, "expected").to_string(), m.text.clone());
        r.check(&c["id"], ints("start"), start);
        r.check(&c["id"], ints("end"), end);
        assert_eq!(m.start.len(), m.text.len());
        assert_eq!(m.end.len(), m.text.len());
    }
    r.finish();
}

#[test]
fn search_vectors() {
    let mut r = Report::new("search.json");
    for c in vectors("search") {
        r.total += 1;
        let o = &c["options"];
        let so = SearchOptions {
            level: level_of(&o["level"]),
            honorifics: honorifics_of(&o["honorifics"]),
            match_mode: match o["matchMode"].as_str().unwrap_or("phrase") {
                "allWords" => MatchMode::AllWords,
                "anyWord" => MatchMode::AnyWord,
                _ => MatchMode::Phrase,
            },
            whole_word: o["wholeWord"].as_bool().unwrap_or(false),
        };
        let hay = s(&c, "haystack");
        let needle = s(&c, "needle");
        let u = utf16_table(hay);
        let got: Vec<(usize, usize, String)> = find_all(hay, needle, &so)
            .into_iter()
            .map(|m| {
                assert_eq!(&hay[m.start..m.end], m.text);
                (u[m.start], u[m.end], m.text)
            })
            .collect();
        let exp: Vec<(usize, usize, String)> = c["expected"]
            .as_array()
            .expect("expected")
            .iter()
            .map(|m| {
                (
                    m["start"].as_u64().unwrap() as usize,
                    m["end"].as_u64().unwrap() as usize,
                    m["text"].as_str().unwrap().to_string(),
                )
            })
            .collect();
        r.check(&c["id"], !exp.is_empty(), contains(hay, needle, &so));
        // highlight wraps exactly the matches.
        let hl = highlight(
            hay,
            needle,
            &HighlightOptions {
                search: so,
                ..HighlightOptions::default()
            },
        );
        let mut want = String::new();
        let mut pos = 0;
        for (a, b, _) in &exp {
            let (a, b) = (
                utf16_to_byte_offset(hay, *a).unwrap(),
                utf16_to_byte_offset(hay, *b).unwrap(),
            );
            want.push_str(&hay[pos..a]);
            want.push_str("<mark>");
            want.push_str(&hay[a..b]);
            want.push_str("</mark>");
            pos = b;
        }
        want.push_str(&hay[pos..]);
        r.check(&c["id"], want, hl);
        r.check(&c["id"], exp, got);
    }
    r.finish();
}

#[test]
fn names_vectors() {
    let mut r = Report::new("names.json");
    for c in vectors("names") {
        r.total += 1;
        if let Some(e) = c["expected"].as_str() {
            r.check(&c["id"], e.to_string(), name_key(s(&c, "input")));
        }
        let keys = |k: &str| -> Vec<String> {
            c[k].as_array().map_or(Vec::new(), |a| {
                a.iter().map(|x| name_key(x.as_str().unwrap())).collect()
            })
        };
        let same = keys("same");
        if let Some(first) = same.first() {
            r.check(&c["id"], vec![first.clone(); same.len()], same.clone());
        }
        let diff = keys("different");
        for i in 0..diff.len() {
            for j in i + 1..diff.len() {
                if diff[i] == diff[j] {
                    r.failures.push(format!(
                        "{}: «{}» is the key of two names that must differ",
                        c["id"], diff[i]
                    ));
                }
            }
        }
    }
    r.finish();
}

#[cfg(feature = "isnad")]
#[test]
fn isnad_vectors() {
    use nass::isnad::split_isnad;
    let mut r = Report::new("isnad.json");
    let (mut dev, mut test) = ((0, 0), (0, 0));
    for c in vectors("isnad") {
        r.total += 1;
        let input = s(&c, "input");
        let got = split_isnad(input);
        let u = utf16_table(input);
        let start: i64 = if got.isnad.is_empty() {
            -1
        } else {
            u[input.len() - got.matn.len()] as i64
        };
        let reference = &c["reference"];
        r.check(&c["id"], reference["matnStart"].as_i64().unwrap(), start);
        r.check(
            &c["id"],
            reference["confidence"].as_f64().unwrap(),
            got.confidence,
        );
        let exp_narr: Vec<(String, String)> = reference["narrators"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| {
                (
                    n["name"].as_str().unwrap().to_string(),
                    n["form"].as_str().unwrap().to_string(),
                )
            })
            .collect();
        let got_narr: Vec<(String, String)> = got
            .narrators
            .iter()
            .map(|n| (n.name.clone(), n.form.clone()))
            .collect();
        r.check(&c["id"], exp_narr, got_narr);
        if start < 0 {
            r.check(&c["id"], input.to_string(), got.matn.clone());
        } else {
            r.check(
                &c["id"],
                input.to_string(),
                format!("{}{}", &input[..input.len() - got.matn.len()], got.matn),
            );
        }
        let good = c["acceptMatnStart"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x.as_i64() == Some(start));
        let g = if c["split"] == "test" {
            &mut test
        } else {
            &mut dev
        };
        g.1 += 1;
        if good {
            g.0 += 1;
        }
    }
    eprintln!(
        "isnad accuracy: dev {}/{}, test {}/{}",
        dev.0, dev.1, test.0, test.1
    );
    assert!(dev.0 as f64 / dev.1 as f64 >= 0.95);
    assert!(test.0 as f64 / test.1 as f64 >= 0.85);
    r.finish();
}

#[cfg(feature = "isnad")]
#[test]
fn isnad_edge_cases() {
    use nass::isnad::split_isnad;
    for t in ["الحمد لله رب العالمين", "", "حدثنا"] {
        let r = split_isnad(t);
        assert_eq!(
            (
                r.isnad.as_str(),
                r.matn.as_str(),
                r.confidence,
                r.narrators.len()
            ),
            ("", t, 0.0, 0)
        );
    }
    let t = "حَدَّثَنَا مَالِكٌ عَنْ نَافِعٍ عَنِ ابْنِ عُمَرَ أَنَّ رَسُولَ اللَّهِ ﷺ قَالَ لَا يَبِعْ بَعْضُكُمْ";
    let r = split_isnad(t);
    assert_eq!(r.matn, "لَا يَبِعْ بَعْضُكُمْ");
    let names: Vec<&str> = r.narrators.iter().map(|n| n.name.as_str()).collect();
    assert_eq!(names, ["مَالِكٌ", "نَافِعٍ", "ابْنِ عُمَرَ"]);
}
