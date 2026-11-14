# nass

Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts, **with match offsets in the original vocalized text**. Pure Dart with no dependencies; works in Flutter, on the server and on the web.

تطبيع النص العربي والبحث فيه بلا اعتبار للحركات، مع مواضع التطابق في النص الأصلي المشكول.

This is the reference package of [nass](https://github.com/samt-qa/nass). The TypeScript (`@samt/nass`) and PHP (`samt/nass`) packages behave identically: all three pass the same shared test vectors.

```dart
import 'package:nass/nass.dart';

const text = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';

normalize(text);                                  // 'انما الاعمال بالنيات'
normalize(text, level: Level.clean);              // unchanged look: tatweel/invisibles removed
findAll(text, 'الاعمال');                          // [Match(9, 21, "الْأَعْمَالُ")]
highlight(text, 'الاعمال');                        // 'إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ'
contains(text, 'عمال', wholeWord: true);           // false
findAll(text, 'النيات انما', matchMode: MatchMode.allWords);

nameKey('أبي عبدِ الله البخاريّ رحمه الله');       // 'ابو عبدالله البخاري'
nameKey('عبد الله بن عمر رضي الله عنهما');         // 'عبدالله بن عمر'
```

## API

| Function | Returns |
|---|---|
| `normalize(text, {level, honorifics})` | normalized string |
| `normalizeWithMap(text, {level, honorifics})` | `NormalizedText(text, start, end)`: for each UTF-16 unit of the result, the span of its source in `text`. `toOriginal(s, e)` maps a span back. |
| `findAll(haystack, needle, {level, matchMode, wholeWord, honorifics})` | non-overlapping `Match(start, end, text)` in the **original** haystack |
| `contains(...)` | `bool` |
| `highlight(..., {open = '<mark>', close = '</mark>'})` | the original with matches wrapped. **Does not escape HTML.** |
| `nameKey(name)` | a key for comparing narrator names. Equal keys do **not** mean the same person. |
| `splitIsnad(text)` | experimental: `IsnadSplit(isnad, matn, confidence, narrators)` |

- `Level.clean`: for storage and display. The text looks the same.
- `Level.search` (default): removes diacritics and Quranic marks, unifies letter variants, converts digits, turns punctuation into spaces, and expands «ﷺ».
- `Level.loose`: also «ة»→«ه», «ؤ»→«و», «ئ»→«ي», and removes lone «ء».
- `Honorifics.strip`: removes «ﷺ», «صلى الله عليه وسلم», «رضي الله عنه» and similar. «تعالى», «عز وجل» and the like are removed only right after «الله».
- `MatchMode.phrase` (default), `allWords` (every word must occur), `anyWord`.

Offsets are UTF-16 code units, the same as `String.substring`. Every rule is defined in the [specification](https://github.com/samt-qa/nass/blob/main/spec/SPEC.md).

## splitIsnad (experimental)

```dart
final s = splitIsnad('حدثنا أبو بكر بن أبي شيبة حدثنا عبد الله بن نمير عن هشام بن عروة عن أبيه '
    'عن عائشة أن النبي صلى الله عليه وسلم قال الحمى من فيح جهنم فابردوها بالماء'); // سنن ابن ماجه 3462
s.matn;        // 'الحمى من فيح جهنم فابردوها بالماء'
s.confidence;  // 0.9
s.narrators;   // أبو بكر بن أبي شيبة (حدثنا), عبد الله بن نمير (حدثنا), هشام بن عروة (عن), أبيه (عن), عائشة (عن)
```

It is correct on 91 of 100 held-out hadiths from the six books ([details](https://github.com/samt-qa/nass/blob/main/docs/corpus.md)). The API may change before 2.0.

## Performance

About 26 ms per MB of fully vocalized text at the `search` level (Dart 3.13 VM, desktop). One pass for the character rules; written honorifics need a second, word-level pass.

## License

MIT © 2026 Samt Software.
