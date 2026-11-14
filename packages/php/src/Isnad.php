<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Experimental isnad/matn split (SPEC §8). A small recursive-descent parser over
 * search-normalized words: the isnad is a chain of links (a transmission word
 * followed by a narrator), and the matn starts where no link can continue.
 * Line-for-line port of packages/dart/lib/src/isnad.dart.
 *
 * @internal Use Nass::splitIsnad().
 */
final class Isnad
{
    private const MAX_STRONG = 14;
    private const MAX_WEAK = 6;

    /** @var array<string, array<string, true>|string|list<string>>|null */
    private static ?array $lex = null;

    /** @var list<int> */
    private array $src;
    /** @var list<string> */
    private array $w = [];
    /** @var list<int> */
    private array $st = [];
    /** @var list<int> */
    private array $en = [];
    /** @var list<Narrator> */
    private array $narrators = [];
    private int $how = 0; // 3 = Prophet formula, 2 = terminal «قال», 1 = end of a name
    private int $n;
    /** @var array<string, mixed> */
    private array $L;

    public static function split(string $text): IsnadSplit
    {
        $p = new self($text);
        $none = new IsnadSplit('', $text, 0.0, []);
        if ($p->n === 0 || !$p->isLinkWord(0)) {
            return $none;
        }
        $b = $p->link(0);
        if ($b <= 0 || $b >= $p->n || $p->narrators === []) {
            return $none;
        }
        $off = $p->st[$b];
        $tenths = match ($p->how) { 3 => 9, 2 => 8, default => 6 } - (count($p->narrators) >= 2 ? 0 : 2);
        return new IsnadSplit(
            (string) preg_replace('/\s+$/u', '', Normalizer::encode($p->src, 0, $off)),
            Normalizer::encode($p->src, $off),
            $tenths / 10,
            $p->narrators,
        );
    }

