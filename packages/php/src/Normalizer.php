<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Normalization pipeline (SPEC §1–§5). Mirrors packages/dart/lib/src/normalizer.dart.
 * Offsets are code points. A buffer is three parallel arrays: cp, s (start), e (end).
 *
 *   pass 1  C2 C3 C4 C5 + Z          pass 3  S1–S6 (+ L1 in loose) + Z
 *   pass 2  C1 (in place)            pass 4  S7, repeated until stable
 *
 * @internal
 */
final class Normalizer
{
    private const SPACE = 0x20;

    /** @var array<string, list<list<string>>> */
    private static array $phrases = [];

    /** @return list<int> */
    public static function decode(string $text): array
    {
        if ($text === '') {
            return [];
        }
        if (!mb_check_encoding($text, 'UTF-8')) {
            $text = mb_scrub($text, 'UTF-8');
        }
        return array_values(unpack('V*', mb_convert_encoding($text, 'UTF-32LE', 'UTF-8')));
    }

    /** @param list<int> $cps */
    public static function encode(array $cps, int $from = 0, ?int $to = null): string
    {
        $to ??= count($cps);
        $out = '';
        for ($i = $from; $i < $to; $i += 8192) {
            $chunk = array_slice($cps, $i, min(8192, $to - $i));
            $out .= mb_convert_encoding(pack('V*', ...$chunk), 'UTF-8', 'UTF-32LE');
        }
        return $out;
    }

    /**
     * @param list<int> $in decoded input
     * @return array{0: list<int>, 1: list<int>, 2: list<int>}
     */
    public static function run(array $in, Level $level, Honorifics $h): array
    {
        Charset::init();
        [$cp, $s, $e] = self::pass1($in);
        self::c1($cp, $s, $e);
        if ($level === Level::Clean) {
            return [$cp, $s, $e];
        }
        $loose = $level === Level::Loose;
        [$cp, $s, $e] = self::pass3($cp, $s, $e, $h, $loose);
        if ($h === Honorifics::Strip) {
            do {
                $before = count($cp);
                [$cp, $s, $e] = self::s7($cp, $s, $e, $loose);
            } while (count($cp) !== $before);
        }
        return [$cp, $s, $e];
    }

    // ------------------------------------------------------------ helpers

    /** Deleted mark joins the source group of the last kept unit (SPEC §5). */
    private static function attach(array &$s, array &$e, int $n, int $en): void
    {
        if ($n === 0) {
            return;
        }
        $st = $s[$n - 1];
        for ($i = $n - 1; $i >= 0 && $s[$i] === $st; $i--) {
            if ($e[$i] < $en) {
                $e[$i] = $en;
            }
        }
    }

    // ------------------------------------------------------------ pass 1

    /** @param list<int> $in */
    private static function pass1(array $in): array
    {
        $flags = Charset::$flags;
        $pres = Charset::$pres;
        $cp = $s = $e = [];
        $n = 0;
        $len = count($in);
        $invis = Charset::F_INVIS_ALWAYS | Charset::F_INVIS_NEAR;
        for ($i = 0; $i < $len; $i++) {
            $c = $in[$i];
            $f = $flags[$c] ?? 0;
            if ($f === 0) {
                $cp[$n] = $c; $s[$n] = $i; $e[$n] = $i + 1; $n++;
                continue;
            }
            if ($f & (Charset::F_INVIS_ALWAYS | Charset::F_TATWEEL)) {
                self::attach($s, $e, $n, $i + 1);
                continue;
            }
            if ($f & Charset::F_INVIS_NEAR) {
                $near = false;
                for ($m = $i - 1; $m >= 0; $m--) {
                    $fx = $flags[$in[$m]] ?? 0;
                    if (($fx & $invis) === 0) {
                        $near = ($fx & Charset::F_ARABIC) !== 0;
                        break;
                    }
                }
                if (!$near) {
                    for ($m = $i + 1; $m < $len; $m++) {
                        $fx = $flags[$in[$m]] ?? 0;
                        if (($fx & $invis) === 0) {
                            $near = ($fx & Charset::F_ARABIC) !== 0;
                            break;
                        }
                    }
                }
                // ZWNJ next to Arabic is kept in clean and removed in search (SPEC C2, S2).
                if ($near && $c !== 0x200C) {
                    self::attach($s, $e, $n, $i + 1);
                } else {
                    $cp[$n] = $c; $s[$n] = $i; $e[$n] = $i + 1; $n++;
                }
                continue;
            }
            if (isset($pres[$c])) {
                foreach ($pres[$c] as $x) {
                    $cp[$n] = $x; $s[$n] = $i; $e[$n] = $i + 1; $n++;
                }
                continue;
            }
            if ($f & Charset::F_SPACE) {
                if ($n > 0 && $cp[$n - 1] !== self::SPACE) {
                    $cp[$n] = self::SPACE; $s[$n] = $i; $e[$n] = $i + 1; $n++;
                }
                continue;
            }
            $cp[$n] = $c; $s[$n] = $i; $e[$n] = $i + 1; $n++;
        }
        if ($n > 0 && $cp[$n - 1] === self::SPACE) {
            array_pop($cp); array_pop($s); array_pop($e);
        }
        return [$cp, $s, $e];
    }

