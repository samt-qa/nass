<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Runtime lookup tables built once from the generated Tables (mirrors Dart charset.dart).
 *
 * @internal
 */
final class Charset
{
    public const F_INVIS_ALWAYS = 1;
    public const F_INVIS_NEAR = 2;
    public const F_TATWEEL = 4;
    public const F_ARABIC = 8;
    public const F_MARK = 16;
    public const F_SEP = 32;
    public const F_SPACE = 64;
    public const F_LOOSE_REMOVE = 128;

    /** @var array<int,int> */
    public static array $flags = [];
    /** @var array<int,int> */
    public static array $ccc = [];
    /** @var array<int,int> S3/S4/S6 single-character map */
    public static array $map1 = [];
    /** @var array<int,int> */
    public static array $looseMap = [];
    /** @var array<int,int> */
    public static array $digitSep = [];
    /** @var array<int,array<int,int>> second => [first => composed] */
    public static array $compose = [];
    /** @var array<int,list<int>> */
    public static array $pres = [];
    /** @var array<int,list<int>> */
    public static array $presSearch = [];

    private static bool $ready = false;

    public static function init(): void
    {
        if (self::$ready) {
            return;
        }
        self::$ready = true;
        self::ranges(Tables::INVISIBLE_ALWAYS, self::F_INVIS_ALWAYS);
        self::ranges(Tables::INVISIBLE_NEAR_ARABIC, self::F_INVIS_NEAR);
        self::ranges(Tables::TATWEEL, self::F_TATWEEL);
        self::ranges(Tables::ARABIC, self::F_ARABIC);
        self::ranges(Tables::MARKS, self::F_MARK);
        self::ranges(Tables::PUNCTUATION, self::F_SEP);
        self::ranges(Tables::EXTRA_SEPARATORS, self::F_SEP);
        self::ranges(Tables::WHITESPACE, self::F_SPACE);
        self::ranges(Tables::LOOSE_REMOVE, self::F_LOOSE_REMOVE);
        self::$flags[0x25] = (self::$flags[0x25] ?? 0) & ~self::F_SEP; // '%' is a symbol (SPEC S5)
        self::pairs(Tables::CCC, self::$ccc);
        $c = Tables::COMPOSITIONS;
        for ($i = 0, $n = count($c); $i < $n; $i += 3) {
            self::$compose[$c[$i + 1]][$c[$i]] = $c[$i + 2];
        }
        self::expansions(Tables::PRESENTATION, self::$pres);
        self::expansions(Tables::PRESENTATION_SEARCH, self::$presSearch);
        self::pairs(Tables::LETTER_MAP, self::$map1);
        self::pairs(Tables::DIGIT_MAP, self::$map1);
        for ($c = 0x41; $c <= 0x5A; $c++) {
            self::$map1[$c] = $c + 0x20;
        }
        self::pairs(Tables::LOOSE_MAP, self::$looseMap);
        self::pairs(Tables::DIGIT_SEPARATORS, self::$digitSep);
    }

    /** @param list<int> $flat */
    private static function ranges(array $flat, int $flag): void
    {
        for ($i = 0, $n = count($flat); $i < $n; $i += 2) {
            for ($c = $flat[$i]; $c <= $flat[$i + 1]; $c++) {
                self::$flags[$c] = (self::$flags[$c] ?? 0) | $flag;
            }
        }
    }

    /**
     * @param list<int> $flat
     * @param array<int,int> $into
     */
    private static function pairs(array $flat, array &$into): void
    {
        for ($i = 0, $n = count($flat); $i < $n; $i += 2) {
            $into[$flat[$i]] = $flat[$i + 1];
        }
    }

    /**
     * @param list<int> $flat [key, n, ...values]
     * @param array<int,list<int>> $into
     */
    private static function expansions(array $flat, array &$into): void
    {
        $i = 0;
        $n = count($flat);
        while ($i < $n) {
            $len = $flat[$i + 1];
            $into[$flat[$i]] = array_slice($flat, $i + 2, $len);
            $i += 2 + $len;
        }
    }
}
