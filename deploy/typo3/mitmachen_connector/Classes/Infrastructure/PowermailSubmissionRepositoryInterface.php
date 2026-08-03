<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Infrastructure;

use Gematik\MitmachenConnector\Domain\Model\PowermailSubmission;

interface PowermailSubmissionRepositoryInterface
{
    public function find(int $mailUid): ?PowermailSubmission;
}
