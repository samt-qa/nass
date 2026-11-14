<?php

declare(strict_types=1);

namespace Samt\Nass;

// Small value types. Kept in one file and loaded by the autoloader map in
// composer.json ("files") or by tests/bootstrap.php.

/** Normalization level (SPEC §1). Each level includes the previous one. */
enum Level: string
{
    case Clean = 'clean';
    case Search = 'search';
    case Loose = 'loose';
}

/** How honorific formulas and ligatures are treated (SPEC S1, S7). */
enum Honorifics: string
{
    case Keep = 'keep';
    case Strip = 'strip';
}

/** How the needle is matched (SPEC §6). */
enum MatchMode: string
{
    case Phrase = 'phrase';
    case AllWords = 'allWords';
    case AnyWord = 'anyWord';
}

/**
 * Normalized text plus, for every code point of $text, the [start, end) span of
 * its source group in the original string, in CODE POINTS.
 * Use Offsets::toUtf16() to talk to JavaScript or Dart.
 */
final class NormalizedText
{
    /**
     * @param list<int> $start
     * @param list<int> $end
     */
    public function __construct(
        public readonly string $text,
        public readonly array $start,
        public readonly array $end,
    ) {
    }
}

/** A match in the ORIGINAL haystack: [start, end) in code points. */
final class SearchMatch
{
    public function __construct(
        public readonly int $start,
        public readonly int $end,
        public readonly string $text,
    ) {
    }
}

/** A narrator found in an isnad. */
final class Narrator
{
    public function __construct(
        public readonly string $name,
        public readonly string $form,
    ) {
    }
}

/** Result of Nass::splitIsnad() (experimental). */
final class IsnadSplit
{
    /** @param list<Narrator> $narrators */
    public function __construct(
        public readonly string $isnad,
        public readonly string $matn,
        public readonly float $confidence,
        public readonly array $narrators,
    ) {
    }
}
