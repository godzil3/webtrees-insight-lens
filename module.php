<?php

/**
 * Insight Lens - Entry point
 */

declare(strict_types=1);

namespace WebtreesLens;

use Fisharebest\Webtrees\Registry;

// Load the autoloader for this module
require __DIR__ . '/autoload.php';

// This script must return an object that implements ModuleCustomInterface.
// We use dependency injection via the container to get the LensStatsService instance.
return Registry::container()->get(LensModule::class);
