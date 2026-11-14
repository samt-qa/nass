<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Converts offsets between code points (used by this package and mb_substr)
 * and UTF-16 code units (used by JavaScript and Dart, and by spec/vectors).
 */
final class Offsets
{
    /** Code point offset in $text -> UTF-16 offset. */
    public static function toUtf16(string $text, int $codePoints): int
    {
        $units = 0;
        $cps = Normalizer::decode($text);
        for ($i = 0; $i < $codePoints && $i < count($cps); $i++) {
            $units += $cps[$i] > 0xFFFF ? 2 : 1;
        }
        return $units;
    }

    /** UTF-16 offset in $text -> code point offset. */
    public static function fromUtf16(string $text, int $units): int
    {
        $cps = Normalizer::decode($text);
        $u = 0;
        $i = 0;
        while ($u < $units && $i < count($cps)) {
            $u += $cps[$i] > 0xFFFF ? 2 : 1;
            $i++;
        }
        return $i;
    }

    /**
     * Converts a list of code point offsets to UTF-16 in one pass.
     *
     * @param list<int> $codePoints
     * @return list<int>
     */
    public static function listToUtf16(string $text, array $codePoints): array
    {
        $cps = Normalizer::decode($text);
        $prefix = [0];
        foreach ($cps as $i => $c) {
            $prefix[$i + 1] = $prefix[$i] + ($c > 0xFFFF ? 2 : 1);
        }
        return array_map(static fn (int $o): int => $prefix[$o], $codePoints);
    }
}
