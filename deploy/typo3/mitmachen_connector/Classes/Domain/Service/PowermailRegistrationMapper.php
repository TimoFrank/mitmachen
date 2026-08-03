<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Service;

use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use InvalidArgumentException;
use Stringable;

final class PowermailRegistrationMapper
{
    public const SCHEMA_VERSION = 'mitmachen-typo3-registration-v1';
    public const SOURCE_FORM_UID = 41;
    public const CONSENT_MARKER = 'mitmachen_email_einwilligung';

    /**
     * The legacy marker is intentionally absent. `datenschutzhinweis` must never
     * be interpreted as voluntary permission for additional email.
     *
     * @var array<string, string>
     */
    public const MARKER_TO_PAYLOAD_FIELD = [
        'ihree_mail_adresse_01' => 'email',
        'anrede_01' => 'salutation',
        'titel_01' => 'title',
        'vorname_01' => 'first_name',
        'nachname_01' => 'last_name',
        'namedereinrichtungfuerdiesieeinehospitationanbietenmoechten_01' => 'organization',
        'bittewaehlensiedensektorausderaufihreeinrichtungzutrifft_01' => 'sector',
        'ihrenachricht_01' => 'message',
    ];

    /**
     * @param array<string, mixed> $answersByMarker
     * @return array<string, bool|int|string|null>
     */
    public function map(array $answersByMarker, RegistrationMetadata $metadata): array
    {
        if ($metadata->sourceFormUid !== self::SOURCE_FORM_UID) {
            throw new InvalidArgumentException('Only Powermail form UID 41 is supported.');
        }

        $values = [];
        foreach (self::MARKER_TO_PAYLOAD_FIELD as $marker => $payloadField) {
            $values[$payloadField] = self::optionalString($answersByMarker[$marker] ?? null);
        }

        $email = $values['email'];
        if ($email === null || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidArgumentException('The Powermail submission has no valid email address.');
        }

        $submittedAt = gmdate('Y-m-d\TH:i:s\Z', $metadata->submittedAt);

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'submission_id' => $metadata->submissionId,
            'submitted_at' => $submittedAt,
            'source_form_uid' => self::SOURCE_FORM_UID,
            'source_record_uid' => $metadata->sourceRecordUid,
            'source_url' => $metadata->sourceUrl,
            'form_version' => $metadata->formVersion,
            'privacy_notice_version' => $metadata->privacyNoticeVersion,
            'privacy_notice_presented_at' => $submittedAt,
            'consent_text_version' => $metadata->consentTextVersion,
            'email_permission_requested' => $metadata->consentTextVersion !== null,
            'email' => $email,
            'salutation' => $values['salutation'],
            'title' => $values['title'],
            'first_name' => $values['first_name'],
            'last_name' => $values['last_name'],
            'organization' => $values['organization'],
            'sector' => $values['sector'],
            'message' => $values['message'],
            'language' => 'de',
        ];
    }

    /**
     * @param array<string, mixed> $answersByMarker
     */
    public function freezeConsentTextVersion(array $answersByMarker, string $configuredVersion): ?string
    {
        if (!CheckboxValue::isSelected($answersByMarker[self::CONSENT_MARKER] ?? null)) {
            return null;
        }

        $version = trim($configuredVersion);
        if ($version === '') {
            throw new InvalidArgumentException('A consent text version is required for a selected optional checkbox.');
        }

        return $version;
    }

    private static function optionalString(mixed $value): ?string
    {
        if (is_array($value)) {
            $parts = [];
            foreach ($value as $item) {
                $part = self::optionalString($item);
                if ($part !== null) {
                    $parts[] = $part;
                }
            }
            $value = implode(', ', $parts);
        } elseif ($value instanceof Stringable) {
            $value = (string)$value;
        } elseif (is_scalar($value)) {
            $value = (string)$value;
        } else {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
