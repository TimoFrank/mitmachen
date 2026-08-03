<?php

declare(strict_types=1);

namespace Gematik\MitmachenConnector\Tests\Unit\Configuration;

use Gematik\MitmachenConnector\Configuration\ConnectorConfigurationProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

final class ConnectorConfigurationProviderTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, bool}>
     */
    public static function activationValues(): iterable
    {
        yield 'default absent' => [[], false];
        yield 'string zero' => [['enabled' => '0'], false];
        yield 'integer zero' => [['enabled' => 0], false];
        yield 'boolean false' => [['enabled' => false], false];
        yield 'invalid truthy string' => [['enabled' => 'sometimes'], false];
        yield 'string one' => [['enabled' => '1'], true];
        yield 'boolean true' => [['enabled' => true], true];
    }

    #[DataProvider('activationValues')]
    public function testActivationIsExplicitAndFailClosed(mixed $configuration, bool $expected): void
    {
        $extensionConfiguration = $this->createMock(ExtensionConfiguration::class);
        $extensionConfiguration
            ->expects(self::once())
            ->method('get')
            ->with('mitmachen_connector')
            ->willReturn($configuration);

        $provider = new ConnectorConfigurationProvider($extensionConfiguration);

        self::assertSame($expected, $provider->isEnabled());
    }

    public function testMissingExtensionConfigurationIsDisabled(): void
    {
        $extensionConfiguration = $this->createMock(ExtensionConfiguration::class);
        $extensionConfiguration
            ->method('get')
            ->willThrowException(new RuntimeException('not configured'));

        $provider = new ConnectorConfigurationProvider($extensionConfiguration);

        self::assertFalse($provider->isEnabled());
    }
}
