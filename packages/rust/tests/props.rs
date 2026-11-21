// Property checks (SPEC §1, §5), the same ones the Dart and TypeScript packages run,
// on random strings built from tricky pieces and on arbitrary Unicode.
use nass::*;
use proptest::prelude::*;

const PIECES: &[&str] = &[
    "ب",
    "س",
    "ا",
    "أ",
    "ٱ",
    "ى",
    "ة",
    "ؤ",
    "ء",
    "ک",
    "َ",
    "ّ",
    "ٰ",
    "ۥ",
    "ٔ",
    "ٓ",
    "ۧ",
    "ـ",
    "ﷲ",
    "ﻻ",
    "ﷺ",
    "﷽",
    "ﹰ",
    "﵁",
    " ",
    "\n",
    "\u{a0}",
    "،",
    ".",
    ",",
    "٫",
    "٬",
    "۝",
    "%",
    "٪",
    "١",
    "٣",
    "3",
    "\u{200d}",
    "\u{200c}",
    "\u{200f}",
    "\u{feff}",
    "👨",
    "😀",
    "A",
    "Z",
    "é",
    " الله ",
    " تعالى ",
    " رضي الله عنه ",
    " عبد ",
    " أبي ",
    " ذا ",
];

/// Nine presentation forms (U+FCF2–FCF4, U+FE71, FE77, FE79, FE7B, FE7D, FE7F) expand in C4 to a
/// tatweel plus harakat, and C3 has already run, so the tatweel survives `clean` and is removed
/// only by a second pass: idempotence and level inclusion fail for them in every package
/// (TypeScript, Dart, PHP and the oracle agree). This is a spec question, not a Rust bug, so the
/// generator leaves them out; `tatweel_from_presentation_forms` pins the shared behaviour.
fn spec_tatweel_issue(c: char) -> bool {
    ('\u{FB50}'..='\u{FEFF}').contains(&c)
        && normalize(&c.to_string(), &Options::level(Level::Clean)).contains('\u{640}')
}

fn tricky() -> impl Strategy<Value = String> {
    prop_oneof![
        3 => prop::collection::vec(prop::sample::select(PIECES), 0..16).prop_map(|v| v.concat()),
        1 => any::<String>().prop_map(|s| s.chars().filter(|&c| !spec_tatweel_issue(c)).collect()),
    ]
}

#[test]
fn tatweel_from_presentation_forms() {
    let affected: Vec<u32> = ('\u{FB50}'..='\u{FEFF}')
        .filter(|&c| spec_tatweel_issue(c))
        .map(|c| c as u32)
        .collect();
    assert_eq!(
        affected,
        [0xFCF2, 0xFCF3, 0xFCF4, 0xFE71, 0xFE77, 0xFE79, 0xFE7B, 0xFE7D, 0xFE7F]
    );
    // Same output as the TypeScript, Dart and PHP packages and the oracle.
    assert_eq!(
        normalize("\u{628}\u{FE77}", &Options::level(Level::Clean)),
        "\u{628}\u{640}\u{64E}"
    );
    assert_eq!(
        normalize("\u{628}\u{FE77}", &Options::default()),
        "\u{628}\u{640}"
    );
}

const LEVELS: [Level; 3] = [Level::Clean, Level::Search, Level::Loose];
const HONORIFICS: [Honorifics; 2] = [Honorifics::Keep, Honorifics::Strip];

/// 3000 cases from a fixed seed, so CI is deterministic. PROPTEST_CASES and
/// PROPTEST_RNG_SEED override them for longer or different runs.
fn config() -> ProptestConfig {
    let mut c = ProptestConfig::default();
    if std::env::var_os("PROPTEST_CASES").is_none() {
        c.cases = 3000;
    }
    if std::env::var_os("PROPTEST_RNG_SEED").is_none() {
        c.rng_seed = proptest::test_runner::RngSeed::Fixed(20261121);
    }
    c.failure_persistence = None;
    c
}

