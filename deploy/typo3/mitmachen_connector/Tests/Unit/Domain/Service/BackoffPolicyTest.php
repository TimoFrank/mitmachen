<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Service\BackoffPolicy;
use PHPUnit\Framework\TestCase;

final class BackoffPolicyTest extends TestCase
{
    public function testUsesCappedExponentialBackoff(): void
    {
        $policy = new BackoffPolicy();

        self::assertSame(60, $policy->delaySeconds(1));
        self::assertSame(120, $policy->delaySeconds(2));
        self::assertSame(1_920, $policy->delaySeconds(6));
        self::assertSame(21_600, $policy->delaySeconds(10));
        self::assertSame(21_600, $policy->delaySeconds(50));
    }

    public function testHonorsRetryAfterWhenItIsLongerAndCapsItAtOneDay(): void
    {
        $policy = new BackoffPolicy();

        self::assertSame(600, $policy->delaySeconds(1, 600));
        self::assertSame(120, $policy->delaySeconds(2, 30));
        self::assertSame(86_400, $policy->delaySeconds(1, 999_999));
    }
}
