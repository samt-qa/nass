// Name matching key (SPEC §7). For comparison and indexing, never for display.
use crate::normalizer::{normalize, Honorifics, Level, Options};
use crate::tables as t;

/// A normalized key for comparing and indexing names (SPEC §7).
///
/// **Equal keys do NOT mean the same person.**
///
/// ```
/// use nass::name_key;
/// assert_eq!(name_key("أبي هريرة"), name_key("أبو هريرة"));
/// ```
pub fn name_key(name: &str) -> String {
    let base = normalize(
        name,
        &Options {
            level: Level::Search,
            honorifics: Honorifics::Strip,
        },
    );
    if base.is_empty() {
        return String::new();
    }
    let mut w: Vec<&str> = base.split(' ').collect();
    while w.len() > 1 && t::TRAILING_TITLES.contains(w.last().unwrap_or(&"")) {
        w.pop();
    }
    let kunya = |x: &str| t::KUNYA.chunks_exact(2).find(|p| p[0] == x).map(|p| p[1]);
    for i in 0..w.len() {
        if let Some(k) = kunya(w[i]) {
            w[i] = k;
        } else if w[i] == "ذا" && i + 1 < w.len() && t::DHA_FOLLOWERS.contains(&w[i + 1]) {
            w[i] = "ذو";
        } else if t::IBN.contains(&w[i]) {
            w[i] = "بن";
        } else if t::BINT.contains(&w[i]) {
            w[i] = "بنت";
        }
    }
    let mut joined: Vec<String> = Vec::with_capacity(w.len());
    let mut i = 0;
    while i < w.len() {
        if w[i] == "عبد" && i + 1 < w.len() {
            joined.push(format!("عبد{}", w[i + 1]));
            i += 2;
        } else {
            joined.push(w[i].to_string());
            i += 1;
        }
    }
    normalize(&joined.join(" "), &Options::level(Level::Loose))
}
