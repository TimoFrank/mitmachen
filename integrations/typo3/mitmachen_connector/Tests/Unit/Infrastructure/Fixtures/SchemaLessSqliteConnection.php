<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Infrastructure\Fixtures;

use TYPO3\CMS\Core\Database\Connection;

/**
 * Keeps repository tests on the real TYPO3 query builder while avoiding the
 * bootstrapped TYPO3 schema caches that are not available in isolated unit tests.
 */
final class SchemaLessSqliteConnection extends Connection
{
    protected function ensureDatabaseValueTypes(string $tableName, array &$data, array &$types): void
    {
    }
}
