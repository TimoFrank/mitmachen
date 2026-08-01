<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Configuration;

final readonly class DeliveryConfiguration
{
    public const ENDPOINT_PATH = '/api/connectors/typo3/mitmachen-registrations';

    public function __construct(
        public string $endpoint,
        public string $keyId,
        public string $secretEnvVar,
        public int $batchSize,
        public int $requestTimeoutSeconds,
        public int $lockTimeoutSeconds,
    ) {
        $parts = parse_url($endpoint);
        if (
            !is_array($parts)
            || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
            || (string)($parts['host'] ?? '') === ''
            || rtrim((string)($parts['path'] ?? ''), '/') !== self::ENDPOINT_PATH
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
        ) {
            throw new ConfigurationException(
                'endpoint must be an HTTPS URL with the exact path ' . self::ENDPOINT_PATH . ' and no credentials, query, or fragment.',
            );
        }
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/D', $keyId) !== 1) {
            throw new ConfigurationException('keyId must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}.');
        }
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,127}$/D', $secretEnvVar) !== 1) {
            throw new ConfigurationException('secretEnvVar is not a valid environment variable name.');
        }
        if ($batchSize < 1 || $batchSize > 100) {
            throw new ConfigurationException('batchSize must be between 1 and 100.');
        }
        if ($requestTimeoutSeconds < 1 || $requestTimeoutSeconds > 30) {
            throw new ConfigurationException('requestTimeoutSeconds must be between 1 and 30.');
        }
        if ($lockTimeoutSeconds < 60 || $lockTimeoutSeconds > 3600) {
            throw new ConfigurationException('lockTimeoutSeconds must be between 60 and 3600.');
        }
    }
}