    // ------------------------------------------------------------ pass 2 (C1)

    private static function c1(array &$cp, array &$s, array &$e): void
    {
        $ccc = Charset::$ccc;
        $n = count($cp);
        $i = 0;
        while ($i < $n) {
            if (!isset($ccc[$cp[$i]])) {
                $i++;
                continue;
            }
            $j = $i + 1;
            while ($j < $n && isset($ccc[$cp[$j]])) {
                $j++;
            }
            if ($j - $i > 1) {
                $changed = false;
                for ($k = $i + 1; $k < $j; $k++) {
                    $x = $cp[$k]; $xs = $s[$k]; $xe = $e[$k]; $xc = $ccc[$x];
                    $m = $k - 1;
                    while ($m >= $i && $ccc[$cp[$m]] > $xc) {
                        $cp[$m + 1] = $cp[$m]; $s[$m + 1] = $s[$m]; $e[$m + 1] = $e[$m];
                        $m--;
                        $changed = true;
                    }
                    $cp[$m + 1] = $x; $s[$m + 1] = $xs; $e[$m + 1] = $xe;
                }
                if ($changed) {
                    $lo = min(array_slice($s, $i, $j - $i));
                    $hi = max(array_slice($e, $i, $j - $i));
                    for ($k = $i; $k < $j; $k++) {
                        $s[$k] = $lo;
                        $e[$k] = $hi;
                    }
                }
            }
            $i = $j;
        }
        $compose = Charset::$compose;
        $w = 0;
        $starter = -1;
        $lastCcc = -1;
        for ($k = 0; $k < $n; $k++) {
            $c = $cp[$k];
            $cc = $ccc[$c] ?? 0;
            if ($starter >= 0 && ($lastCcc === -1 || $lastCcc < $cc) && isset($compose[$c][$cp[$starter]])) {
                $cp[$starter] = $compose[$c][$cp[$starter]];
                if ($e[$k] > $e[$starter]) {
                    $e[$starter] = $e[$k];
                }
                continue;
            }
            if ($cc === 0) {
                $starter = $w;
                $lastCcc = -1;
            } else {
                $lastCcc = $cc;
            }
            $cp[$w] = $c; $s[$w] = $s[$k]; $e[$w] = $e[$k];
            $w++;
        }
        if ($w < $n) {
            array_splice($cp, $w); array_splice($s, $w); array_splice($e, $w);
        }
    }

    // ------------------------------------------------------------ pass 3

