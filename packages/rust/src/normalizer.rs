// Normalization pipeline (SPEC §1–§5). Mirrors packages/js/src/normalizer.ts.
//
//   pass 1  decode + C2 C3 C4 C5 + Z (space collapse at insertion)
//   pass 2  C1 Arabic canonical reordering + composition, in place
//   pass 3  S1 S2 S3 S4 S5 S6 (+ L1 in loose) + Z            [search, loose]
//   pass 4  S7 written honorifics + Z                         [strip only]
//
// Offsets are UTF-8 byte offsets into the original text.
use crate::charset::*;
use crate::tables as t;
use std::ops::Range;
use std::sync::OnceLock;

/// Normalization level (SPEC §1). Each level includes the previous one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Level {
    /// Display-safe cleanup: the text still looks the same.
    Clean,
    /// Diacritic-insensitive search key (the default).
    #[default]
    Search,
    /// Tolerant search: also folds ta marbuta and hamza seats.
    Loose,
}

/// How honorific formulas and ligatures are treated (SPEC S1, S7).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Honorifics {
    /// Expand ligatures such as «ﷺ» to their text (the default).
    #[default]
    Keep,
    /// Remove ligatures and written honorific formulas.
    Strip,
}

/// Normalization options.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct Options {
    /// Default: [`Level::Search`].
    pub level: Level,
    /// Default: [`Honorifics::Keep`].
    pub honorifics: Honorifics,
}

impl Options {
    /// Options with the given level and default honorifics.
    pub fn level(level: Level) -> Self {
        Options {
            level,
            ..Options::default()
        }
    }
}

/// Normalized text plus, for every byte of [`text`](Self::text), the `[start, end)` byte span
/// of its source group in the original text (SPEC §5).
///
/// Offsets are stored as `u32` to halve the memory of the map, so the original text must be
/// shorter than 4 GiB; [`normalize_with_map`] panics otherwise.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Normalized {
    /// The normalized text.
    pub text: String,
    /// `start[i]`: start of the source group of byte `i` of `text`, in the original.
    pub start: Vec<u32>,
    /// `end[i]`: end (exclusive) of the source group of byte `i` of `text`, in the original.
    pub end: Vec<u32>,
}

impl Normalized {
    /// The span of the original text that produced `range` of the normalized text:
    /// `start[range.start]..end[range.end - 1]` (SPEC §5). `None` if the range is empty
    /// or out of bounds.
    pub fn source_range(&self, range: Range<usize>) -> Option<Range<usize>> {
        if range.start >= range.end || range.end > self.text.len() {
            return None;
        }
        Some(self.start[range.start] as usize..self.end[range.end - 1] as usize)
    }
}

const SPACE: u32 = 0x20;
const ZWNJ: u32 = 0x200c;

/// Source spans of the units of a [`Buf`]. `Vec<(u32, u32)>` tracks them; [`NoSpans`] is the
/// fast path for plain [`normalize`], where every span operation compiles to nothing. Both run
/// the same pipeline code, so the two paths cannot drift apart.
pub(crate) trait Spans {
    fn with_capacity(n: usize) -> Self;
    fn push(&mut self, st: u32, en: u32);
    fn pop(&mut self);
    fn truncate(&mut self, n: usize);
    /// `(start, end)` of unit `k`; `(0, 0)` when spans are not tracked.
    fn get(&self, k: usize) -> (u32, u32);
    fn set(&mut self, k: usize, v: (u32, u32));
    /// A deleted mark joins the source group of the last kept unit (SPEC §5).
    fn attach(&mut self, en: u32);
    /// C1 reordering: units `r` share one span, the union of theirs.
    fn merge(&mut self, r: Range<usize>);
    /// C1 composition: unit `k` also covers source up to `en`.
    fn extend_end(&mut self, k: usize, en: u32);
}

