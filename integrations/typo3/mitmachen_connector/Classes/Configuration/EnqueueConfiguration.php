<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Configuration;

final readonly class EnqueueConfiguration
{
    public function __construct(
        public string $sourceUrl,
        public string $formVersion,
        public string $privacyNoticeVersion,
        public string $consentTextVersion,
    ) {
        self::assertHttpsUrl($sourceUrl, 'sourceUrl');
        self::assertVersion($formVersion, 'formVersion');
        self::assertVersion($privacyNoticeVersion, 'privacyNoticeVersion');
        self::assertVersion($consentTextVersion, 'consentTextVersion');
    }

    private static function assertHttpsUrl(string $url, string $field): void
    {
        $parts = parse_url($url);
        if (
            strlen($url) > 2048
            || !is_array($parts)
            || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
            || (string)($parts['host'] ?? '') === ''
            || isset($parts['user'])
            || isset($parts['pass'])
        ) {
            throw new ConfigurationException($field . ' must be an absolute HTTPS URL without user information.');
        }
    }

    private static function assertVersion(string $value, string $field): void
    {
        if ($value === '' || strlen($value) > 191 || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            throw new ConfigurationException($field . ' must be configured with a printable value of at most 191 bytes.');
        }
    }
}
