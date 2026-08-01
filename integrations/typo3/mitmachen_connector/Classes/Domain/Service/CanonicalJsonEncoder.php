<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

use JsonException;

final class CanonicalJsonEncoder
{
    /**
     * @param array<string, mixed> $payload
     * @throws JsonException
     */
    public function encode(array $payload): string
    {
        return json_encode(
            $payload,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        );
    }
}
