# samt/nass

Arabic text normalization and diacritic-insensitive search for Quran, hadith and heritage texts, **with match offsets in the original vocalized text**. PHP ≥ 8.3 with `mbstring`; no other dependencies.

تطبيع النص العربي والبحث فيه بلا اعتبار للحركات، مع مواضع التطابق في النص الأصلي المشكول.

Part of [nass](https://github.com/samt-qa/nass): the Dart (`nass`) and TypeScript (`@samt/nass`) packages behave identically.

> **Security: PHP2Shell.** CVE-2026-109618 and CVE-2026-109619 were fixed on 2026-10-21. Run this package, and anything else, only on a patched PHP: **8.3.36+, 8.4.27+ or 8.5.12+**. PHP 8.2 is not supported.

```bash
composer require samt/nass
```

```php
use Samt\Nass\{Nass, Level, Honorifics, MatchMode, Offsets};

$text = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';

Nass::normalize($text);                                  // 'انما الاعمال بالنيات'
Nass::normalize($text, Level::Loose, Honorifics::Strip);
Nass::findAll($text, 'الاعمال');                          // [SearchMatch(start: 9, end: 21, text: 'الْأَعْمَالُ')]
Nass::highlight($text, 'الاعمال');                        // 'إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ'
Nass::highlight($text, 'النيات', '<b>', '</b>');
Nass::contains($text, 'عمال', wholeWord: true);           // false
Nass::findAll($text, 'النيات انما', matchMode: MatchMode::AllWords);
Nass::nameKey('أبي عبدِ الله البخاريّ رحمه الله');        // 'ابو عبدالله البخاري'
Nass::splitIsnad($hadith);                                // experimental: IsnadSplit(isnad, matn, confidence, narrators)
```

## Offsets are code points

Unlike the Dart and JS packages (UTF-16), offsets here are **code points**, which is what `mb_substr()` uses. For Arabic text the two are the same; they differ only with characters outside the BMP, such as emoji. To exchange offsets with JavaScript or Dart:

```php
Offsets::toUtf16($text, $codePointOffset);
Offsets::fromUtf16($text, $utf16Offset);
```

`highlight()` does **not** escape HTML. Escape untrusted text first. `nameKey()` equality does **not** mean the same person.

## Levels

- `Level::Clean`: for storage and display. The text looks the same.
- `Level::Search` (default): removes diacritics and Quranic marks, unifies letters, digits and punctuation, and expands «ﷺ».
- `Level::Loose`: also «ة»→«ه», «ؤ»→«و», «ئ»→«ي».

The full rules are in the [specification](https://github.com/samt-qa/nass/blob/main/spec/SPEC.md).

## Performance

1 MB of fully vocalized text, PHP 8.5 on a desktop machine:

| | clean | search | loose |
|---|---|---|---|
| with JIT (`opcache.enable_cli=1`, `opcache.jit=tracing`) | 47 ms | 72 ms | 76 ms |
| without JIT | 132 ms | 227 ms | 238 ms |

The project target is under 150 ms per MB. That holds **with the JIT** (the usual setup with PHP-FPM and opcache) but not without it. For bulk indexing without the JIT, normalize once and store the result.

## Tests

```bash
composer test   # runs the shared vectors, the isnad reference and the property checks
```

## License

MIT © 2026 Samt Software.
