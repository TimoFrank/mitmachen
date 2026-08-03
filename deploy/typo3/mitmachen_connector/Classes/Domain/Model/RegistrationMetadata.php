<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Model;

use InvalidArgumentException;

final readonly class RegistrationMetadata
{
    public function __construct(
        public string $submissionId,
        public int $submittedAt,
        public int $sourceFormUid,
        public int $sourceRecordUid,
        public string $sourceUrl,
        public string $formVersion,
        public string $privacyNoticeVersion,
        public ?string $consentTextVersion,
    ) {
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $submissionId) !== 1) {
            throw new InvalidArgumentException('submission_id must be a UUIDv4.');
        }
        if ($submittedAt <= 0 || $sourceFormUid <= 0 || $sourceRecordUid <= 0) {
            throw new InvalidArgumentException('Submission time and source identifiers must be positive.');
        }
        if (!self::isHttpsUrl($sourceUrl)) {
            throw new InvalidArgumentException('source_url must be an absolute HTTPS URL.');
        }
        self::assertVersion($formVersion, 'form_version');
        self::assertVersion($privacyNoticeVersion, 'privacy_notice_version');
        if ($consentTextVersion !== null) {
            self::assertVersion($consentTextVersion, 'consent_text_version');
        }
    }

    private static function assertVersion(string $value, string $field): void
    {
        if ($value === '' || strlen($value) > 191 || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            throw new InvalidArgumentException($field . ' must be a non-empty printable value of at most 191 bytes.');
        }
    }

    private static function isHttpsUrl(string $url): bool
    {
        $parts = parse_url($url);

        return is_array($parts)
            && strtolower((string)($parts['scheme'] ?? '')) === 'https'
            && (string)($parts['host'] ?? '') !== ''
            && !isset($parts['user'])
            && !isset($parts['pass']);
    }
}
