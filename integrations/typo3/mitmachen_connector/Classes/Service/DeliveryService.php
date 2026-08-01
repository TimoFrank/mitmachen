<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Service;

use Gematik\MitmachenConnector\Configuration\DeliveryConfiguration;
use Gematik\MitmachenConnector\Domain\Model\DeliveryRunResult;
use Gematik\MitmachenConnector\Domain\Model\OutboxEntry;
use Gematik\MitmachenConnector\Domain\Service\BackoffPolicy;
use Gematik\MitmachenConnector\Domain\Service\CanonicalJsonEncoder;
use Gematik\MitmachenConnector\Domain\Service\PowermailRegistrationMapper;
use Gematik\MitmachenConnector\Domain\Service\RequestSigner;
use Gematik\MitmachenConnector\Domain\Service\ResponseClassifier;
use Gematik\MitmachenConnector\Domain\Service\RetryAfterParser;
use Gematik\MitmachenConnector\Domain\Service\UuidGenerator;
use Gematik\MitmachenConnector\Infrastructure\OutboxRepositoryInterface;
use Gematik\MitmachenConnector\Infrastructure\PowermailSubmissionRepositoryInterface;
use InvalidArgumentException;
use JsonException;
use Throwable;
use TYPO3\CMS\Core\Http\RequestFactory;

class DeliveryService
{
    public function __construct(
        private readonly OutboxRepositoryInterface $outboxRepository,
        private readonly PowermailSubmissionRepositoryInterface $submissionRepository,
        private readonly PowermailRegistrationMapper $mapper,
        private readonly CanonicalJsonEncoder $jsonEncoder,
        private readonly RequestSigner $requestSigner,
        private readonly UuidGenerator $uuidGenerator,
        private readonly BackoffPolicy $backoffPolicy,
        private readonly RetryAfterParser $retryAfterParser,
        private readonly ResponseClassifier $responseClassifier,
        private readonly RequestFactory $requestFactory,
    ) {
    }

    public function deliverDue(
        DeliveryConfiguration $configuration,
        string $binarySecret,
        int $limit,
    ): DeliveryRunResult {
        $result = new DeliveryRunResult();

        // Claim immediately before delivery. This prevents entries at the end
        // of a larger batch from aging into the stale-lock window while earlier
        // HTTP requests are still being processed.
        for ($processed = 0; $processed < $limit; $processed++) {
            $entries = $this->outboxRepository->claimDue(
                1,
                time(),
                $configuration->lockTimeoutSeconds,
            );
            if ($entries === []) {
                break;
            }
            $result->claimed++;
            $this->deliverEntry($entries[0], $configuration, $binarySecret, $result);
        }

        return $result;
    }

    private function deliverEntry(
        OutboxEntry $entry,
        DeliveryConfiguration $configuration,
        string $binarySecret,
        DeliveryRunResult $result,
    ): void {
        $submission = $this->submissionRepository->find($entry->powermailMailUid);
        if ($submission === null) {
            $this->outboxRepository->markPermanentFailure(
                $entry,
                'source_record_unavailable',
                0,
                time(),
            );
            $result->failed++;

            return;
        }
        if (
            $submission->mailUid !== $entry->powermailMailUid
            || $submission->formUid !== PowermailRegistrationMapper::SOURCE_FORM_UID
            || $entry->sourceFormUid !== PowermailRegistrationMapper::SOURCE_FORM_UID
        ) {
            $this->outboxRepository->markPermanentFailure(
                $entry,
                'source_form_mismatch',
                0,
                time(),
            );
            $result->failed++;

            return;
        }

        try {
            $payload = $this->mapper->map(
                $submission->answersByMarker,
                $entry->toRegistrationMetadata(),
            );
            $rawBody = $this->jsonEncoder->encode($payload);
        } catch (InvalidArgumentException | JsonException) {
            $this->outboxRepository->markPermanentFailure(
                $entry,
                'payload_invalid',
                0,
                time(),
            );
            $result->failed++;

            return;
        }

        $requestTime = time();
        $headers = $this->requestSigner->headers(
            $rawBody,
            $configuration->keyId,
            $requestTime,
            $binarySecret,
        );
        $headers['x-request-id'] = $this->uuidGenerator->generateV4();
        $headers['content-type'] = 'application/json';
        $headers['accept'] = 'application/json';

        try {
            $response = $this->requestFactory->request(
                $configuration->endpoint,
                'POST',
                [
                    'headers' => $headers,
                    'body' => $rawBody,
                    'timeout' => $configuration->requestTimeoutSeconds,
                    'connect_timeout' => min(5, $configuration->requestTimeoutSeconds),
                    'allow_redirects' => false,
                    'http_errors' => false,
                ],
            );
        } catch (Throwable) {
            $this->retry(
                $entry,
                'network_error',
                0,
                null,
                $result,
            );

            return;
        }

        $httpStatus = $response->getStatusCode();
        $disposition = $this->responseClassifier->classify($httpStatus);
        if ($disposition === ResponseClassifier::DELIVERED) {
            $this->outboxRepository->markDelivered($entry, $httpStatus, time());
            $result->delivered++;

            return;
        }
        if ($disposition === ResponseClassifier::RETRY) {
            $retryAfter = $httpStatus === 429
                ? $this->retryAfterParser->parse($response->getHeaderLine('Retry-After'), time())
                : null;
            $this->retry(
                $entry,
                $httpStatus === 429 ? 'http_429' : 'http_5xx',
                $httpStatus,
                $retryAfter,
                $result,
            );

            return;
        }

        $errorCode = $httpStatus >= 400 && $httpStatus <= 499
            ? 'http_4xx'
            : 'http_unexpected';
        $this->outboxRepository->markPermanentFailure(
            $entry,
            $errorCode,
            $httpStatus,
            time(),
        );
        $result->failed++;
    }

    private function retry(
        OutboxEntry $entry,
        string $errorCode,
        int $httpStatus,
        ?int $retryAfterSeconds,
        DeliveryRunResult $result,
    ): void {
        $now = time();
        $delay = $this->backoffPolicy->delaySeconds(
            $entry->attemptCount + 1,
            $retryAfterSeconds,
        );
        $this->outboxRepository->scheduleRetry(
            $entry,
            $errorCode,
            $httpStatus,
            $now + $delay,
            $now,
        );
        $result->retried++;
    }
}
