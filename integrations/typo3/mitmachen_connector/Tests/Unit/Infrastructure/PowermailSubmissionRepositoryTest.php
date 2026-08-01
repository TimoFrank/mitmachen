<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Infrastructure;

use Doctrine\DBAL\DriverManager;
use Gematik\MitmachenConnector\Infrastructure\PowermailSubmissionRepository;
use Gematik\MitmachenConnector\Tests\Unit\Infrastructure\Fixtures\SchemaLessSqliteConnection;
use In2code\Powermail\Domain\Model\Answer;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;

final class PowermailSubmissionRepositoryTest extends TestCase
{
    public function testHydratesDirectAndLocalizedMarkersAndDecodesArrayValues(): void
    {
        $connection = self::connection();
        $connection->insert('tx_powermail_domain_model_mail', [
            'uid' => 123,
            'form' => 41,
            'deleted' => 0,
        ]);
        $connection->insert('tx_powermail_domain_model_field', [
            'uid' => 1,
            'marker' => 'ihree_mail_adresse_01',
            'l10n_parent' => 0,
        ]);
        $connection->insert('tx_powermail_domain_model_field', [
            'uid' => 2,
            'marker' => '',
            'l10n_parent' => 3,
        ]);
        $connection->insert('tx_powermail_domain_model_field', [
            'uid' => 3,
            'marker' => 'nachname_01',
            'l10n_parent' => 0,
        ]);
        $connection->insert('tx_powermail_domain_model_answer', [
            'mail' => 123,
            'field' => 1,
            'value' => 'person@example.org',
            'value_type' => Answer::VALUE_TYPE_TEXT,
            'deleted' => 0,
        ]);
        $connection->insert('tx_powermail_domain_model_answer', [
            'mail' => 123,
            'field' => 2,
            'value' => '["Lovelace","Byron"]',
            'value_type' => Answer::VALUE_TYPE_ARRAY,
            'deleted' => 0,
        ]);

        $pool = $this->createMock(ConnectionPool::class);
        $pool->method('getQueryBuilderForTable')->willReturnCallback(
            static fn(): object => $connection->createQueryBuilder(),
        );
        $repository = new PowermailSubmissionRepository($pool);

        $submission = $repository->find(123);

        self::assertNotNull($submission);
        self::assertSame(123, $submission->mailUid);
        self::assertSame(41, $submission->formUid);
        self::assertSame('person@example.org', $submission->answersByMarker['ihree_mail_adresse_01']);
        self::assertSame(['Lovelace', 'Byron'], $submission->answersByMarker['nachname_01']);
        self::assertNull($repository->find(999));
    }

    private static function connection(): Connection
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'memory' => true,
            'wrapperClass' => SchemaLessSqliteConnection::class,
        ]);
        self::assertInstanceOf(Connection::class, $connection);
        $connection->executeStatement(
            'CREATE TABLE tx_powermail_domain_model_mail '
            . '(uid INTEGER PRIMARY KEY, form INTEGER NOT NULL, deleted INTEGER NOT NULL)',
        );
        $connection->executeStatement(
            'CREATE TABLE tx_powermail_domain_model_field '
            . '(uid INTEGER PRIMARY KEY, marker TEXT NOT NULL, l10n_parent INTEGER NOT NULL)',
        );
        $connection->executeStatement(
            'CREATE TABLE tx_powermail_domain_model_answer '
            . '(uid INTEGER PRIMARY KEY AUTOINCREMENT, mail INTEGER NOT NULL, field INTEGER NOT NULL, '
            . 'value TEXT NOT NULL, value_type INTEGER NOT NULL, deleted INTEGER NOT NULL)',
        );

        return $connection;
    }
}
