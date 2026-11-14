/// Arabic text normalization and diacritic-insensitive search for Quran,
/// hadith and heritage texts. Behaviour is defined by spec/SPEC.md and shared
/// test vectors; the Dart, TypeScript and PHP packages are identical.
library;

export 'src/isnad.dart' show splitIsnad, IsnadSplit, Narrator;
export 'src/names.dart' show nameKey;
export 'src/normalizer.dart'
    show Level, Honorifics, NormalizedText, normalize, normalizeWithMap;
export 'src/search.dart' show MatchMode, Match, findAll, contains, highlight;
