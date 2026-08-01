<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Model\RegistrationMetadata;
use Gematik\MitmachenConnector\Domain\Service\PowermailRegistrationMapper;
use PHPUnit\Framework\TestCase;

final class PowermailRegistrationMapperTest extends TestCase
{
    private PowermailRegistrationMapper $mapper;

    protected function setUp(): void
    {
        $this->mapper = new PowermailRegistrationMapper();
    }

    public function testMapsOnlyTheExactLiveMarkersToTheFlatContract(): void
    {
        $answers = [
            'ihree_mail_adresse_01' => ' person@example.org ',
            'anrede_01' => 'Frau',
            'titel_01' => 'Dr.',
            'vorname_01' => 'Ada',
            'nachname_01' => 'Lovelace',
            'namedereinrichtungfuerdiesieeinehospitationanbietenmoechten_01' => 'Beispielklinik',
            'bittewaehlensiedensektorausderaufihreeinrichtungzutrifft_01' => 'Krankenhaus',
            'ihrenachricht_01' => 'Gern vormittags.',
            'mitmachen_email_einwilligung' => ['yes'],
            'datenschutzhinweis' => ['legacy-required-value'],
            'unknown_marker' => 'must not be copied',
        ];
        $consentVersion = $this->mapper->freezeConsentTextVersion(
            $answers,
            'mitmachen-email-v3',
        );
        $payload = $this->mapper->map(
            $answers,
            self::metadata($consentVersion),
        );

        self::assertSame(
            [
                'schema_version',
                'submission_id',
                'submitted_at',
                'source_form_uid',
                'source_record_uid',
                'source_url',
                'form_version',
                'privacy_notice_version',
                'privacy_notice_presented_at',
                'consent_text_version',
                'email_permission_requested',
                'email',
                'salutation',
                'title',
                'first_name',
                'last_name',
                'organization',
                'sector',
                'message',
                'language',
            ],
            array_keys($payload),
        );
        self::assertSame('2026-07-30T16:00:00Z', $payload['submitted_at']);
        self::assertSame($payload['submitted_at'], $payload['privacy_notice_presented_at']);
        self::assertSame(41, $payload['source_form_uid']);
        self::assertSame(9876, $payload['source_record_uid']);
        self::assertSame('mitmachen-email-v3', $payload['consent_text_version']);
        self::assertTrue($payload['email_permission_requested']);
        self::assertSame('person@example.org', $payload['email']);
        self::assertSame('Ada', $payload['first_name']);
        self::assertSame('Beispielklinik', $payload['organization']);
        self::assertArrayNotHasKey('datenschutzhinweis', $payload);
        self::assertArrayNotHasKey('unknown_marker', $payload);
    }

    public function testLegacyPrivacyMarkerNeverCreatesVoluntaryEmailPermission(): void
    {
        $answers = [
            'ihree_mail_adresse_01' => 'person@example.org',
            'datenschutzhinweis' => ['1'],
        ];

        $consentVersion = $this->mapper->freezeConsentTextVersion(
            $answers,
            'mitmachen-email-v3',
        );
        $payload = $this->mapper->map($answers, self::metadata($consentVersion));

        self::assertNull($consentVersion);
        self::assertNull($payload['consent_text_version']);
        self::assertFalse($payload['email_permission_requested']);
    }

    public function testEmptyOptionalFieldsBecomeJsonNullValues(): void
    {
        $payload = $this->mapper->map(
            ['ihree_mail_adresse_01' => 'person@example.org'],
            self::metadata(null),
        );

        foreach ([
            'salutation',
            'title',
            'first_name',
            'last_name',
            'organization',
            'sector',
            'message',
        ] as $field) {
            self::assertNull($payload[$field], $field);
        }
    }

    private static function metadata(?string $consentTextVersion): RegistrationMetadata
    {
        return new RegistrationMetadata(
            '80c8b525-7a88-4b52-87b0-a67f522bb38d',
            1_785_427_200,
            41,
            9876,
            'https://www.gematik.de/mitmachen/versorgungs-netzwerk',
            'mitmachen-form-v4',
            'privacy-v7',
            $consentTextVersion,
        );
    }
}
