<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Infrastructure;

use Doctrine\DBAL\DriverManager;
use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use Gematik\MitmachenConnector\Infrastructure\OutboxRepository;
use Gematik\MitmachenConnector\Tests\Unit\Infrastructure\Fixtures\SchemaLessSqliteConnection;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;

final class OutboxRepositoryTest extends TestCase
{
    public function testPersistsClaimsAndCompletesAnOwnedOutboxEntry(): void
    {
        [$repository, $connection] = $this->repository();
        $metadata = self::metadata();

        self::assertTrue($repository->enqueue($metadata, 1_700_000_000));

        $stored = $connection->fetchAssociative(
            'SELECT * FROM tx_mitmachenconnector_outbox WHERE powermail_mail_uid = 123',
        );
        self::assertIsArray($stored);
        self::assertSame('pending', $stored['status']);
        self::assertSame('consent-v3', $stored['consent_text_version']);
        self::assertSame(0, (int)$stored['attempt_count']);

        $entries = $repository->claimDue(1, 1_700_000_001, 900);
        self::assertCount(1, $entries);
        self::assertSame($metadata->submissionId, $entries[0]->submissionId);
        self::assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D',
            $entries[0]->lockToken,
        );

        $repository->markDelivered($entries[0], 202, 1_700_000_002);

        $completed = $connection->fetchAssociative(
            'SELECT status, attempt_count, delivered_at, last_http_status, lock_token '
            . 'FROM tx_mitmachenconnector_outbox WHERE uid = 1',
        );
        self::assertSame('delivered', $completed['status']);
        self::assertSame(1, (int)$completed['attempt_count']);
        self::assertSame(1_700_000_002, (int)$completed['delivered_at']);
        self::assertSame(202, (int)$completed['last_http_status']);
        self::assertSame('', $completed['lock_token']);
    }

    public function testDuplicateSourceRecordIsIdempotent(): void
    {
        [$repository] = $this->repository();

        self::assertTrue($repository->enqueue(self::metadata(), 1_700_000_000));
        self::assertFalse($repository->enqueue(
            new RegistrationMetadata(
                'd09cf3e2-ac3a-4f83-9514-8b04ab04a2f1',
                1_700_000_010,
                41,
                123,
                'https://www.gematik.de/mitmachen/versorgungs-netzwerk',
                'powermail-41-v7',
                'privacy-v4',
                null,
            ),
            1_700_000_010,
        ));
    }

    /**
     * @return array{OutboxRepository, Connection}
     */
    private function repository(): array
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'memory' => true,
            'wrapperClass' => SchemaLessSqliteConnection::class,
        ]);
        self::assertInstanceOf(Connection::class, $connection);
        $connection->executeStatement(<<<'SQL'
            CREATE TABLE tx_mitmachenconnector_outbox (
                uid INTEGER PRIMARY KEY AUTOINCREMENT,
                pid INTEGER NOT NULL,
                tstamp INTEGER NOT NULL,
                crdate INTEGER NOT NULL,
                submission_id TEXT NOT NULL UNIQUE,
                powermail_mail_uid INTEGER NOT NULL UNIQUE,
                source_form_uid INTEGER NOT NULL,
                submitted_at INTEGER NOT NULL,
                source_url TEXT NOT NULL,
                form_version TEXT NOT NULL,
                privacy_notice_version TEXT NOT NULL,
                consent_text_version TEXT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                next_attempt_at INTEGER NOT NULL,
                locked_at INTEGER NOT NULL,
                lock_token TEXT NOT NULL,
                delivered_at INTEGER NOT NULL,
                last_http_status INTEGER NOT NULL,
                last_error_code TEXT NOT NULL
            )
            SQL);

        $pool = $this->createMock(ConnectionPool::class);
        $pool->method('getConnectionForTable')->willReturn($connection);
        $pool->method('getQueryBuilderForTable')->willReturnCallback(
            static fn(): object => $connection->createQueryBuilder(),
        );

        return [new OutboxRepository($pool, new UuidGenerator()), $connection];
    }

    private static function metadata(): RegistrationMetadata
    {
        return new RegistrationMetadata(
            '80c8b525-7a88-4b52-87b0-a67f522bb38d',
            1_700_000_000,
            41,
            123,
            'https://www.gematik.de/mitmachen/versorgungs-netzwerk',
            'powermail-41-v7',
            'privacy-v4',
            'consent-v3',
        );
    }
}
