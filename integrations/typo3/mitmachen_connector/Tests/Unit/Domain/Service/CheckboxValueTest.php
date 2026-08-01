<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Domain\Service;

use Gematik\MitmachenConnector\Domain\Service\CheckboxValue;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CheckboxValueTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, bool}>
     */
    public static function values(): iterable
    {
        yield 'missing' => [null, false];
        yield 'empty Powermail array' => [[], false];
        yield 'numeric false' => ['0', false];
        yield 'German no' => ['Nein', false];
        yield 'German off' => [' AUS ', false];
        yield 'German not selected' => ['nicht ausgewählt', false];
        yield 'English false' => ['false', false];
        yield 'selected marker value' => ['Ja, ich möchte zusätzlich …', true];
        yield 'selected Powermail array' => [['Ja, ich möchte zusätzlich …'], true];
    }

    #[DataProvider('values')]
    public function testNormalizesCheckboxValues(mixed $value, bool $expected): void
    {
        self::assertSame($expected, CheckboxValue::isSelected($value));
    }
}
