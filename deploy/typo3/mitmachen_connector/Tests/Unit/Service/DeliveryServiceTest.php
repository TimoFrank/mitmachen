<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Service;

use Gematik\MitmachenConnector\Configuration\DeliveryConfiguration;
use Gematik\MitmachenConnector\Domain\Model\OutboxEntry;
use Gematik\MitmachenConnector\Domain\Model\PowermailSubmission;
use Gematik\MitmachenConnector\Domain\Service\BackoffPolicy;
use Gematik\MitmachenConnector\Domain\Service\CanonicalJsonEncoder;
use Gematik\MitmachenConnector\Domain\Service\PowermailRegistrationMapper;
use Gematik\MitmachenConnector\Domain\Service\RequestSigner;
use Gematik\MitmachenConnector\Domain\Service\ResponseClassifier;
use Gematik\MitmachenConnector\Domain\Service\RetryAfterParser;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use Gematik\MitmachenConnector\Infrastructure\OutboxRepositoryInterface;
use Gematik\MitmachenConnector\Infrastructure\PowermailSubmissionRepositoryInterface;
use Gematik\MitmachenConnector\Service\DeliveryService;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Http\RequestFactory;

final class DeliveryServiceTest extends TestCase
{
    public function testSuccessfulRequestIsSignedAndMarkedDelivered(): void
    {
        $entry = self::entry();
        $outbox = $this->createMock(OutboxRepositoryInterface::class);
        $outbox
            ->expects(self::once())
            ->method('claimDue')
            ->with(1, self::isType('int'), 900)
            ->willReturn([$entry]);
        $outbox
            ->expects(self::once())
            ->method('markDelivered')
            ->with($entry, 202, self::isType('int'));
        $outbox->expects(self::never())->method('markPermanentFailure');
        $outbox->expects(self::never())->method('scheduleRetry');

        $submissions = $this->createMock(PowermailSubmissionRepositoryInterface::class);
        $submissions
            ->expects(self::once())
            ->method('find')
            ->with(123)
            ->willReturn(self::submission());

        $requests = $this->createMock(RequestFactory::class);
        $requests
            ->expects(self::once())
            ->method('request')
            ->willReturnCallback(static function (string $uri, string $method, array $options): Response {
                self::assertSame(self::configuration()->endpoint, $uri);
                self::assertSame('POST', $method);
                self::assertSame('key-2026-07', $options['headers']['x-mitmachen-key-id']);
                self::assertMatchesRegularExpression('/^sha256=[a-f0-9]{64}$/D', $options['headers']['x-mitmachen-signature']);
                self::assertMatchesRegularExpression('/^[0-9a-f-]{36}$/D', $options['headers']['x-request-id']);
                self::assertSame('application/json', $options['headers']['content-type']);
                self::assertFalse($options['allow_redirects']);
                self::assertFalse($options['http_errors']);
                self::assertStringContainsString('"email":"person@example.org"', $options['body']);

                return new Response(202);
            });

        $result = self::service($outbox, $submissions, $requests)->deliverDue(
            self::configuration(),
            str_repeat('s', 32),
            1,
        );

        self::assertSame(
            ['claimed' => 1, 'delivered' => 1, 'retried' => 0, 'failed' => 0],
            $result->toArray(),
        );
    }

    public function testRateLimitSchedulesRetryFromRetryAfterHeader(): void
    {
        $entry = self::entry(attemptCount: 2);
        $before = time();
        $outbox = $this->createMock(OutboxRepositoryInterface::class);
        $outbox->method('claimDue')->willReturn([$entry]);
        $outbox
            ->expects(self::once())
            ->method('scheduleRetry')
            ->willReturnCallback(static function (
                OutboxEntry $actualEntry,
                string $errorCode,
                int $httpStatus,
                int $nextAttemptAt,
                int $now,
            ) use ($entry, $before): void {
                self::assertSame($entry, $actualEntry);
                self::assertSame('http_429', $errorCode);
                self::assertSame(429, $httpStatus);
                self::assertSame(600, $nextAttemptAt - $now);
                self::assertGreaterThanOrEqual($before, $now);
                self::assertLessThanOrEqual(time(), $now);
            });
        $outbox->expects(self::never())->method('markDelivered');
        $outbox->expects(self::never())->method('markPermanentFailure');

        $submissions = $this->createMock(PowermailSubmissionRepositoryInterface::class);
        $submissions->method('find')->willReturn(self::submission());
        $requests = $this->createMock(RequestFactory::class);
        $requests->method('request')->willReturn(new Response(429, ['Retry-After' => '600']));

        $result = self::service($outbox, $submissions, $requests)->deliverDue(
            self::configuration(),
            str_repeat('s', 32),
            1,
        );

        self::assertSame(
            ['claimed' => 1, 'delivered' => 0, 'retried' => 1, 'failed' => 0],
            $result->toArray(),
        );
    }

    public function testMissingSourceRecordFailsPermanentlyWithoutHttpRequest(): void
    {
        $entry = self::entry();
        $outbox = $this->createMock(OutboxRepositoryInterface::class);
        $outbox->method('claimDue')->willReturn([$entry]);
        $outbox
            ->expects(self::once())
            ->method('markPermanentFailure')
            ->with($entry, 'source_record_unavailable', 0, self::isType('int'));
        $outbox->expects(self::never())->method('markDelivered');
        $outbox->expects(self::never())->method('scheduleRetry');

        $submissions = $this->createMock(PowermailSubmissionRepositoryInterface::class);
        $submissions->method('find')->willReturn(null);
        $requests = $this->createMock(RequestFactory::class);
        $requests->expects(self::never())->method('request');

        $result = self::service($outbox, $submissions, $requests)->deliverDue(
            self::configuration(),
            str_repeat('s', 32),
            1,
        );

        self::assertSame(
            ['claimed' => 1, 'delivered' => 0, 'retried' => 0, 'failed' => 1],
            $result->toArray(),
        );
    }

    private static function service(
        OutboxRepositoryInterface $outbox,
        PowermailSubmissionRepositoryInterface $submissions,
        RequestFactory $requests,
    ): DeliveryService {
        return new DeliveryService(
            $outbox,
            $submissions,
            new PowermailRegistrationMapper(),
            new CanonicalJsonEncoder(),
            new RequestSigner(),
            new UuidGenerator(),
            new BackoffPolicy(),
            new RetryAfterParser(),
            new ResponseClassifier(),
            $requests,
        );
    }

    private static function configuration(): DeliveryConfiguration
    {
        return new DeliveryConfiguration(
            'https://crm.example.org/api/connectors/typo3/mitmachen-registrations',
            'key-2026-07',
            'MITMACHEN_SECRET',
            25,
            10,
            900,
        );
    }

    private static function entry(int $attemptCount = 0): OutboxEntry
    {
        return new OutboxEntry(
            1,
            '80c8b525-7a88-4b52-87b0-a67f522bb38d',
            123,
            41,
            1_785_427_200,
            'https://www.gematik.de/mitmachen/versorgungs-netzwerk',
            'powermail-41-v7',
            'privacy-v4',
            'consent-v3',
            $attemptCount,
            'f05f8092-0792-4bf4-b1a1-b04c0eed7951',
        );
    }

    private static function submission(): PowermailSubmission
    {
        return new PowermailSubmission(123, 41, [
            'ihree_mail_adresse_01' => 'person@example.org',
            'vorname_01' => 'Ada',
            PowermailRegistrationMapper::CONSENT_MARKER => ['yes'],
        ]);
    }
}