    /** Whether the ZWNJ at $k has an Arabic neighbour: the nearest code point on either side that is not ZWNJ or ZWJ (SPEC S2). */
    private static function zwnjNearArabic(array $a, int $k): bool
    {
        $flags = Charset::$flags;
        for ($m = $k - 1; $m >= 0; $m--) {
            $x = $a[$m];
            if ($x === 0x200C || $x === 0x200D) {
                continue;
            }
            if ((($flags[$x] ?? 0) & Charset::F_ARABIC) !== 0) {
                return true;
            }
            break;
        }
        $len = count($a);
        for ($m = $k + 1; $m < $len; $m++) {
            $x = $a[$m];
            if ($x === 0x200C || $x === 0x200D) {
                continue;
            }
            return (($flags[$x] ?? 0) & Charset::F_ARABIC) !== 0;
        }
        return false;
    }

    private static function pass3(array $a, array $as, array $ae, Honorifics $h, bool $loose): array
    {
        $flags = Charset::$flags;
        $presSearch = Charset::$presSearch;
        $map1 = Charset::$map1;
        $digitSep = Charset::$digitSep;
        $looseMap = Charset::$looseMap;
        $cp = $s = $e = [];
        $len = count($a);
        for ($k = 0; $k < $len; $k++) {
            $c = $a[$k]; $st = $as[$k]; $en = $ae[$k];
            if (isset($presSearch[$c])) {
                if ($h === Honorifics::Strip && $c !== 0xFDFD) {
                    self::addSpace($cp, $s, $e, $st, $en);
                } else {
                    foreach ($presSearch[$c] as $x) {
                        self::emit($cp, $s, $e, $x, $st, $en, -1, $loose);
                    }
                }
                continue;
            }
            $f = $flags[$c] ?? 0;
            if ($c === 0x200C && self::zwnjNearArabic($a, $k)) {
                self::attach($s, $e, count($cp), $en);
                continue;
            }
            if ($f & Charset::F_MARK) {
                // attach() inlined: marks are about half of vocalized text.
                $n = count($cp);
                if ($n > 0) {
                    $st0 = $s[$n - 1];
                    for ($i = $n - 1; $i >= 0 && $s[$i] === $st0; $i--) {
                        if ($e[$i] < $en) {
                            $e[$i] = $en;
                        }
                    }
                }
                continue;
            }
            // Fast path: plain letter, or a letter/digit/case mapping, no separator logic.
            $mapped = $map1[$c] ?? null;
            if ($c !== self::SPACE && ($mapped !== null || ($f & (Charset::F_SEP | Charset::F_LOOSE_REMOVE)) === 0) && !isset($digitSep[$c])) {
                $c = $mapped ?? $c;
                if ($loose) {
                    if ((($flags[$c] ?? 0) & Charset::F_LOOSE_REMOVE) !== 0) {
                        self::attach($s, $e, count($cp), $en);
                        continue;
                    }
                    $c = $looseMap[$c] ?? $c;
                }
                $cp[] = $c; $s[] = $st; $e[] = $en;
                continue;
            }
            $next = -1;
            if (isset($digitSep[$c])) {
                for ($m = $k + 1; $m < $len; $m++) {
                    if ((($flags[$a[$m]] ?? 0) & Charset::F_MARK) === 0) {
                        $next = $a[$m];
                        break;
                    }
                }
            }
            self::emit($cp, $s, $e, $c, $st, $en, $next, $loose);
        }
        $n = count($cp);
        if ($n > 0 && $cp[$n - 1] === self::SPACE) {
            array_pop($cp); array_pop($s); array_pop($e);
        }
        return [$cp, $s, $e];
    }

    private static function addSpace(array &$cp, array &$s, array &$e, int $st, int $en): void
    {
        $n = count($cp);
        if ($n === 0 || $cp[$n - 1] === self::SPACE) {
            return;
        }
        $cp[] = self::SPACE; $s[] = $st; $e[] = $en;
    }

    private static function isDigit(int $c): bool
    {
        return $c >= 0x30 && $c <= 0x39;
    }

