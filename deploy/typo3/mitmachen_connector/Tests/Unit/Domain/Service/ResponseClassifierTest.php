<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Service\ResponseClassifier;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ResponseClassifierTest extends TestCase
{
    /**
     * @return iterable<string, array{int, string}>
     */
    public static function statusProvider(): iterable
    {
        yield 'success' => [204, ResponseClassifier::DELIVERED];
        yield 'client error' => [400, ResponseClassifier::PERMANENT_FAILURE];
        yield 'unauthorized' => [401, ResponseClassifier::PERMANENT_FAILURE];
        yield 'rate limited' => [429, ResponseClassifier::RETRY];
        yield 'server error' => [503, ResponseClassifier::RETRY];
        yield 'redirect is not followed' => [307, ResponseClassifier::PERMANENT_FAILURE];
    }

    #[DataProvider('statusProvider')]
    public function testClassifiesHttpOutcomes(int $status, string $expected): void
    {
        self::assertSame($expected, (new ResponseClassifier())->classify($status));
    }
}
