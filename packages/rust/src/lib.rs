//! Arabic text normalization and diacritic-insensitive search for Quran, hadith and
//! heritage texts, with offsets in the original text.
//!
//! Behaviour is defined by `spec/SPEC.md` and the shared test vectors of the
//! [nass](https://github.com/samt-qa/nass) repository; this crate behaves exactly like the
//! Dart, TypeScript and PHP packages.
//!
//! **Offsets are UTF-8 byte offsets**, so `&text[m.start..m.end]` works directly. Use
//! [`byte_to_utf16_offset`] or [`byte_to_char_offset`] to compare with the other packages.
//!
//! ```
//! use nass::{normalize, find_all, highlight, HighlightOptions, Options, SearchOptions};
//!
//! assert_eq!(normalize("ﷲ أَكْبَرُ", &Options::default()), "الله اكبر");
//! let hay = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ";
//! let m = &find_all(hay, "الاعمال", &SearchOptions::default())[0];
//! assert_eq!(&hay[m.start..m.end], "الْأَعْمَالُ");
//! assert_eq!(
//!     highlight(hay, "النيات", &HighlightOptions::default()),
//!     "إِنَّمَا الْأَعْمَالُ بِ<mark>النِّيَّاتِ</mark>"
//! );
//! ```
#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod charset;
#[cfg(feature = "isnad")]
pub mod isnad;
mod names;
mod normalizer;
mod offsets;
mod search;
#[rustfmt::skip]
mod tables;

// Runs the README examples as doctests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

pub use names::name_key;
pub use normalizer::{
    normalize, normalize_into, normalize_with_map, Honorifics, Level, Normalized, Options,
};
pub use offsets::{byte_to_char_offset, byte_to_utf16_offset, utf16_to_byte_offset};
pub use search::{
    contains, find_all, highlight, HighlightOptions, Match, MatchMode, SearchOptions,
};
