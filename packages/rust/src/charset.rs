// Runtime lookup tables, built once from the generated tables (mirrors packages/js/src/charset.ts).
use crate::tables as t;
use std::sync::OnceLock;

pub(crate) const F_INVIS_ALWAYS: u8 = 1;
pub(crate) const F_INVIS_NEAR: u8 = 2;
pub(crate) const F_TATWEEL: u8 = 4;
pub(crate) const F_ARABIC: u8 = 8;
pub(crate) const F_MARK: u8 = 16;
pub(crate) const F_SEP: u8 = 32;
pub(crate) const F_SPACE: u8 = 64;
pub(crate) const F_LOOSE_REMOVE: u8 = 128;

/// A dense table indexed by code point, sized to its largest key.
pub(crate) struct Dense<T> {
    v: Vec<T>,
}

impl<T: Copy + Default> Dense<T> {
    fn with_keys(keys: impl Iterator<Item = u32>) -> Self {
        let n = keys.max().map_or(0, |m| m as usize + 1);
        Dense {
            v: vec![T::default(); n],
        }
    }
    #[inline]
    pub(crate) fn get(&self, c: u32) -> T {
        self.v.get(c as usize).copied().unwrap_or_default()
    }
    fn set(&mut self, c: u32, x: T) {
        self.v[c as usize] = x;
    }
}

pub(crate) struct Charset {
    pub(crate) flags: Vec<u8>, // BMP only
    pub(crate) ccc: Dense<u8>,
    /// S3/S4/S6 single-character map. 0 = none.
    pub(crate) map1: Dense<u32>,
    pub(crate) loose_map: Dense<u32>,
    pub(crate) digit_sep: Dense<u32>,
    /// (first, second, composed)
    pub(crate) compose: Vec<(u32, u32, u32)>,
    /// (offset, len) into `pres_data`; len 0 = none.
    pub(crate) pres: Dense<(u32, u32)>,
    pub(crate) pres_search: Dense<(u32, u32)>,
    pub(crate) pres_data: Vec<u32>,
    astral_sep: Vec<(u32, u32)>,
    astral_space: Vec<(u32, u32)>,
}

fn pairs(flat: &[u32]) -> impl Iterator<Item = (u32, u32)> + '_ {
    flat.chunks_exact(2).map(|p| (p[0], p[1]))
}

fn build() -> Charset {
    let mut flags = vec![0u8; 0x10000];
    let mut astral_sep = Vec::new();
    let mut astral_space = Vec::new();
    let mut ranges = |flat: &[u32], flag: u8, astral: Option<&mut Vec<(u32, u32)>>| {
        let mut astral = astral;
        for (a, b) in pairs(flat) {
            for c in a..=b {
                if c < 0x10000 {
                    flags[c as usize] |= flag;
                } else if let Some(v) = astral.as_deref_mut() {
                    v.push((c, c));
                }
            }
        }
    };
    ranges(t::INVISIBLE_ALWAYS, F_INVIS_ALWAYS, None);
    ranges(t::INVISIBLE_NEAR_ARABIC, F_INVIS_NEAR, None);
    ranges(t::TATWEEL, F_TATWEEL, None);
    ranges(t::ARABIC, F_ARABIC, None);
    ranges(t::MARKS, F_MARK, None);
    ranges(t::PUNCTUATION, F_SEP, Some(&mut astral_sep));
    ranges(t::EXTRA_SEPARATORS, F_SEP, None);
    ranges(t::WHITESPACE, F_SPACE, Some(&mut astral_space));
    ranges(t::LOOSE_REMOVE, F_LOOSE_REMOVE, None);
    flags[0x25] &= !F_SEP; // '%' is kept as a symbol (SPEC S5)

    let mut ccc = Dense::with_keys(pairs(t::CCC).map(|p| p.0));
    for (c, v) in pairs(t::CCC) {
        ccc.set(c, v as u8);
    }
    let compose = t::COMPOSITIONS
        .chunks_exact(3)
        .map(|x| (x[0], x[1], x[2]))
        .collect();

    let mut pres_data = Vec::new();
    let mut expansions = |flat: &[u32]| {
        let mut keys = Vec::new();
        let mut i = 0;
        while i < flat.len() {
            let n = flat[i + 1] as usize;
            keys.push((flat[i], pres_data.len() as u32, n as u32));
            pres_data.extend_from_slice(&flat[i + 2..i + 2 + n]);
            i += 2 + n;
        }
        let mut d = Dense::with_keys(keys.iter().map(|k| k.0));
        for (k, off, n) in keys {
            d.set(k, (off, n));
        }
        d
    };
    let pres = expansions(t::PRESENTATION);
    let pres_search = expansions(t::PRESENTATION_SEARCH);

    let mut map1 = Dense::with_keys(
        pairs(t::LETTER_MAP)
            .chain(pairs(t::DIGIT_MAP))
            .map(|p| p.0)
            .chain(std::iter::once(0x5a)),
    );
    for (k, v) in pairs(t::LETTER_MAP).chain(pairs(t::DIGIT_MAP)) {
        map1.set(k, v);
    }
    for c in 0x41..=0x5a {
        map1.set(c, c + 0x20);
    }
    let mut loose_map = Dense::with_keys(pairs(t::LOOSE_MAP).map(|p| p.0));
    for (k, v) in pairs(t::LOOSE_MAP) {
        loose_map.set(k, v);
    }
    let mut digit_sep = Dense::with_keys(pairs(t::DIGIT_SEPARATORS).map(|p| p.0));
    for (k, v) in pairs(t::DIGIT_SEPARATORS) {
        digit_sep.set(k, v);
    }
    Charset {
        flags,
        ccc,
        map1,
        loose_map,
        digit_sep,
        compose,
        pres,
        pres_search,
        pres_data,
        astral_sep,
        astral_space,
    }
}

pub(crate) fn cs() -> &'static Charset {
    static CS: OnceLock<Charset> = OnceLock::new();
    CS.get_or_init(build)
}

impl Charset {
    #[inline]
    pub(crate) fn flags(&self, c: u32) -> u8 {
        if c < 0x10000 {
            self.flags[c as usize]
        } else {
            0
        }
    }
    #[inline]
    pub(crate) fn is_arabic(&self, c: u32) -> bool {
        self.flags(c) & F_ARABIC != 0
    }
    #[inline]
    pub(crate) fn is_sep(&self, c: u32) -> bool {
        if c < 0x10000 {
            self.flags[c as usize] & F_SEP != 0
        } else {
            in_ranges(&self.astral_sep, c)
        }
    }
    #[inline]
    pub(crate) fn is_space(&self, c: u32) -> bool {
        if c < 0x10000 {
            self.flags[c as usize] & F_SPACE != 0
        } else {
            in_ranges(&self.astral_space, c)
        }
    }
    pub(crate) fn composed(&self, first: u32, second: u32) -> Option<u32> {
        self.compose
            .iter()
            .find(|x| x.0 == first && x.1 == second)
            .map(|x| x.2)
    }
}

fn in_ranges(v: &[(u32, u32)], c: u32) -> bool {
    v.binary_search_by(|&(a, b)| {
        if b < c {
            std::cmp::Ordering::Less
        } else if a > c {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    })
    .is_ok()
}
