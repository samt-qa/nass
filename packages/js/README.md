# @samt-qa/nass

Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts, **with match offsets in the original vocalized text**. No dependencies, ESM and CommonJS, runs in browsers and Node ≥ 18. The core is **7.9 KB** min+gzip.

تطبيع النص العربي والبحث فيه بلا اعتبار للحركات، مع مواضع التطابق في النص الأصلي المشكول.

Part of [nass](https://github.com/samt-qa/nass): the Dart (`nass`), PHP (`samt/nass`) and Rust (`nass` crate) packages behave identically.

```bash
npm i @samt-qa/nass
```

```ts
import { normalize, normalizeWithMap, findAll, contains, highlight, nameKey } from "@samt-qa/nass";

const text = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ";

normalize(text);                                   // "انما الاعمال بالنيات"
normalize(text, { level: "loose" });
findAll(text, "الاعمال");                           // [{ start: 9, end: 21, text: "الْأَعْمَالُ" }]
highlight(text, "الاعمال");                         // "إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ"
contains(text, "عمال", { wholeWord: true });        // false
findAll(text, "النيات انما", { matchMode: "allWords" });
nameKey("أبي عبدِ الله البخاريّ رحمه الله");        // "ابو عبدالله البخاري"
```

## API

| Function | Returns |
|---|---|
| `normalize(text, { level?, honorifics? })` | normalized string |
| `normalizeWithMap(text, opts)` | `{ text, start, end }`: for each UTF-16 unit of the result, the span of its source |
| `findAll(haystack, needle, { level?, matchMode?, wholeWord?, honorifics? })` | non-overlapping `{ start, end, text }` in the **original** haystack |
| `contains(haystack, needle, opts)` | `boolean` |
| `highlight(haystack, needle, { ...opts, open?, close? })` | the original with matches wrapped in `<mark>`. **Does not escape HTML.** Escape untrusted text yourself. |
| `nameKey(name)` | a key for comparing narrator names. Equal keys do **not** mean the same person. |

- `level`: `"clean"` (storage and display; the text looks the same), `"search"` (default), `"loose"`.
- `honorifics`: `"keep"` (default) or `"strip"`, which removes «ﷺ», «رضي الله عنه», and «تعالى» or «عز وجل» right after «الله».
- `matchMode`: `"phrase"` (default), `"allWords"`, `"anyWord"`.

Offsets are UTF-16 code units, the same as `String.prototype.slice`. Every rule is defined in the [specification](https://github.com/samt-qa/nass/blob/main/spec/SPEC.md).

## Isnad splitting (experimental)

`splitIsnad` lives in a separate entry so it does not grow the core bundle. It imports the core at run time and adds about 2 KB.

```ts
import { splitIsnad } from "@samt-qa/nass/isnad";

const r = splitIsnad("حدثنا أبو بكر بن أبي شيبة حدثنا عبد الله بن نمير عن هشام بن عروة عن أبيه عن عائشة أن النبي صلى الله عليه وسلم قال الحمى من فيح جهنم فابردوها بالماء"); // سنن ابن ماجه 3462
r.matn;        // "الحمى من فيح جهنم فابردوها بالماء"
r.confidence;  // 0.9
r.narrators;   // [{ name: "أبو بكر بن أبي شيبة", form: "حدثنا" }, …, { name: "عائشة", form: "عن" }]
```

It is correct on 91 of 100 held-out hadiths from the six books ([details](https://github.com/samt-qa/nass/blob/main/docs/corpus.md)). The API may change before 2.0.

## Performance

About 38 ms per MB of fully vocalized text at the `search` level (Node 22, desktop).

## License

MIT © 2026 Samt Software.
