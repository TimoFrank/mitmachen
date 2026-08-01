<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Model;

final readonly class OutboxEntry
{
    public function __construct(
        public int $uid,
        public string $submissionId,
        public int $powermailMailUid,
        public int $sourceFormUid,
        public int $submittedAt,
        public string $sourceUrl,
        public string $formVersion,
        public string $privacyNoticeVersion,
        public ?string $consentTextVersion,
        public int $attemptCount,
        public string $lockToken,
    ) {
    }

    public function toRegistrationMetadata(): RegistrationMetadata
    {
        return new RegistrationMetadata(
            $this->submissionId,
            $this->submittedAt,
            $this->sourceFormUid,
            $this->powermailMailUid,
            $this->sourceUrl,
            $this->formVersion,
            $this->privacyNoticeVersion,
            $this->consentTextVersion,
        );
    }
}
