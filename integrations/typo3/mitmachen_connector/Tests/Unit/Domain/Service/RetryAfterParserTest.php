<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Service\RetryAfterParser;
use PHPUnit\Framework\TestCase;

final class RetryAfterParserTest extends TestCase
{
    public function testParsesSecondsAndHttpDate(): void
    {
        $parser = new RetryAfterParser();

        self::assertSame(120, $parser->parse('120', 1_700_000_000));
        self::assertSame(
            60,
            $parser->parse(gmdate('D, d M Y H:i:s \G\M\T', 1_700_000_060), 1_700_000_000),
        );
        self::assertNull($parser->parse('not-a-date', 1_700_000_000));
    }
}
