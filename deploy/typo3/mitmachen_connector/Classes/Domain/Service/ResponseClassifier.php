<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

final class ResponseClassifier
{
    public const DELIVERED = 'delivered';
    public const RETRY = 'retry';
    public const PERMANENT_FAILURE = 'permanent_failure';

    public function classify(int $httpStatus): string
    {
        if ($httpStatus >= 200 && $httpStatus <= 299) {
            return self::DELIVERED;
        }
        if ($httpStatus === 429 || ($httpStatus >= 500 && $httpStatus <= 599)) {
            return self::RETRY;
        }

        return self::PERMANENT_FAILURE;
    }
}
