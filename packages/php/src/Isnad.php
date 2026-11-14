<?php

declare(strict_types=1);

namespace Samt\Nass;

/**
 * Experimental isnad/matn split (SPEC §8). Implemented in phase 4.
 *
 * @internal
 */
final class Isnad
{
    public static function split(string $text): IsnadSplit
    {
        return new IsnadSplit('', $text, 0.0, []);
    }
}
