// Offset unit conversions. The Rust package uses UTF-8 byte offsets; the shared test
// vectors, Dart and TypeScript use UTF-16 code units, and PHP uses code points (SPEC §0).

/// Converts a UTF-8 byte offset in `text` to a code point (char) offset, the unit of the
/// PHP package. `byte` must be a char boundary (offsets returned by this crate always are).
///
/// # Panics
/// If `byte` is not on a char boundary or is past the end.
pub fn byte_to_char_offset(text: &str, byte: usize) -> usize {
    text[..byte].chars().count()
}

/// Converts a UTF-8 byte offset in `text` to a UTF-16 code unit offset, the unit of the
/// TypeScript and Dart packages and of the shared test vectors.
///
/// # Panics
/// If `byte` is not on a char boundary or is past the end.
pub fn byte_to_utf16_offset(text: &str, byte: usize) -> usize {
    text[..byte].chars().map(char::len_utf16).sum()
}

/// Converts a UTF-16 code unit offset in `text` to a UTF-8 byte offset.
/// Returns `None` if the offset is past the end or falls inside a surrogate pair.
pub fn utf16_to_byte_offset(text: &str, utf16: usize) -> Option<usize> {
    let mut u = 0;
    for (b, ch) in text.char_indices() {
        if u == utf16 {
            return Some(b);
        }
        u += ch.len_utf16();
        if u > utf16 {
            return None;
        }
    }
    (u == utf16).then_some(text.len())
}
