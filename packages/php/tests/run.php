<?php

declare(strict_types=1);

// Dependency-free test runner: shared vectors + API checks + property tests.
// Usage: php tests/run.php            (exit code 1 on any failure)

use Samt\Nass\Honorifics;
use Samt\Nass\Level;
use Samt\Nass\MatchMode;
use Samt\Nass\Nass;
use Samt\Nass\Offsets;

require __DIR__ . '/bootstrap.php';

$pass = 0;
$fail = 0;
function check(bool $ok, string $label, mixed $got = null, mixed $want = null): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        return;
    }
    $fail++;
    if ($fail <= 20) {
        fwrite(STDERR, "✗ $label\n  got:  " . json_encode($got, JSON_UNESCAPED_UNICODE) . "\n  want: " . json_encode($want, JSON_UNESCAPED_UNICODE) . "\n");
    }
}
function vectors(string $name): array
{
    return json_decode(file_get_contents(__DIR__ . "/../../../spec/vectors/$name.json"), true)['cases'];
}
$lv = static fn (?string $l): Level => Level::from($l ?? 'search');
$ho = static fn (?array $o): Honorifics => Honorifics::from($o['honorifics'] ?? 'keep');

foreach (vectors('normalize') as $c) {
    $got = Nass::normalize($c['input'], $lv($c['level']), $ho($c['options'] ?? null));
    check($got === $c['expected'], "{$c['id']}: {$c['note']}", $got, $c['expected']);
}
foreach (vectors('offsets') as $c) {
    $m = Nass::normalizeWithMap($c['input'], $lv($c['level']), $ho($c['options'] ?? null));
    // Vectors use UTF-16; this package uses code points. Expand per code point -> per UTF-16 unit.
    $start = $end = [];
    $cps = Samt\Nass\Normalizer::decode($m->text);
    $s16 = Offsets::listToUtf16($c['input'], $m->start);
    $e16 = Offsets::listToUtf16($c['input'], $m->end);
    foreach ($cps as $i => $cp) {
        for ($u = 0; $u < ($cp > 0xFFFF ? 2 : 1); $u++) {
            $start[] = $s16[$i];
            $end[] = $e16[$i];
        }
    }
    check($m->text === $c['expected'] && $start === $c['start'] && $end === $c['end'], "{$c['id']}: {$c['note']}",
        [$m->text, $start, $end], [$c['expected'], $c['start'], $c['end']]);
}
foreach (vectors('search') as $c) {
    $o = $c['options'] ?? [];
    $ms = Nass::findAll($c['haystack'], $c['needle'], $lv($o['level'] ?? null), MatchMode::from($o['matchMode'] ?? 'phrase'), $o['wholeWord'] ?? false, $ho($o));
    $got = array_map(static fn ($m) => [
        'start' => Offsets::toUtf16($c['haystack'], $m->start),
        'end' => Offsets::toUtf16($c['haystack'], $m->end),
        'text' => $m->text,
    ], $ms);
    check($got === $c['expected'], "{$c['id']}: {$c['note']}", $got, $c['expected']);
}
foreach (vectors('names') as $c) {
    if (isset($c['expected'])) {
        check(Nass::nameKey($c['input']) === $c['expected'], "{$c['id']}: {$c['note']}", Nass::nameKey($c['input']), $c['expected']);
    }
    if (isset($c['same'])) {
        $keys = array_unique(array_map([Nass::class, 'nameKey'], $c['same']));
        check(count($keys) === 1, "{$c['id']}: {$c['note']}", $keys, 'one key');
    }
    if (isset($c['different'])) {
        $keys = array_unique(array_map([Nass::class, 'nameKey'], $c['different']));
        check(count($keys) === count($c['different']), "{$c['id']}: {$c['note']}", $keys, 'distinct keys');
    }
}

// API
$h = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';
check(Nass::highlight($h, 'الاعمال') === 'إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ', 'highlight', Nass::highlight($h, 'الاعمال'), '');
check(Nass::contains($h, 'انما الاعمال'), 'contains');
check(!Nass::contains($h, 'عمال', wholeWord: true), 'contains wholeWord');
check(Nass::normalize($h) === 'انما الاعمال بالنيات', 'default level');
check(Offsets::toUtf16('👨ب', 1) === 2 && Offsets::fromUtf16('👨ب', 2) === 1, 'offset conversion');

// Properties
$pieces = ['ب', 'س', 'ا', 'أ', 'ٱ', 'ى', 'ة', 'ؤ', 'ء', 'ک', "\u{064E}", "\u{0651}", "\u{0670}", "\u{06E5}", "\u{0654}", 'ـ', 'ﷲ', 'ﻻ', 'ﷺ', '﷽',
    "\u{FE70}", ' ', "\n", '،', '.', '٫', '۝', '%', '١', '3', "\u{200D}", "\u{200F}", "\u{FEFF}", '👨', 'A', ' الله ', ' تعالى ', ' رضي الله عنه ', ' عبد '];
mt_srand(42);
for ($i = 0; $i < 1500; $i++) {
    $x = '';
    for ($k = mt_rand(0, 13); $k > 0; $k--) {
        $x .= $pieces[mt_rand(0, count($pieces) - 1)];
    }
    foreach (Level::cases() as $l) {
        foreach (Honorifics::cases() as $hon) {
            $once = Nass::normalize($x, $l, $hon);
            check(Nass::normalize($once, $l, $hon) === $once, "idempotent {$l->value}/{$hon->value}: " . bin2hex($x), Nass::normalize($once, $l, $hon), $once);
        }
    }
    check(Nass::normalize(Nass::normalize($x, Level::Clean)) === Nass::normalize($x), 'clean ⊂ search: ' . bin2hex($x));
}

printf("%d passed, %d failed\n", $pass, $fail);
exit($fail === 0 ? 0 : 1);
