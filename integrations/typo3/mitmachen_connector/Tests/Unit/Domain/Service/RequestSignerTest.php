<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Service\RequestSigner;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class RequestSignerTest extends TestCase
{
    public function testCreatesExpectedHeadersForCanonicalV1Contract(): void
    {
        $secret = '';
        for ($byte = 0; $byte < 32; $byte++) {
            $secret .= chr($byte);
        }

        $headers = (new RequestSigner())->headers(
            '{"hello":"Grüße/世界"}',
            'key-2026-07',
            1_785_436_800,
            $secret,
        );

        self::assertSame('key-2026-07', $headers['x-mitmachen-key-id']);
        self::assertSame('1785436800', $headers['x-mitmachen-timestamp']);
        self::assertSame(
            'sha256=8497e3a29d69a56dfe92f5472b8d80993ec28c132dd3ca93d9fc25a820467bc1',
            $headers['x-mitmachen-signature'],
        );
    }

    public function testRejectsSecretsShorterThanThirtyTwoBytes(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new RequestSigner())->headers('{}', 'key-1', 1_700_000_000, str_repeat('x', 31));
    }
}