    /** @return array<string, true> */
    private static function set(string $words): array
    {
        $out = [];
        foreach (explode(' ', $words) as $w) {
            $out[Nass::normalize($w)] = true;
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private static function lexicon(): array
    {
        if (self::$lex !== null) {
            return self::$lex;
        }
        $N = static fn (string $s): string => Nass::normalize($s);
        $L = [
            'tv' => self::set('حدثنا حدثني أخبرنا أخبرني أنبأنا أنبأني حدثناه أخبرناه حدثنيه أخبرنيه أخبرناه'),
            'abbr' => self::set('ثنا نا أنا أنبا'),
            'pronTv' => self::set('حدثه حدثته حدثها حدثهم حدثهما أخبره أخبرته أخبرها أخبرهم أخبرهما حدث أخبر'),
            'say' => self::set('قال قالت قالا قالوا يقول تقول يقولا يقولان'),
            'hear' => self::set('سمعت سمع سمعه سمعنا سمعته سمعتها'),
            'skip' => self::set('و ح أحسبه'),
            'raise' => self::set('يرويه يرفعه رفعه'),
            'qualifier' => self::set('يعني تعني وهو هو واسمه'),
            'client' => self::set('زوج مولى صاحب'),
            // Names that may follow «قال قال» (SPEC §8.3): a kunya/patronymic head takes the next word.
            'nameHead' => self::set('أبو أبي أبا أم ابن بنت عبد'),
            'nameLink' => self::set('بن ابن بنت'),
            // First-person narrative verbs: a story, never a narrator's name (SPEC §8.2).
            'narrative' => self::set(
                'أتيت أتينا أتاني أتانا لقيت سألت سألنا سألني دخلت دخلنا خرجت خرجنا رأيت رأينا شهدت جاءنا جاءني قدمت قدمنا صليت صلينا',
            ),
            'heardHim' => self::set('سمعته سمعتها سمعه'),
            // «قراءة عليه وأنا أسمع» (al-Nasa'i) between a narrator and the next link.
            'qira2a' => explode(' ', $N('قراءة عليه وأنا أسمع')),
            'honorTail' => self::set('عنه عنها عنهما عنهم'),
            'salawat' => explode(' ', $N('صلى الله عليه وسلم')),
            // Hammam's sahifa: «هذا ما حدثنا أبو هريرة عن رسول الله ﷺ فذكر أحاديث منها وقال رسول الله ﷺ».
            'dhakara' => explode(' ', $N('فذكر أحاديث منها')),
            // Anonymous people: never a narrator's name after «قال قال» (SPEC §8.3).
            'anonymous' => self::set('رجل رجلا امرأة أعرابي ناس قوم'),
            'peace' => explode(' ', $N('عليه السلام')),
        ];
        $L['stop'] = $L['tv'] + $L['abbr'] + $L['pronTv'] + $L['say'] + $L['hear'] + $L['skip'] + $L['raise']
            + $L['qualifier'] + $L['client'] + $L['narrative']
            + self::set('عن أن أنه أنها أنهم أنهما يحدث رضي رسول النبي نبي نبيكم صلى في يا لما إذا إذ كان كانت كانوا كنا كنت لا ما لم لن هل قد ثم إلى قراءة واللفظ');
        foreach ([
            'rasul' => 'رسول', 'nabiAl' => 'النبي', 'nabi' => 'نبي', 'allah' => 'الله', 'nabikum' => 'نبيكم', 'radi' => 'رضي',
            'mawla' => 'مولى', 'ha' => 'ح', 'wording' => 'واللفظ',
            'an' => 'أن', 'anhu' => 'أنه', 'anha' => 'أنها', 'aan' => 'عن', 'yuhaddith' => 'يحدث',
            'li' => 'لي', 'lana' => 'لنا', 'kana' => 'كان', 'qara2tu' => 'قرأت', 'ala' => 'على', 'min' => 'من',
            'waw' => 'و', 'hatha' => 'هذا', 'ma' => 'ما', 'waqala' => 'وقال',
        ] as $k => $v) {
            $L[$k] = $N($v);
        }
        return self::$lex = $L;
    }

    private function __construct(string $text)
    {
        $this->L = self::lexicon();
        $this->src = Normalizer::decode($text);
        [$cp, $s, $e] = Normalizer::run($this->src, Level::Search, Honorifics::Keep);
        $len = count($cp);
        $i = 0;
        while ($i < $len) {
            if ($cp[$i] === 0x20) {
                $i++;
                continue;
            }
            $j = $i;
            while ($j < $len && $cp[$j] !== 0x20) {
                $j++;
            }
            $this->w[] = Normalizer::encode($cp, $i, $j);
            $this->st[] = $s[$i];
            $this->en[] = $e[$j - 1];
            $i = $j;
        }
        $this->n = count($this->w);
    }

    private function at(int $i): string
    {
        return $this->w[$i] ?? '';
    }

    private function text(int $i): string
    {
        return Normalizer::encode($this->src, $this->st[$i], $this->en[$i]);
    }

    private function isTv(int $i, bool $abbr = false): bool
    {
        $x = $this->at($i);
        if (isset($this->L['tv'][$x]) || ($abbr && isset($this->L['abbr'][$x]))) {
            return true;
        }
        return mb_strlen($x) > 2 && str_starts_with($x, $this->L['waw'])
            && isset($this->L['tv'][substr($x, strlen($this->L['waw']))]);
    }

    private function prophet(int $i): int
    {
        $L = $this->L;
        if ($this->at($i) === $L['rasul'] && $this->at($i + 1) === $L['allah']) {
            $j = $i + 2;
        } elseif ($this->at($i) === $L['nabiAl']) {
            $j = $i + 1;
        } elseif ($this->at($i) === $L['nabi'] && $this->at($i + 1) === $L['allah']) {
            $j = $i + 2;
        } elseif ($this->at($i) === $L['nabikum']) {
            $j = $i + 1;
        } else {
            return -1;
        }
        if ($this->seq($j, $L['salawat'])) {
            return $j + count($L['salawat']);
        }
        if ($this->seq($j, $L['peace'])) {
            return $j + count($L['peace']);
        }
        return $j;
    }

    /** @param list<string> $s */
    private function seq(int $i, array $s): bool
    {
        foreach ($s as $k => $w) {
            if ($this->at($i + $k) !== $w) {
                return false;
            }
        }
        return true;
    }

    private function honorific(int $i): int
    {
        return $this->at($i) === $this->L['radi'] && $this->at($i + 1) === $this->L['allah']
            && isset($this->L['honorTail'][$this->at($i + 2)]) ? $i + 3 : -1;
    }

    private function name(int $i, string $form, int $max): int
    {
        $j = $i;
        // «عن مولى لأبي سعيد»: an unnamed client is still a narrator.
        while (
            $j < $this->n
            && (!isset($this->L['stop'][$this->w[$j]]) || ($j === $i && $this->w[$j] === $this->L['mawla']))
            && !$this->isTv($j)
        ) {
            if ($j - $i === $max) {
                return -1;
            }
            $j++;
        }
        if ($j === $i) {
            return -1;
        }
        $this->narrators[] = new Narrator(Normalizer::encode($this->src, $this->st[$i], $this->en[$j - 1]), $form);
        return $j;
    }

    private function try(callable $f): int
    {
        $keep = count($this->narrators);
        $r = $f();
        if ($r < 0) {
            array_splice($this->narrators, $keep);
        }
        return $r;
    }

    private function done(int $b, int $kind): int
    {
        $this->how = $kind;
        return $b;
    }

    private function isLinkWord(int $i): bool
    {
        $x = $this->at($i);
        $L = $this->L;
        return $this->isTv($i) || $x === $L['aan'] || $x === $L['an'] || $x === $L['anhu'] || $x === $L['anha']
            || isset($L['say'][$x]) || isset($L['hear'][$x]) || isset($L['skip'][$x]) || isset($L['raise'][$x])
            || $x === $L['yuhaddith'];
    }

    private function link(int $i, int $max = self::MAX_STRONG): int
    {
        if ($i >= $this->n) {
            return -1;
        }
        $L = $this->L;
        $x = $this->w[$i];
        if (isset($L['skip'][$x])) {
            return $this->link($i + 1, $max);
        }
        if ($this->isTv($i) || ($x === $L['qara2tu'] && $this->at($i + 1) === $L['ala'])) {
            $from = $x === $L['qara2tu'] ? $i + 2 : $i + 1;
            // «قال واقد بن عبد الله أخبرني عن أبيه»: the name came first.
            if ($this->at($from) === $L['aan']) {
                return $this->link($from, $max);
            }
            $j = $this->name($from, $this->text($i), $max);
            return $j < 0 ? -1 : $this->after($j, true);
        }
        if ($x === $L['aan']) {
            $p = $this->prophet($i + 1);
            if ($p >= 0) {
                return $this->prophetEnd($p);
            }
            $j = $this->name($i + 1, $this->text($i), $max);
            return $j < 0 ? -1 : $this->after($j, true);
        }
        if (isset($L['hear'][$x])) {
            if (isset($L['heardHim'][$x]) && isset($L['say'][$this->at($i + 1)])) {
                return $this->done($i + 2, 2);
            }
            $p = $this->prophet($i + 1);
            if ($p >= 0) {
                return $this->prophetEnd($p);
            }
            $j = $this->name($this->at($i + 1) === $L['min'] ? $i + 2 : $i + 1, $this->text($i), $max);
            return $j < 0 ? -1 : $this->after($j, true);
        }
        if ($x === $L['anhu'] || $x === $L['anha']) {
            if (isset($L['say'][$this->at($i + 1)])) {
                return $this->say($i + 1);
            }
            if (isset($L['hear'][$this->at($i + 1)]) || isset($L['pronTv'][$this->at($i + 1)])) {
                return $this->link($i + 1);
            }
            return -1;
        }
        if ($x === $L['an']) {
            $p = $this->prophet($i + 1);
            if ($p >= 0) {
                if (isset($L['say'][$this->at($p)])) {
                    return $this->prophetSay($p + 1);
                }
                if ($this->at($p) === $L['kana'] && isset($L['say'][$this->at($p + 1)])) {
                    return $this->done($p + 2, 3);
                }
                return $this->done($i, 3);
            }
            return $this->try(function () use ($i, $L): int {
                $j = $this->name($i + 1, $this->text($i), self::MAX_STRONG);
                if ($j < 0) {
                    return -1;
                }
                [$k, $honored] = $this->tail($j);
                if ($honored) {
                    // «أن عليا رضي الله عنه حرق قوما»: a story about him, not a link.
                    $r = $this->after($k, true);
                    return $r === $k && $this->how === 1 ? -1 : $r;
                }
                if (isset($L['pronTv'][$this->at($k)])) {
                    return $this->link($k);
                }
                // «أن أبا هريرة كان يحدث أن …»
                if ($this->at($k) === $L['kana'] && $this->at($k + 1) === $L['yuhaddith']) {
                    return $this->link($k + 1);
                }
                if (isset($L['say'][$this->at($k)])) {
                    $r = $this->say($k);
                    // «أن عائشة زوج النبي ﷺ قالت»: a qualified narrator speaks.
                    if ($k > $j) {
                        return $r;
                    }
                    // «أن أبا هريرة قال قال رسول الله ﷺ»: accepted only when it reaches the Prophet.
                    return $this->how === 3 ? $r : -1;
                }
                return -1;
            });
        }
        if (isset($L['pronTv'][$x])) {
            if ($i + 1 < $this->n && $this->isLinkWord($i + 1)) {
                return $this->after($i + 1, true);
            }
            $r = $this->try(function () use ($i): int {
                $j = $this->name($i + 1, $this->text($i), self::MAX_WEAK);
                return $j < 0 ? -1 : $this->after($j, true);
            });
            return $r >= 0 ? $r : $this->done($i + 1, 1);
        }
        if (isset($L['say'][$x])) {
            return $this->say($i);
        }
        if (isset($L['raise'][$x])) {
            return $this->done(isset($L['say'][$this->at($i + 1)]) ? $i + 2 : $i + 1, 3);
        }
        if ($x === $L['yuhaddith']) {
            if ($this->isLinkWord($i + 1)) {
                return $this->link($i + 1);
            }
            $j = $this->name($i + 1, $this->text($i), self::MAX_WEAK);
            return $j < 0 ? -1 : $this->after($j, true);
        }
        return -1;
    }

    private function prophetEnd(int $p): int
    {
        $j = $p;
        if ($this->at($j) === $this->L['anhu']) {
            $j++;
        }
        if (isset($this->L['say'][$this->at($j)])) {
            return $this->prophetSay($j + 1);
        }
        if ($this->seq($p, $this->L['dhakara']) && $this->at($p + 3) === $this->L['waqala']) {
            $q = $this->prophet($p + 4);
            if ($q >= 0) {
                return $this->done($q, 3);
            }
        }
        // Another chain follows: «… عن النبي ﷺ ح و حدثنا …».
        if ($this->at($p) === $this->L['ha'] && $p + 1 < $this->n) {
            $r = $this->try(fn (): int => $this->link($p));
            if ($r >= 0) {
                return $r;
            }
        }
        return $this->done($p, 3);
    }

    /** After «… رسول الله ﷺ قال»: the matn, unless another chain follows («ح و حدثنا …»). */
    private function prophetSay(int $b): int
    {
        if ($this->at($b) === $this->L['ha'] && $b + 1 < $this->n) {
            $r = $this->try(fn (): int => $this->link($b));
            if ($r >= 0) {
                return $r;
            }
        }
        return $this->done($b, 3);
    }

    private function sayCont(int $i): int
    {
        $L = $this->L;
        $j = $i + 1;
        $x = $this->at($j);
        if (isset($L['say'][$x])) {
            $r = $this->try(fn (): int => $this->sayCont($j));
            if ($r >= 0) {
                return $r;
            }
            // «قال قال أنس ║ …»: a short name, then the matn.
            $k = $this->at($j + 1) === $L['li'] || $this->at($j + 1) === $L['lana'] ? $j + 1 : $this->shortName($j + 1);
            if ($k > $j + 1) {
                $this->narrators[] = new Narrator(
                    Normalizer::encode($this->src, $this->st[$j + 1], $this->en[$k - 1]),
                    $this->text($j),
                );
                return $this->done($k, 2);
            }
            return $this->done($j, 2);
        }
        if (isset($L['pronTv'][$x]) || ($x === $L['qara2tu'] && $this->at($j + 1) === $L['ala'])) {
            $r = $this->try(fn (): int => $this->link($j));
            if ($r >= 0) {
                return $r;
            }
        }
        if ($x === $L['hatha'] && $this->at($j + 1) === $L['ma'] && $this->isTv($j + 2)) {
            $r = $this->try(fn (): int => $this->link($j + 2));
            if ($r >= 0) {
                return $r;
            }
        }
        // «قال قال يعني رسول الله ﷺ»
        if (isset($L['qualifier'][$x])) {
            $p = $this->prophet($j + 1);
            if ($p >= 0) {
                return $this->done($p, 3);
            }
        }
        if ($x === $L['li'] || $x === $L['lana']) {
            $p = $this->prophet($j + 1);
            if ($p >= 0) {
                return $this->done($p, 3);
            }
            return $this->try(fn (): int => $this->weak($j + 1, $i));
        }
        $p = $this->prophet($j);
        if ($p >= 0) {
            return $this->done($p, 3);
        }
        if ($this->isLinkWord($j) && $x !== $L['an']) {
            $r = $this->try(fn (): int => $this->link($j));
            if ($r >= 0) {
                return $r;
            }
        }
        return $this->try(fn (): int => $this->weak($j, $i));
    }

    /** End of a short name at $i («أنس», «ابن عباس», «عبد الله بن عمرو»), or $i. */
    private function shortName(int $i): int
    {
        $L = $this->L;
        $unit = function (int $k) use ($L): int {
            if (
                $k >= $this->n || isset($L['stop'][$this->w[$k]]) || isset($L['anonymous'][$this->w[$k]])
                || $this->isTv($k)
            ) {
                return -1;
            }
            if (isset($L['nameHead'][$this->w[$k]])) {
                return $k + 1 < $this->n && !isset($L['stop'][$this->w[$k + 1]]) && !$this->isTv($k + 1) ? $k + 2 : -1;
            }
            return $k + 1;
        };
        $u = $unit($i);
        if ($u < 0) {
            return $i;
        }
        $j = $u;
        while (isset($L['nameLink'][$this->at($j)])) {
            $v = $unit($j + 1);
            if ($v < 0) {
                break;
            }
            $j = $v;
        }
        return $j;
    }

    private function weak(int $i, int $formAt): int
    {
        if (isset($this->L['narrative'][$this->at($i)])) {
            return -1;
        }
        $j = $this->name($i, $this->text($formAt), self::MAX_WEAK);
        return $j < 0 ? -1 : $this->after($j, false);
    }

    private function say(int $i): int
    {
        $r = $this->sayCont($i);
        return $r >= 0 ? $r : $this->done($i + 1, 2);
    }

    private function after(int $j, bool $strong): int
    {
        $L = $this->L;
        [$j, $honored] = $this->tail($j);
        if ($j >= $this->n) {
            return -1;
        }
        if (isset($L['say'][$this->at($j)])) {
            $r = $this->sayCont($j);
            return $r >= 0 ? $r : $this->done($j + 1, 2);
        }
        if ($this->isTv($j, true) || $this->isLinkWord($j)) {
            $r = $this->try(fn (): int => $this->link($j, $strong ? self::MAX_STRONG : self::MAX_WEAK));
            if ($r >= 0) {
                return $r;
            }
            if ($this->isTv($j, true)) {
                return -1; // a transmission word cannot start the matn: the chain is broken
            }
        }
        return $strong || $honored ? $this->done($j, 1) : -1;
    }

    /**
     * Skips what may follow a narrator's name: honorifics, «يعني …», «مولى …»,
     * «زوج النبي ﷺ», «قراءة عليه وأنا أسمع». Returns the end and whether an honorific was seen.
     *
     * @return array{int, bool}
     */
    private function tail(int $j): array
    {
        $L = $this->L;
        $honored = false;
        // «فاطمة بنت رسول الله ﷺ»: the Prophet's kin.
        if ($j > 0 && isset($L['nameLink'][$this->w[$j - 1]])) {
            $p = $this->prophet($j);
            if ($p >= 0) {
                $j = $p;
            }
        }
        for (;;) {
            $h = $this->honorific($j);
            if ($h >= 0) {
                $j = $h;
                $honored = true;
                continue;
            }
            if (isset($L['qualifier'][$this->at($j)])) {
                $k = $this->try(fn (): int => $this->name($j + 1, '', self::MAX_STRONG));
                if ($k >= 0) {
                    array_pop($this->narrators); // a qualifier, not another narrator
                    $j = $k;
                    continue;
                }
            }
            if (isset($L['client'][$this->at($j)])) {
                $p = $this->prophet($j + 1);
                if ($p >= 0) {
                    $j = $p;
                    continue;
                }
                // «أبي مرة مولى عقيل بن أبي طالب»: the patron's name qualifies the narrator.
                if ($this->at($j) === $L['mawla']) {
                    $k = $this->try(fn (): int => $this->name($j + 1, '', self::MAX_WEAK));
                    if ($k >= 0) {
                        array_pop($this->narrators);
                        $j = $k;
                        continue;
                    }
                }
            }
            // «واللفظ له» / «واللفظ لسعيد» / «واللفظ لابن المثنى»: whose wording is given.
            if ($this->at($j) === $L['wording'] && $j + 2 < $this->n) {
                $x = $this->at($j + 1);
                $head = mb_strlen($x) > 1 && isset($L['nameHead'][mb_substr($x, 1)]);
                $j += $head && $j + 3 < $this->n ? 3 : 2;
                continue;
            }
            if ($this->seq($j, $L['qira2a'])) {
                $j += count($L['qira2a']);
                continue;
            }
            break;
        }
        return [$j, $honored];
    }
}