    private static function emit(array &$cp, array &$s, array &$e, int $c, int $st, int $en, int $next, bool $loose): void
    {
        if ($c === self::SPACE) {
            self::addSpace($cp, $s, $e, $st, $en);
            return;
        }
        $flags = Charset::$flags;
        if (isset(Charset::$map1[$c])) {
            $c = Charset::$map1[$c];
        } else {
            if (isset(Charset::$digitSep[$c])) {
                $n = count($cp);
                $prev = $n > 0 ? $cp[$n - 1] : -1;
                $nextDigit = $next >= 0 && (self::isDigit($next) || self::isDigit(Charset::$map1[$next] ?? -1));
                if (self::isDigit($prev) && $nextDigit) {
                    $cp[] = Charset::$digitSep[$c]; $s[] = $st; $e[] = $en;
                    return;
                }
            }
            if (($flags[$c] ?? 0) & Charset::F_SEP) {
                self::addSpace($cp, $s, $e, $st, $en);
                return;
            }
        }
        if ($loose) {
            if (($flags[$c] ?? 0) & Charset::F_LOOSE_REMOVE) {
                self::attach($s, $e, count($cp), $en);
                return;
            }
            $c = Charset::$looseMap[$c] ?? $c;
        }
        $cp[] = $c; $s[] = $st; $e[] = $en;
    }

    // ------------------------------------------------------------ pass 4 (S7)

    /** @return list<list<string>> longest first */
    private static function phrases(string $kind, bool $loose): array
    {
        $key = $kind . ($loose ? ':loose' : '');
        if (!isset(self::$phrases[$key])) {
            $list = $kind === 'always' ? Tables::HONORIFICS_ALWAYS : Tables::HONORIFICS_AFTER_ALLAH;
            $out = [];
            foreach ($list as $p) {
                if ($loose) {
                    [$c] = self::run(self::decode($p), Level::Loose, Honorifics::Keep);
                    $p = self::encode($c);
                }
                $out[] = explode(' ', $p);
            }
            usort($out, static fn (array $a, array $b): int => count($b) <=> count($a));
            self::$phrases[$key] = $out;
        }
        return self::$phrases[$key];
    }

    private static function s7(array $a, array $as, array $ae, bool $loose): array
    {
        $always = self::phrases('always', $loose);
        $afterAllah = self::phrases('afterAllah', $loose);
        $n = count($a);
        $ws = [];
        $i = 0;
        while ($i < $n) {
            $j = $i;
            while ($j < $n && $a[$j] !== self::SPACE) {
                $j++;
            }
            $ws[] = [$i, $j];
            $i = $j + 1;
        }
        $texts = array_map(static fn (array $w): string => self::encode($a, $w[0], $w[1]), $ws);
        $nw = count($ws);
        $removed = array_fill(0, $nw, false);
        $matchAt = static function (int $w, array $p) use ($texts, $nw): bool {
            if ($w + count($p) > $nw) {
                return false;
            }
            foreach ($p as $k => $word) {
                if ($texts[$w + $k] !== $word) {
                    return false;
                }
            }
            return true;
        };
        $any = false;
        $w = 0;
        while ($w < $nw) {
            $hit = null;
            foreach ($always as $p) {
                if ($matchAt($w, $p)) {
                    $hit = $p;
                    break;
                }
            }
            if ($hit === null && $w > 0 && $texts[$w - 1] === 'الله') {
                foreach ($afterAllah as $p) {
                    if ($matchAt($w, $p)) {
                        $hit = $p;
                        break;
                    }
                }
            }
            if ($hit !== null) {
                for ($k = 0, $c = count($hit); $k < $c; $k++) {
                    $removed[$w + $k] = true;
                }
                $any = true;
                $w += count($hit);
            } else {
                $w++;
            }
        }
        if (!$any) {
            return [$a, $as, $ae];
        }
        $cp = $s = $e = [];
        foreach ($ws as $idx => [$from, $to]) {
            if ($removed[$idx]) {
                continue;
            }
            if ($cp !== []) {
                $sp = $from - 1;
                $cp[] = self::SPACE; $s[] = $as[$sp]; $e[] = $ae[$sp];
            }
            for ($k = $from; $k < $to; $k++) {
                $cp[] = $a[$k]; $s[] = $as[$k]; $e[] = $ae[$k];
            }
        }
        return [$cp, $s, $e];
    }
}
