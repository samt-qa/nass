# nass (Rust)

Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts, **with match offsets in the original vocalized text**. No dependencies, no `unsafe`, stable Rust ≥ 1.70.

تطبيع النص العربي والبحث فيه بلا اعتبار للحركات، مع مواضع التطابق في النص الأصلي المشكول.

Part of [nass](https://github.com/samt-qa/nass): the TypeScript (`@samt-qa/nass`), Dart (`nass`) and PHP (`samt/nass`) packages behave identically. All four pass the same shared test vectors, and a differential test against an independent implementation finds 0 mismatches in 172,463 comparisons over the six books.

```toml
[dependencies]
nass = "0.3"
# or, with the experimental isnad splitter:
nass = { version = "0.3", features = ["isnad"] }
```

## Usage

The examples match the [TypeScript README](https://github.com/samt-qa/nass/tree/main/packages/js) line by line; only the offsets differ (bytes here, UTF-16 units there; see below).

```rust
use nass::*;

let text = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ";

assert_eq!(normalize(text, &Options::default()), "انما الاعمال بالنيات");
normalize(text, &Options::level(Level::Loose));

let m = find_all(text, "الاعمال", &SearchOptions::default());
assert_eq!((m[0].start, m[0].end, m[0].text.as_str()), (17, 41, "الْأَعْمَالُ"));
assert_eq!((byte_to_utf16_offset(text, 17), byte_to_utf16_offset(text, 41)), (9, 21)); // as in TS

assert_eq!(
    highlight(text, "الاعمال", &HighlightOptions::default()),
    "إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ"
);

let whole = SearchOptions { whole_word: true, ..SearchOptions::default() };
assert!(!contains(text, "عمال", &whole));

let all = SearchOptions { match_mode: MatchMode::AllWords, ..SearchOptions::default() };
assert_eq!(find_all(text, "النيات انما", &all).len(), 2);

assert_eq!(name_key("أبي عبدِ الله البخاريّ رحمه الله"), "ابو عبدالله البخاري");
```

## API

| Item | Returns |
|---|---|
| `normalize(text, &Options)` | normalized `String` |
| `normalize_into(text, &Options, &mut String)` | the same, into a reused buffer (cleared first) |
| `normalize_with_map(text, &Options)` | `Normalized { text, start, end }`: for each **byte** of `text`, the byte span of its source |
| `Normalized::source_range(range)` | the byte range in the original for a byte range of the normalized text, or `None` if it is empty or out of bounds |
| `find_all(haystack, needle, &SearchOptions)` | non-overlapping `Match { start, end, text }` in the **original** haystack |
| `contains(haystack, needle, &SearchOptions)` | `bool` |
| `highlight(haystack, needle, &HighlightOptions)` | the original with matches wrapped in `open` / `close` (default `<mark>` / `</mark>`). **Does not escape HTML.** Escape untrusted text yourself. |
| `name_key(name)` | a key for comparing narrator names. Equal keys do **not** mean the same person. |
| `isnad::split_isnad(text)` | `IsnadResult { isnad, matn, confidence, narrators }` (feature `isnad`, experimental) |

- `Level`: `Clean` (storage and display; the text looks the same), `Search` (default), `Loose`.
- `Honorifics`: `Keep` (default) or `Strip`, which removes «ﷺ», «رضي الله عنه», and «تعالى» or «عز وجل» right after «الله».
- `MatchMode`: `Phrase` (default), `AllWords`, `AnyWord`.
- All option and result types derive `Debug, Clone, PartialEq` and are `Send + Sync`; option types implement `Default`.

Every rule is defined in the [specification](https://github.com/samt-qa/nass/blob/main/spec/SPEC.md).

## Offsets are UTF-8 bytes

Every offset this crate returns is a **UTF-8 byte offset** on a char boundary, so `&text[m.start..m.end]` works directly. The other packages use other units: TypeScript and Dart use UTF-16 code units (as do the shared test vectors), PHP uses code points. To exchange offsets with them:

| Function | Converts |
|---|---|
| `byte_to_utf16_offset(text, byte)` | byte → UTF-16 code unit (TypeScript, Dart, vectors) |
| `byte_to_char_offset(text, byte)` | byte → code point (PHP) |
| `utf16_to_byte_offset(text, utf16)` | UTF-16 → byte; `None` past the end or inside a surrogate pair |

## Indexing with a tokenizer (Tantivy and similar)

Normalize once with a map, split the normalized text into tokens, and store each token's span in the **original** text, so highlighting needs no second pass:

```rust
use nass::{normalize_with_map, Options};

let original = "قَالَ رَسُولُ اللَّهِ ﷺ";
let n = normalize_with_map(original, &Options::default());
let mut tokens = Vec::new();
let mut pos = 0;
for word in n.text.split(' ') {
    let range = pos..pos + word.len();
    pos = range.end + 1;
    if let Some(src) = n.source_range(range) {
        tokens.push((word, src)); // token text + byte offsets in `original`
    }
}
assert_eq!(tokens[1].0, "رسول");
assert_eq!(&original[tokens[1].1.clone()], "رَسُولُ");
// «ﷺ» expands to «صلى الله عليه وسلم»; each of the four tokens points back to «ﷺ».
let (last, src) = tokens.last().unwrap();
assert_eq!((*last, &original[src.clone()]), ("وسلم", "ﷺ"));
```

Tantivy's `Token::offset_from` / `offset_to` are byte offsets too, so these ranges can be used as they are. Normalize the query with the same `Options`.

## Isnad splitting (experimental)

Behind the `isnad` feature, so the core stays small.

```rust
# #[cfg(feature = "isnad")] {
use nass::isnad::split_isnad;

let r = split_isnad("حدثنا أبو بكر بن أبي شيبة حدثنا عبد الله بن نمير عن هشام بن عروة عن أبيه عن عائشة أن النبي صلى الله عليه وسلم قال الحمى من فيح جهنم فابردوها بالماء"); // سنن ابن ماجه 3462
assert_eq!(r.matn, "الحمى من فيح جهنم فابردوها بالماء");
assert_eq!(r.confidence, 0.9);
assert_eq!(r.narrators[0].name, "أبو بكر بن أبي شيبة");
assert_eq!(r.narrators[0].form, "حدثنا");
assert_eq!(r.narrators.last().unwrap().name, "عائشة");
# }
```

It finds the right boundary on 88.3% of 300 held-out hadiths from the six books ([details](https://github.com/samt-qa/nass/blob/main/docs/corpus.md)). The API may change before 2.0.

## Performance

1 MB of fully vocalized hadith text (Ṣaḥīḥ al-Bukhārī), `cargo bench`, one desktop machine (Windows 11): clean 15.9 ms, search 21.4 ms, loose 21.7 ms.

## License

MIT © 2026 Samt Software.