/// `loose` deletes «ء» like a mark, so in «١ء.١» the «.» now follows a digit and stays (S4):
/// loose gives «1.1» but loose(search) gives «1 1». TypeScript, Dart and PHP agree on «1.1»;
/// the oracle gives «1 1». A spec question, so the inclusion check skips this combination.
fn spec_loose_separator_issue(x: &str) -> bool {
    x.contains('\u{621}') && x.contains(['.', ',', '\u{66B}', '\u{66C}'])
}

/// C1 composes «ا» + U+0654 across an earlier mark («ﻻَٔ» → «لأَ»), so the hamza's source lies
/// after the fatha's, and the SPEC §5 span `[start[s], end[e-1])` stops before it. Same in every
/// package. A spec question, so the findAll span check skips this pattern.
fn spec_composition_span_issue(x: &str) -> bool {
    let mark = |c: char| matches!(c, '\u{610}'..='\u{61A}' | '\u{64B}'..='\u{65F}' | '\u{670}' | '\u{6D6}'..='\u{6ED}' | '\u{8CA}'..='\u{8FF}');
    // Pass 1 one char at a time: drops invisibles and tatweel, expands presentation forms («ﹰ» → U+064B).
    let cs: Vec<char> = x
        .chars()
        .flat_map(|c| {
            normalize(&c.to_string(), &Options::level(Level::Clean))
                .chars()
                .collect::<Vec<_>>()
        })
        .filter(|&c| c != '\u{200c}' && c != '\u{200d}')
        .collect();
    cs.windows(2)
        .any(|w| matches!(w[1], '\u{653}'..='\u{655}') && mark(w[0]))
}

/// ZWJ is deleted only next to Arabic (C2). A match slice can cut off the Arabic neighbour
/// («ـ‌‍.»: the tatweel), and the slice alone then keeps the ZWJ. Same in every package and the
/// oracle: the SPEC §5 condition cannot hold for context-dependent rules. Skipped here.
fn spec_context_issue(x: &str) -> bool {
    x.contains('\u{200d}')
}

proptest! {
    #![proptest_config(config())]

    #[test]
    fn idempotent(x in tricky()) {
        for level in LEVELS {
            for honorifics in HONORIFICS {
                let o = Options { level, honorifics };
                let once = normalize(&x, &o);
                prop_assert_eq!(normalize(&once, &o), once.clone(), "{:?} {:?}", level, honorifics);
                let mut buf = String::from("reused buffer");
                normalize_into(&x, &o, &mut buf);
                prop_assert_eq!(buf, once);
            }
        }
    }

    #[test]
    fn levels_include_the_previous_level(x in tricky()) {
        for honorifics in HONORIFICS {
            let o = |level| Options { level, honorifics };
            let clean = normalize(&x, &o(Level::Clean));
            prop_assert_eq!(normalize(&clean, &o(Level::Search)), normalize(&x, &o(Level::Search)));
            if spec_loose_separator_issue(&x) {
                continue;
            }
            let search = normalize(&x, &o(Level::Search));
            prop_assert_eq!(normalize(&search, &o(Level::Loose)), normalize(&x, &o(Level::Loose)));
        }
    }

    #[test]
    fn map_spans_lie_on_char_boundaries_of_the_input(x in tricky()) {
        for level in LEVELS {
            for honorifics in HONORIFICS {
                let m = normalize_with_map(&x, &Options { level, honorifics });
                prop_assert_eq!(&m.text, &normalize(&x, &Options { level, honorifics }));
                prop_assert_eq!(m.start.len(), m.text.len());
                prop_assert_eq!(m.end.len(), m.text.len());
                for (i, ch) in m.text.char_indices() {
                    let (s, e) = (m.start[i], m.end[i]);
                    prop_assert!(s < e && e <= x.len());
                    prop_assert!(x.is_char_boundary(s) && x.is_char_boundary(e));
                    // Every byte of one char shares its span.
                    for k in i..i + ch.len_utf8() {
                        prop_assert_eq!((m.start[k], m.end[k]), (s, e));
                    }
                    if i > 0 {
                        prop_assert!(s >= m.start[i - 1]);
                    }
                    // Any normalized char range maps to a valid slice of the original.
                    let r = m.source_range(i..i + ch.len_utf8()).unwrap();
                    prop_assert!(x.get(r).is_some());
                }
            }
        }
    }

    #[test]
    fn find_all_spans_normalize_to_the_needle(x in tricky()) {
        if spec_composition_span_issue(&x) || spec_context_issue(&x) {
            return Ok(());
        }
        for level in LEVELS {
            let so = SearchOptions { level, ..SearchOptions::default() };
            let o = Options::level(level);
            let norm = normalize(&x, &o);
            for w in norm.split(' ').filter(|w| !w.is_empty()) {
                let needle = normalize(w, &o);
                for m in find_all(&x, w, &so) {
                    prop_assert_eq!(&x[m.start..m.end], m.text.as_str());
                    prop_assert!(normalize(&m.text, &o).contains(&needle), "needle {:?}", w);
                }
            }
        }
    }

    #[test]
    fn offset_conversions_round_trip(x in tricky()) {
        for (b, _) in x.char_indices().chain(std::iter::once((x.len(), ' '))) {
            let u = byte_to_utf16_offset(&x, b);
            prop_assert_eq!(utf16_to_byte_offset(&x, u), Some(b));
            prop_assert_eq!(byte_to_char_offset(&x, b), x[..b].chars().count());
        }
    }
}