impl Spans for Vec<(u32, u32)> {
    fn with_capacity(n: usize) -> Self {
        Vec::with_capacity(n)
    }
    #[inline]
    fn push(&mut self, st: u32, en: u32) {
        Vec::push(self, (st, en));
    }
    fn pop(&mut self) {
        Vec::pop(self);
    }
    fn truncate(&mut self, n: usize) {
        Vec::truncate(self, n);
    }
    #[inline]
    fn get(&self, k: usize) -> (u32, u32) {
        self[k]
    }
    #[inline]
    fn set(&mut self, k: usize, v: (u32, u32)) {
        self[k] = v;
    }
    fn attach(&mut self, en: u32) {
        let Some(&(st, _)) = self.last() else {
            return;
        };
        for x in self.iter_mut().rev() {
            if x.0 != st {
                break;
            }
            if x.1 < en {
                x.1 = en;
            }
        }
    }
    fn merge(&mut self, r: Range<usize>) {
        let s = &mut self[r];
        let lo = s.iter().map(|x| x.0).min().unwrap_or(0);
        let hi = s.iter().map(|x| x.1).max().unwrap_or(0);
        s.fill((lo, hi));
    }
    fn extend_end(&mut self, k: usize, en: u32) {
        if self[k].1 < en {
            self[k].1 = en;
        }
    }
}

/// No span tracking: the fast path of [`normalize`] and [`normalize_into`].
pub(crate) struct NoSpans;

impl Spans for NoSpans {
    fn with_capacity(_: usize) -> Self {
        NoSpans
    }
    #[inline]
    fn push(&mut self, _: u32, _: u32) {}
    #[inline]
    fn pop(&mut self) {}
    #[inline]
    fn truncate(&mut self, _: usize) {}
    #[inline]
    fn get(&self, _: usize) -> (u32, u32) {
        (0, 0)
    }
    #[inline]
    fn set(&mut self, _: usize, _: (u32, u32)) {}
    #[inline]
    fn attach(&mut self, _: u32) {}
    #[inline]
    fn merge(&mut self, _: Range<usize>) {}
    #[inline]
    fn extend_end(&mut self, _: usize, _: u32) {}
}

/// Code points and their source spans (byte offsets into the original, as `u32`).
pub(crate) struct Buf<S> {
    pub(crate) cp: Vec<u32>,
    pub(crate) sp: S,
}

impl<S: Spans> Buf<S> {
    fn with_capacity(n: usize) -> Self {
        Buf {
            cp: Vec::with_capacity(n),
            sp: S::with_capacity(n),
        }
    }
    #[inline]
    pub(crate) fn len(&self) -> usize {
        self.cp.len()
    }
    #[inline]
    fn add(&mut self, c: u32, st: u32, en: u32) {
        self.cp.push(c);
        self.sp.push(st, en);
    }
    /// Adds a space unless empty or already ending with one (Z).
    #[inline]
    fn add_space(&mut self, st: u32, en: u32) {
        match self.cp.last() {
            None | Some(&SPACE) => {}
            _ => self.add(SPACE, st, en),
        }
    }
    #[inline]
    fn attach(&mut self, en: u32) {
        self.sp.attach(en);
    }
    fn trim_end(&mut self) {
        if self.cp.last() == Some(&SPACE) {
            self.cp.pop();
            self.sp.pop();
        }
    }
    fn truncate(&mut self, n: usize) {
        self.cp.truncate(n);
        self.sp.truncate(n);
    }
    pub(crate) fn write_into(&self, out: &mut String) {
        out.reserve(self.len());
        for &c in &self.cp {
            // Every code point comes from a char or a table of valid scalar values.
            out.push(char::from_u32(c).unwrap_or('\u{FFFD}'));
        }
    }
}

// ---------------------------------------------------------------- pass 1

/// Whether the nearest code point that is not invisible, scanning left from `l` and right
/// from `r`, is Arabic (SPEC C2, S2).
fn near_arabic(
    c: &Charset,
    left: impl Iterator<Item = u32>,
    right: impl Iterator<Item = u32>,
) -> bool {
    let first = |mut it: Box<dyn Iterator<Item = u32> + '_>| {
        it.find(|&x| c.flags(x) & (F_INVIS_ALWAYS | F_INVIS_NEAR) == 0)
            .is_some_and(|x| c.is_arabic(x))
    };
    first(Box::new(left)) || first(Box::new(right))
}

