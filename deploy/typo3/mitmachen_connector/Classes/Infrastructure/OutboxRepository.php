<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Infrastructure;

use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Gematik\MitmachenConnector\Domain\Model\OutboxEntry;
use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

final class OutboxRepository implements OutboxRepositoryInterface
{
    public const TABLE = 'tx_mitmachenconnector_outbox';

    public function __construct(
        private readonly ConnectionPool $connectionPool,
        private readonly UuidGenerator $uuidGenerator,
    ) {
    }

    public function enqueue(RegistrationMetadata $metadata, int $now): bool
    {
        $connection = $this->connectionPool->getConnectionForTable(self::TABLE);
        try {
            $connection->insert(
                self::TABLE,
                [
                    'pid' => 0,
                    'tstamp' => $now,
                    'crdate' => $now,
                    'submission_id' => $metadata->submissionId,
                    'powermail_mail_uid' => $metadata->sourceRecordUid,
                    'source_form_uid' => $metadata->sourceFormUid,
                    'submitted_at' => $metadata->submittedAt,
                    'source_url' => $metadata->sourceUrl,
                    'form_version' => $metadata->formVersion,
                    'privacy_notice_version' => $metadata->privacyNoticeVersion,
                    'consent_text_version' => $metadata->consentTextVersion,
                    'status' => 'pending',
                    'attempt_count' => 0,
                    'next_attempt_at' => $now,
                    'locked_at' => 0,
                    'lock_token' => '',
                    'delivered_at' => 0,
                    'last_http_status' => 0,
                    'last_error_code' => '',
                ],
                [
                    'pid' => Connection::PARAM_INT,
                    'tstamp' => Connection::PARAM_INT,
                    'crdate' => Connection::PARAM_INT,
                    'submission_id' => Connection::PARAM_STR,
                    'powermail_mail_uid' => Connection::PARAM_INT,
                    'source_form_uid' => Connection::PARAM_INT,
                    'submitted_at' => Connection::PARAM_INT,
                    'source_url' => Connection::PARAM_STR,
                    'form_version' => Connection::PARAM_STR,
                    'privacy_notice_version' => Connection::PARAM_STR,
                    'consent_text_version' => $metadata->consentTextVersion === null
                        ? Connection::PARAM_NULL
                        : Connection::PARAM_STR,
                    'status' => Connection::PARAM_STR,
                    'attempt_count' => Connection::PARAM_INT,
                    'next_attempt_at' => Connection::PARAM_INT,
                    'locked_at' => Connection::PARAM_INT,
                    'lock_token' => Connection::PARAM_STR,
                    'delivered_at' => Connection::PARAM_INT,
                    'last_http_status' => Connection::PARAM_INT,
                    'last_error_code' => Connection::PARAM_STR,
                ],
            );
        } catch (UniqueConstraintViolationException) {
            return false;
        }

        return true;
    }

    /**
     * Claiming is optimistic and portable across TYPO3-supported databases:
     * every candidate is conditionally updated, so parallel command runs cannot
     * own the same entry. A crashed worker's lock becomes claimable after the
     * configured timeout.
     *
     * @return list<OutboxEntry>
     */
    public function claimDue(int $limit, int $now, int $lockTimeoutSeconds): array
    {
        $candidateQuery = $this->connectionPool->getQueryBuilderForTable(self::TABLE);
        $candidateQuery
            ->select('uid')
            ->from(self::TABLE);
        $this->applyDueRestriction($candidateQuery, $now, $now - $lockTimeoutSeconds);
        $candidateRows = $candidateQuery
            ->orderBy('next_attempt_at', 'ASC')
            ->addOrderBy('uid', 'ASC')
            ->setMaxResults(min(400, $limit * 4))
            ->executeQuery()
            ->fetchAllAssociative();

        if ($candidateRows === []) {
            return [];
        }

        $lockToken = $this->uuidGenerator->generateV4();
        $claimed = 0;
        foreach ($candidateRows as $row) {
            if ($claimed >= $limit) {
                break;
            }

            $update = $this->connectionPool->getQueryBuilderForTable(self::TABLE);
            $update
                ->update(self::TABLE)
                ->set('status', 'processing')
                ->set('locked_at', $now)
                ->set('lock_token', $lockToken)
                ->set('tstamp', $now)
                ->where(
                    $update->expr()->eq(
                        'uid',
                        $update->createNamedParameter((int)$row['uid'], Connection::PARAM_INT),
                    ),
                );
            $this->applyDueRestriction($update, $now, $now - $lockTimeoutSeconds, true);
            $claimed += $update->executeStatement();
        }

        if ($claimed === 0) {
            return [];
        }

        $claimedQuery = $this->connectionPool->getQueryBuilderForTable(self::TABLE);
        $rows = $claimedQuery
            ->select(
                'uid',
                'submission_id',
                'powermail_mail_uid',
                'source_form_uid',
                'submitted_at',
                'source_url',
                'form_version',
                'privacy_notice_version',
                'consent_text_version',
                'attempt_count',
                'lock_token',
            )
            ->from(self::TABLE)
            ->where(
                $claimedQuery->expr()->eq(
                    'lock_token',
                    $claimedQuery->createNamedParameter($lockToken),
                ),
                $claimedQuery->expr()->eq(
                    'status',
                    $claimedQuery->createNamedParameter('processing'),
                ),
            )
            ->orderBy('uid', 'ASC')
            ->executeQuery()
            ->fetchAllAssociative();

        return array_map(self::hydrate(...), $rows);
    }

