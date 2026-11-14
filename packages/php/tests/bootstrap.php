<?php

declare(strict_types=1);

// Autoloader for running without Composer (composer.json provides the same mapping).
require_once __DIR__ . '/../src/Enums.php';
spl_autoload_register(static function (string $class): void {
    $prefix = 'Samt\\Nass\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/../src/' . substr($class, strlen($prefix)) . '.php';
        if (is_file($file)) {
            require_once $file;
        }
    }
});
