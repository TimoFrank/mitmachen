<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Domain\Model;

final class DeliveryRunResult
{
    public int $claimed = 0;
    public int $delivered = 0;
    public int $retried = 0;
    public int $failed = 0;

    /**
     * @return array{claimed: int, delivered: int, retried: int, failed: int}
     */
    public function toArray(): array
    {
        return [
            'claimed' => $this->claimed,
            'delivered' => $this->delivered,
            'retried' => $this->retried,
            'failed' => $this->failed,
        ];
    }
}