fn pass1<S: Spans>(c: &Charset, text: &str) -> Buf<S> {
    let mut out = Buf::with_capacity(text.len() / 2 + 16);
    for (sti, ch) in text.char_indices() {
        let x = ch as u32;
        let eni = sti + ch.len_utf8();
        // Callers that track spans check that the text is shorter than 4 GiB.
        let (st, en) = (sti as u32, eni as u32);
        if x >= 0x10000 {
            if c.is_space(x) {
                out.add_space(st, en);
            } else {
                out.add(x, st, en);
            }
            continue;
        }
        let f = c.flags[x as usize];
        if f == 0 {
            out.add(x, st, en);
            continue;
        }
        if f & (F_INVIS_ALWAYS | F_TATWEEL) != 0 {
            out.attach(en);
            continue;
        }
        if f & F_INVIS_NEAR != 0 {
            // Neighbours: nearest input code points on each side that are not invisible (SPEC C2).
            // ZWNJ next to Arabic is kept in clean and removed in search (SPEC C2, S2).
            if x != ZWNJ
                && near_arabic(
                    c,
                    text[..sti].chars().rev().map(|ch| ch as u32),
                    text[eni..].chars().map(|ch| ch as u32),
                )
            {
                out.attach(en);
            } else {
                out.add(x, st, en);
            }
            continue;
        }
        let (off, len) = c.pres.get(x);
        if len != 0 {
            for &y in &c.pres_data[off as usize..(off + len) as usize] {
                out.add(y, st, en);
            }
            continue;
        }
        if f & F_SPACE != 0 {
            out.add_space(st, en);
        } else {
            out.add(x, st, en);
        }
    }
    out.trim_end();
    out
}

// ---------------------------------------------------------------- pass 2 (C1)

