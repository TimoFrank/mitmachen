<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Infrastructure;

use Gematik\MitmachenConnector\Domain\Model\OutboxEntry;
use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;

interface OutboxRepositoryInterface
{
    public function enqueue(RegistrationMetadata $metadata, int $now): bool;

    /**
     * @return list<OutboxEntry>
     */
    public function claimDue(int $limit, int $now, int $lockTimeoutSeconds): array;

    public function markDelivered(OutboxEntry $entry, int $httpStatus, int $now): void;

    public function markPermanentFailure(
        OutboxEntry $entry,
        string $errorCode,
        int $httpStatus,
        int $now,
    ): void;

    public function scheduleRetry(
        OutboxEntry $entry,
        string $errorCode,
        int $httpStatus,
        int $nextAttemptAt,
        int $now,
    ): void;
}