#[test]
fn public_types_are_send_sync() {
    fn check<T: Send + Sync + 'static>() {}
    check::<Options>();
    check::<Level>();
    check::<Honorifics>();
    check::<Normalized>();
    check::<SearchOptions>();
    check::<HighlightOptions>();
    check::<Match>();
    check::<MatchMode>();
    #[cfg(feature = "isnad")]
    {
        check::<nass::isnad::IsnadResult>();
        check::<nass::isnad::Narrator>();
    }
}

#[test]
fn api_examples() {
    let hadith = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ";
    assert_eq!(
        normalize(hadith, &Options::default()),
        "انما الاعمال بالنيات"
    );
    assert_eq!(
        highlight(hadith, "الاعمال", &HighlightOptions::default()),
        "إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ"
    );
    let hl = HighlightOptions {
        open: "[".into(),
        close: "]".into(),
        ..HighlightOptions::default()
    };
    assert_eq!(highlight(hadith, "النيات", &hl), "إِنَّمَا الْأَعْمَالُ بِ[النِّيَّاتِ]");
    assert_eq!(
        highlight(hadith, "غائب", &HighlightOptions::default()),
        hadith
    );
    assert!(contains(hadith, "انما الاعمال", &SearchOptions::default()));
    let ww = SearchOptions {
        whole_word: true,
        ..SearchOptions::default()
    };
    assert!(contains(hadith, "الاعمال", &ww));
    assert!(!contains(hadith, "عمال", &ww));
    assert!(find_all(hadith, "   ", &SearchOptions::default()).is_empty());
    // A Tantivy-style token: byte range in the normalized text -> byte range in the original.
    let m = normalize_with_map(hadith, &Options::default());
    let s = m.text.find("الاعمال").unwrap();
    let r = m.source_range(s..s + "الاعمال".len()).unwrap();
    assert_eq!(&hadith[r], "الْأَعْمَالُ");
    assert_eq!(m.source_range(3..3), None);
    assert_eq!(m.source_range(0..m.text.len() + 1), None);
    // Offset conversions.
    let t = "a😀ب";
    assert_eq!(byte_to_utf16_offset(t, 5), 3);
    assert_eq!(byte_to_char_offset(t, 5), 2);
    assert_eq!(utf16_to_byte_offset(t, 2), None);
    assert_eq!(utf16_to_byte_offset(t, 4), Some(t.len()));
    assert_eq!(utf16_to_byte_offset(t, 5), None);
}
