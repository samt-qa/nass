/**
 * Arabic text normalization and diacritic-insensitive search for Quran,
 * hadith and heritage texts. Behaviour is defined by spec/SPEC.md and shared
 * test vectors; the Dart, TypeScript and PHP packages are identical.
 * @packageDocumentation
 */
export { normalize, normalizeWithMap } from "./normalizer.js";
export type { Level, Honorifics, NormalizeOptions, NormalizedText } from "./normalizer.js";
export { findAll, contains, highlight } from "./search.js";
export type { MatchMode, SearchOptions, HighlightOptions, Match } from "./search.js";
export { nameKey } from "./names.js";
// splitIsnad (experimental) lives in the separate entry "@samt-qa/nass/isnad".
