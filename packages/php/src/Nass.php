<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Arabic text normalization and diacritic-insensitive search for Quran,
 * hadith and heritage texts. Behaviour is defined by spec/SPEC.md and shared
 * test vectors; the Dart, TypeScript and PHP packages are identical.
 *
 * All offsets in this package are CODE POINTS (what mb_substr() uses).
 * Use Offsets::toUtf16() / Offsets::fromUtf16() to exchange offsets with
 * JavaScript or Dart.
 */
final class Nass
{
    /** Normalizes text (SPEC §1). Deterministic and idempotent. */
    public static function normalize(string $text, Level $level = Level::Search, Honorifics $honorifics = Honorifics::Keep): string
    {
        [$cp] = Normalizer::run(Normalizer::decode($text), $level, $honorifics);
        return Normalizer::encode($cp);
    }

    /** Normalizes text and maps every code point of the result to its source span (SPEC §5). */
    public static function normalizeWithMap(string $text, Level $level = Level::Search, Honorifics $honorifics = Honorifics::Keep): NormalizedText
    {
        [$cp, $s, $e] = Normalizer::run(Normalizer::decode($text), $level, $honorifics);
        return new NormalizedText(Normalizer::encode($cp), $s, $e);
    }

    /**
     * All non-overlapping matches of $needle in $haystack, as code point spans of the ORIGINAL haystack.
     *
     * @return list<SearchMatch>
     */
    public static function findAll(
        string $haystack,
        string $needle,
        Level $level = Level::Search,
        MatchMode $matchMode = MatchMode::Phrase,
        bool $wholeWord = false,
        Honorifics $honorifics = Honorifics::Keep,
    ): array {
        [$ncp] = Normalizer::run(Normalizer::decode($needle), $level, $honorifics);
        if ($ncp === []) {
            return [];
        }
        $orig = Normalizer::decode($haystack);
        [$hcp, $hs, $he] = Normalizer::run($orig, $level, $honorifics);
        $hay = ['cp' => $hcp, 's' => $hs, 'e' => $he, 'orig' => $orig];
        if ($matchMode === MatchMode::Phrase) {
            return self::phrase($hay, $ncp, $wholeWord);
        }
        $words = [];
        $cur = [];
        foreach ([...$ncp, 0x20] as $c) {
            if ($c === 0x20) {
                if ($cur !== []) {
                    $words[implode(',', $cur)] = $cur;
                }
                $cur = [];
            } else {
                $cur[] = $c;
            }
        }
        $all = [];
        foreach ($words as $w) {
            $ms = self::phrase($hay, $w, $wholeWord);
            if ($ms === [] && $matchMode === MatchMode::AllWords) {
                return [];
            }
            array_push($all, ...$ms);
        }
        usort($all, static fn (SearchMatch $a, SearchMatch $b): int =>
            $a->start !== $b->start ? $a->start <=> $b->start : ($b->end - $b->start) <=> ($a->end - $a->start));
        $out = [];
        $lastEnd = -1;
        foreach ($all as $m) {
            if ($m->start >= $lastEnd) {
                $out[] = $m;
                $lastEnd = $m->end;
            }
        }
        return $out;
    }

    /**
     * @param array{cp: list<int>, s: list<int>, e: list<int>, orig: list<int>} $hay
     * @param list<int> $needle
     * @return list<SearchMatch>
     */
    private static function phrase(array $hay, array $needle, bool $wholeWord): array
    {
        $t = $hay['cp'];
        $n = count($t);
        $m = count($needle);
        $out = [];
        $lastEnd = -1;
        $first = $needle[0];
        for ($i = 0; $i + $m <= $n; $i++) {
            if ($t[$i] !== $first) {
                continue;
            }
            for ($k = 1; $k < $m; $k++) {
                if ($t[$i + $k] !== $needle[$k]) {
                    continue 2;
                }
            }
            $end = $i + $m;
            if ($wholeWord && !(($i === 0 || $t[$i - 1] === 0x20) && ($end === $n || $t[$end] === 0x20))) {
                continue;
            }
            $os = $hay['s'][$i];
            $oe = $hay['e'][$end - 1];
            if ($os >= $lastEnd) {
                $out[] = new SearchMatch($os, $oe, Normalizer::encode($hay['orig'], $os, $oe));
                $lastEnd = $oe;
            }
            $i = $end - 1;
        }
        return $out;
    }

    /** Whether $needle occurs in $haystack after normalization. */
    public static function contains(
        string $haystack,
        string $needle,
        Level $level = Level::Search,
        MatchMode $matchMode = MatchMode::Phrase,
        bool $wholeWord = false,
        Honorifics $honorifics = Honorifics::Keep,
    ): bool {
        return self::findAll($haystack, $needle, $level, $matchMode, $wholeWord, $honorifics) !== [];
    }

    /** Wraps every match in the ORIGINAL haystack with $open/$close. Does not escape HTML. */
    public static function highlight(
        string $haystack,
        string $needle,
        string $open = '<mark>',
        string $close = '</mark>',
        Level $level = Level::Search,
        MatchMode $matchMode = MatchMode::Phrase,
        bool $wholeWord = false,
        Honorifics $honorifics = Honorifics::Keep,
    ): string {
        $ms = self::findAll($haystack, $needle, $level, $matchMode, $wholeWord, $honorifics);
        if ($ms === []) {
            return $haystack;
        }
        $orig = Normalizer::decode($haystack);
        $out = '';
        $pos = 0;
        foreach ($ms as $m) {
            $out .= Normalizer::encode($orig, $pos, $m->start) . $open . $m->text . $close;
            $pos = $m->end;
        }
        return $out . Normalizer::encode($orig, $pos);
    }

    /** A normalized key for comparing and indexing names (SPEC §7). Equal keys do NOT mean the same person. */
    public static function nameKey(string $name): string
    {
        $base = self::normalize($name, Level::Search, Honorifics::Strip);
        if ($base === '') {
            return '';
        }
        $w = explode(' ', $base);
        while (count($w) > 1 && in_array($w[count($w) - 1], Tables::TRAILING_TITLES, true)) {
            array_pop($w);
        }
        $kunya = [];
        for ($i = 0, $n = count(Tables::KUNYA); $i < $n; $i += 2) {
            $kunya[Tables::KUNYA[$i]] = Tables::KUNYA[$i + 1];
        }
        $count = count($w);
        for ($i = 0; $i < $count; $i++) {
            if (isset($kunya[$w[$i]])) {
                $w[$i] = $kunya[$w[$i]];
            } elseif ($w[$i] === 'ذا' && $i + 1 < $count && in_array($w[$i + 1], Tables::DHA_FOLLOWERS, true)) {
                $w[$i] = 'ذو';
            } elseif (in_array($w[$i], Tables::IBN, true)) {
                $w[$i] = 'بن';
            } elseif (in_array($w[$i], Tables::BINT, true)) {
                $w[$i] = 'بنت';
            }
        }
        $joined = [];
        for ($i = 0; $i < $count; $i++) {
            if ($w[$i] === 'عبد' && $i + 1 < $count) {
                $joined[] = 'عبد' . $w[$i + 1];
                $i++;
            } else {
                $joined[] = $w[$i];
            }
        }
        return self::normalize(implode(' ', $joined), Level::Loose);
    }

    /** Experimental isnad/matn split (SPEC §8). API may change before 2.0. */
    public static function splitIsnad(string $text): IsnadSplit
    {
        return Isnad::split($text);
    }
}
