// Diacritic-insensitive search with offsets in the original text (SPEC §6).
use crate::normalizer::{normalize, normalize_with_map, Honorifics, Level, Normalized, Options};

/// How a multi-word needle matches (SPEC §6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum MatchMode {
    /// The needle as one phrase (the default).
    #[default]
    Phrase,
    /// Every word of the needle, each at least once; otherwise no match.
    AllWords,
    /// Any word of the needle.
    AnyWord,
}

/// Search options. Default: search level, keep honorifics, phrase, not whole word.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct SearchOptions {
    /// Normalization level for haystack and needle.
    pub level: Level,
    /// Honorifics handling for haystack and needle.
    pub honorifics: Honorifics,
    /// Default: [`MatchMode::Phrase`].
    pub match_mode: MatchMode,
    /// Only match whole words. Default: false.
    pub whole_word: bool,
}

impl SearchOptions {
    fn normalize_options(&self) -> Options {
        Options {
            level: self.level,
            honorifics: self.honorifics,
        }
    }
}

/// Options for [`highlight`]. Default markers: `<mark>` and `</mark>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct HighlightOptions {
    /// How matches are found.
    pub search: SearchOptions,
    /// Inserted before each match. Default: `<mark>`.
    pub open: String,
    /// Inserted after each match. Default: `</mark>`.
    pub close: String,
}

impl Default for HighlightOptions {
    fn default() -> Self {
        HighlightOptions {
            search: SearchOptions::default(),
            open: "<mark>".to_string(),
            close: "</mark>".to_string(),
        }
    }
}

/// A match in the ORIGINAL haystack: `[start, end)` in UTF-8 bytes, and the matched text.
/// See [`byte_to_utf16_offset`](crate::byte_to_utf16_offset) to compare with the TypeScript package.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Match {
    /// Byte offset of the first byte of the match in the haystack.
    pub start: usize,
    /// Byte offset just after the match in the haystack.
    pub end: usize,
    /// `&haystack[start..end]`.
    pub text: String,
}

fn phrase(haystack: &str, hay: &Normalized, needle: &str, whole_word: bool) -> Vec<Match> {
    let mut out = Vec::new();
    if needle.is_empty() {
        return out;
    }
    let t = hay.text.as_str();
    let b = t.as_bytes();
    let mut from = 0;
    let mut last_end: Option<usize> = None;
    while let Some(rel) = t[from..].find(needle) {
        let s = from + rel;
        let e = s + needle.len();
        let ok = !whole_word || ((s == 0 || b[s - 1] == b' ') && (e == t.len() || b[e] == b' '));
        if ok {
            let (os, oe) = (hay.start[s], hay.end[e - 1]);
            if last_end.map_or(true, |l| os >= l) {
                out.push(Match {
                    start: os,
                    end: oe,
                    text: haystack[os..oe].to_string(),
                });
                last_end = Some(oe);
            }
            from = e;
        } else {
            // Next code point after s.
            from = s + t[s..].chars().next().map_or(1, char::len_utf8);
        }
    }
    out
}

fn merge(mut all: Vec<Match>) -> Vec<Match> {
    // Stable: by start, then longer first.
    all.sort_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| (b.end - b.start).cmp(&(a.end - a.start)))
    });
    let mut out = Vec::new();
    let mut last_end: Option<usize> = None;
    for m in all {
        if last_end.map_or(true, |l| m.start >= l) {
            last_end = Some(m.end);
            out.push(m);
        }
    }
    out
}

/// All non-overlapping matches of `needle`, as byte spans of the original `haystack`.
///
/// ```
/// use nass::{find_all, SearchOptions};
/// let hay = "قَالَ رَسُولُ اللَّهِ";
/// let m = find_all(hay, "رسول", &SearchOptions::default());
/// assert_eq!(m[0].text, "رَسُولُ");
/// assert_eq!(&hay[m[0].start..m[0].end], "رَسُولُ");
/// ```
pub fn find_all(haystack: &str, needle: &str, opts: &SearchOptions) -> Vec<Match> {
    let no = opts.normalize_options();
    let n = normalize(needle, &no);
    if n.is_empty() {
        return Vec::new();
    }
    let hay = normalize_with_map(haystack, &no);
    if opts.match_mode == MatchMode::Phrase {
        return phrase(haystack, &hay, &n, opts.whole_word);
    }
    let mut seen: Vec<&str> = Vec::new();
    let mut all = Vec::new();
    for w in n.split(' ') {
        if seen.contains(&w) {
            continue;
        }
        seen.push(w);
        let ms = phrase(haystack, &hay, w, opts.whole_word);
        if ms.is_empty() && opts.match_mode == MatchMode::AllWords {
            return Vec::new();
        }
        all.extend(ms);
    }
    merge(all)
}

/// Whether `needle` occurs in `haystack` after normalization.
pub fn contains(haystack: &str, needle: &str, opts: &SearchOptions) -> bool {
    !find_all(haystack, needle, opts).is_empty()
}

/// Wraps every match in the ORIGINAL haystack with `open` and `close`.
/// **Does not escape HTML**: escaping is the caller's job.
pub fn highlight(haystack: &str, needle: &str, opts: &HighlightOptions) -> String {
    let ms = find_all(haystack, needle, &opts.search);
    if ms.is_empty() {
        return haystack.to_string();
    }
    let mut out =
        String::with_capacity(haystack.len() + ms.len() * (opts.open.len() + opts.close.len()));
    let mut pos = 0;
    for m in &ms {
        out.push_str(&haystack[pos..m.start]);
        out.push_str(&opts.open);
        out.push_str(&m.text);
        out.push_str(&opts.close);
        pos = m.end;
    }
    out.push_str(&haystack[pos..]);
    out
}
