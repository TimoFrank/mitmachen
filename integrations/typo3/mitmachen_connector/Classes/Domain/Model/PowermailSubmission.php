<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Model;

final readonly class PowermailSubmission
{
    /**
     * @param array<string, mixed> $answersByMarker
     */
    public function __construct(
        public int $mailUid,
        public int $formUid,
        public array $answersByMarker,
    ) {
    }
}