    public function markDelivered(OutboxEntry $entry, int $httpStatus, int $now): void
    {
        $query = $this->ownedEntryUpdate($entry);
        $query
            ->set('status', 'delivered')
            ->set('attempt_count', 'attempt_count + 1', false)
            ->set('delivered_at', $now)
            ->set('last_http_status', $httpStatus)
            ->set('last_error_code', '')
            ->set('next_attempt_at', 0)
            ->set('locked_at', 0)
            ->set('lock_token', '')
            ->set('tstamp', $now)
            ->executeStatement();
    }

    public function markPermanentFailure(
        OutboxEntry $entry,
        string $errorCode,
        int $httpStatus,
        int $now,
    ): void {
        $query = $this->ownedEntryUpdate($entry);
        $query
            ->set('status', 'failed')
            ->set('attempt_count', 'attempt_count + 1', false)
            ->set('last_http_status', $httpStatus)
            ->set('last_error_code', substr($errorCode, 0, 64))
            ->set('next_attempt_at', 0)
            ->set('locked_at', 0)
            ->set('lock_token', '')
            ->set('tstamp', $now)
            ->executeStatement();
    }

    public function scheduleRetry(
        OutboxEntry $entry,
        string $errorCode,
        int $httpStatus,
        int $nextAttemptAt,
        int $now,
    ): void {
        $query = $this->ownedEntryUpdate($entry);
        $query
            ->set('status', 'retry')
            ->set('attempt_count', 'attempt_count + 1', false)
            ->set('last_http_status', $httpStatus)
            ->set('last_error_code', substr($errorCode, 0, 64))
            ->set('next_attempt_at', $nextAttemptAt)
            ->set('locked_at', 0)
            ->set('lock_token', '')
            ->set('tstamp', $now)
            ->executeStatement();
    }

    private function ownedEntryUpdate(OutboxEntry $entry): QueryBuilder
    {
        $query = $this->connectionPool->getQueryBuilderForTable(self::TABLE);

        return $query
            ->update(self::TABLE)
            ->where(
                $query->expr()->eq(
                    'uid',
                    $query->createNamedParameter($entry->uid, Connection::PARAM_INT),
                ),
                $query->expr()->eq(
                    'status',
                    $query->createNamedParameter('processing'),
                ),
                $query->expr()->eq(
                    'lock_token',
                    $query->createNamedParameter($entry->lockToken),
                ),
            );
    }

    private function applyDueRestriction(
        QueryBuilder $query,
        int $now,
        int $staleBefore,
        bool $andWhere = false,
    ): void {
        $expression = $query->expr()->or(
            $query->expr()->and(
                $query->expr()->or(
                    $query->expr()->eq('status', $query->createNamedParameter('pending')),
                    $query->expr()->eq('status', $query->createNamedParameter('retry')),
                ),
                $query->expr()->lte(
                    'next_attempt_at',
                    $query->createNamedParameter($now, Connection::PARAM_INT),
                ),
            ),
            $query->expr()->and(
                $query->expr()->eq('status', $query->createNamedParameter('processing')),
                $query->expr()->lte(
                    'locked_at',
                    $query->createNamedParameter($staleBefore, Connection::PARAM_INT),
                ),
            ),
        );

        if ($andWhere) {
            $query->andWhere($expression);
        } else {
            $query->where($expression);
        }
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function hydrate(array $row): OutboxEntry
    {
        $consentTextVersion = $row['consent_text_version'] ?? null;

        return new OutboxEntry(
            (int)$row['uid'],
            (string)$row['submission_id'],
            (int)$row['powermail_mail_uid'],
            (int)$row['source_form_uid'],
            (int)$row['submitted_at'],
            (string)$row['source_url'],
            (string)$row['form_version'],
            (string)$row['privacy_notice_version'],
            $consentTextVersion === null || $consentTextVersion === '' ? null : (string)$consentTextVersion,
            (int)$row['attempt_count'],
            (string)$row['lock_token'],
        );
    }
}
