<?php

declare(strict_types=1);

// Benchmark: normalize ~1 MB of fully vocalized Arabic (PRD §6.4: < 150 ms in PHP).
use Samt\Nass\Level;
use Samt\Nass\Nass;

require __DIR__ . '/../tests/bootstrap.php';

$unit = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى ﷺ. ';
$text = '';
while (strlen($text) < 1 << 20) {
    $text .= $unit;
}
foreach (Level::cases() as $level) {
    Nass::normalize($text, $level);
    $runs = 5;
    $t0 = hrtime(true);
    for ($i = 0; $i < $runs; $i++) {
        Nass::normalize($text, $level);
    }
    printf("%s: %.1f ms per %d KB (UTF-8)\n", $level->value, (hrtime(true) - $t0) / $runs / 1e6, strlen($text) / 1024);
}
