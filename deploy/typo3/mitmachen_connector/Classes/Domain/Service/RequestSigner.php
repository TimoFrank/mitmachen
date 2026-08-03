<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

use InvalidArgumentException;

final class RequestSigner
{
    /**
     * @return array{x-mitmachen-key-id: string, x-mitmachen-timestamp: string, x-mitmachen-signature: string}
     */
    public function headers(string $rawBody, string $keyId, int $unixSeconds, string $binarySecret): array
    {
        if ($keyId === '' || preg_match('/[\r\n]/', $keyId) === 1) {
            throw new InvalidArgumentException('The HMAC key ID must be non-empty and must not contain line breaks.');
        }
        if ($unixSeconds <= 0) {
            throw new InvalidArgumentException('The HMAC timestamp must be positive.');
        }
        if (strlen($binarySecret) < 32) {
            throw new InvalidArgumentException('The decoded HMAC secret must contain at least 32 bytes.');
        }

        $timestamp = (string)$unixSeconds;
        $signatureContract = implode("\n", [
            'v1',
            $keyId,
            $timestamp,
            hash('sha256', $rawBody),
        ]);
        $signature = hash_hmac('sha256', $signatureContract, $binarySecret);

        return [
            'x-mitmachen-key-id' => $keyId,
            'x-mitmachen-timestamp' => $timestamp,
            'x-mitmachen-signature' => 'sha256=' . $signature,
        ];
    }
}
