<?php

declare(strict_types=1);

// Benchmark: normalize 1 Mi UTF-16 units (~2 MB UTF-8) of real, fully vocalized
// hadith text: Sahih al-Bukhari in file order, built by tools/bench-text.mjs
// (PRD §6.4: < 150 ms in PHP). Run from packages/php: php benchmark/bench.php
use Samt\Nass\Level;
use Samt\Nass\Nass;

require __DIR__ . '/../tests/bootstrap.php';

$file = __DIR__ . '/../../../tools/corpus/bench-bukhari-1m.txt';
if (!is_file($file)) {
    fwrite(STDERR, "missing $file\nrun: node tools/fetch-corpus.mjs && node tools/bench-text.mjs\n");
    exit(1);
}
$text = (string) file_get_contents($file);
foreach (Level::cases() as $level) {
    Nass::normalize($text, $level);
    $runs = 5;
    $t0 = hrtime(true);
    for ($i = 0; $i < $runs; $i++) {
        Nass::normalize($text, $level);
    }
    printf("%s: %.1f ms per %d KB (UTF-8)\n", $level->value, (hrtime(true) - $t0) / $runs / 1e6, strlen($text) / 1024);
}
