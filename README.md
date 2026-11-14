# nass · نَصّ

**Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts, with match offsets in the original vocalized text.** One specification, three identical packages: Dart, TypeScript and PHP.

[العربية](README.ar.md) · [Specification](spec/SPEC.md) · [Test vectors (CC0)](spec/vectors) · [Corpus & isnad accuracy](docs/corpus.md) · [Live demo](https://samt-qa.github.io/nass/)

```text
search  «الاعمال»
in      إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ
→       إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ      (start 9, end 21 in the original)
```

## Why

Searching vocalized Arabic is easy to get *almost* right. Strip the diacritics and you can find the word, but you lose the position in the text the reader sees. Quranic marks, presentation forms like «ﷲ» and «ﻻ», honorific ligatures like «ﷺ», invisible direction marks and Persian letter variants each break naive search in their own way. Most libraries cover a subset, in one language, with no shared tests.

**nass** does three things differently:

1. **Offsets in the original.** Every normalized character maps back to its source span, so you can highlight the vocalized text the user is reading.
2. **One spec, three languages, byte-identical.** Dart, TypeScript and PHP pass the same 952 shared test vectors and a differential test against an independent implementation (0 mismatches in 172,463 comparisons over the six books).
3. **Built for religious texts.** Honorifics («ﷺ», «رضي الله عنه», «عز وجل» only after «الله»), a `nameKey` for narrator names, and an experimental isnad/matn splitter measured on hand-labelled hadiths from the six books.

## Packages

| Language | Package | Install | Docs |
|---|---|---|---|
| Dart / Flutter | `nass` | `dart pub add nass` | [packages/dart](packages/dart) |
| TypeScript / JS | `@samt/nass` | `npm i @samt/nass` | [packages/js](packages/js) |
| PHP ≥ 8.3 | `samt/nass` | `composer require samt/nass` | [packages/php](packages/php) |

> **Status: 0.1.0, not yet published.** The code is complete and tested. Publishing to pub.dev, npm and Packagist needs the maintainers' accounts. The test vectors are `review: pending` until a specialist has reviewed them.

## Quick start

```ts
import { normalize, findAll, highlight, nameKey } from "@samt/nass";
import { splitIsnad } from "@samt/nass/isnad"; // experimental, separate entry

normalize("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ");            // "انما الاعمال بالنيات"
findAll("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", "الاعمال");   // [{ start: 9, end: 21, text: "الْأَعْمَالُ" }]
highlight(text, "الاعمال", { wholeWord: true });           // wraps matches in <mark>
nameKey("أبي عبدِ الله البخاريّ رحمه الله");               // "ابو عبدالله البخاري"
```

```dart
import 'package:nass/nass.dart';

normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');                // 'انما الاعمال بالنيات'
findAll(text, 'الاعمال', matchMode: MatchMode.allWords);
```

```php
use Samt\Nass\Nass;

Nass::normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');           // 'انما الاعمال بالنيات'
Nass::highlight($text, 'الاعمال');                          // offsets are code points in PHP
```

## Normalization levels

| Level | Use | What it does |
|---|---|---|
| `clean` | storage, display | removes tatweel and invisible marks, decomposes presentation forms (except honorific ligatures), unifies whitespace, composes Arabic hamza/madda. **The text still looks the same.** |
| `search` (default) | search, indexing | + expands «ﷺ» and «﷽», removes diacritics and Quranic marks, unifies alef/yaa/kaf/haa variants, converts Arabic and Persian digits, turns punctuation into spaces, lowercases ASCII. With `honorifics: strip` it also removes written honorifics. |
| `loose` | tolerant search | + «ة» → «ه», «ؤ» → «و», «ئ» → «ي», removes lone «ء». Merges some different words on purpose. |

Every rule, with its reasons and Unicode ranges, is in [spec/SPEC.md](spec/SPEC.md).

## splitIsnad (experimental)

```ts
splitIsnad("حدثنا أبو بكر بن أبي شيبة حدثنا عبد الله بن نمير عن هشام بن عروة عن أبيه عن عائشة أن النبي صلى الله عليه وسلم قال الحمى من فيح جهنم فابردوها بالماء");
// { isnad: "حدثنا … أن النبي صلى الله عليه وسلم قال",
//   matn: "الحمى من فيح جهنم فابردوها بالماء", confidence: 0.9,
//   narrators: [{ name: "أبو بكر بن أبي شيبة", form: "حدثنا" }, …, { name: "عائشة", form: "عن" }] }
// (سنن ابن ماجه 3462, Open-Hadith-Data)
```

On 100 held-out hadiths from the six books it finds the correct isnad/matn boundary **91%** of the time (98% on the 100 design cases). See the [per-book results and the error analysis](docs/corpus.md). It is a heuristic parser, not a scholar, and `narrators` does not identify people.

## Performance

1 MB of fully vocalized hadith text (Ṣaḥīḥ al-Bukhārī) on one desktop machine (Windows 11):

| | clean | search | loose |
|---|---|---|---|
| Dart 3.13 VM | 24 ms | 26 ms | 28 ms |
| Node 22 | 34 ms | 38 ms | 39 ms |
| PHP 8.5, JIT on (`opcache.jit=tracing`) | 47 ms | 72 ms | 76 ms |
| PHP 8.5, no JIT | 132 ms | 227 ms | 238 ms |

The core JS bundle is **7.9 KB** min+gzip, with no runtime dependencies. `@samt/nass/isnad` adds about 2 KB and reuses the core.

## Compared with other libraries

From the review in November 2026 (all MIT). We started from scratch and borrowed ideas with credit.

| | nass | [arabic-normalize (TS)](https://github.com/Ifazawezk/arabic-normalize) | [arabic-normalize (Rust)](https://github.com/AbdeldjalilChougui/arabic-normalize) | [arabic_dev_utils (Dart)](https://github.com/BilalFali/arabic_dev_utils) |
|---|:-:|:-:|:-:|:-:|
| Offsets in the original text | ✔ | ✔ | — | — |
| Highlight in vocalized text | ✔ | ✔ | — | — |
| Presentation forms (ﷲ ﻻ ﷺ) | ✔ | ✔ | — | — |
| Quranic marks (dagger alef, pause marks) | ✔ | ✔ | ? | — |
| Arabic punctuation | ✔ | — | ? | ? |
| Whole-word search | ✔ | — | ? | ? |
| Narrator `nameKey`, isnad split | ✔ | — | — | — |
| Languages, same behaviour | Dart · TS · PHP | TS | Rust · Python | Dart |
| Shared test vectors (CC0) | 952 | — | — | — |

✔ supported · — missing · ? not checked in the review.

Running our vectors against the other libraries (PRD §8.8) is still to do.

## Repository

```text
spec/SPEC.md            the specification (Arabic)          spec/vectors/   shared test vectors (CC0)
tools/tables.src.json   single source of character tables   tools/*.mjs     generators, oracle, checks
packages/dart | js | php                                    docs/           corpus notes, demo page
```

```bash
node tools/gen-tables.mjs --check   # generated tables match the source and Unicode 17
node tools/check-vectors.mjs        # structure and properties of every test case
node tools/fetch-corpus.mjs && node tools/differential.mjs   # Dart vs independent oracle
```

Every package's tests run the shared vectors. CI runs all of the above on every push ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Contributing

Behaviour changes start in `spec/SPEC.md` and `spec/vectors/`, then all three packages follow. Do not add Quran or hadith text to the tests without a cited source. Commit messages are in English; documentation is in both languages.

## License

Code: [MIT](LICENSE) © 2026 Samt Software. Test vectors: [CC0](spec/vectors/LICENSE); the religious texts quoted in them belong to no one, and their source is cited per case. Hadith data: Open-Hadith-Data (ODbL/DbCL).