fn c1<S: Spans>(cs: &Charset, a: &mut Buf<S>) {
    let ccc = |x: u32| cs.ccc.get(x);
    let n = a.len();
    let mut i = 0;
    while i < n {
        if ccc(a.cp[i]) == 0 {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < n && ccc(a.cp[j]) != 0 {
            j += 1;
        }
        if j - i > 1 {
            let mut changed = false;
            for k in i + 1..j {
                let (x, xsp) = (a.cp[k], a.sp.get(k));
                let xc = ccc(x);
                let mut m = k;
                while m > i && ccc(a.cp[m - 1]) > xc {
                    a.cp[m] = a.cp[m - 1];
                    let prev = a.sp.get(m - 1);
                    a.sp.set(m, prev);
                    m -= 1;
                    changed = true;
                }
                a.cp[m] = x;
                a.sp.set(m, xsp);
            }
            if changed {
                a.sp.merge(i..j);
            }
        }
        i = j;
    }
    let mut w = 0;
    let mut starter: Option<usize> = None;
    let mut last_ccc: Option<u8> = None;
    for k in 0..n {
        let x = a.cp[k];
        let cc = ccc(x);
        if let Some(st) = starter {
            if last_ccc.map_or(true, |l| l < cc) {
                if let Some(composed) = cs.composed(a.cp[st], x) {
                    a.cp[st] = composed;
                    let en = a.sp.get(k).1;
                    a.sp.extend_end(st, en);
                    continue;
                }
            }
        }
        if cc == 0 {
            starter = Some(w);
            last_ccc = None;
        } else {
            last_ccc = Some(cc);
        }
        a.cp[w] = x;
        let v = a.sp.get(k);
        a.sp.set(w, v);
        w += 1;
    }
    a.truncate(w);
}

// ---------------------------------------------------------------- pass 3

#[inline]
fn is_digit(c: u32) -> bool {
    (0x30..=0x39).contains(&c)
}

fn pass3<S: Spans>(cs: &Charset, a: &Buf<S>, h: Honorifics, loose: bool) -> Buf<S> {
    let mut out = Buf::with_capacity(a.len() + 16);
    for k in 0..a.len() {
        let c = a.cp[k];
        let (st, en) = a.sp.get(k);
        if c < 0x10000 {
            let (off, len) = cs.pres_search.get(c);
            if len != 0 {
                if h == Honorifics::Strip && c != 0xfdfd {
                    out.add_space(st, en);
                } else {
                    for &y in &cs.pres_data[off as usize..(off + len) as usize] {
                        emit(cs, &mut out, y, st, en, &[], loose);
                    }
                }
                continue;
            }
            // In the clean text only ZWNJ and ZWJ can still be invisible.
            if c == ZWNJ
                && near_arabic(
                    cs,
                    a.cp[..k].iter().rev().copied(),
                    a.cp[k + 1..].iter().copied(),
                )
            {
                out.attach(en);
                continue;
            }
            if cs.flags[c as usize] & F_MARK != 0 {
                out.attach(en);
                continue;
            }
        }
        emit(cs, &mut out, c, st, en, &a.cp[k + 1..], loose);
    }
    out.trim_end();
    out
}

/// `rest`: the code points after `c` in this pass, for the S4 look-ahead (empty inside an expansion).
fn emit<S: Spans>(
    cs: &Charset,
    out: &mut Buf<S>,
    c: u32,
    st: u32,
    en: u32,
    rest: &[u32],
    loose: bool,
) {
    if c >= 0x10000 {
        if cs.is_sep(c) {
            out.add_space(st, en);
        } else {
            out.add(c, st, en);
        }
        return;
    }
    if c == SPACE {
        out.add_space(st, en);
        return;
    }
    let mut c = c;
    let m = cs.map1.get(c);
    if m != 0 {
        c = m;
    } else {
        let sep = cs.digit_sep.get(c);
        if sep != 0 {
            let prev_digit = out.cp.last().is_some_and(|&p| is_digit(p));
            let becomes_digit = |x: u32| is_digit(x) || (x < 0x10000 && is_digit(cs.map1.get(x)));
            // «بعدها رقم»: the next code point that is not a mark (SPEC S4).
            let next = || {
                rest.iter()
                    .copied()
                    .find(|&x| x >= 0x10000 || cs.flags[x as usize] & F_MARK == 0)
            };
            if prev_digit && next().is_some_and(becomes_digit) {
                out.add(sep, st, en);
                return;
            }
        }
        if cs.flags[c as usize] & F_SEP != 0 {
            out.add_space(st, en);
            return;
        }
    }
    if loose {
        if cs.flags[c as usize] & F_LOOSE_REMOVE != 0 {
            out.attach(en);
            return;
        }
        let l = cs.loose_map.get(c);
        if l != 0 {
            c = l;
        }
    }
    out.add(c, st, en);
}

// ---------------------------------------------------------------- pass 4 (S7)

struct Phrases {
    always: Vec<Vec<String>>,
    after_allah: Vec<Vec<String>>,
    always_loose: Vec<Vec<String>>,
    after_allah_loose: Vec<Vec<String>>,
}

fn by_length(list: &[&str], loose: bool) -> Vec<Vec<String>> {
    let mut v: Vec<Vec<String>> = list
        .iter()
        .map(|p| {
            let p = if loose {
                normalize(p, &Options::level(Level::Loose))
            } else {
                (*p).to_string()
            };
            p.split(' ').map(str::to_string).collect()
        })
        .collect();
    v.sort_by_key(|p| std::cmp::Reverse(p.len())); // stable, like Array.prototype.sort
    v
}

fn phrases() -> &'static Phrases {
    static P: OnceLock<Phrases> = OnceLock::new();
    P.get_or_init(|| Phrases {
        always: by_length(t::HONORIFICS_ALWAYS, false),
        after_allah: by_length(t::HONORIFICS_AFTER_ALLAH, false),
        always_loose: by_length(t::HONORIFICS_ALWAYS, true),
        after_allah_loose: by_length(t::HONORIFICS_AFTER_ALLAH, true),
    })
}

