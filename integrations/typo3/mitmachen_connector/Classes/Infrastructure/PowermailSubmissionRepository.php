<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Infrastructure;

use Gematik\MitmachenConnector\Domain\Model\PowermailSubmission;
use In2code\Powermail\Domain\Model\Answer;
use In2code\Powermail\Domain\Model\Field;
use In2code\Powermail\Domain\Model\Mail;
use JsonException;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;

final class PowermailSubmissionRepository implements PowermailSubmissionRepositoryInterface
{
    public function __construct(
        private readonly ConnectionPool $connectionPool,
    ) {
    }

    public function find(int $mailUid): ?PowermailSubmission
    {
        $mailQuery = $this->connectionPool->getQueryBuilderForTable(Mail::TABLE_NAME);
        $mailQuery->getRestrictions()->removeAll();
        $mailRow = $mailQuery
            ->select('uid', 'form')
            ->from(Mail::TABLE_NAME)
            ->where(
                $mailQuery->expr()->eq(
                    'uid',
                    $mailQuery->createNamedParameter($mailUid, Connection::PARAM_INT),
                ),
                $mailQuery->expr()->eq(
                    'deleted',
                    $mailQuery->createNamedParameter(0, Connection::PARAM_INT),
                ),
            )
            ->executeQuery()
            ->fetchAssociative();
        if ($mailRow === false) {
            return null;
        }

        $answerQuery = $this->connectionPool->getQueryBuilderForTable(Answer::TABLE_NAME);
        $answerQuery->getRestrictions()->removeAll();
        $rows = $answerQuery
            ->select(
                'a.value',
                'a.value_type',
                'f.marker',
                'f.l10n_parent',
            )
            ->from(Answer::TABLE_NAME, 'a')
            ->innerJoin(
                'a',
                Field::TABLE_NAME,
                'f',
                $answerQuery->expr()->eq('f.uid', 'a.field'),
            )
            ->where(
                $answerQuery->expr()->eq(
                    'a.mail',
                    $answerQuery->createNamedParameter($mailUid, Connection::PARAM_INT),
                ),
                $answerQuery->expr()->eq(
                    'a.deleted',
                    $answerQuery->createNamedParameter(0, Connection::PARAM_INT),
                ),
            )
            ->executeQuery()
            ->fetchAllAssociative();

        $answersByMarker = [];
        foreach ($rows as $row) {
            $marker = (string)$row['marker'];
            if ($marker === '' && (int)$row['l10n_parent'] > 0) {
                $marker = $this->parentFieldMarker((int)$row['l10n_parent']);
            }
            if ($marker === '') {
                continue;
            }
            $answersByMarker[$marker] = self::decodeValue(
                (string)($row['value'] ?? ''),
                (int)($row['value_type'] ?? 0),
            );
        }

        return new PowermailSubmission(
            (int)$mailRow['uid'],
            (int)$mailRow['form'],
            $answersByMarker,
        );
    }

    private function parentFieldMarker(int $fieldUid): string
    {
        $query = $this->connectionPool->getQueryBuilderForTable(Field::TABLE_NAME);
        $query->getRestrictions()->removeAll();
        $marker = $query
            ->select('marker')
            ->from(Field::TABLE_NAME)
            ->where(
                $query->expr()->eq(
                    'uid',
                    $query->createNamedParameter($fieldUid, Connection::PARAM_INT),
                ),
            )
            ->executeQuery()
            ->fetchOne();

        return $marker === false ? '' : (string)$marker;
    }

    private static function decodeValue(string $value, int $valueType): mixed
    {
        if ($valueType !== Answer::VALUE_TYPE_ARRAY) {
            return $value;
        }

        try {
            $decoded = json_decode($value, true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return $value;
        }

        return is_array($decoded) ? $decoded : $value;
    }
}
