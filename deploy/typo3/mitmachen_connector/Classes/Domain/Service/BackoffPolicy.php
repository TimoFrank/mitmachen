<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

use InvalidArgumentException;

final class BackoffPolicy
{
    public const BASE_DELAY_SECONDS = 60;
    public const MAX_EXPONENTIAL_DELAY_SECONDS = 21_600;
    public const MAX_RETRY_AFTER_SECONDS = 86_400;

    public function delaySeconds(int $attemptNumber, ?int $retryAfterSeconds = null): int
    {
        if ($attemptNumber < 1) {
            throw new InvalidArgumentException('The attempt number starts at one.');
        }

        $exponent = min($attemptNumber - 1, 30);
        $exponential = min(
            self::MAX_EXPONENTIAL_DELAY_SECONDS,
            self::BASE_DELAY_SECONDS * (2 ** $exponent),
        );

        if ($retryAfterSeconds === null) {
            return $exponential;
        }

        $retryAfterSeconds = max(0, min(self::MAX_RETRY_AFTER_SECONDS, $retryAfterSeconds));

        return max($exponential, $retryAfterSeconds);
    }
}