fn s7<S: Spans>(a: Buf<S>, loose: bool) -> Buf<S> {
    let ph = phrases();
    let (always, after_allah) = if loose {
        (&ph.always_loose, &ph.after_allah_loose)
    } else {
        (&ph.always, &ph.after_allah)
    };
    let mut ws: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < a.len() {
        let mut j = i;
        while j < a.len() && a.cp[j] != SPACE {
            j += 1;
        }
        ws.push((i, j));
        i = j + 1;
    }
    let texts: Vec<String> = ws
        .iter()
        .map(|&(s, e)| {
            a.cp[s..e]
                .iter()
                .map(|&c| char::from_u32(c).unwrap_or('\u{FFFD}'))
                .collect()
        })
        .collect();
    let nw = ws.len();
    let mut removed = vec![false; nw];
    let match_at = |w: usize, p: &[String]| {
        w + p.len() <= nw && p.iter().zip(&texts[w..]).all(|(x, y)| x == y)
    };
    let mut any = false;
    let mut w = 0;
    while w < nw {
        let mut hit = always.iter().find(|p| match_at(w, p));
        if hit.is_none() && w > 0 && texts[w - 1] == "الله" {
            hit = after_allah.iter().find(|p| match_at(w, p));
        }
        if let Some(p) = hit {
            removed[w..w + p.len()].fill(true);
            any = true;
            w += p.len();
        } else {
            w += 1;
        }
    }
    if !any {
        return a;
    }
    let mut out = Buf::with_capacity(a.len());
    for (w2, &(s, e)) in ws.iter().enumerate() {
        if removed[w2] {
            continue;
        }
        if out.len() > 0 {
            let (st, en) = a.sp.get(s - 1);
            out.add(SPACE, st, en);
        }
        for k in s..e {
            let (st, en) = a.sp.get(k);
            out.add(a.cp[k], st, en);
        }
    }
    out
}

// ---------------------------------------------------------------- public

pub(crate) fn normalize_buf<S: Spans>(text: &str, opts: &Options) -> Buf<S> {
    let cs = cs();
    let mut b = pass1(cs, text);
    c1(cs, &mut b);
    if opts.level == Level::Clean {
        return b;
    }
    let loose = opts.level == Level::Loose;
    b = pass3(cs, &b, opts.honorifics, loose);
    if opts.honorifics == Honorifics::Strip {
        // Repeat until stable: a removal can make «الله» precede another formula.
        loop {
            let prev = b.len();
            b = s7(b, loose);
            if b.len() == prev {
                break;
            }
        }
    }
    b
}

/// Normalizes `text` (SPEC §1). Deterministic and idempotent.
///
/// ```
/// use nass::{normalize, Options};
/// assert_eq!(normalize("إِنَّمَا الْأَعْمَالُ", &Options::default()), "انما الاعمال");
/// ```
pub fn normalize(text: &str, opts: &Options) -> String {
    let mut out = String::new();
    normalize_into(text, opts, &mut out);
    out
}

/// Like [`normalize`], but writes into `out` (cleared first) so its buffer can be reused,
/// for example when indexing many documents.
pub fn normalize_into(text: &str, opts: &Options, out: &mut String) {
    out.clear();
    normalize_buf::<NoSpans>(text, opts).write_into(out);
}

/// Normalizes `text` and maps every byte of the result to its source span in `text`
/// (SPEC §5). All offsets are UTF-8 byte offsets.
///
/// # Panics
/// If `text` is 4 GiB or longer (offsets are stored as `u32`).
pub fn normalize_with_map(text: &str, opts: &Options) -> Normalized {
    assert!(
        u32::try_from(text.len()).is_ok(),
        "nass: normalize_with_map needs a text shorter than 4 GiB"
    );
    let b = normalize_buf::<Vec<(u32, u32)>>(text, opts);
    let mut out = Normalized {
        text: String::new(),
        start: Vec::with_capacity(b.len() * 2),
        end: Vec::with_capacity(b.len() * 2),
    };
    b.write_into(&mut out.text);
    for (k, &(st, en)) in b.sp.iter().enumerate() {
        let units = char::from_u32(b.cp[k]).map_or(3, char::len_utf8);
        for _ in 0..units {
            out.start.push(st);
            out.end.push(en);
        }
    }
    out
}
