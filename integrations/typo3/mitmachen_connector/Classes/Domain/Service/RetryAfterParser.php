<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

final class RetryAfterParser
{
    public function parse(string $headerValue, int $now): ?int
    {
        $value = trim($headerValue);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^\d+$/D', $value) === 1) {
            return (int)$value;
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return null;
        }

        return max(0, $timestamp - $now);
    }
}
