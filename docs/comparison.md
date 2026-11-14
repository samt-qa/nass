# Comparison with other libraries

nass's conformance tests (`spec/vectors/normalize.json`, 304 cases, and
`spec/vectors/search.json`, 150 cases, spec version 0.2) were run against three other
MIT-licensed Arabic normalization libraries. This page reports what happened.

- Run on: 2026-11-14
- Harness: [`tools/compare/`](../tools/compare/) (how each library is loaded, the option
  mapping, and how to reproduce)
- Raw results, every case with input, expected and actual output:
  `tools/compare/results/*.json`

| Library | Language | Commit tested | Commit date |
|---|---|---|---|
| [Ifazawezk/arabic-normalize](https://github.com/Ifazawezk/arabic-normalize) 0.1.0 | TypeScript | `353b6936e2c53a369d6f4ce0aacaef5988511dd8` | 2026-11-04 |
| [AbdeldjalilChougui/arabic-normalize](https://github.com/AbdeldjalilChougui/arabic-normalize) 0.1.0 | Rust (Python bindings not built; the crate was called directly) | `a2cf9d5aefd791951af63ae1a4ea0a9938b4be1d` | 2026-09-04 |
| [BilalFali/arabic_dev_utils](https://github.com/BilalFali/arabic_dev_utils) 0.2.0 | Dart | `46c07179a582a247ab210e47eb14e94d6acdf02b` | 2026-09-22 |

## How to read the numbers

- **pass**: output equals `expected` exactly. For search, the list of
  `{start, end, text}` hits equals `expected` exactly.
- **fail**: the library has a matching function and option, and its output differs.
- **unsupported**: the library has no function or option for the case. Examples: no
  option to remove written honorific phrases (`honorifics: "strip"`), no whole-word or
  all-words search, no search function that returns positions.
- Each nass level (`clean`, `search`, `loose`) was mapped to the nearest settings of each
  library. The mapping is in [`tools/compare/README.md`](../tools/compare/README.md#mapping-of-nass-options).
- The expected values follow nass's spec, which makes choices the other libraries do not
  share (for example, punctuation becomes a space at the `search` level, and ء is dropped
  at the `loose` level). A failure means the output differs from that spec. It does not
  mean the library is wrong for its own stated purpose.

## Summary

| | TS | Rust | Dart |
|---|:-:|:-:|:-:|
| normalize: pass / fail / unsupported (of 304) | 179 / 26 / 99 | 76 / 129 / 99 | 65 / 140 / 99 |
| normalize: pass rate of supported cases | 87% (179/205) | 37% (76/205) | 32% (65/205) |
| normalize: failures that are whitespace only | 0 | 53 | 50 |
| search: pass / fail / unsupported (of 150) | 63 / 0 / 87 | 0 / 0 / 150 | 0 / 0 / 150 |

"Whitespace only" counts failures that would pass if runs of whitespace in the library's
output were collapsed to one space and trimmed (nass rule C5). The Rust and Dart libraries
do not collapse whitespace. Most of these cases are hadith text in which each word is
surrounded by RIGHT-TO-LEFT MARKs (`U+200F U+0020 U+200F`); removing the marks leaves two
spaces.

The Dart library's `ArabicSearch.matches()` returns a boolean, so it cannot pass a case
that expects positions. Compared only on "found or not" for the 63 phrase cases, it agrees
with `expected` in 37. Of the 26 disagreements, 24 are multi-word needles in the hadith
text above, where the double spaces prevent a match. The other two are `search-lig-001` (needle «لل»
inside «ﷲ», not expanded) and `search-loose-002` (`مدرسه` found in `مدرسة`, which nass
finds only at the `loose` level).

## Normalize, by rule family

Each cell is pass / fail / unsupported.

| Family | Cases | TS | Rust | Dart |
|---|--:|:-:|:-:|:-:|
| C1 canonical order and composition | 8 | 8 / 0 / 0 | 0 / 8 / 0 | 0 / 8 / 0 |
| C2 invisible characters | 8 | 7 / 1 / 0 | 5 / 3 / 0 | 5 / 3 / 0 |
| C3 tatweel | 2 | 2 / 0 / 0 | 2 / 0 / 0 | 2 / 0 / 0 |
| C4 presentation forms | 9 | 7 / 2 / 0 | 2 / 7 / 0 | 2 / 7 / 0 |
| C4+S3 | 1 | 1 / 0 / 0 | 0 / 1 / 0 | 0 / 1 / 0 |
| C5 whitespace | 3 | 3 / 0 / 0 | 0 / 3 / 0 | 0 / 3 / 0 |
| S1 honorific ligatures, basmala | 6 | 2 / 1 / 3 | 0 / 3 / 3 | 0 / 3 / 3 |
| S2 marks | 10 | 9 / 1 / 0 | 6 / 4 / 0 | 5 / 5 / 0 |
| S2+S3 | 1 | 1 / 0 / 0 | 1 / 0 / 0 | 1 / 0 / 0 |
| S3 letter folding | 8 | 6 / 2 / 0 | 6 / 2 / 0 | 2 / 6 / 0 |
| S4 digits | 6 | 5 / 1 / 0 | 3 / 3 / 0 | 0 / 6 / 0 |
| S5 punctuation | 9 | 4 / 5 / 0 | 2 / 7 / 0 | 2 / 7 / 0 |
| S6 Latin case | 1 | 0 / 1 / 0 | 0 / 1 / 0 | 0 / 1 / 0 |
| S7 written honorific phrases | 11 | 0 / 0 / 11 | 0 / 0 / 11 | 0 / 0 / 11 |
| L1 teh marbuta and hamza (`loose`) | 8 | 3 / 3 / 2 | 3 / 3 / 2 | 1 / 5 / 2 |
| edge cases | 4 | 2 / 2 / 0 | 2 / 2 / 0 | 2 / 2 / 0 |
| hadith corpus, `clean` | 42 | 42 / 0 / 0 | 14 / 28 / 0 | 14 / 28 / 0 |
| hadith corpus, `search` | 42 | 42 / 0 / 0 | 16 / 26 / 0 | 16 / 26 / 0 |
| hadith corpus, `search` + strip honorifics | 42 | 0 / 0 / 42 | 0 / 0 / 42 | 0 / 0 / 42 |
| hadith corpus, `loose` | 42 | 35 / 7 / 0 | 14 / 28 / 0 | 13 / 29 / 0 |
| hadith corpus, `loose` + strip honorifics | 41 | 0 / 0 / 41 | 0 / 0 / 41 | 0 / 0 / 41 |
| **Total** | **304** | **179 / 26 / 99** | **76 / 129 / 99** | **65 / 140 / 99** |

## Search, by option

Search cases have no `rule` field, so they are grouped by the option they test.

| Option | Cases | TS | Rust | Dart |
|---|--:|:-:|:-:|:-:|
| phrase (default) | 35 | 35 / 0 / 0 | 0 / 0 / 35 | 0 / 0 / 35 |
| phrase, `level: loose` | 28 | 28 / 0 / 0 | 0 / 0 / 28 | 0 / 0 / 28 |
| `wholeWord: true` | 30 | 0 / 0 / 30 | 0 / 0 / 30 | 0 / 0 / 30 |
| `matchMode: allWords` | 29 | 0 / 0 / 29 | 0 / 0 / 29 | 0 / 0 / 29 |
| `matchMode: anyWord` | 28 | 0 / 0 / 28 | 0 / 0 / 28 | 0 / 0 / 28 |
| **Total** | **150** | **63 / 0 / 87** | **0 / 0 / 150** | **0 / 0 / 150** |

The TypeScript library's `findAll` returns positions in the original text and matched
every phrase case, including the offsets. The Rust crate has no search or find function
(it has `tokenize` and `search_terms`, which stems words). The Dart library has a boolean
`matches()` only.

## Representative failures

Code points are written as `U+XXXX` where the character is invisible or easy to confuse.

**1. Punctuation between words (TS, rule S5, `norm-search-015`, level `search`)**

| | |
|---|---|
| Input | `العلم،والعمل` (ARABIC COMMA U+060C between the words, no space) |
| Expected | `العلم والعمل` |
| TS output | `العلم،والعمل` |

The library has no punctuation step, so the two words stay joined. Rust and Dart give the
same output.

**2. Zero width joiner in an emoji (Rust, rule C2, `norm-clean-004`, level `clean`)**

| | |
|---|---|
| Input | 👨‍👩‍👧 (`U+1F468 U+200D U+1F469 U+200D U+1F467`) |
| Expected | unchanged |
| Rust output | 👨👩👧 (`U+1F468 U+1F469 U+1F467`, three separate emoji) |

The crate's `bidi_marks` option removes U+200C and U+200D everywhere. The Dart library's
`stripInvisibleChars` does the same, so both also fail `norm-search-028` (ZWNJ between two
Latin letters, which nass keeps). The TS library removes them only next to Arabic letters
and passes both.

**3. Presentation forms (Rust and Dart, rule C4, `norm-clean-009`, level `clean`)**

| | |
|---|---|
| Input | `ﻣﺤﻤﺪ` (`U+FEE3 U+FEA4 U+FEE4 U+FEAA`, as found in text extracted from PDFs) |
| Expected | `محمد` |
| Rust output | `ﻣﺤﻤﺪ` (unchanged) |
| Dart output | `ﻣﺤﻤﺪ` (unchanged) |

Neither library maps Arabic Presentation Forms A/B to base letters. The TS library does
(through NFKC per character) and passes.

**4. Small Quranic letters (Rust and Dart, rule S2, `norm-search-005`, level `search`)**

| | |
|---|---|
| Input | `إِنَّهُۥ` (ends with ARABIC SMALL WAW U+06E5) |
| Expected | `انه` |
| Rust output | `انهۥ` |
| Dart output | `انهۥ` |

The Rust crate's diacritic list skips U+06E5–06E6. The Dart library removes only
U+064B–0652 and U+0670, so it also keeps the Quranic pause marks (`norm-search-007`) and
U+06E7 (`norm-search-006`, output `النبيۧن`).

## Differences that follow from nass's own choices

Some failures come from choices made in `spec/SPEC.md` rather than from anything the
other library documents as a goal:

- `clean` keeps ﷺ (U+FDFA) as is; the TS library expands it to «صلى الله عليه وسلم» through
  NFKC (`norm-clean-010`, `gen-norm-rule-005`).
- `search` turns ARABIC SMALL HIGH YEH (U+06E7) into ي, so «ٱلنَّبِيِّـۧنَ» becomes
  `النبيين` (`norm-search-006`, changed in spec 0.2). The TS and Rust libraries remove
  U+06E7 as a mark and give `النبين`; the Dart library keeps it.
- `clean` keeps ZERO WIDTH NON-JOINER (U+200C), because it is part of how Persian and Urdu
  words are written («می‌خواهم», `norm-clean-003`, changed in spec 0.2). All three
  libraries remove it at the settings mapped to `clean`. At `search` nass removes it next
  to an Arabic letter (`norm-search-027`); TS and Rust pass that case, and the Dart library
  fails it only because it keeps Farsi yeh (ی U+06CC).
- `search` turns punctuation into a space (S5) and lowercases ASCII letters (S6). None of
  the three libraries does either.
- `loose` drops ء (L1). None of the three libraries has this option. Of the 7 TS failures
  in the `loose` hadith corpus, 5 are a kept ء and 2 a kept brace (`{` or `}`, rule S5).

## Not tested

- The Rust crate's Python bindings: they need pyo3 and maturin. They wrap the same Rust
  functions (`python/src/lib.rs`), so the results should be the same, but this was not run.
- The libraries' other features (tokenizing, stemming, stop words, Hijri dates, RTL
  helpers) have no counterpart in these vectors.

---

## ملخص بالعربية

شغّلنا ملفات اختبار «نَصّ» المشتركة، الإصدار 0.2 (304 حالة تطبيع و150 حالة بحث) على ثلاث مكتبات أخرى
بتاريخ 2026-11-14، كلٌّ منها عند إيداع محدد مذكور أعلاه.

- **arabic-normalize (TypeScript):** نجح في 179 حالة تطبيع وأخفق في 26، و99 حالة لا مقابل لها
  عنده (أغلبها حذف صيغ الترضّي المكتوبة). في البحث نجح في كل حالات العبارة الـ63 بمواضعها،
  ولا يدعم البحث بالكلمة الكاملة ولا `allWords` ولا `anyWord`.
- **arabic-normalize (Rust):** نجح في 76 وأخفق في 129، منها 53 سببها المسافات وحدها (لا يوحّد
  المسافات). ليس فيه دالة بحث، فكل حالات البحث بلا مقابل.
- **arabic_dev_utils (Dart):** نجح في 65 وأخفق في 140، منها 50 سببها المسافات وحدها. دالة البحث
  فيه تعيد صحيحًا أو خطأ بلا مواضع، فكل حالات البحث بلا مقابل؛ ونتيجتها توافق المتوقع في 37
  من 63 حالة عبارة.

الإخفاق هنا معناه أن المخرج يخالف مواصفة «نَصّ»، لا أن المكتبة مخطئة في غرضها هي. خطوات
إعادة التشغيل في `tools/compare/README.md`.
