<?php

/**
 * Autoloader for Insight Lens classes
 */

declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    // Does this class belong to this module?
    if (str_starts_with($class, 'WebtreesLens\\')) {
        $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen('WebtreesLens\\'))) . '.php';

        if (file_exists($file)) {
            require $file;
        }
    }
});
