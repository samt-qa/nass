<div align="center">

# nass · نَصّ

**Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts —<br>with match offsets in the original vocalized text.**

One specification · three byte-identical packages · Dart, TypeScript and PHP

[![CI](https://github.com/samt-qa/nass/actions/workflows/ci.yml/badge.svg)](https://github.com/samt-qa/nass/actions/workflows/ci.yml)
[![pub.dev](https://img.shields.io/pub/v/nass?logo=dart&label=pub.dev)](https://pub.dev/packages/nass)
[![npm](https://img.shields.io/npm/v/@samt-qa/nass?logo=npm&label=npm)](https://www.npmjs.com/package/@samt-qa/nass)
[![Packagist](https://img.shields.io/packagist/v/samt/nass?logo=packagist&logoColor=white&label=packagist)](https://packagist.org/packages/samt/nass)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Test vectors: CC0](https://img.shields.io/badge/test%20vectors-CC0-lightgrey.svg)](spec/vectors)
[![Unicode 17](https://img.shields.io/badge/Unicode-17.0-informational.svg)](spec/SPEC.md)
![Dart](https://img.shields.io/badge/Dart-3.x-0175C2?logo=dart&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM%20%7C%20CJS-3178C6?logo=typescript&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-%E2%89%A5%208.3-777BB4?logo=php&logoColor=white)

[العربية](README.ar.md) · [Specification](spec/SPEC.md) · [Test vectors](spec/vectors) · [Corpus & isnad accuracy](docs/corpus.md)

</div>

```text
search  «الاعمال»
in      إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ
→       إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ      (start 9, end 21 in the original)
```

## Contents

- [Why nass](#why-nass)
- [Packages](#packages)
- [Quick start](#quick-start)
- [Normalization levels](#normalization-levels)
- [splitIsnad (experimental)](#splitisnad-experimental)
- [Quality and testing](#quality-and-testing)
- [Performance](#performance)
- [Compared with other libraries](#compared-with-other-libraries)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)
- [License](#license)

## Why nass

Searching vocalized Arabic is easy to get *almost* right. Strip the diacritics and you can find the word, but you lose its position in the text the reader sees. Quranic marks, presentation forms such as «ﷲ» and «ﻻ», honorific ligatures such as «ﷺ», invisible direction marks and Persian letter variants each break naive search in their own way. Most libraries cover a subset, in one language, with no shared tests.

| | |
|---|---|
| **Offsets in the original** | Every normalized character maps back to its source span, so you highlight the vocalized text the user is actually reading. |
| **One spec, three languages** | Dart, TypeScript and PHP pass the same 1,254 shared test vectors, plus a differential test against an independent implementation: 0 mismatches in 172,463 comparisons over the six books. |
| **Built for religious texts** | Honorifics («ﷺ», «رضي الله عنه», «عز وجل» only after «الله»), a `nameKey` for narrator names, and an experimental isnad/matn splitter measured on hand-labelled hadiths. |
| **Small and dependency-free** | The core JS bundle is 7.9 KB min+gzip with no runtime dependencies; the Dart and PHP packages have none either. |

## Packages

| Language | Package | Install | Docs |
|---|---|---|---|
| Dart / Flutter | `nass` | `dart pub add nass` | [packages/dart](packages/dart) |
| TypeScript / JavaScript | `@samt-qa/nass` | `npm i @samt-qa/nass` | [packages/js](packages/js) |
| PHP ≥ 8.3 | `samt/nass` | `composer require samt/nass` | [packages/php](packages/php) |

> [!NOTE]
> **Version 0.2.0.** Published on [pub.dev](https://pub.dev/packages/nass), [npm](https://www.npmjs.com/package/@samt-qa/nass) and [Packagist](https://packagist.org/packages/samt/nass). All test vectors are reviewed and approved ([SPEC §12–13](spec/SPEC.md)).

## Quick start

<details open>
<summary><b>TypeScript / JavaScript</b></summary>

```ts
import { normalize, findAll, highlight, nameKey } from "@samt-qa/nass";
import { splitIsnad } from "@samt-qa/nass/isnad"; // experimental, separate entry

normalize("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ");            // "انما الاعمال بالنيات"
findAll("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", "الاعمال");   // [{ start: 9, end: 21, text: "الْأَعْمَالُ" }]
highlight(text, "الاعمال", { wholeWord: true });           // wraps matches in <mark>
nameKey("أبي عبدِ الله البخاريّ رحمه الله");               // "ابو عبدالله البخاري"
```
</details>

<details>
<summary><b>Dart / Flutter</b></summary>

```dart
import 'package:nass/nass.dart';

normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');                // 'انما الاعمال بالنيات'
findAll(text, 'الاعمال', matchMode: MatchMode.allWords);
highlight(text, 'الاعمال');
```
</details>

<details>
<summary><b>PHP</b></summary>

```php
use Samt\Nass\Nass;

Nass::normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');           // 'انما الاعمال بالنيات'
Nass::highlight($text, 'الاعمال');                          // offsets are code points in PHP
```
</details>

## Normalization levels

| Level | Use | What it does |
|---|---|---|
| `clean` | storage, display | Removes tatweel and invisible marks, decomposes presentation forms (except honorific ligatures), unifies whitespace, composes Arabic hamza/madda. **The text still looks the same.** |
| `search` *(default)* | search, indexing | Everything in `clean`, plus: expands «ﷺ» and «﷽», removes diacritics and Quranic marks, unifies alef/yaa/kaf/haa variants, converts Arabic and Persian digits, turns punctuation into spaces, lowercases ASCII. With `honorifics: strip` it also removes written honorifics. |
| `loose` | tolerant search | Everything in `search`, plus: «ة» → «ه», «ؤ» → «و», «ئ» → «ي», removes lone «ء». Merges some different words on purpose. |

Every rule, with its rationale and Unicode ranges, is in [spec/SPEC.md](spec/SPEC.md).

## splitIsnad (experimental)

```ts
splitIsnad("حدثنا أبو بكر بن أبي شيبة حدثنا عبد الله بن نمير عن هشام بن عروة عن أبيه عن عائشة أن النبي صلى الله عليه وسلم قال الحمى من فيح جهنم فابردوها بالماء");
// { isnad: "حدثنا … أن النبي صلى الله عليه وسلم قال",
//   matn: "الحمى من فيح جهنم فابردوها بالماء", confidence: 0.9,
//   narrators: [{ name: "أبو بكر بن أبي شيبة", form: "حدثنا" }, …, { name: "عائشة", form: "عن" }] }
// (سنن ابن ماجه 3462, Open-Hadith-Data)
```

| Set | Cases | Correct boundary |
|---|---|---|
| Design (dev) | 300 | **98.3%** |
| Held out (test, measured once) | 200 | **88.0%** |

The 0.1 algorithm scores 87.5% on the same held-out set, so 0.2 barely improves on unseen hadiths. `splitIsnad` stays experimental until a held-out set reaches 90%.

Per-book results and the error analysis are in [docs/corpus.md](docs/corpus.md).

> [!IMPORTANT]
> `splitIsnad` is a heuristic parser, not a scholar. `narrators` does not identify people, and two names with the same `nameKey` are not necessarily the same person.

## Quality and testing

| Check | Result |
|---|---|
| Shared test vectors (normalize, offsets, search, names, isnad) | 1,254 cases, all three packages |
| Differential test vs. independent oracle (six books) | 0 mismatches / 172,463 |
| Line coverage | Dart 99.3% · TypeScript 99.6% · PHP 97.9% |
| CI matrix | Dart 3.13 · Node 20 / 22 / 24 · PHP 8.3 / 8.4 / 8.5 |
| Property tests | idempotence and `clean ⊂ search` on random input |

## Performance

1 MB of fully vocalized hadith text (Ṣaḥīḥ al-Bukhārī), one desktop machine (Windows 11):

| Runtime | clean | search | loose |
|---|--:|--:|--:|
| Dart 3.13 VM | 24 ms | 26 ms | 28 ms |
| Node 22 | 34 ms | 38 ms | 39 ms |
| PHP 8.5, JIT on (`opcache.jit=tracing`) | 47 ms | 72 ms | 76 ms |
| PHP 8.5, no JIT | 132 ms | 227 ms | 238 ms |

The core JS bundle is **7.9 KB** min+gzip; `@samt-qa/nass/isnad` adds about 2 KB and reuses the core.

## Compared with other libraries

From a review in November 2026 (all MIT-licensed). nass was written from scratch; ideas borrowed are credited.

| | nass | [arabic-normalize (TS)](https://github.com/Ifazawezk/arabic-normalize) | [arabic-normalize (Rust)](https://github.com/AbdeldjalilChougui/arabic-normalize) | [arabic_dev_utils (Dart)](https://github.com/BilalFali/arabic_dev_utils) |
|---|:-:|:-:|:-:|:-:|
| Offsets in the original text | ✅ | ✅ | — | — |
| Highlight in vocalized text | ✅ | ✅ | — | — |
| Presentation forms (ﷲ ﻻ ﷺ) | ✅ | ✅ | — | — |
| Quranic marks (dagger alef, pause marks) | ✅ | ✅ | ? | — |
| Narrator `nameKey`, isnad split | ✅ | — | — | — |
| Same behaviour across languages | Dart · TS · PHP | TS | Rust · Python | Dart |
| Shared test vectors (CC0) | 1,254 | — | — | — |

✅ supported · — not supported · ? not checked in the review

nass's shared vectors were also run against these three libraries; the per-rule results, failures and how to reproduce them are in **[docs/comparison.md](docs/comparison.md)**. On the 203 normalize cases each library supports, the pass rates were 88% (TS), 38% (Rust) and 33% (Dart); a failure means the output differs from nass's spec, not that the library is wrong for its own purpose.

## Repository layout

```text
spec/
  SPEC.md              the specification (Arabic)
  vectors/             shared test vectors (CC0)
tools/
  tables.src.json      single source of the character tables
  *.mjs                generators, independent oracle, checks, isnad evaluation
packages/
  dart/  js/  php/     the three implementations
docs/
  corpus.md            text sources, licences, isnad protocol and results
```

```bash
node tools/gen-tables.mjs --check                           # tables match the source and Unicode 17
node tools/check-vectors.mjs                                # structure and properties of every case
node tools/fetch-corpus.mjs && node tools/differential.mjs  # reference vs. independent oracle
```

CI runs all of the above on every push ([ci.yml](.github/workflows/ci.yml)).

## Contributing

1. Behaviour changes start in `spec/SPEC.md` and `spec/vectors/`; all three packages then follow.
2. Never add Quran or hadith text to the tests without a cited source.
3. Commit messages are in English; documentation is in both languages.

## License

- Code: [MIT](LICENSE) © 2026 Samt Software.
- Test vectors: [CC0](spec/vectors/LICENSE). The religious texts quoted in them belong to no one; each case cites its source.
- Hadith data: [Open-Hadith-Data](https://github.com/mhashim6/Open-Hadith-Data) (ODbL / DbCL).
